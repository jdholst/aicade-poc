import { readFile } from "node:fs/promises";
import path from "node:path";

import { createCampaignStore } from "./campaign-store.mjs";
import {
  createCampaignKnowledgeStore,
  createKnowledgeContextDigest,
  knowledgeEntriesDigest,
  selectCampaignKnowledge,
} from "./knowledge.mjs";
import { createCampaignLoopStore } from "./loop-store.mjs";
import { loadCampaignManifest } from "./manifest-loader.mjs";

export async function handleKnowledgeCommand({ args, repoRoot }) {
  const command = args.shift();
  if (!command || ["help", "--help", "-h"].includes(command)) {
    printKnowledgeHelp();
    return;
  }
  if (command === "validate") {
    assertNoArguments(args);
    const knowledge = await createCampaignKnowledgeStore(repoRoot).read();
    console.log(`VALID KNOWLEDGE ${knowledge.schemaVersion}`);
    console.log(`Manifest digest: ${knowledgeEntriesDigest(knowledge)}`);
    console.log(`Findings: ${knowledge.entries.length}`);
    console.log(`Reconciliations: ${knowledge.reconciliations.length}`);
    return;
  }
  if (command === "report") {
    const filters = {
      status: takeOption(args, "--status"),
      confidence: takeOption(args, "--confidence"),
      applicability: takeOption(args, "--applicability"),
      stage: takeOption(args, "--stage"),
      classification: takeOption(args, "--classification"),
      manifestId: takeOption(args, "--manifest"),
    };
    assertNoArguments(args);
    const knowledge = await createCampaignKnowledgeStore(repoRoot).read();
    const findings = filterFindings(knowledge.entries, filters);
    console.log(`Campaign knowledge: ${findings.length}/${knowledge.entries.length} findings`);
    console.log(`Manifest digest: ${knowledgeEntriesDigest(knowledge)}`);
    for (const finding of findings) printFinding(finding);
    return;
  }
  if (!["context", "reconcile"].includes(command)) {
    throw new Error(
      `Unknown campaign knowledge command "${command}". Run npm run campaign -- knowledge --help.`
    );
  }

  const loopId = takeOption(args, "--loop");
  const campaignRunId = takeOption(args, "--campaign");
  if (Boolean(loopId) === Boolean(campaignRunId)) {
    throw new Error(`Knowledge ${command} requires exactly one of --loop or --campaign.`);
  }
  const json = takeFlag(args, "--json");
  const proposalPath =
    command === "reconcile" ? requiredOption(args, "--proposal") : undefined;
  assertNoArguments(args);
  const resolved = await resolveKnowledgeTarget({ repoRoot, loopId, campaignRunId });
  if (command === "reconcile") assertReconciliationAllowed(resolved);
  const knowledgeStore = createCampaignKnowledgeStore(resolved.targetRoot);
  const knowledge = await knowledgeStore.read();
  const context = await buildCampaignKnowledgeContext({
    repoRoot,
    knowledge,
    loopId,
    campaignRunId,
    campaignStore: resolved.campaignStore,
    loopStore: resolved.loopStore,
    targetRoot: resolved.targetRoot,
  });

  if (command === "context") {
    if (json) {
      console.log(JSON.stringify(context, null, 2));
    } else {
      printKnowledgeContext(context);
    }
    return;
  }

  const proposal = JSON.parse(
    await readFile(resolveSafeProposalPath(resolved.targetRoot, proposalPath), "utf8")
  );
  assertProposalSource(proposal.source, resolved);
  const updated = await knowledgeStore.reconcile(proposal, context);
  console.log(`RECONCILED KNOWLEDGE ${proposal.id}`);
  console.log(`Target: ${resolved.targetRoot}`);
  console.log(`Manifest digest: ${knowledgeEntriesDigest(updated)}`);
}

