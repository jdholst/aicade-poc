export {
  gameSpecSchema,
  parseGameSpec,
  stableIdSchema,
  type GameSpec,
  type GameSpecMechanicEntry,
  type GameSpecObjective,
  type GameSpecValidationGoal,
  type StableId,
} from "./game-spec-schema";

export {
  GameSpecValidationError,
  getTopDownGameSpecValidationIssues,
  validateTopDownGameSpec,
  type GameSpecValidationIssue,
} from "./game-spec-validation";

export {
  parseTopDownGameSpec,
  parseTopDownSpec,
  topDownGameSpecSchema,
  topDownSpecSchema,
  type TopDownArena,
  type TopDownGameSpec,
  type TopDownObstacle,
  type TopDownPickupZone,
  type TopDownRegion,
  type TopDownScene,
  type TopDownSpawnZone,
  type TopDownSpec,
  type TopDownWall,
} from "./top-down-spec-schema";
