import { isFullActualSuccess } from "./contracts.mjs";

export async function collectCampaignCarryoverAttemptRefs(
  store,
  campaignRunId
) {
  const attempts = await store.readAttempts(campaignRunId);
  if (attempts.length === 0) return [];
  const run = await store.readRun(campaignRunId);
  const refsBySequence = new Map(
    (run.carryoverAttemptRefs ?? []).map((ref) => [ref.sequence, ref])
  );
  for (const attempt of attempts.filter(isFullActualSuccess)) {
    refsBySequence.set(attempt.sequence, attemptRef(attempt));
  }
  return [...refsBySequence.values()].sort(
    (left, right) => left.sequence - right.sequence
  );
}

export async function loadCampaignCarryoverAttempts(store, run) {
  const refs = run.carryoverAttemptRefs ?? [];
  if (refs.length === 0) return [];
  if (!run.loopId || !run.loopStepId) {
    throw new Error("Carryover attempts are available only to loop-linked campaigns.");
  }
  const sourceRuns = new Map();
  const attempts = [];
  for (const ref of refs) {
    let sourceRun = sourceRuns.get(ref.campaignRunId);
    if (!sourceRun) {
      sourceRun = await store.readRun(ref.campaignRunId);
      sourceRuns.set(ref.campaignRunId, sourceRun);
    }
    if (
      sourceRun.loopId !== run.loopId ||
      sourceRun.loopStepId !== run.loopStepId ||
      sourceRun.cohort !== run.cohort
    ) {
      throw new Error(
        `Carryover campaign ${ref.campaignRunId} does not match ${run.id}.`
      );
    }
    const attempt = await store.readAttempt(ref.campaignRunId, ref.attemptId);
    if (
      !isFullActualSuccess(attempt) ||
      attempt.sequence !== ref.sequence ||
      attempt.promptId !== ref.promptId ||
      attempt.revisionKey !== ref.revisionKey
    ) {
      throw new Error(
        `Carryover attempt ${ref.campaignRunId}/${ref.attemptId} is not an exact approved success.`
      );
    }
    attempts.push(attempt);
  }
  return mergeCampaignProgressAttempts(attempts, []);
}

export function mergeCampaignProgressAttempts(carryoverAttempts, attempts) {
  const bySequence = new Map();
  for (const attempt of [...carryoverAttempts, ...attempts]) {
    if (bySequence.has(attempt.sequence)) {
      throw new Error(
        `Campaign progress contains duplicate attempt sequence ${attempt.sequence}.`
      );
    }
    bySequence.set(attempt.sequence, attempt);
  }
  return [...bySequence.values()].sort(
    (left, right) => left.sequence - right.sequence
  );
}

function attemptRef(attempt) {
  return {
    campaignRunId: attempt.campaignRunId,
    attemptId: attempt.id,
    sequence: attempt.sequence,
    promptId: attempt.promptId,
    revisionKey: attempt.revisionKey,
  };
}
