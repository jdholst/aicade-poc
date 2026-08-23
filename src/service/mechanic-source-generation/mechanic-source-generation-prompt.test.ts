import { describe, expect, it } from "vitest";

import {
  MECHANIC_CAPABILITY_VERSION,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  mechanicCapabilityRegistry,
  type GeneratedMechanicContract,
  type GeneratedMechanicResolution,
  type MechanicCapabilityGrant,
  type MechanicIntent,
} from "@/game-spec";

import {
  createMechanicSourceGenerationGrant,
  createMechanicSourceGenerationResolution,
  createMechanicSourceGenerationSystemPrompt,
} from "./mechanic-source-generation-prompt";

describe("createMechanicSourceGenerationSystemPrompt", () => {
  it("documents only the accepted generic source boundary and excludes evaluator scaffolding", () => {
    const intent = createIntent();
    const contract: GeneratedMechanicContract = {
      ...createContract(),
      lifecycle: {
        callbacks: ["install", "logical_action"],
        fixedStep: true,
        dispose: true,
      },
    };
    const grant = createGrant("state_write");
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract,
      grant: createMechanicSourceGenerationGrant(grant),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      evaluatorTests: "EVALUATOR_ONLY_SENTINEL",
    } as Parameters<typeof createMechanicSourceGenerationSystemPrompt>[0] & {
      evaluatorTests: string;
    });

    expect(prompt).toContain(JSON.stringify(intent, null, 2));
    expect(prompt).toContain('"id": "generic_contract"');
    expect(prompt).toContain('"id": "state_write"');
    expect(prompt).toContain(
      '"expression": "capabilities.state.write"'
    );
    expect(prompt).not.toContain('"member": "state.write"');
    expect(prompt).toContain(
      '"asyncSignature": "(stateId: MechanicStateId, value: JsonValue) => Promise<void>"'
    );
    expect(prompt).toContain("generated_mechanic_source_candidate/v1");
    expect(prompt).toContain("config");
    expect(prompt).toContain("bindings");
    expect(prompt).toContain("lifecycleInput");
    expect(prompt).toContain(
      `Exact callback-scope identifiers JSON:\n${JSON.stringify(
        ["capabilities", "bindings", "config", "lifecycleInput", "input"],
        null,
        2
      )}`
    );
    expect(prompt).toContain(
      "input is a readonly compatibility alias for lifecycleInput"
    );
    expect(prompt).toContain(
      "may callbacks pass an exact declared private-state ID to that documented method"
    );
    expect(prompt).toContain(
      "read the current action, event, schedule, or fixed-step input only from lifecycleInput"
    );
    expect(prompt).toContain('"logical_action": {');
    expect(prompt).toContain('"gameplay_event": {');
    expect(prompt).toContain('"inputPorts": [');
    expect(prompt).toContain('"portId": "accepted_input"');
    expect(prompt).toContain('"kind": "boolean"');
    expect(prompt).toContain("The trusted host owns lifecycle scheduling");
    expect(prompt).toContain(
      `Exact required source callback kinds JSON:\n${JSON.stringify(
        ["install", "logical_action", "fixed_step", "dispose"],
        null,
        2
      )}`
    );
    expect(prompt).toContain(
      "The callbacks array must contain exactly one callback for each kind in that exact checklist"
    );
    expect(prompt).toContain(
      '"MechanicObjectObservation": "Readonly<{ active: boolean; kind: string; position: Readonly<{ x: number; y: number }>; properties: Readonly<Record<string, JsonValue>>; velocity: Readonly<{ x: number; y: number }> }>"'
    );
    expect(prompt).toContain(
      '"MechanicSpatialQuery": "Readonly<{ center: Readonly<{ x: number; y: number }>; radius: number; active?: boolean; objectKinds?: readonly string[]; ownership?: \\\"any\\\" | \\\"bound\\\" | \\\"owned\\\" }>"'
    );
    expect(prompt).toContain(
      "Owned-object initial JSON may use bounded position, velocity, shape, dimensions, color, and immutable properties"
    );
    expect(prompt).toContain(
      "When accepted spatial behavior requires an owned object to originate at a bound actor"
    );
    expect(prompt).toContain(
      "pass that exact observed position in the capabilities.objects.create initial JSON"
    );
    expect(prompt).toContain(
      "Call capabilities.objects.destroy only with a mechanic-owned handle"
    );
    expect(prompt).toContain(
      'Never destroy a binding handle or a handle returned by ownership "any" or "bound"'
    );
    expect(prompt).toContain(
      "There is no movementDirection, direction, or facing field"
    );
    expect(prompt).toContain(
      "derive movement direction from velocity.x and velocity.y"
    );
    expect(prompt).not.toContain('"fixedStep": {');
    expect(prompt).toContain("Return one candidate Generated Mechanic Source");
    expect(prompt).toContain(
      "Every granted capability must be called through its documented capabilities expression"
    );
    expect(prompt).toContain(
      "Before returning, verify that source contains at least one reachable awaited call to every exact granted capability expression"
    );
    expect(prompt).toContain(
      "For object_motion_write, call capabilities.objects.writeMotion on the mechanic-owned handle"
    );
    expect(prompt).toContain(
      "Initial velocity supplied only inside capabilities.objects.create does not count as object_motion_write use"
    );
    expect(prompt).toContain(
      "Each host lifecycle operation has a hard maximum of 16 capability-operation units"
    );
    expect(prompt).toContain(
      "Repeated capability calls and loop iterations multiply their documented operation costs"
    );
    expect(prompt).toContain(
      "An advance_time scenario step accumulates the costs of every scheduled and fixed-step callback it dispatches"
    );
    expect(prompt).toContain(
      "an over-budget repair must remove, combine, or avoid capability calls"
    );
    expect(prompt).toContain(
      "The active synchronous work inside each callback must finish within maximumCallbackMilliseconds of 8"
    );
    expect(prompt).toContain(
      "The retained top-down host advances generated simulation time in whole deterministic milliseconds"
    );
    expect(prompt).toContain(
      "Every value written to an integer private-state field must remain a finite integer"
    );
    expect(prompt).toContain(
      "For a contract deadline state named *_until"
    );
    expect(prompt).toContain(
      "reject only while now < deadline; equality accepts the action"
    );
    expect(prompt).toContain(
      "Never index an array or readonly array with a variable, even when TypeScript annotates it as number"
    );
    expect(prompt).toContain(
      "iterate with for...of, or use a literal index such as [0] only after explicitly checking the array is nonempty"
    );
    expect(prompt).not.toContain("EVALUATOR_ONLY_SENTINEL");
    expect(prompt).not.toContain('"scenarios"');
    expect(prompt).not.toContain("install_value");
    expect(prompt).not.toMatch(/projectile|hazard|proximity|navigation/i);
    expect(prompt).not.toContain("External Acceptance Observations");
    expect(prompt).not.toContain("evaluator tests");
  });

  it("names forbidden constructor authority and turns its rejection into exact repair guidance", () => {
    const intent = createIntent();
    const baseInput = {
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(createGrant("state_write")),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget" as const,
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary" as const,
    };

    const initialPrompt = createMechanicSourceGenerationSystemPrompt(baseInput);

    expect(initialPrompt).toContain(
      'Never access, destructure, alias, or derive "constructor", "__proto__", or "prototype"'
    );
    expect(initialPrompt).toContain(
      "Use direct granted capability expressions and ordinary local values instead of constructor or prototype reflection"
    );

    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "callbacks.2.source",
          code: "forbidden_source_authority",
          message:
            'Generated mechanic source cannot reference forbidden authority "constructor".',
        },
        {
          path: "callbacks.1.source",
          code: "forbidden_source_authority",
          message:
            "Generated mechanic source cannot use runtime-computed property access. Use a named property or a provably numeric array index instead.",
        },
      ],
      invalidatedArtifactIds: [],
    };
    const repairPrompt = createMechanicSourceGenerationSystemPrompt({
      ...baseInput,
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(repairPrompt).toContain(JSON.stringify(repair, null, 2));
    expect(repairPrompt).toContain(
      'For forbidden_source_authority "constructor", remove every constructor or prototype-chain access'
    );
    expect(repairPrompt).toContain(
      "Do not hide the access behind a computed property, destructuring, an alias, a cast, or Object reflection"
    );
    expect(repairPrompt).toContain(
      "For a runtime-computed property access rejection, replace every dynamic lookup or computed destructuring key"
    );
    expect(repairPrompt).toContain(
      "Use the direct named property from the accepted source context or a provably numeric array index"
    );
    expect(repairPrompt).toContain(
      "replace array[indexVariable] loops with for (const item of array)"
    );
    expect(repairPrompt).toContain(
      "use array[0] only after an explicit nonempty check"
    );
  });

  it("turns callback CPU budget failures into bounded-work repair guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "scenarios.shoot_travel_and_expire",
          code: "resource_limit_exceeded",
          message: "Resource callback_milliseconds exceeded 8 with 9.",
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(createGrant("state_write")),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(JSON.stringify(repair, null, 2));
    expect(prompt).toContain(
      "For a callback_milliseconds resource failure, reduce active synchronous work in the named callback"
    );
    expect(prompt).toContain(
      "Use one bounded for...of pass with an early exit where accepted behavior permits"
    );
    expect(prompt).toContain(
      "Do not raise or reinterpret maximumCallbackMilliseconds"
    );
  });

  it("includes exact upstream invalidation feedback and requires the correlated source candidate ID", () => {
    const intent = createIntent();
    const repair = {
      trigger: "upstream_invalidation" as const,
      failureAttemptId: "generation_run_source_contract_2",
      issues: [],
      invalidatedArtifactIds: ["source_candidate_initial_1"],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(createGrant("state_write")),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(JSON.stringify(repair, null, 2));
    expect(prompt).toContain(
      "Required top-level candidate artifact ID: generation_run_source_source_repair_2"
    );
    expect(prompt).toContain(
      "Its issues array is intentionally empty; regenerate from the current accepted upstream inputs"
    );
  });

  it("turns unknown state and event names into exact callback-scope repair guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "callbacks.1.source",
          code: "type_failure",
          message: "Cannot find name 'state'.",
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(createGrant("state_write")),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(JSON.stringify(repair, null, 2));
    expect(prompt).toContain(
      "For Cannot find name 'state', use only a granted capabilities.state method with an exact declared private-state ID"
    );
    expect(prompt).toContain(
      "For Cannot find name 'event', use lifecycleInput or its readonly input alias"
    );
  });

  it("turns JSON-value comparison failures into exact narrowing guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "callbacks.1.source",
          code: "type_failure",
          message:
            "Operator '<' cannot be applied to types 'number' and 'string | number | boolean | { readonly [key: string]: JsonValue; } | readonly JsonValue[]'.",
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(createGrant("state_write")),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(
      "Object-observation properties and generic lifecycle payload values are JsonValue"
    );
    expect(prompt).toContain(
      'narrow a JsonValue first with typeof value === "number"'
    );
    expect(prompt).toContain(
      "For an operator type failure involving JsonValue, replace the invalid arithmetic or comparison"
    );
  });

  it("turns absent capability-group failures into exact grant-compliance guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "callbacks.0.source",
          code: "type_failure",
          message:
            "Property 'state' does not exist on type 'Readonly<{ readonly objects: Readonly<unknown>; }>'.",
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(createGrant("object_read")),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(
      "capabilities exposes exactly and only the groups and members rendered in the granted capability documentation"
    );
    expect(prompt).toContain(
      "Private-state initial values are installed by the trusted host before the install callback"
    );
    expect(prompt).toContain(
      "For Property 'state' does not exist on capabilities, remove every capabilities.state call"
    );
  });

  it("turns non-owned destruction failures into exact ownership repair guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "scenarios.projectile_lifetime_cleanup",
          code: "evaluation_failure",
          message: "Only mechanic-owned objects can be destroyed through this host.",
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(
        createGrant("object_create", "object_destroy", "spatial_query")
      ),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(JSON.stringify(repair, null, 2));
    expect(prompt).toContain(
      "For Only mechanic-owned objects can be destroyed, replace every invalid destroy argument"
    );
    expect(prompt).toContain(
      'ownership: "owned"'
    );
  });

  it("turns failed owned-object lifecycle deltas into exact interaction repair guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "evaluation.scenarios.transient.externalObservations.0",
          code: "external_observation_failed",
          message:
            'Evaluator-authored observation 0 "owned_object_lifecycle_after_action" failed. Actual: {"deltas":[{"activeDelta":0,"actorOriginCreationsDelta":0,"createdDelta":1,"destroyedDelta":1,"simulatedDistanceTraveledDelta":12,"targetInteractionsDelta":0}]}.',
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(
        createGrant(
          "object_read",
          "object_create",
          "object_motion_write",
          "object_destroy",
          "spatial_query"
        )
      ),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(
      "For an owned_object_lifecycle_after_action failure, inspect every reported lifecycle delta"
    );
    expect(prompt).toContain("targetInteractionsDelta");
    expect(prompt).toContain("actorOriginCreationsDelta");
    expect(prompt).toContain(
      "read the actor binding and pass its observed position into capabilities.objects.create"
    );
    expect(prompt).toContain('ownership: "bound"');
    expect(prompt).toContain(
      "apply a finite nonzero capabilities.objects.writeMotion mutation to the first returned target handle"
    );
  });

  it("turns opaque-handle property access into capability-bound observation guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "callbacks.1.source",
          code: "type_failure",
          message:
            "Property 'velocity' does not exist on type 'Readonly<{ readonly [mechanicObjectHandleBrand]: \"MechanicObjectHandle\"; }>'.",
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(
        createGrant("object_motion_write", "spatial_query")
      ),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(
      "MechanicObjectHandle is an opaque identity token with no readable fields"
    );
    expect(prompt).toContain(
      "querySpatial returns opaque handles, not MechanicObjectObservation values"
    );
    expect(prompt).toContain(
      "For a Property access failure on MechanicObjectHandle"
    );
    expect(prompt).toContain(
      "Only when the exact grant includes capabilities.objects.read"
    );
    expect(prompt).toContain(
      "When object_read is absent, derive the finite mutation from accepted config, lifecycle input, or deterministic constants"
    );
  });

  it("turns cooldown timestamp drift into last-action and deadline guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "evaluation.scenarios.accepted.declaredObservations.0",
          code: "declared_observation_failed",
          message:
            'Model-declared observation 0 "state_equals" failed. Assertion: {"kind":"state_equals","stateId":"last_action_time","value":250}. Actual: 500.',
        },
        {
          path: "evaluation.scenarios.cooldown.externalObservations.0",
          code: "external_observation_failed",
          message:
            'Evaluator-authored observation 0 "owned_object_lifecycle_after_action" failed. Actual: {"deltas":[{"archetypeId":"transient_effect","activeDelta":1,"createdDelta":1,"destroyedDelta":0,"simulatedDistanceTraveledDelta":0,"targetInteractionsDelta":0}]}.',
        },
        {
          path: "evaluation.scenarios.initial_action.declaredObservations.0",
          code: "declared_observation_failed",
          message:
            'Model-declared observation 0 "state_equals" failed. Assertion: {"kind":"state_equals","stateId":"cooldown_until","value":250}. Actual: 0.',
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(
        createGrant(
          "object_create",
          "object_motion_write",
          "object_destroy",
          "spatial_query",
          "state_read",
          "state_write",
          "time_read",
          "time_schedule"
        )
      ),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain("For a cooldown timestamp mismatch");
    expect(prompt).toContain(
      "a last_*_time state stores the current simulation time only when the action is accepted"
    );
    expect(prompt).toContain(
      "reject while now - lastAcceptedTime is less than the cooldown duration"
    );
    expect(prompt).toContain(
      "never write now + cooldown duration into last_*_time"
    );
    expect(prompt).toContain(
      "Do not use time.schedule to implement a timestamp-enforced cooldown"
    );
    expect(prompt).toContain(
      "schedule the accepted delayed lifecycle behavior with its own duration"
    );
    expect(prompt).toContain(
      "For a cooldown deadline boundary mismatch involving *_until"
    );
    expect(prompt).toContain(
      "reject only when now < deadline and accept when now === deadline"
    );
    expect(prompt).toContain(
      "after acceptance write now + duration into the deadline state"
    );
  });

  it("turns a mismatched scheduled callback literal into exact callback-ID repair guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "callbacks.1.source",
          code: "type_failure",
          message:
            'Argument of type \'"expire_projectiles"\' is not assignable to parameter of type \'"scheduled"\'.',
        },
      ],
      invalidatedArtifactIds: [],
    };
    const contract: GeneratedMechanicContract = {
      ...createContract(),
      lifecycle: {
        callbacks: ["install", "logical_action", "scheduled"],
        fixedStep: false,
        dispose: true,
      },
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract,
      grant: createMechanicSourceGenerationGrant(createGrant("time_schedule")),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(
      "Set every callback id exactly equal to its callback kind"
    );
    expect(prompt).toContain(
      'For a time.schedule callback-ID type failure, pass the literal "scheduled"'
    );
    expect(prompt).toContain(
      'never a behavior label such as "expire_projectiles"'
    );
  });

  it("turns unused motion grants into exact source-use repair guidance", () => {
    const intent = createIntent();
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_source_source_1",
      issues: [
        {
          path: "grant.capabilities.2",
          code: "unused_capability",
          message:
            'Granted capability "object_motion_write" has no verified source use and would provide unjustified authority.',
        },
      ],
      invalidatedArtifactIds: [],
    };
    const prompt = createMechanicSourceGenerationSystemPrompt({
      intent,
      resolution: createMechanicSourceGenerationResolution(
        createResolution(intent)
      ),
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
      contract: createContract(),
      grant: createMechanicSourceGenerationGrant(
        createGrant("object_create", "object_motion_write")
      ),
      referenceCatalog: {},
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
      taskRoute: "mechanic_source_generation.primary",
      generationAttempt: {
        generationRunId: "generation_run_source",
        stage: "source",
        attemptNumber: 2,
        kind: "repair",
        candidateArtifactId: "generation_run_source_source_repair_2",
        repair,
      },
    });

    expect(prompt).toContain(JSON.stringify(repair, null, 2));
    expect(prompt).toContain(
      "For an unused_capability failure, add a behaviorally necessary reachable awaited call to the exact documented expression"
    );
    expect(prompt).toContain(
      "When object_motion_write is unused, call capabilities.objects.writeMotion"
    );
  });
});

