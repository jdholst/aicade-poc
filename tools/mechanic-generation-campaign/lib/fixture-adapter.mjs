export function adaptPlanningFixture(request, fixture) {
  if (!request || !fixture || typeof request !== "object" || typeof fixture !== "object") {
    throw new Error("Planning fixture adaptation requires object inputs.");
  }

  const adapted = structuredClone(fixture);
  if (typeof request.enteredPrompt === "string" && adapted.spec) {
    adapted.spec.originalPrompt = request.enteredPrompt;
  }
  if (typeof request.generationRunId === "string") {
    if (adapted.metadata) {
      adapted.metadata.generationRunId = request.generationRunId;
    }
    if (adapted.routing) {
      adapted.routing.generationRunId = request.generationRunId;
    }
  }
  return adapted;
}

export function adaptGeneratedMechanicFixture(request, fixture) {
  if (!request || !fixture || typeof request !== "object" || typeof fixture !== "object") {
    throw new Error("Generated-mechanic fixture adaptation requires object inputs.");
  }
  if (request.stage !== fixture.stage) {
    throw new Error(
      `Cannot use a ${fixture.stage ?? "unknown"} fixture for a ${request.stage ?? "unknown"} request.`
    );
  }
  if (!fixture.candidate || typeof fixture.candidate !== "object") {
    throw new Error("Generated-mechanic fixtures require an object candidate.");
  }

  const candidateArtifactId = [
    request.generationRunId,
    request.stage,
    request.attemptKind,
    request.attempt,
  ].join("_");
  const candidate = {
    ...structuredClone(fixture.candidate),
    id: candidateArtifactId,
  };

  if (request.stage === "contract") {
    const intentId = request.stageInput?.intent?.id;
    if (typeof intentId !== "string" || !intentId) {
      throw new Error("Contract fixture adaptation requires stageInput.intent.id.");
    }
    candidate.intentId = intentId;
  } else if (request.stage === "source") {
    const contractId = request.stageInput?.contract?.id;
    if (typeof contractId !== "string" || !contractId) {
      throw new Error("Source fixture adaptation requires stageInput.contract.id.");
    }
    candidate.contractId = contractId;
  }

  return {
    ...structuredClone(fixture),
    generationRunId: request.generationRunId,
    stage: request.stage,
    attempt: request.attempt,
    attemptKind: request.attemptKind,
    candidate,
  };
}

export async function resolveProviderRequest({
  stage,
  mode,
  requestBody,
  fixture,
  fetchActual,
}) {
  if (mode === "actual") {
    if (typeof fetchActual !== "function") {
      throw new Error(`Actual ${stage} mode requires an upstream fetch function.`);
    }
    const response = await fetchActual(stage);
    return {
      source: "actual",
      status: response.status,
      body: response.body,
    };
  }

  if (mode !== "fixture") {
    throw new Error(`Unsupported provider mode "${mode}" for ${stage}.`);
  }
  if (!fixture) {
    throw new Error(`Fixture mode for ${stage} requires a fixture.`);
  }

  return {
    source: "fixture",
    status: 200,
    body:
      stage === "planning"
        ? adaptPlanningFixture(requestBody, fixture)
        : adaptGeneratedMechanicFixture(requestBody, fixture),
  };
}
