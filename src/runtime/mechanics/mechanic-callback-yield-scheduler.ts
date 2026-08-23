type MicrotaskScheduler = (callback: () => void) => void;

export function scheduleMechanicCallbackYieldAcknowledgement(
  acknowledge: () => void,
  scheduleMicrotask: MicrotaskScheduler = queueMicrotask
): void {
  scheduleMicrotask(acknowledge);
}
