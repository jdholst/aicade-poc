import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { replicateFrozenLoopDefinition } from "./lib/loop-cli.mjs";

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

  it("documents accepted-worktree resume against a persisted state root", async () => {
    const { stdout } = await execFileAsync(process.execPath, [
      cliPath,
      "loop",
      "--help",
    ]);

    expect(stdout).toContain("--state-root <path>");
    expect(stdout).toContain("accepted loop worktree");
  });

  it("uses the explicit persisted state root for loop resume", async () => {
    const stateRoot = await mkdtemp(
      path.join(tmpdir(), "campaign-loop-state-root-")
    );
    try {
      let stderr = "";
      try {
        await execFileAsync(process.execPath, [
          cliPath,
          "loop",
          "resume",
          "--id",
          "missing-loop",
          "--state-root",
          stateRoot,
        ]);
      } catch (error) {
        stderr = error.stderr;
      }

      expect(stderr).toContain(
        path.join(
          stateRoot,
          ".qa",
          "mechanic-generation-campaign",
          "loops",
          "missing-loop",
          "loop-run.json"
        )
      );
      expect(
        (
          await stat(
            path.join(
              stateRoot,
              ".qa",
              "mechanic-generation-campaign",
              "loops"
            )
          )
        ).isDirectory()
      ).toBe(true);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  it("copies the exact frozen definition into the accepted execution root", async () => {
    const stateRoot = await mkdtemp(
      path.join(tmpdir(), "campaign-loop-source-root-")
    );
    const executionRoot = await mkdtemp(
      path.join(tmpdir(), "campaign-loop-execution-root-")
    );
    try {
      const definitionPath = path.join(".qa", "frozen-loop.json");
      const sourcePath = path.join(stateRoot, definitionPath);
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, '{"definition":"exact"}\n', "utf8");

      const destinationPath = await replicateFrozenLoopDefinition({
        repoRoot: executionRoot,
        stateRoot,
        definitionPath,
      });

      expect(destinationPath).toBe(path.join(executionRoot, definitionPath));
      expect(await readFile(destinationPath, "utf8")).toBe(
        '{"definition":"exact"}\n'
      );
    } finally {
      await Promise.all([
        rm(stateRoot, { recursive: true, force: true }),
        rm(executionRoot, { recursive: true, force: true }),
      ]);
    }
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
