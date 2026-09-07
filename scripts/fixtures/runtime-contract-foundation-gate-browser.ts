import { createSesWorkerMechanicExecutionRealmAdapter } from "../../src/runtime/mechanics/ses-worker-mechanic-execution-realm";
import {
  runRuntimeAndContractFoundationGate,
  type RuntimeAndContractFoundationGateResult,
} from "../../src/service/runtime-and-contract-foundation-gate";

type RuntimeContractFoundationGateQa = Readonly<{
  error?: string;
  result?: RuntimeAndContractFoundationGateResult;
}>;

declare global {
  interface Window {
    __runtimeContractFoundationGateQa?: RuntimeContractFoundationGateQa;
  }
}

void runTicket12BrowserQa().catch((error) => {
  window.__runtimeContractFoundationGateQa = {
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  };
});

async function runTicket12BrowserQa(): Promise<void> {
  await waitForCondition(
    () => window.__mechanicRealmCandidateEvaluation !== undefined,
    "The SES Worker candidate evaluation did not finish."
  );
  const candidateEvaluation = window.__mechanicRealmCandidateEvaluation;
  if (!candidateEvaluation || candidateEvaluation.error) {
    throw new Error(
      candidateEvaluation?.error ??
        "The SES Worker candidate evaluation did not produce evidence."
    );
  }
  if (!candidateEvaluation.report) {
    throw new Error("Fresh browser conformance evidence was not provided.");
  }
  const result = await runRuntimeAndContractFoundationGate({
    realmAdapter: createSesWorkerMechanicExecutionRealmAdapter(),
    realmConformanceReport: candidateEvaluation.report,
  });
  window.__runtimeContractFoundationGateQa = { result };
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMessage: string
): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (!condition()) {
    if (performance.now() >= deadline) {
      throw new Error(timeoutMessage);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}
