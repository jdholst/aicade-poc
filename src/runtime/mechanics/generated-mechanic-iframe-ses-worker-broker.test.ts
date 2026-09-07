import { afterEach, describe, expect, it, vi } from "vitest";

import type { SesWorkerMechanicExecutionRealmController } from "./ses-worker-mechanic-execution-realm";
import {
  GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
  type GeneratedMechanicIframeControllerBootstrap,
} from "./generated-mechanic-iframe-controller-protocol";
import {
  createGeneratedMechanicIframeSesWorkerBroker,
  prepareGeneratedMechanicIframeSesWorkerBrokerIframe,
} from "./generated-mechanic-iframe-ses-worker-broker";
import {
  waitForGeneratedMechanicIframeSesWorkerController,
  type GeneratedMechanicIframeControllerWindow,
} from "./generated-mechanic-iframe-ses-worker-controller";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("generated mechanic iframe SES Worker broker", () => {
  it("brokers one controller channel and one iframe-created capability port into the parent Worker", async () => {
    const harness = await createConnectedHarness();
    const received: MessageEvent<unknown>[] = [];
    harness.proxy.addEventListener("message", (event) => received.push(event));

    harness.proxy.postMessage({ kind: "controller_ready_probe" });
    expect(harness.worker.posts).toEqual([
      { message: { kind: "controller_ready_probe" }, transfer: [] },
    ]);

    const capabilityChannel = new FakeMessageChannel();
    const initialization = {
      kind: "sparkline_mechanic_realm_initialize",
      capabilityPort: capabilityChannel.port2,
    };
    harness.proxy.postMessage(initialization, [
      capabilityChannel.port2 as unknown as Transferable,
    ]);

    expect(harness.worker.posts[1]).toEqual({
      message: initialization,
      transfer: [capabilityChannel.port2],
    });
    expect(harness.worker.posts[1]?.transfer).not.toContain(
      capabilityChannel.port1
    );
    expect(capabilityChannel.port1.closeCalls).toBe(0);

    harness.worker.emit({ kind: "sparkline_mechanic_realm_initialized" });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      data: { kind: "sparkline_mechanic_realm_initialized" },
      isTrusted: true,
      currentTarget: harness.proxy,
    });

    harness.proxy.terminate();
    await expect(harness.broker.closed).resolves.toMatchObject({
      reason: "remote_terminate",
    });
    expect(harness.worker.terminateCalls).toBe(1);
    expect(harness.parentControllerPort.closeCalls).toBe(1);
    expect(harness.childControllerPort.closeCalls).toBe(1);

    harness.proxy.terminate();
    harness.broker.dispose();
    expect(harness.worker.terminateCalls).toBe(1);
    expect(harness.parentControllerPort.closeCalls).toBe(1);
    expect(harness.childControllerPort.closeCalls).toBe(1);
  });

  it.each([
    ["wrong version", { protocolVersion: "wrong/v1" }],
    ["wrong nonce", { nonce: "wrong_nonce" }],
    ["skipped sequence", { sequence: 2 }],
    ["replayed acknowledgement", { sequence: 0 }],
  ])("fails closed for %s", async (_label, override) => {
    const harness = await createConnectedHarness();

    harness.childControllerPort.postMessage({
      kind: "sparkline_generated_mechanic_controller_request",
      protocolVersion:
        GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
      sessionId: "session_nonce",
      nonce: "bootstrap_nonce",
      sequence: 1,
      message: { kind: "controller_ready_probe" },
      ...override,
    });

    await expect(harness.broker.closed).resolves.toMatchObject({
      reason: "protocol_error",
    });
    expect(harness.worker.posts).toHaveLength(0);
    expect(harness.worker.terminateCalls).toBe(1);
    expect(harness.parentControllerPort.closeCalls).toBe(1);
  });

  it("rejects a second nested capability transfer and closes only the rejected port", async () => {
    const harness = await createConnectedHarness();
    const firstChannel = new FakeMessageChannel();
    const firstInitialization = {
      kind: "sparkline_mechanic_realm_initialize",
      capabilityPort: firstChannel.port2,
    };
    harness.proxy.postMessage(firstInitialization, [
      firstChannel.port2 as unknown as Transferable,
    ]);

    const secondChannel = new FakeMessageChannel();
    harness.childControllerPort.postMessage(
      {
        kind: "sparkline_generated_mechanic_controller_request",
        protocolVersion:
          GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
        sessionId: "session_nonce",
        nonce: "bootstrap_nonce",
        sequence: 2,
        message: {
          kind: "sparkline_mechanic_realm_initialize",
          capabilityPort: secondChannel.port2,
        },
      },
      [secondChannel.port2 as unknown as Transferable]
    );

    await expect(harness.broker.closed).resolves.toMatchObject({
      reason: "protocol_error",
    });
    expect(harness.worker.posts).toHaveLength(1);
    expect(firstChannel.port1.closeCalls).toBe(0);
    expect(secondChannel.port2.closeCalls).toBe(1);
    expect(secondChannel.port1.closeCalls).toBe(0);
  });

  it("rejects a transferred port that is not the initialization capabilityPort", async () => {
    const harness = await createConnectedHarness();
    const embeddedChannel = new FakeMessageChannel();
    const transferredChannel = new FakeMessageChannel();

    harness.childControllerPort.postMessage(
      {
        kind: "sparkline_generated_mechanic_controller_request",
        protocolVersion:
          GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
        sessionId: "session_nonce",
        nonce: "bootstrap_nonce",
        sequence: 1,
        message: {
          kind: "sparkline_mechanic_realm_initialize",
          capabilityPort: embeddedChannel.port2,
        },
      },
      [transferredChannel.port2 as unknown as Transferable]
    );

    await expect(harness.broker.closed).resolves.toMatchObject({
      reason: "protocol_error",
    });
    expect(harness.worker.posts).toHaveLength(0);
    expect(transferredChannel.port2.closeCalls).toBe(1);
    expect(embeddedChannel.port1.closeCalls).toBe(0);
  });

  it("fails closed when a Worker response is untrusted or targets another object", async () => {
    const untrusted = await createConnectedHarness();
    untrusted.worker.emit({ kind: "controller_ready" }, false);
    await expect(untrusted.broker.closed).resolves.toMatchObject({
      reason: "protocol_error",
    });
    expect(untrusted.worker.terminateCalls).toBe(1);

    const wrongTarget = await createConnectedHarness();
    wrongTarget.worker.emit(
      { kind: "controller_ready" },
      true,
      Object.freeze({})
    );
    await expect(wrongTarget.broker.closed).resolves.toMatchObject({
      reason: "protocol_error",
    });
    expect(wrongTarget.worker.terminateCalls).toBe(1);
  });

  it("rejects iframe sandbox drift and tears down the parent Worker exactly once", async () => {
    const harness = await createConnectedHarness();

    harness.iframe.setAttribute("sandbox", "allow-scripts allow-popups");
    await Promise.resolve();
    await expect(harness.broker.closed).resolves.toMatchObject({
      reason: "protocol_error",
    });
    expect(harness.worker.terminateCalls).toBe(1);
    expect(harness.parentControllerPort.closeCalls).toBe(1);

    harness.broker.dispose();
    expect(harness.worker.terminateCalls).toBe(1);
    expect(harness.parentControllerPort.closeCalls).toBe(1);
  });

  it("closes only the still-local controller endpoint when disposed after bootstrap transfer", async () => {
    const iframe = document.createElement("iframe");
    prepareGeneratedMechanicIframeSesWorkerBrokerIframe(iframe);
    document.body.append(iframe);
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      throw new Error("JSDOM did not create an iframe window.");
    }
    vi.spyOn(iframeWindow, "postMessage").mockImplementation(() => undefined);
    const controllerChannel = new FakeMessageChannel();
    const createController = vi.fn(() => new FakeSesWorkerController());
    const nonces = ["session_nonce", "bootstrap_nonce"];
    const broker = createGeneratedMechanicIframeSesWorkerBroker({
      iframe,
      createController,
      createMessageChannel: () =>
        controllerChannel as unknown as MessageChannel,
      createNonce: () => nonces.shift() ?? "unexpected_nonce",
      acknowledgementDeadlineMilliseconds: 100,
    });

    broker.dispose();

    await expect(broker.ready).rejects.toThrow("disposed");
    await expect(broker.closed).resolves.toMatchObject({ reason: "disposed" });
    expect(createController).not.toHaveBeenCalled();
    expect(controllerChannel.port1.closeCalls).toBe(1);
    expect(controllerChannel.port2.closeCalls).toBe(0);
  });
});

