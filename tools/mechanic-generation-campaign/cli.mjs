#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runCampaign } from "./lib/browser-runner.mjs";
import { createCampaignStore } from "./lib/campaign-store.mjs";
import { loadCampaignWorktreeEnvironment } from "./lib/campaign-environment.mjs";
import { createCampaignLoopStore } from "./lib/loop-store.mjs";
import { startDashboardServer } from "./lib/dashboard-server.mjs";
import {
  importLegacyAttemptReports,
  parseTemporaryFixLedger,
  toJsonLines,
} from "./lib/legacy-importer.mjs";
import {
  loadCampaignManifest,
  validateManifestEnvironment,
} from "./lib/manifest-loader.mjs";
import {
  maximumCampaignSubmissions,
  resolveProviderModes,
} from "./lib/runner-policy.mjs";
import { resolveExecutionPolicy } from "./lib/parallel-execution.mjs";
import { clusterCampaignFailures } from "./lib/failure-clusters.mjs";
import { handleLoopCommand } from "./lib/loop-cli.mjs";
import {
  assertCampaignKnowledgeReconciled,
  handleKnowledgeCommand,
} from "./lib/knowledge-cli.mjs";
import {
  approveCampaignAttempt,
  denyCampaignAttempt,
} from "./lib/manual-qa.mjs";
import { runCampaignReview } from "./lib/review-runner.mjs";
import { refreshOpenAiPricing } from "./lib/pricing-refresh.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const store = createCampaignStore(repoRoot);
const loopStore = createCampaignLoopStore(repoRoot);

await main(process.argv.slice(2));

