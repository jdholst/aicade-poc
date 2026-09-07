import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SANDBOX_BOOT_TIMEOUT_MS } from "@/constants";
import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import { projectAcceptedGeneratedMechanicRuntimeCandidate } from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import type { GeneratedMechanicPhaserParentSession } from "@/runtime/phaser/generated-mechanic-phaser-host-protocol";
import { createGeneratedMechanicPhaserRuntimeController } from "@/runtime/phaser/generated-mechanic-phaser-runtime-controller";
import { createTopDownPhaserTemplate } from "@/runtime/phaser/top-down-template";

const brokerMocks = vi.hoisted(() => ({
  create: vi.fn(),
  connectedAtPrepare: [] as boolean[],
  disposePreparation: vi.fn(),
  prepare: vi.fn(),
}));
const protocolMocks = vi.hoisted(() => ({
  createParentSession: vi.fn(),
}));

vi.mock("@/runtime/mechanics/generated-mechanic-iframe-ses-worker-broker", () => ({
  createGeneratedMechanicIframeSesWorkerBroker: brokerMocks.create,
  disposeGeneratedMechanicIframeSesWorkerBrokerPreparation:
    brokerMocks.disposePreparation,
  prepareGeneratedMechanicIframeSesWorkerBrokerIframe: brokerMocks.prepare,
}));

vi.mock("@/runtime/phaser/generated-mechanic-phaser-host-protocol", () => ({
  createGeneratedMechanicPhaserParentSession:
    protocolMocks.createParentSession,
}));

import {
  GeneratedMechanicPhaserRuntimeHost,
  type GeneratedMechanicPhaserRuntimeHostProps,
} from "./generated-mechanic-phaser-runtime-host";
import type { RuntimeIframeHostHandle } from "./runtime-iframe-host";

const fixture = createGeneratedMechanicProjectFixture();
const template = createTopDownPhaserTemplate(
  fixture.dependency.finalGameSpec.gameSpec
);
const project = {
  artifact: fixture.artifact,
  dependency: fixture.dependency,
};

