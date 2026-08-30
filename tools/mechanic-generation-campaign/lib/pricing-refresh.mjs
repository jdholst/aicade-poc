import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseOpenAiPricingSnapshot } from "./pricing.mjs";

const PRICING_URL = "https://developers.openai.com/api/docs/pricing";
const LUNA_URL =
  "https://developers.openai.com/api/docs/models/gpt-5.6-luna";

export async function refreshOpenAiPricing({
  harnessRoot,
  mode,
  effectiveAt,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  if (!['check', 'write'].includes(mode)) {
    throw new Error("Pricing refresh mode must be check or write.");
  }
  if (mode === "write" && !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(effectiveAt ?? "")) {
    throw new Error("Pricing refresh --write requires --effective-at YYYY-MM-DD.");
  }
  const [pricingPage, lunaPage] = await Promise.all([
    fetchOfficialPage(fetchImpl, PRICING_URL),
    fetchOfficialPage(fetchImpl, LUNA_URL),
  ]);
  const facts = parseLunaPricingPage(lunaPage.text);
  const date = effectiveAt ?? (await latestSnapshotDate(harnessRoot));
  if (!date) {
    throw new Error("Pricing --check requires at least one local snapshot.");
  }
  const snapshot = parseOpenAiPricingSnapshot({
    schemaVersion: "openai-pricing-snapshot/v1",
    id: `openai-${date}`,
    effectiveAt: date,
    retrievedAt: now().toISOString(),
    sources: [
      { url: PRICING_URL, sha256: pricingPage.sha256 },
      { url: LUNA_URL, sha256: lunaPage.sha256 },
    ],
    models: [facts],
  });
  const pricingDirectory = path.join(harnessRoot, "pricing");
  const snapshotPath = path.join(pricingDirectory, `${snapshot.id}.json`);

  if (mode === "write") {
    await mkdir(pricingDirectory, { recursive: true });
    try {
      await readFile(snapshotPath);
      throw new Error(`Pricing snapshot ${snapshot.id} already exists.`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    return { status: "written", snapshot, snapshotPath };
  }

  const existing = parseOpenAiPricingSnapshot(
    JSON.parse(await readFile(snapshotPath, "utf8"))
  );
  const factsDrift = JSON.stringify(existing.models) !== JSON.stringify(snapshot.models);
  const sourceDrift = existing.sources.some(
    (source, index) => source.sha256 !== snapshot.sources[index]?.sha256
  );
  return {
    status: factsDrift || sourceDrift ? "drift" : "current",
    snapshot: existing,
    live: snapshot,
    snapshotPath,
    factsDrift,
    sourceDrift,
  };
}

export function parseLunaPricingPage(html) {
  const input = requiredMoneyAfterLabel(html, "Input");
  const cachedInput = requiredMoneyAfterLabel(html, "Cached input");
  const output = requiredMoneyAfterLabel(html, "Output");
  const contextWindowTokens = requiredTokenCount(html, "1,050,000");
  const maxOutputTokens = requiredTokenCount(html, "128,000");
  if (!/&gt;272K input tokens/.test(html) || !/2x input and 1\.5x output/.test(html)) {
    throw new Error("Could not verify GPT-5.6 Luna long-context pricing rules.");
  }
  if (!/Cache writes are billed at 1\.25x/.test(html)) {
    throw new Error("Could not verify GPT-5.6 Luna cache-write pricing.");
  }
  return {
    id: "gpt-5.6-luna",
    aliases: [],
    contextWindowTokens,
    maxOutputTokens,
    serviceTiers: {
      default: {
        inputNanoUsdPerMillionTokens: dollarsPerMillionToNanoUsd(input),
        cachedInputNanoUsdPerMillionTokens:
          dollarsPerMillionToNanoUsd(cachedInput),
        cacheWriteInputNanoUsdPerMillionTokens:
          dollarsPerMillionToNanoUsd(input * 1.25),
        outputNanoUsdPerMillionTokens: dollarsPerMillionToNanoUsd(output),
      },
    },
    longContext: {
      thresholdInputTokens: 272_000,
      inputMultiplier: { numerator: 2, denominator: 1 },
      outputMultiplier: { numerator: 3, denominator: 2 },
    },
  };
}

async function fetchOfficialPage(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: { Accept: "text/html" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Official OpenAI pricing fetch failed with ${response.status}: ${url}`);
  }
  const text = await response.text();
  return {
    text,
    sha256: createHash("sha256").update(text).digest("hex"),
  };
}

async function latestSnapshotDate(harnessRoot) {
  const directory = path.join(harnessRoot, "pricing");
  const entries = await readdir(directory).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  return entries
    .map((entry) => entry.match(/^openai-([0-9]{4}-[0-9]{2}-[0-9]{2})\.json$/)?.[1])
    .filter(Boolean)
    .sort()
    .at(-1);
}

function requiredMoneyAfterLabel(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`>${escaped}<\\/div><div[^>]*>\\$([0-9]+(?:\\.[0-9]+)?)<`)
  );
  if (!match) throw new Error(`Could not parse ${label} pricing from the official model page.`);
  return Number(match[1]);
}

function requiredTokenCount(html, formatted) {
  if (!html.includes(formatted)) {
    throw new Error(`Could not parse token limit ${formatted} from the official model page.`);
  }
  return Number(formatted.replaceAll(",", ""));
}

function dollarsPerMillionToNanoUsd(value) {
  const result = value * 1_000_000_000;
  if (!Number.isSafeInteger(result)) {
    throw new Error("Pricing rate cannot be represented as integer nano-USD.");
  }
  return result;
}
