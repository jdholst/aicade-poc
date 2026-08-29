import { readFile } from "node:fs/promises";
import path from "node:path";

import { runCampaign } from "./browser-runner.mjs";
import { createCampaignStore } from "./campaign-store.mjs";
import {
  createCampaignKnowledgeStore,
  knowledgeEntriesDigest,
} from "./knowledge.mjs";
import { validateFixKnowledgeCheckpoint } from "./knowledge-checkpoint.mjs";
import { loadCampaignLoopDefinition } from "./loop-definition-loader.mjs";
import { parseCampaignLoopFix } from "./loop-contracts.mjs";
import { createCampaignLoopStore } from "./loop-store.mjs";
import { parseTemporaryFixLedger } from "./legacy-importer.mjs";
import {
  applyLoopBudgetExtension,
  createInitialLoopRun,
  createLoopBudgetExtensionPreview,
  applyFixCheckpoint,
  blockLoop,
  exhaustLoop,
  finishIsolationCampaign,
  finishSequenceCampaign,
  invalidateLoop,
  pauseLoopForCampaignRepair,
  recordActualProviderCall,
  recordLoopSubmission,
  resumeLoopAfterCampaignRepair,
  startLoopCampaign,
} from "./loop-state.mjs";
import {
  changedFilesBetween,
  inspectLoopWorktree,
  prepareLoopWorktree,
} from "./loop-worktree.mjs";
import { validateManifestEnvironment } from "./manifest-loader.mjs";
import { inspectRevision } from "./revision.mjs";
import { createAttemptSchedule } from "./runner-policy.mjs";

const ACTUAL_PROVIDER_STAGES = ["planning", "contract", "source"];

export async function validateCampaignLoop({
  repoRoot,
  definitionPath,
  environment = process.env,
  inspectRevisionFn = inspectRevision,
}) {
  const loaded = await loadCampaignLoopDefinition({
    definitionPath,
    repoRoot,
  });
  if (loopUsesActualProvider(loaded.definition)) {
    validateManifestEnvironment(loaded.campaign.manifest, environment);
  }
  const revision = await inspectRevisionFn(repoRoot);
  if (revision.dirty) {
    throw new Error("Campaign loops require a clean control checkout.");
  }
  return { ...loaded, revision };
}

export async function startCampaignLoop({
  repoRoot,
  definitionPath,
  authorization,
  loopStore = createCampaignLoopStore(repoRoot),
  campaignStore = createCampaignStore(repoRoot),
  knowledgeStore = createCampaignKnowledgeStore(repoRoot),
  runCampaignFn = runCampaign,
  prepareWorktreeFn = prepareLoopWorktree,
  inspectWorktreeFn = inspectLoopWorktree,
  inspectRevisionFn = inspectRevision,
  environment = process.env,
  now = () => new Date(),
  headed = false,
  port = 3117,
  attemptTimeoutMs,
}) {
  const loaded = await validateCampaignLoop({
    repoRoot,
    definitionPath,
    environment,
    inspectRevisionFn,
  });
  if (authorization !== loaded.definitionHash) {
    throw new Error(
      `Loop authorization does not match definition ${loaded.definitionHash}.`
    );
  }
  await Promise.all([loopStore.initialize(), campaignStore.initialize()]);
  const knowledgeManifestDigest = knowledgeEntriesDigest(
    await knowledgeStore.read()
  );
  const createdAt = now().toISOString();
  const runId = createLoopRunId(loaded.definition.id, createdAt);
  const worktree = await prepareWorktreeFn({
    controlRoot: repoRoot,
    loopId: runId,
    baseHead: loaded.revision.head,
    worktreeRoot: loopStore.worktreeRoot(),
  });
  const executionRevision = await inspectWorktreeFn(worktree);
  if (executionRevision.dirty || executionRevision.head !== loaded.revision.head) {
    throw new Error("Prepared loop worktree does not match the authorized clean revision.");
  }
  let run = createInitialLoopRun({
    definition: loaded.definition,
    definitionPath: loaded.definitionPath,
    definitionHash: loaded.definitionHash,
    authorizationHash: loaded.authorizationHash,
    campaign: loaded.campaign,
    runId,
    createdAt,
    revision: executionRevision,
    controlRoot: repoRoot,
    worktreePath: worktree.path,
    branch: worktree.branch,
    knowledgeManifestDigest,
  });
  await loopStore.writeRun(run);
  return executeSequence({
    run,
    loaded,
    loopStore,
    campaignStore,
    runCampaignFn,
    inspectWorktreeFn,
    headed,
    port,
    attemptTimeoutMs,
  });
}

