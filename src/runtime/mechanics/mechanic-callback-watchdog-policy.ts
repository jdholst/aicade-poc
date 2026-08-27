export const MECHANIC_CALLBACK_WATCHDOG_DELIVERY_GRACE_MILLISECONDS = 32;

export function mechanicCallbackWatchdogDelayMilliseconds(
  remainingActiveMilliseconds: number
): number {
  return (
    Math.max(0, remainingActiveMilliseconds) +
    MECHANIC_CALLBACK_WATCHDOG_DELIVERY_GRACE_MILLISECONDS
  );
}
