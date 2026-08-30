import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { createCampaignStore } from "./campaign-store.mjs";
import {
  blockCampaignLoop,
  extendCampaignLoop,
  pauseCampaignLoopForRepair,
  recoverCampaignLoop,
  resumeCampaignLoop,
  runCampaignLoopIsolation,
  startCampaignLoop,
  validateCampaignLoop,
} from "./loop-controller.mjs";
import {
  concludeCampaignLoop,
  discardCampaignLoop,
} from "./loop-lifecycle.mjs";
import { createCampaignLoopStore } from "./loop-store.mjs";
import { assertCampaignKnowledgeReconciled } from "./knowledge-cli.mjs";
import { remainingLoopBudgets } from "./loop-state.mjs";

export async function handleLoopCommand({ args, repoRoot }) {
  const stateRootOption = takeOption(args, "--state-root");
  const command = args.shift();
  if (!command || ["help", "--help", "-h"].includes(command)) {
    printLoopHelp();
    return;
  }
  if (stateRootOption && !["recover", "resume"].includes(command)) {
    throw new Error("--state-root is available only for loop recover or resume.");
  }
  const stateRoot = stateRootOption ? path.resolve(stateRootOption) : repoRoot;
  const loopStore = createCampaignLoopStore(stateRoot);
  const campaignStore = createCampaignStore(stateRoot);

  if (command === "validate") {
    const definitionPath = requiredOption(args, "--definition");
    assertNoArguments(args);
    const loaded = await validateCampaignLoop({ repoRoot, definitionPath });
    printAuthorizationEnvelope(loaded);
    return;
  }

  if (command === "run") {
    const definitionPath = requiredOption(args, "--definition");
    const authorization = requiredOption(args, "--authorize");
    const options = takeRunnerOptions(args);
    assertNoArguments(args);
    const result = await startCampaignLoop({
      repoRoot,
      definitionPath,
      authorization,
      loopStore,
      campaignStore,
      ...options,
    });
    printLoopSummary(result.run);
    return;
  }

  if (command === "resume") {
    const loopId = requiredOption(args, "--id");
    const fixReportPath = takeOption(args, "--fix-report");
    const options = takeRunnerOptions(args);
    assertNoArguments(args);
    await prepareFrozenLoopDefinition({
      repoRoot,
      stateRoot,
      loopId,
      loopStore,
    });
    const result = await resumeCampaignLoop({
      repoRoot,
      loopId,
      fixReportPath,
      loopStore,
      campaignStore,
      ...options,
    });
    printLoopSummary(result.run);
    return;
  }

  if (command === "recover") {
    const loopId = requiredOption(args, "--id");
    assertNoArguments(args);
    await prepareFrozenLoopDefinition({
      repoRoot,
      stateRoot,
      loopId,
      loopStore,
    });
    const result = await recoverCampaignLoop({
      repoRoot,
      loopId,
      loopStore,
    });
    printLoopSummary(result.run);
    return;
  }

  if (command === "extend") {
    const loopId = requiredOption(args, "--id");
    const additions = takeBudgetAdditions(args);
    const fixReportPath = takeOption(args, "--fix-report");
    const authorization = takeOption(args, "--authorize");
    const options = takeRunnerOptions(args);
    assertNoArguments(args);
    const result = await extendCampaignLoop({
      repoRoot,
      loopId,
      additions,
      authorization,
      fixReportPath,
      loopStore,
      campaignStore,
      ...options,
    });
    if (!authorization) {
      printExtensionPreview(result.preview);
    } else {
      printLoopSummary(result.run);
    }
    return;
  }

  if (command === "isolate") {
    const loopId = requiredOption(args, "--id");
    const profileId = requiredOption(args, "--profile");
    const options = takeRunnerOptions(args);
    assertNoArguments(args);
    const result = await runCampaignLoopIsolation({
      repoRoot,
      loopId,
      profileId,
      loopStore,
      campaignStore,
      ...options,
    });
    printLoopSummary(result.run);
    return;
  }

  if (command === "block") {
    const loopId = requiredOption(args, "--id");
    const reason = requiredOption(args, "--reason");
    assertNoArguments(args);
    const run = await blockCampaignLoop({ repoRoot, loopId, reason, loopStore });
    printLoopSummary(run);
    return;
  }

  if (command === "repair-campaign") {
    const loopId = requiredOption(args, "--id");
    const reason = requiredOption(args, "--reason");
    const campaignRunId = takeOption(args, "--campaign");
    assertNoArguments(args);
    const result = await pauseCampaignLoopForRepair({
      repoRoot,
      loopId,
      campaignRunId,
      reason,
      loopStore,
      campaignStore,
    });
    printLoopSummary(result.run);
    return;
  }

  if (command === "conclude") {
    const loopId = requiredOption(args, "--id");
    assertNoArguments(args);
    const run = await concludeCampaignLoop({ repoRoot, loopId, loopStore });
    printLoopSummary(run);
    return;
  }

  if (command === "discard") {
    const loopId = requiredOption(args, "--id");
    const force = takeFlag(args, "--force");
    assertNoArguments(args);
    const run = await discardCampaignLoop({
      repoRoot,
      loopId,
      force,
      loopStore,
    });
    printLoopSummary(run);
    return;
  }

  if (command === "report") {
    await loopStore.initialize();
    const loopId = requiredOption(args, "--id");
    assertNoArguments(args);
    printLoopSummary(await loopStore.readRun(loopId));
    return;
  }

  if (command === "publish") {
    await loopStore.initialize();
    const loopId = requiredOption(args, "--id");
    assertNoArguments(args);
    await assertCampaignKnowledgeReconciled({ repoRoot, loopId, loopStore });
    const summary = await loopStore.publish(loopId);
    console.log(`Published sanitized campaign-loop summary ${summary.id}.`);
    return;
  }

  throw new Error(
    `Unknown campaign loop command "${command}". Run npm run campaign -- loop --help.`
  );
}

