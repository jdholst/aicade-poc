import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parseCampaignManifest } from "./contracts.mjs";
import {
  parseOpenAiPricingSnapshot,
  resolvePricingModel,
} from "./pricing.mjs";

export async function loadCampaignManifest(manifestPathInput) {
  const manifestPath = path.resolve(manifestPathInput);
  const manifestDir = path.dirname(manifestPath);
  const harnessRoot = path.resolve(manifestDir, "..");
  const contents = await readFile(manifestPath, "utf8");
  const manifest = parseCampaignManifest(JSON.parse(contents));
  const fixturePaths = {};
  let pricing;

  for (const stage of ["planning", "contract", "source"]) {
    const reference = manifest.fixtures[stage];
    if (!reference) {
      continue;
    }
    const fixturePath = resolveHarnessPath(
      harnessRoot,
      manifestDir,
      reference.path
    );
    const fixtureContents = await readFile(fixturePath);
    const actualHash = createHash("sha256").update(fixtureContents).digest("hex");
    if (actualHash !== reference.sha256) {
      throw new Error(
        `${stage} fixture hash mismatch. Expected ${reference.sha256}, received ${actualHash}.`
      );
    }
    JSON.parse(fixtureContents.toString("utf8"));
    fixturePaths[stage] = fixturePath;
  }

  const probePath = resolveHarnessPath(
    harnessRoot,
    manifestDir,
    manifest.probe
  );
  await stat(probePath);

  if (manifest.pricingSnapshot) {
    const pricingPath = resolveHarnessPath(
      harnessRoot,
      manifestDir,
      manifest.pricingSnapshot.path
    );
    const pricingContents = await readFile(pricingPath);
    const pricingHash = createHash("sha256")
      .update(pricingContents)
      .digest("hex");
    if (pricingHash !== manifest.pricingSnapshot.sha256) {
      throw new Error(
        `Pricing snapshot hash mismatch. Expected ${manifest.pricingSnapshot.sha256}, received ${pricingHash}.`
      );
    }
    const snapshot = parseOpenAiPricingSnapshot(
      JSON.parse(pricingContents.toString("utf8"))
    );
    resolvePricingModel(snapshot, manifest.model);
    pricing = { snapshot, pricingPath, pricingHash };
  }

  return {
    manifest,
    manifestPath,
    manifestHash: createHash("sha256").update(contents).digest("hex"),
    fixturePaths,
    probePath,
    ...(pricing ? { pricing } : {}),
  };
}

export function validateManifestEnvironment(manifest, env = process.env) {
  if (
    manifest.credential.source !== "server_env" &&
    !env[manifest.credential.envName]
  ) {
    throw new Error(
      `Campaign credential environment variable ${manifest.credential.envName} is not configured.`
    );
  }
  return true;
}

function resolveHarnessPath(harnessRoot, manifestDir, relativePath) {
  const resolved = path.resolve(manifestDir, relativePath);
  const rootPrefix = `${harnessRoot}${path.sep}`;
  if (resolved !== harnessRoot && !resolved.startsWith(rootPrefix)) {
    throw new Error(`Campaign resource escapes the harness root: ${relativePath}`);
  }
  return resolved;
}
