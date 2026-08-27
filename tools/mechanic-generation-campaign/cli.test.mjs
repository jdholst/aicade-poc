import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { printLoopSummary } from "./lib/loop-cli.mjs";

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
    expect(stdout).toContain(
      "loop repair-campaign --id <loop-id> --reason <text>"
    );
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
});
