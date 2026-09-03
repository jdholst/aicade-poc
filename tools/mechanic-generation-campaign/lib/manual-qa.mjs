import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CAMPAIGN_MANUAL_QA_SCHEMA_VERSION,
  parseCampaignAttempt,
  parseCampaignManualQa,
  parseCampaignRun,
  isCountedCohortFailure,
  isDiagnosticSuccess,
  isFullActualSuccess,
} from "./contracts.mjs";
import {
  loadCampaignCarryoverAttempts,
  mergeCampaignProgressAttempts,
} from "./campaign-progress.mjs";
import { redactSensitive } from "./redaction.mjs";
import {
  rejectLoopManualQa,
  resumeLoopAfterManualQaApproval,
} from "./loop-state.mjs";

const RAW_GENERATION_RUN_FILE = "generation-run-storage.json";
const RAW_GAME_PACK_FILE = "game-pack-storage.json";

export async function createManualQaCandidate({
  store,
  run: runInput,
  attempt: attemptInput,
  generationRunRecord,
  gamePackRecord,
  evidence = {},
  requestedAt = new Date().toISOString(),
  persistRun = true,
}) {
  const run = parseCampaignRun(runInput);
  const attempt = structuredClone(attemptInput);
  if (
    attempt.status !== "awaiting_manual_qa" ||
    attempt.automatedOutcome.status !== "passed"
  ) {
    throw new Error("Manual QA candidates require an automated passing attempt.");
  }
  if (!generationRunRecord || !gamePackRecord) {
    throw new Error("Manual QA candidates require exact GenerationRun and GamePack storage records.");
  }

  const manualQaId = `manual-qa-${attempt.id}`;
  const evidencePath = `${attempt.id}/manual-qa.json`;
  const manualQa = parseCampaignManualQa({
    schemaVersion: CAMPAIGN_MANUAL_QA_SCHEMA_VERSION,
    id: manualQaId,
    campaignRunId: run.id,
    attemptId: attempt.id,
    promptId: attempt.promptId,
    cohort: run.cohort,
    revisionKey: run.revision.revisionKey,
    status: "pending",
    requestedAt,
    candidateArtifacts: [
      {
        kind: "generation_run",
        path: RAW_GENERATION_RUN_FILE,
        sha256: hashJsonEvidence(redactSensitive(generationRunRecord)),
      },
      {
        kind: "game_pack",
        path: RAW_GAME_PACK_FILE,
        sha256: hashJsonEvidence(redactSensitive(gamePackRecord)),
      },
    ],
    reviewSessions: [],
  });
  const manualQaReference = {
    id: manualQa.id,
    path: evidencePath,
    status: "pending",
  };
  const pendingManualQa = {
    manualQaId: manualQa.id,
    campaignRunId: run.id,
    attemptId: attempt.id,
    promptId: attempt.promptId,
    cohort: run.cohort,
    revisionKey: run.revision.revisionKey,
    requestedAt,
    evidencePath,
  };
  const pendingAttempt = parseCampaignAttempt({
    ...attempt,
    cohort: run.cohort,
    manualQa: manualQaReference,
    artifacts: [
      ...new Set([
        ...attempt.artifacts,
        RAW_GENERATION_RUN_FILE,
        RAW_GAME_PACK_FILE,
        "manual-qa.json",
      ]),
    ],
  });
  const createPendingRun = (currentRun) => {
    const queue = [
      ...(currentRun.pendingManualQaQueue ?? []),
      pendingManualQa,
    ].filter(
      (entry, index, entries) =>
        entries.findIndex(({ manualQaId }) => manualQaId === entry.manualQaId) ===
        index
    );
    const status = currentRun.executionPolicy.mode === "parallel"
      ? "running"
      : "waiting_for_manual_qa";
    return parseCampaignRun({
      ...currentRun,
      status,
      completedAt: undefined,
      attemptIds: currentRun.attemptIds.includes(attempt.id)
        ? currentRun.attemptIds
        : [...currentRun.attemptIds, attempt.id],
      attemptSlots: currentRun.attemptSlots.map((slot) =>
        slot.attemptId === attempt.id
          ? { ...slot, status: "awaiting_manual_qa", updatedAt: requestedAt }
          : slot
      ),
      pendingManualQa: queue[0],
      pendingManualQaQueue: queue,
    });
  };

  await store.writeAttempt(pendingAttempt, {
    ...evidence,
    [RAW_GENERATION_RUN_FILE]: generationRunRecord,
    [RAW_GAME_PACK_FILE]: gamePackRecord,
  });
  await store.writeManualQa(manualQa);
  const pendingRun = persistRun
    ? await persistCampaignRun(store, run, createPendingRun)
    : createPendingRun(run);
  return { run: pendingRun, attempt: pendingAttempt, manualQa };
}

export async function approveCampaignAttempt({
  store,
  campaignRunId,
  attemptId,
  note,
  decidedAt = new Date().toISOString(),
  loopStore,
}) {
  return decideCampaignAttempt({
    store,
    campaignRunId,
    attemptId,
    verdict: "approved",
    note,
    decidedAt,
    loopStore,
  });
}