export async function buildCampaignKnowledgeContext({
  repoRoot,
  knowledge,
  loopId,
  campaignRunId,
  campaignStore = createCampaignStore(repoRoot),
  loopStore = createCampaignLoopStore(repoRoot),
  targetRoot = repoRoot,
}) {
  await Promise.all([campaignStore.initialize(), loopStore.initialize()]);
  let campaignIds;
  let manifestPath;
  let loopRun;
  if (loopId) {
    loopRun = await loopStore.readRun(loopId);
    campaignIds = loopRun.campaignLinks.map(({ campaignRunId: id }) => id);
    manifestPath = loopRun.manifestPath;
  } else {
    const run = await campaignStore.readRun(campaignRunId);
    if (run.loopId) {
      throw new Error(
        `Campaign ${campaignRunId} belongs to loop ${run.loopId}; use --loop ${run.loopId}.`
      );
    }
    campaignIds = [campaignRunId];
    manifestPath = run.manifestPath;
  }
  const loadedManifest = await loadCampaignManifest(
    path.join(targetRoot, manifestPath)
  );
  const reviewedEvidenceIds = new Set(
    knowledge.reconciliations.flatMap(({ evidenceReview }) =>
      evidenceReview.map(({ evidenceId }) => evidenceId)
    )
  );
  const evidence = [];
  for (const id of campaignIds) {
    let run;
    let attempts;
    try {
      [run, attempts] = await Promise.all([
        campaignStore.readRun(id),
        campaignStore.readAttempts(id),
      ]);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const missingEvidence = {
        kind: "loop_outcome",
        id: `${id}/missing-campaign-evidence`,
        campaignRunId: id,
        ...(loopId ? { loopId } : {}),
        stage: "unknown",
        quality: "fixture_diagnostic",
        outcome: "infrastructure_failure",
        summary: "The linked campaign run or attempt artifacts are missing.",
        observedAt:
          loopRun?.completedAt ?? loopRun?.createdAt ?? new Date(0).toISOString(),
      };
      if (!reviewedEvidenceIds.has(missingEvidence.id)) {
        evidence.push(missingEvidence);
      }
      continue;
    }
    for (const attempt of attempts) {
      const item = await createAttemptEvidence(campaignStore, run, attempt);
      if (item && !reviewedEvidenceIds.has(item.id)) evidence.push(item);
    }
  }
  if (loopId) {
    for (const fix of await loopStore.readFixes(loopId)) {
      const triggerEvidence = evidence.find(
        ({ campaignRunId: id }) => id === fix.triggerCampaignRunId
      );
      const item = {
        kind: "loop_fix",
        id: `${loopId}/${fix.id}`,
        loopId,
        fixId: fix.id,
        campaignRunId: fix.triggerCampaignRunId,
        stage: triggerEvidence?.stage ?? inferEvidenceStage(fix.diagnosis),
        quality: "verified_fix",
        outcome: fix.triggerClassification,
        summary: fix.diagnosis,
        observedAt: fix.createdAt,
      };
      if (!reviewedEvidenceIds.has(item.id)) evidence.push(item);
    }
  }
  evidence.sort(
    (left, right) =>
      left.observedAt.localeCompare(right.observedAt) || left.id.localeCompare(right.id)
  );
  const evidenceCriteria = evidence.map((item) => ({
    evidenceId: item.id,
    manifestId: loadedManifest.manifest.id,
    mechanicId: loadedManifest.manifest.mechanic.id,
    stage: item.stage ?? inferEvidenceStage(item.summary),
    classification: normalizeClassification(item.outcome),
  }));
  const criteria = evidenceCriteria.at(-1) ?? {
    manifestId: loadedManifest.manifest.id,
    mechanicId: loadedManifest.manifest.mechanic.id,
    stage: "unknown",
    classification: "unknown",
  };
  const selections = evidenceCriteria.map((item) =>
    selectCampaignKnowledge(knowledge, item)
  );
  const applicable = uniqueFindings(
    selections.flatMap(({ applicable: findings }) => findings)
  );
  const applicableIds = new Set(applicable.map(({ id }) => id));
  const related = uniqueFindings(
    selections
      .flatMap(({ related: findings }) => findings)
      .filter(({ id }) => !applicableIds.has(id))
  );
  const contextBase = {
    manifestDigest: knowledgeEntriesDigest(knowledge),
    criteria,
    evidenceCriteria,
    applicableFindingIds: applicable.map(({ id }) => id),
    applicable,
    related,
    evidence,
  };
  return {
    ...contextBase,
    contextDigest: createKnowledgeContextDigest(contextBase),
  };
}