export async function resumeCampaignLoop({
  repoRoot,
  loopId,
  fixReportPath,
  loopStore = createCampaignLoopStore(repoRoot),
  campaignStore = createCampaignStore(repoRoot),
  runCampaignFn = runCampaign,
  inspectWorktreeFn = inspectLoopWorktree,
  changedFilesFn = changedFilesBetween,
  validateKnowledgeCheckpointFn = validateFixKnowledgeCheckpoint,
  environment = process.env,
  headed = false,
  port = 3117,
  attemptTimeoutMs,
}) {
  await Promise.all([loopStore.initialize(), campaignStore.initialize()]);
  let run = await loopStore.readRun(loopId);
  if (
    [
      "achieved",
      "blocked",
      "exhausted",
      "invalid",
      "concluded",
      "discarded",
    ].includes(run.status)
  ) {
    throw new Error(`Campaign loop ${loopId} is terminal with status ${run.status}.`);
  }
  if (run.status === "waiting_for_manual_qa") {
    throw new Error(
      `Campaign loop ${loopId} is waiting for manual QA. Approve or deny the pending candidate before resuming.`
    );
  }
  const worktree = await inspectWorktreeFn({
    path: run.worktree.path,
    branch: run.worktree.branch,
  });
  if (run.status === "waiting_for_campaign_repair") {
    const repairedCampaignRole = run.activeCampaign?.role;
    if (fixReportPath) {
      throw new Error("Campaign-tool repair resumes without a Sparkline fix report.");
    }
    if (
      worktree.dirty ||
      worktree.head !== run.currentRevision.head ||
      worktree.revisionKey !== run.currentRevision.revisionKey
    ) {
      throw new Error(
        "Campaign-tool repair cannot change the frozen Sparkline worktree revision."
      );
    }
    run = resumeLoopAfterCampaignRepair(run);
    await loopStore.writeRun(run);
    if (
      run.status === "waiting_for_manual_qa" ||
      (repairedCampaignRole === "isolation" && run.status === "waiting_for_fix")
    ) {
      return { run };
    }
  }
  if (run.status === "waiting_for_fix" && !fixReportPath) {
    const recovered = await recoverMisclassifiedCompletedRepair({
      run,
      campaignStore,
    });
    if (recovered !== run) {
      run = recovered;
      await loopStore.writeRun(run);
    }
  }
  let loaded;
  try {
    loaded = await reloadFrozenLoop({ repoRoot, run, environment });
  } catch (error) {
    if (error instanceof FrozenLoopCriteriaError) {
      run = invalidateLoop(run, error.message);
      await loopStore.writeRun(run);
      return { run };
    }
    throw error;
  }

  if (run.status === "waiting_for_fix") {
    if (!fixReportPath) {
      throw new Error("A loop waiting for a fix requires --fix-report.");
    }
    const fix = parseCampaignLoopFix(
      JSON.parse(await readFile(path.resolve(fixReportPath), "utf8"))
    );
    let knowledgeReconciliationId;
    try {
      knowledgeReconciliationId = await validateFixCheckpoint({
        repoRoot,
        run,
        fix,
        loaded,
        worktree,
        changedFilesFn,
        campaignStore,
        loopStore,
        validateKnowledgeCheckpointFn,
      });
    } catch (error) {
      if (error instanceof FrozenLoopCriteriaError) {
        run = invalidateLoop(run, error.message);
        await loopStore.writeRun(run);
        return { run };
      }
      throw error;
    }
    await loopStore.writeFix(fix);
    run = applyFixCheckpoint(run, fix, { knowledgeReconciliationId });
    await loopStore.writeRun(run);
  } else {
    if (fixReportPath) {
      throw new Error("Fix reports are accepted only while a loop is waiting_for_fix.");
    }
    if (
      worktree.dirty ||
      worktree.head !== run.currentRevision.head ||
      worktree.revisionKey !== run.currentRevision.revisionKey
    ) {
      run = invalidateLoop(
        run,
        "Interrupted loop worktree no longer matches its frozen revision."
      );
      await loopStore.writeRun(run);
      return { run };
    }
    run = { ...run, status: "running", completedAt: undefined };
    await loopStore.writeRun(run);
  }

  if (run.status === "exhausted") {
    return { run };
  }
  if (run.status === "waiting_for_manual_qa") {
    return { run };
  }
  if (run.activeCampaign?.role === "isolation") {
    return resumeActiveIsolation({
      run,
      loaded,
      loopStore,
      campaignStore,
      runCampaignFn,
      headed,
      port,
      attemptTimeoutMs,
    });
  }
  return executeSequence({
    run,
    loaded,
    loopStore,
    campaignStore,
    runCampaignFn,
    inspectWorktreeFn,
    headed,
    port,
    attemptTimeoutMs,
  });
}

