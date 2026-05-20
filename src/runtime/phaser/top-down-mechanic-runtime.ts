import type {
  GameSpec,
  GameSpecMechanicEntry,
  StableId,
} from "@/game-spec";
import type { RuntimeViewport } from "@/runtime/runtime-adapter";

/**
 * Public installer contract for classic top-down Phaser mechanics.
 *
 * Mechanic scripts should register a function on
 * `globalThis.__AICADE_TOP_DOWN_MECHANICS__` using the registry entry's
 * `runtimeInstallerKey`, annotate it as `TopDownMechanicInstaller`, and use
 * only these service groups. The authored Phaser template owns raw `scene`,
 * `Phaser`, and Game Spec plumbing; installers own behavior.
 */
export const TOP_DOWN_MECHANIC_CONTEXT_SERVICE_KEYS = [
  "entities",
  "layout",
  "physics",
  "objective",
  "input",
  "math",
  "runtime",
] as const;

export type TopDownMechanicContextServiceKey =
  (typeof TOP_DOWN_MECHANIC_CONTEXT_SERVICE_KEYS)[number];

export type TopDownMechanicPoint = {
  x: number;
  y: number;
};

export type TopDownMechanicEntity = GameSpec["entities"][number];

export type TopDownMechanicBody = {
  setAllowGravity?: (allowGravity: boolean) => void;
  setCollideWorldBounds?: (collideWorldBounds: boolean) => void;
  setVelocity?: (x: number, y: number) => void;
};

export type TopDownMechanicEntityHandle = {
  body?: TopDownMechanicBody;
  setPosition?: (x: number, y: number) => void;
  x: number;
  y: number;
};

export type TopDownMechanicCreateHandleOptions = {
  allowGravity?: boolean;
  collideWorldBounds?: boolean;
  color?: number;
  fallback?: TopDownMechanicPoint;
  height?: number;
  innerRadius?: number;
  kind?: "circle" | "rectangle" | "star";
  outerRadius?: number;
  point?: TopDownMechanicPoint;
  points?: number;
  radius?: number;
  staticBody?: boolean;
  width?: number;
  x?: number;
  y?: number;
};

/**
 * Entity lookup and handle creation. `createHandle` positions new handles from
 * the entity spawn zone when one exists, otherwise from the provided fallback.
 */
export type TopDownMechanicEntitiesService = {
  createHandle: (
    entityId: StableId,
    options?: TopDownMechanicCreateHandleOptions
  ) => TopDownMechanicEntityHandle;
  findById: (entityId: StableId) => TopDownMechanicEntity | null;
  findByRole: (role: TopDownMechanicEntity["role"]) => TopDownMechanicEntity | null;
  findTargetByRole: (
    role: TopDownMechanicEntity["role"]
  ) => TopDownMechanicEntity | null;
  getTargetIdByRole: (
    role: TopDownMechanicEntity["role"],
    fallbackEntityId: StableId
  ) => StableId;
  getHandle: (entityId: StableId) => TopDownMechanicEntityHandle | null;
  resetHandle: (entityId: StableId) => void;
};

/**
 * Read-only layout helpers exposed to mechanics. Use these for spawn, pickup,
 * collision, and path checks instead of reaching into the scene layout directly.
 */
export type TopDownMechanicLayoutService = {
  findPickupPoint: (options?: {
    fallback?: TopDownMechanicPoint;
    padding?: number;
  }) => TopDownMechanicPoint;
  findSpawnPointForEntity: (
    entityId: StableId,
    fallback: TopDownMechanicPoint
  ) => TopDownMechanicPoint;
  isPathBlocked: (
    start: TopDownMechanicPoint,
    end: TopDownMechanicPoint,
    padding: number
  ) => boolean;
  isPointBlocked: (point: TopDownMechanicPoint, padding: number) => boolean;
  staticBodies: TopDownMechanicEntityHandle[];
};

export type TopDownMechanicOverlapHandler = () => void;

/** Physics hooks that keep Phaser details inside the template. */
export type TopDownMechanicPhysicsService = {
  addCollider: (
    first: TopDownMechanicEntityHandle,
    second: TopDownMechanicEntityHandle
  ) => void;
  addOverlap: (
    first: TopDownMechanicEntityHandle,
    second: TopDownMechanicEntityHandle,
    handler: TopDownMechanicOverlapHandler
  ) => void;
};

/** Objective mutations for score-like runtime state. */
export type TopDownMechanicObjectiveService = {
  getPrimaryId: (fallbackObjectiveId?: StableId) => StableId;
  increment: (objectiveId: StableId, amount?: number) => void;
  reset: (objectiveId: StableId) => void;
};

export type TopDownMechanicCursorState = {
  isDown: boolean;
};

export type TopDownMechanicCursorKeys = {
  down: TopDownMechanicCursorState;
  left: TopDownMechanicCursorState;
  right: TopDownMechanicCursorState;
  up: TopDownMechanicCursorState;
};

export type TopDownMechanicInputService = {
  createCursorKeys: () => TopDownMechanicCursorKeys;
};

export type TopDownMechanicMathService = {
  normalizeVector: (
    vector: TopDownMechanicPoint,
    fallback?: TopDownMechanicPoint
  ) => TopDownMechanicPoint;
  randomBetween: (min: number, max: number) => number;
  scaleVector: (
    vector: TopDownMechanicPoint,
    scale: number
  ) => TopDownMechanicPoint;
};

export type TopDownMechanicRuntimeService = {
  getViewport: () => RuntimeViewport;
  resetEntity: (entityId: StableId) => void;
};

/**
 * Complete top-down mechanic context. If a mechanic needs a Phaser capability
 * that is not represented here, add a narrow service method instead of passing
 * raw `scene`, `Phaser`, or `gameSpec` through the boundary.
 */
export type TopDownMechanicInstallerContext = {
  entities: TopDownMechanicEntitiesService;
  input: TopDownMechanicInputService;
  layout: TopDownMechanicLayoutService;
  math: TopDownMechanicMathService;
  mechanic: GameSpecMechanicEntry;
  objective: TopDownMechanicObjectiveService;
  physics: TopDownMechanicPhysicsService;
  runtime: TopDownMechanicRuntimeService;
};

export type TopDownMechanicInstallResult =
  | {
      dispose?: () => void;
      update?: () => void;
    }
  | void;

/**
 * Installs behavior for one active Game Spec mechanic. Return `update` for per
 * frame behavior and `dispose` for cleanup; throw only for truly unrecoverable
 * setup errors because the runtime isolates installer failures.
 */
export type TopDownMechanicInstaller = (
  context: TopDownMechanicInstallerContext
) => TopDownMechanicInstallResult;

export type TopDownMechanicInstallerRegistry = Record<
  StableId,
  TopDownMechanicInstaller
>;
