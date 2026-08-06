import http from "node:http";

import { chromium } from "@playwright/test";
import { createServer as createViteServer } from "vite";

const modes = [
  "pass",
  "unattested_mix",
  "candidate_wrong_source",
  "candidate_wrong_endpoint",
  "candidate_wrong_nonce",
  "candidate_wrong_probe",
  "candidate_wrong_session",
  "candidate_replay",
  "candidate_disconnected",
  "candidate_replaced",
  "candidate_timeout",
  "candidate_terminate_without_execute",
  "candidate_send_failure",
  "runtime_wrong_id",
  "runtime_wrong_session",
  "runtime_disconnected",
];

const vite = await createViteServer({
  root: process.cwd(),
  appType: "spa",
  server: { middlewareMode: true },
});
const server = http.createServer(vite.middlewares);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Could not resolve the browser fixture server address.");
}

const browser = await launchBrowser();

try {
  for (const mode of modes) {
    const page = await browser.newPage();
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(
      `http://127.0.0.1:${address.port}/scripts/fixtures/mechanic-execution-realm-conformance-browser.html?mode=${mode}`
    );
    await page.waitForFunction(
      () => window.__mechanicRealmConformanceFixture !== undefined
    );
    const fixture = await page.evaluate(
      () => window.__mechanicRealmConformanceFixture
    );

    if (!fixture || fixture.error) {
      throw new Error(`${mode}: ${fixture?.error ?? "fixture did not finish"}`);
    }
    if (browserErrors.length > 0) {
      throw new Error(`${mode}: ${browserErrors.join("\n")}`);
    }
    if (fixture.report?.probeResults.length !== 32) {
      throw new Error(`${mode}: the 32-probe corpus changed`);
    }
    if (fixture.report.gates.length !== 10) {
      throw new Error(`${mode}: the ten-hard-gate policy changed`);
    }
    const browserGate = fixture.report.gates.find(
      (gate) => gate.id === "browser_integration"
    );
    if (mode === "pass") {
      if (fixture.report.verdict !== "passed" || browserGate?.status !== "passed") {
        throw new Error(
          `${mode}: legitimate browser evidence was rejected\n${JSON.stringify(
            {
              browserGate,
              failedGates: fixture.report.gates.filter(
                (gate) => gate.status === "failed"
              ),
              firstProbe: fixture.report.probeResults[0],
              audits: fixture.audits.slice(0, 4),
            },
            null,
            2
          )}`
        );
      }
      if (
        !fixture.report.probeResults.every(
          (probe) =>
            probe.candidateExecutionBrowserEvidence &&
            probe.runtimeHeartbeatBrowserEvidence
        )
      ) {
        throw new Error(`${mode}: a probe lacked paired browser evidence`);
      }
      assertFreshPairedEvidence(fixture.audits);
    } else if (browserGate?.status !== "failed") {
      throw new Error(`${mode}: adversarial evidence passed browser integration`);
    }
    if (fixture.activeMessageListeners !== 0) {
      throw new Error(`${mode}: browser-conformance listeners leaked`);
    }
    if (
      fixture.sandboxValues.some((sandbox) =>
        sandbox.split(/\s+/u).includes("allow-same-origin")
      )
    ) {
      throw new Error(`${mode}: iframe sandboxing was weakened`);
    }

    console.log(`PASS ${mode}`);
    await page.close();
  }
} finally {
  await browser.close();
  await vite.close();
  await new Promise((resolve) => server.close(resolve));
}

function assertFreshPairedEvidence(audits) {
  const candidate = audits.filter(
    (audit) => audit.source === "candidate" && audit.action === "execute"
  );
  const runtime = audits.filter((audit) => audit.source === "runtime");
  if (candidate.length !== 32 || runtime.length !== 32) {
    throw new Error("pass: every probe must issue one candidate and heartbeat challenge");
  }
  if (
    new Set(candidate.map((audit) => audit.nonce)).size !== 32 ||
    new Set(runtime.map((audit) => audit.nonce)).size !== 32 ||
    new Set([...candidate, ...runtime].map((audit) => audit.nonce)).size !== 64
  ) {
    throw new Error("pass: browser evidence nonces were reused");
  }
  const sessionIds = new Set(
    [...candidate, ...runtime].map((audit) => audit.sessionId)
  );
  if (sessionIds.size !== 1) {
    throw new Error("pass: candidate and runtime evidence used different sessions");
  }
  if (
    new Set(candidate.map((audit) => audit.endpointId)).size !== 1 ||
    new Set(runtime.map((audit) => audit.endpointId)).size !== 1
  ) {
    throw new Error("pass: captured endpoint identities changed during the suite");
  }
  if (
    candidate.some(
      (audit, index) => audit.probeId !== runtime[index]?.probeId
    )
  ) {
    throw new Error("pass: candidate and runtime evidence targeted different probes");
  }
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
