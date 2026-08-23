import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function createRevisionKey({ head, diff, untracked }) {
  const normalized = {
    head,
    diff,
    untracked: [...untracked].sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
  };
  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export async function inspectRevision(repoRoot) {
  const [{ stdout: head }, { stdout: diff }, { stdout: status }, { stdout: untrackedOutput }] =
    await Promise.all([
      git(repoRoot, ["rev-parse", "HEAD"]),
      git(repoRoot, ["diff", "--binary", "HEAD"]),
      git(repoRoot, ["status", "--porcelain=v1", "-z"]),
      git(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
    ]);
  const untrackedPaths = untrackedOutput.split("\0").filter(Boolean).sort();
  const untracked = await Promise.all(
    untrackedPaths.map(async (relativePath) => ({
      path: relativePath,
      sha256: createHash("sha256")
        .update(await readFile(path.join(repoRoot, relativePath)))
        .digest("hex"),
    }))
  );
  const input = {
    head: head.trim(),
    diff,
    untracked,
  };

  return {
    ...input,
    dirty: Boolean(status),
    statusEntries: status.split("\0").filter(Boolean),
    revisionKey: createRevisionKey(input),
  };
}

function git(repoRoot, args) {
  return execFileAsync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

