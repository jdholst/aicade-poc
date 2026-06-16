import type {
  GenerationRun,
  GenerationRunAttemptReceipt,
  GenerationRunAttemptValidation,
  GenerationRunCandidateSummary,
  GenerationRunCostEstimate,
  GenerationRunFailureClass,
  GenerationRunRelationships,
  GenerationRunStatus,
} from "./generation-run-schema";
import type { GenerationRunRepository } from "./generation-run-repository";

export const GENERATION_RUN_JSON_EXPORT_SCHEMA_VERSION =
  "generation-run-export/v1" as const;

type UnknownCostEstimate = {
  quality: "unknown";
};

export type GenerationRunJsonExportCost =
  | GenerationRunCostEstimate
  | UnknownCostEstimate;

export type GenerationRunJsonExportFilters = {
  failureClass?: GenerationRunFailureClass;
  maxRuns?: number;
  status?: GenerationRunStatus;
};

export type GenerationRunJsonExportOptions = GenerationRunJsonExportFilters & {
  exportedAt?: string;
};

export type GenerationRunJsonExportCandidate = Pick<
  GenerationRunCandidateSummary,
  "gameSpecId" | "issueCount" | "kind" | "referencedMechanicIds" | "summary"
>;

export type GenerationRunJsonExportAttempt = {
  id: GenerationRunAttemptReceipt["id"];
  attemptNumber: GenerationRunAttemptReceipt["attemptNumber"];
  kind: GenerationRunAttemptReceipt["kind"];
  status: GenerationRunAttemptReceipt["status"];
  provider: GenerationRunAttemptReceipt["provider"];
  model: GenerationRunAttemptReceipt["model"];
  taskRoute: GenerationRunAttemptReceipt["taskRoute"];
  requestSummary: GenerationRunAttemptReceipt["requestSummary"];
  startedAt: GenerationRunAttemptReceipt["startedAt"];
  completedAt?: GenerationRunAttemptReceipt["completedAt"];
  durationMs?: GenerationRunAttemptReceipt["durationMs"];
  usage?: GenerationRunAttemptReceipt["usage"];
  cost: GenerationRunJsonExportCost;
  validation?: GenerationRunJsonExportValidation;
  repair?: GenerationRunAttemptReceipt["repair"];
  candidate?: GenerationRunJsonExportCandidate;
};

export type GenerationRunJsonExportValidation = {
  stage: GenerationRunAttemptValidation["stage"];
  status: GenerationRunAttemptValidation["status"];
  issueCount: number;
  issues: Array<{
    code?: string;
    path?: string;
    message: string;
  }>;
};

export type GenerationRunJsonExportProviderModel = {
  provider: string;
  model: string;
};

export type GenerationRunJsonExportRun = {
  id: GenerationRun["id"];
  status: GenerationRun["status"];
  operationType: GenerationRun["operationType"];
  repairStatus?: GenerationRun["repairStatus"];
  createdAt: GenerationRun["createdAt"];
  startedAt: GenerationRun["startedAt"];
  completedAt?: GenerationRun["completedAt"];
  durationMs?: GenerationRun["durationMs"];
  prompt: GenerationRun["request"];
  runtimeKind?: GenerationRun["runtimeKind"];
  templateId?: GenerationRun["templateId"];
  mechanicIds?: GenerationRun["mechanicIds"];
  stage?: GenerationRun["stage"];
  failureClass?: GenerationRun["failureClass"];
  taskRoutes: string[];
  providerModels: GenerationRunJsonExportProviderModel[];
  attemptCount: number;
  attempts: GenerationRunJsonExportAttempt[];
  cost: GenerationRunJsonExportCost;
  linkedOutcomeIds?: GenerationRunRelationships;
};

export type GenerationRunJsonExport = {
  schemaVersion: typeof GENERATION_RUN_JSON_EXPORT_SCHEMA_VERSION;
  audience: "developer-internal";
  exportedAt: string;
  filters: GenerationRunJsonExportFilters;
  runCount: number;
  failureClassCounts: Partial<Record<GenerationRunFailureClass | "none", number>>;
  runs: GenerationRunJsonExportRun[];
};

