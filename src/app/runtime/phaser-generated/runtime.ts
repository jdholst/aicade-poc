import {
  acceptedGeneratedMechanicArtifactSchema,
  generatedMechanicRuntimeCandidateSchema,
  projectAcceptedGeneratedMechanicExecutableArtifact,
  type GeneratedMechanicExecutableArtifact,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import type { JsonValue } from "@/game-spec/game-spec-schema";
import type { PreparedGeneratedMechanicRuntimeProject } from "@/game-spec/game-pack/generated-mechanic-project-handoff";
import type {
  ContainedMechanicRuntimeStep,
  MechanicRuntimeFailureEvidence,
} from "@/runtime/mechanics/contained-mechanic-runtime";
import {
  GENERATED_MECHANIC_RUNTIME_SESSION_VERSION,
  createGeneratedMechanicRuntimeSession,
  type GeneratedMechanicRuntimeSession,
  type GeneratedMechanicRuntimeSessionIdentity,
} from "@/runtime/mechanics/generated-mechanic-runtime-session";
import {
  createSesWorkerMechanicExecutionRealmAdapter,
  type CreateSesWorkerMechanicExecutionRealmAdapterInput,
  type SesWorkerMechanicExecutionRealmController,
} from "@/runtime/mechanics/ses-worker-mechanic-execution-realm";
import type { GeneratedMechanicPhaserChildSession } from "@/runtime/phaser/generated-mechanic-phaser-host-protocol";
import type {
  TrustedTopDownPhaserMechanicObject,
  TrustedTopDownPhaserMechanicObjectRegistration,
  TrustedTopDownPhaserOwnedObjectFactory,
} from "@/runtime/phaser/top-down-mechanic-object-adapter";
import {
  createTopDownPhaserTemplate,
  type HandAuthoredPhaserTemplate,
} from "@/runtime/phaser/top-down-template";
import { parseRuntimeEvent, type RuntimeEvent } from "@/runtime/runtime-adapter";

const PHASER_ARCADE_RUNTIME_PATH =
  "/runtime/phaser/phaser-arcade-physics.min.js";
const TOP_DOWN_RUNTIME_PATH = "/runtime/phaser/top-down-template.js";
const INSTALLATION_DEADLINE_MILLISECONDS = 5_000;

const TRUSTED_DEPENDENCY_INSTALLERS: Readonly<Record<string, string>> =
  Object.freeze({
    "/runtime/phaser/mechanics/player-movement.js": "install_player_movement",
    "/runtime/phaser/mechanics/pickup-collection.js": "install_pickup_collection",
    "/runtime/phaser/mechanics/enemy-chase.js": "install_enemy_chase",
    "/runtime/phaser/mechanics/hazard-contact.js": "install_hazard_contact",
  });

const ROUTE_GLOBAL_KEYS = Object.freeze([
  "__AICADE_PHASER_TEMPLATE__",
  "__AICADE_GENERATED_MECHANIC_HOST__",
  "__AICADE_RUNTIME_NOTIFY__",
  "__AICADE_RUNTIME_AUTHORIZE_COMMAND__",
] as const);

const SCRIPT_GLOBAL_KEYS = Object.freeze([
  "Phaser",
  "__AICADE_TOP_DOWN_MECHANICS__",
] as const);

type RuntimeGlobal = Record<string, unknown>;

type GeneratedMechanicInstallInput = Readonly<{
  gameSpec: HandAuthoredPhaserTemplate["gameSpec"];
  mechanic: HandAuthoredPhaserTemplate["gameSpec"]["mechanics"][number];
  template: HandAuthoredPhaserTemplate;
  getEntityDefinition(
    entityId: string
  ): HandAuthoredPhaserTemplate["gameSpec"]["entities"][number] | null;
  getEntityHandle(entityId: string): TrustedTopDownPhaserMechanicObject | null;
  createOwnedObject(input: {
    objectId: string;
    objectKind: string;
    initial: JsonValue;
  }): ReturnType<TrustedTopDownPhaserOwnedObjectFactory>;
}>;

type TopDownRetainedGeneratedMechanicSession = Readonly<{
  identity: GeneratedMechanicRuntimeSessionIdentity;
  advanceSimulation(elapsedMilliseconds: number): Promise<void>;
  dispatchLogicalAction(actionId: string): Promise<void>;
  dispose(): Promise<void>;
}>;

type TrustedScriptLoaderInput = Readonly<{
  document: Document;
  path: string;
  signal: AbortSignal;
}>;

export type GeneratedMechanicPhaserRouteDependencies = Readonly<{
  createRealmAdapter(
    input: CreateSesWorkerMechanicExecutionRealmAdapterInput
  ): ReturnType<typeof createSesWorkerMechanicExecutionRealmAdapter>;
  createRuntimeSession: typeof createGeneratedMechanicRuntimeSession;
  loadScript(input: TrustedScriptLoaderInput): Promise<HTMLScriptElement>;
}>;

export type GeneratedMechanicPhaserRouteWaiters = Readonly<{
  controller: Promise<SesWorkerMechanicExecutionRealmController>;
  project: Promise<GeneratedMechanicPhaserChildSession>;
}>;

export type TrustedGeneratedMechanicPhaserRoute = Readonly<{
  ready: Promise<void>;
  dispose(): Promise<void>;
}>;

export type CreateTrustedGeneratedMechanicPhaserRouteInput = Readonly<{
  waiters: GeneratedMechanicPhaserRouteWaiters;
  ownerDocument?: Document;
  ownerWindow?: Window;
  runtimeGlobal?: RuntimeGlobal;
  dependencies?: GeneratedMechanicPhaserRouteDependencies;
}>;

const defaultDependencies: GeneratedMechanicPhaserRouteDependencies =
  Object.freeze({
    createRealmAdapter: createSesWorkerMechanicExecutionRealmAdapter,
    createRuntimeSession: createGeneratedMechanicRuntimeSession,
    loadScript: loadTrustedScript,
  });

/**
 * Owns one trusted iframe runtime. The prepared project and generated source
 * remain in this closure; only the authored template and narrow runtime hooks
 * are exposed to the trusted Phaser scripts while the route is active.
 */
export function createTrustedGeneratedMechanicPhaserRoute({
  waiters,
  ownerDocument = requireBrowserDocument(),
  ownerWindow = requireBrowserWindow(),
  runtimeGlobal = globalThis as RuntimeGlobal,
  dependencies = defaultDependencies,
}: CreateTrustedGeneratedMechanicPhaserRouteInput): TrustedGeneratedMechanicPhaserRoute {
  const abortController = new AbortController();
  const installation = createDeferred<TopDownRetainedGeneratedMechanicSession>();
  const loadedScripts: HTMLScriptElement[] = [];
  let childSession: GeneratedMechanicPhaserChildSession | undefined;
  let controller: SesWorkerMechanicExecutionRealmController | undefined;
  let runtimeSession: GeneratedMechanicRuntimeSession | undefined;
  let runtimeSessionDisposal: Promise<void> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  let hostInstallStarted = false;
  let controllerClaimed = false;
  let installCompleted = false;
  let fatalEventPosted = false;
  let topDownScriptStarted = false;
  let listenersInstalled = false;
  let runtimeGlobalsClaimed = false;
  let childSessionDisposed = false;
  let controllerTerminated = false;

  const terminateController = (
    target: SesWorkerMechanicExecutionRealmController | undefined = controller
  ) => {
    if (!target || controllerTerminated) {
      return;
    }
    controllerTerminated = true;
    target.terminate();
  };

  const disposeChildSession = (
    target: GeneratedMechanicPhaserChildSession | undefined = childSession
  ) => {
    if (!target || childSessionDisposed) {
      return;
    }
    childSessionDisposed = true;
    target.dispose();
  };

  const removeRuntimeGlobals = (errors: unknown[]) => {
    if (!runtimeGlobalsClaimed) {
      return;
    }
    for (const key of [...ROUTE_GLOBAL_KEYS, ...SCRIPT_GLOBAL_KEYS]) {
      try {
        if (!Reflect.deleteProperty(runtimeGlobal, key)) {
          errors.push(
            new Error(`Trusted generated runtime global "${key}" could not be removed.`)
          );
        }
      } catch (error) {
        errors.push(error);
      }
    }
  };

  const postFatalEvent = (error: unknown) => {
    if (fatalEventPosted) {
      return;
    }
    fatalEventPosted = true;
    const message = errorMessage(error);
    try {
      childSession?.postRuntimeEvent({
        type: "game-error",
        issue: {
          type: "runtime-error",
          severity: "error",
          recoverable: false,
          message,
        },
        message,
      });
    } catch {
      // The authenticated child session may already have been disposed.
    }
    installation.reject(error instanceof Error ? error : new Error(message));
  };

  const disposeRuntimeSession = () => {
    if (!runtimeSession) {
      return Promise.resolve();
    }
    runtimeSessionDisposal ??= runtimeSession
      .dispose()
      .then((step) => requireCompletedStep(step, "dispose"));
    return runtimeSessionDisposal;
  };

  const onBeforeUnload = () => {
    void cleanup(false).catch(() => undefined);
  };

  const onWindowError = (event: ErrorEvent) => {
    postFatalEvent(
      event.error ?? new Error(event.message || "Phaser runtime crashed.")
    );
    queueCleanup();
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    postFatalEvent(
      event.reason instanceof Error
        ? event.reason
        : new Error(errorMessage(event.reason))
    );
    queueCleanup();
  };

  const cleanup = (dispatchRuntimeTeardown: boolean): Promise<void> => {
    if (cleanupPromise) {
      return cleanupPromise;
    }
    abortController.abort();
    installation.reject(new Error("The trusted generated runtime was disposed."));
    cleanupPromise = Promise.resolve().then(async () => {
      const errors: unknown[] = [];
      if (dispatchRuntimeTeardown && topDownScriptStarted) {
        try {
          ownerWindow.dispatchEvent(new Event("beforeunload"));
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        await disposeRuntimeSession();
      } catch (error) {
        errors.push(error);
        postFatalEvent(error);
      }
      try {
        terminateController();
      } catch (error) {
        errors.push(error);
      }
      if (listenersInstalled) {
        ownerWindow.removeEventListener("beforeunload", onBeforeUnload);
        ownerWindow.removeEventListener("error", onWindowError);
        ownerWindow.removeEventListener(
          "unhandledrejection",
          onUnhandledRejection
        );
        listenersInstalled = false;
      }
      for (const script of loadedScripts.splice(0)) {
        script.remove();
      }
      removeRuntimeGlobals(errors);
      try {
        disposeChildSession();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          "Trusted generated Phaser runtime cleanup did not complete."
        );
      }
    });
    return cleanupPromise;
  };

  function queueCleanup() {
    queueMicrotask(() => {
      void cleanup(true).catch(() => undefined);
    });
  }

  const ready = (async () => {
    try {
      const projectPromise = waiters.project.then((session) => {
        if (abortController.signal.aborted) {
          disposeChildSession(session);
          throw new Error(
            "The authenticated generated mechanic project arrived after runtime disposal."
          );
        }
        childSession = session;
        return session;
      });
      const controllerPromise = waiters.controller.then((nextController) => {
        if (abortController.signal.aborted) {
          terminateController(nextController);
          throw new Error(
            "The brokered generated mechanic controller arrived after runtime disposal."
          );
        }
        controller = nextController;
        return nextController;
      });
      const [authenticatedChild, brokeredController] = await Promise.all([
        projectPromise,
        controllerPromise,
      ]);
      assertActive(abortController.signal);

      const template = authenticatedChild.getTemplate();
      const project = authenticatedChild.getProject();
      const trustedProject = validateTrustedProject(template, project);
      const { artifact, expectedMechanic, runtimeExecutionId } = trustedProject;
      const trustedScriptPaths = validateTrustedScriptPaths(template);
      rejectExistingRuntimeGlobals(runtimeGlobal);
      runtimeGlobalsClaimed = true;

      const realmAdapter = dependencies.createRealmAdapter({
        createController() {
          if (controllerClaimed) {
            throw new Error(
              "The brokered generated mechanic controller is single-use."
            );
          }
          controllerClaimed = true;
          return brokeredController;
        },
      });

      const host = Object.freeze({
        mechanicId: artifact.mechanicId,
        ownedObjectKinds: Object.freeze([
          ...new Set(
            artifact.contract.ownedObjects.map(({ objectKind }) => objectKind)
          ),
        ]),
        async install(
          input: GeneratedMechanicInstallInput
        ): Promise<TopDownRetainedGeneratedMechanicSession> {
          if (hostInstallStarted) {
            throw new Error(
              "The generated mechanic host installation is single-use."
            );
          }
          hostInstallStarted = true;
          try {
            validateHostInstallInput(input, template, expectedMechanic);
            const objects = createExactBoundEntityRegistrations(
              artifact,
              template,
              input
            );
            const ownedObjectFactories = createExactOwnedObjectFactories(
              artifact,
              input
            );
            const createdSession = await dependencies.createRuntimeSession(
              "runtimeCandidate" in project
                ? {
                    runtimeCandidate: project.runtimeCandidate,
                    dependency: project.dependency,
                    realmAdapter,
                    objects,
                    ownedObjectFactories,
                  }
                : {
                    artifact: project.artifact,
                    dependency: project.dependency,
                    realmAdapter,
                    objects,
                    ownedObjectFactories,
                  }
            );
            runtimeSession = createdSession;
            if (abortController.signal.aborted) {
              await disposeRuntimeSession();
              throw new Error(
                "The generated mechanic session was created after runtime disposal."
              );
            }
            validateRuntimeIdentity(
              createdSession.identity,
              artifact,
              runtimeExecutionId
            );
            assertActive(abortController.signal);
            requireCompletedStep(await createdSession.install(), "install");
            if (!controllerClaimed) {
              throw new Error(
                "The generated mechanic runtime did not claim its brokered controller."
              );
            }
            installCompleted = true;
            const retained = Object.freeze({
              identity: createdSession.identity,
              async advanceSimulation(elapsedMilliseconds: number) {
                requireCompletedStep(
                  await createdSession.advanceSimulation(elapsedMilliseconds),
                  "advance"
                );
              },
              async dispatchLogicalAction(actionId: string) {
                requireCompletedStep(
                  await createdSession.dispatchLogicalAction(actionId),
                  "logical action"
                );
              },
              dispose: disposeRuntimeSession,
            });
            installation.resolve(retained);
            return retained;
          } catch (error) {
            installation.reject(error);
            throw error;
          }
        },
      });

      const notify = (candidate: unknown) => {
        if (fatalEventPosted) {
          return;
        }
        const runtimeEvent = parseRuntimeEvent(candidate);
        if (!runtimeEvent) {
          postFatalEvent(
            new Error("The trusted Phaser runtime emitted an invalid event.")
          );
          queueCleanup();
          return;
        }
        if (runtimeEvent.type === "game-ready") {
          try {
            validateReadyEvent(runtimeEvent, runtimeSession, installCompleted);
          } catch (error) {
            postFatalEvent(error);
            queueCleanup();
            return;
          }
        }
        authenticatedChild.postRuntimeEvent(candidate);
        if (
          runtimeEvent.type === "game-error" &&
          !runtimeEvent.issue.recoverable
        ) {
          fatalEventPosted = true;
          installation.reject(new Error(runtimeEvent.message));
          queueCleanup();
        }
      };

      defineRuntimeGlobal(runtimeGlobal, "__AICADE_PHASER_TEMPLATE__", template);
      defineRuntimeGlobal(runtimeGlobal, "__AICADE_GENERATED_MECHANIC_HOST__", host);
      defineRuntimeGlobal(runtimeGlobal, "__AICADE_RUNTIME_NOTIFY__", notify);
      defineRuntimeGlobal(
        runtimeGlobal,
        "__AICADE_RUNTIME_AUTHORIZE_COMMAND__",
        (event: MessageEvent<unknown>) =>
          authenticatedChild.consumeRuntimeCommand(event)
      );
      ownerWindow.addEventListener("beforeunload", onBeforeUnload);
      ownerWindow.addEventListener("error", onWindowError);
      ownerWindow.addEventListener(
        "unhandledrejection",
        onUnhandledRejection
      );
      listenersInstalled = true;

      for (const path of trustedScriptPaths) {
        assertActive(abortController.signal);
        if (path === TOP_DOWN_RUNTIME_PATH) {
          topDownScriptStarted = true;
        }
        const script = await dependencies.loadScript({
          document: ownerDocument,
          path,
          signal: abortController.signal,
        });
        loadedScripts.push(script);
        validateLoadedScriptEffect(path, runtimeGlobal);
      }

      await waitForInstallation(installation.promise, abortController.signal);
      assertActive(abortController.signal);
    } catch (error) {
      postFatalEvent(error);
      try {
        await cleanup(true);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Trusted generated Phaser runtime failed and cleanup did not complete."
        );
      }
      throw error;
    }
  })();

  void ready.catch(() => undefined);
  return Object.freeze({ ready, dispose: () => cleanup(true) });
}

