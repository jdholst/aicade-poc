import { z } from "zod";

import {
  jsonValueSchema,
  stableIdSchema,
} from "../game-spec-schema";
import { topDownGameSpecSchema } from "../top-down-spec-schema";
import { generatedMechanicContractSchema } from "./generated-mechanic-contract";
import { mechanicCapabilityGrantExactlyMatchesContract } from "./mechanic-capability-registry";

export const GENERATED_MECHANIC_FINAL_GAME_SPEC_VERSION =
  "generated_mechanic_final_game_spec/v1" as const;
export const ACCEPTED_GENERATED_MECHANIC_ARTIFACT_VERSION =
  "accepted_generated_mechanic_artifact/v1" as const;
export const PERSISTED_GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION =
  "generated_mechanic_source_artifact/v1" as const;
export const GENERATED_MECHANIC_RUNTIME_POLICY_VERSION =
  "generated_mechanic_runtime_policy/v1" as const;
export const TOP_DOWN_PHASER_GENERATED_MECHANIC_HOST_PROFILE_ID =
  "top_down_phaser_generated_mechanic_host/v1" as const;
export const GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID =
  "ses_compartment_dedicated_worker_2_2_0" as const;
export const GENERATED_MECHANIC_RESOURCE_BUDGET_PROFILE_ID =
  "phase_9_fixed_budget" as const;
export const GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS = 16 as const;

const isoDateTimeSchema = z.string().datetime({ offset: true });
const nonnegativeIntegerSchema = z.number().int().nonnegative();

const persistedMechanicCapabilityGrantSchema = z
  .object({
    capabilityVersion: z.string().min(1).max(80),
    capabilities: z.array(
      z
        .object({
          id: stableIdSchema,
          description: z.string().min(1).max(500),
          authoring: z
            .object({
              member: z.string().min(1).max(120),
              signature: z.string().min(1).max(500),
            })
            .strict(),
          runtimeOperation: stableIdSchema,
          evaluation: z
            .object({
              actions: z.array(stableIdSchema),
              observations: z.array(stableIdSchema),
              scenarioInputs: z.array(stableIdSchema).optional(),
            })
            .strict(),
          resourceCosts: z
            .object({
              operationsPerTick: nonnegativeIntegerSchema,
              ownedObjects: nonnegativeIntegerSchema.optional(),
              scheduledCallbacks: nonnegativeIntegerSchema.optional(),
              subscriptions: nonnegativeIntegerSchema.optional(),
              signalsPerTick: nonnegativeIntegerSchema.optional(),
            })
            .strict(),
          requiresOpaqueHandle: z.boolean(),
          justification: z
            .object({
              kind: z.literal("contract_declaration"),
              path: z.string().min(1).max(240),
            })
            .strict(),
        })
        .strict()
    ),
  })
  .strict();

const generatedMechanicReferenceCatalogSchema = z.record(
  z.string(),
  z.array(stableIdSchema)
);

const generatedMechanicBindingSchema = z
  .object({
    id: stableIdSchema,
    referenceKind: stableIdSchema,
    cardinality: z.enum(["one", "many"]),
    objectIds: z.array(stableIdSchema).min(1),
  })
  .strict();

const TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITIES: ReadonlySet<string> =
  new Set([
  "object_read",
  "object_motion_write",
  "state_read",
  "state_write",
  "time_read",
  "random_next",
  "time_schedule",
  ]);

export type GeneratedMechanicProjectHostProfileIssue = Readonly<{
  path: string;
  code:
    | "unsupported_runtime_ports"
    | "unsupported_runtime_owned_objects"
    | "unsupported_runtime_capability"
    | "unsupported_runtime_binding"
    | "unsupported_runtime_gameplay_events";
  message: string;
}>;

export const generatedMechanicRuntimePolicySchema = z
  .object({
    schemaVersion: z.literal(GENERATED_MECHANIC_RUNTIME_POLICY_VERSION),
    hostProfileId: z.literal(
      TOP_DOWN_PHASER_GENERATED_MECHANIC_HOST_PROFILE_ID
    ),
    executionRealmCandidateId: z.literal(
      GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID
    ),
    resourceBudgetProfileId: z.literal(
      GENERATED_MECHANIC_RESOURCE_BUDGET_PROFILE_ID
    ),
    seed: z.number().int().min(0).max(0xffff_ffff),
    fixedStepIntervalMilliseconds: z
      .literal(GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS)
      .nullable(),
  })
  .strict();

