import { describe, expect, it, vi } from "vitest";

import {
  adaptPlanningFixture,
  adaptGeneratedMechanicFixture,
  resolveProviderRequest,
} from "./lib/fixture-adapter.mjs";
import {
  productionBuildArguments,
  resolveInterceptedRoute,
  summarizeAttemptFailure,
} from "./lib/browser-runner.mjs";

const request = {
  schemaVersion: "generated_mechanic_provider_request/v1",
  generationRunId: "generation_run_live_12345678",
  stage: "contract",
  attempt: 2,
  attemptKind: "repair",
  providerConfig: { openAiKeyword: "secret phrase", openAiModel: "gpt-5.6-luna" },
  stageInput: {
    intent: { id: "live_intent" },
  },
};

const capturedContractFixture = {
  schemaVersion: "generated_mechanic_provider_response/v1",
  ok: true,
  generationRunId: "generation_run_captured_12345678",
  stage: "contract",
  attempt: 1,
  attemptKind: "initial",
  candidate: {
    schemaVersion: "generated_mechanic_contract_candidate/v1",
    id: "generation_run_captured_12345678_contract_initial_1",
    intentId: "captured_intent",
    behavior: {},
  },
};

describe("fixture correlation", () => {
  it("rewrites planning correlation and prompt fields from the live request", () => {
    const adapted = adaptPlanningFixture(
      {
        enteredPrompt: "Live projectile wording",
        generationRunId: "generation_run_live_12345678",
      },
      {
        ok: true,
        spec: { id: "fixture", originalPrompt: "Captured wording" },
        metadata: { generationRunId: "generation_run_captured_12345678" },
        routing: {
          kind: "generated_mechanic",
          generationRunId: "generation_run_captured_12345678",
        },
      }
    );

    expect(adapted).toMatchObject({
      spec: { originalPrompt: "Live projectile wording" },
      metadata: { generationRunId: "generation_run_live_12345678" },
      routing: { generationRunId: "generation_run_live_12345678" },
    });
  });

  it("rewrites response and contract candidate identity from the live request", () => {
    const adapted = adaptGeneratedMechanicFixture(
      request,
      capturedContractFixture
    );

    expect(adapted).toMatchObject({
      generationRunId: "generation_run_live_12345678",
      stage: "contract",
      attempt: 2,
      attemptKind: "repair",
      candidate: {
        id: "generation_run_live_12345678_contract_repair_2",
        intentId: "live_intent",
      },
    });
  });

  it("rewrites a source fixture to the live contract lineage", () => {
    const sourceRequest = {
      ...request,
      stage: "source",
      stageInput: {
        intent: { id: "live_intent" },
        contract: { id: "generation_run_live_12345678_contract_initial_1" },
      },
    };
    const adapted = adaptGeneratedMechanicFixture(sourceRequest, {
      ...capturedContractFixture,
      stage: "source",
      candidate: {
        schemaVersion: "generated_mechanic_source_candidate/v1",
        id: "generation_run_captured_12345678_source_initial_1",
        contractId: "generation_run_captured_12345678_contract_initial_1",
        callbacks: [],
      },
    });

    expect(adapted.candidate).toMatchObject({
      id: "generation_run_live_12345678_source_repair_2",
      contractId: "generation_run_live_12345678_contract_initial_1",
    });
  });
});

