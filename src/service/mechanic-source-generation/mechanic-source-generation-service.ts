import ts from "typescript";
import { z } from "zod";

import {
  MECHANIC_CAPABILITY_VERSION,
  getMechanicCapabilityVersion,
  validateMechanicCapabilityUsage,
  type GeneratedMechanicContract,
  type GeneratedMechanicReferenceCatalog,
  type MechanicCapabilityDefinition,
  type MechanicCapabilityGrant,
  type MechanicConfigDslValue,
} from "@/game-spec";
import {
  jsonValueSchema,
  stableIdSchema,
  type JsonValue,
  type StableId,
} from "@/game-spec/game-spec-schema";
import { configDslValueMatches } from "@/game-spec/mechanics/generated-mechanic-contract";
import {
  MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
  type MechanicExecutionRealmAdapter,
  type MechanicExecutionRealmBinding,
  type MechanicExecutionRealmCapabilityHost,
  type MechanicExecutionRealmExecutionResult,
  type MechanicExecutionRealmResourceBudget,
} from "@/runtime/mechanics/mechanic-execution-realm";
import {
  isMechanicObjectBindingAuthorityAuthentic,
  type MechanicObjectBindingAuthority,
} from "@/runtime/mechanics/mechanic-object-host";

import { sourceFacingCapabilitySignature } from "./mechanic-source-generation-signatures";

export const GENERATED_MECHANIC_SOURCE_CANDIDATE_VERSION =
  "generated_mechanic_source_candidate/v1";
export const GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION =
  "generated_mechanic_source_artifact/v1";
export const GENERATED_MECHANIC_SOURCE_STATIC_VALIDATION_VERSION =
  "generated_mechanic_source_static_validation/v1";
const GENERATED_MECHANIC_SOURCE_WRAPPER_NAME =
  "__sparklineGeneratedMechanicCallback";

export const GENERATED_MECHANIC_SOURCE_CALLBACK_KINDS = [
  "install",
  "logical_action",
  "gameplay_event",
  "scheduled",
  "fixed_step",
  "dispose",
] as const;

const callbackKindSchema = z.enum(GENERATED_MECHANIC_SOURCE_CALLBACK_KINDS);

const generatedMechanicSourceCandidateSchema = z
  .object({
    schemaVersion: z.literal(GENERATED_MECHANIC_SOURCE_CANDIDATE_VERSION),
    id: stableIdSchema,
    contractId: stableIdSchema,
    capabilityVersion: z.literal(MECHANIC_CAPABILITY_VERSION),
    callbacks: z
      .array(
        z
          .object({
            id: stableIdSchema,
            kind: callbackKindSchema,
            source: z.string().min(1).max(40_000),
          })
          .strict()
      )
      .min(1)
      .max(32),
  })
  .strict();

export type GeneratedMechanicSourceCandidate = z.infer<
  typeof generatedMechanicSourceCandidateSchema
>;

export type GeneratedMechanicSourceArtifact = Readonly<{
  schemaVersion: typeof GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION;
  id: StableId;
  contractId: StableId;
  intentId: StableId;
  capabilityVersion: string;
  grant: MechanicCapabilityGrant;
  usedCapabilities: readonly StableId[];
  callbacks: readonly Readonly<{
    id: StableId;
    kind: GeneratedMechanicSourceCandidate["callbacks"][number]["kind"];
    sourceTypeScript: string;
    normalizedJavaScript: string;
  }>[];
  build: Readonly<{
    language: "typescript";
    target: "es2020";
    parsed: true;
    typechecked: true;
    compiled: true;
    staticValidationTarget: "normalized_javascript";
    staticValidationVersion: typeof GENERATED_MECHANIC_SOURCE_STATIC_VALIDATION_VERSION;
  }>;
}>;

export type GeneratedMechanicSourceIssue = Readonly<{
  path: string;
  code:
    | "callback_coverage_mismatch"
    | "candidate_contract_mismatch"
    | "candidate_version_mismatch"
    | "compile_failure"
    | "duplicate_callback"
    | "forbidden_source_authority"
    | "grant_mismatch"
    | "invalid_candidate"
    | "invalid_execution_bindings"
    | "invalid_execution_config"
    | "invalid_lifecycle_input"
    | "realm_cleanup_failure"
    | "realm_rejection"
    | "source_context_shadowing"
    | "type_failure"
    | "unawaited_capability_call";
  message: string;
}>;

export type GeneratedMechanicSourceStageEvidence = Readonly<{
  stage:
    | "source_validation"
    | "source_typecheck"
    | "source_compilation"
    | "source_static_validation"
    | "realm_execution";
  code:
    | "invalid_generated_mechanic_source"
    | "generated_mechanic_source_typecheck_failed"
    | "generated_mechanic_source_compilation_failed"
    | "generated_mechanic_source_static_validation_failed"
    | "generated_mechanic_source_realm_rejected";
  issues: readonly GeneratedMechanicSourceIssue[];
  runtimeExecution?: Readonly<{
    sourceArtifactId: StableId;
    contractId: StableId;
    intentId: StableId;
    capabilityVersion: string;
    executionId: StableId;
    callbackId: StableId;
    result?: MechanicExecutionRealmExecutionResult;
  }>;
}>;

export type BuildAndExecuteGeneratedMechanicSourceInput = {
  candidate: unknown;
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  realmAdapter: MechanicExecutionRealmAdapter;
  execution: {
    id: StableId;
    callbackId: StableId;
    config: JsonValue;
    lifecycleInput?: JsonValue;
    bindings: readonly MechanicExecutionRealmBinding[];
    bindingAuthority?: MechanicSourceBindingAuthority;
    capabilityHost: MechanicExecutionRealmCapabilityHost;
    seed: number;
    resourceBudget: MechanicExecutionRealmResourceBudget;
  };
};

export type MechanicSourceBindingAuthority = MechanicObjectBindingAuthority;

export type BuildAndExecuteGeneratedMechanicSourceResult =
  | Readonly<{
      success: true;
      data: Readonly<{
        artifact: GeneratedMechanicSourceArtifact;
        execution: Readonly<{
          callbackId: StableId;
          result: MechanicExecutionRealmExecutionResult;
        }>;
      }>;
    }>
  | Readonly<{
      success: false;
      evidence:
        | GeneratedMechanicSourceStageEvidence
        | Extract<
            ReturnType<typeof validateMechanicCapabilityUsage>,
            { success: false }
          >["evidence"];
    }>;

