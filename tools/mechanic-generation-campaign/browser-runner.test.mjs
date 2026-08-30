import { describe, expect, it } from "vitest";

import {
  authorizeProviderDispatchBatch,
  CampaignInfrastructureFailureError,
  createCampaignBrowserPool,
  createCampaignActivityTracker,
  reconcileResumableRun,
  requireCampaignAttemptContinuation,
  submitCampaignPrompt,
  waitForCampaignEditorTerminalState,
} from "./lib/browser-runner.mjs";

describe("campaign browser runner", () => {
  it("assigns a separate browser process to each parallel attempt slot", async () => {
    const closed = [];
    let launched = 0;
    const pool = await createCampaignBrowserPool({
      chromium: {},
      headed: false,
      executionPolicy: {
        mode: "parallel",
        maxConcurrentAttempts: 3,
      },
      launchBrowserFn: async () => {
        const id = ++launched;
        return {
          id,
          async close() {
            closed.push(id);
          },
        };
      },
    });

    const first = pool.claim();
    const second = pool.claim();
    const third = pool.claim();
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(() => pool.claim()).toThrow(/browser process/i);
    pool.release(second);
    expect(pool.claim()).toBe(second);

    await pool.close();
    expect(launched).toBe(3);
    expect(closed.sort()).toEqual([1, 2, 3]);
  });

  it("closes isolated browser processes through their force-termination handles", async () => {
    const terminated = [];
    let launched = 0;
    const pool = await createCampaignBrowserPool({
      chromium: {},
      headed: false,
      executionPolicy: {
        mode: "parallel",
        maxConcurrentAttempts: 3,
      },
      launchBrowserFn: async () => {
        const id = ++launched;
        return {
          browser: { id },
          async close() {
            terminated.push(id);
          },
        };
      },
    });

    pool.claim();
    pool.claim();
    pool.claim();
    await pool.close();

    expect(terminated.sort()).toEqual([1, 2, 3]);
  });

  it("bounds browser-process teardown when a termination promise never settles", async () => {
    let forceKilled = false;
    const pool = await createCampaignBrowserPool({
      chromium: {},
      headed: false,
      executionPolicy: {
        mode: "sequential",
        maxConcurrentAttempts: 1,
      },
      closeTimeoutMs: 1,
      launchBrowserFn: async () => ({
        browser: { id: 1 },
        close: () => new Promise(() => {}),
        forceKill() {
          forceKilled = true;
        },
      }),
    });

    await pool.close();

    expect(forceKilled).toBe(true);
  });

  it("authorizes the bounded attempt batch before dispatch", async () => {
    const observed = [];
    const allowed = await authorizeProviderDispatchBatch(
      {
        async authorizeBatch(input) {
          observed.push(input);
          return true;
        },
      },
      [{ attemptId: "a01-baseline" }, { attemptId: "a02-baseline" }]
    );

    expect(allowed).toBe(true);
    expect(observed).toEqual([
      { attemptIds: ["a01-baseline", "a02-baseline"] },
    ]);
  });

  it("recovers durable slots and exact pending candidates after interruption", async () => {
    const pendingAttempt = {
      id: "a01-baseline",
      promptId: "baseline",
      status: "awaiting_manual_qa",
      manualQa: { id: "manual-qa-a01-baseline", path: "a01-baseline/manual-qa.json", status: "pending" },
    };
    const run = {
      id: "campaign-1",
      cohort: "repeatability",
      attemptIds: [],
      revision: { revisionKey: "a".repeat(64) },
      attemptSlots: [
        { attemptId: "a01-baseline", sequence: 1, status: "running" },
        { attemptId: "a02-baseline", sequence: 2, status: "reserved" },
      ],
      pendingManualQaQueue: [],
    };
    const store = {
      async readAttempts() {
        return [pendingAttempt];
      },
      async readManualQa() {
        return {
          id: "manual-qa-a01-baseline",
          status: "pending",
          requestedAt: "2026-08-30T12:00:00.000Z",
        };
      },
    };

    const recovered = await reconcileResumableRun(store, run);

    expect(recovered.attemptIds).toEqual(["a01-baseline"]);
    expect(recovered.attemptSlots).toEqual([
      expect.objectContaining({ attemptId: "a01-baseline", status: "awaiting_manual_qa" }),
      expect.objectContaining({ attemptId: "a02-baseline", status: "interrupted" }),
    ]);
    expect(recovered.pendingManualQaQueue).toEqual([
      expect.objectContaining({
        manualQaId: "manual-qa-a01-baseline",
        attemptId: "a01-baseline",
      }),
    ]);
  });

  it("waits for editor hydration before entering and submitting a prompt", async () => {
    const events = [];
    const page = createPromptPageDouble(events);

    await submitCampaignPrompt(page, "Build a compact arena.");

    expect(events).toEqual([
      "wait:networkidle:30000",
      "prompt:click",
      `prompt:press:${process.platform === "darwin" ? "Meta+A" : "Control+A"}`,
      "prompt:type:Build a compact arena.",
      "submit:click",
    ]);
  });

  it("recognizes the current routed generated-mechanic runtime iframe", async () => {
    installEditorDocument({
      bodyText: "Generated runtime\nRuntime is running in the sandbox.",
      iframeRoute: "/runtime/phaser-generated",
    });
    const page = createPageDouble();

    const terminal = await waitForCampaignEditorTerminalState(page, 1_000);

    expect(terminal).toEqual({
      kind: "ready",
      text: "Runtime is running in the sandbox.",
    });
  });

  it("recognizes the current runtime-ready message only when the runtime iframe is mounted", async () => {
    installEditorDocument({
      bodyText: "Generated runtime\nRuntime is running in the sandbox.",
      iframeSource: "<!doctype html><title>Generated game</title>",
    });
    const page = createPageDouble();

    const terminal = await waitForCampaignEditorTerminalState(page, 1_000);

    expect(terminal).toEqual({
      kind: "ready",
      text: "Runtime is running in the sandbox.",
    });
  });

  it("keeps waiting after project acceptance until the runtime is ready", async () => {
    installEditorDocument({
      bodyText: [
        "Ready",
        "Generated, evaluated, and accepted a playable mechanic project.",
        "Booting runtime...",
      ].join("\n"),
      iframeSource: "<!doctype html><title>Generated game</title>",
    });
    const page = createPageDouble({
      afterUnmetWait: () =>
        installEditorDocument({
          bodyText: [
            "Generated, evaluated, and accepted a playable mechanic project.",
            "Runtime is running in the sandbox.",
          ].join("\n"),
          iframeSource: "<!doctype html><title>Generated game</title>",
        }),
    });

    const terminal = await waitForCampaignEditorTerminalState(
      page,
      1_000,
      createCampaignActivityTracker()
    );

    expect(page.waitCalls).toBe(2);
    expect(terminal).toEqual({
      kind: "ready",
      text: "Runtime is running in the sandbox.",
    });
  });

  it("returns the editor snapshot when terminal-state observation times out", async () => {
    installEditorDocument({
      bodyText: "AI is building the project\nGenerating your game",
    });
    const page = createPageDouble({
      waitError: new Error("page.waitForFunction: Timeout 300000ms exceeded."),
    });

    const terminal = await waitForCampaignEditorTerminalState(page, 300_000);

    expect(terminal).toEqual({
      kind: "infrastructure_failure",
      text:
        "Campaign editor did not reach a terminal state: " +
        '{"body":"AI is building the project\\nGenerating your game","runtimeReady":false,"iframeCount":0,"iframeHasSource":false}. ' +
        "page.waitForFunction: Timeout 300000ms exceeded.",
    });
  });

  it("requires out-of-band campaign repair after an infrastructure failure", () => {
    expect(() =>
      requireCampaignAttemptContinuation({
        id: "a01-baseline",
        campaignRunId: "repeatability-c12-r1",
        classification: "infrastructure_failure",
        failure: "Campaign editor did not reach a terminal state.",
      })
    ).toThrowError(
      new CampaignInfrastructureFailureError(
        "Campaign repeatability-c12-r1 attempt a01-baseline requires out-of-band repair: Campaign editor did not reach a terminal state."
      )
    );
  });
});

