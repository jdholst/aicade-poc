const STAGE_RANKS = [
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

export function createLoopbackBaseUrl(port) {
  return `http://localhost:${port}`;
}

export function createAttemptSchedule(cohort, prompts, executionPolicy = {}) {
  const baseline = prompts.find((prompt) => prompt.id === "baseline");
  if (!baseline) {
    throw new Error("Campaign manifest requires a baseline prompt.");
  }

  if (cohort === "variation") {
    if (executionPolicy.scheduleOrder === "round_robin") {
      return [1, 2].flatMap((run) =>
        prompts.map((prompt, promptIndex) => ({
          sequence: (run - 1) * prompts.length + promptIndex + 1,
          promptId: prompt.id,
          prompt: prompt.text,
        }))
      );
    }
    return prompts.flatMap((prompt, promptIndex) =>
      [1, 2].map((run) => ({
        sequence: promptIndex * 2 + run,
        promptId: prompt.id,
        prompt: prompt.text,
      }))
    );
  }

  const count = cohort === "repeatability" ? 10 : 1;
  return Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    promptId: baseline.id,
    prompt: baseline.text,
  }));
}

export function maximumCampaignSubmissions(cohort, prompts, cohortPolicy) {
  return (
    createAttemptSchedule(cohort, prompts).length +
    (cohort === "variation" ? cohortPolicy.maxReplacementAttempts ?? 0 : 0)
  );
}

export function createNextAttemptSchedule({
  cohort,
  prompts,
  attempts,
  score,
  executionPolicy,
}) {
  if (score.status !== "running") return null;

  const scheduledAttempts = attempts.filter(
    (attempt) => attempt.submissionKind !== "replacement"
  );
  const baseSchedule = createAttemptSchedule(cohort, prompts, executionPolicy);
  if (scheduledAttempts.length < baseSchedule.length) {
    return baseSchedule[scheduledAttempts.length];
  }

  if (cohort !== "variation" || !score.replacementPromptId) return null;
  if (attempts.some((attempt) => attempt.submissionKind === "replacement")) {
    return null;
  }
  const prompt = prompts.find(({ id }) => id === score.replacementPromptId);
  if (!prompt) {
    throw new Error(
      `Variation replacement prompt "${score.replacementPromptId}" is not frozen in the manifest.`
    );
  }
  return {
    sequence: attempts.length + 1,
    promptId: prompt.id,
    prompt: prompt.text,
    submissionKind: "replacement",
    replacementForPromptId: prompt.id,
  };
}

export function resolveProviderModes(cohort, modes, fixtures) {
  const resolved = {
    planning: modes.planning,
    contract: modes.contract,
    source: modes.source,
  };
  if (cohort === "variation" && resolved.planning !== "actual") {
    throw new Error("Prompt-variation campaigns require actual planning.");
  }
  for (const stage of ["planning", "contract", "source"]) {
    if (resolved[stage] === "fixture" && !fixtures[stage]) {
      throw new Error(`Fixture mode for ${stage} requires a fixture reference.`);
    }
  }
  return resolved;
}

export function resolveProviderCredentialInput(manifest, providerModes, environment = process.env) {
  const fixtureOnly = Object.values(providerModes).every((mode) => mode === "fixture");
  if (fixtureOnly) {
    return { kind: "keyword", value: "Fixture Only" };
  }

  const value = environment[manifest.credential.envName];
  return manifest.credential.source === "api_key_env"
    ? { kind: "api_key", value }
    : { kind: "keyword", value };
}

export function classifyFurthestStage(evidence) {
  let furthest = "submission";
  const advance = (stage) => {
    if (STAGE_RANKS.indexOf(stage) > STAGE_RANKS.indexOf(furthest)) {
      furthest = stage;
    }
  };

  if ((evidence.providerCalls?.planning ?? 0) + (evidence.fixtureCalls?.planning ?? 0) > 0) {
    advance("planning");
  }
  if ((evidence.providerCalls?.contract ?? 0) + (evidence.fixtureCalls?.contract ?? 0) > 0) {
    advance("contract_generation");
  }
  if ((evidence.providerCalls?.source ?? 0) + (evidence.fixtureCalls?.source ?? 0) > 0) {
    advance("source_generation");
  }

  const runStage = evidence.generationRun?.stage;
  const stageMap = {
    "model-generation": "planning",
    "schema-validation": "source_validation",
    "semantic-validation": "source_validation",
    "mechanic-validation": "contract_validation",
    "artifact-build": "assembly",
    artifact_evaluation: "deterministic_evaluation",
    deterministic_evaluation: "deterministic_evaluation",
    runtime_activation: "runtime_activation",
    "runtime-boot": "runtime_activation",
    first_playable: "first_playable",
    "browser-check": "first_playable",
    persistence: "persistence",
  };
  if (stageMap[runStage]) {
    advance(stageMap[runStage]);
  }
  if (evidence.generationRun?.status === "succeeded") {
    advance("persistence");
  }
  if (evidence.gamePack) {
    advance("persistence");
  }
  if (evidence.runtimeMounted) {
    advance("editor_mount");
  }
  if (evidence.runtimeHealthy) {
    advance("runtime_health");
  }
  if (evidence.cleanupPassed) {
    advance("cleanup");
  }
  if (evidence.externalProbePassed) {
    advance("external_mechanic_probe");
  }
  return furthest;
}
