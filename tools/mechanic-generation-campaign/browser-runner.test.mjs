import { describe, expect, it } from "vitest";

import {
  CampaignInfrastructureFailureError,
  createCampaignActivityTracker,
  requireCampaignAttemptContinuation,
  submitCampaignPrompt,
  waitForCampaignEditorTerminalState,
} from "./lib/browser-runner.mjs";

describe("campaign browser runner", () => {
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
