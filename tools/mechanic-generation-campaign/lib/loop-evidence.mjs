const PROVIDER_STAGES = ["planning", "contract", "source"];

export async function buildCampaignLoopEvidence({
  loopId,
  store,
  loopStore,
  now = () => new Date().toISOString(),
}) {
  const loop = await loopStore.readRun(loopId);
  const fixes = await loopStore.readFixes(loopId);
  const cycleMetadata = collectCycleMetadata(loop);
  const eventsByCycle = new Map(
    [...cycleMetadata].map(([cycle]) => [cycle, []])
  );
  const campaignCycles = new Map();
  const lastCampaignTimeByCycle = new Map();

  for (const [linkIndex, link] of loop.campaignLinks.entries()) {
    const cycle = link.cycle ?? loop.currentRevision.cycle;
    campaignCycles.set(link.campaignRunId, cycle);
    ensureCycle(eventsByCycle, cycle);
    try {
      const run = await store.readRun(link.campaignRunId);
      const attempts = await store.readAttempts(run.id);
      const normalizedAttempts = await Promise.all(
        attempts.map((attempt) => normalizeAttempt(store, run, attempt))
      );
      const event = normalizeCampaignEvent(loop.id, link, run, normalizedAttempts);
      event.sourceOrder = linkIndex;
      eventsByCycle.get(cycle).push(event);
      lastCampaignTimeByCycle.set(
        cycle,
        run.completedAt ?? run.startedAt ?? run.createdAt
      );
      if (!cycleMetadata.has(cycle)) {
        cycleMetadata.set(cycle, run.revision?.revisionKey ?? link.revisionKey ?? "unknown");
      }
    } catch (error) {
      const occurredAt = lastCampaignTimeByCycle.get(cycle) ?? loop.createdAt;
      eventsByCycle.get(cycle).push({
        id: `campaign:${link.campaignRunId}:unavailable`,
        type: "evidence_unavailable",
        campaignRunId: link.campaignRunId,
        role: link.role,
        stepId: link.stepId,
        profileId: link.profileId,
        status: "evidence_unavailable",
        expectedStatus: link.status,
        occurredAt,
        reason: campaignEvidenceError(error, link.campaignRunId),
        sourceOrder: linkIndex,
      });
    }
  }

  for (const [repairIndex, repair] of (loop.campaignRepairs ?? []).entries()) {
    const cycle = campaignCycles.get(repair.campaignRunId) ?? loop.currentRevision.cycle;
    ensureCycle(eventsByCycle, cycle);
    eventsByCycle.get(cycle).push({
      id: `repair:${repair.id}`,
      type: "campaign_repair",
      campaignRunId: repair.campaignRunId,
      status: repair.status,
      occurredAt: repair.detectedAt,
      completedAt: repair.completedAt,
      reason: repair.reason,
      resumeStatus: repair.resumeStatus,
      creditedUsage: repair.creditedUsage,
      rawArtifactUrl: loopArtifactUrl(loop.id),
      sourceOrder: loop.campaignLinks.length + repairIndex,
    });
  }

  for (const [fixIndex, fix] of fixes.entries()) {
    const cycle = campaignCycles.get(fix.triggerCampaignRunId) ?? inferFixCycle(loop, fix);
    ensureCycle(eventsByCycle, cycle);
    eventsByCycle.get(cycle).push({
      id: `fix:${fix.id}`,
      type: "fix",
      fixId: fix.id,
      campaignRunId: fix.triggerCampaignRunId,
      classification: fix.triggerClassification,
      status: "recorded",
      occurredAt: fix.createdAt,
      diagnosis: fix.diagnosis,
      kind: fix.kind,
      temporaryFixIds: fix.temporaryFixIds ?? [],
      changedFiles: fix.changedFiles ?? [],
      verification: fix.verification ?? [],
      commit: fix.commit,
      revisionTransition: {
        from: revisionKey(fix.beforeRevision),
        to: revisionKey(fix.afterRevision),
      },
      rawArtifactUrl: `/artifacts/loops/${encodeURIComponent(loop.id)}/fixes/${encodeURIComponent(fix.id)}.json`,
      sourceOrder: loop.campaignLinks.length + (loop.campaignRepairs?.length ?? 0) + fixIndex,
    });
  }

  for (const [extensionIndex, extension] of (loop.budgetExtensions ?? []).entries()) {
    const occurredAt = extension.createdAt;
    const cycle = nearestCampaignCycle(eventsByCycle, occurredAt, loop.currentRevision.cycle);
    ensureCycle(eventsByCycle, cycle);
    eventsByCycle.get(cycle).push({
      id: `budget-extension:${extension.authorizationHash}`,
      type: "budget_extension",
      status: "applied",
      occurredAt,
      authorizationHash: extension.authorizationHash,
      previousStatus: extension.previousStatus,
      resumeStatus: extension.resumeStatus,
      additions: extension.additions,
      resultingLimits: extension.resultingLimits,
      rawArtifactUrl: loopArtifactUrl(loop.id),
      sourceOrder: extensionIndex,
    });
  }

  if (loop.lifecycle) {
    const cycle = loop.currentRevision.cycle;
    ensureCycle(eventsByCycle, cycle);
    eventsByCycle.get(cycle).push({
      id: `lifecycle:${loop.lifecycle.action}`,
      type: "lifecycle",
      status: loop.lifecycle.action,
      occurredAt: loop.lifecycle.at ?? loop.completedAt,
      action: loop.lifecycle.action,
      previousStatus: loop.lifecycle.previousStatus,
      worktreeRemoved: loop.lifecycle.worktreeRemoved,
      branchRemoved: loop.lifecycle.branchRemoved,
      reason: loop.lifecycle.reason,
      rawArtifactUrl: loopArtifactUrl(loop.id),
      sourceOrder: Number.MAX_SAFE_INTEGER,
    });
  }

  const cycles = [...eventsByCycle.entries()]
    .sort(([left], [right]) => left - right)
    .map(([cycle, events]) => ({
      cycle,
      revisionKey: cycleMetadata.get(cycle) ?? "unknown",
      events: events
        .sort(compareEvents)
        .map((event) => {
          const normalized = { ...event };
          delete normalized.sourceOrder;
          return normalized;
        }),
    }));
  const campaignEvents = cycles.flatMap(({ events }) =>
    events.filter(({ type }) => type === "campaign")
  );

  return {
    schemaVersion: "campaign-loop-evidence/v1",
    generatedAt: now(),
    loop: {
      id: loop.id,
      manifestId: loop.manifestId,
      model: loop.model,
      status: loop.status,
      createdAt: loop.createdAt,
      startedAt: loop.startedAt,
      completedAt: loop.completedAt,
      baseRevisionKey: revisionKey(loop.baseRevision),
      currentRevision: {
        cycle: loop.currentRevision.cycle,
        revisionKey: loop.currentRevision.revisionKey,
      },
      currentStepIndex: loop.currentStepIndex,
      steps: loop.steps,
      usage: loop.usage,
      limits: loop.limits,
      result: loop.result,
      artifactUrl: loopArtifactUrl(loop.id),
    },
    totals: {
      campaigns: campaignEvents.length,
      unavailableCampaigns: cycles.flatMap(({ events }) => events)
        .filter(({ type }) => type === "evidence_unavailable").length,
      submissions: campaignEvents.reduce((sum, event) => sum + event.submissions, 0),
      successes: campaignEvents.reduce((sum, event) => sum + event.successes, 0),
      failures: campaignEvents.reduce((sum, event) => sum + event.failures, 0),
      manualQa: sumManualQa(campaignEvents.map(({ manualQa }) => manualQa)),
      providerCalls: sumProviderCalls(campaignEvents.map(({ providerCalls }) => providerCalls)),
    },
    cycles,
  };
}

