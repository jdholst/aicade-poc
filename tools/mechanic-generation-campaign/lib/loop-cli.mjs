import { createCampaignStore } from "./campaign-store.mjs";
import {
  blockCampaignLoop,
  resumeCampaignLoop,
  runCampaignLoopIsolation,
  startCampaignLoop,
  validateCampaignLoop,
} from "./loop-controller.mjs";
import { createCampaignLoopStore } from "./loop-store.mjs";
import { remainingLoopBudgets } from "./loop-state.mjs";

export async function handleLoopCommand({ args, repoRoot }) {
  const command = args.shift();
  if (!command || ["help", "--help", "-h"].includes(command)) {
    printLoopHelp();
    return;
  }
  const loopStore = createCampaignLoopStore(repoRoot);
  const campaignStore = createCampaignStore(repoRoot);

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
    const summary = await loopStore.publish(loopId);
    console.log(`Published sanitized campaign-loop summary ${summary.id}.`);
    return;
  }

  throw new Error(
    `Unknown campaign loop command "${command}". Run npm run campaign -- loop --help.`
  );
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
    console.log(
      `  ${step.id}: ${step.cohort}; ${formatProviderModes(step.providerModes)}; max ${step.maxCampaignRunsPerRevision} campaign(s) per revision; retry ${step.retryableClassifications.join(", ") || "none"}`
    );
  }
  console.log(
    `Ceilings: ${loaded.definition.limits.maxCampaignRuns} campaigns, ${loaded.definition.limits.maxSubmissions} submissions, ${loaded.definition.limits.maxFixCycles} fix cycles, ${loaded.definition.limits.maxAuxiliaryIsolationCampaigns} auxiliary isolations`
  );
  console.log(
    `Actual-provider ceilings: ${formatStageCounts(loaded.definition.limits.actualProviderCalls)}`
  );
  console.log(
    `Minimum proof path: ${loaded.minimums.campaignRuns} campaigns, ${loaded.minimums.submissions} submissions, ${formatStageCounts(loaded.minimums.actualProviderCalls)}`
  );
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
    `Actual-provider usage: ${formatStageCounts(run.usage.actualProviderCalls)}`
  );
  console.log(
    `Actual-provider remaining: ${formatStageCounts(remaining.actualProviderCalls)}`
  );
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
  if (run.pendingManualQa) {
    console.log(
      `Pending manual QA: ${run.pendingManualQa.campaignRunId}/${run.pendingManualQa.attemptId}`
    );
    console.log(
      `Review: npm run campaign -- review --campaign ${run.pendingManualQa.campaignRunId}`
    );
  }
  if (run.invalidReason) console.log(`Invalid: ${run.invalidReason}`);
  if (run.blockedReason) console.log(`Blocked: ${run.blockedReason}`);
  if (run.exhaustionReason) console.log(`Exhausted: ${run.exhaustionReason}`);
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
  npm run campaign -- loop resume --id <loop-id> [--fix-report <path>] [options]
  npm run campaign -- loop isolate --id <loop-id> --profile <profile-id> [options]
  npm run campaign -- loop block --id <loop-id> --reason <text>
  npm run campaign -- loop report --id <loop-id>
  npm run campaign -- loop publish --id <loop-id>

Loop runner options:
  --headed
  --port <number>                  Dedicated production server port, default 3117
  --attempt-timeout-ms <number>    Terminal timeout per editor submission, default 300000
`);
}
