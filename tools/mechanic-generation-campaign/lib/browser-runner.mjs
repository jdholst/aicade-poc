import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { readCampaignBrowserStorage, latestGamePack, latestGenerationRun } from "./browser-storage.mjs";
import { createCampaignStore } from "./campaign-store.mjs";
import { CAMPAIGN_RUN_SCHEMA_VERSION, CAMPAIGN_ATTEMPT_SCHEMA_VERSION, scoreCampaign } from "./contracts.mjs";
import { adaptGeneratedMechanicFixture, adaptPlanningFixture } from "./fixture-adapter.mjs";
import { loadCampaignManifest, validateManifestEnvironment } from "./manifest-loader.mjs";
import { redactSensitive } from "./redaction.mjs";
import { inspectRevision } from "./revision.mjs";
import {
  classifyFurthestStage,
  createAttemptSchedule,
  createLoopbackBaseUrl,
  resolveProviderCredentialInput,
  resolveProviderModes,
} from "./runner-policy.mjs";

export async function runCampaign({
  repoRoot,
  manifestPath,
  cohort,
  providerModes: providerModeOverrides,
  baseUrl: attachedBaseUrl,
  headed = false,
  resume,
  port = 3117,
  attemptTimeoutMs = Number(process.env.AICADE_CAMPAIGN_ATTEMPT_TIMEOUT_MS ?? 300_000),
}) {
  const loaded = await loadCampaignManifest(manifestPath);
  const store = createCampaignStore(repoRoot);
  await store.initialize();
  const providerModes = resolveProviderModes(
    cohort,
    providerModeOverrides ?? loaded.manifest.providerModes,
    loaded.manifest.fixtures
  );
  if (Object.values(providerModes).includes("actual")) {
    validateManifestEnvironment(loaded.manifest);
  }
  const revision = await inspectRevision(repoRoot);
  if (["repeatability", "variation"].includes(cohort) && revision.dirty) {
    throw new Error(
      `${cohort} campaigns require a clean worktree. Run discovery or isolation while iterating.`
    );
  }

  const createdAt = new Date().toISOString();
  const campaignRunId = resume ?? createCampaignRunId(loaded.manifest.id, cohort, createdAt);
  const baseUrl = attachedBaseUrl ?? createLoopbackBaseUrl(port);
  const schedule = createAttemptSchedule(cohort, loaded.manifest.prompts);
  let run = resume
    ? await store.readRun(resume)
    : {
        schemaVersion: CAMPAIGN_RUN_SCHEMA_VERSION,
        id: campaignRunId,
        manifestId: loaded.manifest.id,
        manifestPath: path.relative(repoRoot, loaded.manifestPath),
        manifestHash: loaded.manifestHash,
        cohort,
        status: "pending",
        createdAt,
        model: loaded.manifest.model,
        providerModes,
        attemptCeiling: schedule.length,
        attemptIds: [],
        revision: compactRevision(revision),
        baseUrl,
      };
  validateResume(run, loaded, cohort, providerModes, revision);
  await store.writeRun(run);

  const fixtures = await loadFixtures(loaded.fixturePaths);
  const probeModule = await import(pathToFileURL(loaded.probePath).href);
  if (typeof probeModule.runProbe !== "function") {
    throw new Error(`Campaign probe ${loaded.probePath} does not export runProbe().`);
  }

  let server = null;
  let browser = null;
  try {
    const campaignDirectory = store.campaignDirectory(campaignRunId);
    await mkdir(campaignDirectory, { recursive: true });
    if (!attachedBaseUrl) {
      await runLoggedProcess(
        "npm",
        ["run", "build"],
        repoRoot,
        path.join(campaignDirectory, "build.log")
      );
      server = startLoggedProcess(
        "npm",
        ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
        repoRoot,
        path.join(campaignDirectory, "server.log")
      );
      await waitForUrl(baseUrl, server);
    } else {
      await waitForUrl(baseUrl, null);
    }

    const { chromium } = await import("@playwright/test");
    browser = await launchBrowser(chromium, headed);
    run = {
      ...run,
      status: "running",
      startedAt: run.startedAt ?? new Date().toISOString(),
    };
    await store.writeRun(run);

    const existingAttempts = await store.readAttempts(campaignRunId);
    for (const scheduled of schedule.slice(existingAttempts.length)) {
      const beforeAttemptRevision = await inspectRevision(repoRoot);
      if (beforeAttemptRevision.revisionKey !== run.revision.revisionKey) {
        run = {
          ...run,
          status: "invalid",
          completedAt: new Date().toISOString(),
          invalidReason: "Repository revision changed before the next submission.",
        };
        await store.writeRun(run);
        return { run, attempts: await store.readAttempts(campaignRunId) };
      }

      const attempt = await runBrowserAttempt({
        browser,
        store,
        run,
        manifest: loaded.manifest,
        scheduled,
        fixtures,
        probe: probeModule.runProbe,
        headed,
        attemptTimeoutMs,
      });
      run = {
        ...run,
        attemptIds: [...run.attemptIds, attempt.id],
      };
      await store.writeRun(run);

      const afterAttemptRevision = await inspectRevision(repoRoot);
      if (afterAttemptRevision.revisionKey !== run.revision.revisionKey) {
        run = {
          ...run,
          status: "invalid",
          completedAt: new Date().toISOString(),
          invalidReason: "Repository revision changed during a submitted attempt.",
        };
        await store.writeRun(run);
        return { run, attempts: await store.readAttempts(campaignRunId) };
      }
    }

    const attempts = await store.readAttempts(campaignRunId);
    const score = scoreCampaign(cohort, loaded.manifest, attempts);
    run = {
      ...run,
      status: score.status,
      completedAt: new Date().toISOString(),
      result: {
        successes: score.successes,
        diagnosticSuccesses: score.diagnosticSuccesses,
        submissions: score.submissions,
        qualifiesForMechanicProof: score.qualifiesForMechanicProof,
        missingSuccessfulPromptIds: score.missingSuccessfulPromptIds,
      },
    };
    await store.writeRun(run);
    return { run, attempts };
  } catch (error) {
    run = {
      ...run,
      status: "interrupted",
      completedAt: new Date().toISOString(),
      invalidReason: error instanceof Error ? error.message : String(error),
    };
    await store.writeRun(run);
    throw error;
  } finally {
    await browser?.close();
    await stopProcess(server);
  }
}

