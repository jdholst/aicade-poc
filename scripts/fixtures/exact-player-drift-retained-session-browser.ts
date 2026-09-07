import { createGeneratedMechanicProjectFixture } from "../../src/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import type { ContainedMechanicRuntimeStep } from "../../src/runtime/mechanics/contained-mechanic-runtime";
import { createGeneratedMechanicRuntimeSession } from "../../src/runtime/mechanics/generated-mechanic-runtime-session";
import {
  createSesWorkerMechanicExecutionRealmAdapter,
  type SesWorkerMechanicExecutionRealmController,
} from "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm";

export type ExactPlayerDriftFixedStepEvidence = Readonly<{
  outcome: string;
  resourceDimension?: string;
  completedIterations: number;
  requestedIterations: number;
  velocityX?: number;
  velocityY?: number;
}>;

export async function runExactPlayerDriftRetainedSessionBrowserIntegration({
  controller,
  requestedIterations,
  elapsedMilliseconds = 16,
  mainThreadStressMilliseconds = 0,
}: Readonly<{
  controller: SesWorkerMechanicExecutionRealmController;
  requestedIterations: number;
  elapsedMilliseconds?: number;
  mainThreadStressMilliseconds?: number;
}>): Promise<ExactPlayerDriftFixedStepEvidence> {
  const fixture = createGeneratedMechanicProjectFixture();
  const boundObjectId = fixture.artifact.bindings[0]?.objectIds[0];
  const boundEntity = fixture.gamePack.gameSpec.entities.find(
    (entity) => entity.id === boundObjectId
  );
  if (!boundObjectId || !boundEntity) {
    throw new Error(
      "Exact player-drift browser integration requires one fixture-bound game entity."
    );
  }
  const velocity = { x: 0, y: 0 };
  const adapter = createSesWorkerMechanicExecutionRealmAdapter({
    createController: () => controller,
  });
  const session = await createGeneratedMechanicRuntimeSession({
    artifact: fixture.artifact,
    dependency: fixture.dependency,
    realmAdapter: adapter,
    objects: [
      {
        id: boundObjectId,
        kind: boundEntity.role,
        object: {
          active: true,
          x: 156,
          y: 316,
          body: {
            velocity,
            setVelocity(x, y) {
              velocity.x = x;
              velocity.y = y;
            },
          },
        },
      },
    ],
  });
  const stressIntervalId =
    mainThreadStressMilliseconds > 0
      ? window.setInterval(() => {
          const deadline = performance.now() + mainThreadStressMilliseconds;
          while (performance.now() < deadline) {
            // Model one bounded render/update slice on the capability-host thread.
          }
        }, 16)
      : undefined;

  try {
    const installation = await session.install();
    if (installation.outcome !== "completed") {
      return failureEvidence(
        installation,
        0,
        requestedIterations,
        velocity
      );
    }
    for (let iteration = 1; iteration <= requestedIterations; iteration += 1) {
      const step = await session.advanceSimulation(elapsedMilliseconds);
      if (step.outcome !== "completed") {
        return failureEvidence(
          step,
          iteration - 1,
          requestedIterations,
          velocity
        );
      }
    }
    return {
      outcome: "completed",
      completedIterations: requestedIterations,
      requestedIterations,
      velocityX: velocity.x,
      velocityY: velocity.y,
    };
  } finally {
    if (stressIntervalId !== undefined) {
      window.clearInterval(stressIntervalId);
    }
    await session.dispose();
    controller.terminate();
  }
}

function failureEvidence(
  step: ContainedMechanicRuntimeStep,
  completedIterations: number,
  requestedIterations: number,
  velocity: Readonly<{ x: number; y: number }>
): ExactPlayerDriftFixedStepEvidence {
  return {
    outcome: step.outcome,
    resourceDimension:
      step.outcome === "contained_failure" &&
      step.evidence.failure.kind === "resource_budget"
        ? step.evidence.failure.dimension
        : undefined,
    completedIterations,
    requestedIterations,
    velocityX: velocity.x,
    velocityY: velocity.y,
  };
}