describe("GeneratedMechanicPhaserRuntimeHost", () => {
  let broker: ReturnType<typeof createBrokerDouble>;
  let session: ReturnType<typeof createSessionDouble>;
  let windowMessageListener: (event: MessageEvent<unknown>) => void;
  let nativeWindowAddEventListener: typeof window.addEventListener;

  beforeEach(() => {
    vi.clearAllMocks();
    brokerMocks.connectedAtPrepare.length = 0;
    brokerMocks.prepare.mockImplementation((iframe: HTMLIFrameElement) => {
      brokerMocks.connectedAtPrepare.push(iframe.isConnected);
      iframe.setAttribute("sandbox", "allow-scripts");
      return iframe;
    });
    broker = createBrokerDouble();
    session = createSessionDouble();
    brokerMocks.create.mockReturnValue(broker);
    protocolMocks.createParentSession.mockReturnValue(session.value);
    nativeWindowAddEventListener = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation(
      ((type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => {
        if (type === "message" && typeof listener === "function") {
          windowMessageListener = listener as (
            event: MessageEvent<unknown>
          ) => void;
        }
        nativeWindowAddEventListener(
          type,
          listener,
          options as boolean | AddEventListenerOptions | undefined
        );
      }) as typeof window.addEventListener
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("prepares a detached trusted-route iframe before append and bootstraps only out of band", async () => {
    const statuses: unknown[] = [];

    renderHost({
      onStatusChange: (status) => statuses.push(status),
    });

    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    expect(brokerMocks.prepare).toHaveBeenCalledTimes(1);
    const preparedIframe = brokerMocks.prepare.mock.calls[0]?.[0];
    expect(preparedIframe).toBe(iframe);
    expect(brokerMocks.connectedAtPrepare).toEqual([false]);
    expect(iframe).toHaveAttribute("src", "/runtime/phaser-generated");
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    expect(iframe).not.toHaveAttribute("srcdoc");
    expect(iframe.outerHTML).not.toContain(fixture.dependency.sourceArtifact.id);
    expect(statuses).toEqual([{ state: "loading" }]);

    fireEvent.load(iframe);

    expect(brokerMocks.create).toHaveBeenCalledWith({ iframe });
    expect(protocolMocks.createParentSession).toHaveBeenCalledWith(
      expect.objectContaining({
        iframeWindow: iframe.contentWindow,
        ownerWindow: window,
        project,
        template,
        nonce: expect.any(String),
        sessionId: expect.any(String),
      })
    );
    const identity = protocolMocks.createParentSession.mock.calls[0]?.[0];
    expect(identity.sessionId).not.toBe(identity.nonce);
    expect(session.sendBootstrap).toHaveBeenCalledTimes(1);
    expect(iframe.getAttribute("src")).toBe("/runtime/phaser-generated");
    expect(iframe).not.toHaveAttribute("srcdoc");
  });

  it("releases an unclaimed broker preparation when unmounted before load", () => {
    const rendered = renderHost();
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);

    rendered.unmount();

    expect(brokerMocks.create).not.toHaveBeenCalled();
    expect(brokerMocks.disposePreparation).toHaveBeenCalledOnce();
    expect(brokerMocks.disposePreparation).toHaveBeenCalledWith(iframe);
  });

  it("tears down when a loading or error status callback throws", async () => {
    const loading = renderHost({
      onStatusChange: () => {
        throw new Error("loading observer failed");
      },
    });
    expect(screen.queryByTitle(template.title)).not.toBeInTheDocument();
    expect(brokerMocks.disposePreparation).toHaveBeenCalledOnce();
    loading.unmount();

    brokerMocks.disposePreparation.mockClear();
    const onStatusChange = vi.fn((status: { state: string }) => {
      if (status.state === "error") {
        throw new Error("error observer failed");
      }
    });
    renderHost({ onStatusChange });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    fireEvent.load(iframe);
    iframe.setAttribute("src", "/runtime/foreign");

    await waitFor(() => expect(broker.dispose).toHaveBeenCalledOnce());
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(screen.queryByTitle(template.title)).not.toBeInTheDocument();
  });

  it("validates the captured frame before focusing it", () => {
    const hostRef = createRef<RuntimeIframeHostHandle>();
    renderHost({}, hostRef);
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    const focus = vi.spyOn(iframe, "focus").mockImplementation(() => undefined);
    fireEvent.load(iframe);

    iframe.setAttribute("src", "/runtime/foreign");
    act(() => hostRef.current?.focusGame());

    expect(focus).not.toHaveBeenCalled();
    expect(broker.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("rejects srcdoc substitution before the first trusted-route load", async () => {
    const statuses: unknown[] = [];
    renderHost({ onStatusChange: (status) => statuses.push(status) });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);

    iframe.setAttribute("srcdoc", "<main>foreign runtime</main>");
    fireEvent.load(iframe);

    await waitFor(() => {
      expect(statuses.at(-1)).toMatchObject({ state: "error" });
    });
    expect(brokerMocks.create).not.toHaveBeenCalled();
    expect(protocolMocks.createParentSession).not.toHaveBeenCalled();
    expect(screen.queryByTitle(template.title)).not.toBeInTheDocument();
  });

  it("rejects a security-attribute mutation even when restored before observation", async () => {
    const statuses: unknown[] = [];
    renderHost({ onStatusChange: (status) => statuses.push(status) });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);

    iframe.setAttribute("srcdoc", "<main>foreign runtime</main>");
    iframe.removeAttribute("srcdoc");

    await waitFor(() => {
      expect(statuses.at(-1)).toMatchObject({ state: "error" });
    });
    expect(brokerMocks.create).not.toHaveBeenCalled();
    expect(protocolMocks.createParentSession).not.toHaveBeenCalled();
  });

  it("waits for exact acknowledgement before nonce-bound pause, focus, first-playable, and ready", async () => {
    const statuses: unknown[] = [];
    const hostRef = createRef<RuntimeIframeHostHandle>();
    const { rerender } = renderHost(
      {
        isPaused: true,
        onStatusChange: (status) => statuses.push(status),
        runFirstPlayableChecksOnReady: true,
      },
      hostRef
    );
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    vi.spyOn(iframe.contentWindow as Window, "focus").mockImplementation(
      () => undefined
    );
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });

    dispatchHostMessage(iframe, { kind: "runtime", event: { type: "game-ready" } });
    expect(statuses).toEqual([{ state: "loading" }]);
    expect(session.postRuntimeCommand).not.toHaveBeenCalled();

    dispatchHostMessage(iframe, { kind: "ack" });
    expect(session.postRuntimeCommand).not.toHaveBeenCalled();

    dispatchHostMessage(iframe, { kind: "runtime", event: { type: "game-ready" } });
    expect(statuses.at(-1)).toEqual({ state: "ready" });
    expect(session.postRuntimeCommand).toHaveBeenNthCalledWith(1, {
      type: "game-pause",
      paused: true,
    });
    expect(session.postRuntimeCommand).toHaveBeenCalledWith({
      type: "game-run-first-playable-checks",
      actionId: "move",
    });

    act(() => hostRef.current?.focusGame());
    expect(session.postRuntimeCommand).toHaveBeenCalledWith({
      type: "game-focus",
    });

    rerender(
      <GeneratedMechanicPhaserRuntimeHost
        ref={hostRef}
        template={template}
        generatedMechanicProject={project}
        isPaused={false}
        onStatusChange={(status) => statuses.push(status)}
        runFirstPlayableChecksOnReady
      />
    );
    expect(session.postRuntimeCommand).toHaveBeenCalledWith({
      type: "game-pause",
      paused: false,
    });
  });

  it("exposes the extracted imperative lifecycle and a correlated first-playable result", async () => {
    const statuses: unknown[] = [];
    const initialEvidence: unknown[] = [];
    const updatedEvidence: unknown[] = [];
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createGeneratedMechanicPhaserRuntimeController({
      mount,
      template,
      generatedMechanicProject: project,
      options: {
        isPaused: false,
        onStatusChange: (status) => statuses.push(status),
        onValidationEvidence: (evidence) => initialEvidence.push(evidence),
      },
    });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    const iframeFocus = vi
      .spyOn(iframe, "focus")
      .mockImplementation(() => undefined);
    vi.spyOn(iframe.contentWindow as Window, "focus").mockImplementation(
      () => undefined
    );
    const firstPlayable = controller.runFirstPlayableChecks();

    controller.setPaused(true);
    controller.updateOptions({
      onValidationEvidence: (evidence) => updatedEvidence.push(evidence),
    });
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });

    expect(session.postRuntimeCommand).toHaveBeenNthCalledWith(1, {
      type: "game-pause",
      paused: true,
    });
    expect(session.postRuntimeCommand).toHaveBeenNthCalledWith(2, {
      type: "game-run-first-playable-checks",
      actionId: "move",
    });
    controller.focusGame();
    expect(iframeFocus).toHaveBeenCalledOnce();
    expect(session.postRuntimeCommand).toHaveBeenCalledWith({
      type: "game-focus",
    });

    const evidence = [
      {
        checkId: "nonblank_render",
        status: "passed",
        evidence: { renderedObjectCount: 3 },
      },
      {
        checkId: "player_visible",
        status: "passed",
        evidence: { playerVisible: true },
      },
      {
        checkId: "input_response",
        status: "passed",
        evidence: {
          inputObserved: true,
          generatedActionId: "move",
          generatedActionDispatched: true,
        },
      },
    ] as const;
    for (const item of evidence) {
      dispatchHostMessage(iframe, {
        kind: "runtime",
        event: {
          type: "game-validation-evidence",
          data: item,
        },
      });
    }

    await expect(firstPlayable).resolves.toEqual({
      status: "passed",
      evidence,
    });
    expect(initialEvidence).toEqual([]);
    expect(updatedEvidence).toEqual(evidence);
    expect(statuses).toEqual([{ state: "loading" }, { state: "ready" }]);

    controller.dispose();
    controller.dispose();
    expect(iframe).not.toBeInTheDocument();
    expect(broker.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("runs first-playable checks without a generated action for an autonomous mechanic", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const autonomousProject = {
      ...project,
      dependency: {
        ...project.dependency,
        contract: {
          ...project.dependency.contract,
          behavior: {
            ...project.dependency.contract.behavior,
            triggers: ["install"],
          },
          lifecycle: {
            ...project.dependency.contract.lifecycle,
            callbacks: ["install"],
          },
          scenarios: project.dependency.contract.scenarios.map((scenario) => ({
            ...scenario,
            steps: [],
          })),
        },
      },
    };
    const controller = createGeneratedMechanicPhaserRuntimeController({
      mount,
      template,
      generatedMechanicProject: autonomousProject,
    });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    const firstPlayable = controller.runFirstPlayableChecks();
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });

    expect(session.postRuntimeCommand).toHaveBeenCalledWith({
      type: "game-run-first-playable-checks",
    });
    const evidence = [
      {
        checkId: "nonblank_render",
        status: "passed",
        evidence: { renderedObjectCount: 3 },
      },
      {
        checkId: "player_visible",
        status: "passed",
        evidence: { playerVisible: true },
      },
      {
        checkId: "input_response",
        status: "passed",
        evidence: { inputObserved: true },
      },
    ] as const;
    for (const item of evidence) {
      dispatchHostMessage(iframe, {
        kind: "runtime",
        event: { type: "game-validation-evidence", data: item },
      });
    }

    await expect(firstPlayable).resolves.toEqual({
      status: "passed",
      evidence,
    });
    controller.dispose();
  });

  it("fails closed when an action-driven mechanic loses its exact action", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const invalidProject = {
      ...project,
      dependency: {
        ...project.dependency,
        contract: {
          ...project.dependency.contract,
          scenarios: project.dependency.contract.scenarios.map((scenario) => ({
            ...scenario,
            steps: [],
          })),
        },
      },
    };
    const controller = createGeneratedMechanicPhaserRuntimeController({
      mount,
      template,
      generatedMechanicProject: invalidProject,
    });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    const firstPlayable = controller.runFirstPlayableChecks();
    const rejected = expect(firstPlayable).rejects.toThrow(
      /did not retain one exact logical action/i
    );
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });

    await rejected;
    expect(session.postRuntimeCommand).not.toHaveBeenCalledWith({
      type: "game-run-first-playable-checks",
    });
  });

  it("rejects legacy input evidence that did not execute the generated action", async () => {
    const observedEvidence: unknown[] = [];
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createGeneratedMechanicPhaserRuntimeController({
      mount,
      template,
      generatedMechanicProject: project,
      options: {
        onValidationEvidence: (evidence) => observedEvidence.push(evidence),
      },
    });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    const firstPlayable = controller.runFirstPlayableChecks();
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });
    for (const item of [
      {
        checkId: "nonblank_render",
        status: "passed",
        evidence: { renderedObjectCount: 3 },
      },
      {
        checkId: "player_visible",
        status: "passed",
        evidence: { playerVisible: true },
      },
      {
        checkId: "input_response",
        status: "passed",
        evidence: { inputObserved: true },
      },
    ]) {
      dispatchHostMessage(iframe, {
        kind: "runtime",
        event: { type: "game-validation-evidence", data: item },
      });
    }

    await expect(firstPlayable).resolves.toMatchObject({
      status: "failed",
      evidence: [
        { checkId: "nonblank_render", status: "passed" },
        { checkId: "player_visible", status: "passed" },
        {
          checkId: "input_response",
          status: "failed",
          issues: [
            {
              code: "generated_action_probe_not_authenticated",
              path: "runtime.generatedMechanic.action",
            },
          ],
        },
      ],
    });
    expect(observedEvidence.at(-1)).toMatchObject({
      checkId: "input_response",
      status: "failed",
    });
    controller.dispose();
  });

  it("fails closed when an authenticated ready runtime omits first-playable evidence", async () => {
    vi.useFakeTimers();
    const statuses: unknown[] = [];
    const mount = document.createElement("div");
    document.body.append(mount);
    const controller = createGeneratedMechanicPhaserRuntimeController({
      mount,
      template,
      generatedMechanicProject: project,
      options: { onStatusChange: (status) => statuses.push(status) },
    });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    const firstPlayable = controller.runFirstPlayableChecks();
    const rejected = expect(firstPlayable).rejects.toThrow(
      /first-playable evidence before its deadline/i
    );

    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });
    act(() => vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS));

    await rejected;
    expect(statuses.at(-1)).toEqual({
      state: "error",
      message:
        "The generated mechanic runtime did not return first-playable evidence before its deadline.",
    });
    expect(iframe).not.toBeInTheDocument();
    expect(broker.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("forwards a pre-acceptance runtime candidate unchanged and rejects unfinished checks on disposal", async () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    const candidateProject = Object.freeze({
      runtimeCandidate: projectAcceptedGeneratedMechanicRuntimeCandidate(
        fixture.artifact
      ),
      dependency: fixture.dependency,
    });
    const controller = createGeneratedMechanicPhaserRuntimeController({
      mount,
      template,
      generatedMechanicProject: candidateProject,
    });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);

    fireEvent.load(iframe);
    expect(protocolMocks.createParentSession).toHaveBeenCalledWith(
      expect.objectContaining({ project: candidateProject })
    );

    const firstPlayable = controller.runFirstPlayableChecks();
    controller.dispose();
    await expect(firstPlayable).rejects.toThrow(
      /disposed before first-playable checks completed/i
    );
    expect(iframe).not.toBeInTheDocument();
    expect(broker.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("preserves warning and validation evidence semantics for authenticated envelopes", async () => {
    const statuses: unknown[] = [];
    const evidence: unknown[] = [];
    renderHost({
      onStatusChange: (status) => statuses.push(status),
      onValidationEvidence: (candidate) => evidence.push(candidate),
    });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });

    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: {
        type: "game-validation-evidence",
        data: {
          checkId: "nonblank_render",
          status: "passed",
          evidence: { renderedObjectCount: 3 },
        },
      },
    });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: {
        type: "game-error",
        issue: {
          type: "mechanic-disabled",
          severity: "warning",
          recoverable: true,
          mechanicId: fixture.artifact.mechanicId,
          mechanicType: fixture.artifact.mechanicType,
          phase: "install",
          message: "Generated mechanic was contained.",
        },
      },
    });

    expect(evidence).toEqual([
      {
        checkId: "nonblank_render",
        status: "passed",
        evidence: { renderedObjectCount: 3 },
      },
    ]);
    expect(statuses.at(-1)).toEqual({
      state: "warning",
      issue: expect.objectContaining({
        type: "mechanic-disabled",
        mechanicId: fixture.artifact.mechanicId,
      }),
    });
  });

  it("does not replace an authenticated mechanic failure with Worker-close noise", async () => {
    const statuses: unknown[] = [];
    renderHost({ onStatusChange: (status) => statuses.push(status) });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: {
        type: "game-error",
        message:
          'Mechanic private state "dash_ends_at" requires an integer value.',
        issue: {
          type: "runtime-error",
          severity: "error",
          recoverable: false,
          message:
            'Mechanic private state "dash_ends_at" requires an integer value.',
        },
      },
    });
    expect(statuses.at(-1)).toEqual({
      state: "error",
      message:
        'Mechanic private state "dash_ends_at" requires an integer value.',
    });
    expect(iframe).not.toBeInTheDocument();
    expect(broker.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("lets a queued authenticated runtime failure outrank a concurrent Worker close", async () => {
    vi.useFakeTimers();
    const statuses: unknown[] = [];
    renderHost({ onStatusChange: (status) => statuses.push(status) });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });

    broker.resolveClosed({
      reason: "remote_terminate",
      message: "The iframe controller terminated the parent SES Worker.",
    });
    await act(async () => {
      await Promise.resolve();
    });
    window.setTimeout(() => {
      dispatchHostMessage(iframe, {
        kind: "runtime",
        event: {
          type: "game-error",
          message: "Generated callback exceeded its execution budget.",
          issue: {
            type: "runtime-error",
            severity: "error",
            recoverable: false,
            message: "Generated callback exceeded its execution budget.",
          },
        },
      });
    }, 25);
    act(() => vi.runAllTimers());

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message: "Generated callback exceeded its execution budget.",
    });
    expect(iframe).not.toBeInTheDocument();
    expect(broker.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("fails closed on a second load, route mutation, sandbox mutation, or stale frame", async () => {
    const cases = [
      async (iframe: HTMLIFrameElement) => fireEvent.load(iframe),
      async (iframe: HTMLIFrameElement) => {
        iframe.setAttribute("src", "/runtime/foreign");
        await Promise.resolve();
      },
      async (iframe: HTMLIFrameElement) => {
        iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
        await Promise.resolve();
      },
      async (iframe: HTMLIFrameElement) => {
        iframe.remove();
        dispatchHostMessage(iframe, { kind: "ack" });
      },
    ];

    for (const mutate of cases) {
      const statuses: unknown[] = [];
      const rendered = renderHost({
        onStatusChange: (status) => statuses.push(status),
      });
      const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
      fireEvent.load(iframe);
      await mutate(iframe);
      await waitFor(() => {
        expect(statuses.at(-1)).toMatchObject({ state: "error" });
      });
      expect(broker.dispose).toHaveBeenCalled();
      expect(session.dispose).toHaveBeenCalled();
      rendered.unmount();
      expect(broker.dispose).toHaveBeenCalledTimes(1);
      expect(session.dispose).toHaveBeenCalledTimes(1);
      broker = createBrokerDouble();
      session = createSessionDouble();
      brokerMocks.create.mockReturnValue(broker);
      protocolMocks.createParentSession.mockReturnValue(session.value);
    }
  });

  it("reports the navigation deadline when the trusted route never loads", () => {
    vi.useFakeTimers();
    const statuses: unknown[] = [];
    renderHost({ onStatusChange: (status) => statuses.push(status) });

    act(() => vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS));

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message:
        "The generated mechanic runtime did not load its trusted route before its navigation deadline.",
    });
    expect(screen.queryByTitle(template.title)).not.toBeInTheDocument();
    expect(brokerMocks.create).not.toHaveBeenCalled();
    expect(brokerMocks.disposePreparation).toHaveBeenCalledOnce();
  });

  it("reports which trusted handshake prerequisite missed its deadline", async () => {
    vi.useFakeTimers();
    const cases = [
      {
        prepare() {
          return undefined;
        },
        expectedMessage:
          "The generated mechanic runtime did not acknowledge its project bootstrap.",
      },
      {
        prepare(iframe: HTMLIFrameElement) {
          dispatchHostMessage(iframe, { kind: "ack" });
        },
        expectedMessage:
          "The generated mechanic runtime Worker broker did not initialize.",
      },
    ];

    for (const testCase of cases) {
      let resolveBrokerReady!: () => void;
      const brokerReady = new Promise<void>((resolve) => {
        resolveBrokerReady = resolve;
      });
      broker = createBrokerDouble(brokerReady);
      brokerMocks.create.mockReturnValue(broker);
      const statuses: unknown[] = [];
      const rendered = renderHost({
        onStatusChange: (status) => statuses.push(status),
      });
      const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
      fireEvent.load(iframe);

      if (testCase.expectedMessage.includes("project bootstrap")) {
        resolveBrokerReady();
        await act(async () => {
          await brokerReady;
        });
      } else {
        testCase.prepare(iframe);
      }
      act(() => vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS));

      expect(statuses.at(-1)).toEqual({
        state: "error",
        message: testCase.expectedMessage,
      });
      expect(broker.dispose).toHaveBeenCalledOnce();
      expect(session.dispose).toHaveBeenCalledOnce();
      rendered.unmount();
      resolveBrokerReady();
      session = createSessionDouble();
      protocolMocks.createParentSession.mockReturnValue(session.value);
    }
  });

  it("reports the runtime-ready deadline after both handshakes complete", async () => {
    vi.useFakeTimers();
    const statuses: unknown[] = [];
    renderHost({ onStatusChange: (status) => statuses.push(status) });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    dispatchHostMessage(iframe, { kind: "ack" });

    act(() => vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS));

    expect(statuses.at(-1)).toEqual({
      state: "error",
      message:
        "The generated sandbox did not finish booting. Regenerate the game to request a fresh module.",
    });
    expect(broker.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("gives navigation, handshake, and runtime readiness independent deadlines", async () => {
    vi.useFakeTimers();
    const statuses: unknown[] = [];
    renderHost({ onStatusChange: (status) => statuses.push(status) });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);

    act(() => vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS - 1));
    expect(screen.getByTitle(template.title)).toBe(iframe);

    fireEvent.load(iframe);
    await act(async () => {
      await broker.ready;
    });
    act(() => vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS - 1));
    expect(screen.getByTitle(template.title)).toBe(iframe);

    dispatchHostMessage(iframe, { kind: "ack" });
    act(() => vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS - 1));
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });

    expect(statuses.at(-1)).toEqual({ state: "ready" });
    expect(screen.getByTitle(template.title)).toBe(iframe);
    expect(broker.dispose).not.toHaveBeenCalled();
    expect(session.dispose).not.toHaveBeenCalled();
  });

  it("ignores late handshake activity after one timeout teardown", async () => {
    vi.useFakeTimers();
    let resolveBrokerReady!: () => void;
    const brokerReady = new Promise<void>((resolve) => {
      resolveBrokerReady = resolve;
    });
    broker = createBrokerDouble(brokerReady);
    brokerMocks.create.mockReturnValue(broker);
    const statuses: unknown[] = [];
    renderHost({ onStatusChange: (status) => statuses.push(status) });
    const iframe = screen.getByTitle<HTMLIFrameElement>(template.title);
    fireEvent.load(iframe);

    act(() => vi.advanceTimersByTime(SANDBOX_BOOT_TIMEOUT_MS));
    dispatchHostMessage(iframe, { kind: "ack" });
    dispatchHostMessage(iframe, {
      kind: "runtime",
      event: { type: "game-ready" },
    });
    broker.resolveClosed({
      reason: "controller-error",
      message: "late broker closure",
    });
    resolveBrokerReady();
    await act(async () => {
      await brokerReady;
      await Promise.resolve();
    });
    act(() => vi.runAllTimers());

    expect(statuses).toEqual([
      { state: "loading" },
      {
        state: "error",
        message:
          "The generated mechanic runtime did not finish its project and Worker broker handshake.",
      },
    ]);
    expect(broker.dispose).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(session.consumeIframeMessage).not.toHaveBeenCalled();
  });

  function renderHost(
    override: Partial<GeneratedMechanicPhaserRuntimeHostProps> = {},
    ref = createRef<RuntimeIframeHostHandle>()
  ) {
    return render(
      <GeneratedMechanicPhaserRuntimeHost
        ref={ref}
        template={template}
        generatedMechanicProject={project}
        {...override}
      />
    );
  }

  function dispatchHostMessage(
    iframe: HTMLIFrameElement,
    data: unknown,
    override: Partial<MessageEvent<unknown>> = {}
  ) {
    act(() => {
      windowMessageListener({
        data,
        source: iframe.contentWindow,
        origin: "null",
        isTrusted: true,
        currentTarget: window,
        ports: [],
        ...override,
      } as unknown as MessageEvent<unknown>);
    });
  }
});