export function createGenerationRunJsonExport(
  generationRuns: readonly GenerationRun[],
  options: GenerationRunJsonExportOptions = {}
): GenerationRunJsonExport {
  const filters = createExportFilters(options);
  const runs = applyExportFilters(generationRuns, filters).map(
    createGenerationRunJsonExportRun
  );

  return {
    schemaVersion: GENERATION_RUN_JSON_EXPORT_SCHEMA_VERSION,
    audience: "developer-internal",
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    filters,
    runCount: runs.length,
    failureClassCounts: countFailureClasses(runs),
    runs,
  };
}

export function createGenerationRunJsonExportText(
  generationRuns: readonly GenerationRun[],
  options: GenerationRunJsonExportOptions = {}
): string {
  return JSON.stringify(
    createGenerationRunJsonExport(generationRuns, options),
    null,
    2
  );
}

export async function createGenerationRunRepositoryJsonExport(
  repository: Pick<GenerationRunRepository, "list">,
  options: GenerationRunJsonExportOptions = {}
): Promise<GenerationRunJsonExport> {
  const runs = await repository.list();

  return createGenerationRunJsonExport(runs, options);
}

export async function createGenerationRunRepositoryJsonExportText(
  repository: Pick<GenerationRunRepository, "list">,
  options: GenerationRunJsonExportOptions = {}
): Promise<string> {
  const runs = await repository.list();

  return createGenerationRunJsonExportText(runs, options);
}

function createExportFilters(
  options: GenerationRunJsonExportOptions
): GenerationRunJsonExportFilters {
  return {
    ...(options.failureClass ? { failureClass: options.failureClass } : {}),
    ...(typeof options.maxRuns === "number"
      ? { maxRuns: Math.max(0, Math.floor(options.maxRuns)) }
      : {}),
    ...(options.status ? { status: options.status } : {}),
  };
}

function applyExportFilters(
  generationRuns: readonly GenerationRun[],
  filters: GenerationRunJsonExportFilters
): GenerationRun[] {
  let runs = [...generationRuns].sort(compareRunsByLatestReceiptTime);

  if (filters.status) {
    runs = runs.filter((run) => run.status === filters.status);
  }

  if (filters.failureClass) {
    runs = runs.filter((run) => run.failureClass === filters.failureClass);
  }

  if (filters.maxRuns !== undefined) {
    runs = runs.slice(0, filters.maxRuns);
  }

  return runs;
}

function createGenerationRunJsonExportRun(
  run: GenerationRun
): GenerationRunJsonExportRun {
  return {
    id: run.id,
    status: run.status,
    operationType: run.operationType,
    ...(run.repairStatus ? { repairStatus: run.repairStatus } : {}),
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    ...(run.completedAt ? { completedAt: run.completedAt } : {}),
    ...(run.durationMs !== undefined ? { durationMs: run.durationMs } : {}),
    prompt: run.request,
    ...(run.runtimeKind ? { runtimeKind: run.runtimeKind } : {}),
    ...(run.templateId ? { templateId: run.templateId } : {}),
    ...(run.mechanicIds ? { mechanicIds: run.mechanicIds } : {}),
    ...(run.stage ? { stage: run.stage } : {}),
    ...(run.failureClass ? { failureClass: run.failureClass } : {}),
    taskRoutes: unique(run.attempts.map((attempt) => attempt.taskRoute)),
    providerModels: uniqueProviderModels(run.attempts),
    attemptCount: run.attempts.length,
    attempts: run.attempts.map(createGenerationRunJsonExportAttempt),
    cost: run.cost ?? createGenerationRunCostEstimateFromAttempts(run.attempts),
    ...(run.relationships ? { linkedOutcomeIds: run.relationships } : {}),
  };
}

