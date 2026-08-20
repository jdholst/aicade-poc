import { z } from "zod";

import { stableIdSchema } from "../game-spec-schema";
import type { GenerationRun } from "./generation-run-schema";

export const GENERATED_MECHANIC_HANDOFF_VERSION =
  "generated_mechanic_handoff/v1" as const;

const GENERATED_MECHANIC_HANDOFF_METADATA_KEY =
  "generatedMechanicHandoff" as const;

export const generatedMechanicHandoffReceiptSchema = z
  .object({
    schemaVersion: z.literal(GENERATED_MECHANIC_HANDOFF_VERSION),
    status: z.literal("pending"),
    generationRunId: stableIdSchema,
    intentArtifactId: stableIdSchema,
    contractArtifactId: stableIdSchema,
    sourceArtifactId: stableIdSchema,
    finalGameSpecArtifactId: stableIdSchema,
  })
  .strict();

export type GeneratedMechanicHandoffReceipt = z.infer<
  typeof generatedMechanicHandoffReceiptSchema
>;

export type GeneratedMechanicHandoffReceiptReadResult =
  | GeneratedMechanicHandoffReceipt
  | "invalid"
  | undefined;

export function writeGeneratedMechanicHandoffPendingReceipt(
  generationRun: GenerationRun,
  input: Omit<
    GeneratedMechanicHandoffReceipt,
    "schemaVersion" | "status" | "generationRunId"
  >
): GenerationRun {
  const receipt = generatedMechanicHandoffReceiptSchema.parse({
    schemaVersion: GENERATED_MECHANIC_HANDOFF_VERSION,
    status: "pending",
    generationRunId: generationRun.id,
    ...input,
  });
  return {
    ...generationRun,
    metadata: {
      ...(generationRun.metadata ?? {}),
      [GENERATED_MECHANIC_HANDOFF_METADATA_KEY]: receipt,
    },
  };
}

export function readGeneratedMechanicHandoffReceipt(
  generationRun: Pick<GenerationRun, "metadata">
): GeneratedMechanicHandoffReceiptReadResult {
  const value = generationRun.metadata?.[GENERATED_MECHANIC_HANDOFF_METADATA_KEY];
  if (value === undefined) {
    return undefined;
  }
  const result = generatedMechanicHandoffReceiptSchema.safeParse(value);
  return result.success ? result.data : "invalid";
}

export function clearGeneratedMechanicHandoffReceipt(
  generationRun: GenerationRun
): GenerationRun {
  if (
    generationRun.metadata?.[GENERATED_MECHANIC_HANDOFF_METADATA_KEY] ===
    undefined
  ) {
    return generationRun;
  }
  const metadata = { ...(generationRun.metadata ?? {}) };
  delete metadata[GENERATED_MECHANIC_HANDOFF_METADATA_KEY];
  if (Object.keys(metadata).length > 0) {
    return { ...generationRun, metadata };
  }
  const generationRunWithoutMetadata = { ...generationRun };
  delete generationRunWithoutMetadata.metadata;
  return generationRunWithoutMetadata;
}
