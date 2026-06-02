import { describe, expect, it } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { createSpecGenerationPostHandler } from "./spec-generation-route-handler";
import { SpecGenerationProviderError } from "./spec-generation-service";

describe("Spec Generation API route contract", () => {
  it("returns a validated spec response from a stubbed provider", async () => {
    const fixture = getFirstValidTopDownGameSpecFixture();
    const providerCalls: unknown[] = [];
    const post = createSpecGenerationPostHandler({
      env: {},
      provider: async (input) => {
        providerCalls.push(input);
        return fixture;
      },
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "  Make a tiny top-down collection game.  ",
        openAiApiKey: "sk-test",
        openAiModel: "gpt-5.4-mini",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(providerCalls).toEqual([
      {
        prompt: "Make a tiny top-down collection game.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        taskRoute: "spec_generation.primary",
      },
    ]);
    expect(payload).toEqual({
      ok: true,
      spec: fixture,
      metadata: {
        taskRoute: "spec_generation.primary",
        model: "gpt-5.4-mini",
        attemptCount: 1,
      },
    });
  });

  it("accepts the existing keyword-based API key input path", async () => {
    const fixture = getFirstValidTopDownGameSpecFixture();
    const providerCalls: unknown[] = [];
    const post = createSpecGenerationPostHandler({
      env: {
        KEYWORD_ARCADE_LAB: "sk-keyword",
      },
      provider: async (input) => {
        providerCalls.push(input);
        return fixture;
      },
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
        openAiKeyword: "arcade lab",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(providerCalls).toEqual([
      expect.objectContaining({
        providerCredential: "sk-keyword",
      }),
    ]);
    expect(payload).toMatchObject({
      ok: true,
      metadata: {
        taskRoute: "spec_generation.primary",
        model: "gpt-5.4-mini",
        attemptCount: 1,
      },
    });
  });

  it("returns a repaired spec response when one invalid candidate is corrected", async () => {
    const invalidCandidate = getMutableFixture();
    invalidCandidate.mechanics[0].entityIds = ["entity_missing"];
    const repairedCandidate = getFirstValidTopDownGameSpecFixture();
    const providerCalls: unknown[] = [];
    const post = createSpecGenerationPostHandler({
      env: {},
      provider: async (input) => {
        providerCalls.push(input);

        return input.repairContext ? repairedCandidate : invalidCandidate;
      },
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
        openAiApiKey: "sk-test",
        openAiModel: "gpt-5.4-mini",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      spec: repairedCandidate,
      metadata: {
        taskRoute: "spec_generation.primary",
        model: "gpt-5.4-mini",
        attemptCount: 2,
        repairStatus: "repaired",
      },
    });
    expect(providerCalls).toHaveLength(2);
    expect(providerCalls[1]).toMatchObject({
      repairContext: {
        failedAttempt: 1,
        invalidCandidate,
        stage: "semantic_validation",
        validationIssues: [
          {
            path: "mechanics.mechanic_player_movement.entityIds",
            message: 'Unknown entity ID "entity_missing".',
          },
        ],
      },
    });
  });

  it("returns structured validation failure without sending invalid specs to the editor", async () => {
    const invalidCandidate = getMutableFixture();
    invalidCandidate.template.config.scenes[0].layout.pickupZones = [];
    const post = createSpecGenerationPostHandler({
      env: {},
      includeDebugCandidate: true,
      provider: async () => invalidCandidate,
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
        openAiApiKey: "sk-test",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      ok: false,
      userMessage: expect.any(String),
      stage: "mechanic_validation",
      taskRoute: "spec_generation.primary",
      attemptCount: 2,
      debugCandidate: invalidCandidate,
    });
    expect(payload.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "mechanics.mechanic_pickup_collection.assetIds",
          message:
            "Expected a referenced pickup asset to be placed in a pickup zone.",
        }),
      ])
    );
  });

  it("uses the local debug generation adapter without an OpenAI key in development", async () => {
    const productionProvider = async () => getFirstValidTopDownGameSpecFixture();
    const post = createSpecGenerationPostHandler({
      env: {
        AICADE_DEBUG_SPEC_GENERATION_FAILURE: "missing_entity_reference",
        NODE_ENV: "development",
      },
      includeDebugCandidate: true,
      provider: productionProvider,
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      ok: false,
      stage: "semantic_validation",
      taskRoute: "spec_generation.primary",
      attemptCount: 2,
      debugCandidate: expect.objectContaining({
        originalPrompt: "Make a tiny top-down collection game.",
      }),
    });
    expect(payload.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "mechanics.mechanic_player_movement.entityIds",
        }),
      ])
    );
  });

  it("uses the local debug success adapter without an OpenAI key in development", async () => {
    let providerCallCount = 0;
    const post = createSpecGenerationPostHandler({
      env: {
        AICADE_DEBUG_SPEC_GENERATION_SUCCESS: "1",
        NODE_ENV: "development",
      },
      includeDebugCandidate: true,
      provider: async () => {
        providerCallCount += 1;
        return getFirstValidTopDownGameSpecFixture();
      },
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(providerCallCount).toBe(0);
    expect(payload).toMatchObject({
      ok: true,
      metadata: {
        taskRoute: "spec_generation.primary",
        attemptCount: 1,
      },
      spec: {
        originalPrompt: "Make a tiny top-down collection game.",
      },
    });
  });

  it("rejects the local debug generation adapter in production", async () => {
    let providerCallCount = 0;
    const post = createSpecGenerationPostHandler({
      env: {
        AICADE_DEBUG_SPEC_GENERATION_FAILURE: "missing_entity_reference",
        NODE_ENV: "production",
      },
      includeDebugCandidate: false,
      provider: async () => {
        providerCallCount += 1;
        return getFirstValidTopDownGameSpecFixture();
      },
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
        openAiApiKey: "sk-test",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(providerCallCount).toBe(0);
    expect(payload).toEqual({
      ok: false,
      userMessage: "Debug Spec Generation is disabled in production.",
      stage: "configuration",
      validationIssues: [],
      taskRoute: "spec_generation.primary",
      attemptCount: 0,
    });
  });

  it("omits debug candidate output when debug details are disabled", async () => {
    const invalidCandidate = getMutableFixture();
    invalidCandidate.mechanics[0].type = "teleport_player";
    const post = createSpecGenerationPostHandler({
      env: {},
      includeDebugCandidate: false,
      provider: async () => invalidCandidate,
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
        openAiApiKey: "sk-test",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload).toMatchObject({
      ok: false,
      stage: "mechanic_validation",
      taskRoute: "spec_generation.primary",
      attemptCount: 2,
    });
    expect(payload).not.toHaveProperty("debugCandidate");
  });

  it("returns bad-request failure for malformed JSON", async () => {
    const post = createSpecGenerationPostHandler({
      env: {},
      provider: async () => getFirstValidTopDownGameSpecFixture(),
    });

    const response = await post(
      new Request("http://localhost/api/spec-generation", {
        method: "POST",
        body: "{bad",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      ok: false,
      userMessage: "I couldn't read that generation request. Please try again.",
      stage: "bad_request",
      validationIssues: [],
      taskRoute: "spec_generation.primary",
      attemptCount: 0,
    });
  });

  it("returns configuration failure when no API key can be resolved", async () => {
    const post = createSpecGenerationPostHandler({
      env: {},
      provider: async () => getFirstValidTopDownGameSpecFixture(),
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      ok: false,
      userMessage:
        "Missing OpenAI API key. Enter a key, enter a configured keyword, or add OPENAI_API_KEY to .env.local.",
      stage: "configuration",
      validationIssues: [],
      taskRoute: "spec_generation.primary",
      attemptCount: 0,
    });
  });

  it("returns model-generation failure when the provider request fails", async () => {
    const post = createSpecGenerationPostHandler({
      env: {},
      provider: async () => {
        throw new Error("Provider failed.");
      },
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
        openAiApiKey: "sk-test",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      ok: false,
      userMessage:
        "I couldn't design a game plan from that prompt. Please try again.",
      stage: "model_generation",
      validationIssues: [],
      taskRoute: "spec_generation.primary",
      attemptCount: 1,
    });
  });

  it("includes downstream OpenAI debug details on development 502 responses", async () => {
    const post = createSpecGenerationPostHandler({
      env: {},
      includeDebugCandidate: true,
      provider: async () => {
        throw new SpecGenerationProviderError("OpenAI rejected the request.", {
          code: "invalid_json_schema",
          message: "OpenAI rejected the request.",
          param: "tools[0].parameters",
          provider: "openai",
          requestId: "req_debug_123",
          status: 400,
          type: "invalid_request_error",
        });
      },
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Make a tiny top-down collection game.",
        openAiApiKey: "sk-test",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      ok: false,
      stage: "model_generation",
      debugProviderError: {
        code: "invalid_json_schema",
        message: "OpenAI rejected the request.",
        param: "tools[0].parameters",
        provider: "openai",
        requestId: "req_debug_123",
        status: 400,
        type: "invalid_request_error",
      },
    });
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/spec-generation", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function getMutableFixture() {
  return structuredClone(getFirstValidTopDownGameSpecFixture());
}
