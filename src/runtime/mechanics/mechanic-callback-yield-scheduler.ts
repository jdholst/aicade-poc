type MicrotaskScheduler = (callback: () => void) => void;

export function scheduleMechanicCallbackYieldAcknowledgement(
  acknowledge: () => void,
  scheduleMicrotask: MicrotaskScheduler = queueMicrotask
): void {
  scheduleMicrotask(acknowledge);
}

export function forwardMechanicCapabilityResultToCallback<T>(
  capabilityResult: T | PromiseLike<T>,
  resumeCallback: () => void,
  resolveCallback: (value: T) => void,
  rejectCallback: (error: unknown) => void
): void {
  // capabilityResult includes trusted response decoding and forwarding. Resume
  // metering only after that work settles, immediately before generated code.
  void Promise.resolve(capabilityResult).then(
    (value) => {
      resumeCallback();
      resolveCallback(value);
    },
    (error: unknown) => {
      resumeCallback();
      rejectCallback(error);
    }
  );
}