async function normalizeAttempt(store, run, attempt) {
  const manualQa = await readManualQa(store, run.id, attempt);
  const artifactLinks = uniqueLinks([
    attemptArtifactLink(run.id, attempt.id, "attempt.json"),
    ...(attempt.artifacts ?? []).map((file) => attemptArtifactLink(run.id, attempt.id, file)),
    ...(manualQa || attempt.manualQa
      ? [attemptArtifactLink(run.id, attempt.id, "manual-qa.json")]
      : []),
    ...(manualQa?.reviewSessions ?? []).flatMap((session) =>
      (session.artifacts ?? []).map((file) => attemptArtifactLink(run.id, attempt.id, file))
    ),
  ]);
  return {
    id: attempt.id,
    sequence: attempt.sequence,
    promptId: attempt.promptId,
    submissionKind: attempt.submissionKind,
    replacementForPromptId: attempt.replacementForPromptId,
    status: attempt.status,
    furthestStage: attempt.furthestStage,
    classification: attempt.classification,
    failure: attempt.failure,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    durationMs: attempt.durationMs,
    providerCalls: normalizeProviderCalls(attempt.providerCalls),
    manualQa: manualQa
      ? {
          status: manualQa.status,
          requestedAt: manualQa.requestedAt,
          decidedAt: manualQa.decidedAt,
          approvalNote: manualQa.approvalNote,
          denialReason: manualQa.denialReason,
          reviewSessions: manualQa.reviewSessions ?? [],
        }
      : attempt.manualQa
        ? { status: attempt.manualQa.status }
        : null,
    artifactLinks,
  };
}

