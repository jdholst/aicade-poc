import { z } from "zod";

export const DEFAULT_STARTER_PROMPT =
  "A simple 2D platformer where I control a character that can jump";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(320),
});

const editorMetadataItemSchema = z.object({
  label: z.string().min(1).max(48),
  value: z.string().min(1).max(140),
});

const editorMetadataPanelSchema = z.object({
  title: z.string().min(1).max(64),
  items: z.array(editorMetadataItemSchema).min(1).max(8),
});

const controlBindingSchema = z.object({
  action: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case action names."),
  label: z.string().min(1).max(64),
  keys: z.array(z.string().min(2).max(24)).min(1).max(6),
  kind: z.enum(["button", "axis", "toggle"]),
});

const manifestSchema = z.object({
  title: z.string().min(1).max(80),
  genre: z.string().min(1).max(40),
  runtime: z.literal("canvas2d"),
  editableSpecVersion: z.string().min(1).max(40),
  capabilities: z.array(z.string().min(1).max(48)).min(3).max(12),
  controls: z.array(controlBindingSchema).min(1).max(12),
});

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

const generatedGamePackSharedSchema = z
  .object({
    project: z.object({
      name: z.string().min(1).max(80),
      summary: z.string().min(1).max(240),
    }),
    chatTranscript: z.array(chatMessageSchema).min(3).max(5),
    manifest: manifestSchema,
    editorMetadata: z.object({
      panels: z.array(editorMetadataPanelSchema).min(1).max(4),
    }),
    moduleSourceTs: z.string().min(1200).max(30000),
  })
  .superRefine((data, ctx) => {
    if (!data.moduleSourceTs.includes("globalThis.createGameModule")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["moduleSourceTs"],
        message: "Generated module must assign globalThis.createGameModule.",
      });
    }
  });

export const generatedGamePackFromOpenAiSchema =
  generatedGamePackSharedSchema
    .extend({
      editableSpecJson: z.string().min(2).max(24000),
    })
    .strict();

export const generatedGamePackSchema = generatedGamePackSharedSchema
  .extend({
    editableSpec: jsonValueSchema,
    moduleSourceJs: z.string().min(800).max(36000),
  })
  .strict();

export type ControlBinding = z.infer<typeof controlBindingSchema>;
export type GeneratedGamePack = z.infer<typeof generatedGamePackSchema>;
export type GeneratedGamePackFromOpenAI = z.infer<
  typeof generatedGamePackFromOpenAiSchema
>;

export const generatedGamePackJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "project",
    "chatTranscript",
    "manifest",
    "editableSpecJson",
    "editorMetadata",
    "moduleSourceTs",
  ],
  properties: {
    project: {
      type: "object",
      additionalProperties: false,
      required: ["name", "summary"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 80 },
        summary: { type: "string", minLength: 1, maxLength: 240 },
      },
    },
    chatTranscript: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "text"],
        properties: {
          role: { type: "string", enum: ["user", "assistant"] },
          text: { type: "string", minLength: 1, maxLength: 320 },
        },
      },
    },
    manifest: {
      type: "object",
      additionalProperties: false,
      required: [
        "title",
        "genre",
        "runtime",
        "editableSpecVersion",
        "capabilities",
        "controls",
      ],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 80 },
        genre: { type: "string", minLength: 1, maxLength: 40 },
        runtime: { type: "string", enum: ["canvas2d"] },
        editableSpecVersion: {
          type: "string",
          minLength: 1,
          maxLength: 40,
        },
        capabilities: {
          type: "array",
          minItems: 3,
          maxItems: 12,
          items: { type: "string", minLength: 1, maxLength: 48 },
        },
        controls: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "label", "keys", "kind"],
            properties: {
              action: {
                type: "string",
                minLength: 1,
                maxLength: 40,
                pattern: "^[a-z][a-z0-9_]*$",
              },
              label: { type: "string", minLength: 1, maxLength: 64 },
              keys: {
                type: "array",
                minItems: 1,
                maxItems: 6,
                items: { type: "string", minLength: 2, maxLength: 24 },
              },
              kind: {
                type: "string",
                enum: ["button", "axis", "toggle"],
              },
            },
          },
        },
      },
    },
    editableSpecJson: {
      type: "string",
      minLength: 2,
      maxLength: 24000,
      description:
        "A JSON.stringify-compatible editable game spec object. It may be genre-specific but must contain only serializable JSON values.",
    },
    editorMetadata: {
      type: "object",
      additionalProperties: false,
      required: ["panels"],
      properties: {
        panels: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "items"],
            properties: {
              title: { type: "string", minLength: 1, maxLength: 64 },
              items: {
                type: "array",
                minItems: 1,
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["label", "value"],
                  properties: {
                    label: { type: "string", minLength: 1, maxLength: 48 },
                    value: { type: "string", minLength: 1, maxLength: 140 },
                  },
                },
              },
            },
          },
        },
      },
    },
    moduleSourceTs: { type: "string", minLength: 1200, maxLength: 30000 },
  },
} as const;