export async function recoverCampaignLoop({
  repoRoot,
  loopId,
  loopStore = createCampaignLoopStore(repoRoot),
  environment = process.env,
}) {
  await loopStore.initialize();
  const run = await loopStore.readRun(loopId);
  if (run.status !== "invalid") {
    throw new Error(
      `Campaign loop ${loopId} can recover only from status invalid.`
    );
  }
  if (
    !run.invalidReason?.startsWith(
      "Frozen loop definition or criteria can no longer be loaded:"
    )
  ) {
    throw new Error(
      "Campaign loop recovery is limited to frozen-definition lookup failures."
    );
  }
  await reloadFrozenLoop({ repoRoot, run, environment });
  const currentStep = run.steps[run.currentStepIndex];
  const lastSequenceCampaign = [...run.campaignLinks]
    .reverse()
    .find(({ role }) => role === "sequence");
  if (
    currentStep?.status !== "running" ||
    lastSequenceCampaign?.stepId !== currentStep.id ||
    lastSequenceCampaign.status !== "completed_not_achieved" ||
    lastSequenceCampaign.revisionKey !== run.currentRevision.revisionKey ||
    run.pendingManualQa
  ) {
    throw new Error(
      "Invalid loop evidence does not derive an exact waiting_for_fix checkpoint."
    );
  }
  const recovered = {
    ...run,
    status: "waiting_for_fix",
    completedAt: undefined,
    activeCampaign: undefined,
  };
  await loopStore.writeRun(recovered);
  return { run: recovered };
}

export async function extendCampaignLoop({
  repoRoot,
  loopId,
  additions,
  authorization,
  fixReportPath,
  loopStore = createCampaignLoopStore(repoRoot),
  campaignStore = createCampaignStore(repoRoot),
  runCampaignFn = runCampaign,
  inspectWorktreeFn = inspectLoopWorktree,
  changedFilesFn = changedFilesBetween,
  environment = process.env,
  now = () => new Date(),
  headed = false,
  port = 3117,
  attemptTimeoutMs,
}) {
  await Promise.all([loopStore.initialize(), campaignStore.initialize()]);
  const stoppedRun = await loopStore.readRun(loopId);
  const preview = createLoopBudgetExtensionPreview(stoppedRun, additions);
  if (!authorization) {
    return { run: stoppedRun, preview };
  }
  const extended = applyLoopBudgetExtension(stoppedRun, {
    additions,
    authorization,
    createdAt: now().toISOString(),
  });
  await loopStore.writeRun(extended);
  if (extended.status === "waiting_for_fix" && !fixReportPath) {
    return { run: extended, preview };
  }
  const resumed = await resumeCampaignLoop({
    repoRoot,
    loopId,
    fixReportPath,
    loopStore,
    campaignStore,
    runCampaignFn,
    inspectWorktreeFn,
    changedFilesFn,
    environment,
    headed,
    port,
    attemptTimeoutMs,
  });
  return { ...resumed, preview };
}

async function resumeActiveIsolation({
  run: initialRun,
  loaded,
  loopStore,
  campaignStore,
  runCampaignFn,
  headed,
  port,
  attemptTimeoutMs,
}) {
  const active = initialRun.activeCampaign;
  const profile = loaded.definition.isolationProfiles.find(
    ({ id }) => id === active.profileId
  );
  if (!profile) {
    const invalid = invalidateLoop(
      initialRun,
      `Active isolation profile ${active.profileId} is no longer authorized.`
    );
    await loopStore.writeRun(invalid);
    return { run: invalid };
  }
  const state = { run: initialRun };
  try {
    const result = await runCampaignFn({
      repoRoot: state.run.worktree.path,
      manifestPath: path.join(state.run.worktree.path, state.run.manifestPath),
      cohort: "isolation",
      providerModes: profile.providerModes,
      headed,
      port,
      attemptTimeoutMs,
      store: campaignStore,
      loopContext: {
        loopId: state.run.id,
        loopStepId: profile.id,
        loopCycle: state.run.currentRevision.cycle,
      },
      providerCallBudget: createProviderCallBudget(state, loopStore),
      onSubmission: createSubmissionRecorder(state, loopStore),
      runId: active.campaignRunId,
      resume: active.campaignRunId,
    });
    state.run = state.run.status === "exhausted"
      ? state.run
      : finishIsolationCampaign(state.run, {
          campaignRunId: active.campaignRunId,
          status: result.run.status,
        });
    await loopStore.writeRun(state.run);
    return { run: state.run, campaign: result };
  } catch (error) {
    if (state.run.status !== "exhausted") {
      state.run = pauseLoopForCampaignRepair(state.run, {
        id: `campaign-repair-${(state.run.campaignRepairs ?? []).length + 1}`,
        reason: error instanceof Error ? error.message : String(error),
      });
      await loopStore.writeRun(state.run);
    }
    throw error;
  }
}

