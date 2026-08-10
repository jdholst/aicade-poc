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
import { stableIdSchema, type JsonValue, type StableId } from "@/game-spec/game-spec-schema";
import { configDslValueMatches } from "@/game-spec/mechanics/generated-mechanic-contract";
import {
  MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
  type MechanicExecutionRealmAdapter,
  type MechanicExecutionRealmBinding,
  type MechanicExecutionRealmCapabilityHost,
  type MechanicExecutionRealmExecutionResult,
  type MechanicExecutionRealmResourceBudget,
} from "@/runtime/mechanics/mechanic-execution-realm";

export const GENERATED_MECHANIC_SOURCE_CANDIDATE_VERSION =
  "generated_mechanic_source_candidate/v1";
export const GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION =
  "generated_mechanic_source_artifact/v1";
export const GENERATED_MECHANIC_SOURCE_STATIC_VALIDATION_VERSION =
  "generated_mechanic_source_static_validation/v1";

const callbackKindSchema = z.enum([
  "install",
  "logical_action",
  "gameplay_event",
  "scheduled",
  "fixed_step",
  "dispose",
]);

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
    | "invalid_execution_config"
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
    capabilityHost: MechanicExecutionRealmCapabilityHost;
    seed: number;
    resourceBudget: MechanicExecutionRealmResourceBudget;
  };
};

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

  if (!configDslValueMatches(contract.config, execution.config, referenceCatalog)) {
    return fail("source_validation", "invalid_generated_mechanic_source", [
      {
        path: "execution.config",
        code: "invalid_execution_config",
        message:
          "Mechanic execution config does not match the accepted contract config declaration.",
      },
    ]);
  }

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

  if (
    realmAdapter.adapterVersion !== MECHANIC_EXECUTION_REALM_ADAPTER_VERSION
  ) {
    return realmFailure(
      "realmAdapter.adapterVersion",
      `Mechanic Execution Realm adapter version "${realmAdapter.adapterVersion}" is not admitted.`
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
    return realmFailure("realmAdapter.create", errorMessage(error));
  }

  let executionResult: BuildAndExecuteGeneratedMechanicSourceResult;
  try {
    const run = realm.execute({
      id: execution.id,
      source: createExecutionSource({
        callback: selectedCallback,
        contract,
        grant,
        config: execution.config,
        lifecycleInput: execution.lifecycleInput,
      }),
    });
    const result = await run.result;
    if (result.outcome !== "completed") {
      executionResult = realmFailure(
        "realm.execute",
        result.diagnostic?.message ??
          `Mechanic Execution Realm rejected the artifact with outcome "${result.outcome}".`
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
    executionResult = realmFailure("realm.execute", errorMessage(error));
  }

  try {
    realm.dispose();
  } catch (error) {
    return realmFailure(
      "realm.dispose",
      errorMessage(error),
      "realm_cleanup_failure"
    );
  }

  return executionResult;
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
  const wrapperName = "__sparklineGeneratedMechanicCallback";
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
  const typeDiagnostics = getTypeDiagnostics(typecheckSource);
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
    const explicitAuthority = forbiddenAuthorityReference(node);
    if (explicitAuthority) {
      issues.push(forbiddenAuthorityIssue(callbackIndex, explicitAuthority));
    } else if (
      ts.isIdentifier(node) &&
      isIdentifierReference(node) &&
      !checker.getSymbolAtLocation(node) &&
      (!allowedGeneratedSourceGlobals.has(node.text) ||
        (node.text === "Math" && !isDirectMathMemberReference(node)))
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
  const host = ts.createCompilerHost(options);
  host.getSourceFile = (requestedFileName, languageVersion) =>
    requestedFileName === fileName
      ? ts.createSourceFile(
          fileName,
          sourceText,
          languageVersion,
          true,
          ts.ScriptKind.JS
        )
      : undefined;
  host.readFile = (requestedFileName) =>
    requestedFileName === fileName ? sourceText : undefined;
  host.fileExists = (requestedFileName) => requestedFileName === fileName;
  const program = ts.createProgram([fileName], options, host);
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    throw new Error("Normalized mechanic JavaScript could not be inspected.");
  }
  return { sourceFile, checker: program.getTypeChecker() };
}

function isDirectMathMemberReference(node: ts.Identifier): boolean {
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

function forbiddenAuthorityReference(node: ts.Node): string | undefined {
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
  const property = accessedProperty(node);
  if (!property) {
    return undefined;
  }
  if (
    property.owner === "Math" &&
    property.name === "random"
  ) {
    return "Math.random";
  }
  return forbiddenDynamicPropertyNames.has(property.name)
    ? property.name
    : undefined;
}

function accessedProperty(
  node: ts.Node
): { owner?: string; name: string } | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return {
      ...(ts.isIdentifier(node.expression)
        ? { owner: node.expression.text }
        : {}),
      name: node.name.text,
    };
  }
  if (
    ts.isElementAccessExpression(node) &&
    ts.isStringLiteralLike(node.argumentExpression)
  ) {
    return {
      ...(ts.isIdentifier(node.expression)
        ? { owner: node.expression.text }
        : {}),
      name: node.argumentExpression.text,
    };
  }
  return undefined;
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
  const eventIds = contract.behavior.triggers;
  const callbackIds = candidate.callbacks.map((callback) => callback.id);
  const capabilityGroups = new Map<string, string[]>();
  for (const capability of grant.capabilities) {
    const [group, member] = capability.authoring.member.split(".");
    if (!group || !member) {
      continue;
    }
    const signature =
      capability.id === "signal_emit"
        ? signalEmitSignature(contract, referenceCatalog)
        : asAsyncSignature(capability.authoring.signature);
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
type MechanicCallbackId = ${stringUnion(callbackIds)};
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

function asAsyncSignature(signature: string): string {
  const marker = "=>";
  const markerIndex = signature.lastIndexOf(marker);
  if (markerIndex < 0) {
    return signature;
  }
  const parameters = signature.slice(0, markerIndex).trim();
  const result = signature.slice(markerIndex + marker.length).trim();
  return `${parameters} => Promise<${result}>`;
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
      const inputPorts = contract.ports.filter(
        (port) => port.direction === "input"
      );
      if (inputPorts.length === 0) {
        return "string | Readonly<{ actionId: string; payload: JsonValue }>";
      }
      return inputPorts
        .flatMap((port) => [
          JSON.stringify(port.id),
          `Readonly<{ actionId: ${JSON.stringify(port.id)}; payload: ${configDslType(
            port.payload,
            referenceCatalog
          )} }>`,
        ])
        .join(" | ");
    }
    case "gameplay_event": {
      const eventIds = stringUnion(contract.behavior.triggers);
      return `${eventIds} | Readonly<{ eventId: ${eventIds}; payload: JsonValue }>`;
    }
    case "scheduled":
    case "fixed_step":
      return "Readonly<{ simulationTimeMilliseconds: number }>";
    default:
      return "undefined";
  }
}

function getTypeDiagnostics(sourceText: string): readonly ts.Diagnostic[] {
  const fileName = "/generated-mechanic-callback.ts";
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  };
  const host = ts.createCompilerHost(options);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultReadFile = host.readFile.bind(host);
  const defaultFileExists = host.fileExists.bind(host);
  host.getSourceFile = (requestedFileName, languageVersion, onError) =>
    requestedFileName === fileName
      ? ts.createSourceFile(
          fileName,
          sourceText,
          languageVersion,
          true,
          ts.ScriptKind.TS
        )
      : defaultGetSourceFile(requestedFileName, languageVersion, onError);
  host.readFile = (requestedFileName) =>
    requestedFileName === fileName ? sourceText : defaultReadFile(requestedFileName);
  host.fileExists = (requestedFileName) =>
    requestedFileName === fileName || defaultFileExists(requestedFileName);
  const program = ts.createProgram([fileName], options, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
}

function createExecutionSource(input: {
  callback: GeneratedMechanicSourceArtifact["callbacks"][number];
  contract: GeneratedMechanicContract;
  grant: MechanicCapabilityGrant;
  config: JsonValue;
  lifecycleInput?: JsonValue;
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
const lifecycleInput = __sparklineFreezeJson(${JSON.stringify(input.lifecycleInput)});
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

function realmFailure(
  path: string,
  message: string,
  code: GeneratedMechanicSourceIssue["code"] = "realm_rejection"
) {
  return fail("realm_execution", "generated_mechanic_source_realm_rejected", [
    { path, code, message },
  ]);
}

function fail<
  Stage extends GeneratedMechanicSourceStageEvidence["stage"],
  Code extends GeneratedMechanicSourceStageEvidence["code"],
>(
  stage: Stage,
  code: Code,
  issues: readonly GeneratedMechanicSourceIssue[]
): { success: false; evidence: GeneratedMechanicSourceStageEvidence } {
  return {
    success: false,
    evidence: {
      stage,
      code,
      issues: Object.freeze([...issues]),
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
