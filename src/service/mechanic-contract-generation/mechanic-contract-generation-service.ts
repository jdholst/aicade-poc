import {
  createMechanicCapabilityGrant,
  validateGeneratedMechanicContract,
  type AdmittedGeneratedMechanicRequest,
  type ArtifactScopedRepairAttemptReceipt,
  type GeneratedMechanicContract,
  type GeneratedMechanicContractValidationResult,
  type GeneratedMechanicReferenceCatalog,
  type GeneratedMechanicResourceBudget,
  type MechanicCapabilityGrant,
  type MechanicCapabilityGrantResult,
  type MechanicIntent,
  type GenerationRun,
} from "@/game-spec";
import type { OpenAIModelId } from "@/utils/openai-utils";

export const MECHANIC_CONTRACT_GENERATION_TASK_ROUTE =
  "mechanic_contract_generation.primary";

export type MechanicContractGenerationAttempt = Readonly<{
  generationRunId: GenerationRun["id"];
  stage: "contract";
  attemptNumber: ArtifactScopedRepairAttemptReceipt["attemptNumber"];
  kind: ArtifactScopedRepairAttemptReceipt["kind"];
  candidateArtifactId: GeneratedMechanicContract["id"];
  repair?: ArtifactScopedRepairAttemptReceipt["repair"];
}>;

export type MechanicContractGenerationProviderInput = {
  intent: MechanicIntent;
  resolution: AdmittedGeneratedMechanicRequest["resolution"];
  constraintSet: AdmittedGeneratedMechanicRequest["constraintSet"];
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  resourceBudget: GeneratedMechanicResourceBudget;
  model: OpenAIModelId;
  providerCredential: string;
  taskRoute: typeof MECHANIC_CONTRACT_GENERATION_TASK_ROUTE;
  generationAttempt?: MechanicContractGenerationAttempt;
  signal?: AbortSignal;
};

export type MechanicContractGenerationProvider = (
  input: MechanicContractGenerationProviderInput
) => Promise<unknown>;

type ContractValidationEvidence = Extract<
  GeneratedMechanicContractValidationResult,
  { success: false }
>["evidence"];

type CapabilityGrantEvidence = Extract<
  MechanicCapabilityGrantResult,
  { success: false }
>["evidence"];

export type MechanicContractGenerationProviderFailureCode =
  | "invalid_provider_output"
  | "provider_cancelled"
  | "provider_failure"
  | "provider_timeout";

export type MechanicContractGenerationProviderEvidence = {
  stage: "contract_generation";
  code: MechanicContractGenerationProviderFailureCode;
  issues: {
    path: "provider";
    code: MechanicContractGenerationProviderFailureCode;
    message: string;
  }[];
};

export type MechanicContractGenerationRequestEvidence = {
  stage: "contract_generation";
  code: "invalid_generation_request";
  issues: {
    path: "resolution.intentId";
    code: "intent_mismatch";
    message: string;
  }[];
};

export class MechanicContractGenerationProviderError extends Error {
  readonly evidence: MechanicContractGenerationProviderEvidence;

  constructor(evidence: MechanicContractGenerationProviderEvidence) {
    super(evidence.issues[0]?.message ?? "Mechanic contract generation failed.");
    this.name = "MechanicContractGenerationProviderError";
    this.evidence = evidence;
  }
}

export function createMechanicContractProviderError(
  code: MechanicContractGenerationProviderFailureCode,
  message: string
) {
  return new MechanicContractGenerationProviderError({
    stage: "contract_generation",
    code,
    issues: [
      {
        path: "provider",
        code,
        message,
      },
    ],
  });
}

export type MechanicContractGenerationResult =
  | {
      success: true;
      data: {
        contract: GeneratedMechanicContract;
        grant: MechanicCapabilityGrant;
      };
    }
  | {
      success: false;
      evidence:
        | ContractValidationEvidence
        | CapabilityGrantEvidence
        | MechanicContractGenerationProviderEvidence
        | MechanicContractGenerationRequestEvidence;
    };

export type GenerateMechanicContractInput = {
  intent: MechanicIntent;
  admittedRequest: AdmittedGeneratedMechanicRequest;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  resourceBudget: GeneratedMechanicResourceBudget;
  model: OpenAIModelId;
  providerCredential: string;
  provider: MechanicContractGenerationProvider;
  signal?: AbortSignal;
};

