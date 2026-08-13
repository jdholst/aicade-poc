import { describe, expect, it } from "vitest";

import {
  acceptedGeneratedMechanicArtifactSchema,
  createGeneratedMechanicRuntimePolicy,
  generatedMechanicProjectHostProfileIssues,
  gamePackSchema,
  hasExactAcceptedArtifactScopedRepairLineage,
  prepareRestoredGeneratedMechanicProject,
} from "@/game-spec";

import { createGeneratedMechanicProjectFixture } from "./generated-mechanic-project-fixtures";

describe("generated mechanic project fixtures", () => {
  it("builds one exact schema-valid and restorable player-drift project", () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const parsed = gamePackSchema.safeParse(fixture.gamePack);

    expect(parsed.success).toBe(true);
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
    expect(artifact.runtimePolicy.fixedStepIntervalMilliseconds).toBe(16);
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

    const fixedStep = artifact.sourceArtifact.callbacks.find(
      ({ kind }) => kind === "fixed_step"
    );
    expect(fixedStep?.sourceTypeScript).toContain(
      'await capabilities.objects.writeMotion(bindings.actor'
    );
    expect(fixedStep?.sourceTypeScript).toContain(
      'await capabilities.state.write("drift_step_count", nextCount)'
    );
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

  it.each([
    {
      name: "mechanic-owned objects",
      mutate: (fixture: ReturnType<typeof createGeneratedMechanicProjectFixture>) => ({
        contract: {
          ...fixture.artifact.contract,
          ownedObjects: [
            { id: "runtime_marker", objectKind: "effect", maximumInstances: 1 },
          ],
        },
        code: "unsupported_runtime_owned_objects",
      }),
    },
    {
      name: "object creation",
      mutate: (fixture: ReturnType<typeof createGeneratedMechanicProjectFixture>) => ({
        contract: {
          ...fixture.artifact.contract,
          capabilities: [...fixture.artifact.contract.capabilities, "object_create"],
        },
        code: "unsupported_runtime_capability",
      }),
    },
    {
      name: "spatial queries",
      mutate: (fixture: ReturnType<typeof createGeneratedMechanicProjectFixture>) => ({
        contract: {
          ...fixture.artifact.contract,
          capabilities: [...fixture.artifact.contract.capabilities, "spatial_query"],
        },
        code: "unsupported_runtime_capability",
      }),
    },
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
