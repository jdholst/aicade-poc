import { NextResponse } from "next/server";
import ts from "typescript";

import {
  DEFAULT_OPENAI_MODEL,
  DEFAULT_STARTER_PROMPT,
  createGeneratedGameSystemPrompt,
  generatedGamePackFromOpenAiSchema,
  generatedGamePackJsonSchema,
  generatedGamePackSchema,
  isOpenAIModelId,
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
  openAiApiKey?: unknown;
  openAiModel?: unknown;
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

function normalizeClientOpenAiApiKey(apiKey: unknown) {
  if (typeof apiKey !== "string") {
    return undefined;
  }

  const normalized = apiKey.trim();

  if (!normalized || normalized.length > 300) {
    return undefined;
  }

  return normalized;
}

function normalizeClientOpenAiModel(model: unknown) {
  if (typeof model !== "string") {
    return undefined;
  }

  const normalized = model.trim();

  if (!isOpenAIModelId(normalized)) {
    return undefined;
  }

  return normalized;
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
  openAiApiKey: string,
  openAiModel: string
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
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: openAiModel,
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
              "Return a generated Canvas 2D game pack with TypeScript module source, manifest, editable spec, metadata, and chat transcript.",
            parameters: generatedGamePackJsonSchema,
            strict: true,
          },
        ],
        instructions: createGeneratedGameSystemPrompt(userPrompt),
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
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid generated pack.");
  }

  return parsed.data;
}

async function generateGamePack(
  userPrompt: string,
  openAiApiKey: string,
  openAiModel: string
): Promise<GeneratedGamePack> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const rawPack = await requestGeneratedGamePackFromOpenAI(
        userPrompt,
        openAiApiKey,
        openAiModel
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
  const envOpenAiApiKey = normalizeClientOpenAiApiKey(
    process.env.OPENAI_API_KEY
  );
  const envOpenAiModel = process.env.OPENAI_MODEL?.trim() || undefined;
  const clientOpenAiModel = normalizeClientOpenAiModel(requestBody?.openAiModel);
  const openAiApiKey =
    envOpenAiApiKey ?? normalizeClientOpenAiApiKey(requestBody?.openAiApiKey);
  const openAiModel = envOpenAiModel ?? clientOpenAiModel ?? DEFAULT_OPENAI_MODEL;

  if (!openAiApiKey) {
    return NextResponse.json(
      {
        error:
          "Missing OpenAI API key. Enter a key before building the starter game or add OPENAI_API_KEY to .env.local.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  if (
    !envOpenAiModel &&
    typeof requestBody?.openAiModel === "string" &&
    requestBody.openAiModel.trim() &&
    !clientOpenAiModel
  ) {
    return NextResponse.json(
      {
        error: "Select a supported OpenAI model before building the starter game.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  try {
    const generatedGamePack = await generateGamePack(
      userPrompt,
      openAiApiKey,
      openAiModel
    );

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
