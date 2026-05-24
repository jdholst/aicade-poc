#!/usr/bin/env node

import { spawn } from "node:child_process";

const baseUrl = process.env.QA_BASE_URL ?? "http://127.0.0.1:3000";
const editorUrl = new URL("/editor", baseUrl).toString();
const requireServer = process.argv.includes("--require-server");

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

async function probeEditor() {
  try {
    const response = await fetch(editorUrl, {
      method: "GET",
      cache: "no-store",
    });

    return {
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

console.log("AI-Cade editor prompt-flow QA");
console.log(`Target editor URL: ${editorUrl}`);
console.log("");

await run("npm", ["run", "test:editor-prompt-flow"]);

const editorProbe = await probeEditor();

if (!editorProbe.ok) {
  const detail = editorProbe.status
    ? `HTTP ${editorProbe.status}`
    : editorProbe.error;
  const message = `Editor route was not reachable at ${editorUrl}: ${detail}.`;

  if (requireServer) {
    throw new Error(
      `${message} In Codex, approve the QA helper if it needs local network access.`
    );
  }

  console.log("");
  console.log(message);
  console.log("Start it with: npm run dev:local");
  console.log("Then re-run: npm run qa:editor-prompt-flow -- --require-server");
  console.log(
    "In Codex, approve the dev server and QA helper if they need local network access."
  );
  process.exit(0);
}

console.log("");
console.log("Editor route is reachable.");
console.log("Manual browser check:");
console.log(`1. Open ${editorUrl}`);
console.log("2. Confirm the black Prompt bubble shows a textarea.");
console.log("3. Enter a prompt and click Send prompt.");
console.log("4. Confirm the white AI config bubble appears.");
console.log("5. Enter a key word or API key and confirm Build the starter game enables.");