export async function runCampaignLoopIsolation({
  repoRoot,
  loopId,
  profileId,
  loopStore = createCampaignLoopStore(repoRoot),
  campaignStore = createCampaignStore(repoRoot),
  runCampaignFn = runCampaign,
  inspectWorktreeFn = inspectLoopWorktree,
  environment = process.env,
  headed = false,
  port = 3117,
  attemptTimeoutMs,
}) {
  await Promise.all([loopStore.initialize(), campaignStore.initialize()]);
  const initialRun = await loopStore.readRun(loopId);
  if (initialRun.status !== "waiting_for_fix") {
    throw new Error("Auxiliary isolation is available only while a loop is waiting_for_fix.");
  }
  let loaded;
  try {
    loaded = await reloadFrozenLoop({
      repoRoot,
      run: initialRun,
      environment,
    });
  } catch (error) {
    if (error instanceof FrozenLoopCriteriaError) {
      const invalid = invalidateLoop(initialRun, error.message);
      await loopStore.writeRun(invalid);
      return { run: invalid };
    }
    throw error;
  }
  const profile = loaded.definition.isolationProfiles.find(
    ({ id }) => id === profileId
  );
  if (!profile) {
    throw new Error(`Unknown authorized isolation profile ${profileId}.`);
  }
  const profileRuns = initialRun.campaignLinks.filter(
    (link) =>
      link.role === "isolation" &&
      link.profileId === profileId &&
      link.status !== "campaign_repair_replaced"
  ).length;
  if (
    initialRun.usage.auxiliaryIsolationCampaigns >=
      initialRun.limits.maxAuxiliaryIsolationCampaigns ||
    profileRuns >= profile.maxCampaignRuns
  ) {
    throw new Error(`Isolation profile ${profileId} reached its authorized ceiling.`);
  }
  const worktree = await inspectWorktreeFn({
    path: initialRun.worktree.path,
    branch: initialRun.worktree.branch,
  });
  if (
    worktree.dirty ||
    worktree.head !== initialRun.currentRevision.head ||
    worktree.revisionKey !== initialRun.currentRevision.revisionKey
  ) {
    const invalid = invalidateLoop(
      initialRun,
      "Loop worktree changed before auxiliary isolation."
    );
    await loopStore.writeRun(invalid);
    return { run: invalid };
  }
  const submissionCount = createAttemptSchedule(
    "isolation",
    loaded.campaign.manifest.prompts
  ).length;
  const capacityFailure = campaignCapacityFailure(
    initialRun,
    submissionCount,
    profile.providerModes
  );
  if (capacityFailure) {
    const exhausted = exhaustLoop(initialRun, capacityFailure, undefined, {
      status: "waiting_for_fix",
    });
    await loopStore.writeRun(exhausted);
    return { run: exhausted };
  }

  const campaignRunId = `${initialRun.id}-isolation-${profile.id}-c${
    initialRun.currentRevision.cycle
  }-r${profileRuns + 1}`;
  const state = {
    run: startLoopCampaign(initialRun, {
      campaignRunId,
      role: "isolation",
      profileId,
    }),
  };
  await loopStore.writeRun(state.run);
  try {
    const result = await runCampaignFn({
      repoRoot: state.run.worktree.path,
      manifestPath: path.join(state.run.worktree.path, state.run.manifestPath),
      cohort: "isolation",
      providerModes: profile.providerModes,
      headed,
      port,
      attemptTimeoutMs,
      store: campaignStore,
      loopContext: {
        loopId: state.run.id,
        loopStepId: profile.id,
        loopCycle: state.run.currentRevision.cycle,
      },
      providerCallBudget: createProviderCallBudget(state, loopStore),
      onSubmission: createSubmissionRecorder(state, loopStore),
      runId: campaignRunId,
    });
    if (state.run.status === "exhausted") {
      state.run = {
        ...state.run,
        campaignLinks: state.run.campaignLinks.map((link) =>
          link.campaignRunId === campaignRunId
            ? { ...link, status: "provider_call_budget_exhausted" }
            : link
        ),
      };
    } else {
      state.run = finishIsolationCampaign(state.run, {
        campaignRunId,
        status: result.run.status,
      });
    }
    await loopStore.writeRun(state.run);
    return { run: state.run, campaign: result };
  } catch (error) {
    if (state.run.status !== "exhausted") {
      state.run = pauseLoopForCampaignRepair(state.run, {
        id: `campaign-repair-${(state.run.campaignRepairs ?? []).length + 1}`,
        reason: error instanceof Error ? error.message : String(error),
      });
      await loopStore.writeRun(state.run);
    }
    throw error;
  }
}

