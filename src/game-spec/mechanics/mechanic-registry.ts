import type { ZodType } from "zod";

import type { JsonValue, StableId } from "../game-spec-schema";
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
  configSchema?: ZodType<Record<string, JsonValue>>;
  agentContract?: Record<string, JsonValue>;
  runtimeContext?: TContext;
  validation?: Record<string, JsonValue>;
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
  },
  {
    type: "enemy_chase",
    label: "Enemy chase",
    description: "Installs enemy pursuit behavior against a target entity.",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    capabilityTags: ["enemy_ai"],
    runtimeInstallerKey: "install_enemy_chase",
  },
  {
    type: "pickup_collection",
    label: "Pickup collection",
    description: "Installs collectible pickup and objective progress behavior.",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    capabilityTags: ["collection", "score"],
    runtimeInstallerKey: "install_pickup_collection",
  },
  {
    type: "hazard_contact",
    label: "Hazard contact",
    description: "Installs contact behavior for hazardous entities.",
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
    capabilityTags: ["health_damage"],
    runtimeInstallerKey: "install_hazard_contact",
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
