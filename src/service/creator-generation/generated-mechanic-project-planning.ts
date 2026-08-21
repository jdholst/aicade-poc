import {
  MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
  TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS,
  createInitialGamePack,
  generationRunSchema,
  parseGamePack,
  type ArtifactScopedRepairIssue,
  type GamePack,
  type GeneratedMechanicContract,
  type GeneratedMechanicReferenceCatalog,
  type MechanicConfigDslValue,
  type MechanicIntent,
  type StableId,
  type TopDownGameSpec,
} from "@/game-spec";
import type { JsonValue } from "@/game-spec/game-spec-schema";

import type { GeneratedMechanicFinalGameSpecAssemblyPlan } from "./generated-mechanic-final-game-spec-assembler";

export type GeneratedMechanicProjectPlanningFailure = Readonly<{
  success: false;
  evidence: Readonly<{
    responsibleStage: "contract" | "finalGameSpec";
    issues: readonly ArtifactScopedRepairIssue[];
  }>;
}>;

export type GeneratedMechanicTopDownHostAdmissionResult =
  | Readonly<{ success: true; data: GeneratedMechanicContract }>
  | GeneratedMechanicProjectPlanningFailure;

export type GeneratedMechanicConfigMaterializationResult =
  | Readonly<{ success: true; data: JsonValue }>
  | GeneratedMechanicProjectPlanningFailure;

export type CreateGeneratedMechanicAssemblyPlanResult =
  | Readonly<{
      success: true;
      data: GeneratedMechanicFinalGameSpecAssemblyPlan;
    }>
  | GeneratedMechanicProjectPlanningFailure;

export type ValidateGeneratedMechanicTopDownHostAdmissionInput = Readonly<{
  contract: GeneratedMechanicContract;
  catalog: GeneratedMechanicReferenceCatalog;
  intent: MechanicIntent;
}>;

export type MaterializeGeneratedMechanicConfigInput = Readonly<{
  config: MechanicConfigDslValue;
  catalog: GeneratedMechanicReferenceCatalog;
}>;

export type CreateGeneratedMechanicAssemblyPlanInput = Readonly<{
  attemptNumber: number;
  catalog: GeneratedMechanicReferenceCatalog;
  contract: GeneratedMechanicContract;
  generationRunId: StableId;
  intent: MechanicIntent;
}>;

export type CreateGeneratedMechanicCandidateGamePackInput = Readonly<{
  createdAt: string;
  finalGameSpec: TopDownGameSpec;
  gamePackId: StableId;
  generationRunId: StableId;
  mechanicId: StableId;
  requestSummary: string;
}>;

export function createGeneratedMechanicReferenceCatalog(
  gameSpec: TopDownGameSpec
): GeneratedMechanicReferenceCatalog {
  const catalog = Object.create(null) as Record<string, readonly StableId[]>;
  Object.defineProperties(catalog, {
    action: enumerableFrozenIds(gameSpec.controls.map(({ action }) => action)),
    asset: enumerableFrozenIds(gameSpec.assets.map(({ id }) => id)),
    entity: enumerableFrozenIds(gameSpec.entities.map(({ id }) => id)),
    objective: enumerableFrozenIds(gameSpec.objectives.map(({ id }) => id)),
    region: enumerableFrozenIds(
      gameSpec.template.config.scenes.flatMap(({ layout }) =>
        layout.regions.map(({ id }) => id)
      )
    ),
    scene: enumerableFrozenIds(
      gameSpec.template.config.scenes.map(({ id }) => id)
    ),
  });
  return Object.freeze(catalog);
}

