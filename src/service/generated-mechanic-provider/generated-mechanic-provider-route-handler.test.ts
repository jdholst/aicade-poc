import { describe, expect, it, vi } from "vitest";

import {
  GENERATED_MECHANIC_PROVIDER_REQUEST_VERSION,
  serializeMechanicIntentForProviderTransport,
} from "./generated-mechanic-provider-schema";
import { createGeneratedMechanicProviderPostHandler } from "./generated-mechanic-provider-route-handler";
import {
  createContractProviderInput,
  createSourceProviderInput,
} from "./generated-mechanic-provider-test-fixtures";

describe("Generated Mechanic Provider API route", () => {
  it("resolves server configuration and performs only the raw contract provider call", async () => {
    const candidate = { contractCandidate: true };
    const repair = {
      trigger: "stage_failure" as const,
      failureAttemptId: "generation_run_provider_contract_attempt_1",
      issues: [
        {
          path: "bindings",
          code: "missing_entity_binding",
          message: "Declare at least one entity binding.",
        },
      ],
      invalidatedArtifactIds: ["contract_candidate_attempt_1"],
    };
    const contractProvider = vi.fn().mockResolvedValue(candidate);
    const sourceProvider = vi.fn();
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: {
        OPENAI_API_KEY: "sk-environment",
        OPENAI_MODEL: "gpt-5.4-mini",
      },
      sourceProvider,
    });

    const response = await post(
      jsonRequest(
        createContractRequest(
          { openAiApiKey: "sk-ignored-client" },
          { attemptKind: "repair", repair }
        )
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(contractProvider).toHaveBeenCalledTimes(1);
    expect(sourceProvider).not.toHaveBeenCalled();
    expect(contractProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4-mini",
        providerCredential: "sk-environment",
        taskRoute: "mechanic_contract_generation.primary",
        signal: expect.anything(),
        generationAttempt: {
          generationRunId: "generation_run_provider",
          stage: "contract",
          attemptNumber: 2,
          kind: "repair",
          candidateArtifactId:
            "generation_run_provider_contract_repair_2",
          repair,
        },
      })
    );
    expect(payload).toEqual({
      schemaVersion: "generated_mechanic_provider_response/v1",
      ok: true,
      generationRunId: "generation_run_provider",
      stage: "contract",
      attempt: 2,
      attemptKind: "repair",
      candidate,
    });
    expect(JSON.stringify(payload)).not.toContain("sk-environment");
  });

  it("resolves keyword and client model configuration for only the raw source provider call", async () => {
    const candidate = { sourceCandidate: true };
    const repair = {
      trigger: "upstream_invalidation" as const,
      failureAttemptId: "generation_run_provider_contract_attempt_2",
      issues: [],
      invalidatedArtifactIds: ["source_candidate_attempt_2"],
    };
    const contractProvider = vi.fn();
    const sourceProvider = vi.fn().mockResolvedValue(candidate);
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: { KEYWORD_ARCADE_LAB: "sk-keyword" },
      sourceProvider,
    });

    const response = await post(
      jsonRequest(
        createSourceRequest({
          openAiKeyword: "arcade lab",
          openAiModel: "gpt-5.4-mini",
        }, { attemptKind: "repair", repair })
      )
    );

    expect(response.status).toBe(200);
    expect(sourceProvider).toHaveBeenCalledTimes(1);
    expect(contractProvider).not.toHaveBeenCalled();
    expect(sourceProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.4-mini",
        providerCredential: "sk-keyword",
        taskRoute: "mechanic_source_generation.primary",
        signal: expect.anything(),
        generationAttempt: {
          generationRunId: "generation_run_provider",
          stage: "source",
          attemptNumber: 3,
          kind: "repair",
          candidateArtifactId:
            "generation_run_provider_source_repair_3",
          repair,
        },
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      generationRunId: "generation_run_provider",
      stage: "source",
      attempt: 3,
      attemptKind: "repair",
      candidate,
    });
  });

  it("rejects credential and signal fields inside strict stage input before either provider runs", async () => {
    const contractProvider = vi.fn();
    const sourceProvider = vi.fn();
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: { OPENAI_API_KEY: "sk-environment" },
      sourceProvider,
    });
    const request = createContractRequest({});

    const response = await post(
      jsonRequest({
        ...request,
        stageInput: {
          ...request.stageInput,
          providerCredential: "must-not-cross",
          signal: {},
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      schemaVersion: "generated_mechanic_provider_response/v1",
      ok: false,
      generationRunId: null,
      stage: null,
      attempt: null,
      attemptKind: null,
      error: {
        code: "invalid_request",
        message:
          "Generated mechanic provider request did not match the strict transport schema.",
      },
    });
    expect(contractProvider).not.toHaveBeenCalled();
    expect(sourceProvider).not.toHaveBeenCalled();
  });

  it("rejects a repair attempt without exact repair feedback before either provider runs", async () => {
    const contractProvider = vi.fn();
    const sourceProvider = vi.fn();
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: { OPENAI_API_KEY: "sk-environment" },
      sourceProvider,
    });

    const response = await post(
      jsonRequest(
        createSourceRequest({}, { attemptKind: "repair" })
      )
    );

    expect(response.status).toBe(400);
    expect(contractProvider).not.toHaveBeenCalled();
    expect(sourceProvider).not.toHaveBeenCalled();
  });

  it("rejects upstream invalidation that misroutes issue feedback before either provider runs", async () => {
    const contractProvider = vi.fn();
    const sourceProvider = vi.fn();
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: { OPENAI_API_KEY: "sk-environment" },
      sourceProvider,
    });

    const response = await post(
      jsonRequest(
        createSourceRequest(
          {},
          {
            attemptKind: "repair",
            repair: {
              trigger: "upstream_invalidation",
              failureAttemptId: "generation_run_provider_contract_2",
              issues: [
                {
                  path: "bindings",
                  code: "upstream_issue",
                  message: "This issue belongs to the contract stage.",
                },
              ],
              invalidatedArtifactIds: ["source_candidate_attempt_2"],
            },
          }
        )
      )
    );

    expect(response.status).toBe(400);
    expect(contractProvider).not.toHaveBeenCalled();
    expect(sourceProvider).not.toHaveBeenCalled();
  });

  it("rejects a hostile CORS-simple text request before resolving provider configuration", async () => {
    const contractProvider = vi.fn();
    const sourceProvider = vi.fn();
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: { OPENAI_API_KEY: "sk-environment" },
      sourceProvider,
    });

    const response = await post(
      new Request("http://localhost/api/generated-mechanic-provider", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Origin: "https://attacker.example",
          "Sec-Fetch-Site": "cross-site",
        },
        body: JSON.stringify(createContractRequest({})),
      })
    );

    expect(response.status).toBe(415);
    expect(contractProvider).not.toHaveBeenCalled();
    expect(sourceProvider).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin JSON request before resolving provider configuration", async () => {
    const contractProvider = vi.fn();
    const sourceProvider = vi.fn();
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: { OPENAI_API_KEY: "sk-environment" },
      sourceProvider,
    });
    const request = jsonRequest(createContractRequest({}));
    request.headers.set("Origin", "https://attacker.example");
    request.headers.set("Sec-Fetch-Site", "cross-site");

    const response = await post(request);

    expect(response.status).toBe(403);
    expect(contractProvider).not.toHaveBeenCalled();
    expect(sourceProvider).not.toHaveBeenCalled();
  });

  it("rejects a GenerationRun ID that cannot produce a bounded candidate artifact ID", async () => {
    const contractProvider = vi.fn();
    const sourceProvider = vi.fn();
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: { OPENAI_API_KEY: "sk-environment" },
      sourceProvider,
    });

    const response = await post(
      jsonRequest({
        ...createContractRequest({}),
        generationRunId: `a${"a".repeat(239)}`,
      })
    );

    expect(response.status).toBe(400);
    expect(contractProvider).not.toHaveBeenCalled();
    expect(sourceProvider).not.toHaveBeenCalled();
  });

  it("admits the largest correlation and attempt that still derive a bounded candidate artifact ID", async () => {
    const contractProvider = vi.fn().mockResolvedValue({ accepted: true });
    const sourceProvider = vi.fn();
    const post = createGeneratedMechanicProviderPostHandler({
      contractProvider,
      env: { OPENAI_API_KEY: "sk-environment" },
      sourceProvider,
    });

    const response = await post(
      jsonRequest({
        ...createContractRequest({}),
        generationRunId: "a".repeat(206),
        attempt: Number.MAX_SAFE_INTEGER,
      })
    );

    expect(response.status).toBe(200);
    expect(contractProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        generationAttempt: expect.objectContaining({
          candidateArtifactId: `${"a".repeat(206)}_contract_initial_${Number.MAX_SAFE_INTEGER}`,
        }),
      })
    );
    expect(
      contractProvider.mock.calls[0]?.[0]?.generationAttempt.candidateArtifactId
    ).toHaveLength(240);
    expect(sourceProvider).not.toHaveBeenCalled();
  });
});

