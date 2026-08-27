import { describe, expect, it } from "vitest";

import {
  forwardMechanicCapabilityResultToCallback,
  scheduleMechanicCallbackYieldAcknowledgement,
} from "./mechanic-callback-yield-scheduler";

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

  it("resumes metering after trusted response forwarding and before generated continuation", async () => {
    const order: string[] = [];
    let settleHostResponse: (value: string) => void = () => undefined;
    const hostResponse = new Promise<string>((resolve) => {
      settleHostResponse = resolve;
    });
    const decodedCapability = hostResponse.then((value) => {
      order.push("trusted-response-forwarded");
      return value;
    });
    let resolveCallbackValue: (value: string) => void = () => undefined;
    const callbackValue = new Promise<string>((resolve) => {
      resolveCallbackValue = resolve;
    });
    const generatedContinuation = callbackValue.then(() => {
      order.push("generated-continuation");
    });

    forwardMechanicCapabilityResultToCallback(
      decodedCapability,
      () => {
        order.push("callback-resumed");
      },
      resolveCallbackValue,
      (error) => {
        throw error;
      }
    );
    order.push("response-settled");
    settleHostResponse("ready");

    await generatedContinuation;
    expect(order).toEqual([
      "response-settled",
      "trusted-response-forwarded",
      "callback-resumed",
      "generated-continuation",
    ]);
  });

  it("resumes metering before forwarding a capability rejection", async () => {
    const order: string[] = [];
    let rejectHostResponse: (error: Error) => void = () => undefined;
    const hostResponse = new Promise<string>((_resolve, reject) => {
      rejectHostResponse = reject;
    });
    let rejectCallbackValue: (error: unknown) => void = () => undefined;
    const callbackValue = new Promise<string>((_resolve, reject) => {
      rejectCallbackValue = reject;
    });
    const generatedRejection = callbackValue.catch(() => {
      order.push("generated-rejection");
    });

    forwardMechanicCapabilityResultToCallback(
      hostResponse,
      () => {
        order.push("callback-resumed");
      },
      () => {
        throw new Error("Rejected capability unexpectedly resolved.");
      },
      rejectCallbackValue
    );
    order.push("response-rejected");
    rejectHostResponse(new Error("host rejected"));

    await generatedRejection;
    expect(order).toEqual([
      "response-rejected",
      "callback-resumed",
      "generated-rejection",
    ]);
  });
});
