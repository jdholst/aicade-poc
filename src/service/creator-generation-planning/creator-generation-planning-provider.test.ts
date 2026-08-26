import { describe, expect, it, vi } from "vitest";

import { OPENAI_RESPONSES_URL } from "@/constants";
import { getFirstValidTopDownGameSpecFixture } from "@/runtime/phaser/top-down-game-spec-fixture";

import { createOpenAiCreatorGenerationPlanProvider } from "./creator-generation-planning-provider";

describe("OpenAI creator-generation planning provider", () => {
  it("requests one combined spec-and-intent tool call without exposing the credential in its payload", async () => {
    const envelope = {
      gameSpec: getFirstValidTopDownGameSpecFixture(),
      mechanicIntent: createTransportIntent(),
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        output: [
          {
            type: "function_call",
            name: "return_top_down_creator_generation_plan",
            arguments: JSON.stringify(envelope),
          },
        ],
      })
    );
    const provider = createOpenAiCreatorGenerationPlanProvider({ fetchImpl });

    await expect(
      provider({
        prompt: "Make a crystal arena with reversible movement.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-secret",
        taskRoute: "spec_generation.primary",
        availableCapabilities: ["object_read", "object_motion_write"],
      })
    ).resolves.toEqual(envelope);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      OPENAI_RESPONSES_URL,
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: "Bearer sk-secret",
          "Content-Type": "application/json",
        },
      })
    );

    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({
      parallel_tool_calls: false,
      tool_choice: {
        type: "function",
        name: "return_top_down_creator_generation_plan",
      },
      tools: [
        expect.objectContaining({
          name: "return_top_down_creator_generation_plan",
          strict: true,
        }),
      ],
    });
    expect(requestBody.instructions).toContain("spec_generation.primary");
    expect(requestBody.instructions).toContain(
      "complete TopDownGameSpec in gameSpec"
    );
    expect(requestBody.instructions).toContain(
      '"availableOnSelectedHost": true'
    );
    expect(requestBody.instructions).toContain(
      '"supportedGeneratedTriggerIds": [\n    "logical_action"\n  ]'
    );
    expect(requestBody.instructions).toContain(
      '"requiredIndependentEffectCapability": "object_motion_write"'
    );
    expect(requestBody.instructions).toContain(
      '"requiredInputConnection": "exactly one input connection whose port is an exact active gameSpec control action ID"'
    );
    expect(requestBody.instructions).toContain(
      '"requiredActorReference": "every actor must equal the role of an exact referenced gameSpec entity"'
    );
    expect(requestBody.instructions).toContain(
      '"requiredTargetReference": "every target must equal the role of an exact referenced gameSpec entity"'
    );
    expect(requestBody.instructions).toContain(
      "Every generated-host target must equal the role of an exact entity reference from gameSpec"
    );
    expect(requestBody.instructions).toContain(
      "Do not invent variants such as logical_custom_action"
    );
    expect(requestBody.instructions).toContain(
      "Infer ordinary missing gameplay details instead of requesting clarification"
    );
    expect(requestBody.instructions).toContain(
      "current movement or facing direction"
    );
    expect(requestBody.instructions).toContain(
      "bounded speed, duration, distance, count, and cooldown values"
    );
    expect(requestBody.instructions).toContain(
      "strictly greater than the center-to-center distance between the selected actor and target spawn zones"
    );
    expect(requestBody.instructions).toContain(
      "keep at least 64 pixels of interaction headroom"
    );
    expect(requestBody.instructions).toContain(
      '"minimumSpeedMultiplier": 2'
    );
    expect(requestBody.instructions).toContain(
      '"minimumExtraTravelPixels": 32'
    );
    expect(requestBody.instructions).toContain(
      '"minimumDurationMilliseconds": 150'
    );
    expect(requestBody.instructions).toContain(
      "Before returning, run this generated-host alignment checklist for every material creator-controlled behavior that is not fully covered by a built-in"
    );
    expect(requestBody.instructions).toContain(
      "If the creator requests a new player action such as shooting, add one active control to gameSpec first"
    );
    expect(requestBody.instructions).toContain(
      "Set mechanicIntent.triggers to exactly [\"logical_action\"]"
    );
    expect(requestBody.instructions).toContain(
      "Set mechanicIntent.connections to exactly one input connection using that same action ID"
    );
    expect(requestBody.instructions).toContain(
      "Do not leave the requested action only in summary, behaviors, assumptions, or configuration"
    );
    expect(requestBody.instructions).toContain(
      "When a transient owned-object interaction needs an implicit observable target"
    );
    expect(requestBody.instructions).toContain(
      "If mechanicIntent.targets is non-empty, every target token must equal the role of one referenced gameSpec entity"
    );
    expect(requestBody.instructions).toContain(
      "put its stable archetype token in mechanicIntent.ownedObjects"
    );
    expect(requestBody.instructions).toContain(
      "object_create, object_motion_write, and object_destroy"
    );
    expect(requestBody.instructions).toContain(
      "include object_read when the owned object's initial position or motion depends on a bound actor's live transform"
    );
    expect(requestBody.instructions).toContain(
      "Do not include or rewrite mechanicConnections in gameSpec for generated-mechanic planning"
    );
    expect(requestBody.instructions).toContain(
      "trusted base-game mechanic connections remain outside the generated assembly"
    );
    expect(JSON.stringify(requestBody)).not.toContain("sk-secret");
  });

  it("supplies the exact built-in coverage vocabulary without asking the provider to choose a route", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        output: [
          {
            type: "function_call",
            name: "return_top_down_creator_generation_plan",
            arguments: JSON.stringify({
              gameSpec: getFirstValidTopDownGameSpecFixture(),
              mechanicIntent: createTransportIntent(),
            }),
          },
        ],
      })
    );
    const provider = createOpenAiCreatorGenerationPlanProvider({ fetchImpl });

    await provider({
      prompt: "Let arrow keys move the player around the arena.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-secret",
      taskRoute: "spec_generation.primary",
      availableCapabilities: ["object_read", "object_motion_write"],
    });

    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    const catalogMatch = String(requestBody.instructions).match(
      /Current top-down built-in coverage vocabulary JSON:\n([\s\S]*?)\n\nMechanic capability documentation JSON:/
    );
    const catalog = JSON.parse(catalogMatch?.[1] ?? "null");

    expect(requestBody.instructions).toContain(
      "This catalog supplies exact requirement vocabulary only; deterministic routing remains Sparkline-owned."
    );
    expect(requestBody.instructions).toContain(
      "An existing movement action that triggers a new dash is only partially covered"
    );
    expect(requestBody.instructions).toContain(
      "use logical_action for that generated lifecycle and bind the exact active movement action through the input connection"
    );
    expect(catalog.map(({ mechanicType }: { mechanicType: string }) => mechanicType)).toEqual([
      "player_movement",
      "enemy_chase",
      "pickup_collection",
      "hazard_contact",
    ]);
    expect(catalog[0]).toEqual({
      mechanicType: "player_movement",
      coverage: {
        triggers: ["logical_move_action"],
        actors: ["player"],
        targets: [],
        behaviors: ["move_actor"],
        ownedObjects: [],
        stateChanges: [],
        temporalRules: [],
        spatialRules: ["remain_inside_arena"],
        constraints: [],
        configuration: [
          {
            key: "speed",
            valueType: "number",
            minimum: 1,
            maximum: 500,
          },
        ],
        connections: [{ direction: "input", port: "move_action" }],
        references: ["entity"],
        outcomes: ["actor_position_changes"],
      },
    });
  });

  it("cancels the provider fetch when the creator request aborts", async () => {
    const caller = new AbortController();
    let observedFetchSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          observedFetchSignal = init?.signal ?? undefined;
          observedFetchSignal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          );
        })
    );
    const provider = createOpenAiCreatorGenerationPlanProvider({ fetchImpl });
    const request = provider({
      prompt: "Make a crystal arena.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-secret",
      taskRoute: "spec_generation.primary",
      availableCapabilities: ["object_read"],
      signal: caller.signal,
    });

    caller.abort();

    await expect(request).rejects.toThrow(/cancelled/i);
    expect(observedFetchSignal?.aborted).toBe(true);
  });

  it("cancels while the provider response body is still loading", async () => {
    const caller = new AbortController();
    let observedFetchSignal: AbortSignal | undefined;
    let markBodyStarted: (() => void) | undefined;
    const bodyStarted = new Promise<void>((resolve) => {
      markBodyStarted = resolve;
    });
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        observedFetchSignal = init?.signal ?? undefined;
        const response = Response.json({ output: [] });
        vi.spyOn(response, "json").mockImplementation(
          () =>
            new Promise<unknown>((_resolve, reject) => {
              markBodyStarted?.();
              observedFetchSignal?.addEventListener(
                "abort",
                () => reject(new DOMException("Aborted", "AbortError")),
                { once: true }
              );
            })
        );

        return response;
      }
    );
    const provider = createOpenAiCreatorGenerationPlanProvider({ fetchImpl });
    const request = provider({
      prompt: "Make a crystal arena.",
      model: "gpt-5.4-mini",
      providerCredential: "sk-secret",
      taskRoute: "spec_generation.primary",
      availableCapabilities: ["object_read"],
      signal: caller.signal,
    });

    await bodyStarted;
    caller.abort();

    await expect(request).rejects.toThrow(/cancelled/i);
    expect(observedFetchSignal?.aborted).toBe(true);
  });

  it("times out while the provider response body is still loading", async () => {
    vi.useFakeTimers();

    try {
      let observedFetchSignal: AbortSignal | undefined;
      let markBodyStarted: (() => void) | undefined;
      const bodyStarted = new Promise<void>((resolve) => {
        markBodyStarted = resolve;
      });
      const fetchImpl = vi.fn(
        async (_url: string | URL | Request, init?: RequestInit) => {
          observedFetchSignal = init?.signal ?? undefined;
          const response = Response.json({ output: [] });
          vi.spyOn(response, "json").mockImplementation(
            () =>
              new Promise<unknown>((_resolve, reject) => {
                markBodyStarted?.();
                observedFetchSignal?.addEventListener(
                  "abort",
                  () => reject(new DOMException("Aborted", "AbortError")),
                  { once: true }
                );
              })
          );

          return response;
        }
      );
      const provider = createOpenAiCreatorGenerationPlanProvider({
        fetchImpl,
        timeoutMs: 100,
      });
      const request = provider({
        prompt: "Make a crystal arena.",
        model: "gpt-5.4-mini",
        providerCredential: "sk-secret",
        taskRoute: "spec_generation.primary",
        availableCapabilities: ["object_read"],
      });

      await bodyStarted;
      const timedOut = expect(request).rejects.toThrow(/timed out/i);
      await vi.advanceTimersByTimeAsync(100);

      await timedOut;
      expect(observedFetchSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

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
