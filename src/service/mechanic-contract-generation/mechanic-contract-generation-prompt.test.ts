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
    expect(prompt).toContain("Exact required mechanic ports JSON:\n[]");
    expect(prompt).toContain(
      `Exact mandatory contract lifecycle callbacks JSON:\n${JSON.stringify(
        ["install", "logical_action"],
        null,
        2
      )}`
    );
    expect(prompt).toContain(
      `Exact required contract binding references JSON:\n${JSON.stringify(
        [
          {
            referenceKind: "entity",
            referenceId: "player_one",
            cardinality: "one",
          },
        ],
        null,
        2
      )}`
    );
    expect(prompt).toContain(
      "Copy every trigger and outcome token verbatim into behavior.triggers and behavior.outcomes"
    );
    expect(prompt).toContain(
      "Copy the exact empty ports array into contract.ports on every initial and repair attempt"
    );
    expect(prompt).toContain(
      "Copy every exact mandatory lifecycle callback into contract.lifecycle.callbacks"
    );
    expect(prompt).toContain(
      "Replace contract.bindings with exactly one binding for each entry in the exact required binding-reference manifest"
    );
    expect(prompt).toContain('"id": "state_write"');
    expect(prompt).toContain('"kind": "stable_id"');
    expect(prompt).toContain(
      `Exact private-state value-type semantics JSON:\n${JSON.stringify(
        {
          boolean: "JSON boolean",
          number: "finite JSON number",
          integer:
            "finite JSON number for which Number.isInteger(value) is true",
          string: "JSON string",
          stable_id: "non-empty stable ID string",
        },
        null,
        2
      )}`
    );
    expect(prompt).toContain(
      "Every privateState initialValue and every scenario state setup or state_equals value must match"
    );
    expect(prompt).toContain(
      "After an accepted action writes private state, every final state_equals observation must match that write"
    );
    expect(prompt).toContain(
      "Advancing beyond a *_until deadline does not reset the stored deadline to its initial sentinel"
    );
    expect(prompt).toContain('"resourceBudgetProfile": "phase_9_fixed_budget"');
    expect(prompt).toContain('"ownedObjectLifecycle": [');
    expect(prompt).toContain('"object_create"');
    expect(prompt).toContain('"object_destroy"');
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
      "Generated source cannot deactivate or destroy bound objects"
    );
    expect(prompt).toContain(
      "Use time_schedule plus a scheduled lifecycle callback for one-shot delayed transitions"
    );
    expect(prompt).toContain(
      "Do not use fixed_step to poll for dash expiry, cooldown expiry, or another one-shot deadline"
    );
    expect(prompt).toContain(
      "When an owned object's velocity is set once and the host advances its motion, use time_schedule with a scheduled callback for bounded recurring interaction and cleanup checks"
    );
    expect(prompt).toContain(
      "reserve fixed_step for behavior that must recalculate or rewrite motion on each simulation step"
    );
    expect(prompt).toContain(
      '"routedActionConnection": "exactly one accepted intent input connection whose port is an exact active logical action"'
    );
    expect(prompt).toContain(
      "explicit cleanup, and nonzero travel only when object_motion_write is declared"
    );
    expect(prompt).toContain(
      "If a scenario advances through explicit owned-object cleanup, its final owned_object_count must equal 0"
    );
    expect(prompt).toContain(
      "Prove a positive transient owned_object_count in a separate dispatch-only scenario with no advance_time step"
    );
    expect(prompt).toContain(
      "any time advance can validly remove the transient object through interaction or cleanup before final observations are evaluated"
    );
    expect(prompt).toContain(
      "retain object_read and preserve the exact rule in contract lineage"
    );
    expect(prompt).toContain(
      "actor-origin lifecycle evidence"
    );
    expect(prompt).toContain(
      'Only the exact intent spatial rule "spawn_owned_object_at_actor_position" requires actor-origin lifecycle evidence'
    );
    expect(prompt).toContain(
      "A single advance_time step first moves the simulation clock to that step's endpoint"
    );
    expect(prompt).toContain(
      "A positive-delay callback scheduled during that dispatch is not due until a later advance_time step"
    );
    expect(prompt).toContain(
      "Exact state_equals counters must include install-time writes and only the scheduled callbacks reachable from the listed steps"
    );
    expect(prompt).toContain(
      "does not require a mechanic-owned object_create and object_destroy lifecycle"
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
    expect(prompt).toContain(
      "When binding admission fails, replace the entire contract.bindings array from the exact required binding-reference manifest"
    );
    expect(prompt).toContain(
      "Do not add supporting, action, objective, asset, region, owned-object, duplicate, or otherwise non-routed bindings"
    );
  });

  it("tells contract repair to make post-lifetime owned-object counts zero", () => {
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_contract_contract_1",
      issues: [
        {
          path: "scenarios.0.observations.0",
          code: "contradiction",
          message:
            'Generated mechanic scenario "shoot_creates_moves_and_expires_projectile" advances 1300ms after its action, meeting or exceeding the accepted transient lifetime 1200ms. Its final owned-object count cannot require an active "player_projectile"; declare final count 0 or end the scenario before cleanup.',
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
      "When contradiction reports that a scenario meets or exceeds an accepted transient lifetime, edit the exact owned_object_count observation at the reported path: set operator to equals and value to 0"
    );
    expect(prompt).toContain(
      "Preserve its dispatch_action and advance_time steps; do not shorten the cleanup scenario merely to retain a positive final count"
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

  it("tells host-admission repair to remove unsupported mechanic ports", () => {
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_contract_contract_1",
      issues: [
        {
          path: "contract.ports",
          code: "unsupported_runtime_ports",
          message:
            "The retained top-down generated-mechanic host does not admit mechanic ports.",
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

    expect(prompt).toContain(
      "When host admission reports unsupported_runtime_ports, set contract.ports to [] exactly"
    );
    expect(prompt).toContain(
      "Remove scenario observations, capability declarations, and lifecycle behavior that exist only to use those ports"
    );
  });

  it("tells lifecycle repair to restore the exact mandatory callback manifest", () => {
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_contract_contract_1",
      issues: [
        {
          path: "lifecycle.callbacks",
          code: "contradiction",
          message:
            'Generated mechanics must declare the "install" lifecycle callback.',
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
      "When lifecycle.callbacks is invalid, replace it with a list that begins with every exact mandatory lifecycle callback"
    );
    expect(prompt).toContain(
      "Never remove install during repair"
    );
  });

  it("tells invalid private-state repair to use one exact compatible value type everywhere", () => {
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_contract_contract_1",
      issues: [
        {
          path: "privateState.0.initialValue",
          code: "invalid_value",
          message:
            'Private state "last_shot_time" initial value does not match declared type "integer".',
        },
        {
          path: "scenarios.0.setup.1.value",
          code: "invalid_value",
          message:
            'Scenario state value does not match the declared type for "last_shot_time".',
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
      "When invalid_value affects privateState or a scenario state value, replace every incompatible declaration, setup, and state_equals value"
    );
    expect(prompt).toContain(
      "For an integer timestamp, deadline, or cooldown sentinel, use a finite integer such as -1 or 0; never use null, false, a numeric string, or a non-finite marker"
    );
  });

  it("aligns failed pre-install state setup with the exact private-state initial value", () => {
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_contract_source_1",
      issues: [
        {
          path: "evaluation.scenarios.cooldown.setup.1",
          code: "setup_observation_failed",
          message:
            'Scenario setup 1 "state_equals" failed. Assertion: {"kind":"state_equals","stateId":"last_shot_time","value":0}. Actual: -1.',
        },
      ],
      invalidatedArtifactIds: ["source_candidate_initial_1"],
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

    expect(prompt).toContain(
      "Scenario setup is evaluated before the install callback"
    );
    expect(prompt).toContain(
      "For setup_observation_failed on state_equals, replace the setup value with the exact matching privateState initialValue"
    );
    expect(prompt).toContain(
      "do not change generated source to manufacture the setup state"
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
