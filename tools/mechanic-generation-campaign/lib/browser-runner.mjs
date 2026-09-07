import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  latestGamePack,
  latestGamePackRecord,
  latestGenerationRun,
  latestGenerationRunRecord,
  readCampaignBrowserStorage,
} from "./browser-storage.mjs";
import { createCampaignStore } from "./campaign-store.mjs";
import { loadCampaignWorktreeEnvironment } from "./campaign-environment.mjs";
import {
  loadCampaignCarryoverAttempts,
  mergeCampaignProgressAttempts,
} from "./campaign-progress.mjs";
import {
  createCampaignKnowledgeStore,
  knowledgeEntriesDigest,
} from "./knowledge.mjs";
import {
  CAMPAIGN_ATTEMPT_SCHEMA_VERSION,
  CAMPAIGN_RUN_SCHEMA_VERSION,
  requiresManualQa,
  scoreCampaign,
} from "./contracts.mjs";
import { adaptGeneratedMechanicFixture, adaptPlanningFixture } from "./fixture-adapter.mjs";
import { loadCampaignManifest, validateManifestEnvironment } from "./manifest-loader.mjs";
import { redactSensitive } from "./redaction.mjs";
import { inspectRevision } from "./revision.mjs";
import { createManualQaCandidate } from "./manual-qa.mjs";
import {
  aggregateProviderCallCosts,
  createProviderCallReceipts,
} from "./pricing.mjs";
import {
  classifyFurthestStage,
  createAttemptSchedule,
  createNextAttemptSchedule,
  createLoopbackBaseUrl,
  maximumCampaignSubmissions,
  resolveProviderCredentialInput,
  resolveProviderModes,
} from "./runner-policy.mjs";
import {
  calculateDispatchCapacity,
  createDispatchBatch,
  createPostPlanningFoundationController,
  createStageConcurrencyController,
  resolveExecutionPolicy,
} from "./parallel-execution.mjs";