async function main(args) {
  const command = args.shift();
  if (!command || ["help", "--help", "-h"].includes(command)) {
    printHelp();
    return;
  }

  if (command === "validate") {
    const manifestPath = resolveManifestPath(requiredOption(args, "--manifest"));
    const loaded = await loadCampaignManifest(manifestPath);
    if (!takeFlag(args, "--structure-only")) {
      validateManifestEnvironment(
        loaded.manifest,
        loadCampaignWorktreeEnvironment(repoRoot)
      );
    }
    assertNoArguments(args);
    console.log(`VALID ${loaded.manifest.id}`);
    console.log(`Manifest hash: ${loaded.manifestHash}`);
    console.log(`Prompts: ${loaded.manifest.prompts.length}`);
    console.log(`Fixtures: ${Object.keys(loaded.fixturePaths).join(", ") || "none"}`);
    return;
  }

  if (command === "loop") {
    await handleLoopCommand({ args, repoRoot });
    return;
  }

  if (command === "knowledge") {
    await handleKnowledgeCommand({ args, repoRoot });
    return;
  }

  if (command === "pricing") {
    const pricingCommand = args.shift();
    if (pricingCommand !== "refresh") {
      throw new Error("Pricing supports only the refresh command.");
    }
    const check = takeFlag(args, "--check");
    const write = takeFlag(args, "--write");
    if (check === write) {
      throw new Error("pricing refresh requires exactly one of --check or --write.");
    }
    const effectiveAt = takeOption(args, "--effective-at");
    assertNoArguments(args);
    const result = await refreshOpenAiPricing({
      harnessRoot: import.meta.dirname,
      mode: write ? "write" : "check",
      effectiveAt,
    });
    console.log(`${result.status.toUpperCase()} ${result.snapshot.id}`);
    if (result.status === "drift") {
      console.log(`Facts drift: ${result.factsDrift ? "yes" : "no"}`);
      console.log(`Source drift: ${result.sourceDrift ? "yes" : "no"}`);
      process.exitCode = 1;
    }
    return;
  }

  if (command === "run") {
    const manifestPath = resolveManifestPath(requiredOption(args, "--manifest"));
    const cohort = requiredOption(args, "--cohort");
    const loaded = await loadCampaignManifest(manifestPath);
    const providerModes = resolveProviderModes(
      cohort,
      parseProviderModes(takeOption(args, "--provider-modes")) ?? loaded.manifest.providerModes,
      loaded.manifest.fixtures
    );
    const submissionCeiling = maximumCampaignSubmissions(
      cohort,
      loaded.manifest.prompts,
      loaded.manifest.cohorts[cohort]
    );
    const actualStages = Object.entries(providerModes)
      .filter(([, mode]) => mode === "actual")
      .map(([stage]) => stage);
    const resume = takeOption(args, "--resume");
    const executionPolicyInput = parseExecutionPolicyOptions(args);
    const executionPolicy = resume && !executionPolicyInput
      ? undefined
      : resolveExecutionPolicy({ cohort, policy: executionPolicyInput });
    let authorized =
      takeFlag(args, "--authorize-actual") ||
      process.env.AICADE_CAMPAIGN_ACTUAL_AUTHORIZED === "1";
    if (resume && !authorized) {
      await store.initialize();
      const existingRun = await store.readRun(resume);
      authorized = existingRun.authorization.actualProviders;
    }
    if (actualStages.length > 0 && !authorized) {
      throw new Error(
        `Campaign can submit ${submissionCeiling} prompt(s) with actual stages ${actualStages.join(", ")}. Re-run with --authorize-actual after campaign-level authorization.`
      );
    }
    console.log(`Campaign: ${loaded.manifest.id}`);
    console.log(`Cohort: ${cohort}`);
    console.log(`Submission ceiling: ${submissionCeiling}`);
    console.log(`Provider modes: ${formatProviderModes(providerModes)}`);
    if (executionPolicy) {
      console.log(
        `Execution: ${executionPolicy.mode} · max ${executionPolicy.maxConcurrentAttempts} active · max ${executionPolicy.maxPendingManualQa} pending review`
      );
      console.log(`Execution policy hash: ${executionPolicy.hash}`);
    }
    const result = await runCampaign({
      repoRoot,
      manifestPath,
      cohort,
      providerModes,
      baseUrl: takeOption(args, "--base-url"),
      headed: takeFlag(args, "--headed"),
      resume,
      port: numberOption(args, "--port", 3117),
      attemptTimeoutMs: numberOption(
        args,
        "--attempt-timeout-ms",
        Number(process.env.AICADE_CAMPAIGN_ATTEMPT_TIMEOUT_MS ?? 300_000)
      ),
      actualProviderAuthorized: authorized,
      executionPolicy,
    });
    assertNoArguments(args);
    printRunSummary(result.run, result.attempts);
    return;
  }

  if (command === "review") {
    const campaignRunId = requiredOption(args, "--campaign");
    const attemptId = takeOption(args, "--attempt");
    const port = numberOption(args, "--port", 3117);
    assertNoArguments(args);
    await loopStore.initialize();
    await runCampaignReview({
      repoRoot,
      store,
      loopStore,
      campaignRunId,
      attemptId,
      port,
      headed: true,
    });
    return;
  }

  if (command === "approve") {
    const campaignRunId = requiredOption(args, "--campaign");
    const attemptId = requiredOption(args, "--attempt");
    const note = takeOption(args, "--note");
    assertNoArguments(args);
    await Promise.all([store.initialize(), loopStore.initialize()]);
    const result = await approveCampaignAttempt({
      store,
      loopStore,
      campaignRunId,
      attemptId,
      note,
    });
    console.log(`APPROVED ${result.manualQa.id}`);
    console.log(
      result.run.loopId
        ? `Resume loop: npm run campaign -- loop resume --id ${result.run.loopId}`
        : `Resume campaign: npm run campaign -- run --manifest ${result.run.manifestPath} --cohort ${result.run.cohort} --provider-modes ${formatProviderModes(result.run.providerModes)} --resume ${result.run.id}`
    );
    return;
  }

  if (command === "deny") {
    const campaignRunId = requiredOption(args, "--campaign");
    const attemptId = requiredOption(args, "--attempt");
    const reason = requiredOption(args, "--reason");
    assertNoArguments(args);
    await Promise.all([store.initialize(), loopStore.initialize()]);
    const result = await denyCampaignAttempt({
      store,
      loopStore,
      campaignRunId,
      attemptId,
      reason,
    });
    console.log(`DENIED ${result.manualQa.id}`);
    console.log(`Reason: ${result.manualQa.denialReason}`);
    if (result.loopRun) {
      console.log(`Loop status: ${result.loopRun.status}`);
    }
    if (result.run.status === "running") {
      console.log(
        result.run.loopId
          ? `Resume loop: npm run campaign -- loop resume --id ${result.run.loopId}`
          : `Resume campaign: npm run campaign -- run --manifest ${result.run.manifestPath} --cohort ${result.run.cohort} --provider-modes ${formatProviderModes(result.run.providerModes)} --resume ${result.run.id}`
      );
    }
    return;
  }

  if (command === "dashboard") {
    await store.initialize();
    const server = await startDashboardServer({
      repoRoot,
      store,
      port: numberOption(args, "--port", 4310),
    });
    assertNoArguments(args);
    console.log(`Campaign dashboard: ${server.url}`);
    await waitForSignal();
    await server.close();
    return;
  }

  if (command === "report") {
    await store.initialize();
    const campaignRunId = requiredOption(args, "--campaign");
    assertNoArguments(args);
    const [run, attempts] = await Promise.all([
      store.readRun(campaignRunId),
      store.readAttempts(campaignRunId),
    ]);
    printRunSummary(run, attempts);
    return;
  }

  if (command === "publish") {
    await store.initialize();
    const campaignRunId = requiredOption(args, "--campaign");
    assertNoArguments(args);
    await assertCampaignKnowledgeReconciled({
      repoRoot,
      campaignRunId,
      campaignStore: store,
      loopStore,
    });
    const summary = await store.publish(campaignRunId);
    console.log(`Published sanitized campaign summary ${summary.id}.`);
    return;
  }

  if (command === "import-legacy") {
    const shouldWrite = takeFlag(args, "--write");
    const shouldCheck = takeFlag(args, "--check");
    if (shouldWrite === shouldCheck) {
      throw new Error("import-legacy requires exactly one of --check or --write.");
    }
    assertNoArguments(args);
    const [attempts, fixes] = await Promise.all([
      importLegacyAttemptReports(repoRoot),
      parseTemporaryFixLedger(repoRoot),
    ]);
    if (attempts.length !== 80 || fixes.length !== 33) {
      throw new Error(
        `Legacy import count changed: expected 80 attempts and 33 temporary fixes, received ${attempts.length} and ${fixes.length}.`
      );
    }
    if (shouldWrite) {
      await mkdir(store.dataRoot, { recursive: true });
      await Promise.all([
        writeFile(
          path.join(store.dataRoot, "legacy-attempts.jsonl"),
          toJsonLines(attempts),
          "utf8"
        ),
        writeFile(
          path.join(store.dataRoot, "legacy-temporary-fixes.jsonl"),
          toJsonLines(fixes),
          "utf8"
        ),
      ]);
    }
    console.log(`${shouldWrite ? "WROTE" : "VALID"} ${attempts.length} attempts and ${fixes.length} temporary fixes.`);
    return;
  }

  throw new Error(`Unknown campaign command "${command}". Run npm run campaign -- --help.`);
}

