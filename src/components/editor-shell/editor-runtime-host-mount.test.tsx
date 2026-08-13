import { render } from "@testing-library/react";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGeneratedMechanicProjectFixture } from "@/game-spec/game-pack/testing/generated-mechanic-project-fixtures";
import { createTopDownPhaserTemplate } from "@/runtime/phaser/top-down-template";

const hostMocks = vi.hoisted(() => ({
  generated: vi.fn(() => null),
  runtimeIframe: vi.fn(() => null),
  canvas: vi.fn(() => null),
}));

vi.mock("@/components/generated-mechanic-phaser-runtime-host", () => ({
  GeneratedMechanicPhaserRuntimeHost: hostMocks.generated,
}));

vi.mock("@/components/runtime-iframe-host", () => ({
  RuntimeIframeHost: hostMocks.runtimeIframe,
}));

vi.mock("@/components/generated-game-host", () => ({
  GeneratedGameHost: hostMocks.canvas,
}));

import { EditorRuntimeHostMount } from "./editor-runtime-host-mount";

const fixture = createGeneratedMechanicProjectFixture();
const template = createTopDownPhaserTemplate(
  fixture.dependency.finalGameSpec.gameSpec
);
const generatedMechanicProject = {
  artifact: fixture.artifact,
  dependency: fixture.dependency,
};

describe("EditorRuntimeHostMount", () => {
  beforeEach(() => {
    hostMocks.generated.mockClear();
    hostMocks.runtimeIframe.mockClear();
    hostMocks.canvas.mockClear();
  });

  it("selects the specialized host only for a Phaser project with a generated mechanic", () => {
    const props = {
      focusOnReadyKey: 3,
      hostRef: createRef<never>(),
      isPaused: true,
      onStatusChange: vi.fn(),
      onValidationEvidence: vi.fn(),
      runFirstPlayableChecksOnReady: true,
    };
    const { rerender } = render(
      <EditorRuntimeHostMount
        {...props}
        host={{
          type: "phaser",
          key: "generated",
          template,
          generatedMechanicProject,
        }}
      />
    );

    expect(hostMocks.generated).toHaveBeenCalledWith(
      expect.objectContaining({
        template,
        generatedMechanicProject,
        focusOnReadyKey: 3,
        isPaused: true,
        runFirstPlayableChecksOnReady: true,
      }),
      undefined
    );
    expect(hostMocks.runtimeIframe).not.toHaveBeenCalled();

    rerender(
      <EditorRuntimeHostMount
        {...props}
        host={{
          type: "phaser",
          key: "built-in",
          template,
        }}
      />
    );

    expect(hostMocks.runtimeIframe).toHaveBeenCalledWith(
      expect.objectContaining({
        artifact: template,
        runtimeAdapter: expect.any(Object),
        focusOnReadyKey: 3,
        isPaused: true,
        runFirstPlayableChecksOnReady: true,
      }),
      undefined
    );
    expect(hostMocks.generated).toHaveBeenCalledTimes(1);
  });
});
