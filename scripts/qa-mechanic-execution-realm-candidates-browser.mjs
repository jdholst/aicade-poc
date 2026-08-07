import http from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createServer as createViteServer } from "vite";

const candidates = ["ses_worker"];

const vite = await createViteServer({
  root: process.cwd(),
  appType: "spa",
  cacheDir: path.resolve(
    process.cwd(),
    ".next/cache/vite-mechanic-realm-candidates"
  ),
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  server: { middlewareMode: true },
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
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(
      `http://127.0.0.1:${address.port}/scripts/fixtures/mechanic-execution-realm-candidate-browser.html?candidate=${candidate}`
    );
    await page.waitForFunction(
      () => window.__mechanicRealmCandidateEvaluation !== undefined
    );
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
    if (evaluation.report?.probeResults.length !== 32) {
      throw new Error(`${candidate}: the unchanged 32-probe corpus did not run`);
    }
    if (evaluation.report.gates.length !== 10) {
      throw new Error(`${candidate}: the unchanged ten hard gates did not run`);
    }
    if (evaluation.report.verdict !== "passed") {
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
      !evaluation.report.probeResults.every(
        (probe) =>
          probe.candidateExecutionBrowserEvidence &&
          probe.runtimeHeartbeatBrowserEvidence
      )
    ) {
      throw new Error(`${candidate}: a probe lacked paired browser evidence`);
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
      deterministicReplayMatched: true,
      operationsBudgetEnforced: true,
      fireAndForgetOperationsBudgetEnforced: true,
      stateBudgetTotalsDistinctEntries: true,
      disposalRejectedLateExecute: true,
      capabilityHostCalls: 2,
      productionSharedKernelExecutions: 10,
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

    console.log(`PASS ${candidate} 32 probes 10 gates production integration`);
    await page.close();
  }
} finally {
  await browser.close();
  await vite.close();
  await new Promise((resolve) => server.close(resolve));
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