function validateTrustedProject(
  template: HandAuthoredPhaserTemplate,
  project: PreparedGeneratedMechanicRuntimeProject
): Readonly<{
  artifact: GeneratedMechanicExecutableArtifact;
  expectedMechanic: HandAuthoredPhaserTemplate["gameSpec"]["mechanics"][number];
  runtimeExecutionId: string;
}> {
  const candidateResult = "runtimeCandidate" in project
    ? generatedMechanicRuntimeCandidateSchema.safeParse(project.runtimeCandidate)
    : undefined;
  const acceptedResult = "artifact" in project
    ? acceptedGeneratedMechanicArtifactSchema.safeParse(project.artifact)
    : undefined;
  if (
    (candidateResult && !candidateResult.success) ||
    (acceptedResult && !acceptedResult.success) ||
    (!candidateResult && !acceptedResult)
  ) {
    throw new TypeError(
      "The generated mechanic iframe requires a valid candidate or accepted artifact."
    );
  }
  const artifact = candidateResult?.success
    ? candidateResult.data.executableArtifact
    : projectAcceptedGeneratedMechanicExecutableArtifact(
        acceptedResult!.data
      );
  const runtimeExecutionId = candidateResult?.success
    ? candidateResult.data.runtimeExecutionId
    : acceptedResult!.data.buildId;
  if (!jsonEqual(artifact.finalGameSpec, project.dependency.finalGameSpec)) {
    throw new Error(
      "The generated mechanic iframe dependency does not contain the exact Final Game Spec from the executable artifact."
    );
  }
  const canonicalTemplate = createTopDownPhaserTemplate(
    project.dependency.finalGameSpec.gameSpec
  );
  if (!jsonEqual(template, canonicalTemplate)) {
    throw new Error(
      "The generated mechanic iframe requires the exact canonical top-down template."
    );
  }
  const dependency = project.dependency;
  if (
    !jsonEqual(artifact.contract, dependency.contract) ||
    !jsonEqual(artifact.sourceArtifact, dependency.sourceArtifact) ||
    !jsonEqual(artifact.referenceCatalog, dependency.referenceCatalog) ||
    !jsonEqual(artifact.runtimePolicy, dependency.runtimePolicy)
  ) {
    throw new Error(
      "The generated mechanic iframe project dependency does not exactly match its executable artifact."
    );
  }
  if (
    artifact.finalGameSpecArtifactId !== dependency.finalGameSpec.id ||
    artifact.gameSpecId !== dependency.finalGameSpec.gameSpec.id ||
    !jsonEqual(template.gameSpec, dependency.finalGameSpec.gameSpec)
  ) {
    throw new Error(
      "The generated mechanic iframe Final Game Spec identity does not match its executable artifact."
    );
  }
  const mechanics = template.gameSpec.mechanics.filter(
    ({ id }) => id === artifact.mechanicId
  );
  if (
    mechanics.length !== 1 ||
    mechanics[0]?.type !== artifact.mechanicType ||
    !jsonEqual(mechanics[0]?.config, artifact.config)
  ) {
    throw new Error(
      "The generated mechanic iframe requires the exact executable mechanic."
    );
  }
  return Object.freeze({
    artifact,
    expectedMechanic: mechanics[0],
    runtimeExecutionId,
  });
}

