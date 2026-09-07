import {
  GENERATED_MECHANIC_FINAL_GAME_SPEC_VERSION,
  validateGeneratedMechanicFinalGameSpec,
  type ArtifactScopedRepairIssue,
  type ArtifactScopedRepairStage,
  type FinalGameSpecMechanicConnectionPlan,
  type GeneratedMechanicContract,
  type GeneratedMechanicFinalGameSpec,
  type GeneratedMechanicReferenceCatalog,
  type MechanicIntent,
  type StableId,
  type TopDownGameSpec,
} from "@/game-spec";
import type { JsonValue } from "@/game-spec/game-spec-schema";
import type { MechanicPortContract } from "@/runtime/mechanics/mechanic-port-runtime";
import type { GeneratedMechanicSourceArtifact } from "@/service/mechanic-source-generation";

export type GeneratedMechanicFinalGameSpecAssemblyBinding = Readonly<{
  id: StableId;
  referenceKind: StableId;
  cardinality: "one" | "many";
  objectIds: readonly StableId[];
}>;

export type GeneratedMechanicFinalGameSpecAssemblyPlan = Readonly<{
  finalGameSpecId: StableId;
  extensionId: StableId;
  extensionVersionId: StableId;
  mechanicId: StableId;
  mechanicType: StableId;
  config: Readonly<Record<string, JsonValue>>;
  bindings: readonly GeneratedMechanicFinalGameSpecAssemblyBinding[];
  activeReferences: Readonly<{
    entityIds: readonly StableId[];
    objectiveIds: readonly StableId[];
    sceneIds: readonly StableId[];
    regionIds: readonly StableId[];
    assetIds: readonly StableId[];
  }>;
  mechanicConnections: FinalGameSpecMechanicConnectionPlan;
}>;

export type AssembleGeneratedMechanicFinalGameSpecInput = Readonly<{
  baseGameSpec: TopDownGameSpec;
  intent: MechanicIntent;
  contract: GeneratedMechanicContract;
  sourceArtifact: GeneratedMechanicSourceArtifact;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  trustedPortContracts: readonly MechanicPortContract[];
  assemblyPlan: GeneratedMechanicFinalGameSpecAssemblyPlan;
}>;

export type AssembleGeneratedMechanicFinalGameSpecResult =
  | Readonly<{
      success: true;
      data: GeneratedMechanicFinalGameSpec;
    }>
  | Readonly<{
      success: false;
      evidence: Readonly<{
        responsibleStage: ArtifactScopedRepairStage;
        issues: readonly ArtifactScopedRepairIssue[];
      }>;
    }>;

/**
 * Owns the single authority boundary that combines an accepted generated
 * mechanic lineage with a trusted built-in TopDownGameSpec. All generated
 * values come from the explicit assembly plan; this layer never derives
 * config, bindings, or references from mechanic names.
 */
