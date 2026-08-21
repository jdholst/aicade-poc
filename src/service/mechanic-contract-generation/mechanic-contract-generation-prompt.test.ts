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
  summary: "Change a bound actor's motion after a logical input.",
  triggers: ["logical_action"],
  actors: ["player"],
  targets: [],
  behaviors: ["change_actor_motion"],
  ownedObjects: [],
  stateChanges: ["actor_motion_changes"],
  temporalRules: [],
  spatialRules: [],
  constraints: [],
  configuration: [],
  connections: [],
  references: [{ kind: "entity", id: "player_one" }],
  outcomes: ["actor_motion_observable"],
  requiredCapabilities: ["object_read", "object_motion_write"],
  ambiguities: [],
};

const resolution: GeneratedMechanicResolution = {
  kind: "generated_mechanic",
  intentId: intent.id,
  candidateBuiltInTypes: ["projectile_shooting"],
  assumptions: [],
  coverage: {
    coveredRequirements: [
      {
        category: "trigger",
        value: "logical_action",
        coveredBy: ["hazard_contact"],
      },
    ],
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
    expect(prompt).toContain(
      `Exact accepted behavior trigger tokens JSON:\n${JSON.stringify(intent.triggers, null, 2)}`
    );
    expect(prompt).toContain(
      `Exact accepted behavior outcome tokens JSON:\n${JSON.stringify(intent.outcomes, null, 2)}`
    );
    expect(prompt).toContain(
      "Copy every trigger and outcome token verbatim into behavior.triggers and behavior.outcomes"
    );
    expect(prompt).toContain('"id": "state_write"');
    expect(prompt).toContain('"kind": "stable_id"');
    expect(prompt).toContain('"resourceBudgetProfile": "phase_9_fixed_budget"');
    expect(prompt).toContain(
      '"requiredIndependentEffectCapability": "object_motion_write"'
    );
    expect(prompt).toContain('"requiredTrigger": "logical_action"');
    expect(prompt).toContain('"ownedObjects": true');
    expect(prompt).toContain('"id": "object_create"');
    expect(prompt).toContain('"id": "spatial_query"');
    expect(prompt).toContain('"id": "object_destroy"');
    expect(prompt).toContain(
      '"bindingPropertyIds": [\n    "active",\n    "kind",\n    "role",\n    "name",\n    "position",\n    "velocity",\n    "position_x",\n    "position_y",\n    "velocity_x",\n    "velocity_y"\n  ]'
    );
    expect(prompt).toContain(
      "Use only those exact binding property IDs in scenario binding_property observations"
    );
    expect(prompt).toContain(
      "Use time_schedule plus a scheduled lifecycle callback for one-shot delayed transitions"
    );
    expect(prompt).toContain(
      "Do not use fixed_step to poll for dash expiry, cooldown expiry, or another one-shot deadline"
    );
    expect(prompt).toContain(
      '"routedActionConnection": "exactly one accepted intent input connection whose port is an exact active logical action"'
    );
    expect(prompt).toContain(
      "observable owned-object creation, travel, routed-target interaction when applicable, and cleanup"
    );
    expect(prompt).toContain(
      "does not require the full object_create, object_motion_write, spatial_query, and object_destroy lifecycle"
    );
    expect(prompt).not.toContain("declare no mechanic-owned objects");
    expect(prompt).toContain(
      "Private state may support the mechanic, but it is never independent acceptance evidence"
    );
    expect(prompt).not.toContain('"requiredObservableCapabilities"');
    expect(prompt).not.toContain("motion or declared private state");
    expect(prompt).toContain("Return one candidate Generated Mechanic Contract");
    expect(prompt).not.toMatch(/projectile|hazard|proximity/i);
    expect(prompt).not.toContain("Final Game Spec JSON");
    expect(prompt).not.toContain("TypeScript source");
  });

  it("includes exact stage-failure feedback and requires the correlated attempt candidate ID", () => {
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_contract_contract_1",
      issues: [
        {
          path: "bindings",
          code: "missing_entity_binding",
          message: 'Expected entity binding "player_one" at bindings[0].',
        },
      ],
      invalidatedArtifactIds: ["contract_candidate_initial_1"],
    };
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
      generationAttempt: {
        generationRunId: "generation_run_contract",
        stage: "contract",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId:
          "generation_run_contract_contract_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(JSON.stringify(repair, null, 2));
    expect(prompt).toContain(
      "Required top-level candidate artifact ID: generation_run_contract_contract_repair_2"
    );
    expect(prompt).toContain(
      "Correct every exact path, code, and message in the stage-failure feedback"
    );
  });

  it("tells contract repair to remove a source-proven unused capability grant", () => {
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_contract_source_1",
      issues: [
        {
          path: "grant.capabilities.4",
          code: "unused_capability",
          message:
            'Granted capability "time_read" has no verified source use and would provide unjustified authority.',
        },
      ],
      invalidatedArtifactIds: ["contract_candidate_initial_1"],
    };
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
      generationAttempt: {
        generationRunId: "generation_run_contract",
        stage: "contract",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId:
          "generation_run_contract_contract_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(JSON.stringify(repair, null, 2));
    expect(prompt).toContain(
      "When source-use validation reports unused_capability, remove that exact capability declaration unless an accepted requirement genuinely needs it"
    );
    expect(prompt).toContain(
      "Never add a meaningless capability call merely to make an unused grant appear used"
    );
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
