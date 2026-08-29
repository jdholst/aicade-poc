import { createHash } from "node:crypto";
import path from "node:path";

import {
  CAMPAIGN_LOOP_BUDGET_EXTENSION_SCHEMA_VERSION,
  CAMPAIGN_LOOP_RUN_SCHEMA_VERSION,
  loopBudgetAdditionsSchema,
} from "./loop-contracts.mjs";
import { isCountedCohortFailure } from "./contracts.mjs";

const ACTUAL_PROVIDER_STAGES = ["planning", "contract", "source"];
const PROOF_COHORTS = ["discovery", "repeatability", "variation"];

export function createInitialLoopRun({
  definition,
  definitionPath,
  definitionHash,
  authorizationHash,
  campaign,
  runId,
  createdAt,
  revision,
  controlRoot,
  worktreePath,
  branch,
  knowledgeManifestDigest,
}) {
  return {
    schemaVersion: CAMPAIGN_LOOP_RUN_SCHEMA_VERSION,
    id: runId,
    definitionPath: path.relative(controlRoot, definitionPath),
    definitionHash,
    authorizationHash,
    manifestId: campaign.manifest.id,
    manifestPath: path.relative(controlRoot, campaign.manifestPath),
    manifestHash: campaign.manifestHash,
    model: definition.model,
    status: "pending",
    createdAt,
    baseRevision: { head: revision.head, revisionKey: revision.revisionKey },
    currentRevision: {
      head: revision.head,
      revisionKey: revision.revisionKey,
      cycle: 0,
    },
    currentStepIndex: 0,
    usage: {
      fixCycles: 0,
      campaignRuns: 0,
      submissions: 0,
      auxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 0, contract: 0, source: 0 },
      grossActualProviderCalls: { planning: 0, contract: 0, source: 0 },
    },
    limits: definition.limits,
    worktree: {
      controlRoot,
      path: worktreePath,
      branch,
    },
    steps: definition.sequence.map((step) => ({
      id: step.id,
      cohort: step.cohort,
      status: "pending",
      campaignRunIds: [],
      sameRevisionRuns: 0,
    })),
    campaignLinks: [],
    fixCheckpointIds: [],
    campaignRepairs: [],
    knowledgePolicy: {
      required: true,
      baselineManifestDigest: knowledgeManifestDigest,
    },
    knowledgeReconciliationIds: [],
    budgetExtensions: [],
  };
}

export function startLoopCampaign(run, {
  campaignRunId,
  role,
  stepId,
  profileId,
  startedAt = new Date().toISOString(),
}) {
  if (run.activeCampaign) {
    throw new Error(`Loop already has active campaign ${run.activeCampaign.campaignRunId}.`);
  }
  if (run.usage.campaignRuns >= run.limits.maxCampaignRuns) {
    return exhaustLoop(run, "Global campaign-run ceiling reached.");
  }

  const budgetCheckpoint = createCampaignUsageCheckpoint(run.usage);
  const link = {
    campaignRunId,
    role,
    ...(stepId ? { stepId } : {}),
    ...(profileId ? { profileId } : {}),
    cycle: run.currentRevision.cycle,
    revisionKey: run.currentRevision.revisionKey,
    status: "running",
  };
  const next = {
    ...run,
    status: "running",
    startedAt: run.startedAt ?? startedAt,
    usage: {
      ...run.usage,
      campaignRuns: run.usage.campaignRuns + 1,
      auxiliaryIsolationCampaigns:
        run.usage.auxiliaryIsolationCampaigns + (role === "isolation" ? 1 : 0),
    },
    activeCampaign: {
      campaignRunId,
      role,
      ...(stepId ? { stepId } : {}),
      ...(profileId ? { profileId } : {}),
      budgetCheckpoint,
    },
    campaignLinks: [...run.campaignLinks, link],
  };

  if (role === "isolation") {
    return next;
  }

  const stepIndex = next.steps.findIndex(({ id }) => id === stepId);
  if (stepIndex !== next.currentStepIndex) {
    throw new Error(`Sequence campaign must target the current loop step ${next.currentStepIndex}.`);
  }
  return {
    ...next,
    steps: next.steps.map((step, index) =>
      index === stepIndex
        ? {
            ...step,
            status: "running",
            campaignRunIds: [...step.campaignRunIds, campaignRunId],
            sameRevisionRuns: step.sameRevisionRuns + 1,
          }
        : step
    ),
  };
}

