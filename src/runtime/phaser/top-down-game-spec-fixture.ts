import {
  GameSpecValidationError,
  validateTopDownGameSpec,
  type GameSpecValidationIssue,
  type TopDownGameSpec,
} from "@/game-spec";

import { crystalSpecChaseGameSpecFixtureInput } from "./fixtures/crystal-spec-chase";
import { prismRelayGauntletGameSpecFixtureInput } from "./fixtures/prism-relay-gauntlet";

export const TOP_DOWN_GAME_SPEC_FIXTURE_ENV =
  "NEXT_PUBLIC_AICADE_TOP_DOWN_FIXTURE";
export const DEFAULT_TOP_DOWN_GAME_SPEC_FIXTURE_ID = "crystal_spec_chase";

const topDownGameSpecFixtureInputs = {
  crystal_spec_chase: crystalSpecChaseGameSpecFixtureInput,
  missing_primary_objective: {
    ...crystalSpecChaseGameSpecFixtureInput,
    id: "game_missing_primary_objective",
    title: "Missing Primary Objective",
    objectives: crystalSpecChaseGameSpecFixtureInput.objectives.map(
      (objective) => ({
        ...objective,
        primary: false,
      })
    ),
  },
  prism_relay_gauntlet: prismRelayGauntletGameSpecFixtureInput,
} as const;

export type TopDownGameSpecFixtureId = keyof typeof topDownGameSpecFixtureInputs;

export type TopDownGameSpecFixtureState =
  | {
      fixture: TopDownGameSpec;
      status: "valid";
    }
  | {
      issues: GameSpecValidationIssue[];
      message: string;
      status: "invalid";
    };

const topDownGameSpecFixtureStateById = new Map<
  TopDownGameSpecFixtureId,
  TopDownGameSpecFixtureState
>();

function createInvalidFixtureState(error: unknown): TopDownGameSpecFixtureState {
  if (error instanceof GameSpecValidationError) {
    return {
      status: "invalid",
      issues: error.issues,
      message: error.message.replace(/^Game Spec validation failed: /, ""),
    };
  }

  return {
    status: "invalid",
    issues: [],
    message:
      error instanceof Error
        ? error.message
        : "Game Spec validation failed for the selected fixture.",
  };
}

export function createTopDownGameSpecFixtureState(
  fixtureInput: unknown
): TopDownGameSpecFixtureState {
  try {
    return {
      status: "valid",
      fixture: validateTopDownGameSpec(fixtureInput),
    };
  } catch (error) {
    return createInvalidFixtureState(error);
  }
}

function createTopDownGameSpecFixtureStateForId(
  fixtureId: TopDownGameSpecFixtureId
): TopDownGameSpecFixtureState {
  return createTopDownGameSpecFixtureState(
    topDownGameSpecFixtureInputs[fixtureId]
  );
}

export function getTopDownGameSpecFixture(
  fixtureId = process.env[TOP_DOWN_GAME_SPEC_FIXTURE_ENV]
): TopDownGameSpec {
  const fixtureState = getTopDownGameSpecFixtureState(fixtureId);

  if (fixtureState.status === "valid") {
    return fixtureState.fixture;
  }

  throw new GameSpecValidationError(fixtureState.issues);
}

export function getTopDownGameSpecFixtureState(
  fixtureId = process.env[TOP_DOWN_GAME_SPEC_FIXTURE_ENV]
): TopDownGameSpecFixtureState {
  const resolvedFixtureId = resolveTopDownGameSpecFixtureId(fixtureId);
  const cachedState = topDownGameSpecFixtureStateById.get(resolvedFixtureId);

  if (cachedState) {
    return cachedState;
  }

  const fixtureState = createTopDownGameSpecFixtureStateForId(resolvedFixtureId);
  topDownGameSpecFixtureStateById.set(resolvedFixtureId, fixtureState);

  return fixtureState;
}

function resolveTopDownGameSpecFixtureId(
  fixtureId: string | undefined
): TopDownGameSpecFixtureId {
  if (fixtureId && fixtureId in topDownGameSpecFixtureInputs) {
    return fixtureId as TopDownGameSpecFixtureId;
  }

  return DEFAULT_TOP_DOWN_GAME_SPEC_FIXTURE_ID;
}

export function getDefaultTopDownGameSpecFixture(): TopDownGameSpec {
  return getTopDownGameSpecFixture(DEFAULT_TOP_DOWN_GAME_SPEC_FIXTURE_ID);
}

export function getFirstValidTopDownGameSpecFixture(): TopDownGameSpec {
  const fixtureIds = Object.keys(
    topDownGameSpecFixtureInputs
  ) as TopDownGameSpecFixtureId[];

  for (const fixtureId of fixtureIds) {
    const fixtureState = getTopDownGameSpecFixtureState(fixtureId);

    if (fixtureState.status === "valid") {
      return fixtureState.fixture;
    }
  }

  throw new GameSpecValidationError(
    fixtureIds.flatMap((fixtureId) => {
      const fixtureState = getTopDownGameSpecFixtureState(fixtureId);

      return fixtureState.status === "invalid" ? fixtureState.issues : [];
    })
  );
}