export async function buildAndExecuteGeneratedMechanicSource({
  candidate: candidateInput,
  contract,
  grant,
  referenceCatalog,
  realmAdapter,
  execution,
}: BuildAndExecuteGeneratedMechanicSourceInput): Promise<BuildAndExecuteGeneratedMechanicSourceResult> {
  const parsedCandidate = generatedMechanicSourceCandidateSchema.safeParse(
    candidateInput
  );
  if (!parsedCandidate.success) {
    return fail("source_validation", "invalid_generated_mechanic_source", [
      {
        path: parsedCandidate.error.issues[0]?.path.join(".") || "candidate",
        code: "invalid_candidate",
        message:
          parsedCandidate.error.issues[0]?.message ??
          "Generated mechanic source candidate is invalid.",
      },
    ]);
  }

  const candidate = parsedCandidate.data;
  const candidateIssues = validateCandidateAgainstContract(candidate, contract);
  if (candidateIssues.length > 0) {
    return fail(
      "source_validation",
      "invalid_generated_mechanic_source",
      candidateIssues
    );
  }

  if (!grantExactlyMatchesContract(grant, contract)) {
    return fail("source_validation", "invalid_generated_mechanic_source", [
      {
        path: "grant.capabilities",
        code: "grant_mismatch",
        message:
          "Mechanic source grant must exactly match the accepted contract capability declarations.",
      },
    ]);
  }

  const compiledCallbacks: GeneratedMechanicSourceArtifact["callbacks"][number][] = [];
  const usedCapabilityIds: StableId[] = [];
  for (const [callbackIndex, callback] of candidate.callbacks.entries()) {
    const compileResult = compileCallback({
      callback,
      callbackIndex,
      candidate,
      contract,
      grant,
      referenceCatalog,
    });
    if (!compileResult.success) {
      return compileResult;
    }
    compiledCallbacks.push(compileResult.data.callback);
    usedCapabilityIds.push(...compileResult.data.usedCapabilities);
  }

  const usedCapabilities = uniqueInOrder(usedCapabilityIds);
  const usageResult = validateMechanicCapabilityUsage({
    grant,
    usedCapabilities,
  });
  if (!usageResult.success) {
    return usageResult;
  }

  const parsedConfig = jsonValueSchema.safeParse(execution.config);
  if (
    !parsedConfig.success ||
    !configDslValueMatches(
      contract.config,
      parsedConfig.data,
      referenceCatalog
    )
  ) {
    return fail("source_validation", "invalid_generated_mechanic_source", [
      {
        path: "execution.config",
        code: "invalid_execution_config",
        message:
          "Mechanic execution config does not match the accepted contract config declaration.",
      },
    ]);
  }
  const admittedConfig = structuredClone(parsedConfig.data);

  const selectedCallback = compiledCallbacks.find(
    (callback) => callback.id === execution.callbackId
  );
  if (!selectedCallback) {
    return fail("source_validation", "invalid_generated_mechanic_source", [
      {
        path: "execution.callbackId",
        code: "callback_coverage_mismatch",
        message: `Execution callback "${execution.callbackId}" is not present in the compiled artifact.`,
      },
    ]);
  }

  const bindingIssue = executionBindingsIssue(
    contract,
    execution.bindings,
    execution.bindingAuthority
  );
  if (bindingIssue) {
    return fail("source_validation", "invalid_generated_mechanic_source", [
      bindingIssue,
    ]);
  }

  let admittedLifecycleInput: JsonValue | undefined;
  let lifecycleInputIsJson = true;
  if (execution.lifecycleInput !== undefined) {
    const parsedLifecycleInput = jsonValueSchema.safeParse(
      execution.lifecycleInput
    );
    if (parsedLifecycleInput.success) {
      admittedLifecycleInput = structuredClone(parsedLifecycleInput.data);
    } else {
      lifecycleInputIsJson = false;
    }
  }
  if (
    !lifecycleInputIsJson ||
    !lifecycleInputMatchesContract(
        selectedCallback.kind,
        admittedLifecycleInput,
        contract,
        referenceCatalog
      )
  ) {
    return fail("source_validation", "invalid_generated_mechanic_source", [
      {
        path: "execution.lifecycleInput",
        code: "invalid_lifecycle_input",
        message:
          "Mechanic lifecycle input does not match the selected callback and accepted contract payload declaration.",
      },
    ]);
  }

  const artifact = deepFreeze({
    schemaVersion: GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION,
    id: candidate.id,
    contractId: contract.id,
    intentId: contract.intentId,
    capabilityVersion: candidate.capabilityVersion,
    grant: structuredClone(grant),
    usedCapabilities,
    callbacks: compiledCallbacks,
    build: {
      language: "typescript" as const,
      target: "es2020" as const,
      parsed: true as const,
      typechecked: true as const,
      compiled: true as const,
      staticValidationTarget: "normalized_javascript" as const,
      staticValidationVersion:
        GENERATED_MECHANIC_SOURCE_STATIC_VALIDATION_VERSION,
    },
  }) satisfies GeneratedMechanicSourceArtifact;
  let runtimeExecution = createRuntimeExecutionEvidence({
    artifact,
    executionId: execution.id,
    callbackId: selectedCallback.id,
  });

  if (
    realmAdapter.adapterVersion !== MECHANIC_EXECUTION_REALM_ADAPTER_VERSION
  ) {
    return realmFailure(
      "realmAdapter.adapterVersion",
      `Mechanic Execution Realm adapter version "${realmAdapter.adapterVersion}" is not admitted.`,
      "realm_rejection",
      runtimeExecution
    );
  }

  let realm;
  try {
    realm = await realmAdapter.create({
      mechanicId: contract.id,
      capabilityGrant: grant,
      bindings: execution.bindings,
      capabilityHost: execution.capabilityHost,
      seed: execution.seed,
      resourceBudget: execution.resourceBudget,
    });
  } catch (error) {
    return realmFailure(
      "realmAdapter.create",
      errorMessage(error),
      "realm_rejection",
      runtimeExecution
    );
  }

  let executionResult:
    | Extract<BuildAndExecuteGeneratedMechanicSourceResult, { success: true }>
    | { success: false; evidence: GeneratedMechanicSourceStageEvidence };
  try {
    const run = realm.execute({
      id: execution.id,
      source: "",
      lifecycle: {
        callbacks: compiledCallbacks.map((callback) => ({
          id: callback.id,
          source: createExecutionSource({
            callback,
            contract,
            grant,
            config: admittedConfig,
            lifecycleInput:
              callback.id === selectedCallback.id
                ? admittedLifecycleInput
                : undefined,
          }),
        })),
        invocations: [{ callbackId: selectedCallback.id, count: 1 }],
      },
    });
    const result = deepFreeze(structuredClone(await run.result));
    runtimeExecution = createRuntimeExecutionEvidence({
      artifact,
      executionId: execution.id,
      callbackId: selectedCallback.id,
      result,
    });
    if (result.outcome !== "completed") {
      executionResult = realmFailure(
        "realm.execute",
        result.diagnostic?.message ??
          `Mechanic Execution Realm rejected the artifact with outcome "${result.outcome}".`,
        "realm_rejection",
        runtimeExecution
      );
    } else {
      executionResult = deepFreeze({
        success: true as const,
        data: {
          artifact,
          execution: {
            callbackId: selectedCallback.id,
            result,
          },
        },
      });
    }
  } catch (error) {
    executionResult = realmFailure(
      "realm.execute",
      errorMessage(error),
      "realm_rejection",
      runtimeExecution
    );
  }

  try {
    realm.dispose();
  } catch (error) {
    const cleanupIssue: GeneratedMechanicSourceIssue = {
      path: "realm.dispose",
      code: "realm_cleanup_failure",
      message: errorMessage(error),
    };
    if (!executionResult.success) {
      return fail(
        "realm_execution",
        "generated_mechanic_source_realm_rejected",
        [...executionResult.evidence.issues, cleanupIssue],
        executionResult.evidence.runtimeExecution ?? runtimeExecution
      );
    }
    return fail(
      "realm_execution",
      "generated_mechanic_source_realm_rejected",
      [cleanupIssue],
      runtimeExecution
    );
  }

  return executionResult;
}

function executionBindingsIssue(
  contract: GeneratedMechanicContract,
  bindings: readonly MechanicExecutionRealmBinding[],
  bindingAuthority: MechanicSourceBindingAuthority | undefined
): GeneratedMechanicSourceIssue | undefined {
  if (bindings.length !== contract.bindings.length) {
    return invalidExecutionBindingsIssue(
      "Mechanic execution bindings must exactly cover the accepted contract bindings."
    );
  }

  const bindingsById = new Map<StableId, MechanicExecutionRealmBinding>();
  for (const binding of bindings) {
    if (bindingsById.has(binding.id)) {
      return invalidExecutionBindingsIssue(
        `Mechanic execution binding "${binding.id}" is duplicated.`
      );
    }
    bindingsById.set(binding.id, binding);
  }

  if (
    contract.bindings.length > 0 &&
    !isMechanicObjectBindingAuthorityAuthentic(bindingAuthority)
  ) {
    return invalidExecutionBindingsIssue(
      "Mechanic execution bindings require trusted object-identity attestation."
    );
  }

  for (const declaration of contract.bindings) {
    const binding = bindingsById.get(declaration.id);
    if (!binding) {
      return invalidExecutionBindingsIssue(
        `Mechanic execution binding "${declaration.id}" is missing.`
      );
    }
    if (binding.cardinality !== declaration.cardinality) {
      return invalidExecutionBindingsIssue(
        `Mechanic execution binding "${declaration.id}" does not match contract cardinality "${declaration.cardinality}".`
      );
    }
    if (binding.handles.length !== declaration.objectIds.length) {
      return invalidExecutionBindingsIssue(
        `Mechanic execution binding "${declaration.id}" must supply exactly ${declaration.objectIds.length} admitted handle(s).`
      );
    }
    if (
      binding.handles.some(
        (handle) => typeof handle !== "object" || handle === null
      )
    ) {
      return invalidExecutionBindingsIssue(
        `Mechanic execution binding "${declaration.id}" contains a non-opaque handle value.`
      );
    }
    let admittedObjectIds: Array<StableId | undefined>;
    try {
      admittedObjectIds = binding.handles.map((handle) =>
        bindingAuthority?.objectIdForHandle(handle)
      );
    } catch {
      return invalidExecutionBindingsIssue(
        `Mechanic execution binding "${declaration.id}" could not be attested by the trusted object authority.`
      );
    }
    if (
      admittedObjectIds.some((objectId) => objectId === undefined) ||
      !sameStrings(
        admittedObjectIds
          .filter((objectId): objectId is StableId => objectId !== undefined)
          .sort(),
        [...declaration.objectIds].sort()
      )
    ) {
      return invalidExecutionBindingsIssue(
        `Mechanic execution binding "${declaration.id}" does not resolve to the contract-declared object identities.`
      );
    }
  }

  return undefined;
}

