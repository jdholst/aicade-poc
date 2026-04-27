import { NextResponse } from "next/server";
import ts from "typescript";

import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_STARTER_PROMPT,
  aiSpecSchema,
  createGeneratedGameSystemPrompt,
  generatedGamePackFromOpenAiSchema,
  generatedGamePackJsonSchema,
  generatedGamePackSchema,
  type AiSpec,
  type GeneratedGamePack,
  type GeneratedGamePackFromOpenAI,
  type JsonValue,
} from "@/lib/starter-project";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const GENERATED_GAME_TOOL = "return_generated_game_pack";
const OPENAI_REQUEST_TIMEOUT_MS = 55_000;
const MAX_EDITABLE_SPEC_DEPTH = 8;
const MAX_EDITABLE_SPEC_ARRAY_ITEMS = 200;
const MAX_EDITABLE_SPEC_OBJECT_KEYS = 80;
const MAX_EDITABLE_SPEC_STRING_LENGTH = 1200;

const jsDataMemberNames = new Set([
  "at",
  "concat",
  "entries",
  "every",
  "filter",
  "find",
  "findIndex",
  "flat",
  "flatMap",
  "forEach",
  "includes",
  "indexOf",
  "join",
  "keys",
  "length",
  "map",
  "pop",
  "push",
  "reduce",
  "reverse",
  "slice",
  "some",
  "sort",
  "splice",
  "toFixed",
  "toString",
  "trim",
  "values",
]);

type ResponsesFunctionCall = {
  type: "function_call";
  name: string;
  arguments: string;
};

type ResponseOutputItem = {
  type: string;
  name?: string;
  arguments?: string;
};

type OpenAIResponsePayload = {
  error?: {
    message?: string;
  };
  output?: ResponseOutputItem[];
};

type StarterProjectRequestBody = {
  enteredPrompt?: unknown;
};