export function finishSequenceCampaign(run, definition, {
  campaignRunId,
  status,
  attempts,
  pendingManualQa,
  completedAt = new Date().toISOString(),
}) {
  assertActiveCampaign(run, campaignRunId, "sequence");
  const stepDefinition = definition.sequence[run.currentStepIndex];
  const currentStep = run.steps[run.currentStepIndex];
  if (status === "waiting_for_manual_qa") {
    if (!pendingManualQa) {
      throw new Error("A campaign waiting for manual QA requires its pending review reference.");
    }
    return {
      ...run,
      status: "waiting_for_manual_qa",
      pendingManualQa,
      campaignLinks: run.campaignLinks.map((link) =>
        link.campaignRunId === campaignRunId
          ? { ...link, status: "waiting_for_manual_qa" }
          : link
      ),
    };
  }
  let next = finishCampaignLink(run, campaignRunId, status);

  if (status === "interrupted") {
    return { ...next, status: "interrupted" };
  }
  if (status === "invalid") {
    return {
      ...next,
      status: "invalid",
      completedAt,
      invalidReason: "A linked campaign became invalid.",
    };
  }
  if (status === "achieved") {
    if (
      PROOF_COHORTS.includes(stepDefinition.cohort) &&
      !attempts.some(
        (attempt) =>
          attempt.status === "success" && attempt.manualQa?.status === "approved"
      )
    ) {
      throw new Error(
        "A proof campaign cannot advance without manual QA approval evidence."
      );
    }
    const steps = next.steps.map((step, index) =>
      index === next.currentStepIndex
        ? {
            ...step,
            status: "achieved",
            revisionKey: next.currentRevision.revisionKey,
          }
        : step
    );
    const currentStepIndex = next.currentStepIndex + 1;
    if (currentStepIndex < steps.length) {
      return { ...next, steps, currentStepIndex, status: "running" };
    }
    return {
      ...next,
      steps,
      currentStepIndex,
      status: "achieved",
      completedAt,
      result: createLoopResult(steps, definition, next.currentRevision.revisionKey),
    };
  }

  const failedClassifications = attempts
    .filter((attempt) => attempt.status !== "success")
    .map((attempt) => attempt.classification);
  const failureLimitReached =
    ["repeatability", "variation"].includes(stepDefinition.cohort) &&
    attempts.filter(isCountedCohortFailure).length >= 3;
  const canRetry =
    !failureLimitReached &&
    failedClassifications.length > 0 &&
    failedClassifications.every((classification) =>
      stepDefinition.retryableClassifications.includes(classification)
    ) &&
    currentStep.sameRevisionRuns < stepDefinition.maxCampaignRunsPerRevision;

  if (canRetry) {
    return { ...next, status: "running" };
  }
  if (next.usage.fixCycles < next.limits.maxFixCycles) {
    return { ...next, status: "waiting_for_fix" };
  }
  return exhaustLoop(
    next,
    "The current step failed and no fix cycles remain.",
    completedAt,
    { status: "waiting_for_fix" }
  );
}

export function finishIsolationCampaign(run, {
  campaignRunId,
  status,
}) {
  assertActiveCampaign(run, campaignRunId, "isolation");
  const next = finishCampaignLink(run, campaignRunId, status);
  return status === "interrupted"
    ? { ...next, status: "interrupted" }
    : { ...next, status: "waiting_for_fix" };
}

