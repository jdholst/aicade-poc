import { describe, expect, it, vi } from "vitest";

import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { createCreatorGenerationPlanningPostHandler } from "./creator-generation-planning-route-handler";

describe("Creator Generation Planning API route contract", () => {
  it("uses server-owned capabilities and provider configuration for one combined planning request", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const provider = vi.fn().mockResolvedValue({
      gameSpec: spec,
      mechanicIntent: createTransportIntent(),
    });
    const post = createCreatorGenerationPlanningPostHandler({
      availableCapabilities: ["object_read", "object_motion_write"],
      env: {
        OPENAI_API_KEY: "sk-environment",
        OPENAI_MODEL: "gpt-5.4-mini",
        NODE_ENV: "production",
      },
      provider,
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "  Make a crystal arena.  ",
        generationRunId: "generation_run_http_boundary",
        availableCapabilities: ["object_create", "signal_emit"],
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({
        availableCapabilities: ["object_read", "object_motion_write"],
        model: "gpt-5.4-mini",
        prompt: "Make a crystal arena.",
        providerCredential: "sk-environment",
        taskRoute: "spec_generation.primary",
        signal: expect.any(AbortSignal),
      })
    );
    expect(payload).toMatchObject({
      ok: true,
      spec,
      metadata: {
        generationRunId: "generation_run_http_boundary",
        taskRoute: "spec_generation.primary",
      },
      routing: {
        kind: "built_in",
        generationRunId: "generation_run_http_boundary",
        intentId: "intent_player_movement",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("sk-environment");
  });

  it("round-trips a canonical generated-host intent through the real planning router", async () => {
    const spec = getFirstValidTopDownGameSpecFixture();
    const provider = vi.fn().mockResolvedValue({
      gameSpec: spec,
      mechanicIntent: {
        id: "intent_action_dash",
        summary: "Dash the routed player after an active logical action.",
        triggers: ["logical_action"],
        actors: ["player"],
        targets: [],
        behaviors: ["action_dash"],
        ownedObjects: [],
        stateChanges: ["player_velocity_changes"],
        temporalRules: [],
        spatialRules: [],
        constraints: [],
        configuration: [{ key: "dash_speed", value: 240 }],
        connections: [{ direction: "input", port: spec.controls[0]!.action }],
        references: [{ kind: "entity", id: spec.entities[0]!.id }],
        outcomes: ["player_velocity_changes"],
        requiredCapabilities: ["object_motion_write"],
        ambiguities: [],
      },
    });
    const post = createCreatorGenerationPlanningPostHandler({
      availableCapabilities: ["object_read", "object_motion_write"],
      env: {
        OPENAI_API_KEY: "sk-environment",
        OPENAI_MODEL: "gpt-5.4-mini",
        NODE_ENV: "production",
      },
      provider,
    });

    const response = await post(
      jsonRequest({
        enteredPrompt: "Dash the player when I press the active action.",
        generationRunId: "generation_run_generated_http_boundary",
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      routing: {
        kind: "generated_mechanic",
        generationRunId: "generation_run_generated_http_boundary",
        intent: {
          id: "intent_action_dash",
          triggers: ["logical_action"],
          requiredCapabilities: ["object_motion_write"],
        },
      },
    });
  });

  it("rejects a missing GenerationRun ID before resolving provider configuration", async () => {
    const provider = vi.fn();
    const post = createCreatorGenerationPlanningPostHandler({
      availableCapabilities: ["object_read"],
      env: {},
      provider,
    });

    const response = await post(jsonRequest({ enteredPrompt: "Make a game." }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      stage: "bad_request",
      userMessage: expect.stringContaining("GenerationRun"),
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects a hostile CORS-simple text request before resolving provider configuration", async () => {
    const provider = vi.fn();
    const post = createCreatorGenerationPlanningPostHandler({
      availableCapabilities: ["object_read"],
      env: { OPENAI_API_KEY: "sk-environment" },
      provider,
    });

    const response = await post(
      new Request("http://localhost/api/creator-generation-planning", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Origin: "https://attacker.example",
          "Sec-Fetch-Site": "cross-site",
        },
        body: JSON.stringify({
          enteredPrompt: "Spend the server credential.",
          generationRunId: "generation_run_hostile_text",
        }),
      })
    );

    expect(response.status).toBe(415);
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin JSON request before resolving provider configuration", async () => {
    const provider = vi.fn();
    const post = createCreatorGenerationPlanningPostHandler({
      availableCapabilities: ["object_read"],
      env: { OPENAI_API_KEY: "sk-environment" },
      provider,
    });

    const request = jsonRequest({
      enteredPrompt: "Spend the server credential.",
      generationRunId: "generation_run_cross_origin",
    });
    request.headers.set("Origin", "https://attacker.example");
    request.headers.set("Sec-Fetch-Site", "cross-site");

    const response = await post(request);

    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects an overlong GenerationRun ID before planning", async () => {
    const provider = vi.fn();
    const post = createCreatorGenerationPlanningPostHandler({
      availableCapabilities: ["object_read"],
      env: { OPENAI_API_KEY: "sk-environment" },
      provider,
    });

    const response = await post(
      jsonRequest({ generationRunId: `a${"a".repeat(206)}` })
    );

    expect(response.status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });
});

function jsonRequest(payload: unknown) {
  return new Request("http://localhost/api/creator-generation-planning", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      "Sec-Fetch-Site": "same-origin",
    },
    body: JSON.stringify(payload),
  });
}

function createTransportIntent() {
  return {
    id: "intent_player_movement",
    summary: "Move the player with logical directional input.",
    triggers: ["logical_move_action"],
    actors: ["player"],
    targets: [],
    behaviors: ["move_actor"],
    ownedObjects: [],
    stateChanges: [],
    temporalRules: [],
    spatialRules: ["remain_inside_arena"],
    constraints: [],
    configuration: [{ key: "speed", value: 180 }],
    connections: [{ direction: "input", port: "move_action" }],
    references: [{ kind: "entity", id: "entity_player" }],
    outcomes: ["actor_position_changes"],
    requiredCapabilities: ["logical_input", "entity_motion"],
    ambiguities: [],
  };
}
