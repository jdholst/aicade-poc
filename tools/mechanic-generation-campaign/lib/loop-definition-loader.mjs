import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseCampaignLoopManifest } from "./loop-contracts.mjs";
import { loadCampaignManifest } from "./manifest-loader.mjs";
import { maximumCampaignSubmissions, resolveProviderModes } from "./runner-policy.mjs";

export async function loadCampaignLoopDefinition({
  definition,
  definitionPath,
  repoRoot,
}) {
  const resolvedDefinitionPath = path.resolve(definitionPath);
  const resolvedRepoRoot = path.resolve(repoRoot);
  if (!resolvedDefinitionPath.startsWith(`${resolvedRepoRoot}${path.sep}`)) {
    throw new Error("Campaign loop definitions must live inside the repository root.");
  }
  const parsedDefinition = parseCampaignLoopManifest(
    definition ?? JSON.parse(await readFile(resolvedDefinitionPath, "utf8"))
  );
  const canonicalDefinition = canonicalJson(parsedDefinition);
  const definitionHash = createHash("sha256")
    .update(canonicalDefinition)
    .digest("hex");
  const manifestPath = resolveRepositoryPath(
    repoRoot,
    parsedDefinition.manifest.path
  );
  const campaign = await loadCampaignManifest(manifestPath);

  if (campaign.manifestHash !== parsedDefinition.manifest.sha256) {
    throw new Error(
      `Campaign manifest hash mismatch. Expected ${parsedDefinition.manifest.sha256}, received ${campaign.manifestHash}.`
    );
  }
  const probeHash = createHash("sha256")
    .update(await readFile(campaign.probePath))
    .digest("hex");
  if (probeHash !== parsedDefinition.manifest.probeSha256) {
    throw new Error(
      `External probe hash mismatch. Expected ${parsedDefinition.manifest.probeSha256}, received ${probeHash}.`
    );
  }
  if (campaign.manifest.model !== parsedDefinition.model) {
    throw new Error(
      `Loop model ${parsedDefinition.model} does not match campaign manifest model ${campaign.manifest.model}.`
    );
  }
  if (
    parsedDefinition.limits.maxActualProviderCostNanoUsd !== undefined &&
    !campaign.pricing
  ) {
    throw new Error(
      "A loop cost ceiling requires a pricing snapshot in its campaign manifest."
    );
  }

  for (const step of parsedDefinition.sequence) {
    resolveProviderModes(
      step.cohort,
      step.providerModes,
      campaign.manifest.fixtures
    );
  }
  for (const profile of parsedDefinition.isolationProfiles) {
    resolveProviderModes(
      "isolation",
      profile.providerModes,
      campaign.manifest.fixtures
    );
  }

  const minimums = calculateLoopMinimums(
    parsedDefinition,
    campaign.manifest.prompts,
    campaign.manifest.cohorts
  );
  validateMinimumCapacity(parsedDefinition, minimums);

  return {
    definition: parsedDefinition,
    definitionPath: resolvedDefinitionPath,
    definitionHash,
    authorizationHash: createHash("sha256")
      .update(`campaign-loop-authorization/v1:${definitionHash}`)
      .digest("hex"),
    campaign,
    probeHash,
    minimums,
  };
}

export function calculateLoopMinimums(definition, prompts, cohorts = {}) {
  const actualProviderCalls = { planning: 0, contract: 0, source: 0 };
  let submissions = 0;
  for (const step of definition.sequence) {
    const count = maximumCampaignSubmissions(
      step.cohort,
      prompts,
      cohorts[step.cohort] ?? {}
    );
    submissions += count;
    for (const stage of ["planning", "contract", "source"]) {
      if (step.providerModes[stage] === "actual") {
        actualProviderCalls[stage] += count;
      }
    }
  }
  return {
    campaignRuns: definition.sequence.length,
    submissions,
    actualProviderCalls,
  };
}

function validateMinimumCapacity(definition, minimums) {
  if (definition.limits.maxCampaignRuns < minimums.campaignRuns) {
    throw new Error(
      `Loop campaign ceiling ${definition.limits.maxCampaignRuns} cannot run its ${minimums.campaignRuns} required steps once.`
    );
  }
  if (definition.limits.maxSubmissions < minimums.submissions) {
    throw new Error(
      `Loop submission ceiling ${definition.limits.maxSubmissions} is below the required minimum ${minimums.submissions}.`
    );
  }
  for (const stage of ["planning", "contract", "source"]) {
    if (
      definition.limits.actualProviderCalls[stage] <
      minimums.actualProviderCalls[stage]
    ) {
      throw new Error(
        `Loop ${stage} provider-call ceiling ${definition.limits.actualProviderCalls[stage]} is below the required minimum ${minimums.actualProviderCalls[stage]}.`
      );
    }
  }
}

function resolveRepositoryPath(repoRoot, relativePath) {
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Loop campaign manifest escapes the repository root: ${relativePath}`);
  }
  return resolved;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