function invalidExecutionBindingsIssue(
  message: string
): GeneratedMechanicSourceIssue {
  return {
    path: "execution.bindings",
    code: "invalid_execution_bindings",
    message,
  };
}

function lifecycleInputMatchesContract(
  kind: GeneratedMechanicSourceCandidate["callbacks"][number]["kind"],
  input: JsonValue | undefined,
  contract: GeneratedMechanicContract,
  referenceCatalog: GeneratedMechanicReferenceCatalog
): boolean {
  switch (kind) {
    case "logical_action": {
      const actionIds = referenceCatalog.action ?? [];
      if (typeof input === "string") {
        return actionIds.includes(input);
      }
      if (!hasExactJsonKeys(input, ["actionId", "payload"])) {
        return false;
      }
      const actionId = input.actionId;
      return (
        typeof actionId === "string" && actionIds.includes(actionId)
      );
    }
    case "gameplay_event": {
      const inputPorts = contract.ports.filter(
        (port) => port.direction === "input"
      );
      const inputPort =
        typeof input === "object" && input !== null && !Array.isArray(input)
          ? inputPorts.find((port) => port.id === input.eventId)
          : undefined;
      const admittedEventIds = new Set([
        ...contract.behavior.triggers,
        ...inputPorts.map((port) => port.id),
      ]);
      if (typeof input === "string") {
        return (
          admittedEventIds.has(input) &&
          !inputPorts.some((port) => port.id === input)
        );
      }
      if (
        !hasExactJsonKeys(input, ["eventId", "payload"]) ||
        typeof input.eventId !== "string" ||
        !admittedEventIds.has(input.eventId)
      ) {
        return false;
      }
      return inputPort
        ? configDslValueMatches(
            inputPort.payload,
            input.payload,
            referenceCatalog
          )
        : true;
    }
    case "scheduled":
    case "fixed_step":
      return (
        hasExactJsonKeys(input, ["simulationTimeMilliseconds"]) &&
        typeof input.simulationTimeMilliseconds === "number" &&
        Number.isFinite(input.simulationTimeMilliseconds) &&
        input.simulationTimeMilliseconds >= 0
      );
    case "install":
    case "dispose":
      return input === undefined;
  }
}

function hasExactJsonKeys(
  value: JsonValue | undefined,
  keys: readonly string[]
): value is Readonly<Record<string, JsonValue>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return sameStrings(actualKeys, expectedKeys);
}

function validateCandidateAgainstContract(
  candidate: GeneratedMechanicSourceCandidate,
  contract: GeneratedMechanicContract
): GeneratedMechanicSourceIssue[] {
  const issues: GeneratedMechanicSourceIssue[] = [];
  if (candidate.contractId !== contract.id) {
    issues.push({
      path: "contractId",
      code: "candidate_contract_mismatch",
      message: `Source candidate contract "${candidate.contractId}" does not match accepted contract "${contract.id}".`,
    });
  }
  if (candidate.capabilityVersion !== contract.capabilityVersion) {
    issues.push({
      path: "capabilityVersion",
      code: "candidate_version_mismatch",
      message: `Source candidate capability version "${candidate.capabilityVersion}" does not match accepted version "${contract.capabilityVersion}".`,
    });
  }
  const callbackIds = new Set<string>();
  const callbackKinds = new Map<string, number>();
  candidate.callbacks.forEach((callback, index) => {
    if (callbackIds.has(callback.id)) {
      issues.push({
        path: `callbacks.${index}.id`,
        code: "duplicate_callback",
        message: `Lifecycle callback "${callback.id}" is duplicated.`,
      });
    }
    callbackIds.add(callback.id);
    callbackKinds.set(callback.kind, (callbackKinds.get(callback.kind) ?? 0) + 1);
  });
  const requiredKinds = new Set<string>([
    ...contract.lifecycle.callbacks,
    "dispose",
    ...(contract.lifecycle.fixedStep ? ["fixed_step"] : []),
  ]);
  for (const requiredKind of requiredKinds) {
    if ((callbackKinds.get(requiredKind) ?? 0) === 0) {
      issues.push({
        path: "callbacks",
        code: "callback_coverage_mismatch",
        message: `Accepted lifecycle callback kind "${requiredKind}" is missing from the source candidate.`,
      });
    }
  }
  for (const [kind, count] of callbackKinds) {
    if (!requiredKinds.has(kind) || count !== 1) {
      issues.push({
        path: "callbacks",
        code: "callback_coverage_mismatch",
        message: `Source candidate callback kind "${kind}" must occur exactly once and be declared by the accepted contract.`,
      });
    }
  }
  return issues;
}

function grantExactlyMatchesContract(
  grant: MechanicCapabilityGrant,
  contract: GeneratedMechanicContract
): boolean {
  if (
    grant.capabilityVersion !== contract.capabilityVersion ||
    grant.capabilities.length !== contract.capabilities.length
  ) {
    return false;
  }
  const version = getMechanicCapabilityVersion(contract.capabilityVersion);
  if (!version) {
    return false;
  }
  const definitions: ReadonlyMap<string, MechanicCapabilityDefinition> = new Map(
    version.capabilities.map((capability) => [capability.id, capability])
  );
  return grant.capabilities.every((capability, index) => {
    const expectedId = contract.capabilities[index];
    const definition = definitions.get(capability.id);
    return (
      capability.id === expectedId &&
      definition !== undefined &&
      capability.description === definition.description &&
      capability.authoring.member === definition.authoring.member &&
      capability.authoring.signature === definition.authoring.signature &&
      capability.runtimeOperation === definition.runtimeOperation &&
      sameStrings(capability.evaluation.actions, definition.evaluation.actions) &&
      sameStrings(
        capability.evaluation.observations,
        definition.evaluation.observations
      ) &&
      sameStrings(
        capability.evaluation.scenarioInputs ?? [],
        definition.evaluation.scenarioInputs ?? []
      ) &&
      capability.resourceCosts.operationsPerTick ===
        definition.resourceCosts.operationsPerTick &&
      capability.resourceCosts.ownedObjects ===
        definition.resourceCosts.ownedObjects &&
      capability.resourceCosts.scheduledCallbacks ===
        definition.resourceCosts.scheduledCallbacks &&
      capability.resourceCosts.subscriptions ===
        definition.resourceCosts.subscriptions &&
      capability.resourceCosts.signalsPerTick ===
        definition.resourceCosts.signalsPerTick &&
      capability.requiresOpaqueHandle === definition.requiresOpaqueHandle &&
      capability.justification.kind === "contract_declaration" &&
      capability.justification.path === `capabilities.${index}`
    );
  });
}

