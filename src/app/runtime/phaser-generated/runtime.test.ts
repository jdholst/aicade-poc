import { describe, expect, it, vi } from "vitest";

import type { GeneratedMechanicProjectDependency } from "@/game-spec/game-pack/generated-mechanic-project-handoff";
import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import {
  acceptedGeneratedMechanicArtifactSchema,
  createGeneratedMechanicRuntimePolicy,
  GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
  projectAcceptedGeneratedMechanicRuntimeCandidate,
  type AcceptedGeneratedMechanicArtifact,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import { createMechanicCapabilityGrant } from "@/game-spec/mechanics/mechanic-capability-registry";
import { PHASE_9_GENERATION_CONSTRAINT_SET } from "@/game-spec/mechanics/mechanic-generation-constraints";
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

  it("boots the exact transient candidate without requiring accepted persistence fields", async () => {
    const harness = createHarness({ runtimeCandidate: true });

    const route = createTrustedGeneratedMechanicPhaserRoute(harness.input);
    await route.ready;

    expect(harness.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeCandidate: expect.objectContaining({
          runtimeExecutionId: "runtime_execution_route_candidate_v1",
          executableArtifact: expect.not.objectContaining({
            acceptedAt: expect.anything(),
            checkpointId: expect.anything(),
          }),
        }),
        dependency: harness.fixture.dependency,
      })
    );
    expect(harness.createSession.mock.calls[0]?.[0]).not.toHaveProperty(
      "artifact"
    );
    await route.dispose();
  });

  it("projects exact trusted factories for every declared owned-object kind", async () => {
    const harness = createHarness({ ownedObjects: true });

    const route = createTrustedGeneratedMechanicPhaserRoute(harness.input);
    await route.ready;

    const sessionInput = harness.createSession.mock.calls[0]?.[0];
    if (!sessionInput) {
      throw new Error("Expected one retained session input.");
    }
    expect(Object.keys(sessionInput.ownedObjectFactories ?? {})).toEqual([
      "effect",
    ]);
    const factory = sessionInput.ownedObjectFactories?.effect;
    if (!factory) {
      throw new Error("Expected the exact effect factory.");
    }

    const created = factory({
      objectId: "owned_effect_1",
      initial: { position: { x: 12, y: 18 } },
    });

    expect(harness.createOwnedObject).toHaveBeenCalledWith({
      objectId: "owned_effect_1",
      objectKind: "effect",
      initial: { position: { x: 12, y: 18 } },
    });
    expect(created.object).toBe(harness.ownedObjectHandle);
    await route.dispose();
  });

  it.each(["entities", "controls", "objectives"] as const)(
    "rejects a transient candidate whose dependency preserves IDs and extension but changes %s",
    async (field) => {
      const harness = createHarness({
        runtimeCandidate: true,
        divergentCandidateFinalGameSpecField: field,
      });

      const route = createTrustedGeneratedMechanicPhaserRoute(harness.input);

      await expect(route.ready).rejects.toThrow(/exact Final Game Spec/i);
      expect(harness.createSession).not.toHaveBeenCalled();
      expect(harness.loadedPaths).toEqual([]);
      expect(harness.runtimeEvents).toContainEqual(
        expect.objectContaining({ type: "game-error" })
      );
      expect(harness.terminateController).toHaveBeenCalledTimes(1);
      expect(harness.disposeChild).toHaveBeenCalledTimes(1);
    }
  );

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
  divergentCandidateFinalGameSpecField?:
    | "entities"
    | "controls"
    | "objectives";
  foreignRuntimeIdentity?: boolean;
  missingAcceptedEntityHandle?: boolean;
  ownedObjects?: boolean;
  runtimeCandidate?: boolean;
  mutateTemplate?: (
    template: ReturnType<typeof createTopDownPhaserTemplate>
  ) => ReturnType<typeof createTopDownPhaserTemplate>;
}>;

