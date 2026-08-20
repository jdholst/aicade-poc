import { describe, expect, it } from "vitest";

import { generationRunSchema } from "./generation-run-schema";
import {
  clearGeneratedMechanicHandoffReceipt,
  readGeneratedMechanicHandoffReceipt,
  writeGeneratedMechanicHandoffPendingReceipt,
} from "./generated-mechanic-handoff-receipt";

describe("generated mechanic handoff receipt", () => {
  it("writes, reads, and clears one exact pending lineage receipt", () => {
    const generationRun = createSucceededGenerationRun();
    const withReceipt = writeGeneratedMechanicHandoffPendingReceipt(
      generationRun,
      {
        intentArtifactId: "intent_dash",
        contractArtifactId: "contract_dash",
        sourceArtifactId: "source_dash",
        finalGameSpecArtifactId: "final_game_spec_dash",
      }
    );

    expect(readGeneratedMechanicHandoffReceipt(withReceipt)).toEqual({
      schemaVersion: "generated_mechanic_handoff/v1",
      status: "pending",
      generationRunId: generationRun.id,
      intentArtifactId: "intent_dash",
      contractArtifactId: "contract_dash",
      sourceArtifactId: "source_dash",
      finalGameSpecArtifactId: "final_game_spec_dash",
    });
    expect(readGeneratedMechanicHandoffReceipt(generationRun)).toBeUndefined();
    expect(clearGeneratedMechanicHandoffReceipt(withReceipt)).toEqual(
      generationRun
    );
  });

  it("rejects serialized metadata that is not the strict receipt shape", () => {
    const generationRun = createSucceededGenerationRun();

    expect(
      readGeneratedMechanicHandoffReceipt({
        metadata: {
          generatedMechanicHandoff: {
            schemaVersion: "generated_mechanic_handoff/v1",
            status: "pending",
            generationRunId: generationRun.id,
            intentArtifactId: "intent_dash",
            contractArtifactId: "contract_dash",
            sourceArtifactId: "source_dash",
            finalGameSpecArtifactId: "final_game_spec_dash",
            unexpected: true,
          },
        },
      })
    ).toBe("invalid");
  });
});

function createSucceededGenerationRun() {
  return generationRunSchema.parse({
    id: "generation_run_handoff_receipt",
    operationType: "generate",
    status: "succeeded",
    createdAt: "2026-08-20T04:00:00.000Z",
    startedAt: "2026-08-20T04:00:01.000Z",
    completedAt: "2026-08-20T04:00:02.000Z",
    durationMs: 1000,
    request: { summary: "Generate a dash mechanic." },
    runtimeKind: "phaser",
    attempts: [],
  });
}