async function prepareFrozenLoopDefinition({
  repoRoot,
  stateRoot,
  loopId,
  loopStore,
}) {
  if (path.resolve(repoRoot) === path.resolve(stateRoot)) {
    return;
  }
  await loopStore.initialize();
  const run = await loopStore.readRun(loopId);
  await replicateFrozenLoopDefinition({
    repoRoot,
    stateRoot,
    definitionPath: run.definitionPath,
  });
}

export async function replicateFrozenLoopDefinition({
  repoRoot,
  stateRoot,
  definitionPath,
}) {
  const sourcePath = resolveWithinRoot(stateRoot, definitionPath);
  const destinationPath = resolveWithinRoot(repoRoot, definitionPath);
  await mkdir(path.dirname(destinationPath), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  return destinationPath;
}

function resolveWithinRoot(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Frozen loop definition path escaped its repository root.");
  }
  return resolved;
}

function printAuthorizationEnvelope(loaded) {
  console.log(`VALID LOOP ${loaded.definition.id}`);
  console.log(`Definition hash: ${loaded.definitionHash}`);
  console.log(`Authorization token: ${loaded.definitionHash}`);
  console.log(`Campaign manifest: ${loaded.campaign.manifest.id}`);
  console.log(`Campaign manifest hash: ${loaded.campaign.manifestHash}`);
  console.log(`External probe hash: ${loaded.probeHash}`);
  console.log(`Model: ${loaded.definition.model}`);
  console.log(`Revision: ${loaded.revision.revisionKey}`);
  console.log("Sequence:");
  for (const step of loaded.definition.sequence) {
    const execution = loaded.executionPolicies[step.id];
    console.log(
      `  ${step.id}: ${step.cohort}; ${formatProviderModes(step.providerModes)}; ${execution.mode} execution (${execution.maxConcurrentAttempts} active, ${execution.maxPendingManualQa} pending review, ${execution.hash}); max ${step.maxCampaignRunsPerRevision} campaign(s) per revision; retry ${step.retryableClassifications.join(", ") || "none"}`
    );
  }
  console.log(
    `Ceilings: ${loaded.definition.limits.maxCampaignRuns} campaigns, ${loaded.definition.limits.maxSubmissions} submissions, ${loaded.definition.limits.maxFixCycles} fix cycles, ${loaded.definition.limits.maxAuxiliaryIsolationCampaigns} auxiliary isolations`
  );
  console.log(
    `Actual-provider ceilings: ${formatStageCounts(loaded.definition.limits.actualProviderCalls)}`
  );
  console.log(
    loaded.campaign.pricing
      ? `Pricing: ${loaded.campaign.pricing.snapshot.id} (${loaded.campaign.pricing.pricingHash})`
      : "Pricing: unpriced"
  );
  console.log(
    `Actual-provider cost ceiling: ${formatNanoUsd(loaded.definition.limits.maxActualProviderCostNanoUsd)}`
  );
  console.log(
    `Minimum proof path: ${loaded.minimums.campaignRuns} campaigns, ${loaded.minimums.submissions} submissions, ${formatStageCounts(loaded.minimums.actualProviderCalls)}`
  );
}

function printExtensionPreview(preview) {
  console.log(`VALID LOOP EXTENSION ${preview.loopId}`);
  console.log(`Extension hash: ${preview.authorizationHash}`);
  console.log(`Authorization token: ${preview.authorizationHash}`);
  console.log(
    `Usage: ${preview.usage.campaignRuns} campaigns, ${preview.usage.submissions} submissions, ${preview.usage.fixCycles} fix cycles, ${preview.usage.auxiliaryIsolationCampaigns} auxiliary isolations`
  );
  console.log(
    `Current ceilings: ${formatLoopLimits(preview.previousLimits)}`
  );
  console.log(`Additions: ${formatLoopLimits(preview.additions)}`);
  console.log(
    `Resulting ceilings: ${formatLoopLimits(preview.resultingLimits)}`
  );
  console.log(`Resume checkpoint: ${preview.exhaustionResume.status}`);
}

