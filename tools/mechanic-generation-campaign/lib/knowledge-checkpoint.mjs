import { buildCampaignKnowledgeContext } from "./knowledge-cli.mjs";
import {
  CAMPAIGN_KNOWLEDGE_PATH,
  applyKnowledgeReconciliation,
  createCampaignKnowledgeStore,
  knowledgeEntriesDigest,
  readCampaignKnowledgeAtRevision,
} from "./knowledge.mjs";

export async function validateFixKnowledgeCheckpoint({
  repoRoot,
  run,
  fix,
  actualChangedFiles,
  campaignStore,
  loopStore,
  buildContextFn = buildCampaignKnowledgeContext,
}) {
  if (!run.knowledgePolicy.required) return undefined;
  if (!actualChangedFiles.includes(CAMPAIGN_KNOWLEDGE_PATH)) {
    throw new Error(
      `Fix commit must include ${CAMPAIGN_KNOWLEDGE_PATH}.`
    );
  }

  const before = await readCampaignKnowledgeAtRevision(
    run.worktree.path,
    fix.beforeRevision.head
  );
  const after = await createCampaignKnowledgeStore(run.worktree.path).read();
  const expectedPriorDigest = expectedKnowledgeDigest(run, before);
  if (knowledgeEntriesDigest(before) !== expectedPriorDigest) {
    throw new Error("Fix knowledge baseline does not match the loop checkpoint.");
  }
  assertExactlyOneAppendedReconciliation(before, after);
  const reconciliation = after.reconciliations.at(-1);
  if (
    reconciliation.source.kind !== "fix_cycle" ||
    reconciliation.source.loopId !== run.id ||
    reconciliation.source.fixId !== fix.id ||
    reconciliation.source.triggerCampaignRunId !== fix.triggerCampaignRunId
  ) {
    throw new Error(
      "Fix knowledge reconciliation source does not match the loop, fix, and trigger campaign."
    );
  }

  const context = await buildContextFn({
    repoRoot,
    knowledge: before,
    loopId: run.id,
    campaignStore,
    loopStore,
    targetRoot: run.worktree.path,
  });
  const proposal = { ...reconciliation };
  delete proposal.priorManifestDigest;
  delete proposal.resultingManifestDigest;
  const replayed = applyKnowledgeReconciliation(before, proposal, context);
  if (JSON.stringify(replayed) !== JSON.stringify(after)) {
    throw new Error(
      "Fix knowledge reconciliation does not replay to the committed manifest."
    );
  }
  return reconciliation.id;
}

function expectedKnowledgeDigest(run, before) {
  const previousId = run.knowledgeReconciliationIds.at(-1);
  if (!previousId) return run.knowledgePolicy.baselineManifestDigest;
  const previous = before.reconciliations.find(({ id }) => id === previousId);
  if (!previous) {
    throw new Error(`Knowledge reconciliation ${previousId} is missing.`);
  }
  return previous.resultingManifestDigest;
}

function assertExactlyOneAppendedReconciliation(before, after) {
  if (after.reconciliations.length !== before.reconciliations.length + 1) {
    throw new Error("Fix must append exactly one knowledge reconciliation.");
  }
  const unchangedPrefix = before.reconciliations.every(
    (entry, index) =>
      JSON.stringify(entry) === JSON.stringify(after.reconciliations[index])
  );
  if (!unchangedPrefix) {
    throw new Error("Existing knowledge reconciliation history is append-only.");
  }
}