export const generatedMechanicFinalGameSpecExtensionSchema = z
  .object({
    id: stableIdSchema,
    versionId: stableIdSchema,
    mechanicId: stableIdSchema,
    mechanicType: stableIdSchema,
    contractId: stableIdSchema,
    sourceArtifactId: stableIdSchema,
    capabilityVersion: z.string().min(1).max(80),
    config: jsonValueSchema,
    bindings: z.array(generatedMechanicBindingSchema),
  })
  .strict();

export const generatedMechanicFinalGameSpecSchema = z
  .object({
    schemaVersion: z.literal(GENERATED_MECHANIC_FINAL_GAME_SPEC_VERSION),
    id: stableIdSchema,
    gameSpec: topDownGameSpecSchema,
    extension: generatedMechanicFinalGameSpecExtensionSchema,
  })
  .strict();

export const persistedGeneratedMechanicSourceArtifactSchema = z
  .object({
    schemaVersion: z.literal(
      PERSISTED_GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION
    ),
    id: stableIdSchema,
    contractId: stableIdSchema,
    intentId: stableIdSchema,
    capabilityVersion: z.string().min(1).max(80),
    grant: persistedMechanicCapabilityGrantSchema,
    usedCapabilities: z.array(stableIdSchema),
    callbacks: z
      .array(
        z
          .object({
            id: stableIdSchema,
            kind: z.enum([
              "install",
              "logical_action",
              "gameplay_event",
              "scheduled",
              "fixed_step",
              "dispose",
            ]),
            sourceTypeScript: z.string().min(1).max(40_000),
            normalizedJavaScript: z.string().min(1).max(80_000),
          })
          .strict()
      )
      .min(1)
      .max(32),
    build: z
      .object({
        language: z.literal("typescript"),
        target: z.literal("es2020"),
        parsed: z.literal(true),
        typechecked: z.literal(true),
        compiled: z.literal(true),
        staticValidationTarget: z.literal("normalized_javascript"),
        staticValidationVersion: z.literal(
          "generated_mechanic_source_static_validation/v1"
        ),
      })
      .strict(),
  })
  .strict();