export function resumeLoopAfterManualQaApproval(
  run,
  { campaignRunId, completedAt }
) {
  const pendingRun = run.status === "waiting_for_campaign_repair"
    ? resumeLoopAfterCampaignRepair(run, { completedAt })
    : run;
  assertActiveCampaign(pendingRun, campaignRunId, "sequence");
  if (
    pendingRun.status !== "waiting_for_manual_qa" ||
    pendingRun.pendingManualQa?.campaignRunId !== campaignRunId
  ) {
    throw new Error("Loop does not have the requested pending manual QA candidate.");
  }
  return {
    ...pendingRun,
    status: "running",
    pendingManualQa: undefined,
    campaignLinks: pendingRun.campaignLinks.map((link) =>
      link.campaignRunId === campaignRunId
        ? { ...link, status: "running" }
        : link
    ),
  };
}

export function pauseLoopForCampaignRepair(
  run,
  { id, reason, detectedAt = new Date().toISOString(), priorTerminal }
) {
  if (!run.activeCampaign) {
    throw new Error("A campaign repair requires an active campaign.");
  }
  if (!reason?.trim()) {
    throw new Error("A campaign repair requires a reason.");
  }
  if (run.status === "waiting_for_campaign_repair") {
    throw new Error("The campaign loop is already waiting for a campaign repair.");
  }
  const resumeStatus =
    run.status === "waiting_for_manual_qa" ? "waiting_for_manual_qa" : "running";
  const creditedUsage = resumeStatus === "running"
    ? createCampaignRepairCredit(run.usage, run.activeCampaign.budgetCheckpoint)
    : emptyCampaignRepairCredit();
  return {
    ...run,
    status: "waiting_for_campaign_repair",
    completedAt: undefined,
    usage: applyCampaignRepairCredit(run.usage, creditedUsage),
    campaignLinks: run.campaignLinks.map((link) =>
      link.campaignRunId === run.activeCampaign.campaignRunId
        ? { ...link, status: "waiting_for_campaign_repair" }
        : link
    ),
    campaignRepairs: [
      ...(run.campaignRepairs ?? []),
      {
        id,
        campaignRunId: run.activeCampaign.campaignRunId,
        reason: reason.trim(),
        detectedAt,
        resumeStatus,
        status: "pending",
        creditedUsage,
        ...(priorTerminal ? { priorTerminal } : {}),
      },
    ],
  };
}

export function resumeLoopAfterCampaignRepair(
  run,
  { completedAt = new Date().toISOString() } = {}
) {
  if (run.status !== "waiting_for_campaign_repair") {
    throw new Error("The campaign loop is not waiting for a campaign repair.");
  }
  const pendingRepairs = (run.campaignRepairs ?? []).filter(
    ({ status }) => status === "pending"
  );
  if (pendingRepairs.length !== 1) {
    throw new Error("The campaign loop requires exactly one pending campaign repair.");
  }
  const [repair] = pendingRepairs;
  if (run.activeCampaign?.campaignRunId !== repair.campaignRunId) {
    throw new Error("The pending campaign repair does not match the active campaign.");
  }
  const replacesRunningCampaign = repair.resumeStatus === "running";
  const replacedSequenceStepId =
    replacesRunningCampaign && run.activeCampaign.role === "sequence"
      ? run.activeCampaign.stepId
      : undefined;
  return {
    ...run,
    status:
      replacesRunningCampaign && run.activeCampaign.role === "isolation"
        ? "waiting_for_fix"
        : repair.resumeStatus,
    completedAt: undefined,
    activeCampaign: replacesRunningCampaign ? undefined : run.activeCampaign,
    pendingManualQa: replacesRunningCampaign ? undefined : run.pendingManualQa,
    usage: run.usage,
    steps: replacedSequenceStepId
      ? run.steps.map((step) =>
          step.id === replacedSequenceStepId
            ? {
                ...step,
                sameRevisionRuns: Math.max(0, step.sameRevisionRuns - 1),
              }
            : step
        )
      : run.steps,
    campaignLinks: run.campaignLinks.map((link) =>
      link.campaignRunId === repair.campaignRunId
        ? {
            ...link,
            status: replacesRunningCampaign
              ? "campaign_repair_replaced"
              : repair.resumeStatus,
          }
        : link
    ),
    campaignRepairs: run.campaignRepairs.map((entry) =>
      entry.id === repair.id
        ? { ...entry, status: "completed", completedAt }
        : entry
    ),
  };
}