export async function assertCampaignKnowledgeReconciled({
  repoRoot,
  loopId,
  campaignRunId,
  campaignStore = createCampaignStore(repoRoot),
  loopStore = createCampaignLoopStore(repoRoot),
}) {
  await Promise.all([campaignStore.initialize(), loopStore.initialize()]);
  const run = loopId
    ? await loopStore.readRun(loopId)
    : await campaignStore.readRun(campaignRunId);
  if (!run.knowledgePolicy.required) return;
  if (loopId && !["concluded", "discarded"].includes(run.status)) {
    throw new Error(
      "A knowledge-required loop must be concluded or discarded before publication."
    );
  }
  const knowledge = await createCampaignKnowledgeStore(repoRoot).read();
  const context = await buildCampaignKnowledgeContext({
    repoRoot,
    knowledge,
    loopId,
    campaignRunId,
    campaignStore,
    loopStore,
    targetRoot: repoRoot,
  });
  if (context.evidence.length > 0) {
    throw new Error(
      `Publication has unreconciled campaign knowledge: ${context.evidence
        .map(({ id }) => id)
        .join(", ")}.`
    );
  }
}

async function resolveKnowledgeTarget({ repoRoot, loopId, campaignRunId }) {
  const campaignStore = createCampaignStore(repoRoot);
  const loopStore = createCampaignLoopStore(repoRoot);
  await Promise.all([campaignStore.initialize(), loopStore.initialize()]);
  if (loopId) {
    const run = await loopStore.readRun(loopId);
    return {
      kind: "loop",
      run,
      loopId,
      campaignStore,
      loopStore,
      targetRoot:
        run.knowledgePolicy.required &&
        !["concluded", "discarded"].includes(run.status)
          ? run.worktree.path
          : repoRoot,
    };
  }
  const run = await campaignStore.readRun(campaignRunId);
  if (run.loopId) {
    throw new Error(
      `Campaign ${campaignRunId} belongs to loop ${run.loopId}; use --loop ${run.loopId}.`
    );
  }
  return {
    kind: "campaign",
    run,
    campaignRunId,
    campaignStore,
    loopStore,
    targetRoot: repoRoot,
  };
}

function assertReconciliationAllowed(resolved) {
  if (resolved.kind === "loop") {
    if (!["waiting_for_fix", "concluded", "discarded"].includes(resolved.run.status)) {
      throw new Error(
        `Loop knowledge reconciliation is unavailable from status ${resolved.run.status}.`
      );
    }
    return;
  }
  if (
    ["pending", "running", "waiting_for_manual_qa", "interrupted"].includes(
      resolved.run.status
    )
  ) {
    throw new Error(
      `Campaign knowledge reconciliation requires a completed campaign, not ${resolved.run.status}.`
    );
  }
}

function assertProposalSource(source, resolved) {
  if (resolved.kind === "loop") {
    if (source?.loopId !== resolved.loopId) {
      throw new Error(`Knowledge proposal must reference loop ${resolved.loopId}.`);
    }
    if (
      resolved.run.status === "waiting_for_fix" &&
      source.kind !== "fix_cycle"
    ) {
      throw new Error("A waiting-for-fix loop requires a fix-cycle reconciliation.");
    }
    if (
      ["concluded", "discarded"].includes(resolved.run.status) &&
      source.kind !== "loop_outcome"
    ) {
      throw new Error("A disposed loop requires a loop-outcome reconciliation.");
    }
    return;
  }
  if (
    source?.kind !== "campaign_outcome" ||
    source.campaignRunId !== resolved.campaignRunId
  ) {
    throw new Error(
      `Knowledge proposal must reference campaign outcome ${resolved.campaignRunId}.`
    );
  }
}

