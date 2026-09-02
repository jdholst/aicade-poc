import http from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createServer as createViteServer } from "vite";

const candidates = ["ses_worker"];
const integrationOnly =
  process.env.MECHANIC_REALM_INTEGRATION_ONLY === "1";
const exactPlayerDriftOnly =
  process.env.MECHANIC_REALM_EXACT_PLAYER_DRIFT_ONLY === "1";
const terminationCorrelationOnly =
  process.env.MECHANIC_REALM_TERMINATION_CORRELATION_ONLY === "1";
const executorReplacementOnly =
  process.env.MECHANIC_REALM_EXECUTOR_REPLACEMENT_ONLY === "1";
const runtimeInitializationOnly =
  process.env.MECHANIC_REALM_RUNTIME_INITIALIZATION_ONLY === "1";
const mainThreadStressMilliseconds =
  process.env.MECHANIC_REALM_MAIN_THREAD_STRESS_MILLISECONDS ?? "";
const requestedIterations =
  process.env.MECHANIC_REALM_REQUESTED_ITERATIONS ?? "";
const elapsedMilliseconds =
  process.env.MECHANIC_REALM_ELAPSED_MILLISECONDS ?? "";

const vite = await createViteServer({
  root: process.cwd(),
  appType: "spa",
  cacheDir: path.resolve(
    process.cwd(),
    ".next/cache/vite-mechanic-realm-candidates"
  ),
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  server: { middlewareMode: true, hmr: false },
});
const server = http.createServer(vite.middlewares);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Could not resolve the candidate-evaluation server address.");
}

const browser = await launchBrowser();

