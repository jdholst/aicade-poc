import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import type { GeneratedMechanicContract } from "@/game-spec/mechanics/generated-mechanic-contract";
import type { MechanicCapabilityGrant } from "@/game-spec/mechanics/mechanic-capability-registry";

import type {
  MechanicLifecycleCallbackKind,
  MechanicLifecycleProgram,
} from "./mechanic-lifecycle";

export const GENERATED_MECHANIC_LIFECYCLE_PROGRAM_VERSION =
  "generated_mechanic_lifecycle_program/v1" as const;
export const GENERATED_MECHANIC_CALLBACK_SOURCE_MARKER =
  '"use sparkline generated mechanic callback/v1";' as const;
const authenticGeneratedMechanicLifecyclePrograms = new WeakSet<object>();

export type GeneratedMechanicLifecycleSourceCallback = Readonly<{
  id: StableId;
  kind: MechanicLifecycleCallbackKind;
  normalizedJavaScript: string;
}>;

export type GeneratedMechanicLifecycleSourceArtifact = Readonly<{
  id: StableId;
  contractId: StableId;
  intentId: StableId;
  capabilityVersion: string;
  grant: MechanicCapabilityGrant;
  callbacks: readonly GeneratedMechanicLifecycleSourceCallback[];
}>;

export type GeneratedMechanicLifecycleProgramIdentity = Readonly<{
  schemaVersion: typeof GENERATED_MECHANIC_LIFECYCLE_PROGRAM_VERSION;
  sourceArtifactId: StableId;
  contractId: StableId;
  intentId: StableId;
  capabilityVersion: string;
  callbacks: readonly Readonly<{
    id: StableId;
    kind: MechanicLifecycleCallbackKind;
  }>[];
}>;

export type GeneratedMechanicLifecycleProgram = Readonly<
  MechanicLifecycleProgram & {
    identity: GeneratedMechanicLifecycleProgramIdentity;
  }
>;

export type CreateGeneratedMechanicLifecycleProgramInput = Readonly<{
  contract: GeneratedMechanicContract;
  sourceArtifact: GeneratedMechanicLifecycleSourceArtifact;
  config: JsonValue;
  fixedStepIntervalMilliseconds?: number;
}>;

/**
 * Compiles one already-admitted generated source artifact into the shared
 * lifecycle program shape. The compiler does not schedule callbacks or choose
 * game/editor policy; it only preserves the accepted identity and proves that
 * the persisted callback set exactly covers the accepted contract.
 */
export function createGeneratedMechanicLifecycleProgram({
  contract,
  sourceArtifact,
  config,
  fixedStepIntervalMilliseconds,
}: CreateGeneratedMechanicLifecycleProgramInput): GeneratedMechanicLifecycleProgram {
  validateArtifactIdentity(contract, sourceArtifact);
  validateLifecycleCoverage(contract, sourceArtifact);

  const fixedStepCallback = sourceArtifact.callbacks.find(
    (callback) => callback.kind === "fixed_step"
  );
  if (
    fixedStepCallback &&
    (!Number.isInteger(fixedStepIntervalMilliseconds) ||
      (fixedStepIntervalMilliseconds ?? 0) <= 0)
  ) {
    throw new TypeError(
      "A generated fixed-step callback requires a positive integer host interval."
    );
  }
  const callbacks = Object.freeze(
    sourceArtifact.callbacks.map((callback) =>
      Object.freeze({
        id: callback.id,
        kind: callback.kind,
        source: [
          GENERATED_MECHANIC_CALLBACK_SOURCE_MARKER,
          "const { capabilities, bindings, config } = __sparklineLifecycleContext;",
          "const input = lifecycleInput;",
          callback.normalizedJavaScript,
          "return await __sparklineGeneratedMechanicCallback();",
        ].join("\n"),
      })
    )
  );
  const callbackIdentity = Object.freeze(
    sourceArtifact.callbacks.map(({ id, kind }) => Object.freeze({ id, kind }))
  );
  const identity = Object.freeze({
    schemaVersion: GENERATED_MECHANIC_LIFECYCLE_PROGRAM_VERSION,
    sourceArtifactId: sourceArtifact.id,
    contractId: contract.id,
    intentId: contract.intentId,
    capabilityVersion: contract.capabilityVersion,
    callbacks: callbackIdentity,
  });

  const program: GeneratedMechanicLifecycleProgram = Object.freeze({
    source: compileGeneratedMechanicLifecycleContextSource({
      contract,
      grant: sourceArtifact.grant,
      config,
    }),
    callbacks,
    ...(fixedStepCallback
      ? {
          fixedStep: Object.freeze({
            callbackId: fixedStepCallback.id,
            intervalMilliseconds: fixedStepIntervalMilliseconds!,
          }),
        }
      : {}),
    identity,
  });
  authenticGeneratedMechanicLifecyclePrograms.add(program);
  return program;
}

