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
  const pendingRun = parseCampaignRun({
    ...run,
    status: "waiting_for_manual_qa",
    completedAt: undefined,
    attemptIds: run.attemptIds.includes(attempt.id)
      ? run.attemptIds
      : [...run.attemptIds, attempt.id],
    pendingManualQa,
  });

  await store.writeAttempt(pendingAttempt, {
    ...evidence,
    [RAW_GENERATION_RUN_FILE]: generationRunRecord,
    [RAW_GAME_PACK_FILE]: gamePackRecord,
  });
  await store.writeManualQa(manualQa);
  await store.writeRun(pendingRun);
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
  const attempts = (await store.readAttempts(campaignRunId)).map((entry) =>
    entry.id === decidedAttempt.id ? decidedAttempt : entry
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
  const decidedRun = parseCampaignRun(
    campaignContinues
      ? {
          ...run,
          status: "running",
          completedAt: undefined,
          pendingManualQa: undefined,
          result,
        }
      : {
          ...run,
          status: "completed_not_achieved",
          completedAt: decidedAt,
          pendingManualQa: undefined,
          result,
        }
  );

  await store.writeManualQa(decidedManualQa);
  await store.writeAttempt(decidedAttempt);
  await store.writeRun(decidedRun);
  const loopRun = await updateLinkedLoop({
    campaignRun: run,
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
  const campaignCandidateIsStale =
    run.status !== "waiting_for_manual_qa" ||
    run.pendingManualQa?.attemptId !== attempt.id ||
    run.pendingManualQa?.manualQaId !== manualQa.id;
  const repairPending =
    linkedLoop?.status === "waiting_for_campaign_repair" &&
    linkedLoop.activeCampaign?.campaignRunId === run.id &&
    linkedLoop.pendingManualQa?.attemptId === attempt.id &&
    linkedLoop.pendingManualQa?.manualQaId === manualQa.id &&
    linkedLoop.campaignRepairs?.some(
      (repair) =>
        repair.status === "pending" &&
        repair.campaignRunId === run.id &&
        repair.resumeStatus === "waiting_for_manual_qa"
    );
  if (campaignCandidateIsStale && !repairPending) {
    throw new Error("Manual QA verdict is stale or does not match the pending candidate.");
  }
}

async function updateLinkedLoop({
  campaignRun,
  verdict,
  campaignContinues,
  decidedAt,
  loopStore,
}) {
  if (!campaignRun.loopId) return null;
  if (!loopStore) {
    throw new Error("A loop-linked manual QA verdict requires the campaign loop store.");
  }
  const loopRun = await loopStore.readRun(campaignRun.loopId);
  const updated = verdict === "approved" || campaignContinues
    ? resumeLoopAfterManualQaApproval(loopRun, {
        campaignRunId: campaignRun.id,
        completedAt: decidedAt,
      })
    : rejectLoopManualQa(loopRun, {
        campaignRunId: campaignRun.id,
        completedAt: decidedAt,
      });
  await loopStore.writeRun(updated);
  return updated;
}
