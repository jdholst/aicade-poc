import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  createMechanicCapabilityGrant,
  validateGeneratedMechanicContract,
  type AdmittedGeneratedMechanicRequest,
  type GeneratedMechanicContractValidationResult,
  type GeneratedMechanicContract,
  type GeneratedMechanicReferenceCatalog,
  type GeneratedMechanicResourceBudget,
  type MechanicCapabilityGrant,
  type MechanicIntent,
} from "@/game-spec";
import { isMechanicExecutionRealmAdapterAuthentic } from "@/runtime/mechanics/mechanic-execution-realm-adapter-authenticity";
import type { MechanicExecutionRealmAdapter } from "@/runtime/mechanics/mechanic-execution-realm";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "@/runtime/mechanics/phase-9-mechanic-resource-policy";
import {
  isMechanicSourceGenerationAvailable,
  type RuntimeAndContractFoundationGateResult,
} from "@/service/runtime-and-contract-foundation-gate";
import type { OpenAIModelId } from "@/utils/openai-utils";

import {
  MechanicSourceGenerationProviderError,
  type MechanicSourceGenerationProvider,
  type MechanicSourceGenerationProviderEvidence,
} from "./mechanic-source-generation-provider";
import {
  createMechanicSourceGenerationContract,
  createMechanicSourceGenerationGrant,
  createMechanicSourceGenerationResolution,
} from "./mechanic-source-generation-prompt";
import {
  buildAndExecuteGeneratedMechanicSource,
  type BuildAndExecuteGeneratedMechanicSourceInput,
  type BuildAndExecuteGeneratedMechanicSourceResult,
} from "./mechanic-source-generation-service";

export const MECHANIC_SOURCE_GENERATION_TASK_ROUTE =
  "mechanic_source_generation.primary";

export type MechanicSourceAdmissionIssue = Readonly<{
  path:
    | "foundationGateResult"
    | "input"
    | "intent.id"
    | "admittedRequest.constraintSet"
    | "contract.intentId"
    | "contract.capabilityVersion"
    | "grant.capabilityVersion"
    | "grant.capabilities"
    | "resourceBudget.profileId"
    | "resourceBudget"
    | "realmAdapter";
  code:
    | "foundation_gate_required"
    | "invalid_upstream_artifacts"
    | "realm_adapter_mismatch";
  message: string;
}>;

export type MechanicSourceAdmissionEvidence = Readonly<{
  stage: "source_admission";
  code:
    | "foundation_gate_required"
    | "invalid_upstream_artifacts"
    | "realm_adapter_mismatch";
  issues: readonly MechanicSourceAdmissionIssue[];
}>;

export type GenerateBuildAndExecuteMechanicSourceInput = Omit<
  BuildAndExecuteGeneratedMechanicSourceInput,
  "candidate" | "execution"
> & {
  foundationGateResult: RuntimeAndContractFoundationGateResult | undefined;
  intent: MechanicIntent;
  admittedRequest: AdmittedGeneratedMechanicRequest;
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  resourceBudget: GeneratedMechanicResourceBudget;
  realmAdapter: MechanicExecutionRealmAdapter;
  execution: Omit<
    BuildAndExecuteGeneratedMechanicSourceInput["execution"],
    "resourceBudget"
  >;
  model: OpenAIModelId;
  providerCredential: string;
  provider: MechanicSourceGenerationProvider;
  signal?: AbortSignal;
};

export type GenerateBuildAndExecuteMechanicSourceResult =
  | BuildAndExecuteGeneratedMechanicSourceResult
  | Readonly<{
      success: false;
      evidence:
        | MechanicSourceAdmissionEvidence
        | MechanicSourceGenerationProviderEvidence
        | Extract<
            GeneratedMechanicContractValidationResult,
            { success: false }
          >["evidence"];
    }>;

