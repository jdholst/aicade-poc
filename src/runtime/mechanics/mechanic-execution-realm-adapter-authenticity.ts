import type { MechanicExecutionRealmAdapter } from "./mechanic-execution-realm";
import { isSesWorkerMechanicExecutionRealmAdapter } from "./ses-worker-mechanic-execution-realm";

export function isMechanicExecutionRealmAdapterAuthentic(
  adapter: MechanicExecutionRealmAdapter
): boolean {
  return isSesWorkerMechanicExecutionRealmAdapter(adapter);
}