function createIntent(): MechanicIntent {
  return {
    id: "intent_generic_state",
    summary: "Initialize a private value during installation.",
    triggers: ["installation"],
    actors: [],
    targets: [],
    behaviors: ["initialize_private_value"],
    ownedObjects: [],
    stateChanges: ["private_value_initialized"],
    temporalRules: [],
    spatialRules: [],
    constraints: [],
    configuration: ["initial_value"],
    connections: [],
    references: [],
    outcomes: ["private_value_observable"],
    requiredCapabilities: ["state_write"],
    ambiguities: [],
  };
}

function createResolution(intent: MechanicIntent): GeneratedMechanicResolution {
  return {
    kind: "generated_mechanic",
    intentId: intent.id,
    candidateBuiltInTypes: [],
    assumptions: [],
    coverage: {
      coveredRequirements: [],
      uncoveredRequirements: [
        {
          category: "behavior",
          value: "initialize_private_value",
          coveredBy: [],
        },
      ],
    },
  };
}

function createContract(): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "generic_contract",
    intentId: "intent_generic_state",
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    behavior: {
      summary: "Initialize one private value.",
      triggers: ["installation"],
      outcomes: ["private_value_initialized"],
    },
    config: {
      kind: "object",
      fields: [
        {
          key: "initialValue",
          required: true,
          value: { kind: "integer", minimum: 0, maximum: 10 },
        },
      ],
    },
    bindings: [],
    ownedObjects: [],
    privateState: [
      { id: "private_value", valueType: "integer", initialValue: 0 },
    ],
    lifecycle: { callbacks: ["install"], fixedStep: false, dispose: true },
    ports: [
      {
        id: "accepted_input",
        direction: "input",
        payload: { kind: "boolean" },
      },
    ],
    capabilities: ["state_write"],
    resourceExpectations: {
      maximumOwnedObjects: 0,
      maximumOperationsPerTick: 1,
      maximumScheduledCallbacks: 0,
      maximumSubscriptions: 0,
      maximumSignalsPerTick: 0,
      maximumStateBytes: 128,
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 2,
    },
    scenarios: [
      {
        id: "install_value",
        seed: 1729,
        setup: [],
        steps: [{ kind: "advance_time", milliseconds: 1 }],
        observations: [
          { kind: "state_equals", stateId: "private_value", value: 1 },
        ],
      },
    ],
  };
}

function createGrant(...capabilityIds: string[]): MechanicCapabilityGrant {
  return {
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    capabilities: capabilityIds.map((capabilityId, index) => ({
      ...mechanicCapabilityRegistry.capabilities.find(
        (capability) => capability.id === capabilityId
      )!,
      justification: {
        kind: "contract_declaration" as const,
        path: `capabilities.${index}`,
      },
    })),
  };
}