function sameStrings(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

type CompileCallbackInput = {
  callback: GeneratedMechanicSourceCandidate["callbacks"][number];
  callbackIndex: number;
  candidate: GeneratedMechanicSourceCandidate;
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
};

type CompileCallbackResult =
  | {
      success: true;
      data: {
        callback: GeneratedMechanicSourceArtifact["callbacks"][number];
        usedCapabilities: readonly StableId[];
      };
    }
  | { success: false; evidence: GeneratedMechanicSourceStageEvidence };

function compileCallback({
  callback,
  callbackIndex,
  candidate,
  contract,
  grant,
  referenceCatalog,
}: CompileCallbackInput): CompileCallbackResult {
  const wrapperName = GENERATED_MECHANIC_SOURCE_WRAPPER_NAME;
  const callbackWrapper = `const ${wrapperName} = async (): Promise<JsonValue | void> => {\n${callback.source}\n};`;
  const sourceFile = ts.createSourceFile(
    "generated-mechanic-callback.ts",
    callbackWrapper,
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TS
  );
  const parseDiagnostic = ts
    .transpileModule(callbackWrapper, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.None,
        strict: true,
        noEmit: true,
      },
      reportDiagnostics: true,
    })
    .diagnostics?.find(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    );
  if (parseDiagnostic) {
    return fail("source_compilation", "generated_mechanic_source_compilation_failed", [
      {
        path: `callbacks.${callbackIndex}.source`,
        code: "compile_failure",
        message: formatDiagnostic(parseDiagnostic),
      },
    ]);
  }

  const sourcePolicyResult = inspectTypeScriptSourcePolicy(
    sourceFile,
    callbackIndex,
    grant
  );
  if (!sourcePolicyResult.success) {
    return sourcePolicyResult;
  }

  const declarations = createTypeDeclarations({
    callbackKind: callback.kind,
    candidate,
    contract,
    grant,
    referenceCatalog,
  });
  const typecheckSource = `${declarations}\n${callbackWrapper}`;
  const typecheckContext = createTypeScriptTypecheckContext(typecheckSource);
  const typedAuthorityResult = inspectTypedDynamicAuthority(
    typecheckContext,
    callbackIndex
  );
  if (!typedAuthorityResult.success) {
    return typedAuthorityResult;
  }
  const typeDiagnostics = typecheckContext.diagnostics;
  if (typeDiagnostics.length > 0) {
    return fail("source_typecheck", "generated_mechanic_source_typecheck_failed", [
      {
        path: `callbacks.${callbackIndex}.source`,
        code: "type_failure",
        message: formatDiagnostic(typeDiagnostics[0]),
      },
    ]);
  }

  const transpiled = ts.transpileModule(callbackWrapper, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.None,
      strict: true,
      removeComments: true,
      newLine: ts.NewLineKind.LineFeed,
    },
    reportDiagnostics: true,
  });
  const compileDiagnostic = transpiled.diagnostics?.find(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );
  if (compileDiagnostic) {
    return fail("source_compilation", "generated_mechanic_source_compilation_failed", [
      {
        path: `callbacks.${callbackIndex}.source`,
        code: "compile_failure",
        message: formatDiagnostic(compileDiagnostic),
      },
    ]);
  }
  const normalizedJavaScript = transpiled.outputText.trim();
  const staticResult = inspectNormalizedJavaScriptAuthority(
    normalizedJavaScript,
    callbackIndex
  );
  if (!staticResult.success) {
    return staticResult;
  }
  return {
    success: true,
    data: {
      callback: Object.freeze({
        id: callback.id,
        kind: callback.kind,
        sourceTypeScript: callback.source,
        normalizedJavaScript,
      }),
      usedCapabilities: sourcePolicyResult.usedCapabilities,
    },
  };
}

const forbiddenAuthorityIdentifiers = new Set([
  "Atomics",
  "Buffer",
  "Date",
  "FinalizationRegistry",
  "Function",
  "Intl",
  "SharedArrayBuffer",
  "URL",
  "WeakRef",
  "WebAssembly",
  "WebSocket",
  "Worker",
  "XMLHttpRequest",
  "caches",
  "console",
  "crypto",
  "document",
  "eval",
  "fetch",
  "global",
  "globalThis",
  "indexedDB",
  "localStorage",
  "location",
  "module",
  "navigator",
  "performance",
  "process",
  "queueMicrotask",
  "require",
  "self",
  "sessionStorage",
  "setImmediate",
  "setInterval",
  "setTimeout",
  "window",
]);

const forbiddenDynamicPropertyNames = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

const forbiddenObjectReflectionMembers = new Set([
  "create",
  "defineProperties",
  "defineProperty",
  "getOwnPropertyDescriptor",
  "getOwnPropertyDescriptors",
  "getOwnPropertyNames",
  "getOwnPropertySymbols",
  "getPrototypeOf",
  "setPrototypeOf",
]);

const trustedSourceContextIdentifiers = new Set([
  "bindings",
  "capabilities",
  "config",
  "lifecycleInput",
]);

const allowedGeneratedSourceGlobals = new Set([
  ...trustedSourceContextIdentifiers,
  "Array",
  "BigInt",
  "Boolean",
  "Error",
  "Infinity",
  "JSON",
  "Map",
  "Math",
  "NaN",
  "Number",
  "Object",
  "Promise",
  "RangeError",
  "ReferenceError",
  "RegExp",
  "Set",
  "String",
  "Symbol",
  "SyntaxError",
  "TypeError",
  "decodeURI",
  "decodeURIComponent",
  "encodeURI",
  "encodeURIComponent",
  "isFinite",
  "isNaN",
  "parseFloat",
  "parseInt",
  "undefined",
]);

