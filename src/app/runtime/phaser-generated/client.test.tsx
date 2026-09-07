import { act, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const controller = { terminate: vi.fn() };
  const child = { dispose: vi.fn() };
  const controllerPromise = Promise.resolve(controller);
  const projectPromise = Promise.resolve(child);
  const disposeRoute = vi.fn(async () => undefined);
  return {
    child,
    controller,
    controllerPromise,
    createRoute: vi.fn(() => ({
      ready: Promise.resolve(),
      dispose: disposeRoute,
    })),
    disposeRoute,
    projectPromise,
    waitForController: vi.fn(() => controllerPromise),
    waitForProject: vi.fn(() => projectPromise),
  };
});

vi.mock(
  "@/runtime/mechanics/generated-mechanic-iframe-ses-worker-controller",
  () => ({
    waitForGeneratedMechanicIframeSesWorkerController:
      mocks.waitForController,
  })
);

vi.mock("@/runtime/phaser/generated-mechanic-phaser-host-protocol", () => ({
  waitForGeneratedMechanicPhaserChildSession: mocks.waitForProject,
}));

vi.mock("./runtime", () => ({
  createTrustedGeneratedMechanicPhaserRoute: mocks.createRoute,
}));

describe("GeneratedMechanicPhaserClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers both authenticated waiters at module load and owns one viewport runtime", async () => {
    const { default: GeneratedMechanicPhaserClient } = await import("./client");

    expect(mocks.waitForController).toHaveBeenCalledWith({
      expectedParent: window.parent,
      ownerWindow: window,
    });
    expect(mocks.waitForProject).toHaveBeenCalledWith({
      expectedParent: window.parent,
      ownerWindow: window,
    });

    const mounted = render(
      <StrictMode>
        <GeneratedMechanicPhaserClient />
      </StrictMode>
    );
    const game = mounted.getByTestId("phaser-generated-game");
    expect(game).toHaveAttribute("id", "game");
    expect(game).toHaveAttribute("tabindex", "0");
    expect(game).toHaveStyle({ height: "100dvh", width: "100vw" });
    await waitFor(() => {
      expect(mocks.createRoute).toHaveBeenCalledWith({
        waiters: {
          controller: mocks.controllerPromise,
          project: mocks.projectPromise,
        },
      });
    });
    expect(mocks.createRoute).toHaveBeenCalledTimes(1);
    expect(mocks.disposeRoute).not.toHaveBeenCalled();

    mounted.unmount();
    expect(mocks.disposeRoute).not.toHaveBeenCalled();

    const remounted = render(<GeneratedMechanicPhaserClient />);
    expect(mocks.createRoute).toHaveBeenCalledTimes(1);
    remounted.unmount();

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide"));
    });
    await waitFor(() => expect(mocks.disposeRoute).toHaveBeenCalledTimes(1));
  });
});