export function isAuthenticGeneratedMechanicLifecycleProgram(
  program: MechanicLifecycleProgram
): program is GeneratedMechanicLifecycleProgram {
  return authenticGeneratedMechanicLifecyclePrograms.has(program);
}

function compileGeneratedMechanicLifecycleContextSource(input: {
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  config: JsonValue;
}): string {
  const capabilityGroups = new Map<string, string[]>();
  for (const capability of input.grant.capabilities) {
    const [group, member] = capability.authoring.member.split(".");
    if (!group || !member) {
      continue;
    }
    const members = capabilityGroups.get(group) ?? [];
    members.push(
      `${JSON.stringify(member)}: (...args) => realm.callCapability(${JSON.stringify(capability.id)}, ...args)`
    );
    capabilityGroups.set(group, members);
  }
  const capabilities = [...capabilityGroups]
    .map(
      ([group, members]) =>
        `${JSON.stringify(group)}: Object.freeze({ ${members.join(", ")} })`
    )
    .join(", ");
  const bindings = input.contract.bindings
    .map(
      (binding) =>
        `${JSON.stringify(binding.id)}: realm.binding(${JSON.stringify(binding.id)})`
    )
    .join(", ");

  return `
const __sparklineFreezeJson = (value) => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) __sparklineFreezeJson(child);
    Object.freeze(value);
  }
  return value;
};
const capabilities = Object.freeze({ ${capabilities} });
const bindings = Object.freeze({ ${bindings} });
const config = __sparklineFreezeJson(${JSON.stringify(input.config)});
return Object.freeze({ capabilities, bindings, config });
`.trim();
}

function validateArtifactIdentity(
  contract: GeneratedMechanicContract,
  sourceArtifact: GeneratedMechanicLifecycleSourceArtifact
): void {
  if (sourceArtifact.contractId !== contract.id) {
    throw new Error(
      `Generated source artifact contract "${sourceArtifact.contractId}" does not match "${contract.id}".`
    );
  }
  if (sourceArtifact.intentId !== contract.intentId) {
    throw new Error(
      `Generated source artifact intent "${sourceArtifact.intentId}" does not match "${contract.intentId}".`
    );
  }
  if (sourceArtifact.capabilityVersion !== contract.capabilityVersion) {
    throw new Error(
      `Generated source artifact capability version "${sourceArtifact.capabilityVersion}" does not match "${contract.capabilityVersion}".`
    );
  }
  if (sourceArtifact.grant.capabilityVersion !== contract.capabilityVersion) {
    throw new Error(
      `Generated source artifact grant capability version "${sourceArtifact.grant.capabilityVersion}" does not match "${contract.capabilityVersion}".`
    );
  }
}

function validateLifecycleCoverage(
  contract: GeneratedMechanicContract,
  sourceArtifact: GeneratedMechanicLifecycleSourceArtifact
): void {
  const declaredContractKinds = new Set<MechanicLifecycleCallbackKind>();
  for (const kind of contract.lifecycle.callbacks) {
    if (declaredContractKinds.has(kind)) {
      throw new Error(
        `Generated mechanic contract lifecycle callback kind "${kind}" is duplicated.`
      );
    }
    declaredContractKinds.add(kind);
  }

  const requiredKinds = new Set<MechanicLifecycleCallbackKind>([
    ...declaredContractKinds,
    "dispose",
    ...(contract.lifecycle.fixedStep ? (["fixed_step"] as const) : []),
  ]);
  const callbackIds = new Set<StableId>();
  const callbackKindCounts = new Map<MechanicLifecycleCallbackKind, number>();

  for (const callback of sourceArtifact.callbacks) {
    if (callbackIds.has(callback.id)) {
      throw new Error(
        `Generated lifecycle callback ID "${callback.id}" is duplicated.`
      );
    }
    callbackIds.add(callback.id);
    callbackKindCounts.set(
      callback.kind,
      (callbackKindCounts.get(callback.kind) ?? 0) + 1
    );
    if (
      typeof callback.normalizedJavaScript !== "string" ||
      callback.normalizedJavaScript.length === 0
    ) {
      throw new TypeError(
        `Generated lifecycle callback "${callback.id}" has no compiled JavaScript.`
      );
    }
  }

  for (const requiredKind of requiredKinds) {
    if ((callbackKindCounts.get(requiredKind) ?? 0) === 0) {
      throw new Error(
        `Generated lifecycle callback kind "${requiredKind}" is missing from source artifact "${sourceArtifact.id}".`
      );
    }
  }
  for (const [kind, count] of callbackKindCounts) {
    if (!requiredKinds.has(kind)) {
      throw new Error(
        `Generated lifecycle callback kind "${kind}" is not declared by contract "${contract.id}".`
      );
    }
    if (count !== 1) {
      throw new Error(
        `Generated lifecycle callback kind "${kind}" must occur exactly once.`
      );
    }
  }
}
