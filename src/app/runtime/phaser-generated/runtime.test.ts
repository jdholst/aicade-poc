import { describe, expect, it, vi } from "vitest";

import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import {
  GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
  type AcceptedGeneratedMechanicArtifact,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import type { MechanicExecutionRealmAdapter } from "@/runtime/mechanics/mechanic-execution-realm";
import { MECHANIC_EXECUTION_REALM_ADAPTER_VERSION } from "@/runtime/mechanics/mechanic-execution-realm";
import type { GeneratedMechanicRuntimeSession } from "@/runtime/mechanics/generated-mechanic-runtime-session";
import type { SesWorkerMechanicExecutionRealmController } from "@/runtime/mechanics/ses-worker-mechanic-execution-realm";
import type { GeneratedMechanicPhaserChildSession } from "@/runtime/phaser/generated-mechanic-phaser-host-protocol";
import type { TrustedTopDownPhaserMechanicObject } from "@/runtime/phaser/top-down-mechanic-object-adapter";
import { createTopDownPhaserTemplate } from "@/runtime/phaser/top-down-template";
import type { RuntimeCommand } from "@/runtime/runtime-adapter";

import {
  createTrustedGeneratedMechanicPhaserRoute,
  type GeneratedMechanicPhaserRouteDependencies,
} from "./runtime";

const TRUSTED_SCRIPT_PATHS = [
  "/runtime/phaser/phaser-arcade-physics.min.js",
  "/runtime/phaser/mechanics/player-movement.js",
  "/runtime/phaser/mechanics/pickup-collection.js",
  "/runtime/phaser/mechanics/enemy-chase.js",
  "/runtime/phaser/mechanics/hazard-contact.js",
  "/runtime/phaser/top-down-template.js",
] as const;

describe("createTrustedGeneratedMechanicPhaserRoute", () => {
  it("boots exact trusted scripts, retains one generated session, and cleans every owned seam once", async () => {
    const harness = createHarness();

    const route = createTrustedGeneratedMechanicPhaserRoute(harness.input);
    await route.ready;

    expect(harness.loadedPaths).toEqual(TRUSTED_SCRIPT_PATHS);
    expect(harness.claimedControllers).toEqual([harness.controller]);
    expect(harness.createSession).toHaveBeenCalledTimes(1);
    expect(harness.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact: harness.fixture.artifact,
        dependency: harness.fixture.dependency,
        objects: [
          expect.objectContaining({
            id: "entity_generated_motion_probe",
            kind: "hazard",
            object: harness.motionProbeHandle,
          }),
        ],
      })
    );
    expect(harness.install).toHaveBeenCalledTimes(1);
    await requireFunction(
      harness.getRetainedSession().dispatchLogicalAction
    )("move");
    expect(harness.dispatchLogicalAction).toHaveBeenCalledWith("move");
    expect(harness.runtimeEvents).toContainEqual(
      expect.objectContaining({
        type: "game-ready",
        manifest: {
          generatedMechanic: harness.session.identity,
        },
      })
    );
    expect(harness.runtimeGlobal).not.toHaveProperty("artifact");
    expect(harness.runtimeGlobal).not.toHaveProperty("project");
    expect(harness.runtimeGlobal).not.toHaveProperty("sourceArtifact");

    const authorize = requireFunction(
      harness.runtimeGlobal.__AICADE_RUNTIME_AUTHORIZE_COMMAND__
    );
    expect(authorize(harness.commandEvent)).toEqual(harness.command);

    await route.dispose();
    await route.dispose();

    expect(harness.disposeSession).toHaveBeenCalledTimes(1);
    expect(harness.terminateController).toHaveBeenCalledTimes(1);
    expect(harness.disposeChild).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("script[data-aicade-generated-runtime]")).toHaveLength(0);
    expect(Reflect.ownKeys(harness.runtimeGlobal)).toEqual([]);
  });

  it("rejects a noncanonical script path before scripts or generated source can execute", async () => {
    const harness = createHarness({
      mutateTemplate: (template) => ({
        ...template,
        runtimeDependencyScriptPaths: [
          ...template.runtimeDependencyScriptPaths,
          "/runtime/phaser/mechanics/unknown.js",
        ],
      }),
    });

    const route = createTrustedGeneratedMechanicPhaserRoute(harness.input);

    await expect(route.ready).rejects.toThrow(/exact canonical top-down template/i);
    expect(harness.loadedPaths).toEqual([]);
    expect(harness.createSession).not.toHaveBeenCalled();
    expect(harness.runtimeEvents).toContainEqual(
      expect.objectContaining({ type: "game-error" })
    );
    expect(Reflect.ownKeys(harness.runtimeGlobal)).toEqual([]);
  });

  it("fails a missing accepted entity handle before session creation or game-ready", async () => {
    const harness = createHarness({ missingAcceptedEntityHandle: true });

    const route = createTrustedGeneratedMechanicPhaserRoute(harness.input);

    await expect(route.ready).rejects.toThrow(
      /entity_generated_motion_probe.*handle/i
    );
    expect(harness.createSession).not.toHaveBeenCalled();
    expect(harness.runtimeEvents).toContainEqual(
      expect.objectContaining({ type: "game-error" })
    );
    expect(harness.runtimeEvents).not.toContainEqual(
      expect.objectContaining({ type: "game-ready" })
    );
    expect(harness.terminateController).toHaveBeenCalledTimes(1);
    expect(harness.disposeChild).toHaveBeenCalledTimes(1);
  });

  it("rejects a foreign retained identity before install or game-ready", async () => {
    const harness = createHarness({ foreignRuntimeIdentity: true });

    const route = createTrustedGeneratedMechanicPhaserRoute(harness.input);

    await expect(route.ready).rejects.toThrow(/foreign identity/i);
    expect(harness.createSession).toHaveBeenCalledTimes(1);
    expect(harness.install).not.toHaveBeenCalled();
    expect(harness.runtimeEvents).not.toContainEqual(
      expect.objectContaining({ type: "game-ready" })
    );
    expect(harness.runtimeEvents).toContainEqual(
      expect.objectContaining({ type: "game-error" })
    );
  });

  it("does not remove a preexisting foreign global when admission fails", async () => {
    const harness = createHarness();
    const foreignPhaser = Object.freeze({ foreign: true });
    harness.runtimeGlobal.Phaser = foreignPhaser;

    const route = createTrustedGeneratedMechanicPhaserRoute(harness.input);

    await expect(route.ready).rejects.toThrow(/already occupied/i);
    expect(harness.runtimeGlobal.Phaser).toBe(foreignPhaser);
    Reflect.deleteProperty(harness.runtimeGlobal, "Phaser");
  });

  it("disposes authenticated resources that arrive after an early teardown", async () => {
    const harness = createHarness();
    const controller = createTestDeferred<SesWorkerMechanicExecutionRealmController>();
    const project = createTestDeferred<GeneratedMechanicPhaserChildSession>();
    const route = createTrustedGeneratedMechanicPhaserRoute({
      ...harness.input,
      waiters: {
        controller: controller.promise,
        project: project.promise,
      },
    });

    await route.dispose();
    controller.resolve(harness.controller);
    project.resolve(harness.child);

    await expect(route.ready).rejects.toThrow(/after runtime disposal/i);
    expect(harness.terminateController).toHaveBeenCalledTimes(1);
    expect(harness.disposeChild).toHaveBeenCalledTimes(1);
    expect(harness.loadedPaths).toEqual([]);
  });
});

