import { describe, expect, it } from "vitest";

import type { RuntimeCommand } from "@/runtime/runtime-adapter";
import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import { projectAcceptedGeneratedMechanicRuntimeCandidate } from "@/game-spec/mechanics/generated-mechanic-project-artifact";

import { createTopDownPhaserTemplate } from "./top-down-template";
import {
  GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION,
  createGeneratedMechanicPhaserParentSession,
  waitForGeneratedMechanicPhaserChildSession,
  type GeneratedMechanicPhaserMessageWindow,
  type GeneratedMechanicPhaserProtocolTimers,
} from "./generated-mechanic-phaser-host-protocol";

describe("generated mechanic Phaser host protocol", () => {
  it("bootstraps one closure-owned project and exchanges acknowledged sequenced runtime traffic", async () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const template = createTopDownPhaserTemplate(
      fixture.dependency.finalGameSpec.gameSpec
    );
    const parentOwner = new FakeMessageWindow();
    const parentTarget = new FakeMessageWindow();
    const childOwner = new FakeMessageWindow();
    const childTarget = new FakeMessageWindow();
    const globalKeysBefore = Reflect.ownKeys(globalThis);
    const parent = createGeneratedMechanicPhaserParentSession({
      iframeWindow: childTarget,
      nonce: "private_nonce",
      ownerWindow: parentOwner,
      project: {
        artifact: fixture.artifact,
        dependency: fixture.dependency,
      },
      sessionId: "private_session",
      template,
    });
    const childPromise = waitForGeneratedMechanicPhaserChildSession({
      deadlineMilliseconds: 100,
      expectedParent: parentTarget,
      ownerWindow: childOwner,
    });

    parent.sendBootstrap();
    expect(childTarget.posts[0]).toMatchObject({
      targetOrigin: "*",
      transfer: [],
      message: {
        kind: "sparkline_generated_mechanic_phaser_project_bootstrap",
        protocolVersion: GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION,
        sessionId: "private_session",
        nonce: "private_nonce",
        sequence: 0,
        template,
        project: {
          artifact: fixture.artifact,
          dependency: fixture.dependency,
        },
      },
    });
    childOwner.emit({
      data: childTarget.posts[0]?.message,
      source: parentTarget,
      origin: "https://creator.sparkline.test",
    });

    const child = await childPromise;
    expect(child.getTemplate()).toBe(template);
    expect(child.getProject()).toEqual({
      artifact: fixture.artifact,
      dependency: fixture.dependency,
    });
    expect(parentTarget.posts[0]).toMatchObject({
      targetOrigin: "https://creator.sparkline.test",
      transfer: [],
      message: {
        kind: "sparkline_generated_mechanic_phaser_bootstrap_acknowledgement",
        protocolVersion: GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION,
        sessionId: "private_session",
        nonce: "private_nonce",
        sequence: 0,
        artifactId: fixture.artifact.id,
        finalGameSpecArtifactId: fixture.artifact.finalGameSpecArtifactId,
        sourceArtifactId: fixture.artifact.sourceArtifact.id,
      },
    });
    expect(
      parent.consumeIframeMessage(
        parentOwner.event({
          data: parentTarget.posts[0]?.message,
          source: childTarget,
          origin: "null",
        })
      )
    ).toBeNull();
    expect(parent.isAcknowledged()).toBe(true);

    const command: RuntimeCommand = { type: "game-pause", paused: true };
    parent.postRuntimeCommand(command);
    expect(childTarget.posts[1]).toMatchObject({
      targetOrigin: "*",
      transfer: [],
      message: {
        kind: "sparkline_generated_mechanic_phaser_runtime_command",
        sequence: 1,
        command,
      },
    });
    expect(
      child.consumeRuntimeCommand(
        childOwner.event({
          data: childTarget.posts[1]?.message,
          source: parentTarget,
          origin: "https://creator.sparkline.test",
        })
      )
    ).toEqual(command);

    const runtimeEventCandidate = { type: "game-ready", fixture: true };
    child.postRuntimeEvent(runtimeEventCandidate);
    expect(parentTarget.posts[1]).toMatchObject({
      targetOrigin: "https://creator.sparkline.test",
      transfer: [],
      message: {
        kind: "sparkline_generated_mechanic_phaser_runtime_event",
        sequence: 1,
        event: runtimeEventCandidate,
      },
    });
    expect(
      parent.consumeIframeMessage(
        parentOwner.event({
          data: parentTarget.posts[1]?.message,
          source: childTarget,
          origin: "null",
        })
      )
    ).toBe(runtimeEventCandidate);
    expect(Reflect.ownKeys(globalThis)).toEqual(globalKeysBefore);
    expect(childOwner.listenerCount).toBe(0);

    childOwner.emit({
      data: childTarget.posts[0]?.message,
      source: parentTarget,
      origin: "https://creator.sparkline.test",
    });
    expect(parentTarget.posts).toHaveLength(2);
  });

  it("acknowledges the exact transient candidate continuation identity", async () => {
    const fixture = createGeneratedMechanicProjectFixture();
    const projected = projectAcceptedGeneratedMechanicRuntimeCandidate(
      fixture.artifact
    );
    const project = {
      runtimeCandidate: {
        ...projected,
        runtimeExecutionId: "runtime_execution_candidate_v1",
      },
      dependency: fixture.dependency,
    } as const;
    const template = createTopDownPhaserTemplate(
      fixture.dependency.finalGameSpec.gameSpec
    );
    const parentOwner = new FakeMessageWindow();
    const parentTarget = new FakeMessageWindow();
    const childOwner = new FakeMessageWindow();
    const childTarget = new FakeMessageWindow();
    const parent = createGeneratedMechanicPhaserParentSession({
      iframeWindow: childTarget,
      nonce: "candidate_nonce",
      ownerWindow: parentOwner,
      project,
      sessionId: "candidate_session",
      template,
    });
    const childPromise = waitForGeneratedMechanicPhaserChildSession({
      deadlineMilliseconds: 100,
      expectedParent: parentTarget,
      ownerWindow: childOwner,
    });

    parent.sendBootstrap();
    childOwner.emit({
      data: childTarget.posts[0]?.message,
      source: parentTarget,
      origin: "https://creator.sparkline.test",
    });
    const child = await childPromise;

    expect(child.getProject()).toEqual(project);
    expect(parentTarget.posts[0]?.message).toMatchObject({
      projectKind: "candidate",
      runtimeExecutionId: "runtime_execution_candidate_v1",
      artifactId: fixture.artifact.id,
      sourceArtifactId: fixture.artifact.sourceArtifact.id,
    });
    expect(
      parent.consumeIframeMessage(
        parentOwner.event({
          data: parentTarget.posts[0]?.message,
          source: childTarget,
          origin: "null",
        })
      )
    ).toBeNull();
    expect(parent.isAcknowledged()).toBe(true);
  });

  it("rejects malformed or foreign project bootstraps and cleans up the waiter", async () => {
    const invalidCases = [
      "untrusted",
      "foreign-current-target",
      "foreign-source",
      "empty-origin",
      "ports",
      "wrong-version",
      "empty-nonce",
      "extra-key",
      "custom-prototype",
    ] as const;

    for (const invalidCase of invalidCases) {
      const setup = createBootstrapSetup();
      const childPromise = waitForGeneratedMechanicPhaserChildSession({
        deadlineMilliseconds: 100,
        expectedParent: setup.parentTarget,
        ownerWindow: setup.childOwner,
      });
      const input: FakeMessageInput = {
        data: setup.bootstrap,
        source: setup.parentTarget,
        origin: "https://creator.sparkline.test",
      };

      if (invalidCase === "untrusted") {
        input.isTrusted = false;
      } else if (invalidCase === "foreign-current-target") {
        input.currentTarget = new FakeMessageWindow();
      } else if (invalidCase === "foreign-source") {
        input.source = new FakeMessageWindow();
      } else if (invalidCase === "empty-origin") {
        input.origin = " ";
      } else if (invalidCase === "ports") {
        input.ports = [fakeMessagePort];
      } else if (invalidCase === "wrong-version") {
        input.data = cloneRecord(setup.bootstrap, {
          protocolVersion: "generated_mechanic_phaser_host/v0",
        });
      } else if (invalidCase === "empty-nonce") {
        input.data = cloneRecord(setup.bootstrap, { nonce: "" });
      } else if (invalidCase === "extra-key") {
        input.data = cloneRecord(setup.bootstrap, { injected: true });
      } else {
        input.data = copyWithCustomPrototype(setup.bootstrap);
      }

      setup.childOwner.emit(input);
      await expect(childPromise, invalidCase).rejects.toThrow(
        "project bootstrap was invalid"
      );
      expect(setup.childOwner.listenerCount, invalidCase).toBe(0);
      expect(setup.parentTarget.posts, invalidCase).toHaveLength(0);
    }
  });

  it("rejects on timeout and removes the waiter listener and timer", async () => {
    const ownerWindow = new FakeMessageWindow();
    const timers = new FakeProtocolTimers();
    const childPromise = waitForGeneratedMechanicPhaserChildSession({
      deadlineMilliseconds: 25,
      expectedParent: new FakeMessageWindow(),
      ownerWindow,
      timers,
    });

    expect(ownerWindow.listenerCount).toBe(1);
    timers.fire();

    await expect(childPromise).rejects.toThrow("project bootstrap timed out");
    expect(ownerWindow.listenerCount).toBe(0);
    expect(timers.clearedIds).toEqual([timers.timeoutId]);
  });

  it("admits only exact next commands from the pinned parent", async () => {
    const setup = await createProtocolHarness();
    const pause: RuntimeCommand = { type: "game-pause", paused: true };
    setup.parent.postRuntimeCommand(pause);
    const commandEnvelope = setup.childTarget.posts[1]?.message;
    const validInput: FakeMessageInput = {
      data: commandEnvelope,
      source: setup.parentTarget,
      origin: setup.parentOrigin,
    };
    const invalidInputs: FakeMessageInput[] = [
      { ...validInput, isTrusted: false },
      { ...validInput, currentTarget: new FakeMessageWindow() },
      { ...validInput, source: new FakeMessageWindow() },
      { ...validInput, origin: "https://foreign.sparkline.test" },
      { ...validInput, ports: [fakeMessagePort] },
      {
        ...validInput,
        data: cloneRecord(commandEnvelope, {
          protocolVersion: "generated_mechanic_phaser_host/v0",
        }),
      },
      {
        ...validInput,
        data: cloneRecord(commandEnvelope, { nonce: "foreign_nonce" }),
      },
      {
        ...validInput,
        data: cloneRecord(commandEnvelope, { sessionId: "foreign_session" }),
      },
      { ...validInput, data: cloneRecord(commandEnvelope, { sequence: 0 }) },
      { ...validInput, data: cloneRecord(commandEnvelope, { sequence: 2 }) },
      {
        ...validInput,
        data: cloneRecord(commandEnvelope, { injected: true }),
      },
      { ...validInput, data: copyWithCustomPrototype(commandEnvelope) },
      {
        ...validInput,
        data: cloneRecord(commandEnvelope, {
          command: { type: "game-pause", paused: true, injected: true },
        }),
      },
      {
        ...validInput,
        data: cloneRecord(commandEnvelope, {
          command: copyWithCustomPrototype({
            type: "game-pause",
            paused: true,
          }),
        }),
      },
    ];

    for (const invalidInput of invalidInputs) {
      expect(
        setup.child.consumeRuntimeCommand(
          setup.childOwner.event(invalidInput)
        )
      ).toBeNull();
    }

    expect(
      setup.child.consumeRuntimeCommand(setup.childOwner.event(validInput))
    ).toEqual(pause);
    expect(
      setup.child.consumeRuntimeCommand(setup.childOwner.event(validInput))
    ).toBeNull();

    const focus: RuntimeCommand = { type: "game-focus" };
    setup.parent.postRuntimeCommand(focus);
    expect(
      setup.child.consumeRuntimeCommand(
        setup.childOwner.event({
          data: setup.childTarget.posts[2]?.message,
          source: setup.parentTarget,
          origin: setup.parentOrigin,
        })
      )
    ).toEqual(focus);
  });

  it("requires the exact artifact acknowledgement before commands", async () => {
    const setup = await createProtocolHarness({ acknowledge: false });
    const acknowledgement = setup.parentTarget.posts[0]?.message;
    const validInput: FakeMessageInput = {
      data: acknowledgement,
      source: setup.childTarget,
      origin: "null",
    };

    expect(() =>
      setup.parent.postRuntimeCommand({ type: "game-focus" })
    ).toThrow("require bootstrap acknowledgement");
    for (const invalidInput of [
      {
        ...validInput,
        data: cloneRecord(acknowledgement, { artifactId: "foreign_artifact" }),
      },
      {
        ...validInput,
        data: cloneRecord(acknowledgement, { nonce: "foreign_nonce" }),
      },
      {
        ...validInput,
        data: cloneRecord(acknowledgement, { injected: true }),
      },
      { ...validInput, data: copyWithCustomPrototype(acknowledgement) },
      { ...validInput, source: new FakeMessageWindow() },
      { ...validInput, origin: "https://creator.sparkline.test" },
      { ...validInput, isTrusted: false },
      { ...validInput, currentTarget: new FakeMessageWindow() },
      { ...validInput, ports: [fakeMessagePort] },
    ]) {
      expect(
        setup.parent.consumeIframeMessage(setup.parentOwner.event(invalidInput))
      ).toBeNull();
      expect(setup.parent.isAcknowledged()).toBe(false);
    }

    expect(
      setup.parent.consumeIframeMessage(setup.parentOwner.event(validInput))
    ).toBeNull();
    expect(setup.parent.isAcknowledged()).toBe(true);
  });

  it("admits only exact next runtime event candidates from the pinned iframe", async () => {
    const setup = await createProtocolHarness();
    const candidate = { type: "game-ready", evidence: "first" };
    setup.child.postRuntimeEvent(candidate);
    const eventEnvelope = setup.parentTarget.posts[1]?.message;
    const validInput: FakeMessageInput = {
      data: eventEnvelope,
      source: setup.childTarget,
      origin: "null",
    };
    const invalidInputs: FakeMessageInput[] = [
      { ...validInput, isTrusted: false },
      { ...validInput, currentTarget: new FakeMessageWindow() },
      { ...validInput, source: new FakeMessageWindow() },
      { ...validInput, origin: "https://creator.sparkline.test" },
      { ...validInput, ports: [fakeMessagePort] },
      {
        ...validInput,
        data: cloneRecord(eventEnvelope, {
          protocolVersion: "generated_mechanic_phaser_host/v0",
        }),
      },
      {
        ...validInput,
        data: cloneRecord(eventEnvelope, { nonce: "foreign_nonce" }),
      },
      {
        ...validInput,
        data: cloneRecord(eventEnvelope, { sessionId: "foreign_session" }),
      },
      { ...validInput, data: cloneRecord(eventEnvelope, { sequence: 0 }) },
      { ...validInput, data: cloneRecord(eventEnvelope, { sequence: 2 }) },
      { ...validInput, data: cloneRecord(eventEnvelope, { injected: true }) },
      { ...validInput, data: copyWithCustomPrototype(eventEnvelope) },
    ];

    for (const invalidInput of invalidInputs) {
      expect(
        setup.parent.consumeIframeMessage(
          setup.parentOwner.event(invalidInput)
        )
      ).toBeNull();
    }

    expect(
      setup.parent.consumeIframeMessage(setup.parentOwner.event(validInput))
    ).toBe(candidate);
    expect(
      setup.parent.consumeIframeMessage(setup.parentOwner.event(validInput))
    ).toBeNull();

    const secondCandidate = { type: "game-resized", evidence: "second" };
    setup.child.postRuntimeEvent(secondCandidate);
    expect(
      setup.parent.consumeIframeMessage(
        setup.parentOwner.event({
          data: setup.parentTarget.posts[2]?.message,
          source: setup.childTarget,
          origin: "null",
        })
      )
    ).toBe(secondCandidate);
  });

  it("validates private identity and keeps bootstrap single-use", () => {
    const setup = createBootstrapSetup({ sendBootstrap: false });
    const input = setup.parentInput;

    expect(() =>
      createGeneratedMechanicPhaserParentSession({ ...input, nonce: " " })
    ).toThrow("distinct non-empty private session and nonce");
    expect(() =>
      createGeneratedMechanicPhaserParentSession({
        ...input,
        nonce: input.sessionId,
      })
    ).toThrow("distinct non-empty private session and nonce");

    setup.parent.sendBootstrap();
    expect(() => setup.parent.sendBootstrap()).toThrow("single-use");
  });
});