function validateTrustedScriptPaths(
  template: HandAuthoredPhaserTemplate
): readonly string[] {
  if (template.runtimeScriptPath !== TOP_DOWN_RUNTIME_PATH) {
    throw new Error("The generated mechanic iframe runtime script is untrusted.");
  }
  const seen = new Set<string>();
  for (const path of template.runtimeDependencyScriptPaths) {
    if (!Object.hasOwn(TRUSTED_DEPENDENCY_INSTALLERS, path) || seen.has(path)) {
      throw new Error(
        `The generated mechanic iframe dependency script "${path}" is untrusted.`
      );
    }
    seen.add(path);
  }
  return Object.freeze([
    PHASER_ARCADE_RUNTIME_PATH,
    ...template.runtimeDependencyScriptPaths,
    TOP_DOWN_RUNTIME_PATH,
  ]);
}

function rejectExistingRuntimeGlobals(runtimeGlobal: RuntimeGlobal): void {
  const existing = [...ROUTE_GLOBAL_KEYS, ...SCRIPT_GLOBAL_KEYS].find((key) =>
    Object.hasOwn(runtimeGlobal, key)
  );
  if (existing) {
    throw new Error(
      `The generated mechanic iframe runtime global "${existing}" is already occupied.`
    );
  }
}

function defineRuntimeGlobal(
  runtimeGlobal: RuntimeGlobal,
  key: (typeof ROUTE_GLOBAL_KEYS)[number],
  value: unknown
): void {
  Object.defineProperty(runtimeGlobal, key, {
    configurable: true,
    enumerable: false,
    value,
    writable: false,
  });
}