const forbiddenSourcePatterns = [
  /\bimport\b/i,
  /\bexport\b/i,
  /\bfetch\b/i,
  /\bXMLHttpRequest\b/i,
  /\bWebSocket\b/i,
  /\blocalStorage\b/i,
  /\bsessionStorage\b/i,
  /\bindexedDB\b/i,
  /\b(?:globalThis|self)\s*\.\s*parent\b/i,
  /\b(?:globalThis|self)\s*\.\s*top\b/i,
  /\b(?:globalThis|self)\s*\.\s*opener\b/i,
  /\bparent\s*\./i,
  /\btop\s*\./i,
  /\bopener\s*\./i,
  /\beval\b/i,
  /\bnew\s+Function\b/i,
  /\bFunction\s*\(/,
  /\bsetTimeout\b/i,
  /\bsetInterval\b/i,
  /\bdocument\b/i,
  /\bwindow\b/i,
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Generated game creation failed for an unknown reason.";
}

function normalizeUserPrompt(prompt: unknown) {
  if (typeof prompt !== "string") {
    return DEFAULT_STARTER_PROMPT;
  }

  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return DEFAULT_STARTER_PROMPT;
  }

  return normalized.slice(0, 320);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertSafeJsonValue(
  value: unknown,
  path = "editableSpec",
  depth = 0
): asserts value is JsonValue {
  if (depth > MAX_EDITABLE_SPEC_DEPTH) {
    throw new Error(`${path} is too deeply nested.`);
  }

  if (value === null || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number.`);
    }
    return;
  }

  if (typeof value === "string") {
    if (value.length > MAX_EDITABLE_SPEC_STRING_LENGTH) {
      throw new Error(`${path} contains an oversized string.`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_EDITABLE_SPEC_ARRAY_ITEMS) {
      throw new Error(`${path} contains too many array items.`);
    }

    value.forEach((item, index) =>
      assertSafeJsonValue(item, `${path}[${index}]`, depth + 1)
    );
    return;
  }

  if (!isPlainObject(value)) {
    throw new Error(`${path} contains a non-JSON object.`);
  }

  const entries = Object.entries(value);
  if (entries.length > MAX_EDITABLE_SPEC_OBJECT_KEYS) {
    throw new Error(`${path} contains too many object keys.`);
  }

  for (const [key, item] of entries) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error(`${path} contains an unsafe object key.`);
    }

    if (key.length > 80) {
      throw new Error(`${path} contains an oversized object key.`);
    }

    assertSafeJsonValue(item, `${path}.${key}`, depth + 1);
  }
}

function extractFirstObjectLiteralText(source: string) {
  const startIndex = source.indexOf("{");

  if (startIndex < 0) {
    return undefined;
  }

  let depth = 0;
  let quote: '"' | "'" | "`" | null = null;
  let isEscaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (character === "\\") {
        isEscaped = true;
        continue;
      }

      if (character === quote) {
        quote = null;
      }

      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

function getEditableSpecJsonCandidates(specJson: string) {
  const trimmedSpecJson = specJson.trim();
  const candidates = [trimmedSpecJson];
  const fencedJsonMatch = trimmedSpecJson.match(
    /^```(?:json|javascript|js|ts)?\s*([\s\S]*?)\s*```$/i
  );

  if (fencedJsonMatch?.[1]) {
    candidates.push(fencedJsonMatch[1].trim());
  }

  const extractedObject = extractFirstObjectLiteralText(trimmedSpecJson);
  if (extractedObject) {
    candidates.push(extractedObject);
  }

  return [...new Set(candidates.filter(Boolean))];
}

function getObjectLiteralPropertyName(name: ts.PropertyName) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }

  if (ts.isNumericLiteral(name)) {
    return name.text;
  }

  return undefined;
}

function parseJsonLikeExpression(expression: ts.Expression): unknown {
  if (ts.isParenthesizedExpression(expression)) {
    return parseJsonLikeExpression(expression.expression);
  }

  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }

  if (ts.isNumericLiteral(expression)) {
    return Number(expression.text);
  }

  if (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(expression.operand)
  ) {
    return -Number(expression.operand.text);
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (expression.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.map((element) => {
      if (ts.isSpreadElement(element)) {
        throw new Error("Spread elements are not valid JSON.");
      }

      return parseJsonLikeExpression(element);
    });
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const output: Record<string, unknown> = {};

    for (const property of expression.properties) {
      if (!ts.isPropertyAssignment(property)) {
        throw new Error("Only property assignments are valid JSON.");
      }

      const propertyName = getObjectLiteralPropertyName(property.name);
      if (propertyName === undefined) {
        throw new Error("Computed property names are not valid JSON.");
      }

      output[propertyName] = parseJsonLikeExpression(property.initializer);
    }

    return output;
  }

  throw new Error("Unsupported JSON-like expression.");
}

function parseJsonLikeObjectLiteral(source: string): unknown {
  const sourceFile = ts.createSourceFile(
    "editable-spec.ts",
    `const editableSpec = ${source};`,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS
  );
  const [statement] = sourceFile.statements;

  if (!statement || !ts.isVariableStatement(statement)) {
    throw new Error("Generated editableSpecJson was not an object literal.");
  }

  const [declaration] = statement.declarationList.declarations;
  if (!declaration?.initializer) {
    throw new Error("Generated editableSpecJson was not an object literal.");
  }

  return parseJsonLikeExpression(declaration.initializer);
}

function parseEditableSpecJson(specJson: string): JsonValue {
  let parsedSpec: unknown;

  for (const candidate of getEditableSpecJsonCandidates(specJson)) {
    try {
      parsedSpec = JSON.parse(candidate);

      if (typeof parsedSpec === "string") {
        parsedSpec = JSON.parse(parsedSpec);
      }
      break;
    } catch {
      try {
        parsedSpec = parseJsonLikeObjectLiteral(candidate);
        break;
      } catch {
        parsedSpec = undefined;
      }
    }
  }

  if (parsedSpec === undefined) {
    throw new Error("Generated editableSpecJson was not valid JSON.");
  }

  if (!isPlainObject(parsedSpec)) {
    throw new Error("Generated editableSpecJson must describe one JSON object.");
  }

  assertSafeJsonValue(parsedSpec);
  return parsedSpec;
}

function parseEditableAiSpec(spec: JsonValue): AiSpec {
  if (!isPlainObject(spec)) {
    throw new Error("Generated editableSpecJson must be a JSON object.");
  }

  const parsedAiSpec = aiSpecSchema.safeParse(spec.ai);

  if (!parsedAiSpec.success) {
    const [firstIssue] = parsedAiSpec.error.issues;
    const issuePath = firstIssue?.path.length
      ? `.${firstIssue.path.join(".")}`
      : "";
    const issueMessage = firstIssue?.message ?? "Invalid AI spec.";

    throw new Error(
      `Generated editableSpecJson.ai${issuePath} is invalid: ${issueMessage}`
    );
  }

  return parsedAiSpec.data;
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.entries(value)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(item)}`
      )
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
}

function assertGeneratedAiSpec(manifestAi: AiSpec, editableSpec: JsonValue) {
  const editableAi = parseEditableAiSpec(editableSpec);
  const manifestAgentIds = new Set(manifestAi.agents.map((agent) => agent.id));
  const editableAgentIds = new Set(editableAi.agents.map((agent) => agent.id));

  for (const manifestAgent of manifestAi.agents) {
    if (!editableAgentIds.has(manifestAgent.id)) {
      throw new Error(
        `Generated editableSpecJson.ai is missing manifest AI agent ${manifestAgent.id}.`
      );
    }
  }

  for (const editableAgent of editableAi.agents) {
    if (!manifestAgentIds.has(editableAgent.id)) {
      throw new Error(
        `Generated editableSpecJson.ai contains extra AI agent ${editableAgent.id} that is not listed in manifest.ai.`
      );
    }
  }

  if (stableJsonStringify(manifestAi) !== stableJsonStringify(editableAi)) {
    throw new Error(
      "Generated editableSpecJson.ai must match manifest.ai so the editor and runtime share one AI spec."
    );
  }
}

function normalizeEditableAiSpec(
  editableSpec: JsonValue,
  manifestAi: AiSpec
): JsonValue {
  if (!isPlainObject(editableSpec)) {
    throw new Error("Generated editableSpecJson must be a JSON object.");
  }

  const normalizedSpec = {
    ...editableSpec,
    ai: JSON.parse(JSON.stringify(manifestAi)) as JsonValue,
  };

  assertSafeJsonValue(normalizedSpec);
  return normalizedSpec;
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let currentExpression = expression;

  while (
    ts.isParenthesizedExpression(currentExpression) ||
    ts.isNonNullExpression(currentExpression) ||
    ts.isAsExpression(currentExpression) ||
    ts.isTypeAssertionExpression(currentExpression) ||
    ts.isSatisfiesExpression(currentExpression)
  ) {
    currentExpression = currentExpression.expression;
  }

  return currentExpression;
}

function getAccessedPropertyName(expression: ts.Expression) {
  const unwrappedExpression = unwrapExpression(expression);

  if (ts.isPropertyAccessExpression(unwrappedExpression)) {
    return unwrappedExpression.name.text;
  }

  if (
    ts.isElementAccessExpression(unwrappedExpression) &&
    unwrappedExpression.argumentExpression &&
    ts.isStringLiteralLike(unwrappedExpression.argumentExpression)
  ) {
    return unwrappedExpression.argumentExpression.text;
  }

  return undefined;
}

function getAccessTargetExpression(expression: ts.Expression) {
  const unwrappedExpression = unwrapExpression(expression);

  if (
    ts.isPropertyAccessExpression(unwrappedExpression) ||
    ts.isElementAccessExpression(unwrappedExpression)
  ) {
    return unwrappedExpression.expression;
  }

  return undefined;
}

function isHostSpecAccess(expression: ts.Expression) {
  const unwrappedExpression = unwrapExpression(expression);

  if (ts.isPropertyAccessExpression(unwrappedExpression)) {
    const targetExpression = unwrapExpression(unwrappedExpression.expression);

    return (
      unwrappedExpression.name.text === "spec" &&
      ts.isIdentifier(targetExpression) &&
      targetExpression.text === "host"
    );
  }

  if (
    ts.isElementAccessExpression(unwrappedExpression) &&
    ts.isStringLiteralLike(unwrappedExpression.argumentExpression)
  ) {
    const targetExpression = unwrapExpression(unwrappedExpression.expression);

    return (
      unwrappedExpression.argumentExpression.text === "spec" &&
      ts.isIdentifier(targetExpression) &&
      targetExpression.text === "host"
    );
  }

  return false;
}

function expressionContainsSpecRoot(
  expression: ts.Expression,
  specAliases: Set<string>
): boolean {
  const unwrappedExpression = unwrapExpression(expression);

  if (ts.isIdentifier(unwrappedExpression)) {
    return specAliases.has(unwrappedExpression.text);
  }

  if (isHostSpecAccess(unwrappedExpression)) {
    return true;
  }

  if (
    ts.isPropertyAccessExpression(unwrappedExpression) ||
    ts.isElementAccessExpression(unwrappedExpression)
  ) {
    return expressionContainsSpecRoot(unwrappedExpression.expression, specAliases);
  }

  if (ts.isObjectLiteralExpression(unwrappedExpression)) {
    return unwrappedExpression.properties.some((property) => {
      if (ts.isSpreadAssignment(property)) {
        return expressionContainsSpecRoot(property.expression, specAliases);
      }

      if (ts.isPropertyAssignment(property)) {
        return expressionContainsSpecRoot(property.initializer, specAliases);
      }

      return false;
    });
  }

  let containsSpecRoot = false;
  ts.forEachChild(unwrappedExpression, (child) => {
    if (containsSpecRoot || !ts.isExpression(child)) {
      return;
    }

    containsSpecRoot = expressionContainsSpecRoot(child, specAliases);
  });

  return containsSpecRoot;
}

function expressionReadsAiFromSpec(
  expression: ts.Expression,
  specAliases: Set<string>
): boolean {
  const propertyName = getAccessedPropertyName(expression);
  const targetExpression = getAccessTargetExpression(expression);

  if (
    propertyName === "ai" &&
    targetExpression &&
    expressionContainsSpecRoot(targetExpression, specAliases)
  ) {
    return true;
  }

  let readsAi = false;
  ts.forEachChild(expression, (child) => {
    if (readsAi || !ts.isExpression(child)) {
      return;
    }

    readsAi = expressionReadsAiFromSpec(child, specAliases);
  });

  return readsAi;
}

function bindingPatternReadsAiFromSpec(
  name: ts.BindingName,
  initializer: ts.Expression | undefined,
  specAliases: Set<string>
) {
  if (!initializer || !ts.isObjectBindingPattern(name)) {
    return false;
  }

  if (!expressionContainsSpecRoot(initializer, specAliases)) {
    return false;
  }

  return name.elements.some(
    (element) =>
      !element.propertyName &&
      ts.isIdentifier(element.name) &&
      element.name.text === "ai"
  );
}

function bindingPatternDeclaresSpecAlias(
  name: ts.BindingName,
  initializer: ts.Expression | undefined,
  specAliases: Set<string>
) {
  if (!initializer || !ts.isObjectBindingPattern(name)) {
    return [];
  }

  const unwrappedInitializer = unwrapExpression(initializer);
  if (!ts.isIdentifier(unwrappedInitializer) || unwrappedInitializer.text !== "host") {
    return [];
  }

  const aliases: string[] = [];

  for (const element of name.elements) {
    const propertyName = element.propertyName ?? element.name;

    if (
      ts.isIdentifier(propertyName) &&
      propertyName.text === "spec" &&
      ts.isIdentifier(element.name)
    ) {
      aliases.push(element.name.text);
      specAliases.add(element.name.text);
    }
  }

  return aliases;
}

function assertGeneratedAiUsage(...sources: string[]) {
  if (
    sources.some((source) =>
      /\b(?:host\.spec|spec)\s*(?:\?\.|\.)\s*ai\b/.test(source)
    )
  ) {
    return;
  }

  for (const source of sources) {
    const sourceFile = ts.createSourceFile(
      "generated-module.ts",
      source,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS
    );
    const specAliases = new Set(["spec"]);
    let readsEditableAiSpec = false;

    function visit(node: ts.Node) {
      if (readsEditableAiSpec) {
        return;
      }

      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (
          ts.isIdentifier(node.name) &&
          expressionContainsSpecRoot(node.initializer, specAliases)
        ) {
          specAliases.add(node.name.text);
        }

        bindingPatternDeclaresSpecAlias(
          node.name,
          node.initializer,
          specAliases
        );

        if (
          bindingPatternReadsAiFromSpec(
            node.name,
            node.initializer,
            specAliases
          ) ||
          expressionReadsAiFromSpec(node.initializer, specAliases)
        ) {
          readsEditableAiSpec = true;
          return;
        }
      }

      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ) {
        if (
          ts.isIdentifier(node.left) &&
          expressionContainsSpecRoot(node.right, specAliases)
        ) {
          specAliases.add(node.left.text);
        }

        if (expressionReadsAiFromSpec(node.right, specAliases)) {
          readsEditableAiSpec = true;
          return;
        }
      }

      if (ts.isExpression(node) && expressionReadsAiFromSpec(node, specAliases)) {
        readsEditableAiSpec = true;
        return;
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (readsEditableAiSpec) {
      return;
    }
  }

  throw new Error(
    "Generated module must read spec.ai so AI behavior is driven by the editable AI spec."
  );
}

function trimRuntimeMemberNames(segments: string[]) {
  const trimmedSegments = [...segments];

  while (
    trimmedSegments.length > 0 &&
    jsDataMemberNames.has(trimmedSegments[trimmedSegments.length - 1])
  ) {
    trimmedSegments.pop();
  }

  return trimmedSegments;
}

function specPathExists(spec: JsonValue, pathSegments: string[]) {
  let currentValue: JsonValue | undefined = spec;

  for (const segment of pathSegments) {
    if (currentValue === null || currentValue === undefined) {
      return false;
    }

    if (Array.isArray(currentValue)) {
      if (segment === "length" || jsDataMemberNames.has(segment)) {
        return true;
      }

      if (!/^\d+$/.test(segment)) {
        return false;
      }

      currentValue = currentValue[Number(segment)];
      continue;
    }

    if (typeof currentValue !== "object") {
      return false;
    }

    if (!Object.prototype.hasOwnProperty.call(currentValue, segment)) {
      return false;
    }

    currentValue = currentValue[segment];
  }

  return true;
}

function assertGeneratedSpecReferences(source: string, spec: JsonValue) {
  const specPathPattern =
    /\b(?:host\.spec|spec)((?:\.[A-Za-z_$][\w$]*)+)/g;
  const checkedPaths = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = specPathPattern.exec(source)) !== null) {
    const rawSegments = match[1].slice(1).split(".");
    const pathSegments = trimRuntimeMemberNames(rawSegments);

    if (pathSegments.length === 0) {
      continue;
    }

    const path = pathSegments.join(".");
    if (checkedPaths.has(path)) {
      continue;
    }

    checkedPaths.add(path);

    if (!specPathExists(spec, pathSegments)) {
      throw new Error(
        `Generated module references spec.${path}, but editableSpec does not define that path.`
      );
    }
  }
}

function assertGeneratedSourceAllowed(source: string) {
  for (const pattern of forbiddenSourcePatterns) {
    if (pattern.test(source)) {
      throw new Error(
        `Generated module failed static validation: blocked token ${pattern.source}.`
      );
    }
  }

  if (!source.includes("globalThis.createGameModule")) {
    throw new Error(
      "Generated module failed static validation: missing globalThis.createGameModule assignment."
    );
  }
}

function transpileGeneratedTypeScript(source: string) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2017,
      module: ts.ModuleKind.None,
      jsx: ts.JsxEmit.Preserve,
      strict: true,
      removeComments: true,
    },
    reportDiagnostics: true,
  });

  const errors =
    result.diagnostics?.filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    ) ?? [];

  if (errors.length > 0) {
    const message = ts.flattenDiagnosticMessageText(
      errors[0].messageText,
      "\n"
    );
    throw new Error(`Generated TypeScript failed to transpile: ${message}`);
  }

  assertGeneratedSourceAllowed(result.outputText);

  return result.outputText;
}

async function requestGeneratedGamePackFromOpenAI(
  userPrompt: string,
  validationFeedback?: string
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    OPENAI_REQUEST_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL,
        reasoning: {
          effort: "medium",
        },
        parallel_tool_calls: false,
        tool_choice: {
          type: "function",
          name: GENERATED_GAME_TOOL,
        },
        tools: [
          {
            type: "function",
            name: GENERATED_GAME_TOOL,
            description:
              "Return a generated Canvas 2D game pack with TypeScript module source, manifest, AI spec, editable spec, metadata, and chat transcript.",
            parameters: generatedGamePackJsonSchema,
            strict: true,
          },
        ],
        instructions: [
          createGeneratedGameSystemPrompt(userPrompt),
          validationFeedback
            ? `Previous generation failed server validation: ${validationFeedback}. Return a fresh pack that fixes that exact validation failure.`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: userPrompt,
              },
            ],
          },
        ],
      }),
      cache: "no-store",
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        "OpenAI generation timed out while creating the game module."
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = (await response.json()) as OpenAIResponsePayload;

  if (!response.ok) {
    throw new Error(
      payload.error?.message ??
        `OpenAI request failed with status ${response.status}.`
    );
  }

  const functionCall = payload.output?.find(
    (item): item is ResponsesFunctionCall =>
      item.type === "function_call" &&
      typeof item.name === "string" &&
      item.name === GENERATED_GAME_TOOL &&
      typeof item.arguments === "string"
  );

  if (!functionCall) {
    throw new Error("OpenAI did not return a generated game pack.");
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(functionCall.arguments);
  } catch {
    throw new Error("OpenAI returned invalid JSON for the generated game pack.");
  }

  return parsedArguments;
}

function completeGeneratedGamePack(
  pack: GeneratedGamePackFromOpenAI,
  userPrompt: string
): GeneratedGamePack {
  const [firstMessage] = pack.chatTranscript;
  if (firstMessage?.role !== "user" || firstMessage.text !== userPrompt) {
    throw new Error(
      "Generated game pack did not echo the requested prompt in the first chat message."
    );
  }

  const { editableSpecJson, ...packWithoutSpecJson } = pack;
  const editableSpec = normalizeEditableAiSpec(
    parseEditableSpecJson(editableSpecJson),
    pack.manifest.ai
  );
  assertGeneratedAiSpec(pack.manifest.ai, editableSpec);

  assertGeneratedSourceAllowed(pack.moduleSourceTs);

  const moduleSourceJs = transpileGeneratedTypeScript(pack.moduleSourceTs);
  assertGeneratedAiUsage(pack.moduleSourceTs, moduleSourceJs);
  assertGeneratedSpecReferences(moduleSourceJs, editableSpec);

  const completedPack = {
    ...packWithoutSpecJson,
    editableSpec,
    moduleSourceJs,
  };
  const parsed = generatedGamePackSchema.safeParse(completedPack);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid generated pack.");
  }

  return parsed.data;
}

async function generateGamePack(userPrompt: string): Promise<GeneratedGamePack> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const validationFeedback =
        attempt > 0 && lastError instanceof Error ? lastError.message : undefined;
      const rawPack = await requestGeneratedGamePackFromOpenAI(
        userPrompt,
        validationFeedback
      );
      const parsed = generatedGamePackFromOpenAiSchema.safeParse(rawPack);

      if (!parsed.success) {
        lastError = parsed.error;
        continue;
      }

      return completeGeneratedGamePack(parsed.data, userPrompt);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    lastError instanceof Error
      ? lastError.message
      : "OpenAI returned a generated game pack that failed validation twice."
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestBody = (await request
    .json()
    .catch(() => undefined)) as StarterProjectRequestBody | undefined;
  const userPrompt = normalizeUserPrompt(requestBody?.enteredPrompt);

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Missing OPENAI_API_KEY. Add it to .env.local to enable live generated module creation.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    const generatedGamePack = await generateGamePack(userPrompt);

    return NextResponse.json(generatedGamePack, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("starter-project route failed", error);

    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
