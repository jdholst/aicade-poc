import { describe, expect, it, vi } from "vitest";

import type {
  FirstPlayableValidationAttempt,
  GamePack,
  GeneratedMechanicProjectDependency,
} from "@/game-spec";

import {
  createGeneratedMechanicProjectRuntime,
  isGeneratedMechanicProjectRuntimeAuthentic,
} from "./generated-mechanic-project-runtime";

describe("generated mechanic project runtime boundary", () => {
  it("issues opaque exact-identity receipts even when host resources are undefined", async () => {
    const events: string[] = [];
    const dependency = createDependency();
    const attempt = {
      id: "first_playable_attempt_generated_counter",
      gamePackId: "game_pack_generated_counter",
      status: "passed",
      evidence: [],
    } as unknown as FirstPlayableValidationAttempt;
    const runtime = createGeneratedMechanicProjectRuntime({
      async loadProjectDependency(admittedDependency) {
        events.push("load");
        expect(admittedDependency).toEqual(dependency);
        expect(admittedDependency).not.toBe(dependency);
        expect(Object.isFrozen(admittedDependency)).toBe(true);
        return undefined;
      },
      async installTrustedTemplate({ loadedResource }) {
        events.push("install");
        expect(loadedResource).toBeUndefined();
        return undefined;
      },
      async runFirstPlayableBrowserChecks({ activeResource }) {
        events.push("browser");
        expect(activeResource).toBeUndefined();
        return attempt;
      },
      async disposeProjectDependency({ activeResource, loadedResource }) {
        events.push("dispose");
        expect(activeResource).toBeUndefined();
        expect(loadedResource).toBeUndefined();
      },
    });

    const loadedDependency = await runtime.loadProjectDependency(dependency);
    const activation = await runtime.installTrustedTemplate({
      finalGameSpec: dependency.finalGameSpec,
      loadedDependency,
    });
    const browserResult = await runtime.runFirstPlayableBrowserChecks({
      activation,
      finalGameSpec: dependency.finalGameSpec,
      gamePack: { id: "game_pack_generated_counter" } as GamePack,
    });
    await runtime.disposeProjectDependency({ activation, loadedDependency });

    expect(loadedDependency.dependency).toEqual(dependency);
    expect(activation.dependency).toBe(loadedDependency.dependency);
    expect(browserResult).toEqual({ activation, attempt });
    expect(events).toEqual(["load", "install", "browser", "dispose"]);
    expect(isGeneratedMechanicProjectRuntimeAuthentic(runtime)).toBe(true);
    expect(isGeneratedMechanicProjectRuntimeAuthentic({ ...runtime })).toBe(
      false
    );
  });

  it("rejects a structurally identical dependency receipt not issued by its loader", async () => {
    const installTrustedTemplate = vi.fn();
    const dependency = createDependency();
    const runtime = createGeneratedMechanicProjectRuntime({
      async loadProjectDependency() {
        return { loaded: true };
      },
      installTrustedTemplate,
      runFirstPlayableBrowserChecks: vi.fn(),
      disposeProjectDependency: vi.fn(),
    });
    const loadedDependency = await runtime.loadProjectDependency(dependency);

    await expect(
      runtime.installTrustedTemplate({
        finalGameSpec: dependency.finalGameSpec,
        loadedDependency: { ...loadedDependency },
      })
    ).rejects.toThrow("loader-issued project dependency receipt");
    expect(installTrustedTemplate).not.toHaveBeenCalled();
  });
});

function createDependency(): GeneratedMechanicProjectDependency {
  return {
    contract: {
      id: "contract_generated_counter",
    } as GeneratedMechanicProjectDependency["contract"],
    finalGameSpec: {
      id: "final_game_spec_generated_counter_v1",
      extension: {
        id: "extension_generated_counter",
        versionId: "extension_generated_counter_v1",
        mechanicId: "mechanic_generated_counter",
        sourceArtifactId: "source_generated_counter_v1",
      },
    } as GeneratedMechanicProjectDependency["finalGameSpec"],
    referenceCatalog: {},
    sourceArtifact: {
      id: "source_generated_counter_v1",
      capabilityVersion: "mechanic_capability/v1",
    } as GeneratedMechanicProjectDependency["sourceArtifact"],
    trustedPortContracts: [],
  };
}
