import { appendFile, mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  CAMPAIGN_LOOP_HISTORY_SCHEMA_VERSION,
  parseCampaignLoopFix,
  parseCampaignLoopRun,
} from "./loop-contracts.mjs";
import { redactSensitive } from "./redaction.mjs";
import { writeJsonAtomic } from "./campaign-store.mjs";

export function createCampaignLoopStore(repoRoot) {
  const artifactRoot = path.join(
    repoRoot,
    ".qa",
    "mechanic-generation-campaign",
    "loops"
  );
  const dataRoot = path.join(
    repoRoot,
    "tools",
    "mechanic-generation-campaign",
    "data"
  );

  return {
    artifactRoot,
    dataRoot,
    async initialize() {
      await Promise.all([
        mkdir(artifactRoot, { recursive: true }),
        mkdir(dataRoot, { recursive: true }),
      ]);
    },
    loopDirectory(loopId) {
      return safeChild(artifactRoot, loopId);
    },
    worktreeRoot() {
      return path.join(
        path.dirname(repoRoot),
        ".qa",
        path.basename(repoRoot),
        "mechanic-generation-campaign-worktrees"
      );
    },
    async writeRun(runInput) {
      const run = parseCampaignLoopRun(runInput);
      const directory = safeChild(artifactRoot, run.id);
      await mkdir(directory, { recursive: true });
      await writeJsonAtomic(path.join(directory, "loop-run.json"), run);
      return run;
    },
    async readRun(loopId) {
      return parseCampaignLoopRun(
        JSON.parse(
          await readFile(
            path.join(safeChild(artifactRoot, loopId), "loop-run.json"),
            "utf8"
          )
        )
      );
    },
    async listRuns() {
      const entries = await readDirectoryOrEmpty(artifactRoot);
      const runs = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          runs.push(await this.readRun(entry.name));
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      return runs.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      );
    },
    async writeFix(fixInput) {
      const fix = parseCampaignLoopFix(fixInput);
      const directory = path.join(
        safeChild(artifactRoot, fix.loopId),
        "fixes"
      );
      await mkdir(directory, { recursive: true });
      await writeJsonAtomic(
        path.join(directory, `${safeSegment(fix.id)}.json`),
        redactSensitive(fix)
      );
      return fix;
    },
    async readFixes(loopId) {
      const directory = path.join(safeChild(artifactRoot, loopId), "fixes");
      const entries = await readDirectoryOrEmpty(directory);
      const fixes = [];
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        fixes.push(
          parseCampaignLoopFix(
            JSON.parse(await readFile(path.join(directory, entry.name), "utf8"))
          )
        );
      }
      return fixes.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },
    async publish(loopId) {
      const run = await this.readRun(loopId);
      const fixes = await this.readFixes(loopId);
      const historyPath = path.join(dataRoot, "campaign-loop-history.jsonl");
      const existing = await readTextOrEmpty(historyPath);
      if (
        existing
          .split("\n")
          .some((line) => line.includes(`\"id\":\"${run.id}\"`))
      ) {
        throw new Error(`Campaign loop ${run.id} is already published.`);
      }
      const summary = redactSensitive({
        schemaVersion: CAMPAIGN_LOOP_HISTORY_SCHEMA_VERSION,
        id: run.id,
        definitionHash: run.definitionHash,
        authorizationHash: run.authorizationHash,
        manifestId: run.manifestId,
        manifestHash: run.manifestHash,
        model: run.model,
        status: run.status,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        baseRevision: run.baseRevision,
        currentRevision: run.currentRevision,
        usage: run.usage,
        limits: run.limits,
        branch: run.worktree.branch,
        steps: run.steps,
        campaignLinks: run.campaignLinks,
        fixes: fixes.map((fix) => ({
          id: fix.id,
          triggerCampaignRunId: fix.triggerCampaignRunId,
          triggerClassification: fix.triggerClassification,
          diagnosis: fix.diagnosis,
          kind: fix.kind,
          temporaryFixIds: fix.temporaryFixIds,
          changedFiles: fix.changedFiles,
          verification: fix.verification,
          beforeRevision: fix.beforeRevision,
          afterRevision: fix.afterRevision,
          commit: fix.commit,
          createdAt: fix.createdAt,
        })),
        result: run.result,
        invalidReason: run.invalidReason,
        blockedReason: run.blockedReason,
        exhaustionReason: run.exhaustionReason,
      });
      await appendFile(historyPath, `${JSON.stringify(summary)}\n`, "utf8");
      return summary;
    },
  };
}

async function readDirectoryOrEmpty(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function readTextOrEmpty(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function safeChild(parent, child) {
  const segment = safeSegment(child);
  const resolved = path.resolve(parent, segment);
  if (!resolved.startsWith(`${path.resolve(parent)}${path.sep}`)) {
    throw new Error(`Loop path escapes its data root: ${child}`);
  }
  return resolved;
}

function safeSegment(value) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Unsafe loop path segment "${value}".`);
  }
  return value;
}