function resolveManifestPath(value) {
  if (!value.includes(path.sep) && !value.endsWith(".json")) {
    return path.join(import.meta.dirname, "manifests", `${value}.json`);
  }
  return path.resolve(repoRoot, value);
}

function parseProviderModes(value) {
  if (!value) return null;
  const modes = {};
  for (const pair of value.split(",")) {
    const [stage, mode] = pair.split("=");
    if (!["planning", "contract", "source"].includes(stage) || !["actual", "fixture"].includes(mode)) {
      throw new Error(`Invalid provider mode "${pair}".`);
    }
    modes[stage] = mode;
  }
  for (const stage of ["planning", "contract", "source"]) {
    if (!modes[stage]) throw new Error(`Provider modes must include ${stage}.`);
  }
  return modes;
}

function parseExecutionPolicyOptions(args) {
  const mode = takeOption(args, "--execution-mode");
  const maxConcurrentAttempts = takeOption(args, "--max-concurrent-attempts");
  const maxPendingManualQa = takeOption(args, "--max-pending-manual-qa");
  const planningConcurrency = takeOption(args, "--planning-concurrency");
  const contractConcurrency = takeOption(args, "--contract-concurrency");
  const sourceConcurrency = takeOption(args, "--source-concurrency");
  const scheduleOrder = takeOption(args, "--schedule-order");
  const hasExecutionOption = [
    mode,
    maxConcurrentAttempts,
    maxPendingManualQa,
    planningConcurrency,
    contractConcurrency,
    sourceConcurrency,
    scheduleOrder,
  ].some((value) => value !== undefined);
  if (!hasExecutionOption) return undefined;
  if (!mode) {
    throw new Error("Parallel execution options require --execution-mode.");
  }
  if (mode === "parallel" && (!maxConcurrentAttempts || !maxPendingManualQa)) {
    throw new Error(
      "Parallel execution requires --max-concurrent-attempts and --max-pending-manual-qa."
    );
  }
  const stageValues = [planningConcurrency, contractConcurrency, sourceConcurrency];
  const hasStageConcurrency = stageValues.some((value) => value !== undefined);
  if (hasStageConcurrency && stageValues.some((value) => value === undefined)) {
    throw new Error(
      "Stage concurrency requires planning, contract, and source values together."
    );
  }
  return {
    mode,
    ...(maxConcurrentAttempts
      ? { maxConcurrentAttempts: parsePositiveInteger(maxConcurrentAttempts, "--max-concurrent-attempts") }
      : {}),
    ...(maxPendingManualQa
      ? { maxPendingManualQa: parsePositiveInteger(maxPendingManualQa, "--max-pending-manual-qa") }
      : {}),
    ...(hasStageConcurrency
      ? {
          stageConcurrency: {
            planning: parsePositiveInteger(planningConcurrency, "--planning-concurrency"),
            contract: parsePositiveInteger(contractConcurrency, "--contract-concurrency"),
            source: parsePositiveInteger(sourceConcurrency, "--source-concurrency"),
          },
        }
      : {}),
    ...(scheduleOrder ? { scheduleOrder } : {}),
  };
}

function parsePositiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} must be a positive integer.`);
  }
  return parsed;
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
  if (!value || value.startsWith("--")) throw new Error(`Option ${name} requires a value.`);
  args.splice(index, 2);
  return value;
}

function numberOption(args, name, fallback) {
  const value = takeOption(args, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
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

function formatProviderModes(modes) {
  return Object.entries(modes).map(([stage, mode]) => `${stage}=${mode}`).join(",");
}

function printRunSummary(run, attempts) {
  console.log(`Campaign run: ${run.id}`);
  console.log(`Status: ${run.status}`);
  console.log(`Revision: ${run.revision.revisionKey}`);
  console.log(`Submissions: ${attempts.length}/${run.attemptCeiling}`);
  if (run.executionPolicy) {
    console.log(
      `Execution: ${run.executionPolicy.mode} · ${run.executionPolicy.maxConcurrentAttempts} active · ${run.executionPolicy.maxPendingManualQa} pending review max`
    );
    console.log(`Execution policy hash: ${run.executionPolicy.hash}`);
  }
  const activeSlots = (run.attemptSlots ?? []).filter(({ status }) =>
    ["reserved", "running"].includes(status)
  );
  if (activeSlots.length > 0) {
    console.log(`Active attempt slots: ${activeSlots.map(({ attemptId }) => attemptId).join(", ")}`);
  }
  if (run.result?.failureLimit !== undefined) {
    console.log(`Failures: ${run.result.failures ?? 0}/${run.result.failureLimit}`);
    console.log(
      `Remaining failure tolerance: ${run.result.remainingFailureTolerance ?? run.result.failureLimit}`
    );
    console.log(
      `Replacement submissions: ${run.result.replacementSubmissions ?? 0}/1`
    );
    console.log(
      `Cohort result: ${run.result.terminalReason === "failure_limit_reached" ? "stopped at failure limit" : run.result.terminalReason ?? "continuing"}`
    );
  }
  for (const attempt of attempts) {
    const replacement = attempt.submissionKind === "replacement"
      ? ` replacement for ${attempt.replacementForPromptId}`
      : "";
    console.log(
      `${attempt.id}:${replacement} ${attempt.status} at ${attempt.furthestStage} (${formatProviderModes(attempt.providerModes)})`
    );
  }
  const failureClusters = clusterCampaignFailures(attempts);
  if (failureClusters.length > 0) {
    console.log(`Failure clusters (${failureClusters.length}):`);
    for (const cluster of failureClusters) {
      console.log(
        `  ${cluster.id}: ${cluster.count} at ${cluster.furthestStage} (${cluster.classification}) · ${cluster.attemptIds.join(", ")}`
      );
    }
  }
  const pendingReviews = run.pendingManualQaQueue?.length
    ? run.pendingManualQaQueue
    : run.pendingManualQa
      ? [run.pendingManualQa]
      : [];
  if (pendingReviews.length > 0) {
    console.log(`Pending manual QA (${pendingReviews.length}):`);
    for (const pending of pendingReviews) {
      console.log(`  ${pending.attemptId}: npm run campaign -- review --campaign ${run.id} --attempt ${pending.attemptId}`);
    }
  }
}

function waitForSignal() {
  return new Promise((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
}

function printHelp() {
  console.log(`Mechanic generation campaign harness

