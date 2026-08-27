import { execFile } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  discardCampaignLoop,
  concludeLoopSession,
  discardLoopSession,
} from "./lib/loop-lifecycle.mjs";
import { createCampaignLoopStore } from "./lib/loop-store.mjs";
import { inspectRevision } from "./lib/revision.mjs";

const execFileAsync = promisify(execFile);
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("campaign loop session lifecycle", () => {
  it("concludes a commit-free loop without changing the control revision", async () => {
    const fixture = await createLoopFixture();

    const concluded = await concludeLoopSession({
      repoRoot: fixture.controlRoot,
      run: fixture.run,
      fixes: [],
      now: () => new Date("2026-08-24T13:00:00.000Z"),
    });

    expect(concluded).toMatchObject({
      status: "concluded",
      lifecycle: {
        action: "conclude",
        previousStatus: "achieved",
        at: "2026-08-24T13:00:00.000Z",
        worktreeRemoved: true,
        branchRemoved: true,
        targetBranch: "main",
        headBefore: fixture.base.head,
        headAfter: fixture.base.head,
        mergedFixes: false,
      },
    });
    await expect(access(fixture.worktreePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      git(fixture.controlRoot, [
        "show-ref",
        "--verify",
        "--quiet",
        `refs/heads/${fixture.branch}`,
      ])
    ).rejects.toMatchObject({ code: 1 });
  });

  it("merges a verified multi-fix chain before removing the loop session", async () => {
    const fixture = await createLoopFixture();
    const first = await commitFix(fixture, {
      file: "src/pipeline.txt",
      contents: "verified fix\n",
    });
    const { run, fixes } = await commitFix(
      fixture,
      {
        file: "src/contract.txt",
        contents: "verified contract fix\n",
      },
      first
    );

    const concluded = await concludeLoopSession({
      repoRoot: fixture.controlRoot,
      run,
      fixes,
      now: () => new Date("2026-08-24T13:00:00.000Z"),
    });

    expect(concluded.lifecycle.mergedFixes).toBe(true);
    expect(concluded.lifecycle.headAfter).not.toBe(fixture.base.head);
    expect(
      await readFile(path.join(fixture.controlRoot, "src/pipeline.txt"), "utf8")
    ).toBe("verified fix\n");
    expect(
      await readFile(path.join(fixture.controlRoot, "src/contract.txt"), "utf8")
    ).toBe("verified contract fix\n");
    const { stdout: parents } = await git(fixture.controlRoot, [
      "rev-list",
      "--parents",
      "-n",
      "1",
      "HEAD",
    ]);
    expect(parents.trim().split(" ")).toHaveLength(3);
  });

  it("merges a verified linear multi-commit fix checkpoint", async () => {
    const fixture = await createLoopFixture();
    await mkdir(path.join(fixture.worktreePath, "src"), { recursive: true });
    await writeFile(
      path.join(fixture.worktreePath, "src", "pipeline.txt"),
      "first verified change\n",
      "utf8"
    );
    await git(fixture.worktreePath, ["add", "src/pipeline.txt"]);
    await git(fixture.worktreePath, ["commit", "-m", "first checkpoint commit"]);
    const { run, fixes } = await commitFix(fixture, {
      file: "src/contract.txt",
      contents: "second verified change\n",
    });
    fixes[0] = {
      ...fixes[0],
      changedFiles: ["src/contract.txt", "src/pipeline.txt"],
    };

    const concluded = await concludeLoopSession({
      repoRoot: fixture.controlRoot,
      run,
      fixes,
    });

    expect(concluded.lifecycle.mergedFixes).toBe(true);
    expect(
      await readFile(path.join(fixture.controlRoot, "src/pipeline.txt"), "utf8")
    ).toBe("first verified change\n");
    expect(
      await readFile(path.join(fixture.controlRoot, "src/contract.txt"), "utf8")
    ).toBe("second verified change\n");
  });

  it("aborts a conflicting conclusion without removing the loop session", async () => {
    const fixture = await createLoopFixture();
    await writeFile(
      path.join(fixture.controlRoot, "README.md"),
      "control change\n",
      "utf8"
    );
    await git(fixture.controlRoot, ["add", "README.md"]);
    await git(fixture.controlRoot, ["commit", "-m", "control change"]);
    const { run, fixes } = await commitFix(fixture, {
      file: "README.md",
      contents: "loop change\n",
    });

    await expect(
      concludeLoopSession({
        repoRoot: fixture.controlRoot,
        run,
        fixes,
      })
    ).rejects.toThrow();

    await expect(access(fixture.worktreePath)).resolves.toBeUndefined();
    await expect(
      access(path.join(fixture.controlRoot, ".git", "MERGE_HEAD"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await resolveBranch(fixture.controlRoot, fixture.branch)).toBe(
      run.currentRevision.head
    );
  });

  it("reconciles a loop whose fix was already merged and cleaned manually", async () => {
    const fixture = await createLoopFixture();
    const { run, fixes } = await commitFix(fixture, {
      file: "src/pipeline.txt",
      contents: "verified fix\n",
    });
    await git(fixture.controlRoot, ["merge", "--no-ff", "--no-edit", fixture.branch]);
    await git(fixture.controlRoot, ["worktree", "remove", fixture.worktreePath]);
    await git(fixture.controlRoot, ["branch", "-d", fixture.branch]);

    const concluded = await concludeLoopSession({
      repoRoot: fixture.controlRoot,
      run,
      fixes,
    });

    expect(concluded.status).toBe("concluded");
    expect(concluded.lifecycle.mergedFixes).toBe(false);
  });

  it("reconciles a worktree directory removed outside Git", async () => {
    const fixture = await createLoopFixture();
    await rm(fixture.worktreePath, { recursive: true, force: true });

    const concluded = await concludeLoopSession({
      repoRoot: fixture.controlRoot,
      run: fixture.run,
      fixes: [],
    });

    expect(concluded.status).toBe("concluded");
    expect(await resolveBranch(fixture.controlRoot, fixture.branch)).toBeNull();
  });

  it("reconciles a loop branch removed after manually detaching the worktree", async () => {
    const fixture = await createLoopFixture();
    await git(fixture.worktreePath, ["switch", "--detach"]);
    await git(fixture.controlRoot, ["branch", "-D", fixture.branch]);

    const concluded = await concludeLoopSession({
      repoRoot: fixture.controlRoot,
      run: fixture.run,
      fixes: [],
    });

    expect(concluded.status).toBe("concluded");
    await expect(access(fixture.worktreePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rejects commits hidden inside a reported fix checkpoint", async () => {
    const fixture = await createLoopFixture();
    await mkdir(path.join(fixture.worktreePath, "src"), { recursive: true });
    await writeFile(
      path.join(fixture.worktreePath, "src", "hidden.txt"),
      "unreported\n",
      "utf8"
    );
    await git(fixture.worktreePath, ["add", "src/hidden.txt"]);
    await git(fixture.worktreePath, ["commit", "-m", "unreported commit"]);
    const { run, fixes } = await commitFix(fixture, {
      file: "src/pipeline.txt",
      contents: "reported fix\n",
    });

    await expect(
      concludeLoopSession({
        repoRoot: fixture.controlRoot,
        run,
        fixes,
      })
    ).rejects.toThrow(/unreported commits/i);

    await expect(access(fixture.worktreePath)).resolves.toBeUndefined();
    expect(await resolveBranch(fixture.controlRoot, fixture.branch)).toBe(
      run.currentRevision.head
    );
  });

  it("discards a clean non-running loop without deleting its evidence object", async () => {
    const fixture = await createLoopFixture();
    const run = { ...fixture.run, status: "interrupted" };

    const discarded = await discardLoopSession({
      repoRoot: fixture.controlRoot,
      run,
      force: false,
      now: () => new Date("2026-08-24T13:00:00.000Z"),
    });

    expect(discarded).toMatchObject({
      id: run.id,
      status: "discarded",
      lifecycle: {
        action: "discard",
        previousStatus: "interrupted",
        forced: false,
      },
      campaignLinks: run.campaignLinks,
    });
    await expect(access(fixture.worktreePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await resolveBranch(fixture.controlRoot, fixture.branch)).toBeNull();
  });

  it("discards a pending loop and preserves its persisted run evidence", async () => {
    const fixture = await createLoopFixture();
    const loopStore = createCampaignLoopStore(fixture.controlRoot);
    const run = { ...fixture.run, status: "pending", result: undefined };
    await loopStore.initialize();
    await loopStore.writeRun(run);

    const discarded = await discardCampaignLoop({
      repoRoot: fixture.controlRoot,
      loopId: run.id,
      loopStore,
    });

    expect(discarded.status).toBe("discarded");
    expect(await loopStore.readRun(run.id)).toMatchObject({
      id: run.id,
      status: "discarded",
      lifecycle: { action: "discard", previousStatus: "pending" },
    });
  });

  it("requires force and reports dirty paths before destructive discard", async () => {
    const fixture = await createLoopFixture();
    await writeFile(path.join(fixture.worktreePath, "dirty.txt"), "keep me\n", "utf8");
    const run = { ...fixture.run, status: "blocked" };

    await expect(
      discardLoopSession({
        repoRoot: fixture.controlRoot,
        run,
        force: false,
      })
    ).rejects.toThrow(
      new RegExp(`--force.*${fixture.worktreePath.replaceAll("/", "\\/")}\/dirty\\.txt`, "i")
    );

    const discarded = await discardLoopSession({
      repoRoot: fixture.controlRoot,
      run,
      force: true,
    });
    expect(discarded.status).toBe("discarded");
    expect(discarded.lifecycle.forced).toBe(true);
    await expect(access(fixture.worktreePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});

async function createLoopFixture() {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "campaign-loop-lifecycle-"));
  temporaryDirectories.push(fixtureRoot);
  const controlRoot = path.join(fixtureRoot, "control");
  const worktreePath = path.join(fixtureRoot, "worktrees", "test-loop");
  const branch = "codex/campaign-loop-test-loop";
  await mkdir(controlRoot, { recursive: true });
  await git(controlRoot, ["init", "-b", "main"]);
  await git(controlRoot, ["config", "user.email", "campaign@example.test"]);
  await git(controlRoot, ["config", "user.name", "Campaign Test"]);
  await writeFile(path.join(controlRoot, "README.md"), "base\n", "utf8");
  await git(controlRoot, ["add", "README.md"]);
  await git(controlRoot, ["commit", "-m", "base"]);
  const base = await inspectRevision(controlRoot);
  await mkdir(path.dirname(worktreePath), { recursive: true });
  await git(controlRoot, [
    "worktree",
    "add",
    "-b",
    branch,
    worktreePath,
    base.head,
  ]);
  return {
    fixtureRoot,
    controlRoot,
    worktreePath,
    branch,
    base,
    run: createRun({ controlRoot, worktreePath, branch, base }),
  };
}

function createRun({ controlRoot, worktreePath, branch, base }) {
  return {
    schemaVersion: "campaign-loop-run/v2",
    id: "test-loop",
    definitionPath: ".qa/test-loop.json",
    definitionHash: "1".repeat(64),
    authorizationHash: "2".repeat(64),
    manifestId: "test-projectile",
    manifestPath: "tools/harness/manifest.json",
    manifestHash: "3".repeat(64),
    model: "gpt-5.6-luna",
    status: "achieved",
    createdAt: "2026-08-24T12:00:00.000Z",
    completedAt: "2026-08-24T12:30:00.000Z",
    baseRevision: { head: base.head, revisionKey: base.revisionKey },
    currentRevision: {
      head: base.head,
      revisionKey: base.revisionKey,
      cycle: 0,
    },
    currentStepIndex: 1,
    usage: {
      fixCycles: 0,
      campaignRuns: 1,
      submissions: 1,
      auxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 1, contract: 1, source: 1 },
    },
    limits: {
      maxFixCycles: 1,
      maxCampaignRuns: 2,
      maxSubmissions: 2,
      maxAuxiliaryIsolationCampaigns: 0,
      actualProviderCalls: { planning: 2, contract: 2, source: 2 },
    },
    worktree: { controlRoot, path: worktreePath, branch },
    steps: [
      {
        id: "discover",
        cohort: "discovery",
        status: "achieved",
        campaignRunIds: ["campaign-1"],
        sameRevisionRuns: 1,
        revisionKey: base.revisionKey,
      },
    ],
    campaignLinks: [
      {
        campaignRunId: "campaign-1",
        role: "sequence",
        stepId: "discover",
        cycle: 0,
        revisionKey: base.revisionKey,
        status: "achieved",
      },
    ],
    fixCheckpointIds: [],
    budgetExtensions: [],
    result: {
      sequenceAchieved: true,
      mechanicProven: false,
      achievedStepIds: ["discover"],
      finalRevisionKey: base.revisionKey,
    },
  };
}

async function commitFix(fixture, { file, contents }, prior) {
  const previousRun = prior?.run ?? fixture.run;
  const previousFixes = prior?.fixes ?? [];
  const filePath = path.join(fixture.worktreePath, file);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
  await git(fixture.worktreePath, ["add", file]);
  await git(fixture.worktreePath, ["commit", "-m", "verified loop fix"]);
  const after = await inspectRevision(fixture.worktreePath);
  const fixNumber = previousFixes.length + 1;
  const fix = {
    schemaVersion: "campaign-loop-fix/v1",
    id: `fix-cycle-${fixNumber}`,
    loopId: fixture.run.id,
    triggerCampaignRunId: "campaign-1",
    triggerClassification: "pipeline_failure",
    diagnosis: "The pipeline required a mechanic-general correction.",
    kind: "durable",
    temporaryFixIds: [],
    changedFiles: [file],
    verification: [
      {
        command: "npm test",
        status: "passed",
        summary: "Focused verification passed.",
      },
    ],
    beforeRevision: {
      head: previousRun.currentRevision.head,
      revisionKey: previousRun.currentRevision.revisionKey,
    },
    afterRevision: { head: after.head, revisionKey: after.revisionKey },
    commit: after.head,
    createdAt: "2026-08-24T12:45:00.000Z",
  };
  return {
    run: {
      ...previousRun,
      status: "exhausted",
      currentRevision: {
        head: after.head,
        revisionKey: after.revisionKey,
        cycle: previousRun.currentRevision.cycle + 1,
      },
      usage: {
        ...previousRun.usage,
        fixCycles: previousRun.usage.fixCycles + 1,
      },
      fixCheckpointIds: [...previousRun.fixCheckpointIds, fix.id],
      exhaustionReason: "The current step failed and no fix cycles remain.",
      exhaustionResume: { status: "waiting_for_fix" },
    },
    fixes: [...previousFixes, fix],
  };
}

async function resolveBranch(repoRoot, branch) {
  try {
    const { stdout } = await git(repoRoot, [
      "rev-parse",
      "--verify",
      `refs/heads/${branch}`,
    ]);
    return stdout.trim();
  } catch (error) {
    if (error?.code === 128) return null;
    throw error;
  }
}

function git(cwd, args) {
  return execFileAsync("git", args, { cwd, encoding: "utf8" });
}