export async function denyCampaignAttempt({
  store,
  campaignRunId,
  attemptId,
  reason,
  decidedAt = new Date().toISOString(),
  loopStore,
}) {
  if (!reason?.trim()) {
    throw new Error("Manual QA denial requires a reason.");
  }
  return decideCampaignAttempt({
    store,
    campaignRunId,
    attemptId,
    verdict: "denied",
    reason: reason.trim(),
    decidedAt,
    loopStore,
  });
}

async function decideCampaignAttempt({
  store,
  campaignRunId,
  attemptId,
  verdict,
  note,
  reason,
  decidedAt,
  loopStore,
}) {
  const decide = () => decideCampaignAttemptUnlocked({
    store,
    campaignRunId,
    attemptId,
    verdict,
    note,
    reason,
    decidedAt,
    loopStore,
  });
  return typeof store.withManualQaLock === "function"
    ? store.withManualQaLock(campaignRunId, attemptId, decide)
    : decide();
}

async function decideCampaignAttemptUnlocked({
  store,
  campaignRunId,
  attemptId,
  verdict,
  note,
  reason,
  decidedAt,
  loopStore,
}) {
  const [run, attempt, manualQa] = await Promise.all([
    store.readRun(campaignRunId),
    store.readAttempt(campaignRunId, attemptId),
    store.readManualQa(campaignRunId, attemptId),
  ]);
  assertArtifactIdentity(run, attempt, manualQa);
  if (manualQa.status === verdict) {
    return { run, attempt, manualQa };
  }
  if (manualQa.status !== "pending") {
    throw new Error(
      `Conflicting manual QA verdict: attempt is already ${manualQa.status}.`
    );
  }
  if (run.loopId && !loopStore) {
    throw new Error("A loop-linked manual QA verdict requires the campaign loop store.");
  }
  const linkedLoop = run.loopId
    ? await loopStore.readRun(run.loopId)
    : undefined;
  assertPendingCandidate(run, attempt, manualQa, linkedLoop);
  await verifyManualQaCandidate(store, manualQa);

  const decidedManualQa = parseCampaignManualQa({
    ...manualQa,
    status: verdict,
    decidedAt,
    ...(verdict === "approved" && note?.trim()
      ? { approvalNote: note.trim() }
      : {}),
    ...(verdict === "denied" ? { denialReason: reason } : {}),
  });
  const decidedAttempt = parseCampaignAttempt(
    verdict === "approved"
      ? {
          ...attempt,
          status: "success",
          terminalOutcome: "accepted, externally verified, and manually approved",
          classification: "success",
          adjudicatedOutcome: "manual_qa_approved",
          manualQa: { ...attempt.manualQa, status: "approved" },
        }
      : {
          ...attempt,
          status: "mechanic_incorrect",
          terminalOutcome: "manual gameplay QA denied",
          classification: "manual_qa_rejected",
          failure: reason,
          adjudicatedOutcome: "manual_qa_denied",
          manualQa: { ...attempt.manualQa, status: "denied" },
        }
  );
  const currentAttempts = (await store.readAttempts(campaignRunId)).map((entry) =>
    entry.id === decidedAttempt.id ? decidedAttempt : entry
  );
  const carryoverAttempts = await loadCampaignCarryoverAttempts(store, run);
  const attempts = mergeCampaignProgressAttempts(
    carryoverAttempts,
    currentAttempts
  );
  const failures = attempts.filter(isCountedCohortFailure).length;
  const thresholdCohort = ["repeatability", "variation"].includes(run.cohort);
  const failureLimit = thresholdCohort ? 3 : undefined;
  const campaignContinues =
    verdict === "approved" || (thresholdCohort && failures < failureLimit);
  const result = {
    successes: attempts.filter(isFullActualSuccess).length,
    diagnosticSuccesses: attempts.filter(isDiagnosticSuccess).length,
    submissions: attempts.length,
    qualifiesForMechanicProof: false,
    missingSuccessfulPromptIds: [],
    ...(thresholdCohort
      ? {
          failures,
          failureLimit,
          remainingFailureTolerance: Math.max(0, failureLimit - failures),
          baseSubmissions: attempts.filter(
            ({ submissionKind }) => submissionKind !== "replacement"
          ).length,
          replacementSubmissions: attempts.filter(
            ({ submissionKind }) => submissionKind === "replacement"
          ).length,
          ...(!campaignContinues
            ? { terminalReason: "failure_limit_reached" }
            : {}),
        }
      : {}),
  };
  await store.writeManualQa(decidedManualQa);
  await store.writeAttempt(decidedAttempt);
  const decidedRun = await persistCampaignRun(store, run, (currentRun) => {
    const pendingManualQaQueue = currentRun.pendingManualQaQueue.filter(
      ({ attemptId: pendingAttemptId }) => pendingAttemptId !== attemptId
    );
    const status = pendingManualQaQueue.length > 0
      ? "waiting_for_manual_qa"
      : campaignContinues
        ? "running"
        : "completed_not_achieved";
    return parseCampaignRun({
      ...currentRun,
      status,
      completedAt: status === "completed_not_achieved" ? decidedAt : undefined,
      pendingManualQa: pendingManualQaQueue[0],
      pendingManualQaQueue,
      attemptSlots: currentRun.attemptSlots.map((slot) =>
        slot.attemptId === attemptId
          ? { ...slot, status: "completed", updatedAt: decidedAt }
          : slot
      ),
      result,
    });
  });
  const loopRun = await updateLinkedLoop({
    campaignRun: run,
    attemptId,
    verdict,
    campaignContinues,
    decidedAt,
    loopStore,
  });
  return {
    run: decidedRun,
    attempt: decidedAttempt,
    manualQa: decidedManualQa,
    ...(loopRun ? { loopRun } : {}),
  };
}