const GENERATED_MECHANIC_RUNTIME_PATH = "/runtime/phaser-generated";

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
  store: providedStore,
  knowledgeStore: providedKnowledgeStore,
  loopContext,
  providerCallBudget,
  onSubmission,
  runId,
  actualProviderAuthorized = false,
  executionPolicy: executionPolicyInput,
  carryoverAttemptRefs: carryoverAttemptRefsInput,
  environment,
}) {
  const campaignEnvironment =
    environment ?? loadCampaignWorktreeEnvironment(repoRoot);
  const loaded = await loadCampaignManifest(manifestPath);
  const store = providedStore ?? createCampaignStore(repoRoot);
  await store.initialize();
  const knowledgeStore =
    providedKnowledgeStore ?? createCampaignKnowledgeStore(repoRoot);
  const providerModes = resolveProviderModes(
    cohort,
    providerModeOverrides ?? loaded.manifest.providerModes,
    loaded.manifest.fixtures
  );
  if (
    Object.values(providerModes).includes("actual") &&
    !resume &&
    !loopContext &&
    !actualProviderAuthorized
  ) {
    throw new Error("Actual-provider campaign execution requires bounded authorization.");
  }
  if (Object.values(providerModes).includes("actual")) {
    validateManifestEnvironment(loaded.manifest, campaignEnvironment, {
      requireKeywordServerCredential: !attachedBaseUrl,
    });
  }
  const revision = await inspectRevision(repoRoot);
  if (["repeatability", "variation"].includes(cohort) && revision.dirty) {
    throw new Error(
      `${cohort} campaigns require a clean worktree. Run discovery or isolation while iterating.`
    );
  }

  const createdAt = new Date().toISOString();
  const campaignRunId =
    resume ?? runId ?? createCampaignRunId(loaded.manifest.id, cohort, createdAt);
  const requestedExecutionPolicy = resolveExecutionPolicy({
    cohort,
    policy: executionPolicyInput,
  });
  const baseUrl = attachedBaseUrl ?? createLoopbackBaseUrl(port);
  const attemptCeiling = maximumCampaignSubmissions(
    cohort,
    loaded.manifest.prompts,
    loaded.manifest.cohorts[cohort]
  );
  const baselineManifestDigest = resume
    ? undefined
    : knowledgeEntriesDigest(await knowledgeStore.read());
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
        attemptCeiling,
        attemptIds: [],
        ...(carryoverAttemptRefsInput?.length
          ? { carryoverAttemptRefs: carryoverAttemptRefsInput }
          : {}),
        executionPolicy: requestedExecutionPolicy,
        stateRevision: 0,
        attemptSlots: [],
        pendingManualQaQueue: [],
        knowledgePolicy: {
          required: true,
          baselineManifestDigest,
        },
        ...(loopContext
          ? {
              loopId: loopContext.loopId,
              loopStepId: loopContext.loopStepId,
              loopCycle: loopContext.loopCycle,
            }
          : {}),
        revision: compactRevision(revision),
        baseUrl,
        authorization: {
          actualProviders: Object.values(providerModes).includes("actual")
            ? Boolean(actualProviderAuthorized || loopContext)
            : false,
          authorizedAt: createdAt,
        },
        ...(loaded.pricing
          ? {
              pricing: {
                path: path.relative(repoRoot, loaded.pricing.pricingPath),
                sha256: loaded.pricing.pricingHash,
                snapshotId: loaded.pricing.snapshot.id,
              },
              cost: emptyCostAggregate(),
            }
          : {}),
      };
  validateResume(
    run,
    loaded,
    cohort,
    providerModes,
    revision,
    loopContext,
    executionPolicyInput ? requestedExecutionPolicy : undefined,
    carryoverAttemptRefsInput
  );
  const releaseExecutionLock = typeof store.acquireRunExecutionLock === "function"
    ? await store.acquireRunExecutionLock(campaignRunId)
    : async () => {};
  let server = null;
  let browserPool = null;
  try {
    if (resume) {
      run = await reconcileResumableRun(store, run);
    }
    const carryoverAttempts = await loadCampaignCarryoverAttempts(store, run);
    await store.writeRun(run);
    const fixtures = await loadFixtures(loaded.fixturePaths);
    const probeModule = await import(pathToFileURL(loaded.probePath).href);
    if (typeof probeModule.runProbe !== "function") {
      throw new Error(`Campaign probe ${loaded.probePath} does not export runProbe().`);
    }
    const campaignDirectory = store.campaignDirectory(campaignRunId);
    await mkdir(campaignDirectory, { recursive: true });
    if (!attachedBaseUrl) {
      await runLoggedProcess(
        "npm",
        productionBuildArguments(),
        repoRoot,
        path.join(campaignDirectory, "build.log"),
        campaignEnvironment
      );
      server = startLoggedProcess(
        "npm",
        ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(port)],
        repoRoot,
        path.join(campaignDirectory, "server.log"),
        campaignEnvironment
      );
      await waitForUrl(baseUrl, server);
    } else {
      await waitForUrl(baseUrl, null);
    }

    const { chromium } = await import("@playwright/test");
    browserPool = await createCampaignBrowserPool({
      chromium,
      headed,
      executionPolicy: run.executionPolicy,
    });
    run = await updateCampaignRun(store, run, (current) => ({
      ...current,
      status: "running",
      completedAt: undefined,
      startedAt: current.startedAt ?? new Date().toISOString(),
    }));

    return await executeCampaignAttempts({
      repoRoot,
      browserPool,
      store,
      run,
      manifest: loaded.manifest,
      fixtures,
      probe: probeModule.runProbe,
      attemptTimeoutMs,
      providerCallBudget,
      onSubmission,
      pricing: loaded.pricing,
      carryoverAttempts,
      environment: campaignEnvironment,
    });
  } catch (error) {
    run = await updateCampaignRun(store, run, (current) => ({
      ...current,
      status: "interrupted",
      completedAt: new Date().toISOString(),
      invalidReason: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  } finally {
    await browserPool?.close();
    await stopProcess(server);
    await releaseExecutionLock();
  }
}

export async function reconcileResumableRun(store, run) {
  const attempts = await store.readAttempts(run.id);
  const attemptsById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const pendingManualQaQueue = [];
  for (const attempt of attempts) {
    if (
      attempt.status !== "awaiting_manual_qa" ||
      attempt.manualQa?.status !== "pending"
    ) {
      continue;
    }
    const manualQa = await store.readManualQa(run.id, attempt.id);
    if (manualQa.status !== "pending") continue;
    pendingManualQaQueue.push({
      manualQaId: manualQa.id,
      campaignRunId: run.id,
      attemptId: attempt.id,
      promptId: attempt.promptId,
      cohort: run.cohort,
      revisionKey: run.revision.revisionKey,
      requestedAt: manualQa.requestedAt,
      evidencePath: attempt.manualQa.path,
    });
  }
  const updatedAt = new Date().toISOString();
  return {
    ...run,
    attemptIds: [...new Set([...run.attemptIds, ...attempts.map(({ id }) => id)])],
    attemptSlots: run.attemptSlots.map((slot) => {
      const attempt = attemptsById.get(slot.attemptId);
      if (attempt) {
        return {
          ...slot,
          status: attempt.status === "awaiting_manual_qa"
            ? "awaiting_manual_qa"
            : "completed",
          updatedAt,
        };
      }
      return ["reserved", "running"].includes(slot.status)
        ? { ...slot, status: "interrupted", updatedAt }
        : slot;
    }),
    pendingManualQa: pendingManualQaQueue[0],
    pendingManualQaQueue,
  };
}

async function executeCampaignAttempts({
  repoRoot,
  browserPool,
  store,
  run: initialRun,
  manifest,
  fixtures,
  probe,
  attemptTimeoutMs,
  providerCallBudget,
  onSubmission,
  pricing,
  carryoverAttempts = [],
  environment,
}) {
  let run = initialRun;
  const active = new Map();
  const leaseOwner = `campaign-pool-${process.pid}-${randomUUID()}`;
  const stageConcurrency = createStageConcurrencyController(run.executionPolicy);
  const foundationConcurrency = createPostPlanningFoundationController();
  let stoppingError = null;
  let providerBudgetExhausted = false;
  let invalidReason = null;

  while (true) {
    run = await store.readRun(run.id);
    const attempts = await store.readAttempts(run.id);
    const progressAttempts = mergeCampaignProgressAttempts(
      carryoverAttempts,
      attempts
    );
    const score = scoreCampaign(run.cohort, manifest, progressAttempts);
    const baseSchedule = createAttemptSchedule(
      run.cohort,
      manifest.prompts,
      run.executionPolicy
    );
    const baseClaimed = baseSchedule.every(({ sequence }) =>
      progressAttempts.some((attempt) => attempt.sequence === sequence) ||
      run.attemptSlots.some(
        (slot) =>
          slot.sequence === sequence &&
          !["cancelled", "interrupted"].includes(slot.status)
      )
    );
    const replacement = baseClaimed && active.size === 0
      ? createNextAttemptSchedule({
          cohort: run.cohort,
          prompts: manifest.prompts,
          attempts: progressAttempts,
          score,
          executionPolicy: run.executionPolicy,
        })
      : null;
    const schedule = replacement ? [...baseSchedule, replacement] : baseSchedule;

    if (!stoppingError && !providerBudgetExhausted && !invalidReason) {
      const revision = await inspectRevision(repoRoot);
      if (revision.revisionKey !== run.revision.revisionKey) {
        invalidReason = "Repository revision changed before the next submission.";
      }
    }

    const capacity =
      stoppingError || providerBudgetExhausted || invalidReason ||
      ["achieved", "completed_not_achieved"].includes(score.status)
        ? 0
        : calculateDispatchCapacity({
            policy: run.executionPolicy,
            failureLimit: score.failureLimit,
            countedFailures: score.failures,
            activeAttempts: active.size,
            pendingManualQa: run.pendingManualQaQueue.length,
          });
    const batch = createDispatchBatch({
      schedule,
      attempts: progressAttempts,
      slots: run.attemptSlots,
      capacity,
      leaseOwner,
    });

    if (batch.length > 0) {
      const batchAuthorized = Object.values(run.providerModes).includes("actual")
        ? await authorizeProviderDispatchBatch(providerCallBudget, batch)
        : true;
      if (!batchAuthorized) {
        providerBudgetExhausted = true;
        continue;
      }
      const batchIds = new Set(batch.map(({ attemptId }) => attemptId));
      run = await updateCampaignRun(store, run, (current) => ({
        ...current,
        attemptSlots: [
          ...current.attemptSlots.filter(
            ({ attemptId }) => !batchIds.has(attemptId)
          ),
          ...batch,
        ],
      }));
      const startedAt = new Date().toISOString();
      run = await updateCampaignRun(store, run, (current) => ({
        ...current,
        attemptSlots: current.attemptSlots.map((slot) =>
          batchIds.has(slot.attemptId)
            ? { ...slot, status: "running", updatedAt: startedAt }
            : slot
        ),
      }));
      for (const slot of batch) {
        const scheduled = schedule.find(({ sequence }) => sequence === slot.sequence);
        const browser = browserPool.claim();
        const task = runBrowserAttempt({
          browser,
          store,
          run,
          manifest,
          scheduled,
          fixtures,
          probe,
          attemptTimeoutMs,
          providerCallBudget,
          onSubmission,
          pricing,
          stageConcurrency,
          foundationConcurrency,
          environment,
        }).then(
          (result) => ({ slot, browser, result }),
          (error) => ({ slot, browser, error })
        );
        active.set(slot.attemptId, task);
      }
      continue;
    }

    if (active.size === 0) {
      if (stoppingError) throw stoppingError;
      break;
    }

    const settled = await Promise.race(active.values());
    active.delete(settled.slot.attemptId);
    browserPool.release(settled.browser);
    if (settled.error) {
      const failedAt = new Date().toISOString();
      run = await updateCampaignRun(store, run, (current) => ({
        ...current,
        attemptSlots: current.attemptSlots.map((slot) =>
          slot.attemptId === settled.slot.attemptId
            ? { ...slot, status: "interrupted", updatedAt: failedAt }
            : slot
        ),
      }));
      stoppingError ??= settled.error;
      continue;
    }

    const attempt = settled.result.attempt;
    const pendingManualQa = settled.result.pendingManualQa;
    const attemptsAfterSubmission = await store.readAttempts(run.id);
    const completedAt = new Date().toISOString();
    run = await updateCampaignRun(store, run, (current) => {
      const queue = pendingManualQa
        ? [...current.pendingManualQaQueue, pendingManualQa].filter(
            (entry, index, entries) =>
              entries.findIndex(
                ({ manualQaId }) => manualQaId === entry.manualQaId
              ) === index
          )
        : current.pendingManualQaQueue;
      return withRunCost(
        {
          ...current,
          attemptIds: current.attemptIds.includes(attempt.id)
            ? current.attemptIds
            : [...current.attemptIds, attempt.id],
          pendingManualQa: queue[0],
          pendingManualQaQueue: queue,
          attemptSlots: current.attemptSlots.map((slot) =>
            slot.attemptId === attempt.id
              ? {
                  ...slot,
                  status: pendingManualQa
                    ? "awaiting_manual_qa"
                    : "completed",
                  updatedAt: completedAt,
                }
              : slot
          ),
        },
        attemptsAfterSubmission
      );
    });

    if (attempt.classification === "provider_call_budget_exhausted") {
      providerBudgetExhausted = true;
    }
    try {
      requireCampaignAttemptContinuation(attempt);
    } catch (error) {
      stoppingError ??= error;
    }
    const afterAttemptRevision = await inspectRevision(repoRoot);
    if (afterAttemptRevision.revisionKey !== run.revision.revisionKey) {
      invalidReason = "Repository revision changed during a submitted attempt.";
    }
  }

  const attempts = await store.readAttempts(run.id);
  const progressAttempts = mergeCampaignProgressAttempts(
    carryoverAttempts,
    attempts
  );
  const score = scoreCampaign(run.cohort, manifest, progressAttempts);
  const terminalStatus = providerBudgetExhausted
    ? "completed_not_achieved"
    : invalidReason
      ? "invalid"
      : run.pendingManualQaQueue.length > 0
        ? "waiting_for_manual_qa"
        : score.status;
  const terminal = ["achieved", "completed_not_achieved", "invalid"].includes(
    terminalStatus
  );
  run = await updateCampaignRun(store, run, (current) => ({
    ...current,
    status: terminalStatus,
    completedAt: terminal ? new Date().toISOString() : undefined,
    ...(invalidReason ? { invalidReason } : {}),
    pendingManualQa: current.pendingManualQaQueue[0],
    result: campaignScoreResult(score),
  }));
  return { run, attempts: progressAttempts };
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
  providerCallBudget,
  onSubmission,
  pricing,
  stageConcurrency,
  foundationConcurrency,
  environment,
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
  const terminalActivity = createCampaignActivityTracker();
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
    providerCallBudget,
    stageConcurrency,
    foundationConcurrency,
    onActivity: () => terminalActivity.record(),
    onProviderBudgetExhausted: (stage) => {
      providerBudgetExhaustedStage = stage;
    },
    attemptId: id,
    model: manifest.model,
  });

  let terminal = { kind: "infrastructure_failure", text: "Attempt did not start." };
  let storage = { generationRuns: [], gamePacks: [] };
  let generationRun = null;
  let gamePack = null;
  let probeResult = { passed: false, assertions: [] };
  let thrownFailure = null;
  let providerBudgetExhaustedStage = null;
  try {
    await page.goto(new URL("/editor", run.baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await submitCampaignPrompt(page, scheduled.prompt);
    await configureProviderInput(
      page,
      manifest,
      run.providerModes,
      environment
    );
    await onSubmission?.({
      campaignRunId: run.id,
      attemptId: id,
      sequence: scheduled.sequence,
      promptId: scheduled.promptId,
    });
    terminalActivity.record();
    await page.getByRole("button", { name: "Build the project" }).click();
    terminal = await waitForCampaignEditorTerminalState(
      page,
      attemptTimeoutMs,
      terminalActivity
    );
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
  } finally {
    foundationConcurrency.release(id);
  }
  await Promise.all(responseCaptureTasks);
  const providerCallReceipts = createProviderCallReceipts({
    networkCaptures,
    snapshot: pricing?.snapshot,
    requestedModel: manifest.model,
  });
  for (const call of providerCallReceipts) {
    await providerCallBudget?.settle?.(call);
  }

  const runtimeMounted = (await page.locator("iframe").count()) > 0;
  terminal = classifyPostProbeTerminal({ terminal, runtimeMounted });
  const runtimeHealthy = terminal.kind === "ready" && !browserIssues.some((issue) => /pageerror|runtime error/i.test(issue));
  const pipelinePassed = generationRun?.status === "succeeded" && Boolean(gamePack) && runtimeHealthy;
  const cleanupPassed =
    pipelinePassed && /cleanup|dispose|removed|removal/i.test(JSON.stringify(gamePack?.validationEvidence ?? []));
  const externalProbePassed = probeResult.passed === true;
  const automatedStatus = pipelinePassed
    ? externalProbePassed
      ? "success"
      : "mechanic_incorrect"
    : terminal.kind === "infrastructure_failure"
      ? "infrastructure_failure"
      : "pipeline_failure";
  const manualQaRequired = requiresManualQa({
    cohort: run.cohort,
    providerModes: run.providerModes,
    pipelinePassed,
    externalProbePassed,
  });
  const status = manualQaRequired ? "awaiting_manual_qa" : automatedStatus;
  const completedAt = new Date().toISOString();
  const failure =
    ["success", "awaiting_manual_qa"].includes(status)
      ? undefined
      : providerBudgetExhaustedStage
        ? `${providerBudgetExhaustedStage} provider-call ceiling reached before upstream forwarding.`
        : thrownFailure ?? summarizeAttemptFailure(generationRun, terminal.text, probeResult);
  const attempt = {
    schemaVersion: CAMPAIGN_ATTEMPT_SCHEMA_VERSION,
    id,
    campaignRunId: run.id,
    sequence: scheduled.sequence,
    cohort: run.cohort,
    promptId: scheduled.promptId,
    prompt: scheduled.prompt,
    submissionKind: scheduled.submissionKind ?? "scheduled",
    ...(scheduled.replacementForPromptId
      ? { replacementForPromptId: scheduled.replacementForPromptId }
      : {}),
    status,
    terminalOutcome:
      status === "awaiting_manual_qa"
        ? "accepted and externally verified; awaiting manual QA"
        : status === "success"
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
    classification: status === "awaiting_manual_qa"
      ? "awaiting_manual_qa"
      : providerBudgetExhaustedStage
      ? "provider_call_budget_exhausted"
      : classifyFailure(status, generationRun),
    ...(failure ? { failure } : {}),
    providerModes: run.providerModes,
    providerCalls,
    providerCallReceiptIds: providerCallReceipts.map(({ callId }) => callId),
    fixtureCalls,
    startedAt,
    completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(startedAt),
    revisionKey: run.revision.revisionKey,
    pipelinePassed,
    externalProbePassed,
    automatedOutcome: {
      status: automatedStatus === "success" ? "passed" : "failed",
      terminalOutcome:
        automatedStatus === "success"
          ? "accepted and externally verified"
          : terminal.text,
      recordedAt: completedAt,
    },
    recordedOutcome:
      automatedStatus === "success" ? "automated_success" : automatedStatus,
    artifacts: ["attempt.json", "provider-call-receipts.json", "network-captures.json", "generation-run.json", "game-pack.json", "runtime-probe.json", "browser-issues.json", "terminal.png", ...(terminal.kind === "ready" && gamePack ? ["probe.png"] : [])],
    temporaryFixIds: [],
    cost: toAttemptCost(providerCallReceipts, pricing?.snapshot.id),
  };
  const evidence = {
    "provider-call-receipts.json": providerCallReceipts,
    "network-captures.json": networkCaptures,
    "generation-run.json": generationRun,
    "game-pack.json": gamePack,
    "runtime-probe.json": probeResult,
    "browser-issues.json": browserIssues,
  };
  let storedAttempt = attempt;
  let pendingManualQa = null;
  if (manualQaRequired) {
    const candidate = await createManualQaCandidate({
      store,
      run,
      attempt,
      generationRunRecord: latestGenerationRunRecord(storage),
      gamePackRecord: latestGamePackRecord(storage),
      evidence,
      requestedAt: completedAt,
      persistRun: false,
    });
    storedAttempt = candidate.attempt;
    pendingManualQa = candidate.run.pendingManualQaQueue.find(
      ({ attemptId }) => attemptId === candidate.attempt.id
    );
  } else {
    await store.writeAttempt(attempt, evidence);
  }
  await context.close();
  return { attempt: storedAttempt, pendingManualQa };
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
  providerCallBudget,
  stageConcurrency,
  foundationConcurrency,
  onActivity,
  onProviderBudgetExhausted,
  attemptId,
  model,
}) {
  page.on("response", (response) => {
    const capture = actualResponseCaptures.get(response.request());
    if (!capture) return;
    const task = captureActualResponse(
      response,
      capture,
      providerCallBudget
    ).finally(() => {
      capture.releaseStagePermit?.();
      actualResponseCaptures.delete(response.request());
      onActivity();
    });
    responseCaptureTasks.add(task);
    void task.finally(() => responseCaptureTasks.delete(task));
  });
  page.on("requestfailed", (request) => {
    const capture = actualResponseCaptures.get(request);
    if (!capture) return;
    capture.releaseStagePermit?.();
    actualResponseCaptures.delete(request);
    const task = providerCallBudget?.settle?.({
      callId: capture.callId,
      stage: capture.stage,
      completedAt: new Date().toISOString(),
    });
    if (task) {
      responseCaptureTasks.add(task);
      void task.finally(() => responseCaptureTasks.delete(task));
    }
  });
  await page.route("**/api/creator-generation-planning", async (route) => {
    onActivity();
    const result = await resolveInterceptedRoute({
      route,
      stage: "planning",
      mode: providerModes.planning,
      fixture: fixtures.planning,
      providerCalls,
      fixtureCalls,
      networkCaptures,
      actualResponseCaptures,
      providerCallBudget,
      stageConcurrency,
      foundationConcurrency,
      onActivity,
      attemptId,
      model,
    });
    if (result?.blocked) onProviderBudgetExhausted?.(result.stage);
  });
  await page.route("**/api/generated-mechanic-provider", async (route) => {
    onActivity();
    const requestBody = route.request().postDataJSON();
    const stage = requestBody.stage;
    if (!['contract', 'source'].includes(stage)) {
      throw new Error(`Unknown generated-mechanic provider stage "${stage}".`);
    }
    if (stage === "contract") {
      foundationConcurrency.release(attemptId);
    }
    const result = await resolveInterceptedRoute({
      route,
      stage,
      mode: providerModes[stage],
      fixture: fixtures[stage],
      providerCalls,
      fixtureCalls,
      networkCaptures,
      actualResponseCaptures,
      requestBody,
      providerCallBudget,
      stageConcurrency,
      foundationConcurrency,
      onActivity,
      attemptId,
      model,
    });
    if (result?.blocked) onProviderBudgetExhausted?.(result.stage);
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
  providerCallBudget,
  stageConcurrency,
  foundationConcurrency,
  onActivity,
  attemptId = "attempt",
  model,
  requestBody = route.request().postDataJSON(),
}) {
  if (mode === "fixture") {
    fixtureCalls[stage] += 1;
    const body = stage === "planning"
      ? adaptPlanningFixture(requestBody, fixture)
      : adaptGeneratedMechanicFixture(requestBody, fixture);
    networkCaptures.push(redactSensitive({ stage, source: "fixture", request: requestBody, response: body }));
    if (stage === "planning" && foundationConcurrency) {
      await foundationConcurrency.acquire(attemptId);
    }
    try {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    } catch (error) {
      foundationConcurrency?.release(attemptId);
      throw error;
    }
    return;
  }

  const requestedAt = new Date().toISOString();
  const releaseStagePermit = stageConcurrency
    ? await stageConcurrency.acquire(stage)
    : () => {};
  const callId = `${attemptId}:${stage}:${providerCalls[stage] + 1}:${requestedAt}`;
  let allowed;
  try {
    allowed = providerCallBudget?.begin
      ? await providerCallBudget.begin({
          attemptId,
          callId,
          stage,
          model,
          serviceTier: "default",
          requestedAt,
        })
      : providerCallBudget
        ? await providerCallBudget.consume(stage)
        : true;
  } catch (error) {
    releaseStagePermit();
    throw error;
  }
  if (!allowed) {
    releaseStagePermit();
    networkCaptures.push(
      redactSensitive({
        stage,
        source: "blocked",
        reason: "provider_call_budget_exhausted",
        request: requestBody,
      })
    );
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "provider_call_budget_exhausted",
        stage,
      }),
    });
    return { blocked: true, stage };
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
    callId,
    stage,
    source: "actual",
    requestedAt,
    request: requestBody,
    requestHeaders: {
      origin: forwardedHeaders.origin,
      "sec-fetch-site": forwardedHeaders["sec-fetch-site"],
    },
  });
  networkCaptures.push(capture);
  if (stage === "planning" && foundationConcurrency) {
    try {
      const response = await route.fetch({ headers: forwardedHeaders });
      await captureActualResponse(response, capture, providerCallBudget);
      releaseStagePermit();
      onActivity?.();
      if (response.status() >= 200 && response.status() < 300) {
        await foundationConcurrency.acquire(attemptId);
      }
      try {
        await route.fulfill({ response });
      } catch (error) {
        foundationConcurrency.release(attemptId);
        throw error;
      }
    } catch (error) {
      releaseStagePermit();
      foundationConcurrency.release(attemptId);
      if (!capture.completedAt) {
        capture.completedAt = new Date().toISOString();
        capture.responseCaptureError =
          error instanceof Error ? error.message : String(error);
        await providerCallBudget?.settle?.({
          callId,
          stage,
          completedAt: capture.completedAt,
        });
      }
      throw error;
    }
    return { blocked: false, stage };
  }
  Object.defineProperty(capture, "releaseStagePermit", {
    configurable: true,
    enumerable: false,
    value: releaseStagePermit,
  });
  actualResponseCaptures?.set(request, capture);
  try {
    await route.continue({ headers: forwardedHeaders });
  } catch (error) {
    actualResponseCaptures?.delete(request);
    releaseStagePermit();
    throw error;
  }
  return { blocked: false, stage };
}

