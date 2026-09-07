import { describe, expect, it } from "vitest";

import {
  acceptedGeneratedMechanicArtifactSchema,
  createMechanicCapabilityGrant,
  createGeneratedMechanicRuntimePolicy,
  generatedMechanicProjectHostProfileIssues,
  gamePackSchema,
  hasExactAcceptedArtifactScopedRepairLineage,
  prepareRestoredGeneratedMechanicProject,
} from "@/game-spec";
import {
  validateGeneratedMechanicContract,
} from "@/game-spec/mechanics/generated-mechanic-contract";
import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
} from "@/game-spec/mechanics/mechanic-generation-constraints";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "@/runtime/mechanics/phase-9-mechanic-resource-policy";

import { createGeneratedMechanicProjectFixture } from "./generated-mechanic-project-fixtures";

describe("generated mechanic project fixtures", () => {
  it("builds one exact schema-valid project that moves a non-player probe", () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const parsed = gamePackSchema.safeParse(fixture.gamePack);

    expect(parsed.success).toBe(true);
    expect(
      validateGeneratedMechanicContract({
        input: fixture.artifact.contract,
        constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
        referenceCatalog: fixture.artifact.referenceCatalog,
        resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
      })
    ).toEqual({
      success: true,
      data: fixture.artifact.contract,
    });
    expect(
      prepareRestoredGeneratedMechanicProject({
        gamePack: fixture.gamePack,
        trustedPortContracts: [],
      })
    ).toEqual({
      success: true,
      data: {
        artifact: fixture.artifact,
        dependency: fixture.dependency,
      },
    });

    const artifact = fixture.artifact;
    const generatedMechanic = fixture.gamePack.gameSpec.mechanics.find(
      ({ id }) => id === artifact.mechanicId
    );
    const playerMovement = fixture.gamePack.gameSpec.mechanics.find(
      ({ type }) => type === "player_movement"
    );
    const motionProbe = fixture.gamePack.gameSpec.entities.find(
      ({ id }) => id === "entity_generated_motion_probe"
    );
    const qaArenaLayout = fixture.gamePack.gameSpec.template.config.scenes.find(
      ({ id }) => id === "scene_arena"
    )?.layout;
    const currentCheckpoint = fixture.gamePack.checkpoints.find(
      ({ id }) => id === fixture.gamePack.currentCheckpointId
    );
    const build = fixture.gamePack.builds.find(
      ({ id }) => id === artifact.buildId
    );
    const generationRun = fixture.gamePack.generationRuns.find(
      ({ id }) => id === artifact.sourceGenerationRunId
    );

    expect(artifact.runtimePolicy).toEqual(
      createGeneratedMechanicRuntimePolicy({
        contract: artifact.contract,
        versionId: artifact.versionId,
      })
    );
    expect(artifact.runtimePolicy.fixedStepIntervalMilliseconds).toBeNull();
    expect(artifact.contract.lifecycle.fixedStep).toBe(false);
    expect(motionProbe).toEqual({
      id: "entity_generated_motion_probe",
      name: "Generated Motion Probe",
      role: "hazard",
    });
    expect(artifact.bindings).toEqual([
      {
        cardinality: "one",
        id: "actor",
        objectIds: ["entity_generated_motion_probe"],
        referenceKind: "entity",
      },
    ]);
    expect(generatedMechanic?.entityIds).toEqual([
      "entity_generated_motion_probe",
    ]);
    expect(playerMovement?.entityIds).toEqual(["entity_player"]);
    expect(qaArenaLayout?.obstacles.map(({ id }) => id)).not.toContain(
      "obstacle_crate"
    );
    expect(currentCheckpoint).toMatchObject({
      id: artifact.checkpointId,
      buildId: artifact.buildId,
      generatedMechanicArtifactIds: [artifact.id],
      validationEvidenceIds: artifact.validationEvidenceIds,
    });
    expect(build).toMatchObject({
      id: artifact.buildId,
      checkpointId: artifact.checkpointId,
      generatedMechanicArtifactIds: [artifact.id],
      validationEvidenceIds: artifact.validationEvidenceIds,
      status: "validated",
    });
    expect(
      fixture.gamePack.validationEvidence.map((evidence) => ({
        id: evidence.id,
        artifactIds: evidence.generatedMechanicArtifactIds,
      }))
    ).toEqual(
      artifact.validationEvidenceIds.map((id) => ({
        id,
        artifactIds: [artifact.id],
      }))
    );
    expect(generationRun?.relationships).toEqual({
      gamePackId: fixture.gamePack.id,
      gameSpecId: fixture.gamePack.gameSpec.id,
      acceptedGeneratedMechanicArtifactIds: [artifact.id],
      buildIds: [artifact.buildId],
      checkpointIds: [artifact.checkpointId],
      validationEvidenceIds: artifact.validationEvidenceIds,
    });
    expect(
      hasExactAcceptedArtifactScopedRepairLineage({
        contractArtifactId: artifact.contract.id,
        finalGameSpecArtifactId: artifact.finalGameSpecArtifactId,
        generationRunId: artifact.sourceGenerationRunId,
        receipt: generationRun?.artifactScopedRepair,
        sourceArtifactId: artifact.sourceArtifact.id,
      })
    ).toBe(true);

    expect(artifact.sourceArtifact.callbacks.map(({ kind }) => kind)).toEqual([
      "install",
      "logical_action",
      "dispose",
    ]);
    const install = artifact.sourceArtifact.callbacks.find(
      ({ kind }) => kind === "install"
    );
    expect(install?.sourceTypeScript).toContain(
      'await capabilities.objects.writeMotion(bindings.actor'
    );
    expect(install?.sourceTypeScript).toContain(
      'await capabilities.state.write("drift_step_count", config.initial_count)'
    );
    const logicalAction = artifact.sourceArtifact.callbacks.find(
      ({ kind }) => kind === "logical_action"
    );
    expect(logicalAction?.sourceTypeScript).toBe("return null;");
  });

  it("rejects a durable accepted artifact that the persisted host profile cannot restore", () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const portBearingArtifact = {
      ...fixture.artifact,
      contract: {
        ...fixture.artifact.contract,
        ports: [
          {
            id: "count_changed",
            direction: "output" as const,
            payload: { kind: "integer" as const, minimum: 0, maximum: 20 },
          },
        ],
      },
    };

    expect(
      acceptedGeneratedMechanicArtifactSchema.safeParse(portBearingArtifact)
        .success
    ).toBe(false);
    expect(
      gamePackSchema.safeParse({
        ...fixture.gamePack,
        acceptedGeneratedMechanicArtifacts: [portBearingArtifact],
      }).success
    ).toBe(false);
  });

  it("round-trips declared owned objects and generic object capabilities through exact restore", () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const contract = {
      ...fixture.artifact.contract,
      ownedObjects: [
        { id: "runtime_effect", objectKind: "effect", maximumInstances: 2 },
      ],
      capabilities: [
        ...fixture.artifact.contract.capabilities,
        "object_create",
        "spatial_query",
        "object_destroy",
      ],
      resourceExpectations: {
        ...fixture.artifact.contract.resourceExpectations,
        maximumOwnedObjects: 2,
      },
      scenarios: fixture.artifact.contract.scenarios.map((scenario) => ({
        ...scenario,
        observations: [
          ...scenario.observations,
          {
            kind: "owned_object_count" as const,
            archetypeId: "runtime_effect",
            operator: "equals" as const,
            value: 0,
          },
        ],
      })),
    };
    const grant = createMechanicCapabilityGrant({
      contract,
      constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    });
    if (!grant.success) {
      throw new Error("Expected the owned-object fixture grant to pass.");
    }
    const sourceArtifact = {
      ...fixture.artifact.sourceArtifact,
      grant: grant.data,
      usedCapabilities: [...contract.capabilities],
    };
    const runtimePolicy = createGeneratedMechanicRuntimePolicy({
      contract,
      versionId: fixture.artifact.versionId,
    });
    const artifact = acceptedGeneratedMechanicArtifactSchema.parse({
      ...fixture.artifact,
      contract,
      sourceArtifact,
      runtimePolicy,
    });
    const gamePack = gamePackSchema.parse({
      ...fixture.gamePack,
      acceptedGeneratedMechanicArtifacts: [artifact],
    });

    expect(
      generatedMechanicProjectHostProfileIssues({
        contract,
        finalGameSpec: artifact.finalGameSpec,
        referenceCatalog: artifact.referenceCatalog,
      })
    ).toEqual([]);
    expect(
      prepareRestoredGeneratedMechanicProject({
        gamePack,
        trustedPortContracts: [],
      })
    ).toMatchObject({
      success: true,
      data: {
        artifact: {
          contract: {
            ownedObjects: contract.ownedObjects,
            capabilities: contract.capabilities,
          },
        },
      },
    });
  });

  it.each([
    {
      name: "gameplay events without a trusted event source",
      mutate: (fixture: ReturnType<typeof createGeneratedMechanicProjectFixture>) => ({
        contract: {
          ...fixture.artifact.contract,
          lifecycle: {
            ...fixture.artifact.contract.lifecycle,
            callbacks: [
              ...fixture.artifact.contract.lifecycle.callbacks,
              "gameplay_event" as const,
            ],
          },
        },
        code: "unsupported_runtime_gameplay_events",
      }),
    },
  ])("identifies $name before a durable artifact can claim the current host profile", ({ mutate }) => {
    const fixture = createGeneratedMechanicProjectFixture();
    const mutation = mutate(fixture);

    expect(
      generatedMechanicProjectHostProfileIssues({
        contract: mutation.contract,
        finalGameSpec: fixture.artifact.finalGameSpec,
        referenceCatalog: fixture.artifact.referenceCatalog,
      }).map(({ code }) => code)
    ).toContain(mutation.code);
  });
});