export function validateGeneratedMechanicTopDownHostAdmission({
  contract,
  catalog,
  intent,
}: ValidateGeneratedMechanicTopDownHostAdmissionInput): GeneratedMechanicTopDownHostAdmissionResult {
  const issues: ArtifactScopedRepairIssue[] = [];
  const supportedCapabilities = new Set<string>(
    TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITY_IDS
  );
  const routedEntityIds = [
    ...new Set(
      intent.references.flatMap((reference) =>
        reference.kind === "entity" ? [reference.id] : []
      )
    ),
  ];
  const exactRoutedEntityBindings = contract.bindings.filter(
    (binding) =>
      binding.referenceKind === "entity" &&
      binding.cardinality === "one" &&
      binding.objectIds.length === 1 &&
      routedEntityIds.includes(binding.objectIds[0]!)
  );
  if (
    routedEntityIds.length === 0 ||
    exactRoutedEntityBindings.length === 0 ||
    routedEntityIds.some(
      (entityId) =>
        !exactRoutedEntityBindings.some(
          (binding) => binding.objectIds[0] === entityId
        )
    )
  ) {
    issues.push({
      path: "contract.bindings",
      code: "missing_observable_entity_binding",
      message:
        "The retained top-down generated-mechanic host requires one exact single-entity binding for every routed intent entity reference.",
    });
  }
  if (
    contract.bindings.length !== routedEntityIds.length ||
    exactRoutedEntityBindings.length !== contract.bindings.length ||
    new Set(
      exactRoutedEntityBindings.map((binding) => binding.objectIds[0]!)
    ).size !== routedEntityIds.length
  ) {
    issues.push({
      path: "contract.bindings",
      code: "non_exact_routed_entity_binding_set",
      message:
        "The retained top-down generated-mechanic host requires exactly one single-entity binding per routed intent entity reference and rejects supporting, duplicate, or otherwise non-routed bindings.",
    });
  }
  const hasMotionEffect = contract.capabilities.includes("object_motion_write");
  if (
    !hasMotionEffect ||
    !intent.requiredCapabilities.includes("object_motion_write")
  ) {
    issues.push({
      path: "contract.capabilities",
      code: "missing_independent_effect_capability",
      message:
        "The retained top-down generated-mechanic host requires routed intent and contract capability object_motion_write so evaluator-authored evidence can prove an independently visible effect.",
    });
  }
  const supportedIntentTriggers = new Set(["install", "logical_action"]);
  const lifecycleCallbacks = new Set<string>(contract.lifecycle.callbacks);
  const admittedActionIds = ownCatalogIds(catalog, "action") ?? [];
  const inputConnections = intent.connections.filter(
    ({ direction }) => direction === "input"
  );
  const routedActionId =
    intent.connections.length === 1 &&
    inputConnections.length === 1 &&
    admittedActionIds.includes(inputConnections[0]!.port)
      ? inputConnections[0]!.port
      : undefined;
  if (!routedActionId) {
    issues.push({
      path: "intent.connections",
      code: "missing_exact_routed_action_connection",
      message:
        "The retained top-down generated-mechanic host requires exactly one routed intent input connection backed by an active Game Spec action.",
    });
  }
  if (
    intent.triggers.length === 0 ||
    intent.triggers.some((trigger) => !supportedIntentTriggers.has(trigger)) ||
    intent.triggers.some(
      (trigger) => !lifecycleCallbacks.has(trigger)
    ) ||
    !intent.triggers.includes("logical_action")
  ) {
    issues.push({
      path: "intent.triggers",
      code: "unsupported_runtime_trigger",
      message:
        'The retained top-down generated-mechanic host currently admits only canonical "install" and "logical_action" routed triggers, requires logical_action for independent causal proof, and requires every routed trigger to have a matching lifecycle callback.',
    });
  }
  if (contract.ports.length > 0) {
    issues.push({
      path: "contract.ports",
      code: "unsupported_runtime_ports",
      message:
        "The retained top-down generated-mechanic host does not admit mechanic ports.",
    });
  }
  contract.capabilities.forEach((capabilityId, index) => {
    if (!supportedCapabilities.has(capabilityId)) {
      issues.push({
        path: `contract.capabilities.${index}`,
        code: "unsupported_runtime_capability",
        message: `The retained top-down generated-mechanic host does not implement capability "${capabilityId}".`,
      });
    }
  });
  contract.bindings.forEach((binding, index) => {
    if (binding.referenceKind !== "entity") {
      issues.push({
        path: `contract.bindings.${index}.referenceKind`,
        code: "unsupported_runtime_binding",
        message:
          "The retained top-down generated-mechanic host admits only entity object bindings.",
      });
      return;
    }
    const admittedEntityIds = ownCatalogIds(catalog, "entity");
    if (
      !admittedEntityIds ||
      binding.objectIds.some((objectId) => !admittedEntityIds.includes(objectId))
    ) {
      issues.push({
        path: `contract.bindings.${index}.objectIds`,
        code: "unsupported_runtime_binding",
        message:
          "Every retained top-down object binding must resolve through the exact entity reference catalog.",
      });
    }
  });
  if (contract.lifecycle.callbacks.includes("gameplay_event")) {
    issues.push({
      path: "contract.lifecycle.callbacks",
      code: "unsupported_runtime_gameplay_events",
      message:
        "The retained top-down generated-mechanic host has no trusted gameplay-event source.",
    });
  }
  if (contract.lifecycle.callbacks.includes("logical_action")) {
    const scenarioActionSteps = contract.scenarios.map((scenario) =>
      scenario.steps.filter(
        (step): step is Extract<typeof step, { kind: "dispatch_action" }> =>
          step.kind === "dispatch_action"
      )
    );
    if (
      scenarioActionSteps.some(
        (steps) =>
          steps.length !== 1 ||
          !routedActionId ||
          steps[0]!.actionId !== routedActionId
      )
    ) {
      issues.push({
        path: "contract.scenarios",
        code: "routed_action_scenario_mismatch",
        message:
          "Every retained-host evaluator scenario must dispatch the one exact routed intent input action exactly once.",
      });
    }
    if (scenarioActionSteps.some((steps) => steps.length === 0)) {
      issues.push({
        path: "contract.scenarios",
        code: "unsupported_runtime_trigger",
        message:
          "Every retained-host evaluator scenario must dispatch an exact active Game Spec action so visible evidence is causally downstream of the routed trigger.",
      });
    }
    scenarioActionSteps.flat().forEach((step, index) => {
      if (!admittedActionIds.includes(step.actionId)) {
        issues.push({
          path: `contract.scenarios.actions.${index}`,
          code: "unsupported_runtime_binding",
          message: `Logical action "${step.actionId}" is not backed by an exact active Game Spec control action.`,
        });
      }
    });
  }

  return issues.length > 0
    ? failure("contract", issues)
    : snapshot({ success: true as const, data: contract });
}