export function rejectLoopManualQa(
  run,
  { campaignRunId, completedAt = new Date().toISOString() }
) {
  const pendingRun = run.status === "waiting_for_campaign_repair"
    ? resumeLoopAfterCampaignRepair(run, { completedAt })
    : run;
  assertActiveCampaign(pendingRun, campaignRunId, "sequence");
  if (
    pendingRun.status !== "waiting_for_manual_qa" ||
    pendingRun.pendingManualQa?.campaignRunId !== campaignRunId
  ) {
    throw new Error("Loop does not have the requested pending manual QA candidate.");
  }
  const next = {
    ...pendingRun,
    status: "waiting_for_fix",
    pendingManualQa: undefined,
    activeCampaign: undefined,
    campaignLinks: pendingRun.campaignLinks.map((link) =>
      link.campaignRunId === campaignRunId
        ? { ...link, status: "completed_not_achieved" }
        : link
    ),
  };
  return next.usage.fixCycles < next.limits.maxFixCycles
    ? next
    : exhaustLoop(
        next,
        "Manual gameplay QA failed and no fix cycles remain.",
        completedAt,
        { status: "waiting_for_fix" }
      );
}

export function applyFixCheckpoint(
  run,
  fix,
  { knowledgeReconciliationId } = {}
) {
  if (run.usage.fixCycles >= run.limits.maxFixCycles) {
    return exhaustLoop(run, "Fix-cycle ceiling reached.", undefined, {
      status: "waiting_for_fix",
    });
  }
  return {
    ...run,
    status: "running",
    completedAt: undefined,
    currentRevision: {
      ...fix.afterRevision,
      cycle: run.currentRevision.cycle + 1,
    },
    currentStepIndex: 0,
    usage: {
      ...run.usage,
      fixCycles: run.usage.fixCycles + 1,
    },
    steps: run.steps.map((step) => ({
      ...step,
      status: "pending",
      sameRevisionRuns: 0,
      revisionKey: undefined,
    })),
    fixCheckpointIds: [...run.fixCheckpointIds, fix.id],
    knowledgeReconciliationIds: knowledgeReconciliationId
      ? [...run.knowledgeReconciliationIds, knowledgeReconciliationId]
      : run.knowledgeReconciliationIds,
    activeCampaign: undefined,
    pendingManualQa: undefined,
    result: undefined,
  };
}

export function recordLoopSubmission(run) {
  if (run.usage.submissions >= run.limits.maxSubmissions) {
    return { allowed: false, run: exhaustLoop(run, "Submission ceiling reached.") };
  }
  return {
    allowed: true,
    run: {
      ...run,
      usage: { ...run.usage, submissions: run.usage.submissions + 1 },
    },
  };
}

export function recordActualProviderCall(run, stage) {
  if (!ACTUAL_PROVIDER_STAGES.includes(stage)) {
    throw new Error(`Unknown provider stage ${stage}.`);
  }
  const grossActualProviderCalls =
    run.usage.grossActualProviderCalls ?? run.usage.actualProviderCalls;
  if (grossActualProviderCalls[stage] >= run.limits.actualProviderCalls[stage]) {
    return {
      allowed: false,
      run: exhaustLoop(run, `${stage} provider-call ceiling reached.`),
    };
  }
  return {
    allowed: true,
    run: {
      ...run,
      usage: {
        ...run.usage,
        actualProviderCalls: {
          ...run.usage.actualProviderCalls,
          [stage]: run.usage.actualProviderCalls[stage] + 1,
        },
        grossActualProviderCalls: {
          ...grossActualProviderCalls,
          [stage]: grossActualProviderCalls[stage] + 1,
        },
      },
    },
  };
}

