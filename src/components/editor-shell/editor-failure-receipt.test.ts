import { describe, expect, it } from "vitest";

import { createGenerationFailureReceiptSurface } from "./editor-failure-receipt";

describe("createGenerationFailureReceiptSurface", () => {
  it("turns provider or generic generation errors into display-ready receipts", () => {
    expect(
      createGenerationFailureReceiptSurface({
        message:
          "I couldn't design a game plan from that prompt. Please try again.",
      })
    ).toEqual({
      debugReceipts: [
        {
          checkId: "generation_request",
          evidenceJson: null,
          issueMessages: [],
          message:
            "I couldn't design a game plan from that prompt. Please try again.",
          stage: "model_generation",
          status: "failed",
        },
      ],
      summary:
        "I couldn't design a game plan from that prompt. Please try again.",
    });
  });
});