export async function generateBuildAndExecuteMechanicSource(
  input: GenerateBuildAndExecuteMechanicSourceInput
): Promise<GenerateBuildAndExecuteMechanicSourceResult> {
  const { foundationGateResult } = input;
  if (!isMechanicSourceGenerationAvailable(foundationGateResult)) {
    return admissionFailure("foundation_gate_required", {
      path: "foundationGateResult",
      code: "foundation_gate_required",
      message:
        "Generated mechanic source requires the live authenticated passing Runtime and Contract Foundation Gate result.",
    });
  }
  if (!foundationGateResult || foundationGateResult.status !== "passed") {
    return admissionFailure("foundation_gate_required", {
      path: "foundationGateResult",
      code: "foundation_gate_required",
      message:
        "Generated mechanic source requires the live authenticated passing Runtime and Contract Foundation Gate result.",
    });
  }
  if (!matchesPhase9ResourceBudget(input.resourceBudget)) {
    return admissionFailure("invalid_upstream_artifacts", {
      path: "resourceBudget",
      code: "invalid_upstream_artifacts",
      message:
        "Mechanic source execution requires the exact immutable Phase 9 resource budget.",
    });
  }

  let snapshot: ReturnType<typeof snapshotMechanicSourceInput>;
  try {
    snapshot = snapshotMechanicSourceInput(input);
  } catch (error) {
    return admissionFailure("invalid_upstream_artifacts", {
      path: "input",
      code: "invalid_upstream_artifacts",
      message:
        error instanceof Error
          ? `Mechanic source admission could not snapshot its inputs: ${error.message}`
          : "Mechanic source admission could not snapshot its inputs.",
    });
  }

  const upstreamIssue = validateUpstreamArtifacts(snapshot);
  if (upstreamIssue) {
    return admissionFailure("invalid_upstream_artifacts", upstreamIssue);
  }

  if (
    !isMechanicExecutionRealmAdapterAuthentic(input.realmAdapter) ||
    input.realmAdapter.id !==
      foundationGateResult.evidence.realmConformance.candidateId
  ) {
    return admissionFailure("realm_adapter_mismatch", {
      path: "realmAdapter",
      code: "realm_adapter_mismatch",
      message:
        "Generated mechanic source must execute through the authentic realm adapter selected by the passing foundation gate.",
    });
  }

  const canonicalConstraintSet = snapshotJson(
    PHASE_9_GENERATION_CONSTRAINT_SET
  );
  const canonicalResourceBudget = snapshotJson(
    PHASE_9_MECHANIC_RESOURCE_BUDGET
  );
  const contractValidation = validateGeneratedMechanicContract({
    input: snapshot.contract,
    constraintSet: canonicalConstraintSet,
    referenceCatalog: snapshot.referenceCatalog,
    resourceBudget: canonicalResourceBudget,
  });
  if (!contractValidation.success) {
    return contractValidation;
  }
  const acceptedContract = deepFreeze(contractValidation.data);
  const grantCreation = createMechanicCapabilityGrant({
    contract: acceptedContract,
    constraintSet: canonicalConstraintSet,
  });
  if (!grantCreation.success) {
    return admissionFailure("invalid_upstream_artifacts", {
      path: "grant.capabilities",
      code: "invalid_upstream_artifacts",
      message:
        grantCreation.evidence.issues[0]?.message ??
        "The accepted contract could not produce an exact capability grant.",
    });
  }
  const canonicalGrant = snapshotJson(grantCreation.data);
  if (!sameJson(snapshot.grant, canonicalGrant)) {
    return admissionFailure("invalid_upstream_artifacts", {
      path: "grant.capabilities",
      code: "invalid_upstream_artifacts",
      message:
        "Mechanic source generation requires the exact canonical capability grant derived from the accepted contract.",
    });
  }
  const sourceContract = snapshotJson(
    createMechanicSourceGenerationContract(acceptedContract)
  );
  const sourceResolution = snapshotJson(
    createMechanicSourceGenerationResolution(
      snapshot.admittedRequest.resolution
    )
  );
  const sourceGrant = snapshotJson(
    createMechanicSourceGenerationGrant(canonicalGrant)
  );

  let candidate: unknown;
  try {
    candidate = await input.provider({
      intent: snapshot.intent,
      resolution: sourceResolution,
      constraintSet: canonicalConstraintSet,
      contract: sourceContract,
      grant: sourceGrant,
      referenceCatalog: snapshot.referenceCatalog,
      resourceBudget: canonicalResourceBudget,
      model: input.model,
      providerCredential: input.providerCredential,
      taskRoute: MECHANIC_SOURCE_GENERATION_TASK_ROUTE,
      ...(input.signal ? { signal: input.signal } : {}),
    });
  } catch (error) {
    if (error instanceof MechanicSourceGenerationProviderError) {
      return { success: false, evidence: error.evidence };
    }
    return {
      success: false,
      evidence: {
        stage: "source_generation",
        code: "provider_failure",
        issues: Object.freeze([
          Object.freeze({
            path: "provider" as const,
            code: "provider_failure" as const,
            message:
              error instanceof Error
                ? error.message
                : "Mechanic source provider failed.",
          }),
        ]),
      },
    };
  }

  return buildAndExecuteGeneratedMechanicSource({
    candidate,
    contract: acceptedContract,
    grant: canonicalGrant,
    referenceCatalog: snapshot.referenceCatalog,
    realmAdapter: input.realmAdapter,
    execution: {
      ...snapshot.execution,
      resourceBudget: canonicalResourceBudget,
    },
  });
}