export function blockLoop(run, reason, completedAt = new Date().toISOString()) {
  return {
    ...run,
    status: "blocked",
    completedAt,
    blockedReason: reason,
    activeCampaign: undefined,
  };
}

export function invalidateLoop(run, reason, completedAt = new Date().toISOString()) {
  return {
    ...run,
    status: "invalid",
    completedAt,
    invalidReason: reason,
    activeCampaign: undefined,
  };
}

export function exhaustLoop(
  run,
  reason,
  completedAt = new Date().toISOString(),
  resume = { status: "running" }
) {
  const activeCampaign =
    resume.status === "running"
      ? resume.activeCampaign ?? run.activeCampaign
      : undefined;
  return {
    ...run,
    status: "exhausted",
    completedAt,
    exhaustionReason: reason,
    exhaustionResume: {
      status: resume.status,
      ...(activeCampaign ? { activeCampaign } : {}),
    },
    activeCampaign: undefined,
  };
}

export function createLoopBudgetExtensionPreview(run, additionsInput) {
  if (run.status !== "exhausted") {
    throw new Error(
      `Campaign loop ${run.id} cannot be extended from status ${run.status}.`
    );
  }
  const additions = loopBudgetAdditionsSchema.parse(additionsInput);
  const resultingLimits = addLoopLimits(run.limits, additions);
  const payload = {
    schemaVersion: CAMPAIGN_LOOP_BUDGET_EXTENSION_SCHEMA_VERSION,
    loopId: run.id,
    definitionHash: run.definitionHash,
    loopAuthorizationHash: run.authorizationHash,
    currentRevision: run.currentRevision,
    usage: run.usage,
    previousLimits: run.limits,
    additions,
    resultingLimits,
    exhaustionResume: run.exhaustionResume,
  };
  const authorizationHash = createHash("sha256")
    .update(
      `campaign-loop-budget-extension-authorization/v1:${canonicalJson(payload)}`
    )
    .digest("hex");
  return { ...payload, authorizationHash };
}

export function applyLoopBudgetExtension(
  run,
  { additions, authorization, createdAt = new Date().toISOString() }
) {
  const preview = createLoopBudgetExtensionPreview(run, additions);
  if (authorization !== preview.authorizationHash) {
    throw new Error(
      `Loop extension authorization does not match ${preview.authorizationHash}.`
    );
  }
  const resume = run.exhaustionResume;
  return {
    ...run,
    schemaVersion: CAMPAIGN_LOOP_RUN_SCHEMA_VERSION,
    status: resume.status,
    completedAt: undefined,
    limits: preview.resultingLimits,
    budgetExtensions: [
      ...(run.budgetExtensions ?? []),
      {
        schemaVersion: CAMPAIGN_LOOP_BUDGET_EXTENSION_SCHEMA_VERSION,
        authorizationHash: preview.authorizationHash,
        createdAt,
        previousStatus: "exhausted",
        previousLimits: run.limits,
        usageAtAuthorization: run.usage,
        additions: preview.additions,
        resultingLimits: preview.resultingLimits,
        resumeStatus: resume.status,
      },
    ],
    exhaustionReason: undefined,
    exhaustionResume: undefined,
    activeCampaign: resume.activeCampaign,
  };
}

export function remainingLoopBudgets(run) {
  return {
    fixCycles: run.limits.maxFixCycles - run.usage.fixCycles,
    campaignRuns: run.limits.maxCampaignRuns - run.usage.campaignRuns,
    submissions: run.limits.maxSubmissions - run.usage.submissions,
    auxiliaryIsolationCampaigns:
      run.limits.maxAuxiliaryIsolationCampaigns -
      run.usage.auxiliaryIsolationCampaigns,
    actualProviderCalls: Object.fromEntries(
      ACTUAL_PROVIDER_STAGES.map((stage) => [
        stage,
        run.limits.actualProviderCalls[stage] -
          (run.usage.grossActualProviderCalls ?? run.usage.actualProviderCalls)[stage],
      ])
    ),
  };
}

