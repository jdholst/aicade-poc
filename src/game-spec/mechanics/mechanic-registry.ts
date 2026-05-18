import type { ZodType } from "zod";

import type {
  GameSpecMechanicEntry,
  JsonValue,
  StableId,
} from "../game-spec-schema";
import type { TopDownGameSpec } from "../top-down-spec-schema";

export type MechanicRuntimeScope = {
  templateId: StableId;
  runtime: StableId;
};

export type MechanicCapabilityTag =
  | "collection"
  | "enemy_ai"
  | "health_damage"
  | "movement"
  | "score"
  | "timer";

export type MechanicRegistryEntry<TContext = unknown> = {
  type: StableId;
  label: string;
  description: string;
  scope: MechanicRuntimeScope;
  capabilityTags: MechanicCapabilityTag[];
  runtimeInstallerKey: StableId;
  runtimeDependencyScriptPath?: string;
  configSchema?: ZodType<Record<string, JsonValue>>;
  agentContract?: Record<string, JsonValue>;
  runtimeContext?: TContext;
  validation?: Record<string, JsonValue>;
};

export type MechanicRuntimeBridgeInput<
  TEntry extends MechanicRegistryEntry = MechanicRegistryEntry,
> = {
  mechanics: readonly GameSpecMechanicEntry[];
  registry: readonly TEntry[];
  scope: MechanicRuntimeScope;
};

export type MechanicRuntimeBridge = {
  mechanicInstallerKeys: Record<StableId, StableId>;
  runtimeDependencyScriptPaths: string[];
};

export const TOP_DOWN_PHASER_MECHANIC_SCOPE = {
  templateId: "template_top_down",
  runtime: "phaser",
} as const satisfies MechanicRuntimeScope;

export const topDownMechanicRegistry = [
  {
    type: "player_movement",
    label: "Player movement",
    description: "Installs player-controlled top-down movement behavior.",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    capabilityTags: ["movement"],
    runtimeInstallerKey: "install_player_movement",
    runtimeDependencyScriptPath: "/runtime/phaser/mechanics/player-movement.js",
  },
  {
    type: "enemy_chase",
    label: "Enemy chase",
    description: "Installs enemy pursuit behavior against a target entity.",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    capabilityTags: ["enemy_ai"],
    runtimeInstallerKey: "install_enemy_chase",
    runtimeDependencyScriptPath: "/runtime/phaser/mechanics/enemy-chase.js",
  },
  {
    type: "pickup_collection",
    label: "Pickup collection",
    description: "Installs collectible pickup and objective progress behavior.",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    capabilityTags: ["collection", "score"],
    runtimeInstallerKey: "install_pickup_collection",
    runtimeDependencyScriptPath: "/runtime/phaser/mechanics/pickup-collection.js",
  },
  {
    type: "hazard_contact",
    label: "Hazard contact",
    description: "Installs contact behavior for hazardous entities.",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    capabilityTags: ["health_damage"],
    runtimeInstallerKey: "install_hazard_contact",
    runtimeDependencyScriptPath: "/runtime/phaser/mechanics/hazard-contact.js",
  },
] as const satisfies readonly MechanicRegistryEntry[];

function isSameMechanicScope(
  first: MechanicRuntimeScope,
  second: MechanicRuntimeScope
) {
  return first.templateId === second.templateId && first.runtime === second.runtime;
}

export function getMechanicDefinitionForScope<
  TEntry extends MechanicRegistryEntry,
>(
  registry: readonly TEntry[],
  type: string,
  scope: MechanicRuntimeScope
): TEntry | undefined {
  return registry.find(
    (entry) => entry.type === type && isSameMechanicScope(entry.scope, scope)
  );
}

export function getMechanicDefinitionsForScope<
  TEntry extends MechanicRegistryEntry,
>(registry: readonly TEntry[], scope: MechanicRuntimeScope): TEntry[] {
  return registry.filter((entry) => isSameMechanicScope(entry.scope, scope));
}

export function createMechanicRuntimeBridge<
  TEntry extends MechanicRegistryEntry,
>({
  mechanics,
  registry,
  scope,
}: MechanicRuntimeBridgeInput<TEntry>): MechanicRuntimeBridge {
  const activeTypes = new Set<StableId>();
  const activeScriptPaths = new Set<string>();
  const mechanicInstallerKeys: Record<StableId, StableId> = {};
  const runtimeDependencyScriptPaths: string[] = [];

  for (const mechanic of mechanics) {
    if (activeTypes.has(mechanic.type)) {
      continue;
    }

    const definition = getMechanicDefinitionForScope(
      registry,
      mechanic.type,
      scope
    );

    if (!definition) {
      continue;
    }

    activeTypes.add(mechanic.type);
    mechanicInstallerKeys[mechanic.type] = definition.runtimeInstallerKey;

    if (
      definition.runtimeDependencyScriptPath &&
      !activeScriptPaths.has(definition.runtimeDependencyScriptPath)
    ) {
      activeScriptPaths.add(definition.runtimeDependencyScriptPath);
      runtimeDependencyScriptPaths.push(definition.runtimeDependencyScriptPath);
    }
  }

  return {
    mechanicInstallerKeys,
    runtimeDependencyScriptPaths,
  };
}

export function getTopDownMechanicDefinition(
  type: string
): MechanicRegistryEntry | undefined {
  return getMechanicDefinitionForScope(
    topDownMechanicRegistry,
    type,
    TOP_DOWN_PHASER_MECHANIC_SCOPE
  );
}

export function getTopDownMechanicDefinitionsForSpec(
  spec: TopDownGameSpec
): MechanicRegistryEntry[] {
  const activeTypes = new Set<StableId>();
  const definitions: MechanicRegistryEntry[] = [];

  for (const mechanic of spec.mechanics) {
    if (activeTypes.has(mechanic.type)) {
      continue;
    }

    const definition = getTopDownMechanicDefinition(mechanic.type);

    if (definition) {
      activeTypes.add(mechanic.type);
      definitions.push(definition);
    }
  }

  return definitions;
}
