import {
  RUNTIME_AND_CONTRACT_FOUNDATION_GATE_INTERNAL_TEST_CONTROL,
  runRuntimeAndContractFoundationGate,
  type RunRuntimeAndContractFoundationGateInput,
  type RuntimeAndContractFoundationBoundary,
  type RuntimeAndContractFoundationGateResult,
} from "./runtime-and-contract-foundation-gate";

export function runRuntimeAndContractFoundationGateWithDeliberateFailure({
  input,
  failBoundary,
}: {
  input: RunRuntimeAndContractFoundationGateInput;
  failBoundary: RuntimeAndContractFoundationBoundary;
}): Promise<RuntimeAndContractFoundationGateResult> {
  return runRuntimeAndContractFoundationGate(
    Object.assign({}, input, {
      [RUNTIME_AND_CONTRACT_FOUNDATION_GATE_INTERNAL_TEST_CONTROL]: {
        failBoundary,
      },
    })
  );
}