try {
  for (const candidate of candidates) {
    const page = await browser.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => {
      if (!isBenignViteHmrWebSocketError(error.message)) {
        browserErrors.push(error.message);
      }
    });
    await page.goto(
      `http://127.0.0.1:${address.port}/scripts/fixtures/mechanic-execution-realm-candidate-browser.html?candidate=${candidate}${integrationOnly ? "&integrationOnly=1" : ""}${exactPlayerDriftOnly ? "&exactPlayerDriftOnly=1" : ""}${terminationCorrelationOnly ? "&terminationCorrelationOnly=1" : ""}${executorReplacementOnly ? "&executorReplacementOnly=1" : ""}${runtimeInitializationOnly ? "&runtimeInitializationOnly=1" : ""}${mainThreadStressMilliseconds ? `&mainThreadStressMilliseconds=${encodeURIComponent(mainThreadStressMilliseconds)}` : ""}${requestedIterations ? `&requestedIterations=${encodeURIComponent(requestedIterations)}` : ""}${elapsedMilliseconds ? `&elapsedMilliseconds=${encodeURIComponent(elapsedMilliseconds)}` : ""}`,
      { timeout: 60_000, waitUntil: "commit" }
    );
    try {
      await page.waitForFunction(
        () => window.__mechanicRealmCandidateEvaluation !== undefined,
        undefined,
        { timeout: 120_000 }
      );
    } catch (error) {
      console.error(`${candidate}: browser evaluation did not settle`, error);
      throw error;
    }
    const evaluation = await page.evaluate(
      () => window.__mechanicRealmCandidateEvaluation
    );

    if (!evaluation) {
      throw new Error(`${candidate}: evaluation did not finish`);
    }
    if (browserErrors.length > 0) {
      throw new Error(`${candidate}: ${browserErrors.join("\n")}`);
    }
    if (evaluation.error) {
      throw new Error(`${candidate}: ${evaluation.error}`);
    }
    if (runtimeInitializationOnly) {
      const evidence = evaluation.runtimeInitialization;
      if (
        !evidence ||
        evidence.probeDispatchedBeforeAcknowledgement ||
        !evidence.firstProbeHeartbeatAttested ||
        evidence.verdict !== "passed"
      ) {
        throw new Error(
          `${candidate}: runtime initialization readiness failed\n${JSON.stringify(evidence, null, 2)}`
        );
      }
      console.log(
        `PASS ${candidate} runtime initialization precedes the first conformance probe`
      );
      await page.close();
      continue;
    }
    if (executorReplacementOnly) {
      const evidence = evaluation.executorReplacement;
      if (
        !evidence ||
        evidence.initialPoolReadyCount !== 3 ||
        evidence.activeExecutionAcknowledgementCount !== 3 ||
        evidence.exactTerminationOutcomes.length !== 3 ||
        evidence.exactTerminationOutcomes.some(
          (outcome) => outcome !== "terminated"
        ) ||
        !evidence.thirdTerminationRespondedBeforeGateRelease ||
        !evidence.thirdTerminationPrecededReplacementStart ||
        evidence.replacementStartsBeforeGateRelease !== 1 ||
        evidence.freshExecutionRespondedBeforeGateRelease ||
        evidence.freshExecutionOutcome !== "completed" ||
        evidence.replacementStartsAfterRecovery !== 1
      ) {
        throw new Error(
          `${candidate}: executor replacement readiness failed\n${JSON.stringify(evidence, null, 2)}`
        );
      }
      console.log(
        `PASS ${candidate} exact termination precedes one lazy replacement startup`
      );
      await page.close();
      continue;
    }
    if (terminationCorrelationOnly) {
      const evidence = evaluation.terminationCorrelation;
      const expectedScenarioNames = ["active", "prewarmPending", "settled"];
      const actualScenarioNames = evidence
        ? Object.keys(evidence).sort()
        : [];
      const scenarios = evidence
        ? [evidence.prewarmPending, evidence.active, evidence.settled]
        : [];
      if (
        !evidence ||
        actualScenarioNames.length !== expectedScenarioNames.length ||
        actualScenarioNames.some(
          (scenarioName, index) =>
            scenarioName !== expectedScenarioNames[index]
        ) ||
        scenarios.some(
          (scenario) =>
            !scenario ||
            !scenario.executeAcknowledged ||
            !scenario.executeSettled ||
            scenario.wrongTargetResponseCount !== 0 ||
            scenario.exactTerminationOutcome !== "terminated"
        )
      ) {
        throw new Error(
          `${candidate}: termination correlation failed\n${JSON.stringify(evidence, null, 2)}`
        );
      }
      console.log(
        `PASS ${candidate} pending active and settled termination correlation`
      );
      await page.close();
      continue;
    }
    if (exactPlayerDriftOnly) {
      const evidence = evaluation.exactPlayerDrift;
      if (
        !evidence ||
        evidence.outcome !== "completed" ||
        evidence.completedIterations !== evidence.requestedIterations ||
        evidence.velocityX !== 24 ||
        evidence.velocityY !== 0
      ) {
        throw new Error(
          `${candidate}: exact retained player-drift fixed-step failed\n${JSON.stringify(evidence, null, 2)}`
        );
      }
      console.log(
        `PASS ${candidate} exact retained player-drift ${evidence.completedIterations} fixed steps`
      );
      await page.close();
      continue;
    }
    if (!integrationOnly && evaluation.report?.probeResults.length !== 32) {
      throw new Error(`${candidate}: the unchanged 32-probe corpus did not run`);
    }
    if (!integrationOnly && evaluation.report.gates.length !== 10) {
      throw new Error(`${candidate}: the unchanged ten hard gates did not run`);
    }
    if (!integrationOnly && evaluation.report.verdict !== "passed") {
      throw new Error(
        `${candidate}: rejected\n${JSON.stringify(
          {
            failedGates: evaluation.report.gates.filter(
              (gate) => gate.status === "failed"
            ),
            unsuccessfulProbes: evaluation.report.probeResults.filter(
              (probe) =>
                probe.result.outcome === "failed" ||
                !probe.candidateExecutionBrowserEvidence ||
                !probe.runtimeHeartbeatBrowserEvidence
            ),
            controllerAudit: evaluation.controllerAudit,
          },
          null,
          2
        )}`
      );
    }
    if (
      !integrationOnly &&
      !evaluation.report.probeResults.every(
        (probe) =>
          probe.candidateExecutionBrowserEvidence &&
          probe.runtimeHeartbeatBrowserEvidence
      )
    ) {
      throw new Error(`${candidate}: a probe lacked paired browser evidence`);
    }
    if (!integrationOnly) {
      const callbackProbe = evaluation.report.probeResults.find(
        (probe) => probe.probeId === "resource_callback_milliseconds"
      );
      const followingProbe = evaluation.report.probeResults.find(
        (probe) => probe.probeId === "resource_consecutive_failures"
      );
      const callbackUsage = callbackProbe?.result.evidence.resourceUsage;
      if (
        callbackProbe?.result.outcome !== "resource_limit" ||
        callbackUsage?.dimension !== "callback_milliseconds" ||
        callbackUsage.limit !== 8 ||
        callbackUsage.observed <= callbackUsage.limit ||
        !followingProbe?.candidateExecutionBrowserEvidence ||
        !followingProbe.runtimeHeartbeatBrowserEvidence
      ) {
        throw new Error(
          `${candidate}: callback containment lost structured evidence or poisoned the following probe\n${JSON.stringify(
            { callbackProbe, followingProbe },
            null,
            2
          )}`
        );
      }
      const dispatchedProbeCount = evaluation.controllerAudit?.filter(
        (audit) => audit.action === "execute_dispatched"
      ).length;
      if (dispatchedProbeCount !== 32) {
        throw new Error(
          `${candidate}: expected 32 audited inner-realm dispatches, received ${dispatchedProbeCount}`
        );
      }
      const sharedKernelProbeCount = evaluation.controllerAudit?.filter(
        (audit) =>
          audit.action === "shared_kernel_entered" &&
          audit.mode === "conformance"
      ).length;
      if (sharedKernelProbeCount !== 32) {
        throw new Error(
          `${candidate}: expected all 32 probes to enter the shared production kernel, received ${sharedKernelProbeCount}`
        );
      }
    }
    const integration = evaluation.integration;
    if (!integration) {
      throw new Error(`${candidate}: production adapter integration did not run`);
    }
    const expectedIntegrationEvidence = {
      actualHandleReachedHost: true,
      onlyOpaqueTokenCrossedWorker: true,
      grantedObjectReadCompleted: true,
      grantedObservationMatched: true,
      ungrantedStateReadFailed: true,
      fireAndForgetUngrantedFailed: true,
      ungrantedCapabilityDidNotReachHost: true,
      runawayAutoTerminated: true,
      mutableExecutionSnapshotEnforced: true,
      recoveryCompleted: true,
      runtimeRandomSequenceAdvancedAcrossExecutions: true,
      operationsBudgetEnforced: true,
      fireAndForgetOperationsBudgetEnforced: true,
      stateBudgetTotalsDistinctEntries: true,
      trustedHostWaitExcludedFromCallbackBudget: true,
      trustedHostWaitOutcome: "completed",
      trustedHostWaitCapabilityHostCalls: 16,
      trustedHostWaitCallbackBudgetMilliseconds: 8,
      trustedHostWaitResourceDimension: undefined,
      postAwaitCallbackCpuBudgetEnforced: true,
      fireAndForgetCallbackCpuBudgetEnforced: true,
      exactPlayerDriftFixedStepCompleted: true,
      disposalRejectedLateExecute: true,
      capabilityHostCalls: 55,
      productionSharedKernelExecutions: 13,
      controllerDisposalAcknowledged: true,
    };
    for (const [property, expected] of Object.entries(
      expectedIntegrationEvidence
    )) {
      if (integration[property] !== expected) {
        throw new Error(
          `${candidate}: integration evidence ${property} was ${JSON.stringify(
            integration[property]
          )}, expected ${JSON.stringify(expected)}\n${JSON.stringify(
            integration,
            null,
            2
          )}`
        );
      }
    }

    console.log(
      integrationOnly
        ? `PASS ${candidate} production integration`
        : `PASS ${candidate} 32 probes 10 gates production integration`
    );
    await page.close();
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await vite.close();
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (chromeError) {
    try {
      return await chromium.launch({ headless: true });
    } catch (playwrightError) {
      throw new Error(
        [
          "Could not launch system Chrome or Playwright Chromium.",
          `System Chrome: ${getErrorMessage(chromeError)}`,
          `Playwright Chromium: ${getErrorMessage(playwrightError)}`,
        ].join("\n")
      );
    }
  }
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isBenignViteHmrWebSocketError(message) {
  return (
    message === "WebSocket closed without opened." ||
    message.includes("[vite] failed to connect to websocket")
  );
}
