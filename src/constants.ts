import type { Metadata } from "next";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const GENERATED_GAME_TOOL = "return_generated_game_pack";
export const OPENAI_REQUEST_TIMEOUT_MS = 500_000;
export const MAX_EDITABLE_SPEC_DEPTH = 8;
export const MAX_EDITABLE_SPEC_ARRAY_ITEMS = 200;
export const MAX_EDITABLE_SPEC_OBJECT_KEYS = 80;
export const MAX_EDITABLE_SPEC_STRING_LENGTH = 1200;

export const jsDataMemberNames = new Set([
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

export const forbiddenSourcePatterns = [
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

export const GENERATION_TIMEOUT_MS = 120_000;

export const STEP_MS = 1000 / 60;
export const MOVE_SPEED = 360;
export const JUMP_SPEED = 760;

export const SANDBOX_BOOT_TIMEOUT_MS = 12_000;

export const DEFAULT_STARTER_PROMPT =
  "A simple 2D platformer where I control a character that can jump";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

export const OPENAI_MODEL_OPTIONS = [
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    detail: "Flagship model for complex reasoning, coding, and design work.",
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    detail: "Frontier model for coding and professional workflows.",
  },
  {
    id: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    detail: "Strong default for faster, lower-cost generation.",
  },
  {
    id: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    detail: "Lowest-cost GPT-5.4 class option for simple generations.",
  },
  {
    id: "gpt-5.2",
    label: "GPT-5.2",
    detail: "Previous frontier model for coding and agentic tasks.",
  },
  {
    id: "gpt-5.2-pro",
    label: "GPT-5.2 pro",
    detail: "Higher-precision GPT-5.2 variant for difficult prompts.",
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    detail: "Stable GPT-5 model for general usage.",
  },
];

export const behaviorValues = [
  "player",
  "enemy",
  "platform",
  "hazard",
  "collectible",
  "projectile",
  "decoration",
  "effect",
  "trigger",
  "spawn",
  "goal",
];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI-cade v0 POC",
  description: "AI-generated starter platformer flow built with Next.js.",
};