export function materializeGeneratedMechanicConfig({
  config,
  catalog,
}: MaterializeGeneratedMechanicConfigInput): GeneratedMechanicConfigMaterializationResult {
  const issues: ArtifactScopedRepairIssue[] = [];
  const value = materializeConfigValue(config, catalog, "config", issues);
  return issues.length > 0 || value === undefined
    ? failure("finalGameSpec", issues)
    : snapshot({ success: true as const, data: value });
}

export function createGeneratedMechanicAssemblyPlan({
  attemptNumber,
  catalog,
  contract,
  generationRunId,
  intent,
}: CreateGeneratedMechanicAssemblyPlanInput): CreateGeneratedMechanicAssemblyPlanResult {
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
    return failure("finalGameSpec", [
      {
        path: "attemptNumber",
        code: "invalid_attempt_number",
        message: "Generated mechanic assembly requires a positive attempt number.",
      },
    ]);
  }
  if (contract.intentId !== intent.id) {
    return failure("contract", [
      {
        path: "contract.intentId",
        code: "intent_contract_identity_mismatch",
        message:
          "Generated mechanic assembly requires the exact routed intent and contract lineage.",
      },
    ]);
  }
  const admission = validateGeneratedMechanicTopDownHostAdmission({
    contract,
    catalog,
    intent,
  });
  if (!admission.success) {
    return admission;
  }
  const config = materializeGeneratedMechanicConfig({
    config: contract.config,
    catalog,
  });
  if (!config.success) {
    return config;
  }
  if (
    config.data === null ||
    Array.isArray(config.data) ||
    typeof config.data !== "object"
  ) {
    return failure("finalGameSpec", [
      {
        path: "contract.config",
        code: "invalid_mechanic_config_root",
        message:
          "Top-down generated mechanic assembly requires an object Config DSL root.",
      },
    ]);
  }
  const activeReferences = activeReferencesForPlan(
    intent,
    contract,
    catalog
  );
  if (!activeReferences.success) {
    return activeReferences;
  }
  const attemptSuffix = `attempt_${attemptNumber}`;
  return snapshot({
    success: true as const,
    data: {
      finalGameSpecId: `final_game_spec_${generationRunId}_${attemptSuffix}`,
      extensionId: `extension_${generationRunId}`,
      extensionVersionId: `extension_${generationRunId}_${attemptSuffix}`,
      mechanicId: `mechanic_${generationRunId}`,
      mechanicType: "generated_mechanic",
      config: config.data as Readonly<Record<string, JsonValue>>,
      bindings: contract.bindings,
      activeReferences: activeReferences.data,
      mechanicConnections: {
        schemaVersion: MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
        connections: [],
      },
    },
  });
}

export function createGeneratedMechanicCandidateGamePack({
  createdAt,
  finalGameSpec,
  gamePackId,
  generationRunId,
  mechanicId,
  requestSummary,
}: CreateGeneratedMechanicCandidateGamePackInput): GamePack {
  const generationRun = generationRunSchema.parse({
    id: generationRunId,
    operationType: "generate",
    status: "running",
    createdAt,
    startedAt: createdAt,
    request: {
      summary: requestSummary,
      targetGameSpecId: finalGameSpec.id,
    },
    runtimeKind: "phaser",
    templateId: finalGameSpec.template.id,
    mechanicIds: [mechanicId],
    attempts: [],
  });
  const gamePack = createInitialGamePack({
    createdAt,
    gameSpec: finalGameSpec,
    id: gamePackId,
    runtimeKind: "phaser",
  });
  return snapshot(
    parseGamePack({ ...gamePack, generationRuns: [generationRun] })
  );
}

