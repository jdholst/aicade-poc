#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const qaPort = process.env.QA_PORT ?? "3100";
const baseUrl = process.env.QA_BASE_URL ?? `http://127.0.0.1:${qaPort}`;
const fallbackEditorUrl = "http://localhost:3000/editor";
let editorUrl = new URL("/editor", baseUrl).toString();
const artifactsDir =
  process.env.QA_ARTIFACTS_DIR ?? ".qa/editor-prompt-flow";
const shouldStartServer = !process.argv.includes("--no-server");
const promptText =
  process.env.QA_EDITOR_PROMPT ??
  "A neon maze game where the player collects keys while drones patrol corridors.";
const keyword = process.env.QA_OPENAI_KEYWORD ?? "internal test";

let devServer;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function loadPlaywright() {
  try {
    return await import("@playwright/test");
  } catch (error) {
    throw new Error(
      [
        "Playwright is not installed.",
        "Install it once with: npm install --save-dev @playwright/test",
        `Import error: ${getErrorMessage(error)}`,
      ].join("\n")
    );
  }
}

async function probeEditor() {
  return probeUrl(editorUrl);
}

async function probeUrl(url) {
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function waitForEditor() {
  const startedAt = Date.now();
  const timeoutMs = 30_000;

  while (Date.now() - startedAt < timeoutMs) {
    if (devServer?.exitCode !== null && devServer?.exitCode !== undefined) {
      if (!process.env.QA_BASE_URL && (await probeUrl(fallbackEditorUrl))) {
        editorUrl = fallbackEditorUrl;
        console.log(
          `Using already-running local dev server at ${fallbackEditorUrl}`
        );
        return;
      }

      throw new Error(
        [
          `Local dev server exited with ${devServer.exitCode} before ${editorUrl} became reachable.`,
          "In Codex, approve this QA command so it can open a local listening port.",
          "Outside Codex, run npm run dev:local to inspect the server error directly.",
        ].join("\n")
      );
    }

    if (await probeEditor()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    [
      `Editor route did not become reachable at ${editorUrl}.`,
      "If the server is already running elsewhere, set QA_BASE_URL to that URL.",
      "In Codex, approve this QA command if it needs local network access.",
    ].join("\n")
  );
}

function startDevServer() {
  devServer = spawn(
    "npx",
    ["next", "dev", "--hostname", "127.0.0.1", "--port", qaPort],
    {
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  devServer.stdout.on("data", (chunk) => {
    process.stdout.write(`[dev] ${chunk}`);
  });
  devServer.stderr.on("data", (chunk) => {
    process.stderr.write(`[dev] ${chunk}`);
  });

  devServer.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`[dev] exited with ${code}\n`);
    }
  });
}

async function launchBrowser(chromium) {
  try {
    return await chromium.launch({
      channel: "chrome",
      headless: true,
    });
  } catch (chromeError) {
    try {
      return await chromium.launch({
        headless: true,
      });
    } catch (playwrightError) {
      throw new Error(
        [
          "Could not launch Chrome or Playwright Chromium.",
          "Install the browser once with: npx playwright install chromium",
          "In Codex, this command may need approval to launch a local browser.",
          `System Chrome error: ${getErrorMessage(chromeError)}`,
          `Playwright Chromium error: ${getErrorMessage(playwrightError)}`,
        ].join("\n")
      );
    }
  }
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  console.log("AI-Cade browser QA: editor prompt flow");
  console.log(`Target editor URL: ${editorUrl}`);
  console.log(`Artifacts: ${path.resolve(artifactsDir)}`);
  console.log("");

  await run("npm", ["run", "test:editor-prompt-flow"]);
  await mkdir(artifactsDir, { recursive: true });

  if (!(await probeEditor())) {
    if (!shouldStartServer) {
      throw new Error(
        `Editor route is not reachable at ${editorUrl}. Start npm run dev:local or omit --no-server.`
      );
    }

    console.log("Starting local dev server...");
    startDevServer();
    await waitForEditor();
  }

  const { chromium, expect } = await loadPlaywright();
  const browser = await launchBrowser(chromium);
  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 720,
    },
  });
  const browserIssues = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      browserIssues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    browserIssues.push(`pageerror: ${error.message}`);
  });

  try {
    await page.goto(editorUrl, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    await expect(
      page.getByRole("heading", { name: "Starter Project" })
    ).toBeVisible();

    const promptBox = page.getByPlaceholder(
      "Describe the starter game you want to build."
    );
    const sendPrompt = page.getByRole("button", { name: "Send prompt" });
    const headerBuild = page.getByRole("button", {
      name: "Build",
      exact: true,
    });

    await expect(promptBox).toBeVisible();
    await expect(sendPrompt).toBeDisabled();
    await expect(headerBuild).toBeDisabled();
    await page.screenshot({
      path: path.join(artifactsDir, "01-empty-prompt.png"),
    });

    await promptBox.click();
    await page.keyboard.type(promptText);
    await expect(promptBox).toHaveValue(promptText);
    await expect(sendPrompt).toBeEnabled();
    await sendPrompt.click();

    await expect(page.getByText(promptText)).toBeVisible();
    await expect(page.getByText("I have your prompt ready.")).toBeVisible();
    await page.screenshot({
      path: path.join(artifactsDir, "02-submitted-prompt.png"),
    });

    const keywordBox = page.getByPlaceholder("Secret Word");
    const buildStarterGame = page.getByRole("button", {
      name: "Build the starter game",
    });

    if (await keywordBox.isVisible().catch(() => false)) {
      await keywordBox.click();
      await page.keyboard.type(keyword);
      await expect(keywordBox).toHaveValue(keyword);
    }

    await expect(buildStarterGame).toBeEnabled();
    await expect(headerBuild).toBeEnabled();
    await page.screenshot({
      path: path.join(artifactsDir, "03-build-ready.png"),
    });

    if (browserIssues.length > 0) {
      throw new Error(`Browser warnings/errors:\n${browserIssues.join("\n")}`);
    }

    console.log("");
    console.log("Browser QA passed.");
    console.log(`Screenshots written to ${path.resolve(artifactsDir)}`);
  } finally {
    await browser.close().catch(() => undefined);
    if (devServer) {
      devServer.kill("SIGTERM");
    }
  }
}

await main();
