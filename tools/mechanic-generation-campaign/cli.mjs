#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runCampaign } from "./lib/browser-runner.mjs";
import { createCampaignStore } from "./lib/campaign-store.mjs";
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
import { createAttemptSchedule, resolveProviderModes } from "./lib/runner-policy.mjs";
import { handleLoopCommand } from "./lib/loop-cli.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const store = createCampaignStore(repoRoot);

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
      validateManifestEnvironment(loaded.manifest);
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

  if (command === "run") {
    const manifestPath = resolveManifestPath(requiredOption(args, "--manifest"));
    const cohort = requiredOption(args, "--cohort");
    const loaded = await loadCampaignManifest(manifestPath);
    const providerModes = resolveProviderModes(
      cohort,
      parseProviderModes(takeOption(args, "--provider-modes")) ?? loaded.manifest.providerModes,
      loaded.manifest.fixtures
    );
    const schedule = createAttemptSchedule(cohort, loaded.manifest.prompts);
    const actualStages = Object.entries(providerModes)
      .filter(([, mode]) => mode === "actual")
      .map(([stage]) => stage);
    const authorized =
      takeFlag(args, "--authorize-actual") ||
      process.env.AICADE_CAMPAIGN_ACTUAL_AUTHORIZED === "1";
    if (actualStages.length > 0 && !authorized) {
      throw new Error(
        `Campaign can submit ${schedule.length} prompt(s) with actual stages ${actualStages.join(", ")}. Re-run with --authorize-actual after campaign-level authorization.`
      );
    }
    console.log(`Campaign: ${loaded.manifest.id}`);
    console.log(`Cohort: ${cohort}`);
    console.log(`Submission ceiling: ${schedule.length}`);
    console.log(`Provider modes: ${formatProviderModes(providerModes)}`);
    const result = await runCampaign({
      repoRoot,
      manifestPath,
      cohort,
      providerModes,
      baseUrl: takeOption(args, "--base-url"),
      headed: takeFlag(args, "--headed"),
      resume: takeOption(args, "--resume"),
      port: numberOption(args, "--port", 3117),
      attemptTimeoutMs: numberOption(
        args,
        "--attempt-timeout-ms",
        Number(process.env.AICADE_CAMPAIGN_ATTEMPT_TIMEOUT_MS ?? 300_000)
      ),
    });
    assertNoArguments(args);
    printRunSummary(result.run, result.attempts);
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
    if (attempts.length !== 80 || fixes.length !== 32) {
      throw new Error(
        `Legacy import count changed: expected 80 attempts and 32 temporary fixes, received ${attempts.length} and ${fixes.length}.`
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
  return Object.entries(modes).map(([stage, mode]) => `${stage}=${mode}`).join(", ");
}

function printRunSummary(run, attempts) {
  console.log(`Campaign run: ${run.id}`);
  console.log(`Status: ${run.status}`);
  console.log(`Revision: ${run.revision.revisionKey}`);
  console.log(`Submissions: ${attempts.length}/${run.attemptCeiling}`);
  for (const attempt of attempts) {
    console.log(
      `${attempt.id}: ${attempt.status} at ${attempt.furthestStage} (${formatProviderModes(attempt.providerModes)})`
    );
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
  npm run campaign -- dashboard [--port 4310]
  npm run campaign -- report --campaign <run-id>
  npm run campaign -- publish --campaign <run-id>
  npm run campaign -- import-legacy <--check|--write>
  npm run campaign -- loop <validate|run|resume|isolate|block|report|publish> [options]

Run options:
  --provider-modes planning=<actual|fixture>,contract=<actual|fixture>,source=<actual|fixture>
  --authorize-actual       One authorization for the bounded campaign
  --base-url <url>         Attach to an existing server instead of build/start
  --headed                 Show the browser
  --resume <run-id>        Continue the same frozen campaign
  --port <number>          Dedicated production server port, default 3117
  --attempt-timeout-ms <n> Terminal timeout per submission, default 300000
`);
}