type FakeMessageInput = Parameters<FakeMessageWindow["event"]>[0];

const fakeMessagePort = Object.freeze({}) as MessagePort;

function createBootstrapSetup({ sendBootstrap = true } = {}) {
  const fixture = createGeneratedMechanicProjectFixture();
  const template = createTopDownPhaserTemplate(
    fixture.dependency.finalGameSpec.gameSpec
  );
  const parentOwner = new FakeMessageWindow();
  const parentTarget = new FakeMessageWindow();
  const childOwner = new FakeMessageWindow();
  const childTarget = new FakeMessageWindow();
  const parentInput = {
    iframeWindow: childTarget,
    nonce: "private_nonce",
    ownerWindow: parentOwner,
    project: {
      artifact: fixture.artifact,
      dependency: fixture.dependency,
    },
    sessionId: "private_session",
    template,
  };
  const parent = createGeneratedMechanicPhaserParentSession(parentInput);
  if (sendBootstrap) {
    parent.sendBootstrap();
  }

  return {
    bootstrap: childTarget.posts[0]?.message,
    childOwner,
    childTarget,
    parent,
    parentInput,
    parentOwner,
    parentTarget,
  };
}

async function createProtocolHarness({ acknowledge = true } = {}) {
  const setup = createBootstrapSetup({ sendBootstrap: false });
  const parentOrigin = "https://creator.sparkline.test";
  const childPromise = waitForGeneratedMechanicPhaserChildSession({
    deadlineMilliseconds: 100,
    expectedParent: setup.parentTarget,
    ownerWindow: setup.childOwner,
  });

  setup.parent.sendBootstrap();
  setup.childOwner.emit({
    data: setup.childTarget.posts[0]?.message,
    source: setup.parentTarget,
    origin: parentOrigin,
  });
  const child = await childPromise;
  if (acknowledge) {
    setup.parent.consumeIframeMessage(
      setup.parentOwner.event({
        data: setup.parentTarget.posts[0]?.message,
        source: setup.childTarget,
        origin: "null",
      })
    );
  }

  return { ...setup, child, parentOrigin };
}