export async function blockCampaignLoop({
  repoRoot,
  loopId,
  reason,
  loopStore = createCampaignLoopStore(repoRoot),
}) {
  await loopStore.initialize();
  const run = await loopStore.readRun(loopId);
  if (!["waiting_for_fix", "interrupted"].includes(run.status)) {
    throw new Error(`Loop ${loopId} cannot be blocked from status ${run.status}.`);
  }
  const blocked = blockLoop(run, reason);
  await loopStore.writeRun(blocked);
  return blocked;
}

export async function pauseCampaignLoopForRepair({
  repoRoot,
  loopId,
  campaignRunId,
  reason,
  loopStore = createCampaignLoopStore(repoRoot),
  campaignStore = createCampaignStore(repoRoot),
  now = () => new Date(),
}) {
  await loopStore.initialize();
  let run = await loopStore.readRun(loopId);
  let priorTerminal;
  if (!run.activeCampaign && campaignRunId) {
    await campaignStore.initialize?.();
    priorTerminal = {
      status: run.status,
      reason:
        run.exhaustionReason ??
        run.invalidReason ??
        run.blockedReason ??
        "Campaign-tool failure was previously recorded as terminal.",
      ...(run.blockedReason ? { blockedReason: run.blockedReason } : {}),
      ...(run.exhaustionReason
        ? { exhaustionReason: run.exhaustionReason }
        : {}),
      ...(run.invalidReason ? { invalidReason: run.invalidReason } : {}),
    };
    run = await restoreTerminalPendingCandidate({
      run,
      campaignRunId,
      campaignStore,
    });
  }
  if (!run.activeCampaign) {
    throw new Error(
      `Campaign loop ${loopId} has no active campaign to repair; pass --campaign for terminal recovery.`
    );
  }
  if (
    campaignRunId &&
    run.activeCampaign.campaignRunId !== campaignRunId
  ) {
    throw new Error(
      `Campaign ${campaignRunId} is not the active repair candidate.`
    );
  }
  if (!["running", "interrupted", "waiting_for_manual_qa"].includes(run.status)) {
    throw new Error(
      `Campaign loop ${loopId} cannot enter campaign repair from status ${run.status}.`
    );
  }
  const repaired = pauseLoopForCampaignRepair(run, {
    id: `campaign-repair-${(run.campaignRepairs ?? []).length + 1}`,
    reason,
    detectedAt: now().toISOString(),
    priorTerminal,
  });
  await loopStore.writeRun(repaired);
  return { run: repaired };
}

async function restoreTerminalPendingCandidate({
  run,
  campaignRunId,
  campaignStore,
}) {
  if (!["blocked", "exhausted", "invalid"].includes(run.status)) {
    throw new Error(
      `Campaign loop ${run.id} cannot recover a pending candidate from status ${run.status}.`
    );
  }
  const [campaignRun, attempts] = await Promise.all([
    campaignStore.readRun(campaignRunId),
    campaignStore.readAttempts(campaignRunId),
  ]);
  if (campaignRun.loopId !== run.id) {
    throw new Error(`Campaign ${campaignRunId} is not linked to loop ${run.id}.`);
  }
  const attempt = attempts.find(({ manualQa }) => manualQa?.status === "pending");
  if (!attempt) {
    throw new Error(`Campaign ${campaignRunId} has no pending manual-QA candidate.`);
  }
  const manualQa = await campaignStore.readManualQa(campaignRunId, attempt.id);
  if (manualQa.status !== "pending") {
    throw new Error(`Manual QA candidate ${manualQa.id} is already ${manualQa.status}.`);
  }
  const link = run.campaignLinks.find(
    ({ campaignRunId: linkedId }) => linkedId === campaignRunId
  );
  if (!link || link.revisionKey !== run.currentRevision.revisionKey) {
    throw new Error(
      `Campaign ${campaignRunId} does not match the loop's current revision.`
    );
  }
  const activeCampaign = {
    campaignRunId,
    role: link.role,
    ...(link.stepId ? { stepId: link.stepId } : {}),
    ...(link.profileId ? { profileId: link.profileId } : {}),
  };
  const pendingManualQa = {
    manualQaId: manualQa.id,
    campaignRunId,
    attemptId: attempt.id,
    promptId: attempt.promptId,
    cohort: campaignRun.cohort,
    revisionKey: attempt.revisionKey,
    requestedAt: manualQa.requestedAt,
    evidencePath: attempt.manualQa.path,
  };
  return {
    ...run,
    status: "waiting_for_manual_qa",
    completedAt: undefined,
    activeCampaign,
    pendingManualQa,
    exhaustionReason: undefined,
    exhaustionResume: undefined,
    invalidReason: undefined,
    blockedReason: undefined,
    campaignLinks: run.campaignLinks.map((entry) =>
      entry.campaignRunId === campaignRunId
        ? { ...entry, status: "waiting_for_manual_qa" }
        : entry
    ),
  };
}

