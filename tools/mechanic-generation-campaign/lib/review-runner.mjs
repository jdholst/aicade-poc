import { spawn } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readCampaignBrowserStorage } from "./browser-storage.mjs";
import { verifyManualQaCandidate } from "./manual-qa.mjs";
import { pauseLoopForCampaignRepair } from "./loop-state.mjs";
import { inspectRevision } from "./revision.mjs";

const GENERATED_MECHANIC_RUNTIME_PATH = "/runtime/phaser-generated";

export async function installReviewProviderBlocking(page, counter = { count: 0 }) {
  const block = async (route) => {
    counter.count += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "provider_calls_blocked_during_manual_qa" }),
    });
  };
  await page.route("**/api/creator-generation-planning", block);
  await page.route("**/api/generated-mechanic-provider", block);
  await page.route("**/api/spec-generation", block);
  await page.route("**/api/starter-project", block);
  return counter;
}

export async function restoreCandidateStorage(
  page,
  { generationRunRecord, gamePackRecord }
) {
  await page.evaluate(
    async ({ generationRunRecord: generationRecord, gamePackRecord: packRecord }) => {
      async function replaceDatabase(databaseName, storeName, indexes, record) {
        const databases = await indexedDB.databases();
        if (databases.some(({ name }) => name === databaseName)) {
          await new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(databaseName);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error(`IndexedDB ${databaseName} deletion was blocked.`));
            request.onsuccess = () => resolve();
          });
        }
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open(databaseName, 1);
          request.onerror = () => reject(request.error);
          request.onupgradeneeded = () => {
            const store = request.result.createObjectStore(storeName, { keyPath: "id" });
            for (const [name, keyPath] of indexes) store.createIndex(name, keyPath);
          };
          request.onsuccess = () => resolve(request.result);
        });
        await new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, "readwrite");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
          transaction.objectStore(storeName).put(record);
        });
        database.close();
      }

      await replaceDatabase(
        "sparkline_generation_runs",
        "generation_runs",
        [["status", "status"], ["updatedAt", "updatedAt"]],
        generationRecord
      );
      await replaceDatabase(
        "sparkline_game_packs",
        "game_packs",
        [["updatedAt", "updatedAt"]],
        packRecord
      );
    },
    { generationRunRecord, gamePackRecord }
  );
}

