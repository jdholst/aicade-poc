import {
  TOP_DOWN_GENERATION_CAPABILITY_POLICY,
  renderTopDownSpecGenerationCapabilityIntegrityRules,
  renderTopDownSpecGenerationGuide,
} from "./top-down-generation-capability-policy";

export const DEFAULT_SPEC_GENERATION_PROMPT =
  "Make a tiny top-down collection game where a courier gathers lost stars in a small arena while avoiding one slow shadow.";

export const TOP_DOWN_SPEC_GENERATION_GUIDE =
  renderTopDownSpecGenerationGuide(TOP_DOWN_GENERATION_CAPABILITY_POLICY);
  
type TopDownSpecGenerationRepairContext = {
  failedAttempt: number;
  invalidCandidate: unknown;
  stage: string;
  validationIssues: {
    code?: string;
    message: string;
    path: string;
  }[];
};

export function createTopDownSpecGenerationSystemPrompt({
  prompt,
  repairContext,
  taskRoute,
}: {
  prompt: string;
  repairContext?: TopDownSpecGenerationRepairContext;
  taskRoute: string;
}) {
  return `
You are creating a compact game plan for AI-Cade's trusted Phaser top-down template.

Task route: ${taskRoute}

Creator prompt:
"${prompt}"

${TOP_DOWN_SPEC_GENERATION_GUIDE}

${renderTopDownSpecGenerationCapabilityIntegrityRules(
  TOP_DOWN_GENERATION_CAPABILITY_POLICY
)}

Reference rules:
- Every entity, asset, objective, validation goal, scene, zone, and mechanic ID must be stable and reusable.
- The scene must reference the primary objective and validation goal.
- The player spawn zone must reference the player entity.
- Mechanic entityIds must reference entities only: actors, participants, controlled objects, or objects directly affected by the behavior.
- Mechanic assetIds must reference assets only: visual/content assets the behavior places, collects, displays, scores, or otherwise uses.
- Mechanic regionIds must reference scene layout.regions only. Do not put pickup zone IDs or spawn zone IDs in regionIds.
- If no named layout region applies, set mechanic regionIds to [].
- Pickup collection must reference a pickup asset that is placed in a pickup zone. The zone area should cover a big portion of the arena.
- The spec must include originalPrompt exactly matching the creator prompt above.

${repairContext ? createRepairInstructions(repairContext) : ""}

Return the TopDownGameSpec through the provided tool.
`.trim();
}

function createRepairInstructions({
  failedAttempt,
  invalidCandidate,
  stage,
  validationIssues,
}: TopDownSpecGenerationRepairContext) {
  return `
Repair attempt ${failedAttempt + 1}
- The previous candidate failed ${stage}.
- Fix references and config while preserving the creator's game intent.
- Prefer narrow corrections over reinventing the whole game.
- The repaired output must still satisfy every schema, semantic reference, and mechanic rule above.

Invalid candidate spec JSON:
\`\`\`json
${JSON.stringify(invalidCandidate, null, 2)}
\`\`\`

Exact validation errors JSON:
\`\`\`json
${JSON.stringify(validationIssues, null, 2)}
\`\`\`
`.trim();
}
