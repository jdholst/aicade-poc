import { describe, expect, it } from "vitest";

import {
  CampaignInfrastructureFailureError,
  requireCampaignAttemptContinuation,
  waitForCampaignEditorTerminalState,
} from "./lib/browser-runner.mjs";

describe("campaign browser runner", () => {
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

function createPageDouble({ waitError } = {}) {
  return {
    async waitForFunction(predicate) {
      if (waitError) throw waitError;
      if (!predicate()) {
        throw new Error("page.waitForFunction: Timeout 1000ms exceeded.");
      }
    },
    async evaluate(operation) {
      return operation();
    },
  };
}

function installEditorDocument({ bodyText, iframeSource }) {
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
}
