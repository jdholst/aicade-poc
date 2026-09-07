import { describe, expect, it } from "vitest";

import {
  MECHANIC_CALLBACK_WATCHDOG_DELIVERY_GRACE_MILLISECONDS,
  mechanicCallbackWatchdogDeadlineReached,
  mechanicCallbackWatchdogDelayMilliseconds,
} from "./mechanic-callback-watchdog-policy";

describe("mechanic callback watchdog policy", () => {
  it("keeps the exact active-work limit separate from Worker delivery grace", () => {
    expect(MECHANIC_CALLBACK_WATCHDOG_DELIVERY_GRACE_MILLISECONDS).toBe(32);
    expect(mechanicCallbackWatchdogDelayMilliseconds(8)).toBe(40);
    expect(mechanicCallbackWatchdogDelayMilliseconds(0)).toBe(32);
  });

  it("preserves Worker delivery grace at the termination boundary", () => {
    expect(
      mechanicCallbackWatchdogDeadlineReached(
        {
          limit: 8,
          remainingMilliseconds: 8,
          activeStartedAt: 100,
        },
        139
      )
    ).toBe(false);
    expect(
      mechanicCallbackWatchdogDeadlineReached(
        {
          limit: 8,
          remainingMilliseconds: 8,
          activeStartedAt: 100,
        },
        140
      )
    ).toBe(true);
    expect(
      mechanicCallbackWatchdogDeadlineReached(
        {
          limit: 8,
          remainingMilliseconds: 3,
        },
        500
      )
    ).toBe(false);
  });
});