function inspectTypeScriptSourcePolicy(
  sourceFile: ts.SourceFile,
  callbackIndex: number,
  grant: MechanicCapabilityGrant
):
  | { success: true; usedCapabilities: readonly StableId[] }
  | { success: false; evidence: GeneratedMechanicSourceStageEvidence } {
  const memberToCapability = new Map(
    grant.capabilities.map((capability) => [
      capability.authoring.member,
      capability.id,
    ])
  );
  const usedCapabilities: StableId[] = [];
  const issues: GeneratedMechanicSourceIssue[] = [];
  const visit = (node: ts.Node) => {
    const shadowedName = trustedContextDeclarationName(node);
    if (shadowedName) {
      issues.push({
        path: `callbacks.${callbackIndex}.source`,
        code: "source_context_shadowing",
        message: `Generated mechanic source cannot shadow trusted source context "${shadowedName}".`,
      });
    }
    if (ts.isCallExpression(node)) {
      const member = capabilityMemberPath(node.expression);
      if (member) {
        const capabilityId = memberToCapability.get(member);
        if (capabilityId) {
          usedCapabilities.push(capabilityId);
          if (!ts.isAwaitExpression(node.parent)) {
            issues.push({
              path: `callbacks.${callbackIndex}.source`,
              code: "unawaited_capability_call",
              message: `Generated mechanic capability call "${member}" must be directly awaited.`,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (issues.length > 0) {
    return fail(
      "source_static_validation",
      "generated_mechanic_source_static_validation_failed",
      issues
    );
  }
  return { success: true, usedCapabilities: uniqueInOrder(usedCapabilities) };
}

function inspectNormalizedJavaScriptAuthority(
  normalizedJavaScript: string,
  callbackIndex: number
):
  | { success: true }
  | { success: false; evidence: GeneratedMechanicSourceStageEvidence } {
  const { sourceFile, checker } = createJavaScriptSemanticContext(
    normalizedJavaScript
  );
  const issues: GeneratedMechanicSourceIssue[] = [];
  const visit = (node: ts.Node) => {
    const explicitAuthority = forbiddenAuthorityReference(node, checker);
    if (explicitAuthority) {
      issues.push(forbiddenAuthorityIssue(callbackIndex, explicitAuthority));
      return;
    } else if (
      ts.isIdentifier(node) &&
      isIdentifierReference(node) &&
      !isLocallyDeclaredIdentifier(node, sourceFile, checker) &&
      (!allowedGeneratedSourceGlobals.has(node.text) ||
        ((node.text === "Math" || node.text === "Object") &&
          !isDirectIntrinsicMemberReference(node)))
    ) {
      issues.push(forbiddenAuthorityIssue(callbackIndex, node.text));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (issues.length > 0) {
    return fail(
      "source_static_validation",
      "generated_mechanic_source_static_validation_failed",
      issues
    );
  }
  return { success: true };
}

function inspectTypedDynamicAuthority(
  context: TypeScriptTypecheckContext,
  callbackIndex: number
):
  | { success: true }
  | { success: false; evidence: GeneratedMechanicSourceStageEvidence } {
  let forbiddenAuthority: string | undefined;
  const visitExplicit = (node: ts.Node) => {
    const authority =
      forbiddenAuthorityReference(node, context.checker) ??
      forbiddenBindingPropertyAuthority(node, context.checker, false);
    if (authority) {
      forbiddenAuthority = authority;
      return;
    }
    ts.forEachChild(node, visitExplicit);
  };
  visitExplicit(context.inspectionRoot);

  const visitDynamic = (node: ts.Node) => {
    if (
      ts.isElementAccessExpression(node) &&
      constantStringExpression(node.argumentExpression, context.checker) ===
        undefined &&
      !isProvablyNumericIndexExpression(
        node.argumentExpression,
        context.checker
      )
    ) {
      forbiddenAuthority = "constructor";
      return;
    }
    const destructuringAuthority =
      forbiddenBindingPropertyAuthority(node, context.checker, true) ??
      forbiddenAssignmentPropertyAuthority(node, context.checker, true);
    if (destructuringAuthority) {
      forbiddenAuthority = destructuringAuthority;
      return;
    }
    ts.forEachChild(node, visitDynamic);
  };
  if (!forbiddenAuthority) {
    visitDynamic(context.inspectionRoot);
  }
  return forbiddenAuthority
    ? fail(
        "source_static_validation",
        "generated_mechanic_source_static_validation_failed",
        [forbiddenAuthorityIssue(callbackIndex, forbiddenAuthority)]
      )
    : { success: true };
}

const safeNumericIndexBinaryOperators = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.AmpersandToken,
  ts.SyntaxKind.AsteriskAsteriskToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.BarToken,
  ts.SyntaxKind.CaretToken,
  ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
  ts.SyntaxKind.GreaterThanGreaterThanToken,
  ts.SyntaxKind.LessThanLessThanToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.SlashToken,
]);

function isProvablyNumericIndexExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  visitedSymbols = new Set<ts.Symbol>()
): boolean {
  if (ts.isNumericLiteral(expression)) {
    return true;
  }
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return isProvablyNumericIndexExpression(
      expression.expression,
      checker,
      visitedSymbols
    );
  }
  if (
    ts.isPrefixUnaryExpression(expression) &&
    (expression.operator === ts.SyntaxKind.PlusToken ||
      expression.operator === ts.SyntaxKind.MinusToken ||
      expression.operator === ts.SyntaxKind.TildeToken)
  ) {
    return isProvablyNumericIndexExpression(
      expression.operand,
      checker,
      visitedSymbols
    );
  }
  if (
    ts.isBinaryExpression(expression) &&
    safeNumericIndexBinaryOperators.has(expression.operatorToken.kind)
  ) {
    return (
      isProvablyNumericIndexExpression(
        expression.left,
        checker,
        visitedSymbols
      ) &&
      isProvablyNumericIndexExpression(
        expression.right,
        checker,
        visitedSymbols
      )
    );
  }
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  const symbol = checker.getSymbolAtLocation(expression);
  if (!symbol || visitedSymbols.has(symbol)) {
    return false;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (
    !declaration ||
    !ts.isVariableDeclaration(declaration) ||
    !declaration.initializer ||
    !ts.isVariableDeclarationList(declaration.parent) ||
    !(declaration.parent.flags & ts.NodeFlags.Const)
  ) {
    return false;
  }
  const nextVisitedSymbols = new Set(visitedSymbols);
  nextVisitedSymbols.add(symbol);
  return isProvablyNumericIndexExpression(
    declaration.initializer,
    checker,
    nextVisitedSymbols
  );
}

function forbiddenBindingPropertyAuthority(
  node: ts.Node,
  checker: ts.TypeChecker,
  includeDynamic: boolean
): string | undefined {
  if (
    !ts.isBindingElement(node) ||
    !ts.isObjectBindingPattern(node.parent)
  ) {
    return undefined;
  }
  const propertyName =
    node.propertyName ?? (ts.isIdentifier(node.name) ? node.name : undefined);
  if (!propertyName) {
    return undefined;
  }
  return forbiddenPropertyNameAuthority(
    propertyName,
    checker,
    includeDynamic
  );
}

function forbiddenAssignmentPropertyAuthority(
  node: ts.Node,
  checker: ts.TypeChecker,
  includeDynamic: boolean
): string | undefined {
  if (
    (!ts.isPropertyAssignment(node) &&
      !ts.isShorthandPropertyAssignment(node)) ||
    !isWithinAssignmentTarget(node)
  ) {
    return undefined;
  }
  return forbiddenPropertyNameAuthority(node.name, checker, includeDynamic);
}

function forbiddenPropertyNameAuthority(
  propertyName: ts.PropertyName,
  checker: ts.TypeChecker,
  includeDynamic: boolean
): string | undefined {
  if (ts.isComputedPropertyName(propertyName)) {
    const name = constantStringExpression(propertyName.expression, checker);
    if (name !== undefined) {
      return forbiddenDynamicPropertyNames.has(name) ? name : undefined;
    }
    return includeDynamic &&
      !isProvablyNumericIndexExpression(propertyName.expression, checker)
      ? "constructor"
      : undefined;
  }
  const name = propertyName.text;
  return forbiddenDynamicPropertyNames.has(name) ? name : undefined;
}

function isWithinAssignmentTarget(node: ts.Node): boolean {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.left === current
    ) {
      return true;
    }
    if (
      (ts.isForOfStatement(parent) || ts.isForInStatement(parent)) &&
      parent.initializer === current
    ) {
      return true;
    }
    if (ts.isFunctionLike(parent) || ts.isClassLike(parent)) {
      return false;
    }
    current = parent;
  }
  return false;
}

function forbiddenAuthorityIssue(
  callbackIndex: number,
  authority: string
): GeneratedMechanicSourceIssue {
  return {
    path: `callbacks.${callbackIndex}.source`,
    code: "forbidden_source_authority",
    message: `Generated mechanic source cannot reference forbidden authority "${authority}".`,
  };
}

function createJavaScriptSemanticContext(sourceText: string): {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
} {
  const fileName = "/generated-mechanic-callback.js";
  const options: ts.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    noEmit: true,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.ES2020,
  };
  const host = createInMemoryCompilerHost({
    fileName,
    sourceText,
    scriptKind: ts.ScriptKind.JS,
    options,
  });
  const program = ts.createProgram([fileName], options, host);
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error("Normalized mechanic JavaScript could not be inspected.");
  }
  return { sourceFile, checker: program.getTypeChecker() };
}

function isLocallyDeclaredIdentifier(
  node: ts.Identifier,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker
): boolean {
  return Boolean(
    checker
      .getSymbolAtLocation(node)
      ?.declarations?.some(
        (declaration) => declaration.getSourceFile() === sourceFile
      )
  );
}

function isDirectIntrinsicMemberReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return true;
  }
  return (
    ts.isElementAccessExpression(parent) &&
    parent.expression === node &&
    ts.isStringLiteralLike(parent.argumentExpression)
  );
}

function isIdentifierReference(node: ts.Identifier): boolean {
  const parent = node.parent;
  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isGetAccessorDeclaration(parent) && parent.name === node) ||
    (ts.isSetAccessorDeclaration(parent) && parent.name === node) ||
    (ts.isLabeledStatement(parent) && parent.label === node) ||
    ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) &&
      parent.label === node)
  ) {
    return false;
  }
  return true;
}

function forbiddenAuthorityReference(
  node: ts.Node,
  checker: ts.TypeChecker
): string | undefined {
  if (
    ts.isIdentifier(node) &&
    (forbiddenAuthorityIdentifiers.has(node.text) || node.text === "realm")
  ) {
    return node.text;
  }
  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    return "import";
  }
  if (
    ts.isMetaProperty(node) &&
    node.keywordToken === ts.SyntaxKind.ImportKeyword
  ) {
    return "import";
  }
  if (
    ts.isElementAccessExpression(node) &&
    constantStringExpression(node.argumentExpression, checker) === undefined &&
    expressionResolvesToCallable(node.expression, checker)
  ) {
    return "constructor";
  }
  const property = accessedProperty(node, checker);
  if (!property) {
    return undefined;
  }
  if (
    property.owner === "Math" &&
    property.name === "random"
  ) {
    return "Math.random";
  }
  if (
    property.owner === "Object" &&
    forbiddenObjectReflectionMembers.has(property.name)
  ) {
    return `Object.${property.name}`;
  }
  return forbiddenDynamicPropertyNames.has(property.name)
    ? property.name
    : undefined;
}