type HarnessOptions = Readonly<{
  foreignRuntimeIdentity?: boolean;
  missingAcceptedEntityHandle?: boolean;
  mutateTemplate?: (
    template: ReturnType<typeof createTopDownPhaserTemplate>
  ) => ReturnType<typeof createTopDownPhaserTemplate>;
}>;

function createHarness(options: HarnessOptions = {}) {
  const fixture = createGeneratedMechanicProjectFixture();
  const canonicalTemplate = createTopDownPhaserTemplate(
    fixture.dependency.finalGameSpec.gameSpec
  );
  const template = options.mutateTemplate?.(canonicalTemplate) ?? canonicalTemplate;
  const runtimeGlobal: Record<string, unknown> = Object.create(null);
  const loadedPaths: string[] = [];
  const runtimeEvents: unknown[] = [];
  let retainedSession: Record<string, unknown> | undefined;
  const claimedControllers: SesWorkerMechanicExecutionRealmController[] = [];
  const command: RuntimeCommand = { type: "game-pause", paused: true };
  const commandEvent = new MessageEvent("message", { data: command });
  const motionProbeHandle: TrustedTopDownPhaserMechanicObject = {
    x: 500,
    y: 120,
    active: true,
    setPosition: vi.fn(),
    body: {
      velocity: { x: 0, y: 0 },
      setVelocity: vi.fn(),
    },
  };
  const terminateController = vi.fn();
  const controller: SesWorkerMechanicExecutionRealmController = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    postMessage: vi.fn(),
    terminate: terminateController,
  };
  const disposeChild = vi.fn();
  const child: GeneratedMechanicPhaserChildSession = {
    getTemplate: () => template,
    getProject: () => fixture,
    postRuntimeEvent: (candidate) => runtimeEvents.push(candidate),
    consumeRuntimeCommand: () => command,
    dispose: disposeChild,
  };
  const realmAdapter: MechanicExecutionRealmAdapter = {
    adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
    id: GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
    create: vi.fn(),
  };
  const install = vi.fn(async () => ({ outcome: "completed", results: [] }) as const);
  const dispatchLogicalAction = vi.fn(
    async () => ({ outcome: "completed", results: [] }) as const
  );
  const disposeSession = vi.fn(
    async () => ({ outcome: "completed", results: [] }) as const
  );
  const canonicalIdentity = createIdentity(fixture.artifact);
  const identity = options.foreignRuntimeIdentity
    ? Object.freeze({
        ...canonicalIdentity,
        sourceArtifactId: "source_foreign_v1",
      })
    : canonicalIdentity;
  const session: GeneratedMechanicRuntimeSession = {
    identity,
    state: "created",
    failureEvidence: undefined,
    install,
    dispatchLogicalAction,
    dispatchGameplayEvent: vi.fn(
      async () => ({ outcome: "completed", results: [] }) as const
    ),
    advanceSimulation: vi.fn(
      async () => ({ outcome: "completed", results: [] }) as const
    ),
    dispose: disposeSession,
  };
  const createSession = vi.fn(async () => session);
  const dependencies: GeneratedMechanicPhaserRouteDependencies = {
    createRealmAdapter(input) {
      claimedControllers.push(input.createController?.() ?? controller);
      return realmAdapter;
    },
    createRuntimeSession: createSession,
    async loadScript({ document: ownerDocument, path }) {
      loadedPaths.push(path);
      const script = ownerDocument.createElement("script");
      script.dataset.aicadeGeneratedRuntime = "true";
      script.setAttribute("src", path);
      ownerDocument.head.append(script);

      if (path === TRUSTED_SCRIPT_PATHS[0]) {
        runtimeGlobal.Phaser = {};
      } else if (path.includes("/mechanics/")) {
        const registry = requireRecord(
          runtimeGlobal.__AICADE_TOP_DOWN_MECHANICS__ ?? {}
        );
        runtimeGlobal.__AICADE_TOP_DOWN_MECHANICS__ = registry;
        registry[installerKeyForPath(path)] = vi.fn();
      } else if (path === TRUSTED_SCRIPT_PATHS.at(-1)) {
        const host = requireRecord(
          runtimeGlobal.__AICADE_GENERATED_MECHANIC_HOST__
        );
        const retained = await requireFunction(host.install)({
          gameSpec: template.gameSpec,
          mechanic: template.gameSpec.mechanics.find(
            ({ id }) => id === fixture.artifact.mechanicId
          ),
          template,
          getEntityDefinition: (entityId: string) =>
            template.gameSpec.entities.find(({ id }) => id === entityId) ?? null,
          getEntityHandle: (entityId: string) =>
            !options.missingAcceptedEntityHandle &&
            entityId === "entity_generated_motion_probe"
              ? motionProbeHandle
              : null,
        });
        retainedSession = requireRecord(retained);
        requireFunction(runtimeGlobal.__AICADE_RUNTIME_NOTIFY__)({
          type: "game-ready",
          manifest: { generatedMechanic: requireRecord(retained).identity },
        });
      }
      return script;
    },
  };

  return {
    canonicalTemplate,
    child,
    claimedControllers,
    command,
    commandEvent,
    controller,
    createSession,
    disposeChild,
    disposeSession,
    dispatchLogicalAction,
    fixture,
    input: {
      dependencies,
      ownerDocument: document,
      ownerWindow: window,
      runtimeGlobal,
      waiters: {
        controller: Promise.resolve(controller),
        project: Promise.resolve(child),
      },
    },
    install,
    getRetainedSession() {
      if (!retainedSession) {
        throw new Error("The generated session was not retained.");
      }
      return retainedSession;
    },
    loadedPaths,
    motionProbeHandle,
    runtimeEvents,
    runtimeGlobal,
    session,
    terminateController,
  };
}

