import { describe, expect, it, vi } from "vitest";

import {
  PHASE_9_GENERATION_CONSTRAINT_SET,
  type GeneratedMechanicResolution,
  type MechanicIntent,
} from "@/game-spec";

import { createOpenAiMechanicContractProvider } from "./mechanic-contract-generation-provider";
import type { MechanicContractGenerationProviderInput } from "./mechanic-contract-generation-service";

const intent: MechanicIntent = {
  id: "intent_runtime_rule",
  summary: "Change private state from a logical action.",
  triggers: ["logical_action"],
  actors: ["player"],
  targets: [],
  behaviors: ["change_private_state"],
  ownedObjects: [],
  stateChanges: ["enabled_changes"],
  temporalRules: [],
  spatialRules: [],
  constraints: [],
  configuration: [],
  connections: [],
  references: [],
  outcomes: ["enabled_state_observable"],
  requiredCapabilities: ["state_write"],
  ambiguities: [],
};

const resolution: GeneratedMechanicResolution = {
  kind: "generated_mechanic",
  intentId: intent.id,
  candidateBuiltInTypes: [],
  assumptions: [],
  coverage: {
    coveredRequirements: [],
    uncoveredRequirements: [
      {
        category: "behavior",
        value: "change_private_state",
        coveredBy: [],
      },
    ],
  },
};

const providerInput: MechanicContractGenerationProviderInput = {
  intent,
  resolution,
  constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
  referenceCatalog: { action: ["toggle"] },
  resourceBudget: {
    profileId: "phase_9_fixed_budget",
    maximumOwnedObjects: 8,
    maximumOperationsPerTick: 40,
    maximumScheduledCallbacks: 4,
    maximumSubscriptions: 4,
    maximumSignalsPerTick: 4,
    maximumStateBytes: 256,
    maximumCallbackMilliseconds: 8,
    maximumConsecutiveFailures: 2,
  },
  model: "gpt-5.4-mini",
  providerCredential: "sk-test",
  taskRoute: "mechanic_contract_generation.primary",
};