function snapshotMechanicSourceInput(
  input: GenerateBuildAndExecuteMechanicSourceInput
) {
  const capabilityHost = input.execution.capabilityHost;
  const bindingAuthority = input.execution.bindingAuthority;
  return Object.freeze({
    intent: snapshotJson(input.intent),
    admittedRequest: snapshotJson(input.admittedRequest),
    contract: snapshotJson(input.contract),
    grant: snapshotJson(input.grant),
    referenceCatalog: snapshotJson(input.referenceCatalog),
    resourceBudget: snapshotJson(input.resourceBudget),
    execution: Object.freeze({
      id: input.execution.id,
      callbackId: input.execution.callbackId,
      config: snapshotJson(input.execution.config),
      ...(input.execution.lifecycleInput !== undefined
        ? { lifecycleInput: snapshotJson(input.execution.lifecycleInput) }
        : {}),
      bindings: Object.freeze(
        input.execution.bindings.map((binding) =>
          Object.freeze({
            id: binding.id,
            cardinality: binding.cardinality,
            handles: Object.freeze([...binding.handles]),
          })
        )
      ),
      ...(bindingAuthority
        ? {
            bindingAuthority,
          }
        : {}),
      capabilityHost: Object.freeze({
        invoke: capabilityHost.invoke.bind(capabilityHost),
      }),
      seed: input.execution.seed,
    }),
  });
}

function validateUpstreamArtifacts(
  input: ReturnType<typeof snapshotMechanicSourceInput>
): MechanicSourceAdmissionIssue | undefined {
  const { intent, admittedRequest, contract, grant, resourceBudget } = input;
  if (!sameJson(admittedRequest.constraintSet, PHASE_9_GENERATION_CONSTRAINT_SET)) {
    return {
      path: "admittedRequest.constraintSet",
      code: "invalid_upstream_artifacts",
      message:
        "Mechanic source generation requires the exact immutable Phase 9 Generation Constraint Set.",
    };
  }
  if (admittedRequest.resolution.intentId !== intent.id) {
    return {
      path: "intent.id",
      code: "invalid_upstream_artifacts",
      message:
        "Accepted intent does not match the admitted generated-mechanic request.",
    };
  }
  if (contract.intentId !== intent.id) {
    return {
      path: "contract.intentId",
      code: "invalid_upstream_artifacts",
      message: "Generated Mechanic Contract does not match the accepted intent.",
    };
  }
  if (
    contract.capabilityVersion !==
    admittedRequest.constraintSet.capabilityVersion
  ) {
    return {
      path: "contract.capabilityVersion",
      code: "invalid_upstream_artifacts",
      message:
        "Generated Mechanic Contract capability version does not match the admitted constraint set.",
    };
  }
  if (grant.capabilityVersion !== contract.capabilityVersion) {
    return {
      path: "grant.capabilityVersion",
      code: "invalid_upstream_artifacts",
      message:
        "Mechanic Capability Grant version does not match the accepted contract.",
    };
  }
  if (
    resourceBudget.profileId !==
    admittedRequest.constraintSet.resourceBudgetProfile
  ) {
    return {
      path: "resourceBudget.profileId",
      code: "invalid_upstream_artifacts",
      message:
        "Mechanic Resource Budget does not match the admitted constraint set profile.",
    };
  }
  if (!matchesPhase9ResourceBudget(resourceBudget)) {
    return {
      path: "resourceBudget",
      code: "invalid_upstream_artifacts",
      message:
        "Mechanic source execution requires the exact immutable Phase 9 resource budget.",
    };
  }
  return undefined;
}

function matchesPhase9ResourceBudget(
  resourceBudget: GeneratedMechanicResourceBudget
): boolean {
  return (
    Object.keys(PHASE_9_MECHANIC_RESOURCE_BUDGET) as Array<
      keyof GeneratedMechanicResourceBudget
    >
  ).every(
    (key) => resourceBudget[key] === PHASE_9_MECHANIC_RESOURCE_BUDGET[key]
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function snapshotJson<Value>(value: Value): Value {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

function admissionFailure(
  code: MechanicSourceAdmissionEvidence["code"],
  issue: MechanicSourceAdmissionIssue
): { success: false; evidence: MechanicSourceAdmissionEvidence } {
  return {
    success: false,
    evidence: {
      stage: "source_admission",
      code,
      issues: Object.freeze([Object.freeze(issue)]),
    },
  };
}