async function executeSequence({
  run: initialRun,
  loaded,
  loopStore,
  campaignStore,
  runCampaignFn,
  inspectWorktreeFn,
  headed,
  port,
  attemptTimeoutMs,
}) {
  const state = { run: initialRun };
  while (["pending", "running"].includes(state.run.status)) {
    const step = loaded.definition.sequence[state.run.currentStepIndex];
    if (!step) break;
    const schedule = createAttemptSchedule(
      step.cohort,
      loaded.campaign.manifest.prompts
    );
    const active = state.run.activeCampaign;
    const isResume = active?.role === "sequence" && active.stepId === step.id;
    const campaignRunId = isResume
      ? active.campaignRunId
      : createLinkedCampaignRunId(state.run, step.id);

    if (isResume) {
      const existingAttempts = await campaignStore.readAttempts(campaignRunId);
      const capacityFailure = continuationCapacityFailure(
        state.run,
        Math.max(0, schedule.length - existingAttempts.length),
        step.providerModes
      );
      if (capacityFailure) {
        state.run = exhaustLoop(state.run, capacityFailure);
        await loopStore.writeRun(state.run);
        break;
      }
    } else {
      const capacityFailure = campaignCapacityFailure(
        state.run,
        schedule.length,
        step.providerModes
      );
      if (capacityFailure) {
        state.run = exhaustLoop(state.run, capacityFailure);
        await loopStore.writeRun(state.run);
        break;
      }
      state.run = startLoopCampaign(state.run, {
        campaignRunId,
        role: "sequence",
        stepId: step.id,
      });
      await loopStore.writeRun(state.run);
    }

    const providerCallBudget = createProviderCallBudget(state, loopStore);
    const onSubmission = createSubmissionRecorder(state, loopStore);
    try {
      const result = await runCampaignFn({
        repoRoot: state.run.worktree.path,
        manifestPath: path.join(
          state.run.worktree.path,
          state.run.manifestPath
        ),
        cohort: step.cohort,
        providerModes: step.providerModes,
        headed,
        port,
        attemptTimeoutMs,
        store: campaignStore,
        loopContext: {
          loopId: state.run.id,
          loopStepId: step.id,
          loopCycle: state.run.currentRevision.cycle,
        },
        providerCallBudget,
        onSubmission,
        runId: campaignRunId,
        ...(isResume ? { resume: campaignRunId } : {}),
      });

      if (state.run.status === "exhausted") {
        state.run = {
          ...state.run,
          campaignLinks: state.run.campaignLinks.map((link) =>
            link.campaignRunId === campaignRunId
              ? { ...link, status: "provider_call_budget_exhausted" }
              : link
          ),
        };
        await loopStore.writeRun(state.run);
        break;
      }

      const executionRevision = await inspectWorktreeFn({
        path: state.run.worktree.path,
        branch: state.run.worktree.branch,
      });
      if (
        executionRevision.dirty ||
        executionRevision.revisionKey !== state.run.currentRevision.revisionKey
      ) {
        state.run = invalidateLoop(
          state.run,
          "Loop worktree revision changed during a campaign."
        );
        await loopStore.writeRun(state.run);
        break;
      }

      state.run = finishSequenceCampaign(state.run, loaded.definition, {
        campaignRunId,
        status: result.run.status,
        attempts: result.attempts,
        pendingManualQa: result.run.pendingManualQa,
      });
      await loopStore.writeRun(state.run);
    } catch (error) {
      if (state.run.status !== "exhausted") {
        state.run = pauseLoopForCampaignRepair(state.run, {
          id: `campaign-repair-${(state.run.campaignRepairs ?? []).length + 1}`,
          reason: error instanceof Error ? error.message : String(error),
        });
        await loopStore.writeRun(state.run);
      }
      throw error;
    }
  }
  return { run: state.run };
}

