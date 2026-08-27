import { describe, expect, it } from "vitest";

import {
  MECHANIC_CALLBACK_WATCHDOG_DELIVERY_GRACE_MILLISECONDS,
  mechanicCallbackWatchdogDelayMilliseconds,
} from "./mechanic-callback-watchdog-policy";

describe("mechanic callback watchdog policy", () => {
  it("keeps the exact active-work limit separate from Worker delivery grace", () => {
    expect(MECHANIC_CALLBACK_WATCHDOG_DELIVERY_GRACE_MILLISECONDS).toBe(32);
    expect(mechanicCallbackWatchdogDelayMilliseconds(8)).toBe(40);
    expect(mechanicCallbackWatchdogDelayMilliseconds(0)).toBe(32);
  });
});
