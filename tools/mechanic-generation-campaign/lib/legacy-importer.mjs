import { readFile } from "node:fs/promises";
import path from "node:path";

export const LEGACY_ATTEMPT_REPORT_PATHS = [
  "docs/phase-09-ticket-16-5-real-provider-attempts.md",
  "docs/phase-09-ticket-17-real-provider-attempts.md",
  "docs/phase-09-ticket-17-real-provider-attempts-round-2.md",
  "docs/phase-09-ticket-17-real-provider-attempts-round-3.md",
  "docs/phase-09-ticket-17-real-provider-attempts-round-4.md",
  "docs/phase-09-ticket-17-real-provider-attempts-round-5.md",
];

export const TEMPORARY_FIX_LEDGER_PATH =
  "docs/phase-09-ticket-16-5-temporary-fix-ledger.md";

export async function importLegacyAttemptReports(repoRoot) {
  const attempts = [];

  for (const sourcePath of LEGACY_ATTEMPT_REPORT_PATHS) {
    const markdown = await readFile(path.join(repoRoot, sourcePath), "utf8");
    const sourceAttempts = parseAttemptSections(markdown, sourcePath);
    applyAdjudications(markdown, sourcePath, sourceAttempts);
    attempts.push(...sourceAttempts);
  }

  return attempts;
}

export async function parseTemporaryFixLedger(repoRoot) {
  const markdown = await readFile(
    path.join(repoRoot, TEMPORARY_FIX_LEDGER_PATH),
    "utf8"
  );
  const fixes = [];
  const expression =
    /^### (TF-\d+) — ([^\n]+)\n([\s\S]*?)(?=^### |^## |(?![\s\S]))/gm;

  for (const match of markdown.matchAll(expression)) {
    const [, id, title, body] = match;
    const fields = parseBulletFields(body);
    const status = getField(fields, "status") ?? "unknown";
    fixes.push({
      schemaVersion: "campaign-temporary-fix/v1",
      id,
      title: title.trim(),
      state: /retired|replaced|resolved/i.test(status) ? "retired" : "active",
      status,
      currentShortcut:
        getField(fields, "current shortcut") ??
        getField(fields, "fix") ??
        getField(fields, "current behavior"),
      risk: getField(fields, "risk") ?? getField(fields, "why temporary"),
      guardrails: getField(fields, "current guardrails"),
      robustReplacement: getField(fields, "robust replacement"),
      removalCriteria: getField(fields, "removal criteria"),
      coverage: getField(fields, "current coverage"),
      motivatedBy:
        getField(fields, "motivated by") ?? getField(fields, "introduced after"),
      source: {
        path: TEMPORARY_FIX_LEDGER_PATH,
        heading: `${id} — ${title.trim()}`,
        line: lineNumberAt(markdown, match.index),
      },
    });
  }

  return fixes;
}

export function toJsonLines(records) {
  return records.map((record) => JSON.stringify(record)).join("\n") + "\n";
}

function parseAttemptSections(markdown, sourcePath) {
  const attempts = [];
  const sourceSlug = legacySourceSlug(sourcePath);
  const expression =
    /^(#{2,3}) (Attempt (\d+)\b[^\n]*)\n([\s\S]*?)(?=^#{2,3} |(?![\s\S]))/gm;

  for (const match of markdown.matchAll(expression)) {
    const [, , heading, numberText, body] = match;
    const attemptNumber = Number(numberText);
    const fields = parseBulletFields(body);
    const furthestStage = getField(fields, "furthest pipeline stage");
    const classification = getField(fields, "classification");
    const failure = getField(fields, "failure");
    const fix =
      getField(fields, "fix") ??
      getField(fields, "fix approach") ??
      getField(fields, "fix/action") ??
      getField(fields, "action");
    const fixResult =
      getField(fields, "fix result") ??
      getField(fields, "result") ??
      getField(fields, "verification baseline");
    const evidenceFieldCount = [
      furthestStage,
      classification,
      failure,
      fix,
      fixResult,
    ].filter(Boolean).length;

    const recordedOutcome =
      getField(fields, "terminal outcome") ??
      getField(fields, "result") ??
      heading.replace(/^Attempt \d+\s*[—-]?\s*/i, "").trim();
    attempts.push({
      schemaVersion: "legacy-campaign-attempt/v1",
      id: `legacy:${sourceSlug}:a${String(attemptNumber).padStart(2, "0")}`,
      attemptNumber,
      recordedOutcome,
      manualQa: isRecordedLegacySuccess(recordedOutcome)
        ? {
            status: "approved",
            provenance: "legacy_assumed",
            note: "Imported successful evidence predates the campaign harness and is treated as manually reviewed.",
          }
        : {
            status: "not_applicable",
            provenance: "legacy_import",
          },
      furthestStage,
      classification,
      failure,
      fix,
      fixResult,
      providerCalls: getField(fields, "provider calls"),
      completeness:
        evidenceFieldCount >= 5
          ? "complete"
          : evidenceFieldCount >= 2
            ? "partial"
            : "narrative_only",
      temporaryFixIds: unique(body.match(/TF-\d+/g) ?? []),
      source: {
        path: sourcePath,
        heading,
        line: lineNumberAt(markdown, match.index),
      },
    });
  }

  return attempts;
}

function isRecordedLegacySuccess(outcome) {
  return (
    !/failed|failure|not accepted|not playable/i.test(outcome) &&
    /succeeded|accepted and visibly playable|successful generated-mechanic project acceptance/i.test(
      outcome
    )
  );
}

function applyAdjudications(markdown, sourcePath, attempts) {
  const expression =
    /^## (Post-success QA correction[^\n]*)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm;

  for (const match of markdown.matchAll(expression)) {
    const priorAttempts = attempts.filter(
      (attempt) => attempt.source.line < lineNumberAt(markdown, match.index)
    );
    const attempt = priorAttempts.at(-1);
    if (!attempt) {
      continue;
    }

    const fields = parseBulletFields(match[2]);
    attempt.adjudicatedOutcome =
      getField(fields, "root cause") ?? collapseWhitespace(match[2]);
    attempt.adjudicationSource = {
      path: sourcePath,
      heading: match[1].trim(),
      line: lineNumberAt(markdown, match.index),
    };
    attempt.temporaryFixIds = unique([
      ...attempt.temporaryFixIds,
      ...(match[2].match(/TF-\d+/g) ?? []),
    ]);
  }
}

function parseBulletFields(body) {
  const fields = new Map();
  let currentKey = null;

  for (const line of body.split("\n")) {
    const bullet = line.match(/^- ([^:]+):\s*(.*)$/);
    if (bullet) {
      currentKey = normalizeFieldName(bullet[1]);
      fields.set(currentKey, bullet[2].trim());
      continue;
    }

    if (currentKey && line.trim() && !line.startsWith("- ")) {
      fields.set(
        currentKey,
        collapseWhitespace(`${fields.get(currentKey)} ${line.trim()}`)
      );
    } else if (!line.trim()) {
      currentKey = null;
    }
  }

  return fields;
}

function normalizeFieldName(value) {
  return value
    .replace(/\*\*/g, "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
}

function getField(fields, name) {
  const value = fields.get(name);
  return value || undefined;
}

function legacySourceSlug(sourcePath) {
  if (sourcePath.includes("ticket-16-5")) {
    return "p09-t16-5";
  }
  const round = sourcePath.match(/round-(\d+)/)?.[1] ?? "1";
  return `p09-t17-r${round}`;
}

function lineNumberAt(contents, index) {
  return contents.slice(0, index).split("\n").length;
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}