export async function authorizeProviderDispatchBatch(
  providerCallBudget,
  batch
) {
  if (!providerCallBudget?.authorizeBatch) return true;
  return providerCallBudget.authorizeBatch({
    attemptIds: batch.map(({ attemptId }) => attemptId),
  });
}

async function captureActualResponse(response, capture, providerCallBudget) {
  capture.responseStatus = response.status();
  capture.completedAt = new Date().toISOString();
  try {
    const bodyText = await response.text();
    let body = bodyText;
    try {
      body = JSON.parse(bodyText);
    } catch {}
    capture.response = redactSensitive(body);
    await providerCallBudget?.settle?.({
      schemaVersion: "campaign-provider-call-receipt/v1",
      callId: capture.callId,
      stage: capture.stage,
      source: "actual",
      requestedAt: capture.requestedAt,
      completedAt: body?.providerUsage?.completedAt ?? capture.completedAt,
      responseStatus: capture.responseStatus,
      ...(body?.providerUsage ? { receipt: body.providerUsage } : {}),
    });
  } catch (error) {
    capture.responseCaptureError = error instanceof Error ? error.message : String(error);
  }
}

export function classifyPostProbeTerminal({ terminal, runtimeMounted }) {
  if (terminal.kind === "ready" && !runtimeMounted) {
    return {
      kind: "infrastructure_failure",
      text: "The generated runtime iframe disappeared before external probing completed.",
    };
  }
  return terminal;
}