export function createGeneratedGameSystemPrompt(userPrompt: string) {
  return `
You are creating the first magic moment for an AI game creation product.

Return a generated game pack for this user prompt:
"${userPrompt}".

You must generate TypeScript source for a self-contained Canvas 2D game runtime.

Hard module contract:
- Do not use imports, exports, React, JSX, DOM queries, network calls, storage APIs, eval, Function, timers, parent/top/opener access, or external assets.
- The source must assign:
  globalThis.createGameModule = function createGameModule(host) { ... }
- The factory receives host = { canvas, ctx, spec }.
- It must return an object with these functions:
  start(), update(dt, input), render(ctx), resize(width, height, dpr), destroy(), getEditableSpec(), applyPatch(patch).
- The game must use host.spec as its editable game spec and source of truth.
- The game must read controls from input.actions[actionName].down and input.actions[actionName].pressed.
- The game may also inspect input.rawKeys[keyCode] when useful.
- The game must render visible primitive Canvas 2D shapes without external assets.
- The game must be immediately playable and match the user's requested genre and fantasy.
- Do not force the design into a platformer unless the user asks for a platformer.
- Do not rely on requestAnimationFrame; the iframe host owns the animation loop.
- Do not call postMessage; the iframe host owns the handshake.

Pack requirements:
- The first chat message must be a user message whose text is exactly the user prompt above.
- Include assistant messages explaining that code, spec, controls, and editor metadata were generated.
- The manifest must list canvas2d runtime, genre, controls, and capabilities.
- Manifest controls must include action names, labels, key codes, and kinds.
- Use browser KeyboardEvent.code values for keys, such as ArrowLeft, ArrowRight, ArrowUp, ArrowDown, KeyW, KeyA, KeyS, KeyD, Space, Enter, Escape, ShiftLeft, and ShiftRight.
- editableSpecJson must be a JSON string representing one object that fully describes the generated game state/config.
- editableSpecJson must contain only JSON values, stay compact, and be enough for the generated module to run.
- The editor metadata panels should summarize the generated runtime, controls, and editable spec.
`.trim();
}

// Legacy exports retained so the hidden hand-written GameCanvas keeps compiling.
export const behaviorValues = [
  "player_move",
  "player_jump",
  "gravity",
  "solid",
  "camera_follow",
] as const;

export type StarterBehavior = (typeof behaviorValues)[number];

export type StarterEntity = {
  id: string;
  kind: "player" | "ground";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  behaviors: StarterBehavior[];
};

export type StarterProjectSpec = {
  project: {
    name: string;
    summary: string;
  };
  chatTranscript: Array<{
    role: "user" | "assistant";
    text: string;
  }>;
  world: {
    width: number;
    height: number;
    gravity: number;
    background: {
      skyTop: string;
      skyBottom: string;
      accent: string;
    };
  };
  camera: {
    mode: "follow_player";
    targetId: string;
    smoothing: number;
  };
  entities: StarterEntity[];
};