function enumerableFrozenIds(ids: readonly StableId[]): PropertyDescriptor {
  return {
    configurable: false,
    enumerable: true,
    writable: false,
    value: Object.freeze([...ids]),
  };
}

function materializeConfigValue(
  config: MechanicConfigDslValue,
  catalog: GeneratedMechanicReferenceCatalog,
  path: string,
  issues: ArtifactScopedRepairIssue[]
): JsonValue | undefined {
  if (config.kind === "boolean") {
    return config.default ?? false;
  }
  if (config.kind === "number") {
    return config.default ?? config.minimum;
  }
  if (config.kind === "integer") {
    return config.default ?? Math.ceil(config.minimum);
  }
  if (config.kind === "string") {
    return config.default ?? "_".repeat(config.minimumLength);
  }
  if (config.kind === "enum") {
    return config.default ?? config.values[0];
  }
  if (config.kind === "stable_id") {
    const admittedIds = ownCatalogIds(catalog, config.referenceKind);
    const value = config.default ?? admittedIds?.[0];
    if (!value || !admittedIds?.includes(value)) {
      issues.push({
        path,
        code: "missing_config_reference",
        message: `Config materialization requires one trusted "${config.referenceKind}" reference.`,
      });
      return undefined;
    }
    return value;
  }
  if (config.kind === "collection") {
    const result: JsonValue[] = [];
    for (let index = 0; index < config.minimumItems; index += 1) {
      const item = materializeConfigValue(
        config.item,
        catalog,
        `${path}.${index}`,
        issues
      );
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  const result = Object.create(null) as Record<string, JsonValue>;
  for (const field of config.fields) {
    if (!field.required && !hasExplicitDefault(field.value)) {
      continue;
    }
    const value = materializeConfigValue(
      field.value,
      catalog,
      `${path}.${field.key}`,
      issues
    );
    if (value !== undefined) {
      Object.defineProperty(result, field.key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value,
      });
    }
  }
  return result;
}

function hasExplicitDefault(value: MechanicConfigDslValue): boolean {
  return "default" in value && value.default !== undefined;
}

function activeReferencesForPlan(
  intent: MechanicIntent,
  contract: GeneratedMechanicContract,
  catalog: GeneratedMechanicReferenceCatalog
):
  | Readonly<{
      success: true;
      data: GeneratedMechanicFinalGameSpecAssemblyPlan["activeReferences"];
    }>
  | GeneratedMechanicProjectPlanningFailure {
  const idsByKind: Record<
    MechanicIntent["references"][number]["kind"],
    StableId[]
  > = {
    asset: [],
    entity: [],
    objective: [],
    region: [],
    scene: [],
  };
  const issues: ArtifactScopedRepairIssue[] = [];
  intent.references.forEach((reference, index) => {
    const admittedIds = ownCatalogIds(catalog, reference.kind);
    if (!admittedIds?.includes(reference.id)) {
      issues.push({
        path: `intent.references.${index}`,
        code: "unknown_mechanic_reference",
        message: `Intent reference "${reference.id}" is not present in the exact "${reference.kind}" catalog.`,
      });
      return;
    }
    pushUnique(idsByKind[reference.kind], reference.id);
  });
  contract.bindings.forEach((binding) => {
    if (binding.referenceKind !== "entity") {
      return;
    }
    binding.objectIds.forEach((objectId) =>
      pushUnique(idsByKind.entity, objectId)
    );
  });
  return issues.length > 0
    ? failure("finalGameSpec", issues)
    : snapshot({
        success: true as const,
        data: {
          entityIds: idsByKind.entity,
          objectiveIds: idsByKind.objective,
          sceneIds: idsByKind.scene,
          regionIds: idsByKind.region,
          assetIds: idsByKind.asset,
        },
      });
}

function ownCatalogIds(
  catalog: GeneratedMechanicReferenceCatalog,
  referenceKind: string
): readonly StableId[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(catalog, referenceKind)) {
    return undefined;
  }
  const value = (catalog as Readonly<Record<string, unknown>>)[referenceKind];
  return Array.isArray(value) && value.every((id) => typeof id === "string")
    ? (value as readonly StableId[])
    : undefined;
}

function pushUnique(values: StableId[], value: StableId): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function failure(
  responsibleStage: "contract" | "finalGameSpec",
  issues: readonly ArtifactScopedRepairIssue[]
): GeneratedMechanicProjectPlanningFailure {
  return snapshot({
    success: false as const,
    evidence: { responsibleStage, issues },
  });
}

function snapshot<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(JSON.stringify(value)) as Value);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