function validateHostInstallInput(
  input: GeneratedMechanicInstallInput,
  template: HandAuthoredPhaserTemplate,
  expectedMechanic: HandAuthoredPhaserTemplate["gameSpec"]["mechanics"][number]
): void {
  if (
    input.template !== template ||
    input.gameSpec !== template.gameSpec ||
    input.mechanic !== expectedMechanic ||
    typeof input.getEntityDefinition !== "function" ||
    typeof input.getEntityHandle !== "function" ||
    typeof input.createOwnedObject !== "function"
  ) {
    throw new Error(
      "The generated mechanic host received a foreign Phaser installation context."
    );
  }
}

function createExactOwnedObjectFactories(
  artifact: GeneratedMechanicExecutableArtifact,
  input: GeneratedMechanicInstallInput
): Readonly<Record<string, TrustedTopDownPhaserOwnedObjectFactory>> {
  const factories = Object.create(null) as Record<
    string,
    TrustedTopDownPhaserOwnedObjectFactory
  >;
  for (const { objectKind } of artifact.contract.ownedObjects) {
    if (Object.prototype.hasOwnProperty.call(factories, objectKind)) {
      continue;
    }
    factories[objectKind] = ({ objectId, initial }) =>
      input.createOwnedObject({ objectId, objectKind, initial });
  }
  return Object.freeze(factories);
}