export function assembleGeneratedMechanicFinalGameSpec({
  baseGameSpec,
  intent,
  contract,
  sourceArtifact,
  referenceCatalog,
  trustedPortContracts,
  assemblyPlan,
}: AssembleGeneratedMechanicFinalGameSpecInput): AssembleGeneratedMechanicFinalGameSpecResult {
  if (contract.intentId !== intent.id) {
    return failure("contract", [
      {
        path: "contract.intentId",
        code: "intent_contract_identity_mismatch",
        message:
          "Generated mechanic contract must retain the exact routed mechanic intent lineage.",
      },
    ]);
  }

  if (
    sourceArtifact.contractId !== contract.id ||
    sourceArtifact.intentId !== intent.id
  ) {
    return failure("source", [
      {
        path: "sourceArtifact",
        code: "source_artifact_identity_mismatch",
        message:
          "Generated source artifact must retain the exact accepted contract and intent lineage.",
      },
    ]);
  }

  if ((baseGameSpec.mechanicConnections?.connections.length ?? 0) > 0) {
    return failure("finalGameSpec", [
      {
        path: "baseGameSpec.mechanicConnections",
        code: "existing_mechanic_connections_unsupported",
        message:
          "Generated mechanic assembly cannot replace or authenticate the trusted base Game Spec's existing mechanic connections.",
      },
    ]);
  }

  if (
    baseGameSpec.mechanics.some(
      ({ id }) => id === assemblyPlan.mechanicId
    )
  ) {
    return failure("finalGameSpec", [
      {
        path: "assemblyPlan.mechanicId",
        code: "mechanic_id_collision",
        message:
          "Generated mechanic assembly must append one new active mechanic with a unique ID.",
      },
    ]);
  }

  const activeReferenceIssues = validateActiveReferenceAuthority(
    assemblyPlan.activeReferences,
    referenceCatalog
  );
  if (activeReferenceIssues.length > 0) {
    return failure("finalGameSpec", activeReferenceIssues);
  }

  const baseSnapshot = snapshot(baseGameSpec);
  const configSnapshot = snapshot(assemblyPlan.config);
  const bindingsSnapshot = snapshot(assemblyPlan.bindings);
  const referencesSnapshot = snapshot(assemblyPlan.activeReferences);
  const connectionPlanSnapshot = snapshot(assemblyPlan.mechanicConnections);
  const candidate = {
    schemaVersion: GENERATED_MECHANIC_FINAL_GAME_SPEC_VERSION,
    id: assemblyPlan.finalGameSpecId,
    gameSpec: {
      ...baseSnapshot,
      mechanics: [
        ...baseSnapshot.mechanics,
        {
          id: assemblyPlan.mechanicId,
          type: assemblyPlan.mechanicType,
          entityIds: referencesSnapshot.entityIds,
          objectiveIds: referencesSnapshot.objectiveIds,
          sceneIds: referencesSnapshot.sceneIds,
          regionIds: referencesSnapshot.regionIds,
          assetIds: referencesSnapshot.assetIds,
          config: configSnapshot,
        },
      ],
      mechanicConnections: connectionPlanSnapshot,
    },
    extension: {
      id: assemblyPlan.extensionId,
      versionId: assemblyPlan.extensionVersionId,
      mechanicId: assemblyPlan.mechanicId,
      mechanicType: assemblyPlan.mechanicType,
      contractId: contract.id,
      sourceArtifactId: sourceArtifact.id,
      capabilityVersion: contract.capabilityVersion,
      config: configSnapshot,
      bindings: bindingsSnapshot,
    },
  };

  const validation = validateGeneratedMechanicFinalGameSpec({
    contract,
    finalGameSpec: candidate,
    referenceCatalog,
    sourceArtifact,
    trustedPortContracts,
  });
  if (!validation.success) {
    return failure(
      responsibleStageForIssues(validation.issues),
      validation.issues
    );
  }

  return snapshot({ success: true as const, data: validation.data });
}

function validateActiveReferenceAuthority(
  activeReferences: GeneratedMechanicFinalGameSpecAssemblyPlan["activeReferences"],
  referenceCatalog: GeneratedMechanicReferenceCatalog
): readonly ArtifactScopedRepairIssue[] {
  const referenceFields = [
    ["entityIds", "entity"],
    ["objectiveIds", "objective"],
    ["sceneIds", "scene"],
    ["regionIds", "region"],
    ["assetIds", "asset"],
  ] as const;
  const issues: ArtifactScopedRepairIssue[] = [];

  for (const [field, referenceKind] of referenceFields) {
    const admittedIds = Object.prototype.hasOwnProperty.call(
      referenceCatalog,
      referenceKind
    )
      ? referenceCatalog[referenceKind]
      : undefined;
    activeReferences[field].forEach((referenceId, referenceIndex) => {
      if (!admittedIds?.includes(referenceId)) {
        issues.push({
          path: `assemblyPlan.activeReferences.${field}.${referenceIndex}`,
          code: "unknown_mechanic_reference",
          message: `Generated mechanic reference "${referenceId}" requires trusted "${referenceKind}" authority.`,
        });
      }
    });
  }

  return snapshot(issues);
}

function responsibleStageForIssues(
  issues: readonly ArtifactScopedRepairIssue[]
): ArtifactScopedRepairStage {
  if (
    issues.some(({ code }) =>
      [
        "source_artifact_identity_mismatch",
        "capability_version_mismatch",
        "source_artifact_not_compiled",
        "source_capability_grant_mismatch",
      ].includes(code)
    )
  ) {
    return "source";
  }
  if (
    issues.some(({ code }) =>
      ["contract_identity_mismatch", "intent_contract_identity_mismatch"].includes(
        code
      )
    )
  ) {
    return "contract";
  }
  return "finalGameSpec";
}

function failure(
  responsibleStage: ArtifactScopedRepairStage,
  issues: readonly ArtifactScopedRepairIssue[]
): Extract<AssembleGeneratedMechanicFinalGameSpecResult, { success: false }> {
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
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