function createProviderCallBudget(state, loopStore) {
  return {
    async consume(stage) {
      const result = recordActualProviderCall(state.run, stage);
      state.run = result.run;
      await loopStore.writeRun(state.run);
      return result.allowed;
    },
  };
}

function createSubmissionRecorder(state, loopStore) {
  return async () => {
    const result = recordLoopSubmission(state.run);
    state.run = result.run;
    await loopStore.writeRun(state.run);
    if (!result.allowed) {
      throw new Error("Loop submission ceiling reached before editor submission.");
    }
  };
}

async function recoverMisclassifiedCompletedRepair({ run, campaignStore }) {
  if (run.activeCampaign || run.pendingManualQa || run.usage.campaignRuns < 1) {
    return run;
  }
  const repair = [...(run.campaignRepairs ?? [])]
    .reverse()
    .find(
      (entry) =>
        entry.status === "completed" && entry.resumeStatus === "running"
    );
  if (!repair) return run;
  const link = run.campaignLinks.find(
    ({ campaignRunId }) => campaignRunId === repair.campaignRunId
  );
  const currentStep = run.steps[run.currentStepIndex];
  if (
    link?.role !== "sequence" ||
    link.status !== "completed_not_achieved" ||
    link.stepId !== currentStep?.id ||
    link.revisionKey !== run.currentRevision.revisionKey ||
    currentStep.status !== "running"
  ) {
    return run;
  }
  const attempts = await campaignStore.readAttempts(repair.campaignRunId);
  if (
    attempts.length === 0 ||
    !attempts.every(
      ({ classification }) => classification === "infrastructure_failure"
    )
  ) {
    return run;
  }
  return {
    ...run,
    status: "running",
    completedAt: undefined,
    usage: {
      ...run.usage,
      campaignRuns: run.usage.campaignRuns - 1,
    },
    steps: run.steps.map((step) =>
      step.id === link.stepId
        ? {
            ...step,
            sameRevisionRuns: Math.max(0, step.sameRevisionRuns - 1),
          }
        : step
    ),
    campaignLinks: run.campaignLinks.map((entry) =>
      entry.campaignRunId === repair.campaignRunId
        ? { ...entry, status: "campaign_repair_replaced" }
        : entry
    ),
  };
}

function campaignCapacityFailure(run, submissionCount, providerModes) {
  if (run.usage.campaignRuns >= run.limits.maxCampaignRuns) {
    return "Global campaign-run ceiling reached.";
  }
  if (run.usage.submissions + submissionCount > run.limits.maxSubmissions) {
    return "Remaining submission budget cannot contain the next complete campaign.";
  }
  for (const stage of ACTUAL_PROVIDER_STAGES) {
    if (
      providerModes[stage] === "actual" &&
      (run.usage.grossActualProviderCalls ?? run.usage.actualProviderCalls)[stage] + submissionCount >
        run.limits.actualProviderCalls[stage]
    ) {
      return `Remaining ${stage} provider-call budget cannot contain the next complete campaign.`;
    }
  }
  return null;
}

function continuationCapacityFailure(run, submissionCount, providerModes) {
  if (run.usage.submissions + submissionCount > run.limits.maxSubmissions) {
    return "Remaining submission budget cannot contain the interrupted campaign.";
  }
  for (const stage of ACTUAL_PROVIDER_STAGES) {
    if (
      providerModes[stage] === "actual" &&
      (run.usage.grossActualProviderCalls ?? run.usage.actualProviderCalls)[stage] + submissionCount >
        run.limits.actualProviderCalls[stage]
    ) {
      return `Remaining ${stage} provider-call budget cannot contain the interrupted campaign.`;
    }
  }
  return null;
}

function loopUsesActualProvider(definition) {
  return [...definition.sequence, ...definition.isolationProfiles].some(
    ({ providerModes }) =>
      ACTUAL_PROVIDER_STAGES.some((stage) => providerModes[stage] === "actual")
  );
}

function createLoopRunId(definitionId, createdAt) {
  return `${definitionId}-${createdAt
    .replace(/[-:.]/g, "")
    .replace("Z", "z")
    .toLowerCase()}`;
}

function createLinkedCampaignRunId(run, stepId) {
  return `${run.id}-${stepId}-c${run.currentRevision.cycle}-r${
    run.steps[run.currentStepIndex].campaignRunIds.length + 1
  }`;
}