function createExactBoundEntityRegistrations(
  artifact: GeneratedMechanicExecutableArtifact,
  template: HandAuthoredPhaserTemplate,
  input: GeneratedMechanicInstallInput
): readonly TrustedTopDownPhaserMechanicObjectRegistration[] {
  const registrations: TrustedTopDownPhaserMechanicObjectRegistration[] = [];
  const registeredIds = new Set<string>();
  for (const binding of artifact.bindings) {
    if (binding.referenceKind !== "entity") {
      throw new Error(
        `Generated mechanic binding "${binding.id}" does not target a Phaser entity.`
      );
    }
    for (const entityId of binding.objectIds) {
      if (registeredIds.has(entityId)) {
        continue;
      }
      const expectedDefinition = template.gameSpec.entities.find(
        ({ id }) => id === entityId
      );
      const definition = input.getEntityDefinition(entityId);
      if (!expectedDefinition || definition !== expectedDefinition) {
        throw new Error(
          `Generated mechanic bound entity "${entityId}" has no exact definition.`
        );
      }
      const object = input.getEntityHandle(entityId);
      if (!isTrustedObjectHandle(object)) {
        throw new Error(
          `Generated mechanic bound entity "${entityId}" has no usable Phaser handle.`
        );
      }
      registeredIds.add(entityId);
      registrations.push(
        Object.freeze({
          id: entityId,
          kind: definition.role,
          object,
        })
      );
    }
  }
  return Object.freeze(registrations);
}

