import { PHASE_9_GENERATION_CONSTRAINT_SET } from "@/game-spec";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "@/runtime/mechanics/phase-9-mechanic-resource-policy";

import { createMechanicSourceGenerationOrchestrator } from "./mechanic-source-generation-orchestrator";

export const generateBuildAndExecuteMechanicSource =
  createMechanicSourceGenerationOrchestrator({
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
    resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
  });
