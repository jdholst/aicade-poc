import {
  createMechanicCapabilityGrant,
  validateGeneratedMechanicContract,
  type AdmittedGeneratedMechanicRequest,
  type GeneratedMechanicContract,
  type GeneratedMechanicContractValidationResult,
  type GeneratedMechanicReferenceCatalog,
  type GeneratedMechanicResourceBudget,
  type MechanicCapabilityGrant,
  type MechanicCapabilityGrantResult,
  type MechanicIntent,
} from "@/game-spec";
import type { OpenAIModelId } from "@/utils/openai-utils";

export const MECHANIC_CONTRACT_GENERATION_TASK_ROUTE =
  "mechanic_contract_generation.primary";

export type MechanicContractGenerationProviderInput = {
  intent: MechanicIntent;
  resolution: AdmittedGeneratedMechanicRequest["resolution"];
  constraintSet: AdmittedGeneratedMechanicRequest["constraintSet"];
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  resourceBudget: GeneratedMechanicResourceBudget;
  model: OpenAIModelId;
  providerCredential: string;
  taskRoute: typeof MECHANIC_CONTRACT_GENERATION_TASK_ROUTE;
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

export class MechanicContractGenerationProviderError extends Error {
  readonly evidence: MechanicContractGenerationProviderEvidence;

  constructor(evidence: MechanicContractGenerationProviderEvidence) {
    super(evidence.issues[0]?.message ?? "Mechanic contract generation failed.");
    this.name = "MechanicContractGenerationProviderError";
    this.evidence = evidence;
  }
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
        | MechanicContractGenerationProviderEvidence;
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
    return {
      success: false,
      evidence: {
        stage: "contract_generation",
        code: "provider_failure",
        issues: [
          {
            path: "provider",
            code: "provider_failure",
            message,
          },
        ],
      },
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

  const grantResult = createMechanicCapabilityGrant({
    contract: contractValidation.data,
    constraintSet,
  });

  if (!grantResult.success) {
    return grantResult;
  }

  return {
    success: true,
    data: {
      contract: contractValidation.data,
      grant: grantResult.data,
    },
  };
}
