import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  importLegacyAttemptReports,
  parseTemporaryFixLedger,
} from "./legacy-importer.mjs";

const PIPELINE_STAGES = [
  "submission",
  "planning",
  "intent_validation",
  "routing",
  "runtime_foundation",
  "contract_generation",
  "contract_validation",
  "source_generation",
  "source_validation",
  "deterministic_evaluation",
  "deterministic_replay",
  "assembly",
  "handoff",
  "runtime_activation",
  "first_playable",
  "persistence",
  "editor_mount",
  "runtime_health",
  "cleanup",
  "external_mechanic_probe",
];

export async function buildDashboardSnapshot(repoRoot, store) {
  const [runs, legacyAttempts, temporaryFixes, publishedHistory] = await Promise.all([
    store.listRuns(),
    importLegacyAttemptReports(repoRoot),
    parseTemporaryFixLedger(repoRoot),
    readJsonLines(path.join(store.dataRoot ?? "", "campaign-history.jsonl")),
  ]);
  const campaigns = await Promise.all(
    runs.map(async (run) => ({
      ...run,
      attempts: await store.readAttempts(run.id),
    }))
  );
  const allAttempts = campaigns.flatMap((campaign) => campaign.attempts);

  return {
    schemaVersion: "campaign-dashboard/v1",
    generatedAt: new Date().toISOString(),
    campaigns,
    publishedHistory,
    legacyAttempts,
    temporaryFixes,
    stageSurvival: createStageSurvival(allAttempts),
    failureClasses: countBy(
      allAttempts.filter(({ status }) => status !== "success"),
      ({ classification }) => classification ?? "unknown"
    ),
    promptVariation: createPromptVariation(campaigns),
    mechanics: createMechanicProof(campaigns),
  };
}

export function resolveArtifactPath(artifactRoot, relativePathInput) {
  let relativePath = relativePathInput;
  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const decoded = decodeURIComponent(relativePath);
      if (decoded === relativePath) break;
      relativePath = decoded;
    }
  } catch {
    throw new Error("Artifact path is not valid URL encoding.");
  }
  const root = path.resolve(artifactRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Artifact path escapes the campaign artifact root.");
  }
  return resolved;
}

export async function startDashboardServer({ repoRoot, store, port = 4310 }) {
  const dashboardRoot = path.resolve(import.meta.dirname, "../dashboard");
  const documentationRoot = path.resolve(import.meta.dirname, "../docs");
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      if (url.pathname === "/api/snapshot") {
        return sendJson(response, 200, await buildDashboardSnapshot(repoRoot, store));
      }
      if (url.pathname.startsWith("/artifacts/")) {
        const filePath = resolveArtifactPath(
          store.artifactRoot,
          url.pathname.slice("/artifacts/".length)
        );
        return await sendFile(response, filePath);
      }
      if (url.pathname.startsWith("/documentation/")) {
        const filePath = resolveStaticPath(
          documentationRoot,
          url.pathname.slice("/documentation/".length)
        );
        return await sendFile(response, filePath);
      }

      const assetPath = url.pathname === "/"
        ? path.join(dashboardRoot, "index.html")
        : resolveStaticPath(dashboardRoot, url.pathname.slice(1));
      return await sendFile(response, assetPath);
    } catch (error) {
      return sendJson(response, 404, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    ),
  };
}

function createStageSurvival(attempts) {
  return Object.fromEntries(
    PIPELINE_STAGES.map((stage, stageIndex) => [
      stage,
      attempts.filter(
        ({ furthestStage }) => PIPELINE_STAGES.indexOf(furthestStage) >= stageIndex
      ).length,
    ])
  );
}

function createPromptVariation(campaigns) {
  return campaigns
    .filter(({ cohort }) => cohort === "variation")
    .map((campaign) => ({
      campaignRunId: campaign.id,
      manifestId: campaign.manifestId,
      revisionKey: campaign.revision.revisionKey,
      prompts: Object.entries(
        campaign.attempts.reduce((groups, attempt) => {
          groups[attempt.promptId] ??= { submissions: 0, successes: 0 };
          groups[attempt.promptId].submissions += 1;
          groups[attempt.promptId].successes += attempt.status === "success" ? 1 : 0;
          return groups;
        }, {})
      ).map(([promptId, counts]) => ({ promptId, ...counts })),
    }));
}

function createMechanicProof(campaigns) {
  const campaignsByMechanic = new Map();
  for (const campaign of campaigns) {
    const mechanicCampaigns = campaignsByMechanic.get(campaign.manifestId) ?? [];
    mechanicCampaigns.push(campaign);
    campaignsByMechanic.set(campaign.manifestId, mechanicCampaigns);
  }

  const isProofCohort = ({ cohort }) =>
    ["discovery", "repeatability", "variation"].includes(cohort);
  const configurationKey = (campaign) => JSON.stringify([
    campaign.revision.revisionKey,
    campaign.model,
    campaign.providerModes.planning,
    campaign.providerModes.contract,
    campaign.providerModes.source,
  ]);
  const newestFirst = (left, right) =>
    (right.createdAt ?? "").localeCompare(left.createdAt ?? "") ||
    right.id.localeCompare(left.id);

  return [...campaignsByMechanic.entries()].map(([manifestId, mechanicCampaigns]) => {
    const proofCampaigns = mechanicCampaigns.filter(isProofCohort);
    const selectedCampaign = [...(
      proofCampaigns.length > 0 ? proofCampaigns : mechanicCampaigns
    )].sort(newestFirst)[0];
    const selectedConfigurationKey = configurationKey(selectedCampaign);
    const selectedProofCampaigns = proofCampaigns
      .filter((campaign) => configurationKey(campaign) === selectedConfigurationKey)
      .sort(newestFirst);
    const group = {
      manifestId,
      revisionKey: selectedCampaign.revision.revisionKey,
      model: selectedCampaign.model,
      providerModes: selectedCampaign.providerModes,
      discovery: "missing",
      repeatability: "missing",
      variation: "missing",
      proven: false,
    };

    for (const campaign of selectedProofCampaigns) {
      if (group[campaign.cohort] !== "missing") continue;
      group[campaign.cohort] = campaign.status;
    }
    group.proven = ["discovery", "repeatability", "variation"].every(
      (cohort) => group[cohort] === "achieved"
    );
    return group;
  });
}

function countBy(values, getKey) {
  return values.reduce((counts, value) => {
    const key = getKey(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

async function readJsonLines(filePath) {
  if (!filePath) return [];
  try {
    return (await readFile(filePath, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function resolveStaticPath(root, relativePath) {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Static asset path escapes the dashboard root.");
  }
  return resolved;
}

async function sendFile(response, filePath) {
  const contentType = dashboardContentType(filePath);
  if (!contentType) {
    throw new Error(`Unsupported dashboard file type ${path.extname(filePath).toLowerCase()}.`);
  }
  const contents = await readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(contents);
}

export function dashboardContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".log": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
  };
  return contentTypes[extension] ?? null;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}
