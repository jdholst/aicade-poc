import { describe, expect, it } from "vitest";

import { scheduleMechanicCallbackYieldAcknowledgement } from "./mechanic-callback-yield-scheduler";

describe("mechanic callback yield scheduler", () => {
  it("acknowledges a capability yield after current synchronous work and before the next task", async () => {
    const order: string[] = [];

    scheduleMechanicCallbackYieldAcknowledgement(() => {
      order.push("yield-acknowledged");
    });
    order.push("synchronous-generated-work");

    expect(order).toEqual(["synchronous-generated-work"]);
    await Promise.resolve();
    expect(order).toEqual([
      "synchronous-generated-work",
      "yield-acknowledged",
    ]);
  });
});
