import type { StableId } from "../game-spec-schema";

import {
  generationConstraintSetSchema,
  PHASE_9_GENERATION_CONSTRAINT_SET,
  type GenerationConstraintSet,
} from "./mechanic-generation-constraints";
import type {
  GeneratedMechanicResolution,
  MechanicResolution,
} from "./mechanic-resolver";

export type CoordinateMechanicGenerationInput = {
  generationRunId: StableId;
  resolutions: readonly MechanicResolution[];
};

export type AdmittedGeneratedMechanicRequest = {
  resolution: GeneratedMechanicResolution;
  constraintSet: GenerationConstraintSet;
};

export type MechanicGenerationConstraintConflictEvidence = {
  stage: "coordination";
  code: "generated_mechanic_limit_exceeded";
  constraintSetId: GenerationConstraintSet["id"];
  intentIds: StableId[];
  actualGeneratedMechanicCount: number;
  maximumGeneratedMechanicCount: number;
  message: string;
};

export type MechanicGenerationCoordination =
  | {
      kind: "generation_not_required";
      generationRunId: StableId;
      resolutions: readonly MechanicResolution[];
    }
  | {
      kind: "generation_admitted";
      generationRunId: StableId;
      requests: AdmittedGeneratedMechanicRequest[];
    }
  | {
      kind: "constraint_conflict";
      generationRunId: StableId;
      evidence: MechanicGenerationConstraintConflictEvidence;
    };

export function coordinateMechanicGeneration({
  generationRunId,
  resolutions,
}: CoordinateMechanicGenerationInput): MechanicGenerationCoordination {
  const generatedResolutions = resolutions.filter(
    (resolution): resolution is GeneratedMechanicResolution =>
      resolution.kind === "generated_mechanic"
  );

  if (generatedResolutions.length === 0) {
    return {
      kind: "generation_not_required",
      generationRunId,
      resolutions,
    };
  }

  const constraintSet = generationConstraintSetSchema.parse(
    PHASE_9_GENERATION_CONSTRAINT_SET
  );
  const maximumGeneratedMechanics =
    constraintSet.maximumGeneratedMechanicsPerRun;

  if (generatedResolutions.length > maximumGeneratedMechanics) {
    const actualGeneratedMechanicCount = generatedResolutions.length;

    return {
      kind: "constraint_conflict",
      generationRunId,
      evidence: {
        stage: "coordination",
        code: "generated_mechanic_limit_exceeded",
        constraintSetId: constraintSet.id,
        intentIds: generatedResolutions
          .map((resolution) => resolution.intentId)
          .sort(),
        actualGeneratedMechanicCount,
        maximumGeneratedMechanicCount: maximumGeneratedMechanics,
        message: `Generation Constraint Set ${constraintSet.id} allows ${maximumGeneratedMechanics} generated mechanic per GenerationRun, but received ${actualGeneratedMechanicCount}.`,
      },
    };
  }

  return {
    kind: "generation_admitted",
    generationRunId,
    requests: generatedResolutions.map((resolution) => ({
      resolution,
      constraintSet,
    })),
  };
}
