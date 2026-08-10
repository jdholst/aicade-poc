import type {
  AdmittedGeneratedMechanicRequest,
  GeneratedMechanicContract,
  GeneratedMechanicReferenceCatalog,
  GeneratedMechanicResourceBudget,
  MechanicCapabilityGrant,
  MechanicIntent,
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
  buildAndExecuteGeneratedMechanicSource,
  type BuildAndExecuteGeneratedMechanicSourceInput,
  type BuildAndExecuteGeneratedMechanicSourceResult,
} from "./mechanic-source-generation-service";

export const MECHANIC_SOURCE_GENERATION_TASK_ROUTE =
  "mechanic_source_generation.primary";

export type MechanicSourceAdmissionIssue = Readonly<{
  path:
    | "foundationGateResult"
    | "intent.id"
    | "contract.intentId"
    | "contract.capabilityVersion"
    | "grant.capabilityVersion"
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
        | MechanicSourceGenerationProviderEvidence;
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

  const upstreamIssue = validateUpstreamArtifacts(input);
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

  let candidate: unknown;
  try {
    candidate = await input.provider({
      intent: input.intent,
      resolution: input.admittedRequest.resolution,
      constraintSet: input.admittedRequest.constraintSet,
      contract: input.contract,
      grant: input.grant,
      referenceCatalog: input.referenceCatalog,
      resourceBudget: input.resourceBudget,
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
    contract: input.contract,
    grant: input.grant,
    referenceCatalog: input.referenceCatalog,
    realmAdapter: input.realmAdapter,
    execution: {
      ...input.execution,
      resourceBudget: input.resourceBudget,
    },
  });
}

function validateUpstreamArtifacts(
  input: GenerateBuildAndExecuteMechanicSourceInput
): MechanicSourceAdmissionIssue | undefined {
  const { intent, admittedRequest, contract, grant, resourceBudget } = input;
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