function createPromptPageDouble(events) {
  const prompt = {
    async click() {
      events.push("prompt:click");
    },
    async press(value) {
      events.push(`prompt:press:${value}`);
    },
    async pressSequentially(value) {
      events.push(`prompt:type:${value}`);
    },
  };
  const submit = {
    async click() {
      events.push("submit:click");
    },
  };
  return {
    async waitForLoadState(state, options) {
      events.push(`wait:${state}:${options.timeout}`);
    },
    getByPlaceholder() {
      return prompt;
    },
    getByRole() {
      return submit;
    },
  };
}

function createPageDouble({ waitError, afterUnmetWait } = {}) {
  let waitCalls = 0;
  return {
    get waitCalls() {
      return waitCalls;
    },
    async waitForFunction(predicate, argument) {
      waitCalls += 1;
      if (waitError) throw waitError;
      if (!predicate(argument)) {
        afterUnmetWait?.();
        throw new Error("page.waitForFunction: Timeout 1000ms exceeded.");
      }
    },
    async evaluate(operation, argument) {
      return operation(argument);
    },
    locator() {
      return {
        async innerText() {
          return document.body.innerText;
        },
      };
    },
  };
}

function installEditorDocument({ bodyText, iframeSource, iframeRoute }) {
  document.body.replaceChildren();
  Object.defineProperty(document.body, "innerText", {
    configurable: true,
    value: bodyText,
  });
  if (iframeSource) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("srcdoc", iframeSource);
    document.body.append(iframe);
  }
  if (iframeRoute) {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("src", iframeRoute);
    document.body.append(iframe);
  }
}
