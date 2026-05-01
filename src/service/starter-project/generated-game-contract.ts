export const GENERATED_GAME_FACTORY_NAME = "createGameModule";
export const GENERATED_GAME_FACTORY_ASSIGNMENT = `globalThis.${GENERATED_GAME_FACTORY_NAME}`;

export const GENERATED_GAME_REQUIRED_METHODS = [
  "start",
  "update",
  "render",
  "resize",
  "destroy",
  "getEditableSpec",
  "applyPatch",
] as const;

export type GeneratedGameRequiredMethod =
  (typeof GENERATED_GAME_REQUIRED_METHODS)[number];

