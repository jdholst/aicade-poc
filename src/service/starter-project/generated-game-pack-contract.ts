import ts from "typescript";

import {
  MAX_EDITABLE_SPEC_ARRAY_ITEMS,
  MAX_EDITABLE_SPEC_DEPTH,
  MAX_EDITABLE_SPEC_OBJECT_KEYS,
  MAX_EDITABLE_SPEC_STRING_LENGTH,
  forbiddenSourcePatterns,
  jsDataMemberNames,
} from "@/constants";
import {
  GENERATED_GAME_FACTORY_ASSIGNMENT,
  GENERATED_GAME_FACTORY_NAME,
} from "@/service/starter-project/generated-game-contract";
import {
  generatedGamePackSchema,
  type GeneratedGamePack,
  type GeneratedGamePackFromOpenAI,
  type JsonValue,
} from "@/service/starter-project/starter-project-schema";

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

function parseEditableSpecJson(specJson: string): JsonValue {
  let parsedSpec: unknown;
  try {
    parsedSpec = JSON.parse(specJson);
  } catch {
    throw new Error("Generated editableSpecJson was not valid JSON.");
  }

  if (!isPlainObject(parsedSpec)) {
    throw new Error("Generated editableSpecJson must describe one JSON object.");
  }

  assertSafeJsonValue(parsedSpec);
  return parsedSpec;
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

  if (!source.includes(GENERATED_GAME_FACTORY_ASSIGNMENT)) {
    throw new Error(
      `Generated module failed static validation: missing ${GENERATED_GAME_FACTORY_NAME} assignment.`
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

export function completeGeneratedGamePack(
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
  const editableSpec = parseEditableSpecJson(editableSpecJson);

  assertGeneratedSourceAllowed(pack.moduleSourceTs);

  const moduleSourceJs = transpileGeneratedTypeScript(pack.moduleSourceTs);
  assertGeneratedSpecReferences(moduleSourceJs, editableSpec);

  const completedPack = {
    ...packWithoutSpecJson,
    editableSpec,
    moduleSourceJs,
  };
  const parsed = generatedGamePackSchema.safeParse(completedPack);

  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid generated pack."
    );
  }

  return parsed.data;
}

