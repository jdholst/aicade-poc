import { execFile } from "node:child_process";
import { lstat, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { CAMPAIGN_LOOP_RUN_SCHEMA_VERSION } from "./loop-contracts.mjs";
import { createCampaignLoopStore } from "./loop-store.mjs";
import { changedFilesBetween, inspectLoopWorktree } from "./loop-worktree.mjs";
import { inspectRevision } from "./revision.mjs";

const execFileAsync = promisify(execFile);
const CONCLUDABLE_STATUSES = ["achieved", "blocked", "exhausted", "invalid"];
const NON_RUNNING_STATUSES = [
  "pending",
  "waiting_for_manual_qa",
  "waiting_for_fix",
  "interrupted",
  ...CONCLUDABLE_STATUSES,
];

export async function concludeCampaignLoop({
  repoRoot,
  loopId,
  loopStore = createCampaignLoopStore(repoRoot),
  now,
}) {
  await loopStore.initialize();
  const run = await loopStore.readRun(loopId);
  const fixes = await loopStore.readFixes(loopId);
  const concluded = await concludeLoopSession({
    repoRoot,
    run,
    fixes,
    ...(now ? { now } : {}),
  });
  await loopStore.writeRun(concluded);
  return concluded;
}

export async function discardCampaignLoop({
  repoRoot,
  loopId,
  force = false,
  loopStore = createCampaignLoopStore(repoRoot),
  now,
}) {
  await loopStore.initialize();
  const run = await loopStore.readRun(loopId);
  const discarded = await discardLoopSession({
    repoRoot,
    run,
    force,
    ...(now ? { now } : {}),
  });
  await loopStore.writeRun(discarded);
  return discarded;
}

export async function concludeLoopSession({
  repoRoot,
  run,
  fixes,
  now = () => new Date(),
}) {
  if (run.status === "concluded") return run;
  if (!CONCLUDABLE_STATUSES.includes(run.status)) {
    throw new Error(`Loop ${run.id} cannot be concluded from status ${run.status}.`);
  }
  const controlRoot = path.resolve(repoRoot);
  await assertRecordedControlRoot(controlRoot, run.worktree.controlRoot);
  const control = await inspectControlCheckout(controlRoot, run.baseRevision.head);
  await validateFixChain(controlRoot, run, fixes);
  const branchHead = await resolveBranchHead(controlRoot, run.worktree.branch);
  if (branchHead && branchHead !== run.currentRevision.head) {
    throw new Error(
      `Loop branch tip ${branchHead} does not match recorded revision ${run.currentRevision.head}.`
    );
  }
  const worktreeExists = await pathExists(run.worktree.path);
  if (worktreeExists) {
    const worktree = await inspectLifecycleWorktree({
      path: run.worktree.path,
      branch: run.worktree.branch,
      branchExists: Boolean(branchHead),
    });
    if (worktree.dirty || worktree.head !== run.currentRevision.head) {
      throw new Error(
        `Loop worktree is not clean at recorded revision: ${worktree.statusEntries.join(", ") || worktree.head}.`
      );
    }
  }
  const alreadyMerged = await isAncestor(
    controlRoot,
    run.currentRevision.head,
    control.head
  );
  if (!branchHead && !alreadyMerged) {
    throw new Error("Loop branch is missing and its recorded revision is not merged.");
  }

  let headAfter = control.head;
  let mergedFixes = false;
  if (fixes.length > 0 && !alreadyMerged) {
    try {
      await git(controlRoot, ["merge", "--no-ff", "--no-edit", run.worktree.branch]);
    } catch (error) {
      await abortMergeIfPresent(controlRoot);
      throw error;
    }
    headAfter = await currentHead(controlRoot);
    mergedFixes = true;
  }

  if (worktreeExists) {
    await removeWorktree(controlRoot, run.worktree.path, false);
  } else {
    await pruneMissingWorktrees(controlRoot);
  }
  if (await resolveBranchHead(controlRoot, run.worktree.branch)) {
    await git(controlRoot, ["branch", "-d", run.worktree.branch]);
  }

  return {
    ...run,
    schemaVersion: CAMPAIGN_LOOP_RUN_SCHEMA_VERSION,
    status: "concluded",
    activeCampaign: undefined,
    pendingManualQa: undefined,
    exhaustionResume: undefined,
    lifecycle: {
      action: "conclude",
      previousStatus: run.status,
      at: now().toISOString(),
      worktreeRemoved: true,
      branchRemoved: true,
      targetBranch: control.branch,
      headBefore: control.head,
      headAfter,
      mergedFixes,
    },
  };
}

export async function discardLoopSession({
  repoRoot,
  run,
  force = false,
  now = () => new Date(),
}) {
  if (run.status === "discarded") return run;
  if (!NON_RUNNING_STATUSES.includes(run.status)) {
    throw new Error(`Loop ${run.id} cannot be discarded from status ${run.status}.`);
  }
  const controlRoot = path.resolve(repoRoot);
  await assertRecordedControlRoot(controlRoot, run.worktree.controlRoot);
  const unsafe = [];
  const branchHead = await resolveBranchHead(controlRoot, run.worktree.branch);
  if (branchHead && branchHead !== run.currentRevision.head) {
    unsafe.push(
      `refs/heads/${run.worktree.branch}: tip ${branchHead} does not match ${run.currentRevision.head}`
    );
  }
  const worktreeExists = await pathExists(run.worktree.path);
  if (worktreeExists) {
    try {
      const worktree = await inspectLifecycleWorktree({
        path: run.worktree.path,
        branch: run.worktree.branch,
        branchExists: Boolean(branchHead),
      });
      if (worktree.head !== run.currentRevision.head) {
        unsafe.push(
          `${run.worktree.path}: head ${worktree.head} does not match ${run.currentRevision.head}`
        );
      }
      if (worktree.dirty) {
        unsafe.push(
          ...worktree.statusEntries.map((entry) =>
            formatWorktreeStatusPath(run.worktree.path, entry)
          )
        );
      }
    } catch (error) {
      unsafe.push(
        `${run.worktree.path}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (unsafe.length > 0 && !force) {
    throw new Error(
      `Discard requires --force because the loop worktree is unsafe: ${unsafe.join(", ")}`
    );
  }
  if (worktreeExists) {
    await removeWorktree(controlRoot, run.worktree.path, force);
  } else {
    await pruneMissingWorktrees(controlRoot);
  }
  if (await resolveBranchHead(controlRoot, run.worktree.branch)) {
    await git(controlRoot, ["branch", "-D", run.worktree.branch]);
  }
  const activeCampaignId = run.activeCampaign?.campaignRunId;
  return {
    ...run,
    schemaVersion: CAMPAIGN_LOOP_RUN_SCHEMA_VERSION,
    status: "discarded",
    activeCampaign: undefined,
    pendingManualQa: undefined,
    exhaustionResume: undefined,
    campaignLinks: run.campaignLinks.map((link) =>
      link.campaignRunId === activeCampaignId
        ? { ...link, status: "discarded" }
        : link
    ),
    lifecycle: {
      action: "discard",
      previousStatus: run.status,
      at: now().toISOString(),
      worktreeRemoved: true,
      branchRemoved: true,
      forced: force,
    },
  };
}

async function validateFixChain(repoRoot, run, fixes) {
  if (fixes.length !== run.fixCheckpointIds.length) {
    throw new Error("Stored fix reports do not match the loop fix checkpoints.");
  }
  let head = run.baseRevision.head;
  for (const id of run.fixCheckpointIds) {
    const fix = fixes.find((candidate) => candidate.id === id);
    if (!fix) throw new Error(`Missing stored fix report ${id}.`);
    if (
      fix.loopId !== run.id ||
      fix.beforeRevision.head !== head ||
      fix.afterRevision.head !== fix.commit
    ) {
      throw new Error(`Fix report ${id} does not form a verified revision chain.`);
    }
    const { stdout: commits } = await git(repoRoot, [
      "rev-list",
      "--reverse",
      "--parents",
      `${fix.beforeRevision.head}..${fix.afterRevision.head}`,
    ]);
    let checkpointHead = fix.beforeRevision.head;
    for (const line of commits.trim().split("\n").filter(Boolean)) {
      const [commit, ...commitParents] = line.split(" ");
      if (commitParents.length !== 1 || commitParents[0] !== checkpointHead) {
        throw new Error(
          `Fix report ${id} contains unreported commits or a non-linear checkpoint.`
        );
      }
      checkpointHead = commit;
    }
    if (checkpointHead !== fix.afterRevision.head) {
      throw new Error(
        `Fix report ${id} contains unreported commits or a non-linear checkpoint.`
      );
    }
    const actualChangedFiles = await changedFilesBetween(
      repoRoot,
      fix.beforeRevision.head,
      fix.afterRevision.head
    );
    if (
      JSON.stringify(actualChangedFiles) !==
      JSON.stringify([...fix.changedFiles].sort())
    ) {
      throw new Error(
        `Fix report ${id} contains unreported commits or changed files.`
      );
    }
    head = fix.afterRevision.head;
  }
  if (head !== run.currentRevision.head) {
    throw new Error("Verified fix chain does not end at the loop revision.");
  }
}

async function inspectControlCheckout(controlRoot, baseHead) {
  const [{ stdout: topLevel }, { stdout: branch }, revision] = await Promise.all([
    git(controlRoot, ["rev-parse", "--show-toplevel"]),
    git(controlRoot, ["branch", "--show-current"]),
    inspectRevision(controlRoot),
  ]);
  if (
    (await realpath(topLevel.trim())) !== (await realpath(controlRoot))
  ) {
    throw new Error("Recorded control checkout is not the repository root.");
  }
  if (!branch.trim()) {
    throw new Error("Concluding a loop requires a checked-out control branch.");
  }
  if (revision.dirty) {
    throw new Error(
      `Concluding a loop requires a clean control checkout: ${revision.statusEntries.join(", ")}.`
    );
  }
  if (!(await isAncestor(controlRoot, baseHead, revision.head))) {
    throw new Error("Control branch is not descended from the loop base revision.");
  }
  return { branch: branch.trim(), head: revision.head };
}

async function assertRecordedControlRoot(controlRoot, recordedControlRoot) {
  if (
    (await realpath(controlRoot)) !==
    (await realpath(path.resolve(recordedControlRoot)))
  ) {
    throw new Error("Loop control root does not match the current repository.");
  }
}

async function currentHead(repoRoot) {
  const { stdout } = await git(repoRoot, ["rev-parse", "HEAD"]);
  return stdout.trim();
}

async function inspectLifecycleWorktree({ path: worktreePath, branch, branchExists }) {
  if (branchExists) {
    return inspectLoopWorktree({ path: worktreePath, branch });
  }
  const [{ stdout: actualBranch }, revision] = await Promise.all([
    git(worktreePath, ["branch", "--show-current"]),
    inspectRevision(worktreePath),
  ]);
  if (actualBranch.trim()) {
    throw new Error(
      `Loop worktree branch changed from ${branch} to ${actualBranch.trim()}.`
    );
  }
  return {
    path: worktreePath,
    branch,
    head: revision.head,
    revisionKey: revision.revisionKey,
    dirty: revision.dirty,
    statusEntries: revision.statusEntries,
  };
}

async function resolveBranchHead(repoRoot, branch) {
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

async function isAncestor(repoRoot, ancestor, descendant) {
  try {
    await git(repoRoot, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

async function removeWorktree(controlRoot, worktreePath, force) {
  try {
    await git(controlRoot, [
      "worktree",
      "remove",
      ...(force ? ["--force"] : []),
      worktreePath,
    ]);
  } catch (error) {
    if (!isUnregisteredWorktreeError(error)) throw error;
    await rm(worktreePath, { recursive: true, force: true });
  }
}

async function pruneMissingWorktrees(controlRoot) {
  await git(controlRoot, ["worktree", "prune", "--expire", "now"]);
}

async function abortMergeIfPresent(controlRoot) {
  try {
    await lstat(path.join(controlRoot, ".git", "MERGE_HEAD"));
    await git(controlRoot, ["merge", "--abort"]);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function isUnregisteredWorktreeError(error) {
  return /is not a working tree|not a working tree|not registered/i.test(
    `${error?.stderr ?? ""} ${error?.message ?? ""}`
  );
}

function formatWorktreeStatusPath(worktreePath, entry) {
  const hasStatusPrefix = entry.length >= 4 && entry[2] === " ";
  const relativePath = hasStatusPrefix ? entry.slice(3) : entry;
  const status = hasStatusPrefix ? entry.slice(0, 2) : "related path";
  return `${path.join(worktreePath, relativePath)} (${status})`;
}

async function pathExists(value) {
  try {
    await lstat(value);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function git(cwd, args) {
  return execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