function validateRuntimeIdentity(
  identity: GeneratedMechanicRuntimeSessionIdentity,
  artifact: GeneratedMechanicExecutableArtifact,
  runtimeExecutionId: string
): void {
  if (
    identity.schemaVersion !== GENERATED_MECHANIC_RUNTIME_SESSION_VERSION ||
    identity.artifactId !== artifact.id ||
    identity.extensionId !== artifact.extensionId ||
    identity.extensionVersionId !== artifact.versionId ||
    identity.finalGameSpecArtifactId !== artifact.finalGameSpecArtifactId ||
    identity.gameSpecId !== artifact.gameSpecId ||
    identity.mechanicId !== artifact.mechanicId ||
    identity.mechanicType !== artifact.mechanicType ||
    identity.contractId !== artifact.contract.id ||
    identity.sourceArtifactId !== artifact.sourceArtifact.id ||
    identity.capabilityVersion !== artifact.contract.capabilityVersion ||
    identity.runtimeExecutionId !== runtimeExecutionId ||
    identity.buildId !== runtimeExecutionId ||
    !jsonEqual(identity.runtimePolicy, artifact.runtimePolicy)
  ) {
    throw new Error(
      "The retained generated mechanic session returned a foreign identity."
    );
  }
}

function validateReadyEvent(
  event: Extract<RuntimeEvent, { type: "game-ready" }>,
  session: GeneratedMechanicRuntimeSession | undefined,
  installCompleted: boolean
): void {
  if (!installCompleted || !session) {
    throw new Error(
      "The Phaser runtime announced game-ready before generated mechanic installation completed."
    );
  }
  if (
    !isRecord(event.manifest) ||
    !jsonEqual(event.manifest.generatedMechanic, session.identity)
  ) {
    throw new Error(
      "The Phaser runtime announced game-ready with a foreign generated mechanic identity."
    );
  }
}

