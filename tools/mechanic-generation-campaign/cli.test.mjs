import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const cliPath = path.join(import.meta.dirname, "cli.mjs");

describe("campaign manual-QA CLI", () => {
  it("documents the review and explicit verdict commands in live help", async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, "--help"]);

    expect(stdout).toContain("review --campaign <run-id>");
    expect(stdout).toContain("approve --campaign <run-id> --attempt <attempt-id>");
    expect(stdout).toContain("deny --campaign <run-id> --attempt <attempt-id> --reason <text>");
  });

  it("rejects denial without a non-empty reason before reading campaign evidence", async () => {
    await expect(
      execFileAsync(process.execPath, [
        cliPath,
        "deny",
        "--campaign",
        "campaign-1",
        "--attempt",
        "attempt-1",
      ])
    ).rejects.toMatchObject({
      stderr: expect.stringMatching(/Missing required option --reason/),
    });
  });

  it("documents loop conclusion, additive extension, and force-gated discard", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "loop",
      "--help",
    ]);

    expect(stdout).toContain("loop conclude --id <loop-id>");
    expect(stdout).toContain("loop extend --id <loop-id>");
    expect(stdout).toContain("--add-fix-cycles <number>");
    expect(stdout).toContain("--add-planning-calls <number>");
    expect(stdout).toContain("--authorize <extension-hash>");
    expect(stdout).toContain("loop discard --id <loop-id> [--force]");
  });

  it("documents the compiled-knowledge validation, context, reconciliation, and report commands", async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, "--help"]);

    expect(stdout).toContain("knowledge validate");
    expect(stdout).toContain("knowledge report");
    expect(stdout).toContain("knowledge context (--loop <loop-id> | --campaign <run-id>)");
    expect(stdout).toContain(
      "knowledge reconcile (--loop <loop-id> | --campaign <run-id>) --proposal <path>"
    );
  });
});