function accessedProperty(
  node: ts.Node,
  checker: ts.TypeChecker
): { owner?: string; name: string } | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return {
      ...(ts.isIdentifier(node.expression)
        ? { owner: node.expression.text }
        : {}),
      name: node.name.text,
    };
  }
  if (ts.isElementAccessExpression(node)) {
    const propertyName = constantStringExpression(
      node.argumentExpression,
      checker
    );
    if (propertyName === undefined) {
      return undefined;
    }
    return {
      ...(ts.isIdentifier(node.expression)
        ? { owner: node.expression.text }
        : {}),
      name: propertyName,
    };
  }
  return undefined;
}

function constantStringExpression(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  visitedSymbols = new Set<ts.Symbol>()
): string | undefined {
  if (
    ts.isStringLiteralLike(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return constantStringExpression(
      expression.expression,
      checker,
      visitedSymbols
    );
  }
  if (
    ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = constantStringExpression(
      expression.left,
      checker,
      visitedSymbols
    );
    const right = constantStringExpression(
      expression.right,
      checker,
      visitedSymbols
    );
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (!ts.isIdentifier(expression)) {
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(expression);
  if (!symbol || visitedSymbols.has(symbol)) {
    return undefined;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (
    !declaration ||
    !ts.isVariableDeclaration(declaration) ||
    !declaration.initializer ||
    !ts.isVariableDeclarationList(declaration.parent) ||
    !(declaration.parent.flags & ts.NodeFlags.Const)
  ) {
    return undefined;
  }
  const nextVisitedSymbols = new Set(visitedSymbols);
  nextVisitedSymbols.add(symbol);
  return constantStringExpression(
    declaration.initializer,
    checker,
    nextVisitedSymbols
  );
}

function expressionResolvesToCallable(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  visitedSymbols = new Set<ts.Symbol>()
): boolean {
  if (ts.isParenthesizedExpression(expression)) {
    return expressionResolvesToCallable(
      expression.expression,
      checker,
      visitedSymbols
    );
  }
  if (
    ts.isArrowFunction(expression) ||
    ts.isFunctionExpression(expression) ||
    ts.isClassExpression(expression)
  ) {
    return true;
  }
  if (ts.isConditionalExpression(expression)) {
    return (
      expressionResolvesToCallable(
        expression.whenTrue,
        checker,
        visitedSymbols
      ) ||
      expressionResolvesToCallable(
        expression.whenFalse,
        checker,
        visitedSymbols
      )
    );
  }
  if (!ts.isIdentifier(expression)) {
    return false;
  }
  const symbol = checker.getSymbolAtLocation(expression);
  if (!symbol || visitedSymbols.has(symbol)) {
    return false;
  }
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  if (
    !declaration ||
    !ts.isVariableDeclaration(declaration) ||
    !declaration.initializer
  ) {
    return false;
  }
  const nextVisitedSymbols = new Set(visitedSymbols);
  nextVisitedSymbols.add(symbol);
  return expressionResolvesToCallable(
    declaration.initializer,
    checker,
    nextVisitedSymbols
  );
}

function trustedContextDeclarationName(node: ts.Node): string | undefined {
  let name: ts.BindingName | ts.Identifier | undefined;
  if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
    name = node.name;
  } else if (ts.isCatchClause(node)) {
    name = node.variableDeclaration?.name;
  } else if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node)
  ) {
    name = node.name;
  }
  return name ? firstTrustedBindingName(name) : undefined;
}

function firstTrustedBindingName(name: ts.BindingName): string | undefined {
  if (ts.isIdentifier(name)) {
    return trustedSourceContextIdentifiers.has(name.text)
      ? name.text
      : undefined;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      const nested = firstTrustedBindingName(element.name);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function capabilityMemberPath(expression: ts.Expression): string | undefined {
  if (!ts.isPropertyAccessExpression(expression)) {
    return undefined;
  }
  const member = expression.name.text;
  const groupExpression = expression.expression;
  if (
    !ts.isPropertyAccessExpression(groupExpression) ||
    !ts.isIdentifier(groupExpression.expression) ||
    groupExpression.expression.text !== "capabilities"
  ) {
    return undefined;
  }
  return `${groupExpression.name.text}.${member}`;
}

function createTypeDeclarations(input: {
  callbackKind: GeneratedMechanicSourceCandidate["callbacks"][number]["kind"];
  candidate: GeneratedMechanicSourceCandidate;
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
}): string {
  const { callbackKind, candidate, contract, grant, referenceCatalog } = input;
  const stateIds = contract.privateState.map((state) => state.id);
  const archetypeIds = contract.ownedObjects.map((object) => object.id);
  const outputPortIds = contract.ports
    .filter((port) => port.direction === "output")
    .map((port) => port.id);
  const inputPortIds = contract.ports
    .filter((port) => port.direction === "input")
    .map((port) => port.id);
  const eventIds = uniqueInOrder([
    ...contract.behavior.triggers,
    ...inputPortIds,
  ]);
  const scheduledCallbackIds = candidate.callbacks
    .filter((callback) => callback.kind === "scheduled")
    .map((callback) => callback.id);
  const gameplayEventCallbackIds = candidate.callbacks
    .filter((callback) => callback.kind === "gameplay_event")
    .map((callback) => callback.id);
  const capabilityGroups = new Map<string, string[]>();
  for (const capability of grant.capabilities) {
    const [group, member] = capability.authoring.member.split(".");
    if (!group || !member) {
      continue;
    }
    const signature = capabilitySignature({
      capability,
      contract,
      referenceCatalog,
    });
    const members = capabilityGroups.get(group) ?? [];
    members.push(`readonly ${quoteProperty(member)}: ${signature};`);
    capabilityGroups.set(group, members);
  }
  const capabilitiesType = [...capabilityGroups]
    .map(
      ([group, members]) =>
        `readonly ${quoteProperty(group)}: Readonly<{ ${members.join(" ")} }>;`
    )
    .join("\n");
  const bindingsType = contract.bindings
    .map(
      (binding) =>
        `readonly ${quoteProperty(binding.id)}: ${
          binding.cardinality === "one"
            ? "MechanicObjectHandle"
            : "readonly MechanicObjectHandle[]"
        };`
    )
    .join("\n");
  return `
type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];
declare const mechanicObjectHandleBrand: unique symbol;
type MechanicObjectHandle = Readonly<{ readonly [mechanicObjectHandleBrand]: "MechanicObjectHandle" }>;
type MechanicObjectPoint = Readonly<{ x: number; y: number }>;
type MechanicObjectObservation = Readonly<{ active: boolean; kind: string; position: MechanicObjectPoint; properties: Readonly<Record<string, JsonValue>>; velocity: MechanicObjectPoint }>;
type MechanicMotionMutation = Readonly<{ position?: MechanicObjectPoint; velocity?: MechanicObjectPoint }>;
type MechanicSpatialQuery = Readonly<Record<string, JsonValue>>;
type MechanicStateId = ${stringUnion(stateIds)};
type MechanicOwnedObjectArchetypeId = ${stringUnion(archetypeIds)};
type MechanicPortId = ${stringUnion(outputPortIds)};
type MechanicEventId = ${stringUnion(eventIds)};
type MechanicScheduledCallbackId = ${stringUnion(scheduledCallbackIds)};
type MechanicGameplayEventCallbackId = ${stringUnion(gameplayEventCallbackIds)};
type MechanicScheduleId = string;
type MechanicSubscriptionId = string;
type MechanicSimulationMilliseconds = number;
declare const capabilities: Readonly<{ ${capabilitiesType} }>;
declare const bindings: Readonly<{ ${bindingsType} }>;
declare const config: ${configDslType(contract.config, referenceCatalog)};
declare const lifecycleInput: ${lifecycleInputType(
    callbackKind,
    contract,
    referenceCatalog
  )};
`;
}

function capabilitySignature(input: {
  capability: MechanicCapabilityDefinition;
  contract: GeneratedMechanicContract;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
}): string {
  switch (input.capability.id) {
    case "signal_emit":
      return signalEmitSignature(input.contract, input.referenceCatalog);
    default:
      return sourceFacingCapabilitySignature(
        input.capability.id,
        input.capability.authoring.signature
      );
  }
}

function signalEmitSignature(
  contract: GeneratedMechanicContract,
  referenceCatalog: GeneratedMechanicReferenceCatalog
): string {
  const outputPorts = contract.ports.filter(
    (port) => port.direction === "output"
  );
  if (outputPorts.length === 0) {
    return "(portId: never, value: never) => Promise<void>";
  }
  return outputPorts
    .map(
      (port) =>
        `((portId: ${JSON.stringify(port.id)}, value: ${configDslType(
          port.payload,
          referenceCatalog
        )}) => Promise<void>)`
    )
    .join(" & ");
}

function configDslType(
  declaration: MechanicConfigDslValue,
  referenceCatalog: GeneratedMechanicReferenceCatalog
): string {
  switch (declaration.kind) {
    case "boolean":
      return "boolean";
    case "number":
    case "integer":
      return "number";
    case "string":
      return "string";
    case "enum":
      return stringUnion(declaration.values);
    case "stable_id":
      return stringUnion(referenceCatalog[declaration.referenceKind] ?? []);
    case "collection":
      return `readonly (${configDslType(declaration.item, referenceCatalog)})[]`;
    case "object":
      return `Readonly<{ ${declaration.fields
        .map(
          (field) =>
            `readonly ${quoteProperty(field.key)}${field.required ? "" : "?"}: ${configDslType(field.value, referenceCatalog)};`
        )
        .join(" ")} }>`;
  }
}

function lifecycleInputType(
  kind: GeneratedMechanicSourceCandidate["callbacks"][number]["kind"],
  contract: GeneratedMechanicContract,
  referenceCatalog: GeneratedMechanicReferenceCatalog
): string {
  switch (kind) {
    case "logical_action": {
      const actionIds = stringUnion(referenceCatalog.action ?? []);
      return `${actionIds} | Readonly<{ actionId: ${actionIds}; payload: JsonValue }>`;
    }
    case "gameplay_event": {
      const inputPorts = contract.ports.filter(
        (port) => port.direction === "input"
      );
      const inputPortIds = new Set(inputPorts.map((port) => port.id));
      const nonPortEventIds = contract.behavior.triggers.filter(
        (eventId) => !inputPortIds.has(eventId)
      );
      const variants = [
        ...nonPortEventIds.flatMap((eventId) => [
          JSON.stringify(eventId),
          `Readonly<{ eventId: ${JSON.stringify(eventId)}; payload: JsonValue }>`,
        ]),
        ...inputPorts.map(
          (port) =>
            `Readonly<{ eventId: ${JSON.stringify(port.id)}; payload: ${configDslType(
              port.payload,
              referenceCatalog
            )} }>`
        ),
      ];
      return variants.length > 0 ? variants.join(" | ") : "never";
    }
    case "scheduled":
    case "fixed_step":
      return "Readonly<{ simulationTimeMilliseconds: number }>";
    default:
      return "undefined";
  }
}

type TypeScriptTypecheckContext = {
  sourceFile: ts.SourceFile;
  inspectionRoot: ts.Node;
  checker: ts.TypeChecker;
  diagnostics: readonly ts.Diagnostic[];
};

const generatedSourceTypecheckLibrary = `
type PropertyKey = string | number | symbol;
type Readonly<T> = { readonly [Key in keyof T]: T[Key] };
type Record<Key extends PropertyKey, Value> = { [Property in Key]: Value };
interface Object {}
interface Function extends Object {
  readonly length: number;
  readonly name: string;
  readonly prototype: unknown;
  readonly constructor: Function;
  apply(thisArg: unknown, argArray?: readonly unknown[]): unknown;
  bind(thisArg: unknown, ...argArray: readonly unknown[]): Function;
  call(thisArg: unknown, ...argArray: readonly unknown[]): unknown;
}
interface CallableFunction extends Function {}
interface NewableFunction extends Function {}
interface IArguments {
  readonly length: number;
  readonly [index: number]: unknown;
}
interface String extends Object {
  readonly length: number;
  readonly [index: number]: string;
  charAt(index: number): string;
  concat(...strings: readonly string[]): string;
  endsWith(searchString: string): boolean;
  includes(searchString: string): boolean;
  indexOf(searchString: string): number;
  replace(searchValue: string | RegExp, replaceValue: string): string;
  slice(start?: number, end?: number): string;
  split(separator?: string | RegExp): string[];
  startsWith(searchString: string): boolean;
  substring(start: number, end?: number): string;
  toLowerCase(): string;
  toUpperCase(): string;
  trim(): string;
}
interface Number extends Object {
  toFixed(fractionDigits?: number): string;
  toString(radix?: number): string;
  valueOf(): number;
}
interface BigInt extends Object {
  toString(radix?: number): string;
  valueOf(): bigint;
}
interface Boolean extends Object { valueOf(): boolean; }
interface RegExp extends Object {}
interface IteratorYieldResult<Value> { done?: false; value: Value; }
interface IteratorReturnResult<Return> { done: true; value: Return; }
type IteratorResult<Value, Return = any> = IteratorYieldResult<Value> | IteratorReturnResult<Return>;
interface Iterator<Value, Return = any, Next = any> {
  next(...args: [] | [Next]): IteratorResult<Value, Return>;
  return?(value?: Return): IteratorResult<Value, Return>;
  throw?(error?: any): IteratorResult<Value, Return>;
}
interface Iterable<Value, Return = any, Next = any> {
  [Symbol.iterator](): Iterator<Value, Return, Next>;
}
interface ReadonlyArray<Value> extends Iterable<Value> {
  readonly length: number;
  readonly [index: number]: Value;
  concat(...items: readonly (Value | readonly Value[])[]): Value[];
  every(predicate: (value: Value, index: number) => unknown): boolean;
  filter(predicate: (value: Value, index: number) => unknown): Value[];
  find(predicate: (value: Value, index: number) => unknown): Value | undefined;
  findIndex(predicate: (value: Value, index: number) => unknown): number;
  flatMap<Result>(callback: (value: Value, index: number) => Result | readonly Result[]): Result[];
  forEach(callback: (value: Value, index: number) => void): void;
  includes(searchElement: Value): boolean;
  indexOf(searchElement: Value): number;
  join(separator?: string): string;
  map<Result>(callback: (value: Value, index: number) => Result): Result[];
  reduce(callback: (previous: Value, current: Value, index: number) => Value): Value;
  slice(start?: number, end?: number): Value[];
  some(predicate: (value: Value, index: number) => unknown): boolean;
}
interface Array<Value> extends ReadonlyArray<Value> {
  [index: number]: Value;
  length: number;
  pop(): Value | undefined;
  push(...items: readonly Value[]): number;
  reverse(): Value[];
  shift(): Value | undefined;
  sort(compare?: (left: Value, right: Value) => number): Value[];
  splice(start: number, deleteCount?: number, ...items: readonly Value[]): Value[];
  unshift(...items: readonly Value[]): number;
}
interface PromiseLike<Value> {
  then<Result = Value>(onfulfilled?: (value: Value) => Result | PromiseLike<Result>): PromiseLike<Result>;
}
interface Promise<Value> extends PromiseLike<Value> {
  catch<Result = never>(onrejected?: (reason: unknown) => Result | PromiseLike<Result>): Promise<Value | Result>;
  then<Result = Value>(onfulfilled?: (value: Value) => Result | PromiseLike<Result>): Promise<Result>;
}
interface SymbolConstructor {
  readonly iterator: unique symbol;
  (description?: string | number): symbol;
  for(key: string): symbol;
  keyFor(symbol: symbol): string | undefined;
}
declare const Symbol: SymbolConstructor;
interface ObjectConstructor {
  (value?: unknown): unknown;
  assign<Target extends object>(target: Target, ...sources: readonly object[]): Target;
  entries(value: object): [string, unknown][];
  freeze<Value>(value: Value): Readonly<Value>;
  fromEntries(entries: Iterable<readonly [PropertyKey, unknown]>): object;
  keys(value: object): string[];
  values(value: object): unknown[];
}
declare const Object: ObjectConstructor;
interface ArrayConstructor {
  new <Value>(...items: readonly Value[]): Value[];
  isArray(value: unknown): value is unknown[];
}
declare const Array: ArrayConstructor;
interface StringConstructor { (value?: unknown): string; }
declare const String: StringConstructor;
interface NumberConstructor {
  (value?: unknown): number;
  isFinite(value: unknown): boolean;
  isInteger(value: unknown): boolean;
  isNaN(value: unknown): boolean;
}
declare const Number: NumberConstructor;
interface BigIntConstructor {
  (value?: string | number | bigint | boolean): bigint;
  asIntN(bits: number, value: bigint): bigint;
  asUintN(bits: number, value: bigint): bigint;
}
declare const BigInt: BigIntConstructor;
interface BooleanConstructor { (value?: unknown): boolean; }
declare const Boolean: BooleanConstructor;
interface PromiseConstructor {
  new <Value>(executor: (resolve: (value: Value | PromiseLike<Value>) => void, reject: (reason?: unknown) => void) => void): Promise<Value>;
  all<Values extends readonly unknown[]>(values: Values): Promise<Values>;
  reject(reason?: unknown): Promise<never>;
  resolve<Value>(value: Value | PromiseLike<Value>): Promise<Value>;
}
declare const Promise: PromiseConstructor;
interface RegExpConstructor { new (pattern: string, flags?: string): RegExp; (pattern: string, flags?: string): RegExp; }
declare const RegExp: RegExpConstructor;
interface Map<Key, Value> extends Iterable<readonly [Key, Value]> {
  readonly size: number;
  clear(): void;
  delete(key: Key): boolean;
  get(key: Key): Value | undefined;
  has(key: Key): boolean;
  set(key: Key, value: Value): this;
}
interface MapConstructor { new <Key, Value>(entries?: readonly (readonly [Key, Value])[]): Map<Key, Value>; }
declare const Map: MapConstructor;
interface Set<Value> extends Iterable<Value> {
  readonly size: number;
  add(value: Value): this;
  clear(): void;
  delete(value: Value): boolean;
  has(value: Value): boolean;
}
interface SetConstructor { new <Value>(values?: readonly Value[]): Set<Value>; }
declare const Set: SetConstructor;
interface Error { readonly message: string; readonly name: string; }
interface ErrorConstructor { new (message?: string): Error; (message?: string): Error; }
declare const Error: ErrorConstructor;
declare const RangeError: ErrorConstructor;
declare const ReferenceError: ErrorConstructor;
declare const SyntaxError: ErrorConstructor;
declare const TypeError: ErrorConstructor;
interface JSON {
  parse(text: string): unknown;
  stringify(value: unknown): string | undefined;
}
declare const JSON: JSON;
interface Math {
  abs(value: number): number;
  ceil(value: number): number;
  floor(value: number): number;
  max(...values: readonly number[]): number;
  min(...values: readonly number[]): number;
  round(value: number): number;
  random(): number;
  sign(value: number): number;
  sqrt(value: number): number;
  trunc(value: number): number;
}
declare const Math: Math;
declare const Infinity: number;
declare const NaN: number;
declare function decodeURI(encodedURI: string): string;
declare function decodeURIComponent(encodedURIComponent: string): string;
declare function encodeURI(uri: string): string;
declare function encodeURIComponent(uriComponent: string): string;
declare function isFinite(number: number): boolean;
declare function isNaN(number: number): boolean;
declare function parseFloat(string: string): number;
declare function parseInt(string: string, radix?: number): number;
`;

function createTypeScriptTypecheckContext(
  sourceText: string
): TypeScriptTypecheckContext {
  const fileName = "/generated-mechanic-callback.ts";
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    strict: true,
    noEmit: true,
    noLib: true,
    noResolve: true,
    skipLibCheck: true,
  };
  const admittedSourceText = `${generatedSourceTypecheckLibrary}\n${sourceText}`;
  const host = createInMemoryCompilerHost({
    fileName,
    sourceText: admittedSourceText,
    scriptKind: ts.ScriptKind.TS,
    options,
  });
  const program = ts.createProgram([fileName], options, host);
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error("Generated mechanic TypeScript could not be inspected.");
  }
  const inspectionDeclaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find(
      (declaration) =>
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === GENERATED_MECHANIC_SOURCE_WRAPPER_NAME
    );
  if (!inspectionDeclaration?.initializer) {
    throw new Error("Generated mechanic TypeScript callback could not be inspected.");
  }
  return {
    sourceFile,
    inspectionRoot: inspectionDeclaration.initializer,
    checker: program.getTypeChecker(),
    diagnostics: ts
      .getPreEmitDiagnostics(program)
      .filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
      ),
  };
}