export function printLoopSummary(run) {
  const remaining = remainingLoopBudgets(run);
  console.log(`Campaign loop: ${run.id}`);
  console.log(`Status: ${run.status}`);
  console.log(
    `Revision cycle: ${run.currentRevision.cycle} (${run.currentRevision.revisionKey})`
  );
  console.log(`Branch: ${run.worktree.branch}`);
  console.log(`Worktree: ${run.worktree.path}`);
  console.log(
    `Usage: ${run.usage.campaignRuns}/${run.limits.maxCampaignRuns} campaigns, ${run.usage.submissions}/${run.limits.maxSubmissions} submissions, ${run.usage.fixCycles}/${run.limits.maxFixCycles} fix cycles`
  );
  console.log(
    `Sparkline-attributed actual-provider usage: ${formatStageCounts(run.usage.actualProviderCalls)}`
  );
  console.log(
    `Gross actual-provider usage: ${formatStageCounts(run.usage.grossActualProviderCalls ?? run.usage.actualProviderCalls)}`
  );
  console.log(
    `Actual-provider remaining: ${formatStageCounts(remaining.actualProviderCalls)}`
  );
  if (run.providerCost) {
    const gross =
      run.providerCost.grossExactNanoUsd +
      run.providerCost.grossEstimatedNanoUsd;
    const attributed =
      run.providerCost.attributedExactNanoUsd +
      run.providerCost.attributedEstimatedNanoUsd;
    const pending = run.providerCost.pendingReservations.reduce(
      (sum, reservation) => sum + reservation.totalNanoUsd,
      0
    );
    const overage = Math.max(
      0,
      gross + pending - (run.limits.maxActualProviderCostNanoUsd ?? Infinity)
    );
    console.log(
      `Provider cost: gross ${formatNanoUsd(gross)}, attributed ${formatNanoUsd(attributed)}, exact ${formatNanoUsd(run.providerCost.grossExactNanoUsd)}, estimated ${formatNanoUsd(run.providerCost.grossEstimatedNanoUsd)}, pending ${formatNanoUsd(pending)}`
    );
    console.log(
      `Provider cost budget: ${formatNanoUsd(run.limits.maxActualProviderCostNanoUsd)}; remaining ${formatNanoUsd(remaining.actualProviderCostNanoUsd)}; overage ${formatNanoUsd(overage)}`
    );
  } else {
    console.log("Provider cost: —");
  }
  for (const [index, step] of run.steps.entries()) {
    const marker = index === run.currentStepIndex ? "current" : step.status;
    console.log(
      `${step.id}: ${step.cohort} — ${marker}; ${step.campaignRunIds.length} campaign(s)`
    );
  }
  if (run.result) {
    console.log(`Sequence achieved: ${run.result.sequenceAchieved}`);
    console.log(`Mechanic proven: ${run.result.mechanicProven}`);
  }
  const pendingReviews = run.pendingManualQaQueue?.length
    ? run.pendingManualQaQueue
    : run.pendingManualQa
      ? [run.pendingManualQa]
      : [];
  if (pendingReviews.length > 0) {
    console.log(`Pending manual QA (${pendingReviews.length}):`);
    for (const pending of pendingReviews) {
      console.log(`  ${pending.campaignRunId}/${pending.attemptId}`);
      console.log(
        `  Review: npm run campaign -- review --campaign ${pending.campaignRunId} --attempt ${pending.attemptId}`
      );
    }
  }
  if (run.campaignRepairs?.length) {
    const pendingRepairs = run.campaignRepairs.filter(
      ({ status }) => status === "pending"
    ).length;
    console.log(
      `Campaign repairs: ${run.campaignRepairs.length} (${pendingRepairs} pending)`
    );
  }
  if (run.invalidReason) console.log(`Invalid: ${run.invalidReason}`);
  if (run.blockedReason) console.log(`Blocked: ${run.blockedReason}`);
  if (run.exhaustionReason) console.log(`Exhausted: ${run.exhaustionReason}`);
  if (run.budgetExtensions?.length) {
    console.log(`Budget extensions: ${run.budgetExtensions.length}`);
  }
  if (run.lifecycle) {
    console.log(
      `Lifecycle: ${run.lifecycle.action} from ${run.lifecycle.previousStatus} at ${run.lifecycle.at}`
    );
    console.log("Worktree: removed");
    console.log("Branch: removed");
  }
}