describe("generated mechanic iframe SES Worker controller proxy", () => {
  it("accepts one trusted bootstrap and preserves the SES adapter event shape", async () => {
    const ownerWindow = new FakeControllerWindow();
    const expectedParent = Object.freeze({}) as WindowProxy;
    const channel = new FakeMessageChannel();
    const controllerPromise = waitForGeneratedMechanicIframeSesWorkerController({
      ownerWindow,
      expectedParent,
      deadlineMilliseconds: 100,
    });

    ownerWindow.emit({
      data: bootstrap(),
      ports: [channel.port2 as unknown as MessagePort],
      source: expectedParent,
      isTrusted: true,
      currentTarget: ownerWindow,
    });
    const controller = await controllerPromise;
    const messages: MessageEvent<unknown>[] = [];
    controller.addEventListener("message", (event) => messages.push(event));

    channel.port1.postMessage({
      kind: "sparkline_generated_mechanic_controller_response",
      protocolVersion:
        GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
      sessionId: "session_nonce",
      nonce: "bootstrap_nonce",
      sequence: 1,
      message: { kind: "worker_response" },
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      data: { kind: "worker_response" },
      isTrusted: true,
      currentTarget: controller,
      target: controller,
    });
    expect(channel.port1.received[0]?.message).toMatchObject({
      kind: "sparkline_generated_mechanic_controller_acknowledgement",
      sequence: 0,
    });
  });

  it.each([
    ["untrusted", { isTrusted: false }],
    ["wrong currentTarget", { currentTarget: Object.freeze({}) }],
    [
      "wrong source",
      { source: Object.freeze({}) as unknown as MessageEventSource },
    ],
    ["wrong sequence", { data: bootstrap({ sequence: 1 }) }],
    ["wrong version", { data: bootstrap({ protocolVersion: "wrong/v1" }) }],
  ])("rejects a %s bootstrap", async (_label, override) => {
    const ownerWindow = new FakeControllerWindow();
    const expectedParent = Object.freeze({}) as WindowProxy;
    const channel = new FakeMessageChannel();
    const controllerPromise = waitForGeneratedMechanicIframeSesWorkerController({
      ownerWindow,
      expectedParent,
      deadlineMilliseconds: 100,
    });

    ownerWindow.emit({
      data: bootstrap(),
      ports: [channel.port2 as unknown as MessagePort],
      source: expectedParent,
      isTrusted: true,
      currentTarget: ownerWindow,
      ...override,
    });

    await expect(controllerPromise).rejects.toThrow("bootstrap");
    expect(channel.port2.closeCalls).toBe(1);
  });

  it("allows only one correctly embedded capability port transfer", async () => {
    const { proxy } = await createConnectedHarness();
    const first = new FakeMessageChannel();
    const second = new FakeMessageChannel();

    expect(() =>
      proxy.postMessage(
        {
          kind: "sparkline_mechanic_realm_initialize",
          capabilityPort: first.port2,
        },
        []
      )
    ).toThrow("exactly one capability port");
    expect(() =>
      proxy.postMessage(
        {
          kind: "sparkline_mechanic_realm_initialize",
          capabilityPort: first.port2,
        },
        [second.port2 as unknown as Transferable]
      )
    ).toThrow("embedded capabilityPort");

    proxy.postMessage(
      {
        kind: "sparkline_mechanic_realm_initialize",
        capabilityPort: first.port2,
      },
      [first.port2 as unknown as Transferable]
    );
    expect(() =>
      proxy.postMessage(
        {
          kind: "sparkline_mechanic_realm_initialize",
          capabilityPort: second.port2,
        },
        [second.port2 as unknown as Transferable]
      )
    ).toThrow("already been transferred");
    expect(first.port1.closeCalls).toBe(0);
    expect(second.port1.closeCalls).toBe(0);
  });

  it("closes an unexpected inbound port before terminating the controller proxy", async () => {
    const harness = await createConnectedHarness();
    const unexpected = new FakeMessageChannel();

    harness.parentControllerPort.postMessage(
      {
        kind: "sparkline_generated_mechanic_controller_response",
        protocolVersion:
          GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
        sessionId: "session_nonce",
        nonce: "bootstrap_nonce",
        sequence: 1,
        message: { kind: "worker_response" },
      },
      [unexpected.port2 as unknown as Transferable]
    );

    await expect(harness.broker.closed).resolves.toMatchObject({
      reason: "remote_terminate",
    });
    expect(unexpected.port2.closeCalls).toBe(1);
    expect(unexpected.port1.closeCalls).toBe(0);
    expect(harness.worker.terminateCalls).toBe(1);
  });
});