export const acceptedGeneratedMechanicArtifactSchema = z
  .object({
    schemaVersion: z.literal(ACCEPTED_GENERATED_MECHANIC_ARTIFACT_VERSION),
    id: stableIdSchema,
    extensionId: stableIdSchema,
    versionId: stableIdSchema,
    sourceGenerationRunId: stableIdSchema,
    acceptedAt: isoDateTimeSchema,
    finalGameSpecArtifactId: stableIdSchema,
    finalGameSpec: generatedMechanicFinalGameSpecSchema,
    gameSpecId: stableIdSchema,
    mechanicId: stableIdSchema,
    mechanicType: stableIdSchema,
    contract: generatedMechanicContractSchema,
    sourceArtifact: persistedGeneratedMechanicSourceArtifactSchema,
    runtimePolicy: generatedMechanicRuntimePolicySchema,
    config: jsonValueSchema,
    bindings: z.array(generatedMechanicBindingSchema),
    referenceCatalog: generatedMechanicReferenceCatalogSchema,
    buildId: stableIdSchema,
    checkpointId: stableIdSchema,
    validationEvidenceIds: z.array(stableIdSchema).min(1),
  })
  .strict()
  .superRefine((artifact, ctx) => {
    for (const hostIssue of generatedMechanicProjectHostProfileIssues({
      contract: artifact.contract,
      finalGameSpec: artifact.finalGameSpec,
      referenceCatalog: artifact.referenceCatalog,
    })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hostIssue.path.split("."),
        message: hostIssue.message,
      });
    }
    if (artifact.id !== artifact.versionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message:
          "Accepted generated mechanic artifact ID must be its immutable extension version ID.",
      });
    }
    const expectedFinalGameSpecExtension = {
      id: artifact.extensionId,
      versionId: artifact.versionId,
      mechanicId: artifact.mechanicId,
      mechanicType: artifact.mechanicType,
      contractId: artifact.contract.id,
      sourceArtifactId: artifact.sourceArtifact.id,
      capabilityVersion: artifact.contract.capabilityVersion,
      config: artifact.config,
      bindings: artifact.bindings,
    };
    if (
      artifact.finalGameSpec.id !== artifact.finalGameSpecArtifactId ||
      artifact.finalGameSpec.gameSpec.id !== artifact.gameSpecId ||
      JSON.stringify(artifact.finalGameSpec.extension) !==
        JSON.stringify(expectedFinalGameSpecExtension)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["finalGameSpec"],
        message:
          "Accepted artifact must retain the exact Final Game Spec and extension lineage it accepted.",
      });
    }
    if (artifact.sourceArtifact.contractId !== artifact.contract.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceArtifact", "contractId"],
        message: "Accepted source artifact must reference the persisted contract.",
      });
    }
    const expectedRuntimePolicy = createGeneratedMechanicRuntimePolicy({
      contract: artifact.contract,
      versionId: artifact.versionId,
    });
    if (
      JSON.stringify(artifact.runtimePolicy) !==
      JSON.stringify(expectedRuntimePolicy)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runtimePolicy"],
        message:
          "Accepted generated mechanic runtime policy must be the exact deterministic policy derived for its immutable version.",
      });
    }
    if (artifact.sourceArtifact.intentId !== artifact.contract.intentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceArtifact", "intentId"],
        message: "Accepted source artifact must retain the contract intent ID.",
      });
    }
    if (
      artifact.sourceArtifact.capabilityVersion !==
        artifact.contract.capabilityVersion ||
      artifact.sourceArtifact.grant.capabilityVersion !==
        artifact.contract.capabilityVersion
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceArtifact", "capabilityVersion"],
        message:
          "Accepted source artifact must use the contract capability version.",
      });
    }
    const contractCapabilityIds = [...artifact.contract.capabilities].sort();
    const usedCapabilityIds = [...artifact.sourceArtifact.usedCapabilities].sort();
    if (
      !mechanicCapabilityGrantExactlyMatchesContract(
        artifact.sourceArtifact.grant,
        artifact.contract
      ) ||
      JSON.stringify(usedCapabilityIds) !== JSON.stringify(contractCapabilityIds)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceArtifact", "grant"],
        message:
          "Accepted source artifact must retain the contract's exact least-authority capability grant and usage.",
      });
    }
    const bindingsById = new Map(
      artifact.bindings.map((binding) => [binding.id, binding])
    );
    if (
      bindingsById.size !== artifact.bindings.length ||
      artifact.bindings.length !== artifact.contract.bindings.length
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bindings"],
        message:
          "Accepted artifact must retain every contract binding exactly once.",
      });
    }
    artifact.contract.bindings.forEach((contractBinding) => {
      const binding = bindingsById.get(contractBinding.id);
      if (
        !binding ||
        binding.referenceKind !== contractBinding.referenceKind ||
        binding.cardinality !== contractBinding.cardinality ||
        JSON.stringify(binding.objectIds) !==
          JSON.stringify(contractBinding.objectIds)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bindings", contractBinding.id],
          message:
            "Accepted artifact binding must match its exact contract declaration.",
        });
        return;
      }
      const knownIds = Object.prototype.hasOwnProperty.call(
        artifact.referenceCatalog,
        binding.referenceKind
      )
        ? artifact.referenceCatalog[binding.referenceKind]
        : undefined;
      if (
        !knownIds ||
        binding.objectIds.some((objectId) => !knownIds.includes(objectId))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["referenceCatalog", binding.referenceKind],
          message:
            "Accepted artifact bindings must resolve through its trusted reference catalog.",
        });
      }
    });
  });