async function createAttemptEvidence(store, run, attempt) {
  let manualQa;
  if (attempt.manualQa && typeof store.readManualQa === "function") {
    try {
      manualQa = await store.readManualQa(run.id, attempt.id);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const approved = manualQa?.status === "approved" || attempt.manualQa?.status === "approved";
  const denied = manualQa?.status === "denied" || attempt.manualQa?.status === "denied";
  const failed = !["success", "awaiting_manual_qa"].includes(attempt.status);
  const diagnostic = run.cohort === "isolation";
  if (!approved && !denied && !failed && !diagnostic) return null;
  const fullActual = Object.values(attempt.providerModes ?? run.providerModes).every(
    (mode) => mode === "actual"
  );
  return {
    kind: manualQa ? "manual_qa" : "campaign_attempt",
    id: `${run.id}/${attempt.id}`,
    campaignRunId: run.id,
    attemptId: attempt.id,
    quality: approved
      ? "manual_qa_approved"
      : fullActual && !diagnostic
        ? "actual_submission"
        : "fixture_diagnostic",
    outcome: denied
      ? "manual_qa_rejected"
      : approved
        ? "success"
        : attempt.classification ?? attempt.status,
    summary:
      manualQa?.denialReason ??
      manualQa?.approvalNote ??
      attempt.failure ??
      `${run.cohort} attempt ${attempt.status}.`,
    observedAt: manualQa?.decidedAt ?? attempt.completedAt,
    stage: attempt.furthestStage ?? "unknown",
  };
}

function filterFindings(entries, filters) {
  return entries
    .filter((entry) => !filters.status || entry.status === filters.status)
    .filter(
      (entry) => !filters.confidence || entry.confidence === filters.confidence
    )
    .filter(
      (entry) =>
        !filters.applicability ||
        entry.scope.applicability === filters.applicability
    )
    .filter(
      (entry) => !filters.stage || entry.scope.stages.includes(filters.stage)
    )
    .filter(
      (entry) =>
        !filters.classification ||
        entry.scope.classifications.includes(filters.classification)
    )
    .filter(
      (entry) =>
        !filters.manifestId || entry.scope.manifestIds.includes(filters.manifestId)
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolveSafeProposalPath(targetRoot, proposalPath) {
  const absolute = path.resolve(targetRoot, proposalPath);
  const relative = path.relative(targetRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Knowledge proposal must be inside its reconciliation target.");
  }
  return absolute;
}

function printFinding(finding) {
  console.log(
    `${finding.id} r${finding.revision} ${finding.status}/${finding.confidence}: ${finding.title}`
  );
  console.log(`  ${finding.guidance}`);
}

function printKnowledgeContext(context) {
  console.log(`Knowledge context: ${context.contextDigest}`);
  console.log(`Manifest digest: ${context.manifestDigest}`);
  console.log(
    `Criteria: ${context.criteria.manifestId}/${context.criteria.mechanicId}; ${context.criteria.stage}; ${context.criteria.classification}`
  );
  console.log(`Applicable findings: ${context.applicableFindingIds.join(", ") || "none"}`);
  for (const finding of context.applicable) printFinding(finding);
  console.log(`Related findings: ${context.related.map(({ id }) => id).join(", ") || "none"}`);
  console.log(`Unreconciled evidence: ${context.evidence.length}`);
  for (const item of context.evidence) {
    console.log(`  ${item.id}: ${item.outcome} — ${item.summary}`);
  }
}

function normalizeClassification(value) {
  return [
    "provider_failure",
    "provider_output_rejected",
    "pipeline_failure",
    "runtime_pipeline_failure",
    "semantic_runtime_failure",
    "infrastructure_failure",
    "awaiting_manual_qa",
    "manual_qa_rejected",
    "success",
  ].includes(value)
    ? value
    : "unknown";
}

function inferEvidenceStage(summary = "") {
  if (/first[- ]playable|phaser|runtime activation/i.test(summary)) {
    return "runtime_activation";
  }
  if (/deterministic|scenario|replay|evaluator/i.test(summary)) {
    return "deterministic_evaluation";
  }
  if (/source/i.test(summary)) return "source_generation";
  if (/contract/i.test(summary)) return "contract_generation";
  if (/planning/i.test(summary)) return "planning";
  if (/persist/i.test(summary)) return "persistence";
  if (/editor mount/i.test(summary)) return "editor_mount";
  return "unknown";
}

function uniqueFindings(findings) {
  return [...new Map(findings.map((finding) => [finding.id, finding])).values()].sort(
    (left, right) => left.id.localeCompare(right.id)
  );
}

function requiredOption(args, name) {
  const value = takeOption(args, name);
  if (!value) throw new Error(`Missing required option ${name}.`);
  return value;
}

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Option ${name} requires a value.`);
  }
  args.splice(index, 2);
  return value;
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function assertNoArguments(args) {
  if (args.length > 0) throw new Error(`Unexpected arguments: ${args.join(" ")}`);
}

function printKnowledgeHelp() {
  console.log(`Campaign knowledge commands

Usage:
  npm run campaign -- knowledge validate
  npm run campaign -- knowledge report [--status <active|retired>] [--confidence <level>] [--stage <stage>] [--classification <classification>] [--manifest <manifest-id>]
  npm run campaign -- knowledge context (--loop <loop-id> | --campaign <run-id>) [--json]
  npm run campaign -- knowledge reconcile (--loop <loop-id> | --campaign <run-id>) --proposal <path>
`);
}
