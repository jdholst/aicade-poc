import { describe, expect, it, vi } from "vitest";

import type { JsonValue, StableId } from "@/game-spec/game-spec-schema";
import type { GeneratedMechanicProjectDependency } from "@/game-spec/game-pack/generated-mechanic-project-handoff";
import {
  acceptedGeneratedMechanicArtifactSchema,
  createGeneratedMechanicRuntimePolicy,
  generatedMechanicExecutableArtifactSchema,
  generatedMechanicRuntimeCandidateSchema,
  projectAcceptedGeneratedMechanicRuntimeCandidate,
  type AcceptedGeneratedMechanicArtifact,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import type { GeneratedMechanicContract } from "@/game-spec/mechanics/generated-mechanic-contract";
import {
  createMechanicCapabilityGrant,
} from "@/game-spec/mechanics/mechanic-capability-registry";
import { PHASE_9_GENERATION_CONSTRAINT_SET } from "@/game-spec/mechanics/mechanic-generation-constraints";
import { topDownGameSpecSchema } from "@/game-spec/top-down-spec-schema";
import { crystalSpecChaseGameSpecFixtureInput } from "@/runtime/phaser/fixtures/crystal-spec-chase";
import type {
  TrustedTopDownPhaserMechanicObjectRegistration,
  TrustedTopDownPhaserOwnedObjectFactory,
} from "@/runtime/phaser/top-down-mechanic-object-adapter";
import {
  GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import {
  MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
  type CreateMechanicExecutionRealmInput,
  type MechanicExecutionRealm,
  type MechanicExecutionRealmAdapter,
  type MechanicExecutionRealmCapabilityArgument,
  type MechanicExecutionRealmCapabilityResult,
  type MechanicExecutionRealmExecutionInput,
  type MechanicExecutionRealmExecutionResult,
} from "./mechanic-execution-realm";
import { PHASE_9_MECHANIC_RESOURCE_BUDGET } from "./phase-9-contained-mechanic-runtime";
import { createGeneratedMechanicRuntimeSession } from "./generated-mechanic-runtime-session";

const authenticTestRealmAdapters = vi.hoisted(() => new WeakSet<object>());

vi.mock("./mechanic-execution-realm-adapter-authenticity", () => ({
  isMechanicExecutionRealmAdapterAuthentic: (adapter: object) =>
    authenticTestRealmAdapters.has(adapter),
}));

describe("createGeneratedMechanicRuntimeSession", () => {
  it("retains one exact accepted artifact across install, action, scheduled time, and disposal", async () => {
    const fixture = createFixture();
    const adapter = new ScriptedRealmAdapter();

    const session = await createGeneratedMechanicRuntimeSession({
      artifact: fixture.artifact,
      dependency: fixture.dependency,
      realmAdapter: adapter,
      objects: fixture.objects,
    });

    expect(session.identity).toEqual({
      schemaVersion: "generated_mechanic_runtime_session/v1",
      artifactId: "extension_generic_session_v1",
      extensionId: "extension_generic_session",
      extensionVersionId: "extension_generic_session_v1",
      finalGameSpecArtifactId: "final_game_spec_generic_session_v1",
      gameSpecId: "game_generic_session",
      mechanicId: "mechanic_generic_session",
      mechanicType: "generic_session",
      contractId: "contract_generic_session",
      sourceArtifactId: "source_generic_session_v1",
      capabilityVersion: "mechanic_capability/v1",
      runtimeExecutionId: "build_generic_session_v1",
      buildId: "build_generic_session_v1",
      runtimePolicy: fixture.artifact.runtimePolicy,
    });
    expect(adapter.createInputs).toHaveLength(1);
    expect(adapter.createInputs[0]).toMatchObject({
      mechanicId: "mechanic_generic_session",
      seed: fixture.artifact.runtimePolicy.seed,
      resourceBudget: PHASE_9_MECHANIC_RESOURCE_BUDGET,
    });
    expect(adapter.createInputs[0]?.bindings).toHaveLength(1);
    expect(adapter.createInputs[0]?.bindings[0]?.handles).toHaveLength(1);

    expect(await session.install()).toMatchObject({ outcome: "completed" });
    expect(fixture.actor.x).toBe(10);
    expect(fixture.actor.y).toBe(20);
    expect(fixture.actor.body?.velocity).toEqual({ x: 3, y: 4 });
    expect(adapter.observations.objectKind).toBe("player");
    expect(adapter.observations.stateValues).toEqual([0, 1]);
    expect(adapter.observations.timeValues).toEqual([0]);
    expect(adapter.observations.randomValues).toEqual([
      firstDeterministicRandom(fixture.artifact.runtimePolicy.seed),
    ]);

    expect(
      await session.dispatchLogicalAction("move", { amount: 1 })
    ).toMatchObject({ outcome: "completed" });
    expect(adapter.observations.stateValues).toEqual([0, 1, 1, 2]);
    const admittedExecutionCount = adapter.executions.length;
    await expect(
      session.dispatchLogicalAction("unrelated_control")
    ).resolves.toEqual({ outcome: "completed", results: [] });
    expect(adapter.executions).toHaveLength(admittedExecutionCount);

    expect(await session.advanceSimulation(16)).toMatchObject({
      outcome: "completed",
    });
    expect(adapter.executions).toContain("scheduled_session");
    expect(adapter.observations.timeValues).toEqual([0, 16]);

    expect(await session.dispose()).toMatchObject({ outcome: "completed" });
    expect(session.state).toBe("disposed");
    expect(adapter.realmDisposed).toBe(true);
    expect(adapter.executions.at(-1)).toBe("dispose_session");
    expect(adapter.executionInputs).not.toHaveLength(0);
    expect(
      adapter.executionInputs.every(
        (execution) =>
          execution.lifecycle?.callbackExecutionMode === "generated_admitted"
      )
    ).toBe(true);
  });

  it("runs an honest transient executable candidate without accepted-project fields", async () => {
    const fixture = createFixture();
    const acceptedProjection =
      projectAcceptedGeneratedMechanicRuntimeCandidate(fixture.artifact);
    const runtimeCandidate = generatedMechanicRuntimeCandidateSchema.parse({
      ...acceptedProjection,
      runtimeExecutionId: "runtime_execution_generic_session_v1",
    });
    const adapter = new ScriptedRealmAdapter();

    expect(runtimeCandidate.executableArtifact).not.toHaveProperty(
      "acceptedAt"
    );
    expect(runtimeCandidate.executableArtifact).not.toHaveProperty(
      "checkpointId"
    );
    expect(runtimeCandidate.executableArtifact).not.toHaveProperty(
      "validationEvidenceIds"
    );
    expect(Object.isFrozen(acceptedProjection)).toBe(true);
    expect(
      generatedMechanicExecutableArtifactSchema.safeParse(
        runtimeCandidate.executableArtifact
      ).success
    ).toBe(true);
    expect(
      generatedMechanicExecutableArtifactSchema.safeParse({
        ...runtimeCandidate.executableArtifact,
        checkpointId: fixture.artifact.checkpointId,
      }).success
    ).toBe(false);
    expect(
      generatedMechanicRuntimeCandidateSchema.safeParse({
        ...runtimeCandidate,
        acceptedAt: fixture.artifact.acceptedAt,
      }).success
    ).toBe(false);

    const session = await createGeneratedMechanicRuntimeSession({
      runtimeCandidate,
      dependency: fixture.dependency,
      realmAdapter: adapter,
      objects: fixture.objects,
    });

    expect(session.identity).toMatchObject({
      artifactId: fixture.artifact.id,
      runtimeExecutionId: "runtime_execution_generic_session_v1",
      buildId: "runtime_execution_generic_session_v1",
    });
    await expect(session.install()).resolves.toMatchObject({
      outcome: "completed",
    });
    await expect(session.dispose()).resolves.toMatchObject({
      outcome: "completed",
    });
  });

  it("runs declared owned objects through the retained session capability host", async () => {
    const fixture = createOwnedObjectFixture();
    const adapter = new OwnedObjectRealmAdapter();
    const destroyed = vi.fn();
    const createEffect: TrustedTopDownPhaserOwnedObjectFactory = ({ initial }) => {
      const position = (initial as { position: { x: number; y: number } }).position;
      const state = {
        active: true,
        position: { ...position },
        velocity: { x: 0, y: 0 },
      };
      return {
        object: {
          get active() {
            return state.active;
          },
          get x() {
            return state.position.x;
          },
          get y() {
            return state.position.y;
          },
          setPosition(x, y) {
            state.position = { x, y };
          },
          body: {
            get velocity() {
              return state.velocity;
            },
            setVelocity(x, y) {
              state.velocity = { x, y };
            },
          },
          destroy() {
            state.active = false;
            destroyed();
          },
        },
        observeProperties: () => ({ source: "generic_factory" }),
      };
    };

    const session = await createGeneratedMechanicRuntimeSession({
      artifact: fixture.artifact,
      dependency: fixture.dependency,
      realmAdapter: adapter,
      objects: fixture.objects,
      ownedObjectFactories: { effect: createEffect },
    });

    await expect(session.install()).resolves.toMatchObject({
      outcome: "completed",
    });
    await expect(session.dispatchLogicalAction("move")).resolves.toMatchObject({
      outcome: "completed",
    });
    expect(adapter.observations).toEqual({
      createdKind: "effect",
      movedPosition: { x: 28, y: 32 },
      queriedHandleCount: 1,
    });
    expect(destroyed).toHaveBeenCalledTimes(1);
    await expect(session.dispose()).resolves.toMatchObject({
      outcome: "completed",
    });
  });

  it("rejects extra trusted owned-object factory keys even when their value is undefined", async () => {
    const fixture = createOwnedObjectFixture();
    const adapter = new OwnedObjectRealmAdapter();
    const createEffect: TrustedTopDownPhaserOwnedObjectFactory = () => ({
      object: {
        x: 0,
        y: 0,
        destroy() {},
      },
    });

    await expect(
      createGeneratedMechanicRuntimeSession({
        artifact: fixture.artifact,
        dependency: fixture.dependency,
        realmAdapter: adapter,
        objects: fixture.objects,
        ownedObjectFactories: {
          effect: createEffect,
          undeclared_kind: undefined,
        },
      })
    ).rejects.toThrow(/exactly one trusted owned-object factory/i);
  });

  it("rejects a transient executable whose exact Final Game Spec lineage was substituted", async () => {
    const fixture = createFixture();
    const projected =
      projectAcceptedGeneratedMechanicRuntimeCandidate(fixture.artifact);
    const forgedCandidate = {
      ...projected,
      runtimeExecutionId: "runtime_execution_forged_v1",
      executableArtifact: {
        ...projected.executableArtifact,
        sourceArtifact: {
          ...projected.executableArtifact.sourceArtifact,
          id: "source_foreign_v1",
        },
      },
    };
    const adapter = new ScriptedRealmAdapter();

    await expect(
      createGeneratedMechanicRuntimeSession({
        runtimeCandidate: forgedCandidate as never,
        dependency: fixture.dependency,
        realmAdapter: adapter,
        objects: fixture.objects,
      })
    ).rejects.toThrow("valid generated mechanic runtime candidate");
    expect(adapter.createInputs).toHaveLength(0);
  });

  it.each(["entities", "controls", "objectives"] as const)(
    "rejects a transient executable whose dependency keeps the same IDs and extension but changes %s",
    async (field) => {
      const fixture = createFixture();
      const runtimeCandidate =
        projectAcceptedGeneratedMechanicRuntimeCandidate(fixture.artifact);
      const dependency = {
        ...fixture.dependency,
        finalGameSpec: divergeFinalGameSpec(
          fixture.dependency.finalGameSpec,
          field
        ),
      };
      const adapter = new ScriptedRealmAdapter();

      expect(dependency.finalGameSpec.id).toBe(
        runtimeCandidate.executableArtifact.finalGameSpec.id
      );
      expect(dependency.finalGameSpec.gameSpec.id).toBe(
        runtimeCandidate.executableArtifact.finalGameSpec.gameSpec.id
      );
      expect(dependency.finalGameSpec.extension).toEqual(
        runtimeCandidate.executableArtifact.finalGameSpec.extension
      );

      await expect(
        createGeneratedMechanicRuntimeSession({
          runtimeCandidate,
          dependency,
          realmAdapter: adapter,
          objects: fixture.objects,
        })
      ).rejects.toThrow(/exact Final Game Spec/i);
      expect(adapter.createInputs).toHaveLength(0);
      expect(adapter.executions).toHaveLength(0);
    }
  );

  it.each([
    {
      label: "a project port contract",
      mutate: (input: SessionInputFixture) => ({
        ...input,
        dependency: {
          ...input.dependency,
          trustedPortContracts: [
            {
              ownerKind: "generated_mechanic" as const,
              ownerId: input.artifact.mechanicId,
              ports: [],
            },
          ],
        },
      }),
    },
    {
      label: "signal emission",
      mutate: (input: SessionInputFixture) =>
        withContractCapabilities(input, ["signal_emit"]),
    },
    {
      label: "spatial queries",
      mutate: (input: SessionInputFixture) =>
        withContractCapabilities(input, ["spatial_query"]),
    },
    {
      label: "object creation",
      mutate: (input: SessionInputFixture) =>
        withContractCapabilities(input, ["object_create"]),
    },
    {
      label: "object destruction",
      mutate: (input: SessionInputFixture) =>
        withContractCapabilities(input, ["object_destroy"]),
    },
    {
      label: "owned objects",
      mutate: (input: SessionInputFixture) => ({
        ...input,
        artifact: {
          ...input.artifact,
          contract: {
            ...input.artifact.contract,
            ownedObjects: [
              {
                id: "owned_marker",
                objectKind: "marker",
                maximumInstances: 1,
              },
            ],
          },
        },
      }),
    },
    {
      label: "an unsupported host profile",
      mutate: (input: SessionInputFixture) => ({
        ...input,
        artifact: {
          ...input.artifact,
          runtimePolicy: {
            ...input.artifact.runtimePolicy,
            hostProfileId: "foreign_host_profile",
          },
        } as AcceptedGeneratedMechanicArtifact,
      }),
    },
    {
      label: "a different dependency source",
      mutate: (input: SessionInputFixture) => ({
        ...input,
        dependency: {
          ...input.dependency,
          sourceArtifact: {
            ...input.dependency.sourceArtifact,
            id: "source_foreign_v1",
          },
        },
      }),
    },
    {
      label: "a missing bound object",
      mutate: (input: SessionInputFixture) => ({ ...input, objects: [] }),
    },
    {
      label: "a foreign unbound object",
      mutate: (input: SessionInputFixture) => ({
        ...input,
        objects: [
          ...input.objects,
          {
            id: "foreign_entity",
            kind: "foreign",
            object: { x: 0, y: 0 },
          },
        ],
      }),
    },
    {
      label: "a different execution realm candidate",
      mutate: (input: SessionInputFixture) => {
        input.realmAdapter.id = "foreign_realm_candidate";
        return input;
      },
    },
  ])("rejects $label before creating or executing a realm", async ({ mutate }) => {
    const fixture = createFixture();
    const adapter = new ScriptedRealmAdapter();
    const input = mutate({
      artifact: fixture.artifact,
      dependency: fixture.dependency,
      realmAdapter: adapter,
      objects: fixture.objects,
    });

    await expect(createGeneratedMechanicRuntimeSession(input)).rejects.toThrow();
    expect(adapter.createInputs).toHaveLength(0);
    expect(adapter.executions).toHaveLength(0);
  });

  it("rejects a structurally forged realm adapter before realm creation", async () => {
    const fixture = createFixture();
    const delegate = new ScriptedRealmAdapter();
    const forgedAdapter: MechanicExecutionRealmAdapter = {
      adapterVersion: MECHANIC_EXECUTION_REALM_ADAPTER_VERSION,
      id: GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID,
      create: (input) => delegate.create(input),
    };

    await expect(
      createGeneratedMechanicRuntimeSession({
        artifact: fixture.artifact,
        dependency: fixture.dependency,
        realmAdapter: forgedAdapter,
        objects: fixture.objects,
      })
    ).rejects.toThrow(
      "Generated runtime session realm adapter does not match the generated execution candidate."
    );
    expect(delegate.createInputs).toHaveLength(0);
  });

  it("surfaces a contained callback failure and cleans every retained resource", async () => {
    const fixture = createFixture();
    const adapter = new ScriptedRealmAdapter("action_session");
    const session = await createGeneratedMechanicRuntimeSession({
      artifact: fixture.artifact,
      dependency: fixture.dependency,
      realmAdapter: adapter,
      objects: fixture.objects,
    });
    await session.install();

    const failed = await session.dispatchLogicalAction("move");

    expect(failed).toMatchObject({
      outcome: "contained_failure",
      evidence: {
        extensionId: "extension_generic_session",
        buildId: "build_generic_session_v1",
        callback: { id: "action_session", kind: "logical_action" },
        cleanup: {
          lifecycleDisposed: true,
          registrationsRemoved: true,
          ownedObjectsRemoved: true,
          privateStateRemoved: true,
          issues: [],
        },
        playableResult: "invalidated",
      },
    });
    expect(session.state).toBe("failed");
    expect(adapter.realmDisposed).toBe(true);
    const executionCount = adapter.executions.length;
    const retained = await session.dispatchLogicalAction("move");
    expect(retained).toMatchObject({
      outcome: "contained_failure",
      results: [],
    });
    if (
      failed.outcome !== "contained_failure" ||
      retained.outcome !== "contained_failure"
    ) {
      throw new Error("Expected retained contained-failure evidence.");
    }
    expect(retained.evidence).toBe(failed.evidence);
    expect(adapter.executions).toHaveLength(executionCount);
  });

  it.each([
    {
      label: "a negative interval",
      elapsedMilliseconds: -1,
      evidenceInput: { elapsedMilliseconds: -1 },
    },
    {
      label: "a non-finite interval",
      elapsedMilliseconds: Number.NaN,
      evidenceInput: { elapsedMilliseconds: null },
    },
  ])(
    "contains $label from the authentic retained session and releases its realm",
    async ({ elapsedMilliseconds, evidenceInput }) => {
      const fixture = createFixture();
      const adapter = new ScriptedRealmAdapter();
      const session = await createGeneratedMechanicRuntimeSession({
        artifact: fixture.artifact,
        dependency: fixture.dependency,
        realmAdapter: adapter,
        objects: fixture.objects,
      });
      await session.install();

      const result = await session.advanceSimulation(elapsedMilliseconds);

      expect(result).toMatchObject({
        outcome: "contained_failure",
        evidence: {
          callback: { id: "host_cleanup", kind: "host_cleanup" },
          failure: {
            kind: "exception",
            code: "mechanic_runtime_operation_failed",
            message:
              "Simulation advancement must be a finite nonnegative number.",
          },
          reproduction: { input: evidenceInput },
          cleanup: {
            lifecycleDisposed: true,
            registrationsRemoved: true,
            ownedObjectsRemoved: true,
            privateStateRemoved: true,
            issues: [],
          },
          repair: {
            artifact: "runtime_host",
            issuePath: "cleanup",
          },
        },
      });
      expect(session.state).toBe("failed");
      expect(adapter.realmDisposed).toBe(true);
      expect(JSON.parse(JSON.stringify(session.failureEvidence))).toEqual(
        session.failureEvidence
      );
    }
  );

  it("contains duplicate install and releases the authentic retained session", async () => {
    const fixture = createFixture();
    const adapter = new ScriptedRealmAdapter();
    const session = await createGeneratedMechanicRuntimeSession({
      artifact: fixture.artifact,
      dependency: fixture.dependency,
      realmAdapter: adapter,
      objects: fixture.objects,
    });
    await session.install();

    const result = await session.install();

    expect(result).toMatchObject({
      outcome: "contained_failure",
      evidence: {
        callback: { id: "host_cleanup", kind: "host_cleanup" },
        failure: {
          kind: "exception",
          code: "mechanic_runtime_operation_failed",
          message: 'Mechanic lifecycle cannot install from state "active".',
        },
        reproduction: { input: null },
        cleanup: {
          lifecycleDisposed: true,
          registrationsRemoved: true,
          ownedObjectsRemoved: true,
          privateStateRemoved: true,
          issues: [],
        },
        repair: {
          artifact: "runtime_host",
          issuePath: "cleanup",
        },
      },
    });
    expect(session.state).toBe("failed");
    expect(adapter.realmDisposed).toBe(true);
  });
});

type SessionInputFixture = {
  artifact: AcceptedGeneratedMechanicArtifact;
  dependency: GeneratedMechanicProjectDependency;
  realmAdapter: ScriptedRealmAdapter;
  objects: readonly TrustedTopDownPhaserMechanicObjectRegistration[];
};

class ScriptedRealmAdapter implements MechanicExecutionRealmAdapter {
  readonly adapterVersion = MECHANIC_EXECUTION_REALM_ADAPTER_VERSION;
  id: StableId = GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID;
  readonly createInputs: CreateMechanicExecutionRealmInput[] = [];
  readonly executions: StableId[] = [];
  readonly executionInputs: MechanicExecutionRealmExecutionInput[] = [];
  readonly observations = {
    objectKind: "",
    stateValues: [] as JsonValue[],
    timeValues: [] as JsonValue[],
    randomValues: [] as JsonValue[],
  };
  realmDisposed = false;

  constructor(private readonly failedCallbackId?: StableId) {
    authenticTestRealmAdapters.add(this);
  }

  async create(
    input: CreateMechanicExecutionRealmInput
  ): Promise<MechanicExecutionRealm> {
    this.createInputs.push(input);
    return {
      execute: (execution) => this.execute(input, execution),
      dispose: () => {
        this.realmDisposed = true;
      },
    };
  }

  private execute(
    realmInput: CreateMechanicExecutionRealmInput,
    execution: MechanicExecutionRealmExecutionInput
  ) {
    this.executionInputs.push(structuredClone(execution));
    const callbackId = execution.lifecycle?.invocations[0]?.callbackId;
    if (!callbackId) {
      throw new Error("Expected one retained lifecycle callback invocation.");
    }
    this.executions.push(callbackId);
    const result = this.runCallback(realmInput, execution, callbackId);
    return {
      result,
      terminate: async () => ({
        executionId: execution.id,
        outcome: "terminated" as const,
      }),
    };
  }

  private async runCallback(
    realmInput: CreateMechanicExecutionRealmInput,
    execution: MechanicExecutionRealmExecutionInput,
    callbackId: StableId
  ): Promise<MechanicExecutionRealmExecutionResult> {
    if (callbackId === this.failedCallbackId) {
      return {
        executionId: execution.id,
        outcome: "failed",
        diagnostic: {
          stage: "realm_execution",
          code: "scripted_callback_failure",
          message: "The scripted callback failed.",
        },
      };
    }
    if (callbackId === "install_session") {
      const actorHandle = realmInput.bindings[0]?.handles[0];
      if (!actorHandle) {
        throw new Error("Expected the exact actor binding handle.");
      }
      const observation = await invokeCapability(
        realmInput,
        "object_read",
        [actorHandle]
      );
      if (observation.kind !== "json" || !isJsonRecord(observation.value)) {
        throw new Error("Expected a JSON object observation.");
      }
      this.observations.objectKind = String(observation.value.kind);
      await invokeCapability(realmInput, "object_motion_write", [
        actorHandle,
        { position: { x: 10, y: 20 }, velocity: { x: 3, y: 4 } },
      ]);
      this.observations.stateValues.push(
        resultValue(await invokeCapability(realmInput, "state_read", ["counter"]))
      );
      await invokeCapability(realmInput, "state_write", ["counter", 1]);
      this.observations.stateValues.push(
        resultValue(await invokeCapability(realmInput, "state_read", ["counter"]))
      );
      this.observations.timeValues.push(
        resultValue(await invokeCapability(realmInput, "time_read", []))
      );
      this.observations.randomValues.push(
        resultValue(await invokeCapability(realmInput, "random_next", []))
      );
      await invokeCapability(realmInput, "time_schedule", [
        16,
        "scheduled_session",
      ]);
    }
    if (callbackId === "action_session") {
      const current = resultValue(
        await invokeCapability(realmInput, "state_read", ["counter"])
      );
      this.observations.stateValues.push(current);
      await invokeCapability(realmInput, "state_write", [
        "counter",
        Number(current) + 1,
      ]);
      this.observations.stateValues.push(
        resultValue(await invokeCapability(realmInput, "state_read", ["counter"]))
      );
    }
    if (callbackId === "scheduled_session") {
      this.observations.timeValues.push(
        resultValue(await invokeCapability(realmInput, "time_read", []))
      );
    }
    return { executionId: execution.id, outcome: "completed" };
  }
}

class OwnedObjectRealmAdapter implements MechanicExecutionRealmAdapter {
  readonly adapterVersion = MECHANIC_EXECUTION_REALM_ADAPTER_VERSION;
  readonly id = GENERATED_MECHANIC_EXECUTION_REALM_CANDIDATE_ID;
  readonly observations = {
    createdKind: "",
    movedPosition: { x: 0, y: 0 },
    queriedHandleCount: 0,
  };

  constructor() {
    authenticTestRealmAdapters.add(this);
  }

  async create(
    input: CreateMechanicExecutionRealmInput
  ): Promise<MechanicExecutionRealm> {
    return {
      execute: (execution) => {
        const callbackId = execution.lifecycle?.invocations[0]?.callbackId;
        const result = this.runCallback(input, execution.id, callbackId);
        return {
          result,
          terminate: async () => ({
            executionId: execution.id,
            outcome: "terminated" as const,
          }),
        };
      },
      dispose() {},
    };
  }

  private async runCallback(
    input: CreateMechanicExecutionRealmInput,
    executionId: StableId,
    callbackId: StableId | undefined
  ): Promise<MechanicExecutionRealmExecutionResult> {
    if (callbackId === "action_session") {
      const created = await invokeCapability(input, "object_create", [
        "transient_effect",
        { position: { x: 24, y: 32 } },
      ]);
      if (created.kind !== "opaque_handle") {
        throw new Error("Expected one created handle.");
      }
      const queried = await invokeCapability(input, "spatial_query", [
        {
          center: { x: 24, y: 32 },
          radius: 0,
          objectKinds: ["effect"],
          ownership: "owned",
        },
      ]);
      if (queried.kind !== "opaque_handles") {
        throw new Error("Expected queried handles.");
      }
      this.observations.queriedHandleCount = queried.value.length;
      await invokeCapability(input, "object_motion_write", [
        created.value,
        { position: { x: 28, y: 32 } },
      ]);
      const observation = await invokeCapability(input, "object_read", [
        created.value,
      ]);
      if (observation.kind !== "json" || !isJsonRecord(observation.value)) {
        throw new Error("Expected an owned-object observation.");
      }
      const position = observation.value.position;
      if (!isJsonRecord(position)) {
        throw new Error("Expected an owned-object position.");
      }
      this.observations.createdKind = String(observation.value.kind);
      this.observations.movedPosition = {
        x: Number(position.x),
        y: Number(position.y),
      };
      await invokeCapability(input, "object_destroy", [created.value]);
    }
    return { executionId, outcome: "completed" };
  }
}

async function invokeCapability(
  input: CreateMechanicExecutionRealmInput,
  capabilityId: StableId,
  args: readonly MechanicExecutionRealmCapabilityArgument[]
): Promise<MechanicExecutionRealmCapabilityResult> {
  return await input.capabilityHost.invoke({ capabilityId, arguments: args });
}

function resultValue(result: MechanicExecutionRealmCapabilityResult): JsonValue {
  if (result.kind !== "json") {
    throw new Error("Expected a JSON capability result.");
  }
  return result.value;
}

function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createFixture() {
  const contract = createContract();
  const grant = createMechanicCapabilityGrant({
    contract,
    constraintSet: PHASE_9_GENERATION_CONSTRAINT_SET,
  });
  if (!grant.success) {
    throw new Error("Expected the session fixture capability grant to pass.");
  }
  const sourceArtifact = {
    schemaVersion: "generated_mechanic_source_artifact/v1" as const,
    id: "source_generic_session_v1",
    contractId: contract.id,
    intentId: contract.intentId,
    capabilityVersion: contract.capabilityVersion,
    grant: grant.data,
    usedCapabilities: [...contract.capabilities],
    callbacks: [
      callback("install_session", "install"),
      callback("action_session", "logical_action"),
      callback("scheduled_session", "scheduled"),
      callback("dispose_session", "dispose"),
    ],
    build: {
      language: "typescript" as const,
      target: "es2020" as const,
      parsed: true as const,
      typechecked: true as const,
      compiled: true as const,
      staticValidationTarget: "normalized_javascript" as const,
      staticValidationVersion:
        "generated_mechanic_source_static_validation/v1" as const,
    },
  };
  const runtimePolicy = createGeneratedMechanicRuntimePolicy({
    contract,
    versionId: "extension_generic_session_v1",
  });
  const bindings = [
    {
      id: "actor",
      referenceKind: "entity",
      cardinality: "one" as const,
      objectIds: ["entity_player"],
    },
  ];
  const gameSpec = topDownGameSpecSchema.parse({
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_generic_session",
    mechanics: [
      ...crystalSpecChaseGameSpecFixtureInput.mechanics,
      {
        id: "mechanic_generic_session",
        type: "generic_session",
        entityIds: ["entity_player"],
        config: {},
      },
    ],
    mechanicConnections: {
      schemaVersion: "mechanic_port_connections/v1",
      connections: [],
    },
  });
  const finalGameSpec = {
    schemaVersion: "generated_mechanic_final_game_spec/v1" as const,
    id: "final_game_spec_generic_session_v1",
    gameSpec,
    extension: {
      id: "extension_generic_session",
      versionId: "extension_generic_session_v1",
      mechanicId: "mechanic_generic_session",
      mechanicType: "generic_session",
      contractId: contract.id,
      sourceArtifactId: sourceArtifact.id,
      capabilityVersion: contract.capabilityVersion,
      config: {},
      bindings,
    },
  };
  const artifact = acceptedGeneratedMechanicArtifactSchema.parse({
    schemaVersion: "accepted_generated_mechanic_artifact/v1",
    id: "extension_generic_session_v1",
    extensionId: "extension_generic_session",
    versionId: "extension_generic_session_v1",
    sourceGenerationRunId: "run_generic_session_v1",
    acceptedAt: "2026-08-11T18:00:00.000Z",
    finalGameSpecArtifactId: "final_game_spec_generic_session_v1",
    finalGameSpec,
    gameSpecId: "game_generic_session",
    mechanicId: "mechanic_generic_session",
    mechanicType: "generic_session",
    contract,
    sourceArtifact,
    runtimePolicy,
    config: {},
    bindings,
    referenceCatalog: { action: ["move"], entity: ["entity_player"] },
    buildId: "build_generic_session_v1",
    checkpointId: "checkpoint_generic_session_v1",
    validationEvidenceIds: ["evidence_generic_session_v1"],
  });
  const dependency: GeneratedMechanicProjectDependency = {
    contract: artifact.contract,
    finalGameSpec: artifact.finalGameSpec,
    referenceCatalog: artifact.referenceCatalog,
    runtimePolicy: artifact.runtimePolicy,
    sourceArtifact: artifact.sourceArtifact,
    trustedPortContracts: [],
  };
  const actor = {
    x: 1,
    y: 2,
    active: true,
    setPosition(x: number, y: number) {
      actor.x = x;
      actor.y = y;
      return actor;
    },
    body: {
      velocity: { x: 0, y: 0 },
      setVelocity(x: number, y: number) {
        actor.body.velocity = { x, y };
        return actor.body;
      },
    },
  };
  const objects: readonly TrustedTopDownPhaserMechanicObjectRegistration[] = [
    {
      id: "entity_player",
      kind: "player",
      object: actor,
      observeProperties: () => ({ team: "blue" }),
    },
  ];
  return { artifact, dependency, actor, objects };
}

function createOwnedObjectFixture() {
  const base = createFixture();
  const contract: GeneratedMechanicContract = {
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
    throw new Error("Expected the owned-object fixture grant to pass.");
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
  return { artifact, dependency, objects: base.objects };
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

function createContract(): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "contract_generic_session",
    intentId: "intent_generic_session",
    capabilityVersion: "mechanic_capability/v1",
    behavior: {
      summary: "Exercise a retained generic runtime session.",
      triggers: ["action_dispatched", "time_advanced"],
      outcomes: ["state_updated", "actor_moved"],
    },
    config: { kind: "object", fields: [] },
    bindings: [
      {
        id: "actor",
        referenceKind: "entity",
        cardinality: "one",
        objectIds: ["entity_player"],
      },
    ],
    ownedObjects: [],
    privateState: [
      { id: "counter", valueType: "integer", initialValue: 0 },
    ],
    lifecycle: {
      callbacks: [
        "install",
        "logical_action",
        "scheduled",
      ],
      fixedStep: false,
      dispose: true,
    },
    ports: [],
    capabilities: [
      "object_read",
      "object_motion_write",
      "state_read",
      "state_write",
      "time_read",
      "random_next",
      "time_schedule",
    ],
    resourceExpectations: {
      maximumOwnedObjects: 0,
      maximumOperationsPerTick: 16,
      maximumScheduledCallbacks: 1,
      maximumSubscriptions: 0,
      maximumSignalsPerTick: 0,
      maximumStateBytes: 64,
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 1,
    },
    scenarios: [
      {
        id: "scenario_generic_session",
        seed: 1,
        setup: [
          { kind: "binding_present", bindingId: "actor" },
          { kind: "state_equals", stateId: "counter", value: 0 },
        ],
        steps: [
          { kind: "dispatch_action", actionId: "move" },
        ],
        observations: [
          { kind: "state_equals", stateId: "counter", value: 1 },
        ],
      },
    ],
  };
}

function callback(
  id: StableId,
  kind: "install" | "logical_action" | "scheduled" | "dispose"
) {
  return {
    id,
    kind,
    sourceTypeScript: "return null;",
    normalizedJavaScript:
      "const __sparklineGeneratedMechanicCallback = async () => null;",
  };
}

function withContractCapabilities(
  input: SessionInputFixture,
  capabilities: StableId[]
): SessionInputFixture {
  return {
    ...input,
    artifact: {
      ...input.artifact,
      contract: {
        ...input.artifact.contract,
        capabilities: [
          ...input.artifact.contract.capabilities,
          ...capabilities,
        ],
      },
    },
  };
}

function firstDeterministicRandom(seed: number): number {
  let value = (seed + 0x6d2b79f5) | 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
}