export function generatedMechanicProjectHostProfileIssues({
  contract,
  finalGameSpec,
  referenceCatalog,
}: Readonly<{
  contract: Pick<
    z.infer<typeof generatedMechanicContractSchema>,
    "bindings" | "capabilities" | "lifecycle" | "ownedObjects" | "ports"
  >;
  finalGameSpec: Pick<
    z.infer<typeof generatedMechanicFinalGameSpecSchema>,
    "gameSpec"
  >;
  referenceCatalog: Readonly<Record<string, readonly string[]>>;
}>): readonly GeneratedMechanicProjectHostProfileIssue[] {
  const issues: GeneratedMechanicProjectHostProfileIssue[] = [];
  if (
    contract.ports.length > 0 ||
    (finalGameSpec.gameSpec.mechanicConnections?.connections.length ?? 0) > 0
  ) {
    issues.push({
      path: "runtimePolicy.hostProfileId",
      code: "unsupported_runtime_ports",
      message:
        "The persisted top-down generated-mechanic host profile does not admit mechanic ports until a durable trusted port-owner profile is available.",
    });
  }
  if (contract.ownedObjects.length > 0) {
    issues.push({
      path: "runtimePolicy.hostProfileId",
      code: "unsupported_runtime_owned_objects",
      message:
        "The persisted top-down generated-mechanic host profile does not admit mechanic-owned objects until trusted object factories are available.",
    });
  }
  contract.capabilities.forEach((capabilityId, index) => {
    if (!TOP_DOWN_GENERATED_MECHANIC_SUPPORTED_CAPABILITIES.has(capabilityId)) {
      issues.push({
        path: `contract.capabilities.${index}`,
        code: "unsupported_runtime_capability",
        message: `The persisted top-down generated-mechanic host profile does not implement capability "${capabilityId}".`,
      });
    }
  });
  contract.bindings.forEach((binding, index) => {
    if (binding.referenceKind !== "entity") {
      issues.push({
        path: `contract.bindings.${index}.referenceKind`,
        code: "unsupported_runtime_binding",
        message:
          "The persisted top-down generated-mechanic host profile admits only entity object bindings.",
      });
    }
  });
  if (contract.lifecycle.callbacks.includes("gameplay_event")) {
    issues.push({
      path: "contract.lifecycle.callbacks",
      code: "unsupported_runtime_gameplay_events",
      message:
        "The persisted top-down generated-mechanic host profile does not admit gameplay-event callbacks until a durable trusted event-source profile is available.",
    });
  }
  if (contract.lifecycle.callbacks.includes("logical_action")) {
    const controlActionIds = new Set(
      finalGameSpec.gameSpec.controls.map(({ action }) => action)
    );
    const admittedActionIds = referenceCatalog.action ?? [];
    if (
      admittedActionIds.length === 0 ||
      admittedActionIds.some((actionId) => !controlActionIds.has(actionId))
    ) {
      issues.push({
        path: "referenceCatalog.action",
        code: "unsupported_runtime_binding",
        message:
          "Logical-action callbacks require trusted action references backed by active Final Game Spec controls.",
      });
    }
  }
  return Object.freeze(issues.map((issue) => Object.freeze(issue)));
}

export function createGeneratedMechanicRuntimePolicy({
  contract,
  versionId,
}: Readonly<{
  contract: Pick<
    z.infer<typeof generatedMechanicContractSchema>,
    "lifecycle"
  >;
  versionId: string;
}>) {
  return Object.freeze({
    schemaVersion: GENERATED_MECHANIC_RUNTIME_POLICY_VERSION,
    hostProfileId: TOP_DOWN_PHASER_GENERATED_MECHANIC_HOST_PROFILE_ID,
    executionRealmCandidateId:
      GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
    resourceBudgetProfileId: GENERATED_MECHANIC_RESOURCE_BUDGET_PROFILE_ID,
    seed: createDeterministicRuntimeSeed(versionId),
    fixedStepIntervalMilliseconds: contract.lifecycle.fixedStep
      ? GENERATED_MECHANIC_FIXED_STEP_INTERVAL_MILLISECONDS
      : null,
  });
}

function createDeterministicRuntimeSeed(versionId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < versionId.length; index += 1) {
    hash ^= versionId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export type GeneratedMechanicFinalGameSpec = z.infer<
  typeof generatedMechanicFinalGameSpecSchema
>;
export type GeneratedMechanicFinalGameSpecExtension = z.infer<
  typeof generatedMechanicFinalGameSpecExtensionSchema
>;
export type PersistedGeneratedMechanicSourceArtifact = z.infer<
  typeof persistedGeneratedMechanicSourceArtifactSchema
>;
export type GeneratedMechanicRuntimePolicy = z.infer<
  typeof generatedMechanicRuntimePolicySchema
>;
export type AcceptedGeneratedMechanicArtifact = z.infer<
  typeof acceptedGeneratedMechanicArtifactSchema
>;