function createCampaignUsageCheckpoint(usage) {
  return {
    campaignRuns: usage.campaignRuns,
    submissions: usage.submissions,
    auxiliaryIsolationCampaigns: usage.auxiliaryIsolationCampaigns,
    actualProviderCalls: { ...usage.actualProviderCalls },
  };
}

function emptyCampaignRepairCredit() {
  return {
    campaignRuns: 0,
    submissions: 0,
    auxiliaryIsolationCampaigns: 0,
    actualProviderCalls: { planning: 0, contract: 0, source: 0 },
  };
}

function createCampaignRepairCredit(usage, checkpoint) {
  if (!checkpoint) return emptyCampaignRepairCredit();
  return {
    campaignRuns: usage.campaignRuns - checkpoint.campaignRuns,
    submissions: usage.submissions - checkpoint.submissions,
    auxiliaryIsolationCampaigns:
      usage.auxiliaryIsolationCampaigns - checkpoint.auxiliaryIsolationCampaigns,
    actualProviderCalls: Object.fromEntries(
      ACTUAL_PROVIDER_STAGES.map((stage) => [
        stage,
        usage.actualProviderCalls[stage] - checkpoint.actualProviderCalls[stage],
      ])
    ),
  };
}

function applyCampaignRepairCredit(usage, credit) {
  return {
    ...usage,
    campaignRuns: usage.campaignRuns - credit.campaignRuns,
    submissions: usage.submissions - credit.submissions,
    auxiliaryIsolationCampaigns:
      usage.auxiliaryIsolationCampaigns - credit.auxiliaryIsolationCampaigns,
    actualProviderCalls: Object.fromEntries(
      ACTUAL_PROVIDER_STAGES.map((stage) => [
        stage,
        usage.actualProviderCalls[stage] - credit.actualProviderCalls[stage],
      ])
    ),
  };
}

function finishCampaignLink(run, campaignRunId, status) {
  return {
    ...run,
    campaignLinks: run.campaignLinks.map((link) =>
      link.campaignRunId === campaignRunId ? { ...link, status } : link
    ),
    activeCampaign: undefined,
    pendingManualQa: undefined,
  };
}

function assertActiveCampaign(run, campaignRunId, role) {
  if (
    run.activeCampaign?.campaignRunId !== campaignRunId ||
    run.activeCampaign?.role !== role
  ) {
    throw new Error(`Campaign ${campaignRunId} is not the active ${role} campaign.`);
  }
}

function createLoopResult(steps, definition, finalRevisionKey) {
  const achievedStepIds = steps
    .filter(({ status }) => status === "achieved")
    .map(({ id }) => id);
  const proofSteps = new Map(
    definition.sequence.map((step, index) => [step.cohort, { step, state: steps[index] }])
  );
  const mechanicProven = PROOF_COHORTS.every((cohort) => {
    const proof = proofSteps.get(cohort);
    return (
      proof?.state.status === "achieved" &&
      proof.state.revisionKey === finalRevisionKey &&
      ACTUAL_PROVIDER_STAGES.every(
        (stage) => proof.step.providerModes[stage] === "actual"
      )
    );
  });
  return {
    sequenceAchieved: achievedStepIds.length === steps.length,
    mechanicProven,
    achievedStepIds,
    finalRevisionKey,
  };
}

function addLoopLimits(limits, additions) {
  return {
    maxFixCycles: limits.maxFixCycles + additions.maxFixCycles,
    maxCampaignRuns: limits.maxCampaignRuns + additions.maxCampaignRuns,
    maxSubmissions: limits.maxSubmissions + additions.maxSubmissions,
    maxAuxiliaryIsolationCampaigns:
      limits.maxAuxiliaryIsolationCampaigns +
      additions.maxAuxiliaryIsolationCampaigns,
    actualProviderCalls: Object.fromEntries(
      ACTUAL_PROVIDER_STAGES.map((stage) => [
        stage,
        limits.actualProviderCalls[stage] + additions.actualProviderCalls[stage],
      ])
    ),
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
