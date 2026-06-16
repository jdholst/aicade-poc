import { describe, expect, it } from "vitest";

import { gamePackSchema } from "@/game-spec";

import {
  createFailedGenerationRunFixture,
  createRepairedGenerationRunFixture,
  createSuccessfulGenerationRunFixture,
  createValidatedGamePackFixture,
} from "./game-pack-fixtures";

describe("Game Pack fixtures", () => {
  it("builds valid successful, failed, and repaired GenerationRun receipts", () => {
    const pack = createValidatedGamePackFixture();
    const successfulRun = createSuccessfulGenerationRunFixture(pack);
    const failedRun = createFailedGenerationRunFixture(pack);
    const repairedRun = createRepairedGenerationRunFixture(pack);

    expect(
      gamePackSchema.parse({
        ...pack,
        generationRuns: [successfulRun, failedRun, repairedRun],
      }).generationRuns
    ).toEqual([successfulRun, failedRun, repairedRun]);
  });
});