type AttemptRequest = Readonly<{
  attemptKind: "initial" | "repair";
  repair?: Readonly<{
    trigger: "stage_failure" | "upstream_invalidation";
    failureAttemptId: string;
    issues: readonly Readonly<{
      path: string;
      code: string;
      message: string;
    }>[];
    invalidatedArtifactIds: readonly string[];
  }>;
}>;

function createContractRequest(
  providerConfig: Record<string, string>,
  attemptRequest: AttemptRequest = { attemptKind: "initial" }
) {
  const input = createContractProviderInput();
  return {
    schemaVersion: GENERATED_MECHANIC_PROVIDER_REQUEST_VERSION,
    generationRunId: "generation_run_provider",
    stage: "contract" as const,
    attempt: 2,
    ...attemptRequest,
    providerConfig,
    stageInput: {
      intent: serializeMechanicIntentForProviderTransport(input.intent),
      resolution: input.resolution,
      constraintSet: input.constraintSet,
      referenceCatalog: input.referenceCatalog,
      resourceBudget: input.resourceBudget,
    },
  };
}

function createSourceRequest(
  providerConfig: Record<string, string>,
  attemptRequest: AttemptRequest = { attemptKind: "initial" }
) {
  const input = createSourceProviderInput();
  return {
    schemaVersion: GENERATED_MECHANIC_PROVIDER_REQUEST_VERSION,
    generationRunId: "generation_run_provider",
    stage: "source" as const,
    attempt: 3,
    ...attemptRequest,
    providerConfig,
    stageInput: {
      intent: serializeMechanicIntentForProviderTransport(input.intent),
      resolution: input.resolution,
      constraintSet: input.constraintSet,
      contract: input.contract,
      grant: input.grant,
      referenceCatalog: input.referenceCatalog,
      resourceBudget: input.resourceBudget,
    },
  };
}

function jsonRequest(payload: unknown) {
  return new Request("http://localhost/api/generated-mechanic-provider", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify(payload),
  });
}