function createBrokerDouble(ready: Promise<void> = Promise.resolve()) {
  let resolveClosed!: (result: { reason: string; message: string }) => void;
  return {
    ready,
    closed: new Promise<{ reason: string; message: string }>((resolve) => {
      resolveClosed = resolve;
    }),
    dispose: vi.fn(),
    resolveClosed,
  };
}

function createSessionDouble() {
  let acknowledged = false;
  const sendBootstrap = vi.fn();
  const postRuntimeCommand = vi.fn();
  const consumeIframeMessage = vi.fn((event: MessageEvent<unknown>) => {
    if (
      !event.isTrusted ||
      event.currentTarget !== window ||
      event.origin !== "null" ||
      event.ports.length !== 0
    ) {
      return null;
    }
    const data = event.data as { kind?: string; event?: unknown };
    if (data.kind === "ack") {
      acknowledged = true;
      return null;
    }
    return acknowledged && data.kind === "runtime" ? data.event : null;
  });
  const dispose = vi.fn();
  const value: GeneratedMechanicPhaserParentSession = {
    sendBootstrap,
    postRuntimeCommand,
    consumeIframeMessage,
    isAcknowledged: () => acknowledged,
    dispose,
  };
  return {
    value,
    sendBootstrap,
    postRuntimeCommand,
    consumeIframeMessage,
    dispose,
  };
}
