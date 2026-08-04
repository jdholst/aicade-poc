import { describe, expect, it } from "vitest";

import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  type GeneratedMechanicResolution,
  type MechanicIntent,
} from "@/game-spec";

import { createMechanicContractGenerationSystemPrompt } from "./mechanic-contract-generation-prompt";
import {
  generatedMechanicContractJsonSchema,
  type MechanicContractJsonSchema,
} from "./mechanic-contract-generation-schema";

const intent: MechanicIntent = {
  id: "intent_runtime_rule",
  summary: "Change a bound actor state after a logical input.",
  triggers: ["logical_action"],
  actors: ["player"],
  targets: [],
  behaviors: ["change_actor_state"],
  ownedObjects: [],
  stateChanges: ["actor_state_changes"],
  temporalRules: [],
  spatialRules: [],
  constraints: [],
  configuration: [],
  connections: [],
  references: [{ kind: "entity", id: "player_one" }],
  outcomes: ["actor_state_observable"],
  requiredCapabilities: ["object_read", "state_write"],
  ambiguities: [],
};

const resolution: GeneratedMechanicResolution = {
  kind: "generated_mechanic",
  intentId: intent.id,
  candidateBuiltInTypes: [],
  assumptions: [],
  coverage: {
    coveredRequirements: [],
    uncoveredRequirements: [
      {
        category: "behavior",
        value: "change_actor_state",
        coveredBy: [],
      },
    ],
  },
};

describe("createMechanicContractGenerationSystemPrompt", () => {
  it("documents accepted intent, generic capabilities, and restricted DSLs without named-mechanic guidance", () => {
    const prompt = createMechanicContractGenerationSystemPrompt({
      intent,
      resolution,
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      referenceCatalog: {
        action: ["activate"],
        entity: ["player_one"],
      },
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 8,
        maximumOperationsPerTick: 40,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 256,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_contract_generation.primary",
    });

    expect(prompt).toContain(JSON.stringify(intent, null, 2));
    expect(prompt).toContain('"id": "state_write"');
    expect(prompt).toContain('"kind": "stable_id"');
    expect(prompt).toContain('"resourceBudgetProfile": "phase_9_fixed_budget"');
    expect(prompt).toContain("Return one candidate Generated Mechanic Contract");
    expect(prompt).not.toMatch(/projectile|hazard|proximity/i);
    expect(prompt).not.toContain("Final Game Spec JSON");
    expect(prompt).not.toContain("TypeScript source");
  });
});

describe("generatedMechanicContractJsonSchema", () => {
  it("keeps the strict provider tool limited to the authoritative contract artifact", () => {
    expect(generatedMechanicContractJsonSchema.$schema).toBeUndefined();
    expect(Object.keys(generatedMechanicContractJsonSchema.properties ?? {})).toEqual(
      [
        "schemaVersion",
        "id",
        "intentId",
        "capabilityVersion",
        "behavior",
        "config",
        "bindings",
        "ownedObjects",
        "privateState",
        "lifecycle",
        "ports",
        "capabilities",
        "resourceExpectations",
        "scenarios",
      ]
    );

    for (const schema of collectObjectSchemas(generatedMechanicContractJsonSchema)) {
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required?.sort()).toEqual(
        Object.keys(schema.properties ?? {}).sort()
      );
    }

    expect(JSON.stringify(generatedMechanicContractJsonSchema)).not.toMatch(
      /"source"|"finalGameSpec"|"originalPrompt"/
    );
  });
});

function collectObjectSchemas(
  schema: MechanicContractJsonSchema
): MechanicContractJsonSchema[] {
  const matches = schema.properties ? [schema] : [];

  for (const child of Object.values(schema.properties ?? {})) {
    matches.push(...collectObjectSchemas(child));
  }

  if (schema.items) {
    matches.push(...collectObjectSchemas(schema.items));
  }

  for (const child of schema.anyOf ?? []) {
    matches.push(...collectObjectSchemas(child));
  }

  for (const child of schema.oneOf ?? []) {
    matches.push(...collectObjectSchemas(child));
  }

  for (const child of Object.values(schema.$defs ?? {})) {
    matches.push(...collectObjectSchemas(child));
  }

  return matches;
}