function createInMemoryCompilerHost(input: {
  fileName: string;
  sourceText: string;
  scriptKind: ts.ScriptKind;
  options: ts.CompilerOptions;
}): ts.CompilerHost {
  return {
    fileExists: (requestedFileName) => requestedFileName === input.fileName,
    getCanonicalFileName: (requestedFileName) => requestedFileName,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "/generated-mechanic-no-lib.d.ts",
    getNewLine: () => "\n",
    getSourceFile: (requestedFileName, languageVersion) =>
      requestedFileName === input.fileName
        ? ts.createSourceFile(
            input.fileName,
            input.sourceText,
            languageVersion,
            true,
            input.scriptKind
          )
        : undefined,
    readFile: (requestedFileName) =>
      requestedFileName === input.fileName ? input.sourceText : undefined,
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined,
  };
}

function createExecutionSource(input: {
  callback: GeneratedMechanicSourceArtifact["callbacks"][number];
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  config: JsonValue;
  lifecycleInput?: JsonValue;
}): string {
  return createRuntimeCallbackSource(
    input,
    `const lifecycleInput = __sparklineFreezeJson(${JSON.stringify(input.lifecycleInput)});`
  );
}

export function createGeneratedMechanicLifecycleCallbackSource(input: {
  callback: GeneratedMechanicSourceArtifact["callbacks"][number];
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  config: JsonValue;
}): string {
  return createRuntimeCallbackSource(input, "");
}