function validateLoadedScriptEffect(
  path: string,
  runtimeGlobal: RuntimeGlobal
): void {
  if (path === PHASER_ARCADE_RUNTIME_PATH) {
    if (!isRecord(runtimeGlobal.Phaser)) {
      throw new Error("The trusted Phaser base script did not install Phaser.");
    }
    return;
  }
  if (path === TOP_DOWN_RUNTIME_PATH) {
    return;
  }
  const installerKey = TRUSTED_DEPENDENCY_INSTALLERS[path];
  const registry = runtimeGlobal.__AICADE_TOP_DOWN_MECHANICS__;
  if (
    !installerKey ||
    !isRecord(registry) ||
    typeof registry[installerKey] !== "function"
  ) {
    throw new Error(
      `The trusted Phaser dependency script "${path}" did not install its expected mechanic.`
    );
  }
}

function requireCompletedStep(
  step: ContainedMechanicRuntimeStep,
  phase: "install" | "advance" | "logical action" | "dispose"
): void {
  if (step.outcome === "completed") {
    return;
  }
  throw containedFailureError(phase, step.evidence);
}

function containedFailureError(
  phase: "install" | "advance" | "logical action" | "dispose",
  evidence: MechanicRuntimeFailureEvidence
): Error {
  const message =
    evidence.failure.kind === "exception"
      ? evidence.failure.message
      : `${evidence.failure.dimension} exceeded ${evidence.failure.limit}.`;
  return new Error(`Generated mechanic ${phase} failed: ${message}`, {
    cause: evidence,
  });
}