export function hashJsonEvidence(value) {
  return createHash("sha256")
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest("hex");
}

export async function verifyManualQaCandidate(store, manualQa) {
  const directory = store.attemptDirectory(
    manualQa.campaignRunId,
    manualQa.attemptId
  );
  for (const artifact of manualQa.candidateArtifacts) {
    if (!/^[a-z0-9-]+\.json$/.test(artifact.path)) {
      throw new Error(`Unsafe manual QA artifact path ${artifact.path}.`);
    }
    const contents = await readFile(path.join(directory, artifact.path));
    const actualHash = createHash("sha256").update(contents).digest("hex");
    if (actualHash !== artifact.sha256) {
      throw new Error(
        `Manual QA candidate artifact hash mismatch for ${artifact.kind}.`
      );
    }
  }
}

function assertArtifactIdentity(run, attempt, manualQa) {
  if (
    attempt.manualQa?.id !== manualQa.id ||
    run.revision.revisionKey !== attempt.revisionKey ||
    attempt.revisionKey !== manualQa.revisionKey
  ) {
    throw new Error("Manual QA verdict is stale or does not match the frozen candidate.");
  }
}

function assertPendingCandidate(run, attempt, manualQa, linkedLoop) {
  const campaignPendingManualQaQueue = run.pendingManualQaQueue?.length
    ? run.pendingManualQaQueue
    : run.pendingManualQa
      ? [run.pendingManualQa]
      : [];
  const campaignCandidateIsStale =
    !["running", "waiting_for_manual_qa"].includes(run.status) ||
    !campaignPendingManualQaQueue.some(
      ({ attemptId, manualQaId }) =>
        attemptId === attempt.id && manualQaId === manualQa.id
    );
  const repairPending =
    linkedLoop?.status === "waiting_for_campaign_repair" &&
    linkedLoop.activeCampaign?.campaignRunId === run.id &&
    campaignPendingManualQaQueue.some(
      (pending) =>
        pending?.attemptId === attempt.id && pending?.manualQaId === manualQa.id
    ) &&
    linkedLoop.campaignRepairs?.some(
      (repair) =>
        repair.status === "pending" &&
        repair.campaignRunId === run.id
    );
  if (campaignCandidateIsStale && !repairPending) {
    throw new Error("Manual QA verdict is stale or does not match the pending candidate.");
  }
}

async function updateLinkedLoop({
  campaignRun,
  attemptId,
  verdict,
  campaignContinues,
  decidedAt,
  loopStore,
}) {
  if (!campaignRun.loopId) return null;
  if (!loopStore) {
    throw new Error("A loop-linked manual QA verdict requires the campaign loop store.");
  }
  const update = (loopRun) => {
    const campaignPendingManualQaQueue = campaignRun.pendingManualQaQueue?.length
      ? campaignRun.pendingManualQaQueue
      : campaignRun.pendingManualQa
        ? [campaignRun.pendingManualQa]
        : [];
    const decisionLoopRun =
      loopRun.status === "waiting_for_campaign_repair" &&
      loopRun.activeCampaign?.campaignRunId === campaignRun.id &&
      campaignPendingManualQaQueue.length > 0
        ? {
            ...loopRun,
            pendingManualQa: campaignPendingManualQaQueue[0],
            pendingManualQaQueue: campaignPendingManualQaQueue,
          }
        : loopRun;
    return verdict === "approved" || campaignContinues
      ? resumeLoopAfterManualQaApproval(decisionLoopRun, {
          campaignRunId: campaignRun.id,
          attemptId,
          completedAt: decidedAt,
        })
      : rejectLoopManualQa(decisionLoopRun, {
          campaignRunId: campaignRun.id,
          attemptId,
          completedAt: decidedAt,
        });
  };
  if (typeof loopStore.updateRun === "function") {
    return loopStore.updateRun(campaignRun.loopId, update);
  }
  const updated = update(await loopStore.readRun(campaignRun.loopId));
  await loopStore.writeRun(updated);
  return updated;
}

async function persistCampaignRun(store, fallbackRun, update) {
  if (typeof store.updateRun === "function") {
    try {
      return await store.updateRun(fallbackRun.id, update);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const next = update(fallbackRun);
  await store.writeRun(next);
  return next;
}