function takeRunnerOptions(args) {
  const headed = takeFlag(args, "--headed");
  const port = numberOption(args, "--port", 3117);
  const attemptTimeoutMs = numberOption(
    args,
    "--attempt-timeout-ms",
    Number(process.env.AICADE_CAMPAIGN_ATTEMPT_TIMEOUT_MS ?? 300_000)
  );
  return { headed, port, attemptTimeoutMs };
}

function formatProviderModes(modes) {
  return Object.entries(modes)
    .map(([stage, mode]) => `${stage}=${mode}`)
    .join(", ");
}

function formatStageCounts(counts) {
  return Object.entries(counts)
    .map(([stage, count]) => `${stage}=${count}`)
    .join(", ");
}

function formatLoopLimits(limits) {
  return `${limits.maxCampaignRuns} campaigns, ${limits.maxSubmissions} submissions, ${limits.maxFixCycles} fix cycles, ${limits.maxAuxiliaryIsolationCampaigns} auxiliary isolations; actual ${formatStageCounts(limits.actualProviderCalls)}; cost ${formatNanoUsd(limits.maxActualProviderCostNanoUsd)}`;
}

function takeBudgetAdditions(args) {
  const costUsd = takeOption(args, "--add-cost-usd");
  return {
    maxFixCycles: nonnegativeNumberOption(args, "--add-fix-cycles"),
    maxCampaignRuns: nonnegativeNumberOption(args, "--add-campaign-runs"),
    maxSubmissions: nonnegativeNumberOption(args, "--add-submissions"),
    maxAuxiliaryIsolationCampaigns: nonnegativeNumberOption(
      args,
      "--add-auxiliary-isolations"
    ),
    actualProviderCalls: {
      planning: nonnegativeNumberOption(args, "--add-planning-calls"),
      contract: nonnegativeNumberOption(args, "--add-contract-calls"),
      source: nonnegativeNumberOption(args, "--add-source-calls"),
    },
    ...(costUsd !== undefined
      ? { maxActualProviderCostNanoUsd: usdToNanoUsd(costUsd) }
      : {}),
  };
}

function usdToNanoUsd(value) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,9})?$/.test(value)) {
    throw new Error("--add-cost-usd must be a nonnegative USD amount with at most 9 decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const nanoUsd = Number(BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0")));
  if (!Number.isSafeInteger(nanoUsd)) {
    throw new Error("--add-cost-usd exceeds safe nano-USD precision.");
  }
  return nanoUsd;
}

function formatNanoUsd(value) {
  return value === undefined ? "—" : `$${(value / 1_000_000_000).toFixed(6)}`;
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

function numberOption(args, name, fallback) {
  const value = takeOption(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function nonnegativeNumberOption(args, name) {
  const value = takeOption(args, name);
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a nonnegative integer.`);
  }
  return parsed;
}

function takeFlag(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function assertNoArguments(args) {
  if (args.length > 0) {
    throw new Error(`Unexpected arguments: ${args.join(" ")}`);
  }
}

export function printLoopHelp() {
  console.log(`Campaign loop commands:
  npm run campaign -- loop validate --definition <path>
  npm run campaign -- loop run --definition <path> --authorize <definition-hash> [options]
  npm run campaign -- loop recover --id <loop-id> --state-root <path>
  npm run campaign -- loop resume --id <loop-id> [--fix-report <path>] [options]
  npm run campaign -- loop extend --id <loop-id> [additive budget options] [--fix-report <path>] [--authorize <extension-hash>] [options]
  npm run campaign -- loop isolate --id <loop-id> --profile <profile-id> [options]
  npm run campaign -- loop repair-campaign --id <loop-id> --reason <text> [--campaign <run-id>]
  npm run campaign -- loop block --id <loop-id> --reason <text>
  npm run campaign -- loop conclude --id <loop-id>
  npm run campaign -- loop discard --id <loop-id> [--force]
  npm run campaign -- loop report --id <loop-id>
  npm run campaign -- loop publish --id <loop-id>

Loop extension options:
  --add-fix-cycles <number>
  --add-campaign-runs <number>
  --add-submissions <number>
  --add-auxiliary-isolations <number>
  --add-planning-calls <number>
  --add-contract-calls <number>
  --add-source-calls <number>
  --add-cost-usd <amount>          Add integer nano-USD capacity using a USD value with at most 9 decimals
  --authorize <extension-hash>      Apply the exact previewed extension and resume

Loop runner options:
  --headed
  --port <number>                  Dedicated production server port, default 3117
  --attempt-timeout-ms <number>    No-progress timeout per editor submission, default 300000
  --state-root <path>              Recover or resume from an accepted loop worktree while persisting state at this control root and copying its exact frozen definition into the worktree
`);
}
