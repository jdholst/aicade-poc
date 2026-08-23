import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { cp, lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { inspectRevision } from "./revision.mjs";

const execFileAsync = promisify(execFile);

export async function prepareLoopWorktree({
  controlRoot,
  loopId,
  baseHead,
  worktreeRoot,
}) {
  const revision = await inspectRevision(controlRoot);
  if (revision.dirty || revision.head !== baseHead) {
    throw new Error(
      "Campaign loops require a clean control checkout at the authorized base revision."
    );
  }
  const safeLoopId = safeSegment(loopId);
  const branch = `codex/campaign-loop-${safeLoopId}`;
  const resolvedRoot = path.resolve(worktreeRoot);
  const worktreePath = path.join(resolvedRoot, safeLoopId);
  if (await pathExists(worktreePath)) {
    throw new Error(`Loop worktree already exists at ${worktreePath}.`);
  }
  if (await branchExists(controlRoot, branch)) {
    throw new Error(`Loop branch ${branch} already exists.`);
  }

  await mkdir(resolvedRoot, { recursive: true });
  await git(controlRoot, [
    "worktree",
    "add",
    "-b",
    branch,
    worktreePath,
    baseHead,
  ]);
  await cloneDependencies(controlRoot, worktreePath);
  return { path: worktreePath, branch };
}

export async function inspectLoopWorktree({ path: worktreePath, branch }) {
  const [{ stdout: actualBranch }, revision] = await Promise.all([
    git(worktreePath, ["branch", "--show-current"]),
    inspectRevision(worktreePath),
  ]);
  if (actualBranch.trim() !== branch) {
    throw new Error(
      `Loop worktree branch changed from ${branch} to ${actualBranch.trim() || "detached HEAD"}.`
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

export async function changedFilesBetween(worktreePath, beforeHead, afterHead) {
  const { stdout } = await git(worktreePath, [
    "diff",
    "--name-only",
    "--diff-filter=ACMRTUXB",
    `${beforeHead}..${afterHead}`,
  ]);
  return stdout.split("\n").filter(Boolean).sort();
}

async function cloneDependencies(controlRoot, worktreePath) {
  const source = path.join(controlRoot, "node_modules");
  if (!(await pathExists(source))) return;
  const destination = path.join(worktreePath, "node_modules");
  if (await pathExists(destination)) return;
  await cp(source, destination, {
    recursive: true,
    mode: constants.COPYFILE_FICLONE,
  });
}

async function branchExists(controlRoot, branch) {
  try {
    await git(controlRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
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

function safeSegment(value) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Unsafe loop ID ${value}.`);
  }
  return value;
}

function git(cwd, args) {
  return execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}