async function createConnectedHarness(): Promise<{
  iframe: HTMLIFrameElement;
  broker: ReturnType<typeof createGeneratedMechanicIframeSesWorkerBroker>;
  proxy: Awaited<
    ReturnType<typeof waitForGeneratedMechanicIframeSesWorkerController>
  >;
  worker: FakeSesWorkerController;
  parentControllerPort: FakeMessagePort;
  childControllerPort: FakeMessagePort;
}> {
  const iframe = document.createElement("iframe");
  prepareGeneratedMechanicIframeSesWorkerBrokerIframe(iframe);
  document.body.append(iframe);
  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    throw new Error("JSDOM did not create an iframe window.");
  }
  const controllerChannel = new FakeMessageChannel();
  const childWindow = new FakeControllerWindow();
  const controllerPromise = waitForGeneratedMechanicIframeSesWorkerController({
    ownerWindow: childWindow,
    expectedParent: window,
    deadlineMilliseconds: 100,
  });
  vi.spyOn(iframeWindow, "postMessage").mockImplementation(
    ((message: unknown, _targetOrigin: string, transfer?: Transferable[]) => {
      childWindow.emit({
        data: message,
        ports: (transfer ?? []) as MessagePort[],
        source: window,
        isTrusted: true,
        currentTarget: childWindow,
      });
    }) as typeof iframeWindow.postMessage
  );
  const worker = new FakeSesWorkerController();
  const nonces = ["session_nonce", "bootstrap_nonce"];
  const broker = createGeneratedMechanicIframeSesWorkerBroker({
    iframe,
    createController: () => worker,
    createMessageChannel: () =>
      controllerChannel as unknown as MessageChannel,
    createNonce: () => nonces.shift() ?? "unexpected_nonce",
    acknowledgementDeadlineMilliseconds: 100,
  });
  const proxy = await controllerPromise;
  await broker.ready;
  return {
    iframe,
    broker,
    proxy,
    worker,
    parentControllerPort: controllerChannel.port1,
    childControllerPort: controllerChannel.port2,
  };
}

