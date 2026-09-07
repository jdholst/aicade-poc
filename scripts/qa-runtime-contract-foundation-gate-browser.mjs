import http from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createServer as createViteServer } from "vite";

const vite = await createViteServer({
  root: process.cwd(),
  appType: "spa",
  cacheDir: path.resolve(process.cwd(), ".next/cache/vite-ticket12-foundation-gate"),
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
  throw new Error("Could not resolve the temporary Ticket 12 server address.");
}

const browser = await launchBrowser();

try {
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const baseUrl = `http://127.0.0.1:${address.port}`;

  await page.goto(
    `${baseUrl}/scripts/fixtures/runtime-contract-foundation-gate-browser.html?candidate=ses_worker`
  );
  await page.waitForFunction(
    () => window.__runtimeContractFoundationGateQa !== undefined
  );
  const gateQa = await page.evaluate(
    () => window.__runtimeContractFoundationGateQa
  );
  if (!gateQa || gateQa.error) {
    throw new Error(gateQa?.error ?? "The Ticket 12 foundation gate did not finish.");
  }
  if (browserErrors.length > 0) {
    throw new Error(browserErrors.join("\n"));
  }
  const result = gateQa.result;
  if (!result || result.status !== "passed" || !result.sourceGenerationAvailable) {
    const candidateEvaluation = await page.evaluate(
      () => window.__mechanicRealmCandidateEvaluation
    );
    throw new Error(
      `Ticket 12 gate failed: ${JSON.stringify(
        { result, candidateReport: candidateEvaluation?.report },
        null,
        2
      )}`
    );
  }

  console.log(
    JSON.stringify(
      {
        qa: "PASS",
        realmConformance: result.evidence.realmConformance,
        contract: result.evidence.contract,
        grant: result.evidence.grant,
        deterministicTrace: result.evidence.deterministicTrace,
        containment: result.evidence.containment,
        cleanup: result.evidence.cleanup,
        checks: result.checks,
        terminalResult: result.terminalResult,
        sourceGenerationAvailable: result.sourceGenerationAvailable,
      },
      null,
      2
    )
  );
  await page.close();
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