export async function waitForRestoredCandidateRuntime(
  page,
  { timeout = 60_000 } = {}
) {
  try {
    await page.waitForFunction(
      (runtimePath) => {
        const iframe = document.querySelector("iframe");
        const runtimeReady = document.body.innerText
          .split("\n")
          .some((line) => line.trim() === "Runtime is running in the sandbox.");
        const iframeHasSource =
          iframe instanceof HTMLIFrameElement &&
          (Boolean(iframe.getAttribute("srcdoc")?.trim()) ||
            iframe.getAttribute("src") === runtimePath);
        return (
          runtimeReady &&
          iframeHasSource
        );
      },
      GENERATED_MECHANIC_RUNTIME_PATH,
      { timeout }
    );
  } catch (error) {
    const state = await page.evaluate((runtimePath) => {
      const iframe = document.querySelector("iframe");
      return {
        body: document.body.innerText.slice(0, 4_000),
        iframeCount: document.querySelectorAll("iframe").length,
        iframeHasSource:
          iframe instanceof HTMLIFrameElement &&
          (Boolean(iframe.getAttribute("srcdoc")?.trim()) ||
            iframe.getAttribute("src") === runtimePath),
      };
    }, GENERATED_MECHANIC_RUNTIME_PATH);
    throw new CandidateRuntimeError(
      `Restored game did not mount and report runtime readiness: ${JSON.stringify(state)}. ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function runCampaignReview({
  repoRoot,
  store,
  loopStore,
  campaignRunId,
  attemptId,
  port = 3117,
  inspectRevisionFn = inspectRevision,
  headed = true,
  now = () => new Date(),
}) {
  await store.initialize();
  const [run, attempt, manualQa] = await loadPendingReview(
    store,
    campaignRunId,
    attemptId
  );
  await verifyManualQaCandidate(store, manualQa);
  const executionRoot = await resolveExecutionRoot({ repoRoot, run, loopStore });
  const revision = await inspectRevisionFn(executionRoot);
  if (revision.revisionKey !== run.revision.revisionKey) {
    throw new Error("Manual QA review revision does not match the frozen candidate.");
  }
  const records = await readCandidateRecords(store, manualQa);
  const sessionId = `review-${now().toISOString().replace(/[-:.]/g, "").toLowerCase()}`;
  let session = {
    id: sessionId,
    status: "starting",
    startedAt: now().toISOString(),
    runtimeReady: false,
    providerCallsBlocked: 0,
    artifacts: [],
  };
  await appendReviewSession(store, manualQa, session);

  const reviewDirectory = store.attemptDirectory(campaignRunId, attempt.id);
  const baseUrl = `http://127.0.0.1:${port}`;
  let server = null;
  let browser = null;
  let page = null;
  let replayStarted = false;
  const browserIssues = [];
  const blocked = { count: 0 };
  try {
    try {
      await access(path.join(executionRoot, ".next", "BUILD_ID"));
    } catch {
      await runLoggedProcess(
        "npm",
        ["run", "build"],
        executionRoot,
        path.join(reviewDirectory, `${sessionId}-build.log`)
      );
    }
    server = startLoggedProcess(
      "npm",
      ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
      executionRoot,
      path.join(reviewDirectory, `${sessionId}-server.log`)
    );
    await waitForUrl(baseUrl, server);
    const { chromium } = await import("@playwright/test");
    browser = await launchBrowser(chromium, headed);
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    page = await context.newPage();
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        browserIssues.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => browserIssues.push(`pageerror: ${error.message}`));
    await installReviewProviderBlocking(page, blocked);
    await page.goto(new URL("/editor", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await restoreCandidateStorage(page, records);
    replayStarted = true;
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForRestoredCandidateRuntime(page);
    const restoredStorage = await readCampaignBrowserStorage(page);
    assertRestoredRecords(restoredStorage, records);
    if (browserIssues.some((issue) => /pageerror|runtime error/i.test(issue))) {
      throw new CandidateRuntimeError(browserIssues.join("\n"));
    }

    const screenshotName = `${sessionId}-ready.png`;
    await page.screenshot({
      path: path.join(reviewDirectory, screenshotName),
      fullPage: true,
    });
    const readyAt = now().toISOString();
    session = {
      ...session,
      status: "ready",
      readyAt,
      runtimeReady: true,
      providerCallsBlocked: blocked.count,
      artifacts: [screenshotName, `${sessionId}-browser-issues.json`],
    };
    await store.writeAttempt(attempt, {
      [`${sessionId}-browser-issues.json`]: browserIssues,
    });
    await replaceReviewSession(store, manualQa, session);
    console.log("READY FOR MANUAL QA");
    console.log(`Campaign: ${run.id}`);
    console.log(`Attempt: ${attempt.id}`);
    console.log(`Cohort: ${run.cohort}`);
    console.log(`Prompt variant: ${attempt.promptId}`);
    console.log(`Prompt: ${attempt.prompt}`);
    console.log(`Revision: ${run.revision.revisionKey}`);
    const controls = records.gamePackRecord.gamePack?.gameSpec?.controls ?? [];
    console.log(
      `Controls: ${controls.map(({ label, action, keys }) => `${label ?? action}: ${(keys ?? []).join(", ")}`).join("; ") || "See the game UI"}`
    );
    const manifest = JSON.parse(
      await readFile(path.join(executionRoot, run.manifestPath), "utf8")
    );
    console.log(
      `Mechanic requirements: ${manifest.mechanic?.requirementIds?.join(", ") ?? "See the campaign manifest"}`
    );
    console.log(`Review URL: ${baseUrl}/editor`);
    const decision = await waitForDecision(store, campaignRunId, attempt.id);
    session = {
      ...session,
      status: "completed",
      completedAt: now().toISOString(),
      providerCallsBlocked: blocked.count,
    };
    await replaceReviewSession(store, manualQa, session);
    return { run, attempt, manualQa: decision, session, url: `${baseUrl}/editor` };
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    if (error instanceof ReviewInterruptedError) {
      session = {
        ...session,
        status: "interrupted",
        completedAt: now().toISOString(),
        providerCallsBlocked: blocked.count,
        failure,
      };
      await replaceReviewSession(store, manualQa, session);
    } else if (replayStarted && error instanceof CandidateRuntimeError) {
      session = {
        ...session,
        status: "campaign_repair_required",
        completedAt: now().toISOString(),
        runtimeReady: false,
        providerCallsBlocked: blocked.count,
        failure,
      };
      await replaceReviewSession(store, manualQa, session);
      await pauseReviewForCampaignRepair({
        loopStore,
        run,
        reason: failure,
        detectedAt: session.completedAt,
      });
    } else {
      session = {
        ...session,
        status: "interrupted",
        completedAt: now().toISOString(),
        providerCallsBlocked: blocked.count,
        failure,
      };
      await replaceReviewSession(store, manualQa, session);
    }
    throw error;
  } finally {
    await browser?.close();
    await stopProcess(server);
  }
}

export async function loadPendingReview(store, campaignRunId, attemptId) {
  const run = await store.readRun(campaignRunId);
  const queue = run.pendingManualQaQueue?.length
    ? run.pendingManualQaQueue
    : run.pendingManualQa
      ? [run.pendingManualQa]
      : [];
  const selected = attemptId
    ? queue.find((pending) => pending.attemptId === attemptId)
    : queue[0];
  if (
    !["running", "waiting_for_manual_qa", "interrupted"].includes(run.status) ||
    !selected
  ) {
    throw new Error(`Campaign ${campaignRunId} has no matching pending manual QA candidate.`);
  }
  const [attempt, manualQa] = await Promise.all([
    store.readAttempt(campaignRunId, selected.attemptId),
    store.readManualQa(campaignRunId, selected.attemptId),
  ]);
  if (manualQa.status !== "pending") {
    throw new Error(`Manual QA candidate is already ${manualQa.status}.`);
  }
  return [run, attempt, manualQa];
}

async function resolveExecutionRoot({ repoRoot, run, loopStore }) {
  if (!run.loopId) return repoRoot;
  if (!loopStore) throw new Error("Loop-linked review requires the campaign loop store.");
  const loopRun = await loopStore.readRun(run.loopId);
  return loopRun.worktree.path;
}

async function readCandidateRecords(store, manualQa) {
  const directory = store.attemptDirectory(manualQa.campaignRunId, manualQa.attemptId);
  const byKind = Object.fromEntries(
    await Promise.all(
      manualQa.candidateArtifacts.map(async (artifact) => [
        artifact.kind,
        JSON.parse(await readFile(path.join(directory, artifact.path), "utf8")),
      ])
    )
  );
  return {
    generationRunRecord: byKind.generation_run,
    gamePackRecord: byKind.game_pack,
  };
}

function assertRestoredRecords(storage, records) {
  if (
    JSON.stringify(storage.generationRuns) !== JSON.stringify([records.generationRunRecord]) ||
    JSON.stringify(storage.gamePacks) !== JSON.stringify([records.gamePackRecord])
  ) {
    throw new CandidateRuntimeError("Restored browser storage does not match the frozen candidate.");
  }
}

async function appendReviewSession(store, manualQa, session) {
  const append = async () => {
    const latest = await store.readManualQa(
      manualQa.campaignRunId,
      manualQa.attemptId
    );
    await store.writeManualQa({
      ...latest,
      reviewSessions: [...latest.reviewSessions, session],
    });
  };
  if (typeof store.withManualQaLock === "function") {
    await store.withManualQaLock(manualQa.campaignRunId, manualQa.attemptId, append);
  } else {
    await append();
  }
}

async function replaceReviewSession(store, originalManualQa, session) {
  const replace = async () => {
    const latest = await store.readManualQa(
      originalManualQa.campaignRunId,
      originalManualQa.attemptId
    );
    await store.writeManualQa({
      ...latest,
      reviewSessions: latest.reviewSessions.map((existing) =>
        existing.id === session.id ? session : existing
      ),
    });
  };
  if (typeof store.withManualQaLock === "function") {
    await store.withManualQaLock(
      originalManualQa.campaignRunId,
      originalManualQa.attemptId,
      replace
    );
  } else {
    await replace();
  }
}

export async function pauseReviewForCampaignRepair({
  loopStore,
  run,
  reason,
  detectedAt = new Date().toISOString(),
}) {
  if (!run.loopId) return null;
  if (!loopStore) {
    throw new Error("Loop-linked campaign repair requires loop storage.");
  }
  const loopRun = await loopStore.readRun(run.loopId);
  if (loopRun.status === "waiting_for_campaign_repair") return loopRun;
  const paused = pauseLoopForCampaignRepair(loopRun, {
    id: `campaign-repair-${(loopRun.campaignRepairs ?? []).length + 1}`,
    reason,
    detectedAt,
  });
  await loopStore.writeRun(paused);
  return paused;
}

async function waitForDecision(store, campaignRunId, attemptId) {
  return new Promise((resolve, reject) => {
    let stopped = false;
    const interrupt = () => {
      stopped = true;
      reject(new ReviewInterruptedError("Manual QA review was interrupted before a verdict."));
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    const poll = async () => {
      try {
        while (!stopped) {
          const manualQa = await store.readManualQa(campaignRunId, attemptId);
          if (manualQa.status !== "pending") {
            process.removeListener("SIGINT", interrupt);
            process.removeListener("SIGTERM", interrupt);
            resolve(manualQa);
            return;
          }
          await new Promise((next) => setTimeout(next, 500));
        }
      } catch (error) {
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", interrupt);
        reject(error);
      }
    };
    void poll();
  });
}

async function launchBrowser(chromium, headed) {
  try {
    return await chromium.launch({ channel: "chrome", headless: !headed });
  } catch {
    return chromium.launch({ headless: !headed });
  }
}

async function waitForUrl(baseUrl, child) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Review server exited with ${child.exitCode}.`);
    try {
      const response = await fetch(new URL("/editor", baseUrl));
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Review server did not become ready at ${baseUrl}.`);
}

function runLoggedProcess(command, args, cwd, logPath) {
  return new Promise((resolve, reject) => {
    const child = startLoggedProcess(command, args, cwd, logPath);
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}.`))
    );
  });
}

function startLoggedProcess(command, args, cwd, logPath) {
  const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk.toString()));
  child.stderr.on("data", (chunk) => chunks.push(chunk.toString()));
  child.on("close", () => void writeFile(logPath, chunks.join(""), "utf8"));
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

class CandidateRuntimeError extends Error {}
class ReviewInterruptedError extends Error {}
