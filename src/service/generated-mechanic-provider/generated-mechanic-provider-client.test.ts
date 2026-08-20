import { describe, expect, it, vi } from "vitest";

import {
  createGeneratedMechanicContractHttpProvider,
  createGeneratedMechanicSourceHttpProvider,
} from "./generated-mechanic-provider-client";
import {
  createContractProviderInput,
  createSourceProviderInput,
} from "./generated-mechanic-provider-test-fixtures";

describe("Generated Mechanic HTTP providers", () => {
  it("serializes contract data and user provider configuration without the stage credential or signal", async () => {
    const candidate = { contractCandidate: true };
    const requests: Array<{
      input: RequestInfo | URL;
      init?: RequestInit;
    }> = [];
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      requests.push({ input, init });
      return providerResponse({
        generationRunId: "generation_run_contract_http",
        stage: "contract",
        attempt: 2,
        attemptKind: "repair",
        candidate,
      });
    });
    const controller = new AbortController();
    const provider = createGeneratedMechanicContractHttpProvider({
      attempt: 2,
      kind: "repair",
      repair: {
        trigger: "stage_failure",
        failureAttemptId:
          "generation_run_contract_http_contract_attempt_1",
        issues: [
          {
            path: "bindings",
            code: "missing_entity_binding",
            message: "Declare at least one entity binding.",
          },
        ],
        invalidatedArtifactIds: ["contract_candidate_attempt_1"],
      },
      fetchImpl,
      generationRunId: "generation_run_contract_http",
      providerRequest: {
        openAiApiKey: "sk-user-selected",
        openAiKeyword: "arcade lab",
        openAiModel: "gpt-5.4-mini",
      },
    });

    await expect(
      provider(createContractProviderInput(controller.signal))
    ).resolves.toEqual(candidate);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(requests[0]?.input)).toBe(
      "/api/generated-mechanic-provider"
    );
    expect(requests[0]?.init?.signal).toBe(controller.signal);
    const body = JSON.parse(String(requests[0]?.init?.body));
    expect(body).toMatchObject({
      schemaVersion: "generated_mechanic_provider_request/v1",
      generationRunId: "generation_run_contract_http",
      stage: "contract",
      attempt: 2,
      attemptKind: "repair",
      repair: {
        trigger: "stage_failure",
        failureAttemptId:
          "generation_run_contract_http_contract_attempt_1",
        issues: [
          {
            path: "bindings",
            code: "missing_entity_binding",
            message: "Declare at least one entity binding.",
          },
        ],
        invalidatedArtifactIds: ["contract_candidate_attempt_1"],
      },
      providerConfig: {
        openAiApiKey: "sk-user-selected",
        openAiKeyword: "arcade lab",
        openAiModel: "gpt-5.4-mini",
      },
    });
    expect(body.stageInput).not.toHaveProperty("signal");
    expect(body.stageInput).not.toHaveProperty("providerCredential");
    expect(body.stageInput).not.toHaveProperty("model");
    expect(body.stageInput).not.toHaveProperty("taskRoute");
    expect(JSON.stringify(body.stageInput)).not.toContain(
      "browser-placeholder-credential"
    );
  });

  it("serializes only source-guidance data and preserves source attempt correlation", async () => {
    const candidate = { sourceCandidate: true };
    const requests: RequestInit[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (_input, init) => {
      requests.push(init ?? {});
      return providerResponse({
        generationRunId: "generation_run_source_http",
        stage: "source",
        attempt: 4,
        attemptKind: "repair",
        candidate,
      });
    });
    const controller = new AbortController();
    const provider = createGeneratedMechanicSourceHttpProvider({
      attempt: 4,
      kind: "repair",
      repair: {
        trigger: "upstream_invalidation",
        failureAttemptId:
          "generation_run_source_http_contract_attempt_2",
        issues: [],
        invalidatedArtifactIds: ["source_candidate_attempt_3"],
      },
      fetchImpl,
      generationRunId: "generation_run_source_http",
      providerRequest: { openAiKeyword: "arcade lab" },
    });

    await expect(
      provider(createSourceProviderInput(controller.signal))
    ).resolves.toEqual(candidate);

    const body = JSON.parse(String(requests[0]?.body));
    expect(requests[0]?.signal).toBe(controller.signal);
    expect(body).toMatchObject({
      generationRunId: "generation_run_source_http",
      stage: "source",
      attempt: 4,
      attemptKind: "repair",
      repair: {
        trigger: "upstream_invalidation",
        failureAttemptId:
          "generation_run_source_http_contract_attempt_2",
        issues: [],
        invalidatedArtifactIds: ["source_candidate_attempt_3"],
      },
      providerConfig: { openAiKeyword: "arcade lab" },
    });
    expect(body.stageInput).not.toHaveProperty("signal");
    expect(body.stageInput).not.toHaveProperty("providerCredential");
    expect(body.stageInput).not.toHaveProperty("model");
    expect(body.stageInput).not.toHaveProperty("taskRoute");
    expect(body.stageInput.contract).not.toHaveProperty("scenarios");
  });

  it("rejects a valid JSON candidate with mismatched run, stage, or attempt correlation", async () => {
    const provider = createGeneratedMechanicContractHttpProvider({
      attempt: 1,
      kind: "initial",
      fetchImpl: async () =>
        providerResponse({
          generationRunId: "generation_run_other",
          stage: "contract",
          attempt: 1,
          attemptKind: "repair",
          candidate: {},
        }),
      generationRunId: "generation_run_expected",
      providerRequest: {},
    });

    await expect(provider(createContractProviderInput())).rejects.toMatchObject(
      {
        name: "MechanicContractGenerationProviderError",
        evidence: {
          stage: "contract_generation",
          code: "invalid_provider_output",
          issues: [
            expect.objectContaining({
              code: "invalid_provider_output",
              message: expect.stringContaining("mismatched request correlation"),
            }),
          ],
        },
      }
    );
  });

  it("rejects a candidate response with a mismatched attempt-kind correlation", async () => {
    const provider = createGeneratedMechanicSourceHttpProvider({
      attempt: 2,
      kind: "initial",
      fetchImpl: async () =>
        providerResponse({
          generationRunId: "generation_run_kind_correlation",
          stage: "source",
          attempt: 2,
          attemptKind: "repair",
          candidate: {},
        }),
      generationRunId: "generation_run_kind_correlation",
      providerRequest: {},
    });

    await expect(provider(createSourceProviderInput())).rejects.toMatchObject({
      name: "MechanicSourceGenerationProviderError",
      evidence: {
        code: "invalid_provider_output",
        issues: [
          expect.objectContaining({
            message: expect.stringContaining("mismatched request correlation"),
          }),
        ],
      },
    });
  });

  it("classifies cancellation after response headers arrive before decoding JSON", async () => {
    const controller = new AbortController();
    const provider = createGeneratedMechanicContractHttpProvider({
      attempt: 1,
      kind: "initial",
      fetchImpl: async () => {
        controller.abort("cancelled");
        return providerResponse({
          generationRunId: "generation_run_cancelled_headers",
          stage: "contract",
          attempt: 1,
          attemptKind: "initial",
          candidate: {},
        });
      },
      generationRunId: "generation_run_cancelled_headers",
      providerRequest: {},
    });

    await expect(
      provider(createContractProviderInput(controller.signal))
    ).rejects.toMatchObject({
      evidence: { code: "provider_cancelled" },
    });
  });

  it("classifies cancellation during response JSON decoding", async () => {
    const controller = new AbortController();
    const response = providerResponse({
      generationRunId: "generation_run_cancelled_json",
      stage: "source",
      attempt: 1,
      attemptKind: "initial",
      candidate: {},
    });
    vi.spyOn(response, "json").mockImplementation(async () => {
      controller.abort("cancelled");
      throw new SyntaxError("partial response body");
    });
    const provider = createGeneratedMechanicSourceHttpProvider({
      attempt: 1,
      kind: "initial",
      fetchImpl: async () => response,
      generationRunId: "generation_run_cancelled_json",
      providerRequest: {},
    });

    await expect(
      provider(createSourceProviderInput(controller.signal))
    ).rejects.toMatchObject({
      evidence: { code: "provider_cancelled" },
    });
  });
});

function providerResponse({
  generationRunId,
  stage,
  attempt,
  attemptKind,
  candidate,
}: {
  generationRunId: string;
  stage: "contract" | "source";
  attempt: number;
  attemptKind: "initial" | "repair";
  candidate: unknown;
}) {
  return Response.json({
    schemaVersion: "generated_mechanic_provider_response/v1",
    ok: true,
    generationRunId,
    stage,
    attempt,
    attemptKind,
    candidate,
  });
}