function createHarness(options: HarnessOptions = {}) {
  const baseFixture = createGeneratedMechanicProjectFixture();
  const fixture = options.ownedObjects
    ? createOwnedObjectProjectFixture(baseFixture)
    : baseFixture;
  const projectedRuntimeCandidate =
    projectAcceptedGeneratedMechanicRuntimeCandidate(fixture.artifact);
  const runtimeCandidate = {
    ...projectedRuntimeCandidate,
    runtimeExecutionId: "runtime_execution_route_candidate_v1",
  };
  const dependency = options.divergentCandidateFinalGameSpecField
    ? {
        ...fixture.dependency,
        finalGameSpec: divergeFinalGameSpec(
          fixture.dependency.finalGameSpec,
          options.divergentCandidateFinalGameSpecField
        ),
      }
    : fixture.dependency;
  const project = options.runtimeCandidate
    ? { runtimeCandidate, dependency }
    : fixture;
  const canonicalTemplate = createTopDownPhaserTemplate(
    dependency.finalGameSpec.gameSpec
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
  const ownedObjectHandle = {
    x: 12,
    y: 18,
    active: true,
    destroy: vi.fn(),
  };
  const createOwnedObject = vi.fn(() => ({ object: ownedObjectHandle }));
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
    getProject: () => project,
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
  const canonicalIdentity = createIdentity(
    fixture.artifact,
    options.runtimeCandidate
      ? runtimeCandidate.runtimeExecutionId
      : fixture.artifact.buildId
  );
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
          createOwnedObject,
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
    createOwnedObject,
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
    ownedObjectHandle,
    runtimeEvents,
    runtimeGlobal,
    session,
    terminateController,
  };
}

function createOwnedObjectProjectFixture(
  base: ReturnType<typeof createGeneratedMechanicProjectFixture>
) {
  const contract = {
    ...base.artifact.contract,
    ownedObjects: [
      { id: "transient_effect", objectKind: "effect", maximumInstances: 2 },
    ],
    capabilities: [
      ...base.artifact.contract.capabilities,
      "object_create",
      "spatial_query",
      "object_destroy",
    ],
    resourceExpectations: {
      ...base.artifact.contract.resourceExpectations,
      maximumOwnedObjects: 2,
    },
    scenarios: base.artifact.contract.scenarios.map((scenario) => ({
      ...scenario,
      observations: [
        ...scenario.observations,
        {
          kind: "owned_object_count" as const,
          archetypeId: "transient_effect",
          operator: "equals" as const,
          value: 0,
        },
      ],
    })),
  };
  const grant = createMechanicCapabilityGrant({
    contract,
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
  });
  if (!grant.success) {
    throw new Error("Expected the owned-object route grant to pass.");
  }
  const sourceArtifact = {
    ...base.artifact.sourceArtifact,
    grant: grant.data,
    usedCapabilities: [...contract.capabilities],
  };
  const runtimePolicy = createGeneratedMechanicRuntimePolicy({
    contract,
    versionId: base.artifact.versionId,
  });
  const artifact = acceptedGeneratedMechanicArtifactSchema.parse({
    ...base.artifact,
    contract,
    sourceArtifact,
    runtimePolicy,
  });
  const dependency: GeneratedMechanicProjectDependency = {
    ...base.dependency,
    contract: artifact.contract,
    runtimePolicy: artifact.runtimePolicy,
    sourceArtifact: artifact.sourceArtifact,
  };
  return { ...base, artifact, dependency };
}

function createIdentity(
  artifact: AcceptedGeneratedMechanicArtifact,
  runtimeExecutionId: string
) {
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
    runtimeExecutionId,
    buildId: runtimeExecutionId,
    runtimePolicy: artifact.runtimePolicy,
  });
}

function divergeFinalGameSpec(
  finalGameSpec: GeneratedMechanicProjectDependency["finalGameSpec"],
  field: "entities" | "controls" | "objectives"
): GeneratedMechanicProjectDependency["finalGameSpec"] {
  const gameSpec = finalGameSpec.gameSpec;
  if (field === "entities") {
    return {
      ...finalGameSpec,
      gameSpec: {
        ...gameSpec,
        entities: gameSpec.entities.map((entity, index) =>
          index === 0
            ? { ...entity, name: `${entity.name} substituted` }
            : entity
        ),
      },
    };
  }
  if (field === "controls") {
    return {
      ...finalGameSpec,
      gameSpec: {
        ...gameSpec,
        controls: gameSpec.controls.map((control, index) =>
          index === 0
            ? { ...control, label: `${control.label} substituted` }
            : control
        ),
      },
    };
  }
  return {
    ...finalGameSpec,
    gameSpec: {
      ...gameSpec,
      objectives: gameSpec.objectives.map((objective, index) =>
        index === 0
          ? {
              ...objective,
              description: `${objective.description} Substituted.`,
            }
          : objective
      ),
    },
  };
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