export async function configureProviderInput(
  page,
  manifest,
  providerModes,
  environment = process.env
) {
  const input = resolveProviderCredentialInput(
    manifest,
    providerModes,
    environment
  );
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

export async function submitCampaignPrompt(page, prompt) {
  const promptInput = page.getByPlaceholder(
    "Describe the starter game you want to build."
  );
  const submitButton = page.getByRole("button", { name: "Send prompt" });
  await promptInput.waitFor({ state: "visible", timeout: 30_000 });
  await submitButton.waitFor({ state: "visible", timeout: 30_000 });
  await enterControlledText(promptInput, prompt);
  await submitButton.click();
}

async function enterControlledText(locator, value) {
  await locator.click();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.pressSequentially(value);
}

export async function waitForCampaignEditorTerminalState(
  page,
  timeoutMs,
  activity
) {
  try {
    if (activity) {
      await waitForTerminalEditorState(page, timeoutMs, activity);
    } else {
      await page.waitForFunction(
        (runtimePath) => {
          const iframe = document.querySelector("iframe");
          const lines = document.body.innerText
            .split("\n")
            .map((line) => line.trim());
          const iframeHasSource =
            iframe instanceof HTMLIFrameElement &&
            (Boolean(iframe.getAttribute("srcdoc")?.trim()) ||
              iframe.getAttribute("src") === runtimePath);
          return (
            (lines.includes("Runtime is running in the sandbox.") &&
              iframeHasSource) ||
            lines.includes("An error has occurred.") ||
            lines.includes("GENERATION STOPPED") ||
            lines.some((line) =>
              line.startsWith("The generated mechanic runtime ")
            ) ||
            document.body.innerText.includes("The runtime could not be prepared.") ||
            document.body.innerText.includes(
              "The generated sandbox did not finish booting."
            )
          );
        },
        GENERATED_MECHANIC_RUNTIME_PATH,
        { timeout: timeoutMs }
      );
    }
  } catch (error) {
    const state = await inspectCampaignEditorState(page);
    return {
      kind: "infrastructure_failure",
      text: `Campaign editor did not reach a terminal state: ${JSON.stringify(state)}. ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  const state = await inspectCampaignEditorState(page);
  return state.runtimeReady && state.iframeHasSource
    ? { kind: "ready", text: "Runtime is running in the sandbox." }
    : { kind: "generation_failure", text: compactTerminalText(state.body) };
}

async function inspectCampaignEditorState(page) {
  return page.evaluate((runtimePath) => {
    const iframe = document.querySelector("iframe");
    const lines = document.body.innerText
      .split("\n")
      .map((line) => line.trim());
    return {
      body: document.body.innerText.slice(0, 4_000),
      runtimeReady: lines.includes("Runtime is running in the sandbox."),
      iframeCount: document.querySelectorAll("iframe").length,
      iframeHasSource:
        iframe instanceof HTMLIFrameElement &&
        (Boolean(iframe.getAttribute("srcdoc")?.trim()) ||
          iframe.getAttribute("src") === runtimePath),
    };
  }, GENERATED_MECHANIC_RUNTIME_PATH);
}

export function createCampaignActivityTracker(now = () => Date.now()) {
  let lastActivityAt = now();
  return {
    record() {
      lastActivityAt = now();
    },
    elapsedMs() {
      return now() - lastActivityAt;
    },
  };
}

export async function waitForTerminalEditorState(
  page,
  timeoutMs,
  activity = createCampaignActivityTracker()
) {
  const pollIntervalMs = Math.min(1_000, timeoutMs);
  while (true) {
    const remainingMs = timeoutMs - activity.elapsedMs();
    if (remainingMs <= 0) {
      throw new Error(
        `Campaign editor made no terminal or provider progress for ${timeoutMs}ms.`
      );
    }
    try {
      await page.waitForFunction(
        (runtimePath) => {
          const iframe = document.querySelector("iframe");
          const lines = document.body.innerText
            .split("\n")
            .map((line) => line.trim());
          const iframeHasSource =
            iframe instanceof HTMLIFrameElement &&
            (Boolean(iframe.getAttribute("srcdoc")?.trim()) ||
              iframe.getAttribute("src") === runtimePath);
          return (
            (lines.includes("Runtime is running in the sandbox.") &&
              iframeHasSource) ||
            lines.includes("An error has occurred.") ||
            lines.includes("GENERATION STOPPED") ||
            lines.some((line) =>
              line.startsWith("The generated mechanic runtime ")
            ) ||
            document.body.innerText.includes("The runtime could not be prepared.") ||
            document.body.innerText.includes(
              "The generated sandbox did not finish booting."
            )
          );
        },
        GENERATED_MECHANIC_RUNTIME_PATH,
        { timeout: Math.min(pollIntervalMs, remainingMs) }
      );
      break;
    } catch (error) {
      if (!/timeout/i.test(error instanceof Error ? error.message : String(error))) {
        throw error;
      }
    }
  }
  const text = await page.locator("body").innerText();
  const lines = text.split("\n").map((line) => line.trim());
  const runtimeReady = lines.includes("Runtime is running in the sandbox.");
  return runtimeReady
    ? { kind: "ready", text: "Runtime is running in the sandbox." }
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

function validateResume(
  run,
  loaded,
  cohort,
  providerModes,
  revision,
  loopContext,
  requestedExecutionPolicy,
  requestedCarryoverAttemptRefs
) {
  if (
    run.manifestId !== loaded.manifest.id ||
    run.manifestHash !== loaded.manifestHash ||
    run.cohort !== cohort ||
    JSON.stringify(run.providerModes) !== JSON.stringify(providerModes)
  ) {
    throw new Error("Resume configuration does not match the frozen campaign run.");
  }
  if (
    loopContext &&
    (run.loopId !== loopContext.loopId ||
      run.loopStepId !== loopContext.loopStepId ||
      run.loopCycle !== loopContext.loopCycle)
  ) {
    throw new Error("Resume loop context does not match the frozen campaign run.");
  }
  if (run.revision.revisionKey !== revision.revisionKey) {
    throw new Error("Cannot resume a campaign on a different repository revision.");
  }
  if (
    requestedExecutionPolicy &&
    run.executionPolicy.hash !== requestedExecutionPolicy.hash
  ) {
    throw new Error(
      "Resume execution policy does not match the frozen campaign run."
    );
  }
  if (
    requestedCarryoverAttemptRefs &&
    JSON.stringify(run.carryoverAttemptRefs ?? []) !==
      JSON.stringify(requestedCarryoverAttemptRefs)
  ) {
    throw new Error(
      "Resume carryover attempts do not match the frozen campaign run."
    );
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

function emptyCostAggregate() {
  return {
    exactNanoUsd: 0,
    estimatedNanoUsd: 0,
    totalNanoUsd: 0,
    pricedCalls: 0,
    unknownCalls: 0,
  };
}

function toAttemptCost(providerCallReceipts, snapshotId) {
  const aggregate = aggregateProviderCallCosts(providerCallReceipts);
  const quality = aggregate.pricedCalls === 0
    ? "unknown"
    : aggregate.exactNanoUsd > 0 && aggregate.estimatedNanoUsd > 0
      ? "mixed"
      : aggregate.estimatedNanoUsd > 0
        ? "estimated"
        : "exact";
  return {
    quality,
    ...(snapshotId ? { snapshotId } : {}),
    ...aggregate,
    ...(aggregate.pricedCalls > 0
      ? { usd: aggregate.totalNanoUsd / 1_000_000_000 }
      : {}),
  };
}

function withRunCost(run, attempts) {
  if (!run.pricing) return run;
  const aggregate = attempts.reduce(
    (total, attempt) => {
      total.exactNanoUsd += attempt.cost?.exactNanoUsd ?? 0;
      total.estimatedNanoUsd += attempt.cost?.estimatedNanoUsd ?? 0;
      total.totalNanoUsd += attempt.cost?.totalNanoUsd ?? 0;
      total.pricedCalls += attempt.cost?.pricedCalls ?? 0;
      total.unknownCalls += attempt.cost?.unknownCalls ?? 0;
      return total;
    },
    emptyCostAggregate()
  );
  return { ...run, cost: aggregate };
}

function campaignScoreResult(score) {
  return {
    successes: score.successes,
    diagnosticSuccesses: score.diagnosticSuccesses,
    submissions: score.submissions,
    qualifiesForMechanicProof: score.qualifiesForMechanicProof,
    missingSuccessfulPromptIds: score.missingSuccessfulPromptIds,
    failures: score.failures,
    failureLimit: score.failureLimit,
    remainingFailureTolerance: score.remainingFailureTolerance,
    baseSubmissions: score.baseSubmissions,
    replacementSubmissions: score.replacementSubmissions,
    ...(score.terminalReason ? { terminalReason: score.terminalReason } : {}),
    ...(score.replacementPromptId
      ? { replacementPromptId: score.replacementPromptId }
      : {}),
  };
}

async function updateCampaignRun(store, fallbackRun, update) {
  if (typeof store.updateRun === "function") {
    return store.updateRun(fallbackRun.id, update);
  }
  const next = update(fallbackRun);
  await store.writeRun(next);
  return store.readRun(fallbackRun.id);
}

export class CampaignInfrastructureFailureError extends Error {
  constructor(message) {
    super(message);
    this.name = "CampaignInfrastructureFailureError";
  }
}

export function requireCampaignAttemptContinuation(attempt) {
  if (attempt.classification !== "infrastructure_failure") return;
  throw new CampaignInfrastructureFailureError(
    `Campaign ${attempt.campaignRunId} attempt ${attempt.id} requires out-of-band repair: ${
      attempt.failure ?? attempt.terminalOutcome
    }`
  );
}

function createCampaignRunId(manifestId, cohort, createdAt) {
  return `${manifestId}-${cohort}-${createdAt.replace(/[-:.]/g, "").replace("Z", "z").toLowerCase()}`;
}

export function summarizeAttemptFailure(generationRun, terminalText, probeResult) {
  const generatedMechanicOutcome =
    generationRun?.metadata?.generatedMechanicOutcome;
  const terminalMechanicIssues =
    generatedMechanicOutcome?.status === "rejected"
      ? (generatedMechanicOutcome.issues ?? [])
      : [];
  const repairIssues =
    generationRun?.artifactScopedRepair?.attempts?.flatMap((attempt) => attempt.issues ?? []) ?? [];
  const planningIssues =
    generationRun?.attempts?.flatMap((attempt) => attempt.validation?.issues ?? []) ?? [];
  const probeFailure = probeResult.assertions?.find(({ passed }) => !passed)?.detail;
  if (generationRun?.status === "succeeded") {
    return (
      probeFailure ??
      terminalText ??
      "Campaign attempt failed after mechanic generation succeeded."
    );
  }
  return (
    terminalMechanicIssues[0]?.message ??
    repairIssues.at(-1)?.message ??
    planningIssues.at(-1)?.message ??
    probeFailure ??
    terminalText ??
    "Campaign attempt failed without structured evidence."
  );
}

export function productionBuildArguments() {
  return ["run", "build"];
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
    /GENERATION ERROR|GENERATION STOPPED|could not be prepared|generated mechanic runtime|generated sandbox did not finish booting|An error has occurred/i.test(line)
  );
  return lines.slice(Math.max(0, errorIndex), errorIndex + 4).join(" ").slice(0, 1000);
}

async function launchBrowser(chromium, headed) {
  const launch = async (options) => {
    const browserServer = await chromium.launchServer(options);
    try {
      const browser = await chromium.connect(browserServer.wsEndpoint());
      return {
        browser,
        async close() {
          await browserServer.kill();
        },
        forceKill() {
          const processHandle = browserServer.process();
          if (processHandle.exitCode === null) {
            processHandle.kill("SIGKILL");
          }
        },
      };
    } catch (error) {
      await browserServer.kill();
      throw error;
    }
  };
  try {
    return await launch({ channel: "chrome", headless: !headed });
  } catch {
    return launch({ headless: !headed });
  }
}

export async function createCampaignBrowserPool({
  chromium,
  headed,
  executionPolicy,
  launchBrowserFn = launchBrowser,
  closeTimeoutMs = 5_000,
}) {
  const processCount = executionPolicy.mode === "parallel"
    ? executionPolicy.maxConcurrentAttempts
    : 1;
  const launchResults = await Promise.allSettled(
    Array.from({ length: processCount }, () =>
      launchBrowserFn(chromium, headed)
    )
  );
  const browserResources = launchResults
    .filter(({ status }) => status === "fulfilled")
    .map(({ value }) =>
      value?.browser && typeof value.close === "function"
        ? value
        : {
            browser: value,
            close: () => value.close(),
          }
    );
  const failedLaunch = launchResults.find(({ status }) => status === "rejected");
  if (failedLaunch) {
    await Promise.allSettled(
      browserResources.map((resource) =>
        closeBrowserResource(resource, closeTimeoutMs)
      )
    );
    throw failedLaunch.reason;
  }
  const available = [...browserResources];
  const leased = new Set();
  const resourcesByBrowser = new Map(
    browserResources.map((resource) => [resource.browser, resource])
  );
  let closed = false;
  return {
    claim() {
      if (closed || available.length === 0) {
        throw new Error("No isolated campaign browser process is available.");
      }
      const resource = available.shift();
      leased.add(resource);
      return resource.browser;
    },
    release(browser) {
      const resource = resourcesByBrowser.get(browser);
      if (closed || !resource || !leased.delete(resource)) {
        throw new Error("Campaign browser process was not leased by this pool.");
      }
      available.push(resource);
    },
    async close() {
      if (closed) return;
      closed = true;
      await Promise.allSettled(
        browserResources.map((resource) =>
          closeBrowserResource(resource, closeTimeoutMs)
        )
      );
      available.length = 0;
      leased.clear();
    },
  };
}

async function closeBrowserResource(resource, timeoutMs) {
  let timeout;
  await Promise.race([
    Promise.resolve().then(() => resource.close()),
    new Promise((resolve) => {
      timeout = setTimeout(() => {
        resource.forceKill?.();
        resolve();
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timeout));
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

function runLoggedProcess(command, args, cwd, logPath, environment) {
  return new Promise((resolve, reject) => {
    const child = startLoggedProcess(
      command,
      args,
      cwd,
      logPath,
      environment
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}.`))
    );
  });
}

function startLoggedProcess(command, args, cwd, logPath, environment) {
  const child = spawn(command, args, {
    cwd,
    env: environment ?? loadCampaignWorktreeEnvironment(cwd),
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
