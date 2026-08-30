import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { printLoopSummary } from "./lib/loop-cli.mjs";

import { replicateFrozenLoopDefinition } from "./lib/loop-cli.mjs";

const execFileAsync = promisify(execFile);
const cliPath = path.join(import.meta.dirname, "cli.mjs");

describe("campaign manual-QA CLI", () => {
  it("documents the review and explicit verdict commands in live help", async () => {
    const [{ stdout }, cliSource] = await Promise.all([
      execFileAsync(process.execPath, [cliPath, "--help"]),
      readFile(cliPath, "utf8"),
    ]);

    expect(stdout).toContain("review --campaign <run-id>");
    expect(stdout).toContain("approve --campaign <run-id> --attempt <attempt-id>");
    expect(stdout).toContain("deny --campaign <run-id> --attempt <attempt-id> --reason <text>");
    expect(cliSource).toContain("Failures:");
    expect(cliSource).toContain("Remaining failure tolerance:");
    expect(cliSource).toContain("Replacement submissions:");
    expect(cliSource).toContain("failure_limit_reached");
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
    expect(stdout).toContain(
      "loop repair-campaign --id <loop-id> --reason <text>"
    );
    expect(stdout).toContain(
      "loop reconcile-cost --id <loop-id> --reason <text>"
    );
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

  it("reports Sparkline-attributed budgets separately from gross provider authorization usage", () => {
    const output = [];
    vi.spyOn(console, "log").mockImplementation((line) => output.push(line));

    printLoopSummary({
      id: "loop-1",
      status: "waiting_for_campaign_repair",
      currentRevision: { cycle: 0, revisionKey: "a".repeat(64) },
      worktree: { branch: "codex/campaign-loop-loop-1", path: "/repo/worktree" },
      usage: {
        fixCycles: 0,
        campaignRuns: 0,
        submissions: 0,
        auxiliaryIsolationCampaigns: 0,
        actualProviderCalls: { planning: 0, contract: 0, source: 0 },
        grossActualProviderCalls: { planning: 1, contract: 0, source: 0 },
      },
      limits: {
        maxFixCycles: 1,
        maxCampaignRuns: 2,
        maxSubmissions: 2,
        maxAuxiliaryIsolationCampaigns: 1,
        actualProviderCalls: { planning: 2, contract: 2, source: 2 },
      },
      steps: [
        {
          id: "discovery",
          cohort: "discovery",
          status: "running",
          campaignRunIds: ["campaign-1"],
        },
      ],
      currentStepIndex: 0,
      campaignRepairs: [{ status: "pending" }],
      budgetExtensions: [],
    });

    expect(output.join("\n")).toContain(
      "Sparkline-attributed actual-provider usage: planning=0, contract=0, source=0"
    );
    expect(output.join("\n")).toContain(
      "Gross actual-provider usage: planning=1, contract=0, source=0"
    );
    expect(output.join("\n")).toContain("Campaign repairs: 1 (1 pending)");
    vi.restoreAllMocks();
  });

  it("reports unknown reservations as exposure instead of provider spend", () => {
    const output = [];
    vi.spyOn(console, "log").mockImplementation((line) => output.push(line));

    printLoopSummary({
      id: "loop-1",
      status: "exhausted",
      currentRevision: { cycle: 0, revisionKey: "a".repeat(64) },
      worktree: { branch: "codex/campaign-loop-loop-1", path: "/repo/worktree" },
      usage: {
        fixCycles: 0,
        campaignRuns: 1,
        submissions: 1,
        auxiliaryIsolationCampaigns: 0,
        actualProviderCalls: { planning: 1, contract: 1, source: 1 },
        grossActualProviderCalls: { planning: 1, contract: 1, source: 1 },
      },
      limits: {
        maxFixCycles: 1,
        maxCampaignRuns: 2,
        maxSubmissions: 2,
        maxAuxiliaryIsolationCampaigns: 1,
        actualProviderCalls: { planning: 2, contract: 2, source: 2 },
        maxActualProviderCostNanoUsd: 500_000_000,
      },
      providerCost: {
        grossExactNanoUsd: 21_415_800,
        grossEstimatedNanoUsd: 0,
        attributedExactNanoUsd: 15_192_550,
        attributedEstimatedNanoUsd: 0,
        pendingReservations: [],
        settledCalls: [
          {
            callId: "attempt-1:source:1",
            stage: "source",
            completedAt: "2026-08-30T17:25:48.006Z",
            quality: "unknown",
            totalNanoUsd: 0,
            reservationNanoUsd: 755_400_000,
            attributed: true,
          },
        ],
      },
      steps: [
        {
          id: "discovery",
          cohort: "discovery",
          status: "running",
          campaignRunIds: ["campaign-1"],
        },
      ],
      currentStepIndex: 0,
      campaignRepairs: [],
      budgetExtensions: [],
      exhaustionReason: "Actual-provider cost budget is unresolved.",
    });

    expect(output.join("\n")).toContain(
      "Provider cost: gross $0.021416"
    );
    expect(output.join("\n")).toContain(
      "Provider cost exposure: unresolved $0.755400"
    );
    expect(output.join("\n")).toContain(
      "remaining $0.478584; overage $0.000000"
    );
    vi.restoreAllMocks();
  });
});