Usage:
  npm run campaign -- validate --manifest <id-or-path> [--structure-only]
  npm run campaign -- run --manifest <id-or-path> --cohort <discovery|isolation|repeatability|variation> [options]
  npm run campaign -- review --campaign <run-id> [--attempt <attempt-id>] [--port 3117]
  npm run campaign -- approve --campaign <run-id> --attempt <attempt-id> [--note <text>]
  npm run campaign -- deny --campaign <run-id> --attempt <attempt-id> --reason <text>
  npm run campaign -- dashboard [--port 4310]
  npm run campaign -- report --campaign <run-id>
  npm run campaign -- publish --campaign <run-id>
  npm run campaign -- import-legacy <--check|--write>
  npm run campaign -- knowledge validate
  npm run campaign -- knowledge report [filters]
  npm run campaign -- knowledge context (--loop <loop-id> | --campaign <run-id>) [--json]
  npm run campaign -- knowledge reconcile (--loop <loop-id> | --campaign <run-id>) --proposal <path>
  npm run campaign -- pricing refresh --check
  npm run campaign -- pricing refresh --write --effective-at <YYYY-MM-DD>
  npm run campaign -- loop <validate|run|resume|extend|isolate|repair-campaign|reconcile-cost|block|conclude|discard|report|publish> [options]

Run options:
  --provider-modes planning=<actual|fixture>,contract=<actual|fixture>,source=<actual|fixture>
  --execution-mode <sequential|parallel>
                           Parallel is opt-in and limited to repeatability or variation
  --max-concurrent-attempts <1..3>
                           Maximum active browser attempts for a parallel run
  --max-pending-manual-qa <1..3>
                           Maximum queued candidates awaiting human review
  --planning-concurrency <1..3>
  --contract-concurrency <1..3>
  --source-concurrency <1..3>
                           Optional per-stage limits; provide all three together
  --schedule-order <legacy_prompt_major|round_robin>
                           Parallel variation defaults to round-robin ordering
  --authorize-actual       One authorization for the bounded campaign
  --base-url <url>         Attach to an existing server instead of build/start
  --headed                 Show the browser
  --resume <run-id>        Continue the same frozen campaign
  --port <number>          Dedicated production server port, default 3117
  --attempt-timeout-ms <n> Terminal timeout per submission, default 300000
`);
}
