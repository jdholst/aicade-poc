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

const aiStateSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case AI state names."),
    purpose: z.string().min(1).max(120),
    entersWhen: z.string().min(1).max(160),
    behavior: z.string().min(1).max(180),
  })
  .strict();

const aiReactionSchema = z
  .object({
    stimulus: z.string().min(1).max(100),
    response: z.string().min(1).max(180),
  })
  .strict();

const aiTuningSchema = z
  .object({
    parameter: z
      .string()
      .min(1)
      .max(48)
      .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case AI tuning parameters."),
    value: z.number().finite().min(-10000).max(10000),
  })
  .strict();

export const aiSpecSchema = z
  .object({
    summary: z.string().min(1).max(220),
    difficulty: z.enum(["static", "adaptive", "escalating", "assistive"]),
    tickRate: z.enum(["every_frame", "fixed_step", "event_driven"]),
    updateBudget: z.enum(["low", "medium", "high"]),
    agents: z
      .array(
        z
          .object({
            id: z
              .string()
              .min(1)
              .max(48)
              .regex(/^[a-z][a-z0-9_]*$/, "Use snake_case AI agent ids."),
            label: z.string().min(1).max(64),
            role: z.enum([
              "opponent",
              "enemy",
              "ally",
              "npc",
              "hazard",
              "director",
              "creature",
            ]),
            goal: z.string().min(1).max(180),
            observes: z.array(z.string().min(1).max(80)).min(2).max(8),
            states: z.array(aiStateSchema).min(2).max(8),
            reactions: z.array(aiReactionSchema).min(2).max(8),
            tuning: z.array(aiTuningSchema).min(1).max(8),
          })
          .strict()
      )
      .min(1)
      .max(8),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seenAgentIds = new Set<string>();

    data.agents.forEach((agent, index) => {
      if (seenAgentIds.has(agent.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["agents", index, "id"],
          message: "AI agent ids must be unique.",
        });
      }

      seenAgentIds.add(agent.id);

      const seenStateNames = new Set<string>();
      agent.states.forEach((state, stateIndex) => {
        if (seenStateNames.has(state.name)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["agents", index, "states", stateIndex, "name"],
            message: "AI state names must be unique within an agent.",
          });
        }

        seenStateNames.add(state.name);
      });

      const seenTuningParameters = new Set<string>();
      agent.tuning.forEach((item, tuningIndex) => {
        if (seenTuningParameters.has(item.parameter)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["agents", index, "tuning", tuningIndex, "parameter"],
            message: "AI tuning parameters must be unique within an agent.",
          });
        }

        seenTuningParameters.add(item.parameter);
      });
    });
  });

const manifestSchema = z.object({
  title: z.string().min(1).max(80),
  genre: z.string().min(1).max(40),
  runtime: z.literal("canvas2d"),
  editableSpecVersion: z.string().min(1).max(40),
  viewport: z.object({
    width: z.number().int().min(480).max(1600),
    height: z.number().int().min(320).max(1200),
    scaling: z.literal("stretch_to_fill"),
  }),
  capabilities: z.array(z.string().min(1).max(48)).min(3).max(12),
  controls: z.array(controlBindingSchema).min(1).max(12),
  ai: aiSpecSchema,
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
    moduleSourceTs: z.string().min(1200).max(42000),
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
      editableSpecJson: z.string().min(2).max(32000),
    })
    .strict();

export const generatedGamePackSchema = generatedGamePackSharedSchema
  .extend({
    editableSpec: jsonValueSchema,
    moduleSourceJs: z.string().min(800).max(50000),
  })
  .strict();

export type ControlBinding = z.infer<typeof controlBindingSchema>;
export type AiSpec = z.infer<typeof aiSpecSchema>;
export type GeneratedGamePack = z.infer<typeof generatedGamePackSchema>;
export type GeneratedGamePackFromOpenAI = z.infer<
  typeof generatedGamePackFromOpenAiSchema
