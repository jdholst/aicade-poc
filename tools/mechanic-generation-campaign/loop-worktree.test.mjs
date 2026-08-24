import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  inspectLoopWorktree,
  prepareLoopWorktree,
  resetAndInstallWorktreeDependencies,
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
  await writeFile(
    path.join(controlRoot, ".gitignore"),
    ".qa\nnode_modules\n.env*\n!.env.example\n",
    "utf8"
  );
  await writeFile(path.join(controlRoot, "README.md"), "fixture\n", "utf8");
  await writeFile(path.join(controlRoot, ".env.example"), "EXAMPLE=true\n", "utf8");
  await mkdir(path.join(controlRoot, "node_modules", "fixture-package"), {
    recursive: true,
  });
  await writeFile(
    path.join(controlRoot, "node_modules", "fixture-package", "package.json"),
    '{"name":"fixture-package"}\n',
    "utf8"
  );
  await git(controlRoot, ["add", ".gitignore", "README.md", ".env.example"]);
  await git(controlRoot, ["commit", "-m", "fixture"]);
  const { stdout } = await git(controlRoot, ["rev-parse", "HEAD"]);
  return { controlRoot, head: stdout.trim() };
}

describe("campaign loop worktree", () => {
  it("creates an isolated codex branch without changing the control branch", async () => {
    const { controlRoot, head } = await createRepository();
    const preparedWorktrees = [];
    const result = await prepareLoopWorktree({
      controlRoot,
      loopId: "ticket-17-loop",
      baseHead: head,
      worktreeRoot: path.join(controlRoot, ".qa", "campaign-worktrees"),
      prepareDependencies: async (worktreePath) => {
        preparedWorktrees.push(worktreePath);
      },
    });

    expect(result.branch).toBe("codex/campaign-loop-ticket-17-loop");
    expect(preparedWorktrees).toEqual([result.path]);
    expect((await git(controlRoot, ["branch", "--show-current"])).stdout.trim()).toBe("master");
    expect(await inspectLoopWorktree(result)).toMatchObject({
      branch: result.branch,
      head,
      dirty: false,
    });
    await expect(
      readFile(
        path.join(result.path, "node_modules", "fixture-package", "package.json"),
        "utf8"
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("copies every root env file before preparing worktree dependencies", async () => {
    const { controlRoot, head } = await createRepository();
    const envFiles = {
      ".env": "BASE_ENV=available\n",
      ".env.local": "LOCAL_ENV=available\n",
      ".env.test": "TEST_ENV=available\n",
      ".env.development.local": "DEVELOPMENT_ENV=available\n",
      ".env.example": "EXAMPLE=true\n",
    };
    await Promise.all(
      Object.entries(envFiles).map(([name, contents]) =>
        writeFile(path.join(controlRoot, name), contents, "utf8")
      )
    );

    const result = await prepareLoopWorktree({
      controlRoot,
      loopId: "ticket-17-env-loop",
      baseHead: head,
      worktreeRoot: path.join(controlRoot, ".qa", "campaign-worktrees"),
      prepareDependencies: async (worktreePath) => {
        await Promise.all(
          Object.entries(envFiles).map(async ([name, contents]) => {
            await expect(readFile(path.join(worktreePath, name), "utf8")).resolves.toBe(
              contents
            );
          })
        );
      },
    });

    expect(await inspectLoopWorktree(result)).toMatchObject({ dirty: false });
  });

  it("removes stale dependency and build state before installing", async () => {
    const worktreePath = await mkdtemp(path.join(tmpdir(), "campaign-loop-install-"));
    temporaryDirectories.push(worktreePath);
    const staleDependency = path.join(worktreePath, "node_modules", "stale.txt");
    const staleBuild = path.join(worktreePath, ".next", "stale.txt");
    await mkdir(path.dirname(staleDependency), { recursive: true });
    await mkdir(path.dirname(staleBuild), { recursive: true });
    await writeFile(staleDependency, "stale dependency\n", "utf8");
    await writeFile(staleBuild, "stale build\n", "utf8");

    let installed = false;
    await resetAndInstallWorktreeDependencies(worktreePath, {
      runInstall: async (installRoot) => {
        expect(installRoot).toBe(worktreePath);
        await expect(readFile(staleDependency, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
        await expect(readFile(staleBuild, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
        installed = true;
        await mkdir(path.join(installRoot, "node_modules"), { recursive: true });
      },
    });

    expect(installed).toBe(true);
    expect((await lstat(path.join(worktreePath, "node_modules"))).isDirectory()).toBe(true);
  });

  it("runs npm install from the prepared worktree", async () => {
    const worktreePath = await mkdtemp(path.join(tmpdir(), "campaign-loop-npm-install-"));
    temporaryDirectories.push(worktreePath);
    await writeFile(
      path.join(worktreePath, "package.json"),
      '{"name":"campaign-loop-install-fixture","version":"1.0.0","private":true}\n',
      "utf8"
    );

    await resetAndInstallWorktreeDependencies(worktreePath);

    await expect(readFile(path.join(worktreePath, "package-lock.json"), "utf8")).resolves.toContain(
      '"campaign-loop-install-fixture"'
    );
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