export async function generateMechanicContract({
  intent,
  admittedRequest,
  referenceCatalog,
  resourceBudget,
  model,
  providerCredential,
  provider,
  signal,
}: GenerateMechanicContractInput): Promise<MechanicContractGenerationResult> {
  const { resolution, constraintSet } = admittedRequest;

  if (resolution.intentId !== intent.id) {
    return {
      success: false,
      evidence: {
        stage: "contract_generation",
        code: "invalid_generation_request",
        issues: [
          {
            path: "resolution.intentId",
            code: "intent_mismatch",
            message: `Admitted resolution intent "${resolution.intentId}" does not match accepted intent "${intent.id}".`,
          },
        ],
      },
    };
  }

  let candidate: unknown;

  try {
    candidate = await provider({
      intent,
      resolution,
      constraintSet,
      referenceCatalog,
      resourceBudget,
      model,
      providerCredential,
      taskRoute: MECHANIC_CONTRACT_GENERATION_TASK_ROUTE,
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error instanceof MechanicContractGenerationProviderError) {
      return { success: false, evidence: error.evidence };
    }

    const message =
      error instanceof Error
        ? error.message
        : "Mechanic contract provider request failed.";
    const providerError = createMechanicContractProviderError(
      "provider_failure",
      message
    );
    return {
      success: false,
      evidence: providerError.evidence,
    };
  }

  const contractValidation = validateGeneratedMechanicContract({
    input: candidate,
    constraintSet,
    referenceCatalog,
    resourceBudget,
  });

  if (!contractValidation.success) {
    return contractValidation;
  }

  if (contractValidation.data.intentId !== intent.id) {
    return {
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: [
          {
            path: "intentId",
            code: "contradiction",
            message: `Generated mechanic contract intent "${contractValidation.data.intentId}" does not match accepted intent "${intent.id}".`,
          },
        ],
      },
    };
  }

  const trustedContract = withTrustedIntentLineage(
    contractValidation.data,
    intent
  );

  const grantResult = createMechanicCapabilityGrant({
    contract: trustedContract,
    constraintSet,
  });

  if (!grantResult.success) {
    return grantResult;
  }

  const intentLineageIssues = generatedContractIntentLineageIssues(
    intent,
    trustedContract
  );
  if (intentLineageIssues.length > 0) {
    return {
      success: false,
      evidence: {
        stage: "contract_validation",
        code: "invalid_generated_mechanic_contract",
        issues: intentLineageIssues,
      },
    };
  }

  return {
    success: true,
    data: {
      contract: trustedContract,
      grant: grantResult.data,
    },
  };
}

