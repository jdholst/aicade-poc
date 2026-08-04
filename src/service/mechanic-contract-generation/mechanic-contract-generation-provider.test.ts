import { describe, expect, it } from "vitest";

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
  it("requests only a structured Generated Mechanic Contract", async () => {
    const candidate = {
      schemaVersion: "generated-mechanic-contract/v1",
      id: "generated_runtime_rule",
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

    await expect(provider(providerInput)).resolves.toEqual(candidate);
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
    expect(body.instructions).toContain(JSON.stringify(intent, null, 2));
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
