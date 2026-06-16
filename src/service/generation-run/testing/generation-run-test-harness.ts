import {
  createGenerationRunRepository,
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  type FirstPlayableValidationAttempt,
  type GamePack,
  type GenerationRun,
  type GenerationRunStorageDriver,
  type StoredGenerationRunRecord,
} from "@/game-spec";
import {
  createEmptyGamePackFixture,
  createRepairedGenerationRunFixture,
  createSuccessfulGenerationRunFixture,
} from "@/game-spec/game-pack/testing/game-pack-fixtures";
import { topDownPhaserTemplate } from "@/runtime/phaser";

export function createGenerationRunTestRepository() {
  const storage = new MemoryGenerationRunStorage();

  return {
    repository: createGenerationRunRepository(storage),
    storage,
  };
}

export function createDeterministicClock(timestamps: string[]) {
  let index = 0;

  return () => timestamps[Math.min(index++, timestamps.length - 1)];
}

export function createRunningPhaserSpecGenerationRun({
  attempts = "single-success",
  gamePack = createEmptyGamePackFixture(),
  id,
}: {
  attempts?: "single-success" | "repaired-success";
  gamePack?: GamePack;
  id: GenerationRun["id"];
}): GenerationRun {
  const mechanicIds = gamePack.gameSpec.mechanics.map((mechanic) => mechanic.id);
  const terminalRun =
    attempts === "repaired-success"
      ? createRepairedGenerationRunFixture(gamePack, {
          id,
          mechanicIds,
          runtimeKind: "phaser",
          templateId: gamePack.templateId,
        })
      : createSuccessfulGenerationRunFixture(gamePack, {
          id,
          mechanicIds,
          runtimeKind: "phaser",
          templateId: gamePack.templateId,
        });
  const runningRun: Partial<GenerationRun> = { ...terminalRun };

  delete runningRun.completedAt;
  delete runningRun.durationMs;
  delete runningRun.failureClass;
  delete runningRun.relationships;
  delete runningRun.repairStatus;
  delete runningRun.stage;

  return {
    ...runningRun,
    status: "running",
  } as GenerationRun;
}

export function createFirstPlayableAttemptFixture({
  gamePack,
  scenario,
}: {
  gamePack?: GamePack;
  scenario: "passed" | "pre-runtime-failed" | "runtime-failed";
}): {
  attempt: FirstPlayableValidationAttempt;
  gamePack: GamePack;
} {
  const activeGamePack =
    gamePack ??
    (scenario === "pre-runtime-failed"
      ? createPreRuntimeFailureGamePack()
      : createEmptyGamePackFixture());
  let attempt = startFirstPlayableValidation({
    gamePack: activeGamePack,
    runtimeCandidate: createRuntimeCandidate(activeGamePack),
    startedAt: "2026-06-10T12:00:00.000Z",
  });

  if (scenario === "pre-runtime-failed") {
    return {
      attempt,
      gamePack: activeGamePack,
    };
  }

  attempt = recordFirstPlayableRuntimeStatus({
    attempt,
    observedAt: "2026-06-10T12:00:01.000Z",
    status: { state: "ready" },
  });

  if (scenario === "runtime-failed") {
    return {
      attempt: recordFirstPlayableRuntimeEvidence({
        attempt,
        evidence: {
          checkId: "input_response",
          status: "failed",
          message: "Runtime did not respond to movement input.",
          issues: [
            {
              code: "input_probe_no_velocity",
              path: "runtime.input",
              message: "Runtime did not respond to movement input.",
            },
          ],
        },
        observedAt: "2026-06-10T12:00:02.000Z",
      }),
      gamePack: activeGamePack,
    };
  }

  for (const checkId of [
    "nonblank_render",
    "player_visible",
    "input_response",
  ] as const) {
    attempt = recordFirstPlayableRuntimeEvidence({
      attempt,
      evidence: {
        checkId,
        status: "passed",
      },
      observedAt: "2026-06-10T12:00:02.000Z",
    });
  }

  return {
    attempt,
    gamePack: activeGamePack,
  };
}

function createRuntimeCandidate(gamePack: GamePack) {
  return {
    runtimeDependencyScriptPaths: topDownPhaserTemplate.runtimeDependencyScriptPaths,
    runtimeKind: "phaser" as const,
    runtimeScriptPath: topDownPhaserTemplate.runtimeScriptPath,
    templateId: gamePack.gameSpec.template.id,
  };
}

function createPreRuntimeFailureGamePack(): GamePack {
  return createEmptyGamePackFixture({
    gameSpec: {
      ...topDownPhaserTemplate.gameSpec,
      objectives: topDownPhaserTemplate.gameSpec.objectives.map((objective) => ({
        ...objective,
        primary: false,
      })),
    },
  });
}

export class MemoryGenerationRunStorage implements GenerationRunStorageDriver {
  readonly records = new Map<string, StoredGenerationRunRecord>();

  async put(record: StoredGenerationRunRecord) {
    this.records.set(record.id, cloneRecord(record));
  }

  async get(generationRunId: string) {
    return this.records.get(generationRunId) ?? null;
  }

  async getAll() {
    return Array.from(this.records.values()).map(cloneRecord);
  }

  async delete(generationRunId: string) {
    this.records.delete(generationRunId);
  }

  async clear() {
    this.records.clear();
  }
}

function cloneRecord(record: StoredGenerationRunRecord): StoredGenerationRunRecord {
  return JSON.parse(JSON.stringify(record)) as StoredGenerationRunRecord;
}
