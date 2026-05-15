import { describe, expect, it } from "vitest";

import { topDownPhaserTemplate } from ".";
import { phaserRuntimeAdapter } from "./phaser-runtime-adapter";

describe("phaser runtime adapter", () => {
  it("creates an iframe mount descriptor for a hand-authored Phaser template", () => {
    const descriptor =
      phaserRuntimeAdapter.createMountDescriptor(topDownPhaserTemplate);

    expect(phaserRuntimeAdapter.kind).toBe("phaser");
    expect(descriptor.title).toBe("Crystal Spec Chase");
    expect(descriptor.sandbox).toBe("allow-scripts");
    expect(descriptor.srcDoc).toContain('<div id="game" tabindex="0"></div>');
    expect(descriptor.srcDoc).toContain('"gameSpec"');
    expect(descriptor.srcDoc).toContain('"title":"Crystal Spec Chase"');
    expect(descriptor.srcDoc).toContain('"width":800');
    expect(descriptor.srcDoc).toContain('"height":600');
    expect(descriptor.srcDoc).toContain(
      '<script src="/runtime/phaser/phaser-arcade-physics.min.js"></script>'
    );
    expect(descriptor.srcDoc).toContain(
      '<script src="/runtime/phaser/mechanics/player-movement.js"></script>'
    );
    expect(descriptor.srcDoc).toContain(
      '<script src="/runtime/phaser/mechanics/pickup-collection.js"></script>'
    );
    expect(descriptor.srcDoc).toContain(
      '<script src="/runtime/phaser/mechanics/enemy-chase.js"></script>'
    );
    expect(descriptor.srcDoc).toContain(
      '<script src="/runtime/phaser/top-down-template.js"></script>'
    );
    expect(
      descriptor.srcDoc.indexOf(
        '<script src="/runtime/phaser/phaser-arcade-physics.min.js"></script>'
      )
    ).toBeLessThan(
      descriptor.srcDoc.indexOf(
        '<script src="/runtime/phaser/mechanics/player-movement.js"></script>'
      )
    );
    expect(
      descriptor.srcDoc.indexOf(
        '<script src="/runtime/phaser/mechanics/enemy-chase.js"></script>'
      )
    ).toBeLessThan(
      descriptor.srcDoc.indexOf(
        '<script src="/runtime/phaser/top-down-template.js"></script>'
      )
    );
    expect(descriptor.srcDoc).toContain("globalThis.__AICADE_PHASER_TEMPLATE__");
    expect(descriptor.srcDoc).toContain('type: "game-error"');
    expect(descriptor.srcDoc).toContain('window.addEventListener("error"');
    expect(descriptor.srcDoc).toContain(
      'window.addEventListener("unhandledrejection"'
    );
  });

  it("parses shared runtime events", () => {
    expect(
      phaserRuntimeAdapter.parseEvent({
        type: "game-ready",
        manifest: { runtime: "phaser" },
        viewport: {
          width: 960,
          height: 540,
          scaling: "stretch_to_fill",
        },
      })
    ).toEqual({
      type: "game-ready",
      manifest: { runtime: "phaser" },
      viewport: {
        width: 960,
        height: 540,
        scaling: "stretch_to_fill",
      },
    });

    expect(
      phaserRuntimeAdapter.parseEvent({
        type: "game-error",
        message: "Phaser boot failed.",
      })
    ).toEqual({
      type: "game-error",
      message: "Phaser boot failed.",
    });
  });
});