async function reloadFrozenLoop({ repoRoot, run, environment }) {
  let loaded;
  try {
    loaded = await loadCampaignLoopDefinition({
      definitionPath: path.join(repoRoot, run.definitionPath),
      repoRoot,
    });
  } catch (error) {
    throw new FrozenLoopCriteriaError(
      `Frozen loop definition or criteria can no longer be loaded: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (
    loaded.definitionHash !== run.definitionHash ||
    loaded.authorizationHash !== run.authorizationHash ||
    loaded.campaign.manifestHash !== run.manifestHash ||
    loaded.campaign.manifest.id !== run.manifestId ||
    loaded.definition.model !== run.model
  ) {
    throw new FrozenLoopCriteriaError(
      "Loop definition or campaign criteria changed after authorization."
    );
  }
  if (loopUsesActualProvider(loaded.definition)) {
    validateManifestEnvironment(loaded.campaign.manifest, environment);
  }
  return loaded;
}

async function validateFixCheckpoint({
  repoRoot,
  run,
  fix,
  loaded,
  worktree,
  changedFilesFn,
  campaignStore,
  loopStore,
  validateKnowledgeCheckpointFn,
}) {
  if (fix.loopId !== run.id) {
    throw new Error(`Fix report belongs to loop ${fix.loopId}, not ${run.id}.`);
  }
  const lastSequenceCampaign = [...run.campaignLinks]
    .reverse()
    .find(({ role }) => role === "sequence");
  if (lastSequenceCampaign?.campaignRunId !== fix.triggerCampaignRunId) {
    throw new Error("Fix report must reference the latest failed sequence campaign.");
  }
  const triggerAttempts = await campaignStore.readAttempts(
    fix.triggerCampaignRunId
  );
  if (
    triggerAttempts.length > 0 &&
    !triggerAttempts.some(
      ({ classification }) => classification === fix.triggerClassification
    )
  ) {
    throw new Error(
      "Fix report trigger classification is absent from the linked campaign evidence."
    );
  }
  if (
    fix.beforeRevision.head !== run.currentRevision.head ||
    fix.beforeRevision.revisionKey !== run.currentRevision.revisionKey
  ) {
    throw new Error("Fix report before-revision does not match the loop revision.");
  }
  if (
    worktree.dirty ||
    worktree.head !== fix.afterRevision.head ||
    worktree.revisionKey !== fix.afterRevision.revisionKey ||
    worktree.head !== fix.commit
  ) {
    throw new Error("Fix report after-revision does not match the clean loop worktree commit.");
  }
  if (fix.afterRevision.head === fix.beforeRevision.head) {
    throw new Error("Fix checkpoint must advance the loop revision.");
  }
  const actualChangedFiles = await changedFilesFn(
    run.worktree.path,
    fix.beforeRevision.head,
    fix.afterRevision.head
  );
  if (
    JSON.stringify(actualChangedFiles) !==
    JSON.stringify([...fix.changedFiles].sort())
  ) {
    throw new Error(
      `Fix report changedFiles do not match Git: ${actualChangedFiles.join(", ") || "none"}.`
    );
  }
  let executionCriteria;
  try {
    executionCriteria = await loadCampaignLoopDefinition({
      definition: loaded.definition,
      definitionPath: path.join(run.worktree.path, run.definitionPath),
      repoRoot: run.worktree.path,
    });
  } catch (error) {
    throw new FrozenLoopCriteriaError(
      `A fix changed frozen loop criteria: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (
    executionCriteria.definitionHash !== run.definitionHash ||
    executionCriteria.campaign.manifestHash !== run.manifestHash ||
    executionCriteria.probeHash !== loaded.probeHash
  ) {
    throw new FrozenLoopCriteriaError(
      "A fix changed frozen loop prompts, thresholds, manifest, or probe criteria."
    );
  }
  if (fix.kind === "temporary") {
    const ledgerPath = "docs/phase-09-ticket-16-5-temporary-fix-ledger.md";
    if (!fix.changedFiles.includes(ledgerPath)) {
      throw new Error("Temporary fixes must include the canonical temporary-fix ledger.");
    }
    const ledgerFixIds = new Set(
      (await parseTemporaryFixLedger(run.worktree.path)).map(({ id }) => id)
    );
    const missingIds = fix.temporaryFixIds.filter((id) => !ledgerFixIds.has(id));
    if (missingIds.length > 0) {
      throw new Error(
        `Temporary-fix ledger is missing ${missingIds.join(", ")}.`
      );
    }
  }
  return validateKnowledgeCheckpointFn({
    repoRoot,
    run,
    fix,
    actualChangedFiles,
    campaignStore,
    loopStore,
  });
}

class FrozenLoopCriteriaError extends Error {}
