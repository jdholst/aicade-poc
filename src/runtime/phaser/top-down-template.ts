import type { RuntimeViewport } from "@/runtime/runtime-adapter";
import {
  getTopDownMechanicDefinition,
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

const TOP_DOWN_MECHANIC_RUNTIME_SCRIPT_PATHS = [
  "/runtime/phaser/mechanics/player-movement.js",
  "/runtime/phaser/mechanics/pickup-collection.js",
  "/runtime/phaser/mechanics/enemy-chase.js",
  "/runtime/phaser/mechanics/hazard-contact.js",
];

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
      issues: Extract<
        TopDownGameSpecFixtureState,
        { status: "invalid" }
      >["issues"];
      message: string;
      status: "invalid";
    };

export function createTopDownPhaserTemplate(
  gameSpec: TopDownGameSpec
): HandAuthoredPhaserTemplate {
  const scene = gameSpec.template.config.scenes[0];

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
    mechanicInstallerKeys: Object.fromEntries(
      gameSpec.mechanics.flatMap((mechanic) => {
        const definition = getTopDownMechanicDefinition(mechanic.type);

        return definition
          ? [[mechanic.type, definition.runtimeInstallerKey]]
          : [];
      })
    ),
    runtimeDependencyScriptPaths: TOP_DOWN_MECHANIC_RUNTIME_SCRIPT_PATHS,
    runtimeScriptPath: "/runtime/phaser/top-down-template.js",
  };
}

export const topDownPhaserTemplate =
  createTopDownPhaserTemplate(topDownGameSpecFixture);

const validTopDownPhaserTemplateState: TopDownPhaserTemplateState = {
  status: "valid",
  template: topDownPhaserTemplate,
};

export function getTopDownPhaserTemplateState(
  useValidFixture =
    process.env.NEXT_PUBLIC_AICADE_USE_INVALID_GAME_SPEC !== "1"
): TopDownPhaserTemplateState {
  if (useValidFixture) {
    return validTopDownPhaserTemplateState;
  }

  const fixtureState = getTopDownGameSpecFixtureState(useValidFixture);

  if (fixtureState.status === "invalid") {
    return fixtureState;
  }

  return {
    status: "valid",
    template: createTopDownPhaserTemplate(fixtureState.gameSpec),
  };
}