>;

const generatedAiSpecJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "difficulty", "tickRate", "updateBudget", "agents"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 220 },
    difficulty: {
      type: "string",
      enum: ["static", "adaptive", "escalating", "assistive"],
    },
    tickRate: {
      type: "string",
      enum: ["every_frame", "fixed_step", "event_driven"],
    },
    updateBudget: { type: "string", enum: ["low", "medium", "high"] },
    agents: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "role",
          "goal",
          "observes",
          "states",
          "reactions",
          "tuning",
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            maxLength: 48,
            pattern: "^[a-z][a-z0-9_]*$",
          },
          label: { type: "string", minLength: 1, maxLength: 64 },
          role: {
            type: "string",
            enum: [
              "opponent",
              "enemy",
              "ally",
              "npc",
              "hazard",
              "director",
              "creature",
            ],
          },
          goal: { type: "string", minLength: 1, maxLength: 180 },
          observes: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: { type: "string", minLength: 1, maxLength: 80 },
          },
          states: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "purpose", "entersWhen", "behavior"],
              properties: {
                name: {
                  type: "string",
                  minLength: 1,
                  maxLength: 40,
                  pattern: "^[a-z][a-z0-9_]*$",
                },
                purpose: { type: "string", minLength: 1, maxLength: 120 },
                entersWhen: { type: "string", minLength: 1, maxLength: 160 },
                behavior: { type: "string", minLength: 1, maxLength: 180 },
              },
            },
          },
          reactions: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["stimulus", "response"],
              properties: {
                stimulus: { type: "string", minLength: 1, maxLength: 100 },
                response: { type: "string", minLength: 1, maxLength: 180 },
              },
            },
          },
          tuning: {
            type: "array",
            minItems: 1,
            maxItems: 8,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["parameter", "value"],
              properties: {
                parameter: {
                  type: "string",
                  minLength: 1,
                  maxLength: 48,
                  pattern: "^[a-z][a-z0-9_]*$",
                },
                value: { type: "number", minimum: -10000, maximum: 10000 },
              },
            },
          },
        },
      },
    },
  },
} as const;

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
        "viewport",
        "capabilities",
        "controls",
        "ai",
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
        viewport: {
          type: "object",
          additionalProperties: false,
          required: ["width", "height", "scaling"],
          properties: {
            width: { type: "integer", minimum: 480, maximum: 1600 },
            height: { type: "integer", minimum: 320, maximum: 1200 },
            scaling: { type: "string", enum: ["stretch_to_fill"] },
          },
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
        ai: generatedAiSpecJsonSchema,
      },
    },
    editableSpecJson: {
      type: "string",
      minLength: 2,
      maxLength: 32000,
      description:
        "A JSON.stringify-compatible editable game spec object. It must contain a top-level ai object with the same JSON value as manifest.ai, plus any genre-specific serializable JSON values the module reads.",
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
    moduleSourceTs: { type: "string", minLength: 1200, maxLength: 42000 },
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
- The factory receives host = { canvas, ctx, spec, viewport }.
- It must return an object with these functions:
  start(), update(dt, input), render(ctx), resize(width, height, dpr), destroy(), getEditableSpec(), applyPatch(patch).
- The game must use host.spec as its editable game spec and source of truth.
- The generated code and editableSpecJson must agree exactly. Every spec path read by the module must exist in editableSpecJson.
- Before reading nested data such as position.x, ball.x, paddle.y, or entity.size, initialize that object from a complete default object merged with host.spec.
- Do not read .x, .y, .width, .height, .radius, .speed, or similar properties from possibly undefined objects.
- Prefer a small local state object created in start() from validated spec values, then update/render from that local state.
- resize(width, height, dpr) may be called after start and more than once. It must only mutate objects that were initialized from complete defaults, such as state.viewport = { width, height, dpr }, and must never assign width/height/w/h onto possibly undefined nested objects.
- The game must treat host.viewport.width and host.viewport.height as the full logical playable viewport.
- resize(width, height, dpr) receives the same logical viewport size; the host scales that viewport to fill the iframe.
- The game must read controls from input.actions[actionName].down and input.actions[actionName].pressed.
- The game may also inspect input.rawKeys[keyCode] when useful.
- The game must implement reactive AI by reading a top-level spec.ai object from host.spec. Do not keep AI behavior only in hard-coded constants.
- If you alias or merge host.spec, make the editable AI source obvious in code, such as const editableAi = spec.ai or const editableAi = gameSpec.ai.
- AI-controlled entities, hazards, opponents, allies, NPCs, or directors must use explicit state names from spec.ai.agents[].states and change state in response to player position, distance, line of sight, health, score, timers, or arena events.
- The game must render visible primitive Canvas 2D shapes without external assets.
- The game must be immediately playable and match the user's requested genre and fantasy.
- Do not force the design into a platformer unless the user asks for a platformer.
- The render output must fill the entire logical viewport from x=0..width and y=0..height.
- Gameplay boundaries must match visible drawn boundaries. Do not create invisible walls, invisible floors, hidden collision barriers, or unreachable dead zones.
- If the game uses an arena, room, court, maze, or track, draw its edges clearly and keep the playable area inside those visible edges.
- Avoid large purely decorative areas that the player cannot interact with unless they are clearly background and do not block movement.
- Keep the initial player, avatar, paddle, cursor, or primary controlled object visible and usable in the first frame.
- Do not rely on requestAnimationFrame; the iframe host owns the animation loop.
- Do not call postMessage; the iframe host owns the handshake.

Pack requirements:
- The first chat message must be a user message whose text is exactly the user prompt above.
- Include assistant messages explaining that code, spec, controls, and editor metadata were generated.
- The manifest must list canvas2d runtime, genre, viewport, controls, and capabilities.
- The manifest must include an ai section with summary, difficulty, tickRate, updateBudget, and at least one well-defined AI agent.
- The manifest viewport should usually be 960x540 for wide games, 800x600 for classic arcade games, or 720x720 for square arenas.
- The manifest viewport scaling must be "stretch_to_fill" so the host can fill the iframe without letterboxing.
- Manifest controls must include action names, labels, key codes, and kinds.
- Use browser KeyboardEvent.code values for keys, such as ArrowLeft, ArrowRight, ArrowUp, ArrowDown, KeyW, KeyA, KeyS, KeyD, Space, Enter, Escape, ShiftLeft, and ShiftRight.
- editableSpecJson must be a JSON string representing one object that fully describes the generated game state/config.
- editableSpecJson must contain raw JSON text only: no Markdown fences, no explanatory prose, no JavaScript object literal syntax, no trailing commas, and no comments.
- editableSpecJson must contain a top-level ai object with the same JSON value as manifest.ai. Store AI tuning values there, such as chase range, evade range, patrol speed, fire cadence, reaction delay, confidence, spawn pressure, or difficulty scaling.
- Do not put controls, input bindings, or key maps inside editableSpecJson.ai. Controls belong only in manifest.controls and any non-AI runtime spec section that genuinely needs them.
- Every manifest.ai agent must describe:
  - role and gameplay goal;
  - what it observes from the world/player;
  - at least two finite states with enter conditions and behavior;
  - at least two reactions to player/game stimuli;
  - at least one tuning parameter the module reads from spec.ai.
- Prefer reactive AI that is legible in play: patrol before contact, pursue or assist when triggered, evade or recover under pressure, and adapt as score/time/difficulty changes.
- For games without obvious enemies, create an AI director, hazard controller, rival, helper, or ambient system that reacts to the player's actions.
- editableSpecJson must contain only JSON values, stay compact, and be enough for the generated module to run.
- The editor metadata panels should summarize the generated runtime, controls, AI behavior, and editable spec.
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
