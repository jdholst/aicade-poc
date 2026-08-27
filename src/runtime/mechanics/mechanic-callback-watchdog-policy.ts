export const MECHANIC_CALLBACK_WATCHDOG_DELIVERY_GRACE_MILLISECONDS = 32;

export type MechanicCallbackBudgetSnapshot = {
  limit: number;
  remainingMilliseconds: number;
  activeStartedAt?: number;
};

export function mechanicCallbackWatchdogDeadlineReached(
  budget: MechanicCallbackBudgetSnapshot,
  now: number
): boolean {
  return (
    budget.activeStartedAt !== undefined &&
    now - budget.activeStartedAt >=
      mechanicCallbackWatchdogDelayMilliseconds(
        budget.remainingMilliseconds
      )
  );
}

export function mechanicCallbackWatchdogDelayMilliseconds(
  remainingActiveMilliseconds: number
): number {
  return (
    Math.max(0, remainingActiveMilliseconds) +
    MECHANIC_CALLBACK_WATCHDOG_DELIVERY_GRACE_MILLISECONDS
  );
}