function cloneRecord(
  value: unknown,
  replacements: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return { ...requireRecord(value), ...replacements };
}

function copyWithCustomPrototype(value: unknown): Record<string, unknown> {
  const copy = Object.create({ injected: true }) as Record<string, unknown>;
  Object.defineProperties(copy, Object.getOwnPropertyDescriptors(requireRecord(value)));
  return copy;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a record test fixture.");
  }
  return value as Record<string, unknown>;
}

class FakeProtocolTimers implements GeneratedMechanicPhaserProtocolTimers {
  readonly timeoutId = Object.freeze({ id: "bootstrap-timeout" });
  readonly clearedIds: unknown[] = [];
  private callback: (() => void) | undefined;

  setTimeout(callback: () => void): unknown {
    this.callback = callback;
    return this.timeoutId;
  }

  clearTimeout(timeoutId: unknown): void {
    this.clearedIds.push(timeoutId);
  }

  fire(): void {
    this.callback?.();
  }
}

class FakeMessageWindow implements GeneratedMechanicPhaserMessageWindow {
  readonly posts: Array<{
    message: unknown;
    targetOrigin: string;
    transfer: readonly Transferable[];
  }> = [];
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

  get listenerCount(): number {
    return this.listeners.size;
  }

  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  postMessage(
    message: unknown,
    targetOrigin: string,
    transfer: Transferable[] = []
  ): void {
    this.posts.push({ message, targetOrigin, transfer: [...transfer] });
  }

  event({
    data,
    source,
    origin,
    isTrusted = true,
    currentTarget = this,
    ports = [],
  }: {
    data: unknown;
    source: MessageEventSource | null;
    origin: string;
    isTrusted?: boolean;
    currentTarget?: unknown;
    ports?: MessagePort[];
  }): MessageEvent<unknown> {
    return {
      data,
      source,
      origin,
      isTrusted,
      currentTarget,
      ports,
    } as unknown as MessageEvent<unknown>;
  }

  emit(input: Parameters<FakeMessageWindow["event"]>[0]): void {
    const event = this.event(input);
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}
