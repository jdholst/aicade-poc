import http from "node:http";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createServer as createViteServer } from "vite";

const vite = await createViteServer({
  root: process.cwd(),
  appType: "spa",
  cacheDir: path.resolve(process.cwd(), ".next/cache/vite-mechanic-realm-candidates"),
  resolve: { alias: { "@": path.resolve(process.cwd(), "src") } },
  server: { middlewareMode: true, hmr: { port: 0 } },
});
const server = http.createServer(vite.middlewares);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Could not resolve the temporary Ticket 14 server address.");
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => {
    if (!isBenignViteHmrWebSocketError(error.message)) {
      browserErrors.push(error.message);
    }
  });
  page.on("console", (message) => {
    if (message.text().startsWith("[ticket14]")) {
      console.log(message.text());
    }
  });
  await page.goto(
    `http://127.0.0.1:${address.port}/scripts/fixtures/mechanic-evaluation-browser.html?candidate=ses_worker`
  );
  try {
    await page.waitForFunction(
      () => window.__mechanicEvaluationBrowserQa !== undefined,
      undefined,
      { timeout: 300_000 }
    );
  } catch (error) {
    throw new Error(
      browserErrors.length > 0 ? browserErrors.join("\n") : getErrorMessage(error)
    );
  }
  const qa = await page.evaluate(() => window.__mechanicEvaluationBrowserQa);
  if (!qa || qa.error) {
    throw new Error(qa?.error ?? "Ticket 14 browser integration did not finish.");
  }
  if (browserErrors.length > 0) {
    throw new Error(browserErrors.join("\n"));
  }
  if (!qa.result || qa.result.status !== "passed") {
    throw new Error(`Ticket 14 browser integration failed: ${JSON.stringify(qa.result)}`);
  }
  console.log(JSON.stringify({ qa: "PASS", ...qa.result }, null, 2));
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

function isBenignViteHmrWebSocketError(message) {
  return (
    message === "WebSocket closed without opened." ||
    message.includes("[vite] failed to connect to websocket")
  );
}
