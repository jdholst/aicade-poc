import { describe, expect, it } from "vitest";

import {
  createSuccessfulGenerationRunFixture,
  createValidatedGamePackFixture,
} from "@/game-spec/game-pack/testing/game-pack-fixtures";
import type { GenerationRunRepository } from "@/game-spec";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import {
  GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME,
  installGenerationRunDeveloperJsonExport,
  type GenerationRunDeveloperJsonExportTarget,
} from "./generation-run-developer-export";
import { createPhaserGenerationRunReceiptLifecycle } from "./phaser-generation-run-receipt-lifecycle";
import {
  createDeterministicClock,
  createGenerationRunTestRepository,
} from "./testing/generation-run-test-harness";

describe("installGenerationRunDeveloperJsonExport", () => {
  it("installs a developer-only console export backed by the GenerationRun repository", async () => {
    const gamePack = createValidatedGamePackFixture();
    const olderRun = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_older",
      completedAt: "2026-05-23T12:05:00.000Z",
    });
    const newerRun = createSuccessfulGenerationRunFixture(gamePack, {
      id: "generation_run_newer",
      completedAt: "2026-05-23T12:10:00.000Z",
    });
    const repository: Pick<GenerationRunRepository, "list"> = {
      list: async () => [olderRun, newerRun],
    };
    const target: GenerationRunDeveloperJsonExportTarget = {};

    const installation = installGenerationRunDeveloperJsonExport({
      defaultOptions: {
        exportedAt: "2026-06-08T12:00:00.000Z",
        maxRuns: 1,
      },
      enabled: true,
      repository,
      target,
    });

    expect(installation.status).toBe("installed");

    const exportText =
      await target[GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME]?.();

    expect(JSON.parse(exportText ?? "{}")).toMatchObject({
      audience: "developer-internal",
      filters: {
        maxRuns: 1,
      },
      runs: [
        {
          id: "generation_run_newer",
        },
      ],
    });
  });

  it("exports receipts created by the Phaser Spec Generation lifecycle", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const { repository } = createGenerationRunTestRepository();
    const target: GenerationRunDeveloperJsonExportTarget = {};
    const lifecycle = createPhaserGenerationRunReceiptLifecycle({
      createGenerationRunId: () => "generation_run_developer_export",
      generationSource: "phaser-ai",
      now: createDeterministicClock([
        "2026-06-10T12:00:00.000Z",
        "2026-06-10T12:00:04.000Z",
      ]),
      repository,
      request: {
        prompt: "make a top-down crystal chase",
      },
    });

    await lifecycle.createInitialReceipt();
    await lifecycle.recordSpecGenerationSuccess({
      metadata: {
        attemptCount: 1,
        model: "gpt-5.4-mini",
        taskRoute: "spec_generation.primary",
      },
      runtimeKind: "phaser",
      spec,
    });

    installGenerationRunDeveloperJsonExport({
      defaultOptions: {
        exportedAt: "2026-06-10T12:00:05.000Z",
      },
      enabled: true,
      repository,
      target,
    });

    const exportText =
      await target[GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME]?.();

    expect(JSON.parse(exportText ?? "{}")).toMatchObject({
      runCount: 1,
      runs: [
        {
          id: "generation_run_developer_export",
          status: "running",
          runtimeKind: "phaser",
          templateId: spec.template.id,
          mechanicIds: spec.mechanics.map((mechanic) => mechanic.id),
          taskRoutes: ["spec_generation.primary"],
          providerModels: [
            {
              provider: "openai",
              model: "gpt-5.4-mini",
            },
          ],
          attempts: [
            {
              id: "generation_run_developer_export_attempt_1",
              status: "succeeded",
              candidate: {
                kind: "validated_spec",
                gameSpecId: spec.id,
                referencedMechanicIds: spec.mechanics.map(
                  (mechanic) => mechanic.id
                ),
              },
            },
          ],
        },
      ],
    });
  });

  it("does not expose the export surface when disabled", () => {
    const target: GenerationRunDeveloperJsonExportTarget = {};

    const installation = installGenerationRunDeveloperJsonExport({
      enabled: false,
      target,
    });

    expect(installation.status).toBe("disabled");
    expect(target).not.toHaveProperty(
      GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME
    );
  });

  it("removes only the installed export function during cleanup", () => {
    const previousExport = async () => "previous";
    const target: GenerationRunDeveloperJsonExportTarget = {
      [GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME]: previousExport,
    };

    const installation = installGenerationRunDeveloperJsonExport({
      enabled: true,
      repository: {
        list: async () => [],
      },
      target,
    });

    expect(target[GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME]).not.toBe(
      previousExport
    );

    installation.uninstall();

    expect(target[GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME]).toBe(
      previousExport
    );
  });
});
