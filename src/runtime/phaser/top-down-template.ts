import type { RuntimeViewport } from "@/runtime/runtime-adapter";
import {
  createMechanicRuntimeBridge,
  TOP_DOWN_PHASER_MECHANIC_SCOPE,
  topDownMechanicRegistry,
  type GameSpecValidationIssue,
  type TopDownGameSpec,
} from "@/game-spec";

import {
  getTopDownGameSpecFixtureState,
  topDownGameSpecFixture,
  type TopDownGameSpecFixtureState,
} from "./top-down-game-spec-fixture";

type PhaserTemplateControl = {
  action: string;
  kind: "axis" | "button" | "toggle";
  keys: string[];
  label: string;
};

export type HandAuthoredPhaserTemplate = {
  controls: PhaserTemplateControl[];
  gameSpec: TopDownGameSpec;
  id: string;
  mechanicInstallerKeys: Record<string, string>;
  runtime: "phaser";
  runtimeDependencyScriptPaths: string[];
  runtimeScriptPath: string;
  title: string;
  viewport: RuntimeViewport;
};

export type TopDownPhaserTemplateState =
  | {
      template: HandAuthoredPhaserTemplate;
      status: "valid";
    }
  | {
      issues: GameSpecValidationIssue[];
      message: string;
      status: "invalid";
    };

export function createTopDownPhaserTemplate(
  gameSpec: TopDownGameSpec
): HandAuthoredPhaserTemplate {
  const scene = gameSpec.template.config.scenes[0];
  const mechanicRuntimeBridge = createMechanicRuntimeBridge({
    mechanics: gameSpec.mechanics,
    registry: topDownMechanicRegistry,
    scope: TOP_DOWN_PHASER_MECHANIC_SCOPE,
  });

  return {
    id: `${gameSpec.id}-phaser-template`,
    runtime: "phaser",
    title: gameSpec.title,
    viewport: {
      width: scene.arena.width,
      height: scene.arena.height,
      scaling: "stretch_to_fill",
    },
    controls: gameSpec.controls.map(({ action, kind, keys, label }) => ({
      action,
      kind,
      keys,
      label,
    })),
    gameSpec,
    mechanicInstallerKeys: mechanicRuntimeBridge.mechanicInstallerKeys,
    runtimeDependencyScriptPaths:
      mechanicRuntimeBridge.runtimeDependencyScriptPaths,
    runtimeScriptPath: "/runtime/phaser/top-down-template.js",
  };
}

export const topDownPhaserTemplate =
  createTopDownPhaserTemplate(topDownGameSpecFixture);

const topDownPhaserTemplateStateByFixtureState = new WeakMap<
  TopDownGameSpecFixtureState,
  TopDownPhaserTemplateState
>();

export function createTopDownPhaserTemplateState(
  fixtureState: TopDownGameSpecFixtureState
): TopDownPhaserTemplateState {
  if (fixtureState.status === "invalid") {
    return {
      status: "invalid",
      issues: fixtureState.issues,
      message: fixtureState.message,
    };
  }

  return {
    status: "valid",
    template: createTopDownPhaserTemplate(fixtureState.fixture),
  };
}

export function getTopDownPhaserTemplateState(): TopDownPhaserTemplateState {
  const selectedFixtureState = getTopDownGameSpecFixtureState();
  const cachedState =
    topDownPhaserTemplateStateByFixtureState.get(selectedFixtureState);

  if (cachedState) {
    return cachedState;
  }

  const selectedState = createTopDownPhaserTemplateState(selectedFixtureState);

  topDownPhaserTemplateStateByFixtureState.set(
    selectedFixtureState,
    selectedState
  );

  return selectedState;
}