function normalizeCampaignEvent(loopId, link, run, attempts) {
  const manualQa = sumManualQa(attempts.map((attempt) => attempt.manualQa));
  const providerCalls = sumProviderCalls(attempts.map((attempt) => attempt.providerCalls));
  return {
    id: `campaign:${run.id}`,
    type: "campaign",
    campaignRunId: run.id,
    role: link.role,
    stepId: link.stepId,
    profileId: link.profileId,
    cohort: run.cohort,
    status: run.status,
    providerModes: run.providerModes,
    revisionKey: run.revision?.revisionKey ?? link.revisionKey,
    model: run.model,
    occurredAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    durationMs: durationBetween(run.startedAt ?? run.createdAt, run.completedAt),
    submissions: run.result?.submissions ?? attempts.length,
    successes: run.result?.successes ?? attempts.filter(({ status }) => status === "success").length,
    failures: run.result?.failures ?? attempts.filter(({ status }) => !["success", "awaiting_manual_qa"].includes(status)).length,
    manualQa,
    providerCalls,
    attempts,
    rawArtifactUrl: `/artifacts/${encodeURIComponent(run.id)}/campaign-run.json`,
    loopArtifactUrl: loopArtifactUrl(loopId),
  };
}

async function readManualQa(store, campaignRunId, attempt) {
  if (!attempt.manualQa || typeof store.readManualQa !== "function") return null;
  try {
    return await store.readManualQa(campaignRunId, attempt.id);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function collectCycleMetadata(loop) {
  const metadata = new Map([[0, revisionKey(loop.baseRevision)]]);
  for (const link of loop.campaignLinks) {
    if (link.cycle !== undefined && link.revisionKey) {
      metadata.set(link.cycle, link.revisionKey);
    }
  }
  metadata.set(loop.currentRevision.cycle, loop.currentRevision.revisionKey);
  return metadata;
}

function inferFixCycle(loop, fix) {
  const after = revisionKey(fix.afterRevision);
  if (after === loop.currentRevision.revisionKey) {
    return Math.max(0, loop.currentRevision.cycle - 1);
  }
  return loop.currentRevision.cycle;
}

function nearestCampaignCycle(eventsByCycle, occurredAt, fallbackCycle) {
  if (!occurredAt) return fallbackCycle;
  let nearest = null;
  for (const [cycle, events] of eventsByCycle) {
    for (const event of events) {
      if (event.type !== "campaign" || !event.occurredAt || event.occurredAt > occurredAt) continue;
      if (!nearest || event.occurredAt > nearest.occurredAt) {
        nearest = { cycle, occurredAt: event.occurredAt };
      }
    }
  }
  return nearest?.cycle ?? fallbackCycle;
}

function compareEvents(left, right) {
  const time = (left.occurredAt ?? "").localeCompare(right.occurredAt ?? "");
  if (time !== 0) return time;
  return (left.sourceOrder ?? 0) - (right.sourceOrder ?? 0) || left.id.localeCompare(right.id);
}

function normalizeProviderCalls(calls = {}) {
  const normalized = Object.fromEntries(
    PROVIDER_STAGES.map((stage) => [stage, calls[stage] ?? 0])
  );
  return {
    ...normalized,
    total: PROVIDER_STAGES.reduce((sum, stage) => sum + normalized[stage], 0),
  };
}

function sumProviderCalls(values) {
  return normalizeProviderCalls(
    values.reduce((totals, calls = {}) => {
      for (const stage of PROVIDER_STAGES) totals[stage] += calls[stage] ?? 0;
      return totals;
    }, { planning: 0, contract: 0, source: 0 })
  );
}

function sumManualQa(values) {
  return values.reduce((totals, manualQa) => {
    if (manualQa && manualQa.status in totals) {
      totals[manualQa.status] += 1;
    } else if (manualQa) {
      for (const status of Object.keys(totals)) {
        totals[status] += manualQa[status] ?? 0;
      }
    }
    return totals;
  }, { pending: 0, approved: 0, denied: 0 });
}

function durationBetween(startedAt, completedAt) {
  if (!startedAt || !completedAt) return null;
  const duration = Date.parse(completedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function revisionKey(revision) {
  return revision?.revisionKey ?? revision?.head ?? "unknown";
}

function attemptArtifactLink(campaignRunId, attemptId, file) {
  return {
    label: file,
    url: `/artifacts/${encodeURIComponent(campaignRunId)}/${encodeURIComponent(attemptId)}/${encodeURIComponent(file)}`,
  };
}

function uniqueLinks(links) {
  const seen = new Set();
  return links.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function loopArtifactUrl(loopId) {
  return `/artifacts/loops/${encodeURIComponent(loopId)}/loop-run.json`;
}

function campaignEvidenceError(error, campaignRunId) {
  if (error?.code === "ENOENT") {
    return `Campaign evidence is unavailable for ${campaignRunId}.`;
  }
  return `Campaign evidence could not be read for ${campaignRunId}.`;
}

function ensureCycle(eventsByCycle, cycle) {
  if (!eventsByCycle.has(cycle)) eventsByCycle.set(cycle, []);
}