function withTrustedIntentLineage(
  contract: GeneratedMechanicContract,
  intent: MechanicIntent
): GeneratedMechanicContract {
  return deepFreeze({
    ...contract,
    intentLineage: {
      actors: [...intent.actors],
      targets: [...intent.targets],
      behaviors: [...intent.behaviors],
      stateChanges: [...intent.stateChanges],
      temporalRules: [...intent.temporalRules],
      spatialRules: [...intent.spatialRules],
      constraints: [...intent.constraints],
      connections: intent.connections.map((connection) => ({ ...connection })),
      references: intent.references.map((reference) => ({ ...reference })),
    },
  });
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function generatedContractIntentLineageIssues(
  intent: MechanicIntent,
  contract: GeneratedMechanicContract
): ContractValidationEvidence["issues"] {
  const issues: ContractValidationEvidence["issues"] = [];
  appendMissingIntentValues({
    accepted: intent.requiredCapabilities,
    actual: contract.capabilities,
    code: "contradiction",
    path: "capabilities",
    label: "required capability",
    issues,
  });
  appendMissingIntentValues({
    accepted: intent.triggers,
    actual: contract.behavior.triggers,
    code: "contradiction",
    path: "behavior.triggers",
    label: "accepted trigger",
    issues,
  });
  appendMissingIntentValues({
    accepted: intent.outcomes,
    actual: contract.behavior.outcomes,
    code: "contradiction",
    path: "behavior.outcomes",
    label: "accepted outcome",
    issues,
  });
  const boundEntityIds = new Set(
    contract.bindings.flatMap((binding) =>
      binding.referenceKind === "entity" ? binding.objectIds : []
    )
  );
  for (const reference of intent.references) {
    if (reference.kind === "entity" && !boundEntityIds.has(reference.id)) {
      issues.push({
        path: "bindings",
        code: "contradiction",
        message: `Generated mechanic contract must bind routed entity reference "${reference.id}" from the accepted intent.`,
      });
    }
  }
  const configuredFields = new Map(
    contract.config.kind === "object"
      ? contract.config.fields.map((field) => [field.key, field] as const)
      : []
  );
  for (const configuration of intent.configuration) {
    const field = configuredFields.get(configuration.key);
    if (!field) {
      issues.push({
        path: "config",
        code: "contradiction",
        message: `Generated mechanic contract must declare routed configuration key "${configuration.key}" from the accepted intent.`,
      });
      continue;
    }
    const declaredDefault =
      "default" in field.value ? field.value.default : undefined;
    if (!Object.is(declaredDefault, configuration.value)) {
      issues.push({
        path: `config.fields.${configuration.key}.value.default`,
        code: "contradiction",
        message: `Generated mechanic contract configuration "${configuration.key}" must materialize the exact accepted value ${JSON.stringify(configuration.value)} as its default.`,
      });
    }
  }
  appendTransientLifetimeFinalCountIssues(intent, contract, issues);
  appendUnsupportedBoundDeactivationIssues(contract, issues);

  return issues;
}

function appendUnsupportedBoundDeactivationIssues(
  contract: GeneratedMechanicContract,
  issues: ContractValidationEvidence["issues"]
): void {
  contract.scenarios.forEach((scenario, scenarioIndex) => {
    scenario.observations.forEach((observation, observationIndex) => {
      if (
        observation.kind !== "binding_property" ||
        observation.property !== "active" ||
        !(
          (observation.operator === "equals" && observation.value === false) ||
          (observation.operator === "not_equals" && observation.value === true)
        )
      ) {
        return;
      }
      issues.push({
        path: `scenarios.${scenarioIndex}.observations.${observationIndex}`,
        code: "contradiction",
        message: `Generated mechanic scenario "${scenario.id}" cannot require bound object "${observation.bindingId}" to become inactive because generated source cannot deactivate bound objects. Observe an admitted mutable motion property or rely on evaluator-authored target-interaction evidence instead.`,
      });
    });
  });
}

function appendTransientLifetimeFinalCountIssues(
  intent: MechanicIntent,
  contract: GeneratedMechanicContract,
  issues: ContractValidationEvidence["issues"]
): void {
  const requiredCapabilities = new Set(intent.requiredCapabilities);
  if (
    intent.ownedObjects.length === 0 ||
    !["object_create", "object_motion_write", "object_destroy"].every(
      (capabilityId) => requiredCapabilities.has(capabilityId)
    )
  ) {
    return;
  }
  const acceptedLifetimes = intent.configuration.flatMap(
    ({ key, value }) =>
      key.endsWith("_lifetime_ms") &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0
        ? [value]
        : []
  );
  const acceptedLifetime =
    acceptedLifetimes.length > 0 ? Math.min(...acceptedLifetimes) : undefined;
  const ownedObjectIds = new Set(contract.ownedObjects.map(({ id }) => id));

  contract.scenarios.forEach((scenario, scenarioIndex) => {
    const actionIndex = scenario.steps.findIndex(
      (step) => step.kind === "dispatch_action"
    );
    if (actionIndex < 0) {
      return;
    }
    const advancedMilliseconds = scenario.steps
      .slice(actionIndex + 1)
      .reduce(
        (total, step) =>
          step.kind === "advance_time" ? total + step.milliseconds : total,
        0
      );
    if (advancedMilliseconds <= 0) {
      return;
    }
    scenario.observations.forEach((observation, observationIndex) => {
      if (
        observation.kind !== "owned_object_count" ||
        !ownedObjectIds.has(observation.archetypeId) ||
        observation.operator === "at_most" ||
        observation.value === 0
      ) {
        return;
      }
      const message =
        acceptedLifetime !== undefined &&
        advancedMilliseconds >= acceptedLifetime
          ? `Generated mechanic scenario "${scenario.id}" advances ${advancedMilliseconds}ms after its action, meeting or exceeding the accepted transient lifetime ${acceptedLifetime}ms. Its final owned-object count cannot require an active "${observation.archetypeId}"; declare final count 0 or end the scenario before cleanup.`
          : `Generated mechanic scenario "${scenario.id}" is a time-advancing scenario and cannot require a positive final count for transient owned object "${observation.archetypeId}" because target interaction or cleanup may validly destroy it before final observations. Prove positive creation in a separate dispatch-only scenario and use time-advancing scenarios for travel, interaction, and cleanup.`;
      issues.push({
        path: `scenarios.${scenarioIndex}.observations.${observationIndex}`,
        code: "contradiction",
        message,
      });
    });
  });
}

function appendMissingIntentValues({
  accepted,
  actual,
  code,
  path,
  label,
  issues,
}: Readonly<{
  accepted: readonly string[];
  actual: readonly string[];
  code: ContractValidationEvidence["issues"][number]["code"];
  path: string;
  label: string;
  issues: ContractValidationEvidence["issues"];
}>): void {
  const actualValues = new Set(actual);
  for (const value of accepted) {
    if (!actualValues.has(value)) {
      issues.push({
        path,
        code,
        message: `Generated mechanic contract must retain ${label} "${value}" from the accepted intent.`,
      });
    }
  }
}