function createRuntimeCallbackSource(
  input: {
    callback: GeneratedMechanicSourceArtifact["callbacks"][number];
    contract: GeneratedMechanicContract;
    grant: MechanicCapabilityGrant;
    config: JsonValue;
  },
  lifecycleInputDeclaration: string
): string {
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
${lifecycleInputDeclaration}
${input.callback.normalizedJavaScript}
return await __sparklineGeneratedMechanicCallback();
`.trim();
}

function stringUnion(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => JSON.stringify(value)).join(" | ") : "never";
}

function quoteProperty(value: string): string {
  return JSON.stringify(value);
}

function uniqueInOrder<Value>(values: readonly Value[]): Value[] {
  return [...new Set(values)];
}

function formatDiagnostic(diagnostic: ts.Diagnostic | undefined): string {
  return diagnostic
    ? ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
    : "Generated mechanic TypeScript is invalid.";
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
      : "Mechanic Execution Realm rejected the generated source artifact.";
}

function createRuntimeExecutionEvidence(input: {
  artifact: GeneratedMechanicSourceArtifact;
  executionId: StableId;
  callbackId: StableId;
  result?: MechanicExecutionRealmExecutionResult;
}): NonNullable<GeneratedMechanicSourceStageEvidence["runtimeExecution"]> {
  return {
    sourceArtifactId: input.artifact.id,
    contractId: input.artifact.contractId,
    intentId: input.artifact.intentId,
    capabilityVersion: input.artifact.capabilityVersion,
    executionId: input.executionId,
    callbackId: input.callbackId,
    ...(input.result ? { result: input.result } : {}),
  };
}

function realmFailure(
  path: string,
  message: string,
  code: GeneratedMechanicSourceIssue["code"] = "realm_rejection",
  runtimeExecution?: NonNullable<
    GeneratedMechanicSourceStageEvidence["runtimeExecution"]
  >
) {
  return fail(
    "realm_execution",
    "generated_mechanic_source_realm_rejected",
    [{ path, code, message }],
    runtimeExecution
  );
}

function fail<
  Stage extends GeneratedMechanicSourceStageEvidence["stage"],
  Code extends GeneratedMechanicSourceStageEvidence["code"],
>(
  stage: Stage,
  code: Code,
  issues: readonly GeneratedMechanicSourceIssue[],
  runtimeExecution?: NonNullable<
    GeneratedMechanicSourceStageEvidence["runtimeExecution"]
  >
): { success: false; evidence: GeneratedMechanicSourceStageEvidence } {
  return {
    success: false,
    evidence: {
      stage,
      code,
      issues: Object.freeze([...issues]),
      ...(runtimeExecution
        ? { runtimeExecution: deepFreeze(structuredClone(runtimeExecution)) }
        : {}),
    },
  };
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