async function runBrowserAttempt({
  browser,
  store,
  run,
  manifest,
  scheduled,
  fixtures,
  probe,
  attemptTimeoutMs,
}) {
  const id = `a${String(scheduled.sequence).padStart(2, "0")}-${scheduled.promptId}`;
  const attemptDirectory = store.attemptDirectory(run.id, id);
  await mkdir(attemptDirectory, { recursive: true });
  const startedAt = new Date().toISOString();
  const providerCalls = zeroStageCounts();
  const fixtureCalls = zeroStageCounts();
  const networkCaptures = [];
  const actualResponseCaptures = new Map();
  const responseCaptureTasks = new Set();
  const browserIssues = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`));
  await installProviderInterception({
    page,
    providerModes: run.providerModes,
    fixtures,
    providerCalls,
    fixtureCalls,
    networkCaptures,
    actualResponseCaptures,
    responseCaptureTasks,
  });

  let terminal = { kind: "infrastructure_failure", text: "Attempt did not start." };
  let storage = { generationRuns: [], gamePacks: [] };
  let generationRun = null;
  let gamePack = null;
  let probeResult = { passed: false, assertions: [] };
  let thrownFailure = null;
  try {
    await page.goto(new URL("/editor", run.baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await enterControlledText(
      page.getByPlaceholder("Describe the starter game you want to build."),
      scheduled.prompt
    );
    await page.getByRole("button", { name: "Send prompt" }).click();
    await configureProviderInput(page, manifest, run.providerModes);
    await page.getByRole("button", { name: "Build the project" }).click();
    terminal = await waitForTerminalEditorState(page, attemptTimeoutMs);
    await page.screenshot({
      path: path.join(attemptDirectory, "terminal.png"),
      fullPage: true,
    });
    storage = await readCampaignBrowserStorage(page);
    generationRun = latestGenerationRun(storage);
    gamePack = latestGamePack(storage);
    if (terminal.kind === "ready" && gamePack) {
      probeResult = await probe({ page, gamePack, generationRun });
      await page.screenshot({
        path: path.join(attemptDirectory, "probe.png"),
        fullPage: true,
      });
    }
  } catch (error) {
    thrownFailure = error instanceof Error ? error.message : String(error);
    terminal = { kind: "infrastructure_failure", text: thrownFailure };
  }
  await Promise.all(responseCaptureTasks);

  const runtimeMounted = (await page.locator("iframe").count()) > 0;
  const runtimeHealthy = terminal.kind === "ready" && !browserIssues.some((issue) => /pageerror|runtime error/i.test(issue));
  const pipelinePassed = generationRun?.status === "succeeded" && Boolean(gamePack) && runtimeHealthy;
  const cleanupPassed =
    pipelinePassed && /cleanup|dispose|removed|removal/i.test(JSON.stringify(gamePack?.validationEvidence ?? []));
  const externalProbePassed = probeResult.passed === true;
  const status = pipelinePassed
    ? externalProbePassed
      ? "success"
      : "mechanic_incorrect"
    : terminal.kind === "infrastructure_failure"
      ? "infrastructure_failure"
      : "pipeline_failure";
  const completedAt = new Date().toISOString();
  const failure =
    status === "success"
      ? undefined
      : thrownFailure ?? summarizeAttemptFailure(generationRun, terminal.text, probeResult);
  const attempt = {
    schemaVersion: CAMPAIGN_ATTEMPT_SCHEMA_VERSION,
    id,
    campaignRunId: run.id,
    sequence: scheduled.sequence,
    promptId: scheduled.promptId,
    prompt: scheduled.prompt,
    status,
    terminalOutcome:
      status === "success"
        ? "accepted and externally verified"
        : status === "mechanic_incorrect"
          ? "accepted but external mechanic probe failed"
          : terminal.text,
    furthestStage: classifyFurthestStage({
      providerCalls,
      fixtureCalls,
      generationRun,
      gamePack,
      runtimeMounted,
      runtimeHealthy,
      cleanupPassed,
      externalProbePassed,
    }),
    classification: classifyFailure(status, generationRun),
    ...(failure ? { failure } : {}),
    providerModes: run.providerModes,
    providerCalls,
    fixtureCalls,
    startedAt,
    completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    revisionKey: run.revision.revisionKey,
    pipelinePassed,
    externalProbePassed,
    recordedOutcome: status,
    artifacts: ["attempt.json", "network-captures.json", "generation-run.json", "game-pack.json", "runtime-probe.json", "browser-issues.json", "terminal.png", ...(terminal.kind === "ready" && gamePack ? ["probe.png"] : [])],
    temporaryFixIds: [],
    ...(generationRun?.cost
      ? {
          cost: {
            quality: generationRun.cost.quality === "exact" ? "reported" : "estimated",
            usd: generationRun.cost.amountUsd,
          },
        }
      : { cost: { quality: "unknown" } }),
  };
  await store.writeAttempt(attempt, {
    "network-captures.json": networkCaptures,
    "generation-run.json": generationRun,
    "game-pack.json": gamePack,
    "runtime-probe.json": probeResult,
    "browser-issues.json": browserIssues,
  });
  await context.close();
  return attempt;
}

async function installProviderInterception({
  page,
  providerModes,
  fixtures,
  providerCalls,
  fixtureCalls,
  networkCaptures,
  actualResponseCaptures,
  responseCaptureTasks,
}) {
  page.on("response", (response) => {
    const capture = actualResponseCaptures.get(response.request());
    if (!capture) return;
    const task = captureActualResponse(response, capture);
    responseCaptureTasks.add(task);
    void task.finally(() => responseCaptureTasks.delete(task));
  });
  await page.route("**/api/creator-generation-planning", async (route) => {
    await resolveInterceptedRoute({
      route,
      stage: "planning",
      mode: providerModes.planning,
      fixture: fixtures.planning,
      providerCalls,
      fixtureCalls,
      networkCaptures,
      actualResponseCaptures,
    });
  });
  await page.route("**/api/generated-mechanic-provider", async (route) => {
    const requestBody = route.request().postDataJSON();
    const stage = requestBody.stage;
    if (!['contract', 'source'].includes(stage)) {
      throw new Error(`Unknown generated-mechanic provider stage "${stage}".`);
    }
    await resolveInterceptedRoute({
      route,
      stage,
      mode: providerModes[stage],
      fixture: fixtures[stage],
      providerCalls,
      fixtureCalls,
      networkCaptures,
      actualResponseCaptures,
      requestBody,
    });
  });
}

export async function resolveInterceptedRoute({
  route,
  stage,
  mode,
  fixture,
  providerCalls,
  fixtureCalls,
  networkCaptures,
  actualResponseCaptures,
  requestBody = route.request().postDataJSON(),
}) {
  if (mode === "fixture") {
    fixtureCalls[stage] += 1;
    const body = stage === "planning"
      ? adaptPlanningFixture(requestBody, fixture)
      : adaptGeneratedMechanicFixture(requestBody, fixture);
    networkCaptures.push(redactSensitive({ stage, source: "fixture", request: requestBody, response: body }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    return;
  }

  providerCalls[stage] += 1;
  const request = route.request();
  const headers = request.headers();
  const forwardedHeaders = {
    ...headers,
    origin: new URL(request.url()).origin,
    "sec-fetch-site": "same-origin",
  };
  const capture = redactSensitive({
    stage,
    source: "actual",
    request: requestBody,
    requestHeaders: {
      origin: forwardedHeaders.origin,
      "sec-fetch-site": forwardedHeaders["sec-fetch-site"],
    },
  });
  networkCaptures.push(capture);
  actualResponseCaptures?.set(request, capture);
  await route.continue({ headers: forwardedHeaders });
}

async function captureActualResponse(response, capture) {
  capture.responseStatus = response.status();
  try {
    const bodyText = await response.text();
    let body = bodyText;
    try {
      body = JSON.parse(bodyText);
    } catch {}
    capture.response = redactSensitive(body);
  } catch (error) {
    capture.responseCaptureError = error instanceof Error ? error.message : String(error);
  }
}

async function configureProviderInput(page, manifest, providerModes) {
  const input = resolveProviderCredentialInput(manifest, providerModes);
  if (input.kind === "keyword") {
    await enterControlledText(page.getByPlaceholder("Secret Word"), input.value);
  } else {
    await enterControlledText(page.getByPlaceholder("sk-..."), input.value);
  }
  const modelSelect = page.getByLabel("AI model");
  if (await modelSelect.count()) {
    await modelSelect.selectOption(manifest.model);
  }
}

async function enterControlledText(locator, value) {
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.pressSequentially(value);
}

async function waitForTerminalEditorState(page, timeoutMs) {
  await page.waitForFunction(
    () => {
      const lines = document.body.innerText.split("\n").map((line) => line.trim());
      return (
        lines.includes("Ready") ||
        lines.includes("An error has occurred.") ||
        lines.includes("GENERATION STOPPED") ||
        document.body.innerText.includes("The runtime could not be prepared.")
      );
    },
    undefined,
    { timeout: timeoutMs }
  );
  const text = await page.locator("body").innerText();
  const lines = text.split("\n").map((line) => line.trim());
  return lines.includes("Ready")
    ? { kind: "ready", text: "Ready" }
    : { kind: "generation_failure", text: compactTerminalText(text) };
}

async function loadFixtures(fixturePaths) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(fixturePaths).map(async ([stage, fixturePath]) => [
        stage,
        JSON.parse(await readFile(fixturePath, "utf8")),
      ])
    )
  );
}

function validateResume(run, loaded, cohort, providerModes, revision) {
  if (
    run.manifestId !== loaded.manifest.id ||
    run.manifestHash !== loaded.manifestHash ||
    run.cohort !== cohort ||
    JSON.stringify(run.providerModes) !== JSON.stringify(providerModes)
  ) {
    throw new Error("Resume configuration does not match the frozen campaign run.");
  }
  if (run.revision.revisionKey !== revision.revisionKey) {
    throw new Error("Cannot resume a campaign on a different repository revision.");
  }
}

function compactRevision(revision) {
  return {
    head: revision.head,
    revisionKey: revision.revisionKey,
    dirty: revision.dirty,
    statusEntries: revision.statusEntries,
  };
}

function zeroStageCounts() {
  return { planning: 0, contract: 0, source: 0 };
}

function createCampaignRunId(manifestId, cohort, createdAt) {
  return `${manifestId}-${cohort}-${createdAt.replace(/[-:.]/g, "").replace("Z", "z").toLowerCase()}`;
}

export function summarizeAttemptFailure(generationRun, terminalText, probeResult) {
  const repairIssues =
    generationRun?.artifactScopedRepair?.attempts?.flatMap((attempt) => attempt.issues ?? []) ?? [];
  const planningIssues =
    generationRun?.attempts?.flatMap((attempt) => attempt.validation?.issues ?? []) ?? [];
  return (
    repairIssues.at(-1)?.message ??
    planningIssues.at(-1)?.message ??
    probeResult.assertions?.find(({ passed }) => !passed)?.detail ??
    terminalText ??
    "Campaign attempt failed without structured evidence."
  );
}

function classifyFailure(status, generationRun) {
  if (status === "success") return "success";
  if (status === "mechanic_incorrect") return "semantic_runtime_failure";
  if (status === "infrastructure_failure") return "infrastructure_failure";
  if (generationRun?.failureClass === "provider-request-failure") return "provider_failure";
  if (["invalid-model-output", "repair-exhausted"].includes(generationRun?.failureClass)) {
    return "provider_output_rejected";
  }
  if (generationRun?.failureClass === "first-playable-failure") return "runtime_pipeline_failure";
  return "pipeline_failure";
}

function compactTerminalText(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const errorIndex = lines.findIndex((line) =>
    /GENERATION ERROR|GENERATION STOPPED|could not be prepared|An error has occurred/i.test(line)
  );
  return lines.slice(Math.max(0, errorIndex), errorIndex + 4).join(" ").slice(0, 1000);
}

async function launchBrowser(chromium, headed) {
  try {
    return await chromium.launch({ channel: "chrome", headless: !headed });
  } catch {
    return chromium.launch({ headless: !headed });
  }
}

async function waitForUrl(baseUrl, processHandle) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (processHandle?.exitCode !== null && processHandle?.exitCode !== undefined) {
      throw new Error(`Campaign server exited with ${processHandle.exitCode}.`);
    }
    try {
      const response = await fetch(new URL("/editor", baseUrl));
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Campaign server did not become ready at ${baseUrl}.`);
}

function runLoggedProcess(command, args, cwd, logPath) {
  return new Promise((resolve, reject) => {
    const child = startLoggedProcess(command, args, cwd, logPath);
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}.`))
    );
  });
}

function startLoggedProcess(command, args, cwd, logPath) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = [];
  const capture = (chunk) => chunks.push(chunk.toString());
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.on("close", () => {
    void writeFile(logPath, chunks.join(""), "utf8");
  });
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
