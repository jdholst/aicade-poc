import { afterEach, describe, expect, it, vi } from "vitest";

import { OPENAI_RESPONSES_URL } from "@/constants";
import { topDownMechanicRegistry } from "@/game-spec";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { requestTopDownGameSpecFromProvider } from "./spec-generation-provider";
import {
  allowedTopDownSpecGenerationMechanics,
  topDownGameSpecJsonSchema,
} from "./spec-generation-schema";
import { TOP_DOWN_SPEC_GENERATION_GUIDE } from "./spec-generation-guide";
import { SpecGenerationProviderError } from "./spec-generation-outcome";

describe("Spec Generation provider request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a narrow TopDownGameSpec through the spec_generation task route", async () => {
    const fixture = getFirstValidTopDownGameSpecFixture();
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json({
        output: [
          {
            type: "function_call",
            name: "return_top_down_game_spec",
            arguments: JSON.stringify(fixture),
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const result = await requestTopDownGameSpecFromProvider({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      taskRoute: "spec_generation.primary",
    });

    expect(result).toEqual(fixture);
    expect(fetchSpy).toHaveBeenCalledWith(
      OPENAI_RESPONSES_URL,
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: "Bearer sk-test",
          "Content-Type": "application/json",
        },
      })
    );

    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: "gpt-5.4-mini",
      parallel_tool_calls: false,
      tool_choice: {
        type: "function",
        name: "return_top_down_game_spec",
      },
      tools: [
        expect.objectContaining({
          type: "function",
          name: "return_top_down_game_spec",
          strict: true,
        }),
      ],
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Make a tiny top-down collection game.",
            },
          ],
        },
      ],
    });
    expect(requestBody.instructions).toContain("spec_generation.primary");
    expect(requestBody.instructions).toContain("TopDownGameSpec");
    expect(requestBody.instructions).toContain("template_top_down");
    expect(requestBody.instructions).toContain("Do not generate Phaser source");
    expect(requestBody.instructions).toContain(
      "Every non-player entity that must be visible, observed, bound, targeted, or affected at runtime must appear in entityIds of an allowed active mechanic"
    );
    expect(requestBody.instructions).toContain(
      "A spawn-zone reference alone does not create a usable Phaser handle"
    );
    expect(requestBody.instructions).not.toContain(
      "TEMPORARY VALIDATION FAILURE TEST"
    );
    expect(requestBody.instructions).not.toContain(
      "intentionally make semantic validation fail"
    );
    expect(JSON.stringify(requestBody.tools[0].parameters)).toContain(
      "template_top_down"
    );
    expect(JSON.stringify(requestBody.tools[0].parameters)).not.toContain(
      "moduleSourceTs"
    );
  });

  it("includes the invalid candidate and exact validation issues in repair requests", async () => {
    const fixture = getFirstValidTopDownGameSpecFixture();
    const invalidCandidate = structuredClone(fixture);
    invalidCandidate.mechanics[0].entityIds = ["entity_missing"];
    const validationIssues = [
      {
        path: "mechanics.mechanic_player_movement.entityIds",
        message: 'Unknown entity ID "entity_missing".',
        code: "unknown_reference",
      },
    ];
    const fetchSpy = vi.fn().mockResolvedValue(
      Response.json({
        output: [
          {
            type: "function_call",
            name: "return_top_down_game_spec",
            arguments: JSON.stringify(fixture),
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    await requestTopDownGameSpecFromProvider({
      prompt: "Make a tiny top-down collection game.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-test",
      taskRoute: "spec_generation.primary",
      repairContext: {
        failedAttempt: 1,
        invalidCandidate,
        stage: "semantic_validation",
        validationIssues,
      },
    });

    const requestBody = JSON.parse(fetchSpy.mock.calls[0][1].body);

    expect(requestBody.instructions).toContain("Repair attempt 2");
    expect(requestBody.instructions).toContain(
      "Make a tiny top-down collection game."
    );
    expect(requestBody.instructions).toContain(
      JSON.stringify(invalidCandidate, null, 2)
    );
    expect(requestBody.instructions).toContain(
      JSON.stringify(validationIssues, null, 2)
    );
    expect(requestBody.instructions).toContain(
      "Fix references and config while preserving the creator's game intent"
    );
  });

  it("keeps the guide and schema aligned with registered top-down mechanics", () => {
    const registeredMechanics = new Set(
      topDownMechanicRegistry.map((mechanic) => mechanic.type)
    );

    for (const mechanic of allowedTopDownSpecGenerationMechanics) {
      expect(registeredMechanics.has(mechanic)).toBe(true);
      expect(TOP_DOWN_SPEC_GENERATION_GUIDE).toContain(mechanic);
    }

    expect(
      JSON.stringify(topDownGameSpecJsonSchema.properties.mechanics)
    ).toContain("player_movement");
    expect(
      JSON.stringify(topDownGameSpecJsonSchema.properties.mechanics)
    ).toContain("pickup_collection");
  });

  it("keeps the hand-authored schema inside the strict Structured Outputs subset", () => {
    const serializedSchema = JSON.stringify(topDownGameSpecJsonSchema);

    expect(serializedSchema).not.toContain('"oneOf"');
    expect(serializedSchema).not.toContain('"allOf"');
    expect(serializedSchema).not.toContain('"not"');
    expect(serializedSchema).not.toContain('"additionalProperties":true');
  });

  it("throws a provider error when OpenAI does not return the tool call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          output: [
            {
              type: "message",
              content: "not a tool call",
            },
          ],
        })
      )
    );

    await expect(
      requestTopDownGameSpecFromProvider({
        prompt: "Make a tiny top-down collection game.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        taskRoute: "spec_generation.primary",
      })
    ).rejects.toThrow("OpenAI did not return a top-down Game Spec.");
  });

  it("throws a provider error when the tool arguments are not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          output: [
            {
              type: "function_call",
              name: "return_top_down_game_spec",
              arguments: "{bad",
            },
          ],
        })
      )
    );

    await expect(
      requestTopDownGameSpecFromProvider({
        prompt: "Make a tiny top-down collection game.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        taskRoute: "spec_generation.primary",
      })
    ).rejects.toThrow(
      "OpenAI returned invalid JSON for the top-down Game Spec."
    );
  });

  it("throws the provider error message when OpenAI returns a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              message: "Model rejected the request.",
            },
          },
          {
            status: 400,
          }
        )
      )
    );

    await expect(
      requestTopDownGameSpecFromProvider({
        prompt: "Make a tiny top-down collection game.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        taskRoute: "spec_generation.primary",
      })
    ).rejects.toThrow("Model rejected the request.");
  });

  it("preserves structured OpenAI error details for route debugging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              message: "Invalid schema for response_format.",
              type: "invalid_request_error",
              code: "invalid_json_schema",
              param: "tools[0].parameters",
            },
          },
          {
            headers: {
              "x-request-id": "req_debug_123",
            },
            status: 400,
          }
        )
      )
    );

    await expect(
      requestTopDownGameSpecFromProvider({
        prompt: "Make a tiny top-down collection game.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-test",
        taskRoute: "spec_generation.primary",
      })
    ).rejects.toMatchObject({
      details: {
        code: "invalid_json_schema",
        message: "Invalid schema for response_format.",
        param: "tools[0].parameters",
        provider: "openai",
        requestId: "req_debug_123",
        status: 400,
        type: "invalid_request_error",
      },
    } satisfies Partial<SpecGenerationProviderError>);
  });
});
