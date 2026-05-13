import type { ZodType } from "zod";

import type { JsonValue, StableId } from "../game-spec-schema";
import type { TopDownGameSpec } from "../top-down-spec-schema";

export type MechanicRegistryEntry = {
  type: StableId;
  label: string;
  description: string;
  runtimeInstallerKey: StableId;
  configSchema?: ZodType<Record<string, JsonValue>>;
};

export const topDownMechanicRegistry = [
  {
    type: "player_movement",
    label: "Player movement",
    description: "Installs player-controlled top-down movement behavior.",
    runtimeInstallerKey: "install_player_movement",
  },
  {
    type: "enemy_chase",
    label: "Enemy chase",
    description: "Installs enemy pursuit behavior against a target entity.",
    runtimeInstallerKey: "install_enemy_chase",
  },
  {
    type: "pickup_collection",
    label: "Pickup collection",
    description: "Installs collectible pickup and objective progress behavior.",
    runtimeInstallerKey: "install_pickup_collection",
  },
] as const satisfies readonly MechanicRegistryEntry[];

export function getTopDownMechanicDefinition(
  type: string
): MechanicRegistryEntry | undefined {
  return topDownMechanicRegistry.find((entry) => entry.type === type);
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
