import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  parseCampaignAttempt,
  parseCampaignManualQa,
  parseCampaignRun,
} from "./contracts.mjs";
import { redactSensitive } from "./redaction.mjs";

export function createCampaignStore(repoRoot) {
  const artifactRoot = path.join(repoRoot, ".qa", "mechanic-generation-campaign");
  const dataRoot = path.join(repoRoot, "tools", "mechanic-generation-campaign", "data");

  return {
    artifactRoot,
    dataRoot,
    async initialize() {
      await Promise.all([
        mkdir(artifactRoot, { recursive: true }),
        mkdir(dataRoot, { recursive: true }),
      ]);
    },
    campaignDirectory(campaignRunId) {
      return safeChild(artifactRoot, campaignRunId);
    },
    attemptDirectory(campaignRunId, attemptId) {
      return safeChild(safeChild(artifactRoot, campaignRunId), attemptId);
    },
    async writeRun(runInput) {
      const run = parseCampaignRun(runInput);
      const directory = safeChild(artifactRoot, run.id);
      await mkdir(directory, { recursive: true });
      await writeJsonAtomic(path.join(directory, "campaign-run.json"), run);
      return run;
    },
    async readRun(campaignRunId) {
      return parseCampaignRun(
        JSON.parse(
          await readFile(
            path.join(safeChild(artifactRoot, campaignRunId), "campaign-run.json"),
            "utf8"
          )
        )
      );
    },
    async writeAttempt(attemptInput, evidence = {}) {
      const attempt = parseCampaignAttempt(attemptInput);
      const directory = safeChild(
        safeChild(artifactRoot, attempt.campaignRunId),
        attempt.id
      );
      await mkdir(directory, { recursive: true });
      await Promise.all([
        writeJsonAtomic(path.join(directory, "attempt.json"), attempt),
        ...Object.entries(evidence).map(([fileName, value]) =>
          writeJsonAtomic(
            path.join(directory, safeEvidenceFileName(fileName)),
            redactSensitive(value)
          )
        ),
      ]);
      return attempt;
    },
    async readAttempts(campaignRunId) {
      const directory = safeChild(artifactRoot, campaignRunId);
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (error?.code === "ENOENT") {
          return [];
        }
        throw error;
      }
      const attempts = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        try {
          attempts.push(
            parseCampaignAttempt(
              JSON.parse(
                await readFile(
                  path.join(directory, entry.name, "attempt.json"),
                  "utf8"
                )
              )
            )
          );
        } catch (error) {
          if (error?.code !== "ENOENT") {
            throw error;
          }
        }
      }
      return attempts.sort((left, right) => left.sequence - right.sequence);
    },
    async readAttempt(campaignRunId, attemptId) {
      return parseCampaignAttempt(
        JSON.parse(
          await readFile(
            path.join(
              safeChild(safeChild(artifactRoot, campaignRunId), attemptId),
              "attempt.json"
            ),
            "utf8"
          )
        )
      );
    },
    async writeManualQa(manualQaInput) {
      const manualQa = parseCampaignManualQa(manualQaInput);
      const directory = safeChild(
        safeChild(artifactRoot, manualQa.campaignRunId),
        manualQa.attemptId
      );
      await mkdir(directory, { recursive: true });
      await writeJsonAtomic(path.join(directory, "manual-qa.json"), manualQa);
      return manualQa;
    },
    async readManualQa(campaignRunId, attemptId) {
      return parseCampaignManualQa(
        JSON.parse(
          await readFile(
            path.join(
              safeChild(safeChild(artifactRoot, campaignRunId), attemptId),
              "manual-qa.json"
            ),
            "utf8"
          )
        )
      );
    },
    async listRuns() {
      let entries;
      try {
        entries = await readdir(artifactRoot, { withFileTypes: true });
      } catch (error) {
        if (error?.code === "ENOENT") {
          return [];
        }
        throw error;
      }
      const runs = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        try {
          runs.push(await this.readRun(entry.name));
        } catch (error) {
          if (error?.code !== "ENOENT") {
            throw error;
          }
        }
      }
      return runs.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    async publish(campaignRunId) {
      const run = await this.readRun(campaignRunId);
      const attempts = await this.readAttempts(campaignRunId);
      const historyPath = path.join(dataRoot, "campaign-history.jsonl");
      let existing = "";
      try {
        existing = await readFile(historyPath, "utf8");
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }
      if (existing.split("\n").some((line) => line.includes(`\"id\":\"${run.id}\"`))) {
        throw new Error(`Campaign ${run.id} is already published.`);
      }
      const summary = redactSensitive({
        schemaVersion: "campaign-history/v1",
        id: run.id,
        manifestId: run.manifestId,
        manifestPath: run.manifestPath,
        manifestHash: run.manifestHash,
        cohort: run.cohort,
        status: run.status,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        model: run.model,
        providerModes: run.providerModes,
        revision: run.revision,
        knowledgePolicy: run.knowledgePolicy,
        pricing: run.pricing,
        cost: run.cost,
        result: run.result,
        manualQa: {
          pending: attempts.filter(({ manualQa }) => manualQa?.status === "pending").length,
          approved: attempts.filter(({ manualQa }) => manualQa?.status === "approved").length,
          denied: attempts.filter(({ manualQa }) => manualQa?.status === "denied").length,
        },
        attempts: attempts.map((attempt) => ({
          id: attempt.id,
          sequence: attempt.sequence,
          promptId: attempt.promptId,
          status: attempt.status,
          furthestStage: attempt.furthestStage,
          classification: attempt.classification,
          failure: attempt.failure,
          providerCalls: attempt.providerCalls,
          providerCallReceiptIds: attempt.providerCallReceiptIds,
          durationMs: attempt.durationMs,
          pipelinePassed: attempt.pipelinePassed,
          externalProbePassed: attempt.externalProbePassed,
          recordedOutcome: attempt.recordedOutcome,
          adjudicatedOutcome: attempt.adjudicatedOutcome,
          automatedOutcome: attempt.automatedOutcome,
          manualQa: attempt.manualQa,
          temporaryFixIds: attempt.temporaryFixIds,
          cost: attempt.cost,
          source: `.qa/mechanic-generation-campaign/${run.id}/${attempt.id}/attempt.json`,
        })),
      });
      await appendFile(historyPath, `${JSON.stringify(summary)}\n`, "utf8");
      return summary;
    },
  };
}

export async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function safeChild(parent, child) {
  if (!/^[a-zA-Z0-9._-]+$/.test(child)) {
    throw new Error(`Unsafe campaign path segment "${child}".`);
  }
  const resolved = path.resolve(parent, child);
  if (!resolved.startsWith(`${path.resolve(parent)}${path.sep}`)) {
    throw new Error(`Campaign path escapes its data root: ${child}`);
  }
  return resolved;
}

function safeEvidenceFileName(fileName) {
  if (!/^[a-z0-9-]+\.json$/.test(fileName)) {
    throw new Error(`Unsafe evidence file name "${fileName}".`);
  }
  return fileName;
}