describe("provider request resolution", () => {
  it("uses the project's normal production build in linked campaign worktrees", () => {
    expect(productionBuildArguments()).toEqual(["run", "build"]);
  });

  it("summarizes the latest artifact-repair issue before older planning issues", () => {
    const summary = summarizeAttemptFailure(
      {
        attempts: [
          { validation: { issues: [{ message: "Older planning issue" }] } },
        ],
        artifactScopedRepair: {
          attempts: [
            { issues: [{ message: "Initial source issue" }] },
            { issues: [{ message: "Latest source issue" }] },
          ],
        },
      },
      "terminal text",
      { assertions: [] }
    );

    expect(summary).toBe("Latest source issue");
  });

  it("continues actual browser requests without replacing their same-origin metadata", async () => {
    const requestObject = {
      headers: () => ({
        origin: "http://127.0.0.1:3121",
        "sec-fetch-site": "same-origin",
      }),
      postDataJSON: () => ({ enteredPrompt: "hello" }),
      url: () => "http://127.0.0.1:3121/api/creator-generation-planning",
    };
    const route = {
      request: () => requestObject,
      continue: vi.fn(async () => undefined),
      fetch: vi.fn(),
      fulfill: vi.fn(),
    };
    const actualResponseCaptures = new Map();
    const networkCaptures = [];

    await resolveInterceptedRoute({
      route,
      stage: "planning",
      mode: "actual",
      providerCalls: { planning: 0, contract: 0, source: 0 },
      fixtureCalls: { planning: 0, contract: 0, source: 0 },
      networkCaptures,
      actualResponseCaptures,
    });

    expect(route.continue).toHaveBeenCalledOnce();
    expect(route.continue).toHaveBeenCalledWith({
      headers: {
        origin: "http://127.0.0.1:3121",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(route.fetch).not.toHaveBeenCalled();
    expect(actualResponseCaptures.get(requestObject)).toBe(networkCaptures[0]);
    expect(networkCaptures[0]).toMatchObject({
      stage: "planning",
      source: "actual",
      requestHeaders: {
        origin: "http://127.0.0.1:3121/",
        "sec-fetch-site": "same-origin",
      },
    });
  });

  it("blocks an actual request before upstream forwarding when the loop stage ceiling is reached", async () => {
    const route = {
      request: () => ({
        headers: () => ({}),
        postDataJSON: () => ({ enteredPrompt: "hello" }),
        url: () => "http://127.0.0.1:3121/api/creator-generation-planning",
      }),
      continue: vi.fn(),
      fulfill: vi.fn(async () => undefined),
    };
    const providerCalls = { planning: 0, contract: 0, source: 0 };
    const networkCaptures = [];

    const result = await resolveInterceptedRoute({
      route,
      stage: "planning",
      mode: "actual",
      providerCalls,
      fixtureCalls: { planning: 0, contract: 0, source: 0 },
      networkCaptures,
      actualResponseCaptures: new Map(),
      providerCallBudget: {
        consume: vi.fn(async () => false),
      },
    });

    expect(result).toEqual({ blocked: true, stage: "planning" });
    expect(providerCalls.planning).toBe(0);
    expect(route.continue).not.toHaveBeenCalled();
    expect(route.fulfill).toHaveBeenCalledWith({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        error: "provider_call_budget_exhausted",
        stage: "planning",
      }),
    });
    expect(networkCaptures[0]).toMatchObject({
      stage: "planning",
      source: "blocked",
      reason: "provider_call_budget_exhausted",
    });
  });

  it("fulfills planning from a fixture without making an upstream call", async () => {
    const fetchActual = vi.fn();
    const fixture = { ok: true, spec: { id: "fixture" }, routing: { kind: "generated_mechanic" } };

    const result = await resolveProviderRequest({
      stage: "planning",
      mode: "fixture",
      requestBody: { enteredPrompt: "hello" },
      fixture,
      fetchActual,
    });

    expect(fetchActual).not.toHaveBeenCalled();
    expect(result).toEqual({
      source: "fixture",
      body: {
        ...fixture,
        spec: { ...fixture.spec, originalPrompt: "hello" },
      },
      status: 200,
    });
  });

  it("passes contract and source requests through exactly once in actual mode", async () => {
    const fetchActual = vi.fn(async (stage) => ({
      status: 200,
      body: { ok: true, stage },
    }));

    const contract = await resolveProviderRequest({
      stage: "contract",
      mode: "actual",
      requestBody: request,
      fetchActual,
    });
    const source = await resolveProviderRequest({
      stage: "source",
      mode: "actual",
      requestBody: { ...request, stage: "source" },
      fetchActual,
    });

    expect(fetchActual).toHaveBeenNthCalledWith(1, "contract");
    expect(fetchActual).toHaveBeenNthCalledWith(2, "source");
    expect(contract.source).toBe("actual");
    expect(source.source).toBe("actual");
  });

  it("supports planning-plus-contract isolation while leaving source actual", async () => {
    const fetchActual = vi.fn(async (stage) => ({
      status: 200,
      body: { ok: true, stage },
    }));

    const planning = await resolveProviderRequest({
      stage: "planning",
      mode: "fixture",
      requestBody: { enteredPrompt: "hello" },
      fixture: { ok: true, spec: {}, routing: {} },
      fetchActual,
    });
    const contract = await resolveProviderRequest({
      stage: "contract",
      mode: "fixture",
      requestBody: request,
      fixture: capturedContractFixture,
      fetchActual,
    });
    const source = await resolveProviderRequest({
      stage: "source",
      mode: "actual",
      requestBody: { ...request, stage: "source" },
      fetchActual,
    });

    expect(fetchActual).toHaveBeenCalledTimes(1);
    expect(fetchActual).toHaveBeenCalledWith("source");
    expect([planning.source, contract.source, source.source]).toEqual([
      "fixture",
      "fixture",
      "actual",
    ]);
  });
});
