import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  inspectLoopWorktree,
  prepareLoopWorktree,
} from "./lib/loop-worktree.mjs";

const execFileAsync = promisify(execFile);
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function createRepository() {
  const controlRoot = await mkdtemp(path.join(tmpdir(), "campaign-loop-git-"));
  temporaryDirectories.push(controlRoot);
  await git(controlRoot, ["init", "-b", "master"]);
  await git(controlRoot, ["config", "user.email", "campaign@example.test"]);
  await git(controlRoot, ["config", "user.name", "Campaign Test"]);
  await writeFile(path.join(controlRoot, ".gitignore"), ".qa\nnode_modules\n", "utf8");
  await writeFile(path.join(controlRoot, "README.md"), "fixture\n", "utf8");
  await mkdir(path.join(controlRoot, "node_modules", "fixture-package"), {
    recursive: true,
  });
  await writeFile(
    path.join(controlRoot, "node_modules", "fixture-package", "package.json"),
    '{"name":"fixture-package"}\n',
    "utf8"
  );
  await git(controlRoot, ["add", ".gitignore", "README.md"]);
  await git(controlRoot, ["commit", "-m", "fixture"]);
  const { stdout } = await git(controlRoot, ["rev-parse", "HEAD"]);
  return { controlRoot, head: stdout.trim() };
}

describe("campaign loop worktree", () => {
  it("creates an isolated codex branch without changing the control branch", async () => {
    const { controlRoot, head } = await createRepository();
    const result = await prepareLoopWorktree({
      controlRoot,
      loopId: "ticket-17-loop",
      baseHead: head,
      worktreeRoot: path.join(controlRoot, ".qa", "campaign-worktrees"),
    });

    expect(result.branch).toBe("codex/campaign-loop-ticket-17-loop");
    expect((await git(controlRoot, ["branch", "--show-current"])).stdout.trim()).toBe("master");
    expect(await inspectLoopWorktree(result)).toMatchObject({
      branch: result.branch,
      head,
      dirty: false,
    });
    const dependencyStats = await lstat(path.join(result.path, "node_modules"));
    expect(dependencyStats.isDirectory()).toBe(true);
    expect(dependencyStats.isSymbolicLink()).toBe(false);
    await expect(
      readFile(
        path.join(result.path, "node_modules", "fixture-package", "package.json"),
        "utf8"
      )
    ).resolves.toContain("fixture-package");
  });

  it("rejects a dirty control checkout before creating a branch", async () => {
    const { controlRoot, head } = await createRepository();
    await writeFile(path.join(controlRoot, "README.md"), "dirty\n", "utf8");

    await expect(
      prepareLoopWorktree({
        controlRoot,
        loopId: "ticket-17-loop",
        baseHead: head,
        worktreeRoot: path.join(controlRoot, ".qa", "campaign-worktrees"),
      })
    ).rejects.toThrow(/clean control checkout/i);
  });
});

function git(cwd, args) {
  return execFileAsync("git", args, { cwd, encoding: "utf8" });
}