function createIdentity(artifact: AcceptedGeneratedMechanicArtifact) {
  return Object.freeze({
    schemaVersion: "generated_mechanic_runtime_session/v1" as const,
    artifactId: artifact.id,
    extensionId: artifact.extensionId,
    extensionVersionId: artifact.versionId,
    finalGameSpecArtifactId: artifact.finalGameSpecArtifactId,
    gameSpecId: artifact.gameSpecId,
    mechanicId: artifact.mechanicId,
    mechanicType: artifact.mechanicType,
    contractId: artifact.contract.id,
    sourceArtifactId: artifact.sourceArtifact.id,
    capabilityVersion: artifact.contract.capabilityVersion,
    buildId: artifact.buildId,
    runtimePolicy: artifact.runtimePolicy,
  });
}

function installerKeyForPath(path: string): string {
  const installers: Record<string, string> = {
    "/runtime/phaser/mechanics/player-movement.js": "install_player_movement",
    "/runtime/phaser/mechanics/pickup-collection.js": "install_pickup_collection",
    "/runtime/phaser/mechanics/enemy-chase.js": "install_enemy_chase",
    "/runtime/phaser/mechanics/hazard-contact.js": "install_hazard_contact",
  };
  return installers[path] ?? "unknown_installer";
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    throw new TypeError("Expected an object fixture value.");
  }
  return value as Record<string, unknown>;
}

function requireFunction(value: unknown): (...arguments_: unknown[]) => unknown {
  if (typeof value !== "function") {
    throw new TypeError("Expected a function fixture value.");
  }
  return value as (...arguments_: unknown[]) => unknown;
}

function createTestDeferred<Value>() {
  let resolvePromise: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: resolvePromise,
  };
}
