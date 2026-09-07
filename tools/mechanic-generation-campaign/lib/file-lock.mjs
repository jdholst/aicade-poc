import { mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";

export async function withFileLock(
  lockPath,
  operation,
  { timeoutMs = 10_000, retryMs = 10 } = {}
) {
  const release = await acquireFileLock(lockPath, { timeoutMs, retryMs });
  try {
    return await operation();
  } finally {
    await release();
  }
}

export async function acquireFileLock(
  lockPath,
  { timeoutMs = 10_000, retryMs = 10 } = {}
) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + timeoutMs;
  let handle;
  while (!handle) {
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (!(await lockOwnerIsAlive(lockPath))) {
        await unlink(lockPath).catch((unlinkError) => {
          if (unlinkError?.code !== "ENOENT") throw unlinkError;
        });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for state lock ${lockPath}.`);
      }
      await delay(retryMs);
    }
  }
  await handle.writeFile(
    JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })
  );
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await handle.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  };
}

async function lockOwnerIsAlive(lockPath) {
  try {
    const { pid } = JSON.parse(await readFile(lockPath, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) return true;
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