function bootstrap(
  override: Readonly<Record<string, unknown>> = {}
): GeneratedMechanicIframeControllerBootstrap {
  return {
    kind: "sparkline_generated_mechanic_controller_bootstrap",
    protocolVersion:
      GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION,
    sessionId: "session_nonce",
    nonce: "bootstrap_nonce",
    sequence: 0,
    ...override,
  } as unknown as GeneratedMechanicIframeControllerBootstrap;
}

class FakeMessageChannel {
  readonly port1 = new FakeMessagePort();
  readonly port2 = new FakeMessagePort();

  constructor() {
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
  }
}

class FakeMessagePort {
  peer?: FakeMessagePort;
  closeCalls = 0;
  startCalls = 0;
  readonly received: Array<{
    message: unknown;
    transfer: readonly Transferable[];
  }> = [];
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

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

  postMessage(message: unknown, transfer: Transferable[] = []): void {
    if (!this.peer) {
      throw new Error("Fake MessagePort has no peer.");
    }
    this.peer.received.push({ message, transfer: [...transfer] });
    this.peer.emit(message, transfer);
  }

  start(): void {
    this.startCalls += 1;
  }

  close(): void {
    this.closeCalls += 1;
  }

  private emit(message: unknown, ports: readonly Transferable[]): void {
    const event = {
      data: message,
      isTrusted: true,
      currentTarget: this,
      target: this,
      ports,
      type: "message",
    } as unknown as MessageEvent<unknown>;
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

class FakeSesWorkerController
  implements SesWorkerMechanicExecutionRealmController
{
  terminateCalls = 0;
  readonly posts: Array<{
    message: unknown;
    transfer: readonly Transferable[];
  }> = [];
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

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

  postMessage(message: unknown, transfer: Transferable[] = []): void {
    this.posts.push({ message, transfer: [...transfer] });
  }

  terminate(): void {
    this.terminateCalls += 1;
  }

  emit(message: unknown, isTrusted = true, currentTarget: object = this): void {
    const event = {
      data: message,
      isTrusted,
      currentTarget,
      target: currentTarget,
      ports: [],
      type: "message",
    } as unknown as MessageEvent<unknown>;
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}

class FakeControllerWindow implements GeneratedMechanicIframeControllerWindow {
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

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

  emit(event: {
    data: unknown;
    ports: MessagePort[];
    source: MessageEventSource | null;
    isTrusted: boolean;
    currentTarget: unknown;
  }): void {
    for (const listener of [...this.listeners]) {
      listener(event as unknown as MessageEvent<unknown>);
    }
  }
}