function createGenerationRunJsonExportAttempt(
  attempt: GenerationRunAttemptReceipt
): GenerationRunJsonExportAttempt {
  return {
    id: attempt.id,
    attemptNumber: attempt.attemptNumber,
    kind: attempt.kind,
    status: attempt.status,
    provider: attempt.provider,
    model: attempt.model,
    taskRoute: attempt.taskRoute,
    requestSummary: attempt.requestSummary,
    startedAt: attempt.startedAt,
    ...(attempt.completedAt ? { completedAt: attempt.completedAt } : {}),
    ...(attempt.durationMs !== undefined
      ? { durationMs: attempt.durationMs }
      : {}),
    ...(attempt.usage ? { usage: attempt.usage } : {}),
    cost: attempt.cost ?? { quality: "unknown" },
    ...(attempt.validation
      ? { validation: createGenerationRunJsonExportValidation(attempt.validation) }
      : {}),
    ...(attempt.repair ? { repair: attempt.repair } : {}),
    ...(attempt.candidate
      ? { candidate: createGenerationRunJsonExportCandidate(attempt.candidate) }
      : {}),
  };
}

function createGenerationRunJsonExportValidation(
  validation: GenerationRunAttemptValidation
): GenerationRunJsonExportValidation {
  const issues = validation.issues ?? [];

  return {
    stage: validation.stage,
    status: validation.status,
    issueCount: issues.length,
    issues: issues.map((issue) => ({
      ...(issue.code ? { code: issue.code } : {}),
      ...(issue.path ? { path: issue.path } : {}),
      message: issue.message,
    })),
  };
}

function createGenerationRunJsonExportCandidate(
  candidate: GenerationRunCandidateSummary
): GenerationRunJsonExportCandidate {
  return {
    kind: candidate.kind,
    ...(candidate.gameSpecId ? { gameSpecId: candidate.gameSpecId } : {}),
    summary: candidate.summary,
    ...(candidate.issueCount !== undefined ? { issueCount: candidate.issueCount } : {}),
    ...(candidate.referencedMechanicIds
      ? { referencedMechanicIds: candidate.referencedMechanicIds }
      : {}),
  };
}

function createGenerationRunCostEstimateFromAttempts(
  attempts: readonly GenerationRunAttemptReceipt[]
): GenerationRunJsonExportCost {
  const costs = attempts.flatMap((attempt) => (attempt.cost ? [attempt.cost] : []));

  if (costs.length === 0) {
    return { quality: "unknown" };
  }

  if (costs.length === 1) {
    return costs[0];
  }

  return {
    amountUsd: costs.reduce((sum, cost) => sum + cost.amountUsd, 0),
    currency: "USD",
    source: costs.every((cost) => cost.source === costs[0].source)
      ? costs[0].source
      : "manual",
    quality: costs.every((cost) => cost.quality === "exact")
      ? "exact"
      : costs.some((cost) => cost.quality === "unknown")
        ? "unknown"
        : "estimated",
  };
}

function countFailureClasses(
  runs: readonly GenerationRunJsonExportRun[]
): Partial<Record<GenerationRunFailureClass | "none", number>> {
  const counts: Partial<Record<GenerationRunFailureClass | "none", number>> = {};

  for (const run of runs) {
    const failureClass = run.failureClass ?? "none";
    counts[failureClass] = (counts[failureClass] ?? 0) + 1;
  }

  return counts;
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueProviderModels(
  attempts: readonly GenerationRunAttemptReceipt[]
): GenerationRunJsonExportProviderModel[] {
  const seen = new Set<string>();
  const providerModels: GenerationRunJsonExportProviderModel[] = [];

  for (const attempt of attempts) {
    const key = `${attempt.provider}\u0000${attempt.model}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    providerModels.push({
      provider: attempt.provider,
      model: attempt.model,
    });
  }

  return providerModels;
}

function compareRunsByLatestReceiptTime(
  left: GenerationRun,
  right: GenerationRun
): number {
  return getGenerationRunLatestReceiptTime(right).localeCompare(
    getGenerationRunLatestReceiptTime(left)
  );
}

function getGenerationRunLatestReceiptTime(run: GenerationRun): string {
  return run.completedAt ?? run.startedAt;
}