describe("OpenAI mechanic contract provider", () => {
  it("reports usage even when structured provider output is rejected", async () => {
    const onProviderUsage = vi.fn();
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: async () =>
        Response.json({
          id: "resp_contract_invalid",
          model: "gpt-5.6-luna-2026-08-01",
          service_tier: "default",
          usage: {
            input_tokens: 800,
            input_tokens_details: { cached_tokens: 50 },
            output_tokens: 100,
            total_tokens: 900,
          },
          output: [],
        }),
    });

    await expect(
      provider({ ...providerInput, onProviderUsage })
    ).rejects.toMatchObject({
      evidence: { code: "invalid_provider_output" },
    });

    expect(onProviderUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        responseId: "resp_contract_invalid",
        model: "gpt-5.6-luna-2026-08-01",
        usage: {
          inputTokens: 800,
          cachedInputTokens: 50,
          cacheWriteInputTokens: 0,
          outputTokens: 100,
          totalTokens: 900,
        },
      })
    );
  });

  it("requests only a structured Generated Mechanic Contract", async () => {
    const candidate = {
      schemaVersion: "generated-mechanic-contract/v1",
      id: "generation_run_contract_contract_initial_1",
    };
    const requests: { input: RequestInfo | URL; init?: RequestInit }[] = [];
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: async (input, init) => {
        requests.push({ input, init });
        return new Response(
          JSON.stringify({
            output: [
              {
                type: "function_call",
                name: "return_generated_mechanic_contract",
                arguments: JSON.stringify(candidate),
              },
            ],
          }),
          { status: 200 }
        );
      },
      timeoutMs: 100,
    });

    await expect(
      provider({
        ...providerInput,
        generationAttempt: {
          generationRunId: "generation_run_contract",
          stage: "contract",
          attemptNumber: 1,
          kind: "initial",
          candidateArtifactId:
            "generation_run_contract_contract_initial_1",
        },
      })
    ).resolves.toEqual(candidate);
    expect(requests).toHaveLength(1);
    expect(String(requests[0].input)).toBe(
      "https://api.openai.com/v1/responses"
    );

    const body = JSON.parse(String(requests[0].init?.body));
    expect(body).toMatchObject({
      model: "gpt-5.4-mini",
      parallel_tool_calls: false,
      tool_choice: {
        type: "function",
        name: "return_generated_mechanic_contract",
      },
      tools: [
        {
          type: "function",
          name: "return_generated_mechanic_contract",
          strict: true,
          parameters: {
            type: "object",
            additionalProperties: false,
          },
        },
      ],
    });
    expect(body.tools[0].parameters.properties).not.toHaveProperty(
      "intentLineage"
    );
    expect(body.tools[0].parameters.required).not.toContain("intentLineage");
    expect(JSON.stringify(body.tools[0].parameters)).not.toContain('"oneOf"');
    expect(JSON.stringify(body.tools[0].parameters)).not.toContain('"const"');
    expect(
      body.tools[0].parameters.properties.privateState.items.properties
        .initialValue
    ).toEqual({
      anyOf: [
        { type: "boolean" },
        { type: "number" },
        { type: "string" },
        { type: "null" },
      ],
    });
    expect(findSchemaNodesWithoutExplicitShape(body.tools[0].parameters)).toEqual(
      []
    );
    expect(body.instructions).toContain(JSON.stringify(intent, null, 2));
    expect(body.instructions).toContain(
      "Required top-level candidate artifact ID: generation_run_contract_contract_initial_1"
    );
    expect(body.instructions).not.toMatch(/projectile|hazard|proximity/i);
    expect(body.input).toEqual([
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Generate the admitted mechanic's contract.",
          },
        ],
      },
    ]);
  });

  it("rejects a structured contract with a mismatched attempt candidate ID", async () => {
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: async () =>
        Response.json({
          output: [
            {
              type: "function_call",
              name: "return_generated_mechanic_contract",
              arguments: JSON.stringify({
                schemaVersion: "generated-mechanic-contract/v1",
                id: "reused_contract_candidate",
              }),
            },
          ],
        }),
    });

    await expect(
      provider({
        ...providerInput,
        generationAttempt: {
          generationRunId: "generation_run_contract",
          stage: "contract",
          attemptNumber: 2,
          kind: "repair",
          candidateArtifactId:
            "generation_run_contract_contract_repair_2",
          repair: {
            trigger: "stage_failure",
            failureAttemptId: "generation_run_contract_contract_1",
            issues: [
              {
                path: "bindings",
                code: "missing_entity_binding",
                message: "Declare at least one entity binding.",
              },
            ],
            invalidatedArtifactIds: [
              "generation_run_contract_contract_initial_1",
            ],
          },
        },
      })
    ).rejects.toMatchObject({
      name: "MechanicContractGenerationProviderError",
      evidence: {
        code: "invalid_provider_output",
        issues: [
          expect.objectContaining({
            message: expect.stringContaining(
              "did not use the required attempt candidate ID"
            ),
          }),
        ],
      },
    });
  });

  it("returns stage-specific evidence when the provider times out", async () => {
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        }),
      timeoutMs: 1,
    });

    await expect(provider(providerInput)).rejects.toMatchObject({
      name: "MechanicContractGenerationProviderError",
      evidence: {
        stage: "contract_generation",
        code: "provider_timeout",
        issues: [
          {
            path: "provider",
            code: "provider_timeout",
            message:
              "OpenAI generation timed out while creating the Generated Mechanic Contract.",
          },
        ],
      },
    });
  });

  it("keeps the timeout active while the provider response body is consumed", async () => {
    vi.useFakeTimers();
    let markBodyReadStarted: (() => void) | undefined;
    const bodyReadStarted = new Promise<void>((resolve) => {
      markBodyReadStarted = resolve;
    });
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: async (_input, init) =>
        ({
          ok: true,
          status: 200,
          json: () => {
            markBodyReadStarted?.();
            return new Promise((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true }
              );
            });
          },
        }) as Response,
      timeoutMs: 5,
    });

    try {
      const outcomePromise = provider(providerInput).catch((error) => error);
      await bodyReadStarted;
      await vi.advanceTimersByTimeAsync(5);
      const outcome = await Promise.race([
        outcomePromise,
        Promise.resolve("still_pending"),
      ]);

      expect(outcome).toMatchObject({
        name: "MechanicContractGenerationProviderError",
        evidence: {
          stage: "contract_generation",
          code: "provider_timeout",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("honors caller cancellation separately from provider timeout", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                type: "function_call",
                name: "return_generated_mechanic_contract",
                arguments: "{}",
              },
            ],
          }),
          { status: 200 }
        ),
      timeoutMs: 100,
    });

    await expect(
      provider({ ...providerInput, signal: controller.signal })
    ).rejects.toMatchObject({
      name: "MechanicContractGenerationProviderError",
      evidence: {
        stage: "contract_generation",
        code: "provider_cancelled",
        issues: [
          {
            path: "provider",
            code: "provider_cancelled",
            message: "Generated Mechanic Contract creation was cancelled.",
          },
        ],
      },
    });
  });

  it("honors caller cancellation while the response body is consumed", async () => {
    const controller = new AbortController();
    let markBodyReadStarted: (() => void) | undefined;
    const bodyReadStarted = new Promise<void>((resolve) => {
      markBodyReadStarted = resolve;
    });
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: async (_input, init) =>
        ({
          ok: true,
          status: 200,
          json: () => {
            markBodyReadStarted?.();
            return new Promise((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true }
              );
            });
          },
        }) as Response,
      timeoutMs: 100,
    });

    const outcomePromise = provider({
      ...providerInput,
      signal: controller.signal,
    });
    await bodyReadStarted;
    controller.abort();

    await expect(outcomePromise).rejects.toMatchObject({
      name: "MechanicContractGenerationProviderError",
      evidence: {
        stage: "contract_generation",
        code: "provider_cancelled",
      },
    });
  });

  it("returns exact contract-generation evidence for malformed structured output", async () => {
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: async () =>
        new Response(JSON.stringify({ output: [{ type: "message" }] }), {
          status: 200,
        }),
      timeoutMs: 100,
    });

    await expect(provider(providerInput)).rejects.toMatchObject({
      name: "MechanicContractGenerationProviderError",
      evidence: {
        stage: "contract_generation",
        code: "invalid_provider_output",
        issues: [
          {
            path: "provider",
            code: "invalid_provider_output",
            message: "OpenAI did not return a Generated Mechanic Contract.",
          },
        ],
      },
    });
  });

  it("preserves provider response failures as contract-generation evidence", async () => {
    const provider = createOpenAiMechanicContractProvider({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({ error: { message: "Provider unavailable." } }),
          { status: 503 }
        ),
      timeoutMs: 100,
    });

    await expect(provider(providerInput)).rejects.toMatchObject({
      name: "MechanicContractGenerationProviderError",
      evidence: {
        stage: "contract_generation",
        code: "provider_failure",
        issues: [
          {
            path: "provider",
            code: "provider_failure",
            message: "Provider unavailable.",
          },
        ],
      },
    });
  });
});

function findSchemaNodesWithoutExplicitShape(
  schema: Record<string, unknown>,
  path = "$"
): string[] {
  const missingPaths =
    Object.hasOwn(schema, "type") ||
    Object.hasOwn(schema, "anyOf") ||
    Object.hasOwn(schema, "enum") ||
    Object.hasOwn(schema, "$ref")
      ? []
      : [path];
  const properties = isRecord(schema.properties) ? schema.properties : {};

  for (const [key, child] of Object.entries(properties)) {
    if (isRecord(child)) {
      missingPaths.push(
        ...findSchemaNodesWithoutExplicitShape(child, `${path}.properties.${key}`)
      );
    }
  }

  if (isRecord(schema.items)) {
    missingPaths.push(
      ...findSchemaNodesWithoutExplicitShape(schema.items, `${path}.items`)
    );
  }

  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((child, index) => {
      if (isRecord(child)) {
        missingPaths.push(
          ...findSchemaNodesWithoutExplicitShape(
            child,
            `${path}.anyOf.${index}`
          )
        );
      }
    });
  }

  return missingPaths;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
