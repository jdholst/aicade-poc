import { describe, expect, it } from "vitest";

import {
  MECHANIC_CAPABILITY_VERSION,
  mechanicCapabilityRegistry,
  type GeneratedMechanicContract,
  type MechanicCapabilityGrant,
} from "@/game-spec";
import type {
  MechanicExecutionRealm,
  MechanicExecutionRealmAdapter,
  MechanicExecutionRealmExecutionInput,
  MechanicExecutionRealmExecutionResult,
} from "@/runtime/mechanics/mechanic-execution-realm";
import {
  createMechanicObjectHost,
  type MechanicObjectHandle,
} from "@/runtime/mechanics/mechanic-object-host";

import {
  GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION,
  buildAndExecuteGeneratedMechanicSource,
} from "./mechanic-source-generation-service";

describe("generated mechanic source stage", () => {
  it("builds a generic TypeScript candidate and executes it through the exact grant", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract();
    const grant = createGrant("state_write");

    const result = await buildAndExecuteGeneratedMechanicSource({
      candidate: {
        schemaVersion: "generated_mechanic_source_candidate/v1",
        id: "generic_source_v1",
        contractId: contract.id,
        capabilityVersion: MECHANIC_CAPABILITY_VERSION,
        callbacks: [
          {
            id: "install_generic_source",
            kind: "install",
            source:
              'await capabilities.state.write("counter", config.initialCount); return { installed: true };',
          },
          {
            id: "dispose_generic_source",
            kind: "dispose",
            source: "return null;",
          },
        ],
      },
      contract,
      grant,
      referenceCatalog: {},
      realmAdapter,
      execution: {
        id: "execute_generic_source",
        callbackId: "install_generic_source",
        config: { initialCount: 3 },
        bindings: [],
        capabilityHost: {
          invoke: () => ({ kind: "json", value: null }),
        },
        seed: 1729,
        resourceBudget: {
          profileId: "phase_9_fixed_budget",
          maximumOwnedObjects: 4,
          maximumOperationsPerTick: 16,
          maximumScheduledCallbacks: 4,
          maximumSubscriptions: 4,
          maximumSignalsPerTick: 4,
          maximumStateBytes: 1024,
          maximumCallbackMilliseconds: 8,
          maximumConsecutiveFailures: 2,
        },
      },
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        artifact: {
          schemaVersion: GENERATED_MECHANIC_SOURCE_ARTIFACT_VERSION,
          id: "generic_source_v1",
          contractId: "generic_contract",
          capabilityVersion: MECHANIC_CAPABILITY_VERSION,
          usedCapabilities: ["state_write"],
          callbacks: [
            {
              id: "install_generic_source",
              kind: "install",
              sourceTypeScript:
                'await capabilities.state.write("counter", config.initialCount); return { installed: true };',
              normalizedJavaScript: expect.stringContaining(
                'await capabilities.state.write("counter", config.initialCount)'
              ),
            },
            {
              id: "dispose_generic_source",
              kind: "dispose",
            },
          ],
          build: {
            staticValidationTarget: "normalized_javascript",
          },
        },
        execution: {
          callbackId: "install_generic_source",
          result: {
            executionId: "execute_generic_source",
            outcome: "completed",
          },
        },
      },
    });
    expect(realmAdapter.createdGrant).toEqual(grant);
    expect(realmAdapter.executions).toHaveLength(1);
    expect(realmAdapter.executions[0]).toMatchObject({
      source: "",
      lifecycle: {
        callbacks: [
          {
            id: "install_generic_source",
            source: expect.stringContaining(
              'realm.callCapability("state_write"'
            ),
          },
          { id: "dispose_generic_source" },
        ],
        invocations: [{ callbackId: "install_generic_source", count: 1 }],
      },
    });
    expect(realmAdapter.disposed).toBe(true);
  });

  it.each([
    {
      name: "missing",
      callbacks: [
        {
          id: "dispose_generic_source",
          kind: "dispose" as const,
          source: "return null;",
        },
      ],
      expectedMessage:
        'Accepted lifecycle callback kind "install" is missing from the source candidate.',
    },
    {
      name: "duplicated",
      callbacks: [
        {
          id: "install_generic_source_one",
          kind: "install" as const,
          source: "return null;",
        },
        {
          id: "install_generic_source_two",
          kind: "install" as const,
          source: "return null;",
        },
        {
          id: "dispose_generic_source",
          kind: "dispose" as const,
          source: "return null;",
        },
      ],
      expectedMessage:
        'Source candidate callback kind "install" must occur exactly once and be declared by the accepted contract.',
    },
  ])(
    "rejects $name lifecycle callback coverage before compilation",
    async ({ callbacks, expectedMessage }) => {
      const realmAdapter = new RecordingRealmAdapter();

      const result = await buildAndExecuteGeneratedMechanicSource({
        ...createBuildInput(realmAdapter),
        candidate: {
          ...createCandidate(),
          callbacks,
        },
      });

      expect(result).toMatchObject({
        success: false,
        evidence: {
          stage: "source_validation",
          code: "invalid_generated_mechanic_source",
          issues: [
            {
              path: "callbacks",
              code: "callback_coverage_mismatch",
              message: expectedMessage,
            },
          ],
        },
      });
      expect(realmAdapter.executions).toHaveLength(0);
    }
  );

  it("returns repair-quality evidence when source violates contract-derived types", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract();

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter, contract),
      candidate: createCandidate(
        'await capabilities.state.write("counter", config.unknownCount);'
      ),
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "source_typecheck",
        code: "generated_mechanic_source_typecheck_failed",
        issues: [
          {
            path: "callbacks.0.source",
            code: "type_failure",
            message: expect.stringContaining("unknownCount"),
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("rejects ambient authority before typecheck or realm admission", async () => {
    const realmAdapter = new RecordingRealmAdapter();

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter),
      candidate: createCandidate(
        'const observedAt = Date.now(); await capabilities.state.write("counter", observedAt);'
      ),
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "source_static_validation",
        code: "generated_mechanic_source_static_validation_failed",
        issues: [
          {
            path: "callbacks.0.source",
            code: "forbidden_source_authority",
            message:
              'Generated mechanic source cannot reference forbidden authority "Date".',
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it.each([
    {
      authority: "Math.random",
      source:
        'const value = Math.random(); await capabilities.state.write("counter", value);',
    },
    {
      authority: "console",
      source:
        'console.log(config.initialCount); await capabilities.state.write("counter", config.initialCount);',
    },
    {
      authority: "Math.random",
      source:
        'const value = Math["random"](); await capabilities.state.write("counter", value);',
    },
    {
      authority: "Buffer",
      source:
        'const value = Buffer.from("x").length; await capabilities.state.write("counter", value);',
    },
    {
      authority: "setImmediate",
      source:
        'setImmediate(() => undefined); await capabilities.state.write("counter", config.initialCount);',
    },
    {
      authority: "queueMicrotask",
      source:
        'queueMicrotask(() => undefined); await capabilities.state.write("counter", config.initialCount);',
    },
    {
      authority: "constructor",
      source:
        'const dynamic = (async () => undefined).constructor("return globalThis"); await capabilities.state.write("counter", Number(Boolean(dynamic)));',
    },
    {
      authority: "import",
      source:
        'await import("node:fs"); await capabilities.state.write("counter", config.initialCount);',
    },
    {
      authority: "Math",
      source:
        'const deterministicMath = Math; const value = deterministicMath.random(); await capabilities.state.write("counter", value);',
    },
    {
      authority: "URL",
      source:
        'const value = new URL("https://example.test").hostname.length; await capabilities.state.write("counter", value);',
    },
    {
      authority: "constructor",
      source:
        'const key = "constructor"; const DynamicFunction = Object.getPrototypeOf(async function () {})[key]; const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "Object.getPrototypeOf",
      source:
        'const key = ["con", "structor"].join(""); const DynamicFunction = Object.getPrototypeOf(async function () {})[key]; const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'const key: "bind" = JSON.parse("\\\"constructor\\\""); const DynamicFunction = (async function () {})[key] as unknown as (source: string) => () => unknown; const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'let target: any; target = async () => undefined; const key: any = JSON.parse("\\\"constructor\\\""); const DynamicFunction = target[key]; const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'const { constructor: DynamicFunction } = async function () {}; const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'const key: string = JSON.parse("\\\"constructor\\\""); const target = async function () {} as unknown as Record<string, any>; const { [key]: DynamicFunction } = target; const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'let target: any; target = async () => undefined; const key: number = JSON.parse("\\\"constructor\\\""); const DynamicFunction = target[key]; const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'let DynamicFunction: any; ({ constructor: DynamicFunction } = async function () {}); const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'let DynamicFunction: any; const key: string = JSON.parse("\\\"constructor\\\""); const target = async function () {} as unknown as Record<string, any>; ({ [key]: DynamicFunction } = target); const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'let DynamicFunction: any; for ({ constructor: DynamicFunction } of [async function () {}]) {} const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
    {
      authority: "constructor",
      source:
        'let DynamicFunction: any; const key: string = JSON.parse("\\\"constructor\\\""); const target = async function () {} as unknown as Record<string, any>; for ({ [key]: DynamicFunction } of [target]) {} const value = DynamicFunction("return globalThis")(); await capabilities.state.write("counter", Number(Boolean(value)));',
    },
  ])(
    "rejects forbidden ambient API $authority",
    async ({ authority, source }) => {
      const realmAdapter = new RecordingRealmAdapter();

      const result = await buildAndExecuteGeneratedMechanicSource({
        ...createBuildInput(realmAdapter),
        candidate: createCandidate(source),
      });

      expect(result).toEqual({
        success: false,
        evidence: {
          stage: "source_static_validation",
          code: "generated_mechanic_source_static_validation_failed",
          issues: [
            {
              path: "callbacks.0.source",
              code: "forbidden_source_authority",
              message: `Generated mechanic source cannot reference forbidden authority "${authority}".`,
            },
          ],
        },
      });
      expect(realmAdapter.executions).toHaveLength(0);
    }
  );

  it("allows numeric array indexing while rejecting dynamic property authority", async () => {
    const realmAdapter = new RecordingRealmAdapter();

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter),
      candidate: createCandidate(
        'const index: number = 0; const value = [config.initialCount][index]; await capabilities.state.write("counter", value);'
      ),
    });

    expect(result).toMatchObject({ success: true });
    expect(realmAdapter.executions).toHaveLength(1);
  });

  it("supports the finite deterministic BigInt source surface", async () => {
    const realmAdapter = new RecordingRealmAdapter();

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter),
      candidate: createCandidate(
        'const value = Number(BigInt(1)); await capabilities.state.write("counter", value);'
      ),
    });

    expect(result).toMatchObject({ success: true });
    expect(realmAdapter.executions).toHaveLength(1);
  });

  it("narrows scheduled capability callback IDs to scheduled callbacks", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract({
      lifecycle: {
        callbacks: ["install", "scheduled"],
        fixedStep: false,
        dispose: true,
      },
      capabilities: ["time_schedule"],
    });
    const candidate = {
      ...createCandidate(),
      callbacks: [
        {
          id: "install_generic_source",
          kind: "install" as const,
          source:
            'await capabilities.time.schedule(1, "install_generic_source");',
        },
        {
          id: "scheduled_generic_source",
          kind: "scheduled" as const,
          source: "return null;",
        },
        {
          id: "dispose_generic_source",
          kind: "dispose" as const,
          source: "return null;",
        },
      ],
    };

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter, contract),
      contract,
      grant: createGrant("time_schedule"),
      candidate,
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "source_typecheck",
        issues: [
          {
            code: "type_failure",
            message: expect.stringContaining("install_generic_source"),
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("rejects execution bindings that do not match contract cardinality", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract({
      bindings: [
        {
          id: "actor",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: ["actor_1"],
        },
      ],
      capabilities: ["object_read"],
    });

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter, contract),
      contract,
      grant: createGrant("object_read"),
      candidate: createCandidate(
        "return await capabilities.objects.read(bindings.actor);"
      ),
      execution: {
        ...createBuildInput(realmAdapter, contract).execution,
        bindings: [],
      },
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "source_validation",
        issues: [
          {
            path: "execution.bindings",
            code: "invalid_execution_bindings",
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("rejects opaque handles attested to objects outside the contract binding", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract({
      bindings: [
        {
          id: "actor",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: ["actor_1"],
        },
      ],
      capabilities: ["object_read"],
    });
    const objectHost = createObjectBindingHost("actor_2");
    const handle = objectHost.resolveOne("actor");
    const buildInput = createBuildInput(realmAdapter, contract);

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...buildInput,
      contract,
      grant: createGrant("object_read"),
      candidate: createCandidate(
        "return await capabilities.objects.read(bindings.actor);"
      ),
      execution: {
        ...buildInput.execution,
        bindings: [{ id: "actor", cardinality: "one", handles: [handle] }],
        bindingAuthority: objectHost.bindingAuthority,
      },
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "source_validation",
        issues: [
          {
            path: "execution.bindings",
            code: "invalid_execution_bindings",
            message: expect.stringContaining("object identities"),
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("accepts genuine object-host binding identity attestation", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract({
      bindings: [
        {
          id: "actor",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: ["actor_1"],
        },
      ],
      capabilities: ["object_read"],
    });
    const objectHost = createObjectBindingHost("actor_1");
    const handle = objectHost.resolveOne("actor");
    const buildInput = createBuildInput(realmAdapter, contract);

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...buildInput,
      contract,
      grant: createGrant("object_read"),
      candidate: createCandidate(
        "return await capabilities.objects.read(bindings.actor);"
      ),
      execution: {
        ...buildInput.execution,
        bindings: [{ id: "actor", cardinality: "one", handles: [handle] }],
        bindingAuthority: objectHost.bindingAuthority,
      },
    });

    expect(result).toMatchObject({ success: true });
    expect(realmAdapter.executions).toHaveLength(1);
  });

  it("rejects caller-forged binding identity attestation", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract({
      bindings: [
        {
          id: "actor",
          referenceKind: "entity",
          cardinality: "one",
          objectIds: ["actor_1"],
        },
      ],
      capabilities: ["object_read"],
    });
    const handle = Object.freeze(
      Object.create(null)
    ) as MechanicObjectHandle;
    const buildInput = createBuildInput(realmAdapter, contract);

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...buildInput,
      contract,
      grant: createGrant("object_read"),
      candidate: createCandidate(
        "return await capabilities.objects.read(bindings.actor);"
      ),
      execution: {
        ...buildInput.execution,
        bindings: [{ id: "actor", cardinality: "one", handles: [handle] }],
        bindingAuthority: {
          objectIdForHandle: () => "actor_1",
        },
      },
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "source_validation",
        issues: [
          {
            path: "execution.bindings",
            code: "invalid_execution_bindings",
            message: expect.stringContaining("trusted object"),
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("rejects lifecycle input that violates an accepted input-port payload", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract({
      lifecycle: {
        callbacks: ["install", "gameplay_event"],
        fixedStep: false,
        dispose: true,
      },
      ports: [
        {
          id: "accepted_input",
          direction: "input",
          payload: { kind: "boolean" },
        },
      ],
      scenarios: [
        {
          id: "receive_accepted_input",
          seed: 1729,
          setup: [],
          steps: [
            {
              kind: "receive_input",
              portId: "accepted_input",
              value: true,
            },
          ],
          observations: [
            { kind: "state_equals", stateId: "counter", value: 3 },
          ],
        },
      ],
    });
    const buildInput = createBuildInput(realmAdapter, contract);

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...buildInput,
      contract,
      candidate: {
        ...createCandidate(),
        callbacks: [
          {
            id: "install_generic_source",
            kind: "install" as const,
            source: "return null;",
          },
          {
            id: "gameplay_event_generic_source",
            kind: "gameplay_event" as const,
            source:
              'await capabilities.state.write("counter", config.initialCount);',
          },
          {
            id: "dispose_generic_source",
            kind: "dispose" as const,
            source: "return null;",
          },
        ],
      },
      execution: {
        ...buildInput.execution,
        callbackId: "gameplay_event_generic_source",
        lifecycleInput: {
          eventId: "accepted_input",
          payload: "wrong_payload",
        },
      },
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "source_validation",
        issues: [
          {
            path: "execution.lifecycleInput",
            code: "invalid_lifecycle_input",
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("typechecks gameplay-event input payloads against their declared ports", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const contract = createContract({
      lifecycle: {
        callbacks: ["install", "gameplay_event"],
        fixedStep: false,
        dispose: true,
      },
      ports: [
        {
          id: "accepted_input",
          direction: "input",
          payload: { kind: "boolean" },
        },
      ],
      scenarios: [
        {
          id: "receive_accepted_input",
          seed: 1729,
          setup: [],
          steps: [
            {
              kind: "receive_input",
              portId: "accepted_input",
              value: true,
            },
          ],
          observations: [
            { kind: "state_equals", stateId: "counter", value: 3 },
          ],
        },
      ],
    });
    const buildInput = createBuildInput(realmAdapter, contract);

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...buildInput,
      contract,
      candidate: {
        ...createCandidate(),
        callbacks: [
          {
            id: "install_generic_source",
            kind: "install" as const,
            source: "return null;",
          },
          {
            id: "gameplay_event_generic_source",
            kind: "gameplay_event" as const,
            source:
              'if (typeof lifecycleInput !== "string" && lifecycleInput.eventId === "accepted_input") { const invalidPayload: string = lifecycleInput.payload; await capabilities.state.write("counter", invalidPayload.length); }',
          },
          {
            id: "dispose_generic_source",
            kind: "dispose" as const,
            source: "return null;",
          },
        ],
      },
      execution: {
        ...buildInput.execution,
        callbackId: "gameplay_event_generic_source",
        lifecycleInput: { eventId: "accepted_input", payload: true },
      },
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "source_typecheck",
        issues: [
          {
            path: "callbacks.1.source",
            code: "type_failure",
            message: expect.stringContaining("boolean"),
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("rejects source that shadows the trusted capability facade", async () => {
    const realmAdapter = new RecordingRealmAdapter();

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter),
      candidate: createCandidate(
        'const capabilities = { state: { write: async () => undefined } }; await capabilities.state.write("counter", config.initialCount);'
      ),
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "source_static_validation",
        code: "generated_mechanic_source_static_validation_failed",
        issues: [
          {
            path: "callbacks.0.source",
            code: "source_context_shadowing",
            message:
              'Generated mechanic source cannot shadow trusted source context "capabilities".',
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("rejects a direct capability call that is not awaited", async () => {
    const realmAdapter = new RecordingRealmAdapter();

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter),
      candidate: createCandidate(
        'capabilities.state.write("counter", config.initialCount);'
      ),
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "source_static_validation",
        code: "generated_mechanic_source_static_validation_failed",
        issues: [
          {
            path: "callbacks.0.source",
            code: "unawaited_capability_call",
            message:
              'Generated mechanic capability call "state.write" must be directly awaited.',
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it.each([
    {
      boundary: "binding",
      contract: createContract({
        bindings: [
          {
            id: "actor",
            referenceKind: "entity",
            cardinality: "one",
            objectIds: ["actor_1"],
          },
        ],
        capabilities: ["object_read"],
      }),
      grant: createGrant("object_read"),
      candidate: createCandidate(
        "return await capabilities.objects.read(bindings.missing);"
      ),
      diagnostic: "missing",
    },
    {
      boundary: "output port",
      contract: createContract({
        ports: [
          {
            id: "accepted_output",
            direction: "output",
            payload: { kind: "boolean" },
          },
        ],
        capabilities: ["signal_emit"],
      }),
      grant: createGrant("signal_emit"),
      candidate: createCandidate(
        'await capabilities.signals.emit("unaccepted_output", true);'
      ),
      diagnostic: "unaccepted_output",
    },
    {
      boundary: "output port payload",
      contract: createContract({
        ports: [
          {
            id: "accepted_output",
            direction: "output",
            payload: { kind: "boolean" },
          },
        ],
        capabilities: ["signal_emit"],
      }),
      grant: createGrant("signal_emit"),
      candidate: createCandidate(
        'await capabilities.signals.emit("accepted_output", "wrong_payload");'
      ),
      diagnostic: "not assignable",
    },
    {
      boundary: "input port payload",
      contract: createContract({
        lifecycle: {
          callbacks: ["logical_action"],
          fixedStep: false,
          dispose: true,
        },
        ports: [
          {
            id: "accepted_input",
            direction: "input",
            payload: { kind: "boolean" },
          },
        ],
      }),
      grant: createGrant("state_write"),
      candidate: createCandidate(
        'const invalidInput: typeof lifecycleInput = { actionId: "accepted_input", payload: "wrong_payload" }; await capabilities.state.write("counter", invalidInput ? 1 : 0);',
        "logical_action"
      ),
      diagnostic: "not assignable",
    },
    {
      boundary: "lifecycle input",
      contract: createContract({
        lifecycle: {
          callbacks: ["scheduled"],
          fixedStep: false,
          dispose: true,
        },
      }),
      grant: createGrant("state_write"),
      candidate: createCandidate(
        'await capabilities.state.write("counter", lifecycleInput.actionId);',
        "scheduled"
      ),
      diagnostic: "actionId",
    },
    {
      boundary: "exact capability grant",
      contract: createContract(),
      grant: createGrant("state_write"),
      candidate: createCandidate(
        'await capabilities.state.read("counter"); await capabilities.state.write("counter", config.initialCount);'
      ),
      diagnostic: "read",
    },
  ])(
    "typechecks the contract-derived $boundary surface",
    async ({ contract, grant, candidate, diagnostic }) => {
      const realmAdapter = new RecordingRealmAdapter();

      const result = await buildAndExecuteGeneratedMechanicSource({
        ...createBuildInput(realmAdapter, contract),
        contract,
        grant,
        candidate,
      });

      expect(result).toMatchObject({
        success: false,
        evidence: {
          stage: "source_typecheck",
          code: "generated_mechanic_source_typecheck_failed",
          issues: [
            {
              path: "callbacks.0.source",
              code: "type_failure",
              message: expect.stringContaining(diagnostic),
            },
          ],
        },
      });
      expect(realmAdapter.executions).toHaveLength(0);
    }
  );

  it("rejects a grant that does not exactly match the accepted contract", async () => {
    const realmAdapter = new RecordingRealmAdapter();

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter),
      grant: createGrant("state_read"),
      candidate: createCandidate(
        'return await capabilities.state.read("counter");'
      ),
    });

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "source_validation",
        code: "invalid_generated_mechanic_source",
        issues: [
          {
            path: "grant.capabilities",
            code: "grant_mismatch",
            message:
              "Mechanic source grant must exactly match the accepted contract capability declarations.",
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("rejects forged metadata on an otherwise matching capability grant", async () => {
    const realmAdapter = new RecordingRealmAdapter();
    const grant = createGrant("state_write");
    grant.capabilities[0] = {
      ...grant.capabilities[0]!,
      resourceCosts: { operationsPerTick: 0 },
    };

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter),
      grant,
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "source_validation",
        issues: [{ path: "grant.capabilities", code: "grant_mismatch" }],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("returns compilation evidence for syntactically invalid TypeScript", async () => {
    const realmAdapter = new RecordingRealmAdapter();

    const result = await buildAndExecuteGeneratedMechanicSource({
      ...createBuildInput(realmAdapter),
      candidate: createCandidate(
        'await capabilities.state.write("counter", config.initialCount;'
      ),
    });

    expect(result).toMatchObject({
      success: false,
      evidence: {
        stage: "source_compilation",
        code: "generated_mechanic_source_compilation_failed",
        issues: [
          {
            path: "callbacks.0.source",
            code: "compile_failure",
          },
        ],
      },
    });
    expect(realmAdapter.executions).toHaveLength(0);
  });

  it("keeps a realm-rejected artifact out of the successful result and disposes the realm", async () => {
    const realmAdapter = new RecordingRealmAdapter("failed");

    const result = await buildAndExecuteGeneratedMechanicSource(
      createBuildInput(realmAdapter)
    );

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "realm_execution",
        code: "generated_mechanic_source_realm_rejected",
        runtimeExecution: {
          sourceArtifactId: "generic_source_v1",
          contractId: "generic_contract",
          intentId: "generic_intent",
          capabilityVersion: MECHANIC_CAPABILITY_VERSION,
          executionId: "execute_generic_source",
          callbackId: "install_generic_source",
          result: {
            executionId: "execute_generic_source",
            outcome: "failed",
            output: { installed: true },
            diagnostic: {
              stage: "realm_execution",
              code: "recording_rejection",
              message: "recording realm rejected source",
            },
          },
        },
        issues: [
          {
            path: "realm.execute",
            code: "realm_rejection",
            message: "recording realm rejected source",
          },
        ],
      },
    });
    expect(realmAdapter.disposed).toBe(true);
  });

  it.each([
    ["execute_throw" as const, "recording execute threw"],
    ["result_rejection" as const, "recording result rejected"],
  ])(
    "keeps correlated evidence when realm execution fails through %s",
    async (fault, message) => {
      const realmAdapter = new FaultingRealmAdapter(fault);

      const result = await buildAndExecuteGeneratedMechanicSource(
        createBuildInput(realmAdapter)
      );

      expect(result).toEqual({
        success: false,
        evidence: {
          stage: "realm_execution",
          code: "generated_mechanic_source_realm_rejected",
          runtimeExecution: {
            sourceArtifactId: "generic_source_v1",
            contractId: "generic_contract",
            intentId: "generic_intent",
            capabilityVersion: MECHANIC_CAPABILITY_VERSION,
            executionId: "execute_generic_source",
            callbackId: "install_generic_source",
          },
          issues: [
            {
              path: "realm.execute",
              code: "realm_rejection",
              message,
            },
          ],
        },
      });
      expect(realmAdapter.disposed).toBe(true);
    }
  );

  it("preserves the primary realm failure when cleanup also fails", async () => {
    const realmAdapter = new RecordingRealmAdapter(
      "failed",
      new Error("recording disposal failed")
    );

    const result = await buildAndExecuteGeneratedMechanicSource(
      createBuildInput(realmAdapter)
    );

    expect(result).toMatchObject({
      success: false,
      evidence: {
        runtimeExecution: {
          result: { outcome: "failed" },
        },
        issues: [
          { path: "realm.execute", code: "realm_rejection" },
          { path: "realm.dispose", code: "realm_cleanup_failure" },
        ],
      },
    });
  });

  it("returns cleanup evidence when realm disposal fails after execution", async () => {
    const realmAdapter = new RecordingRealmAdapter(
      "completed",
      new Error("recording disposal failed")
    );

    const result = await buildAndExecuteGeneratedMechanicSource(
      createBuildInput(realmAdapter)
    );

    expect(result).toEqual({
      success: false,
      evidence: {
        stage: "realm_execution",
        code: "generated_mechanic_source_realm_rejected",
        runtimeExecution: {
          sourceArtifactId: "generic_source_v1",
          contractId: "generic_contract",
          intentId: "generic_intent",
          capabilityVersion: MECHANIC_CAPABILITY_VERSION,
          executionId: "execute_generic_source",
          callbackId: "install_generic_source",
          result: {
            executionId: "execute_generic_source",
            outcome: "completed",
            output: { installed: true },
          },
        },
        issues: [
          {
            path: "realm.dispose",
            code: "realm_cleanup_failure",
            message: "recording disposal failed",
          },
        ],
      },
    });
  });
});

function createBuildInput(
  realmAdapter: MechanicExecutionRealmAdapter,
  contract = createContract()
) {
  return {
    candidate: createCandidate(),
    contract,
    grant: createGrant("state_write"),
    referenceCatalog: {},
    realmAdapter,
    execution: {
      id: "execute_generic_source",
      callbackId: "install_generic_source",
      config: { initialCount: 3 },
      bindings: [],
      capabilityHost: {
        invoke: () => ({ kind: "json" as const, value: null }),
      },
      seed: 1729,
      resourceBudget: {
        profileId: "phase_9_fixed_budget",
        maximumOwnedObjects: 4,
        maximumOperationsPerTick: 16,
        maximumScheduledCallbacks: 4,
        maximumSubscriptions: 4,
        maximumSignalsPerTick: 4,
        maximumStateBytes: 1024,
        maximumCallbackMilliseconds: 8,
        maximumConsecutiveFailures: 2,
      },
    },
  };
}

function createCandidate(
  installSource =
    'await capabilities.state.write("counter", config.initialCount); return { installed: true };',
  kind: "install" | "logical_action" | "scheduled" = "install"
) {
  return {
    schemaVersion: "generated_mechanic_source_candidate/v1" as const,
    id: "generic_source_v1",
    contractId: "generic_contract",
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    callbacks: [
      {
        id: `${kind}_generic_source`,
        kind,
        source: installSource,
      },
      {
        id: "dispose_generic_source",
        kind: "dispose" as const,
        source: "return null;",
      },
    ],
  };
}

function createContract(
  overrides: Partial<GeneratedMechanicContract> = {}
): GeneratedMechanicContract {
  return {
    schemaVersion: "generated-mechanic-contract/v1",
    id: "generic_contract",
    intentId: "generic_intent",
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    behavior: {
      summary: "Maintain one private counter during installation.",
      triggers: ["installation"],
      outcomes: ["counter_initialized"],
    },
    config: {
      kind: "object",
      fields: [
        {
          key: "initialCount",
          required: true,
          value: { kind: "integer", minimum: 0, maximum: 10 },
        },
      ],
    },
    bindings: [],
    ownedObjects: [],
    privateState: [
      { id: "counter", valueType: "integer", initialValue: 0 },
    ],
    lifecycle: {
      callbacks: ["install"],
      fixedStep: false,
      dispose: true,
    },
    ports: [],
    capabilities: ["state_write"],
    resourceExpectations: {
      maximumOwnedObjects: 0,
      maximumOperationsPerTick: 1,
      maximumScheduledCallbacks: 0,
      maximumSubscriptions: 0,
      maximumSignalsPerTick: 0,
      maximumStateBytes: 128,
      maximumCallbackMilliseconds: 8,
      maximumConsecutiveFailures: 2,
    },
    scenarios: [
      {
        id: "install_counter",
        seed: 1729,
        setup: [],
        steps: [{ kind: "advance_time", milliseconds: 1 }],
        observations: [
          { kind: "state_equals", stateId: "counter", value: 3 },
        ],
      },
    ],
    ...overrides,
  };
}

function createGrant(...capabilityIds: string[]): MechanicCapabilityGrant {
  return {
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    capabilities: capabilityIds.map((capabilityId, index) => ({
      ...mechanicCapabilityRegistry.capabilities.find(
        (capability) => capability.id === capabilityId
      )!,
      justification: {
        kind: "contract_declaration" as const,
        path: `capabilities.${index}`,
      },
    })),
  };
}

function createObjectBindingHost(objectId: string) {
  return createMechanicObjectHost({
    mechanicId: "generic_mechanic",
    grant: createGrant("object_read"),
    bindings: [
      {
        id: "actor",
        cardinality: "one",
        getObjectIds: () => [objectId],
      },
    ],
    ownedObjectArchetypes: [],
    adapter: {
      hasObject: (candidateId) => candidateId === objectId,
      observeObject: () => ({
        active: true,
        kind: "actor",
        position: { x: 0, y: 0 },
        properties: {},
        velocity: { x: 0, y: 0 },
      }),
    },
  });
}

class RecordingRealmAdapter implements MechanicExecutionRealmAdapter {
  readonly adapterVersion = "mechanic_execution_realm_adapter/v1";
  readonly id = "recording_realm_adapter";
  createdGrant: MechanicCapabilityGrant | undefined;
  executions: MechanicExecutionRealmExecutionInput[] = [];
  disposed = false;

  constructor(
    private readonly outcome: MechanicExecutionRealmExecutionResult["outcome"] =
      "completed",
    private readonly disposeError?: Error
  ) {}

  async create(input: Parameters<MechanicExecutionRealmAdapter["create"]>[0]) {
    this.createdGrant = structuredClone(input.capabilityGrant);
    return {
      execute: (execution) => {
        this.executions.push(structuredClone(execution));
        const result: MechanicExecutionRealmExecutionResult = {
          executionId: execution.id,
          outcome: this.outcome,
          output: { installed: true },
          ...(this.outcome === "failed"
            ? {
                diagnostic: {
                  stage: "realm_execution" as const,
                  code: "recording_rejection",
                  message: "recording realm rejected source",
                },
              }
            : {}),
        };
        return {
          result: Promise.resolve(result),
          terminate: async () => ({
            executionId: execution.id,
            outcome: "terminated" as const,
          }),
        };
      },
      dispose: () => {
        if (this.disposeError) {
          throw this.disposeError;
        }
        this.disposed = true;
      },
    } satisfies MechanicExecutionRealm;
  }
}

class FaultingRealmAdapter implements MechanicExecutionRealmAdapter {
  readonly adapterVersion = "mechanic_execution_realm_adapter/v1";
  readonly id = "faulting_realm_adapter";
  disposed = false;

  constructor(
    private readonly fault: "execute_throw" | "result_rejection"
  ) {}

  async create(): Promise<MechanicExecutionRealm> {
    return {
      execute: (execution) => {
        if (this.fault === "execute_throw") {
          throw new Error("recording execute threw");
        }
        return {
          result: Promise.reject(new Error("recording result rejected")),
          terminate: async () => ({
            executionId: execution.id,
            outcome: "terminated" as const,
          }),
        };
      },
      dispose: () => {
        this.disposed = true;
      },
    };
  }
}