function isTrustedObjectHandle(
  value: TrustedTopDownPhaserMechanicObject | null
): value is TrustedTopDownPhaserMechanicObject {
  return (
    isRecord(value) &&
    typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y)
  );
}

async function waitForInstallation(
  installation: Promise<TopDownRetainedGeneratedMechanicSession>,
  signal: AbortSignal
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () =>
        reject(
          new Error("Generated mechanic Phaser installation timed out.")
        ),
      INSTALLATION_DEADLINE_MILLISECONDS
    );
    abortListener = () =>
      reject(new Error("Generated mechanic Phaser installation was aborted."));
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    await Promise.race([installation, deadline]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (abortListener) {
      signal.removeEventListener("abort", abortListener);
    }
  }
}

function createDeferred<Value>() {
  let resolvePromise: (value: Value) => void = () => undefined;
  let rejectPromise: (error: unknown) => void = () => undefined;
  let settled = false;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  void promise.catch(() => undefined);
  return Object.freeze({
    promise,
    resolve(value: Value) {
      if (!settled) {
        settled = true;
        resolvePromise(value);
      }
    },
    reject(error: unknown) {
      if (!settled) {
        settled = true;
        rejectPromise(error);
      }
    },
  });
}

async function loadTrustedScript({
  document: ownerDocument,
  path,
  signal,
}: TrustedScriptLoaderInput): Promise<HTMLScriptElement> {
  assertActive(signal);
  const script = ownerDocument.createElement("script");
  script.dataset.aicadeGeneratedRuntime = "true";
  script.async = false;
  script.setAttribute("src", path);
  return await new Promise<HTMLScriptElement>((resolve, reject) => {
    let settled = false;
    const finish = (
      outcome: { success: true } | { success: false; error: Error }
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      if (outcome.success) {
        resolve(script);
      } else {
        script.remove();
        reject(outcome.error);
      }
    };
    const onLoad = () => finish({ success: true });
    const onError = () =>
      finish({
        success: false,
        error: new Error(`Trusted runtime script "${path}" failed to load.`),
      });
    const onAbort = () =>
      finish({
        success: false,
        error: new Error(`Trusted runtime script "${path}" was aborted.`),
      });
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    ownerDocument.head.append(script);
  });
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error("The trusted generated Phaser runtime has been disposed.");
  }
}

function requireBrowserWindow(): Window {
  if (typeof window === "undefined") {
    throw new Error("The generated mechanic Phaser route requires a browser window.");
  }
  return window;
}

function requireBrowserDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error(
      "The generated mechanic Phaser route requires a browser document."
    );
  }
  return document;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error || "Generated mechanic Phaser runtime failed.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(child)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
