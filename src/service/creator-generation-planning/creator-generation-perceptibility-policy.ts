import type { MechanicIntent, TopDownGameSpec } from "@/game-spec";

const RETAINED_HOST_FALLBACK_MOVEMENT_SPEED = 220;

export const TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY = Object.freeze({
  semanticTrigger: "dash",
  absoluteSpeedKeys: Object.freeze(["dash_speed"]),
  speedMultiplierKeys: Object.freeze([
    "dash_speed_multiplier",
    "speed_multiplier",
  ]),
  durationKeys: Object.freeze([
    "dash_duration_ms",
    "dash_duration_milliseconds",
    "duration_milliseconds",
  ]),
  normalMovementSpeedKeys: Object.freeze([
    "normal_movement_speed",
    "normal_speed",
  ]),
  minimumSpeedMultiplier: 2,
  minimumExtraTravelPixels: 32,
  minimumDurationMilliseconds: 150,
});

const PERCEPTIBILITY_ASSUMPTION_ID =
  "assumption_dash_perceptibility_floor";

export function applyTopDownCreatorPerceptibilityFloor(
  intent: MechanicIntent,
  gameSpec: TopDownGameSpec
): MechanicIntent {
  if (!isDashLikeMotionIntent(intent) || intent.ambiguities.length >= 32) {
    return intent;
  }

  const baselineSpeed = readPlayerMovementSpeed(gameSpec);
  const absoluteSpeed = readNumber(
    intent,
    TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.absoluteSpeedKeys
  );
  const speedMultiplier = readNumber(
    intent,
    TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.speedMultiplierKeys
  );
  const duration = readNumber(
    intent,
    TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.durationKeys
  );
  if (
    duration === undefined ||
    duration <= 0 ||
    (absoluteSpeed === undefined && speedMultiplier === undefined)
  ) {
    return intent;
  }

  const minimumSpeed =
    baselineSpeed *
    TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.minimumSpeedMultiplier;
  const selectedSpeed =
    absoluteSpeed ?? baselineSpeed * (speedMultiplier ?? 0);
  const normalizedSpeed = Math.ceil(Math.max(selectedSpeed, minimumSpeed));
  const extraSpeed = normalizedSpeed - baselineSpeed;
  const minimumDurationForTravel = Math.ceil(
    (TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.minimumExtraTravelPixels *
      1_000) /
      extraSpeed
  );
  const normalizedDuration = Math.ceil(
    Math.max(
      duration,
      minimumDurationForTravel,
      TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.minimumDurationMilliseconds
    )
  );
  const normalizedMultiplier =
    normalizedSpeed / baselineSpeed;

  const configuration = intent.configuration.map((entry) => {
    if (
      TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.absoluteSpeedKeys.includes(
        entry.key
      )
    ) {
      return { ...entry, value: normalizedSpeed };
    }
    if (
      TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.speedMultiplierKeys.includes(
        entry.key
      )
    ) {
      return { ...entry, value: normalizedMultiplier };
    }
    if (
      TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.durationKeys.includes(
        entry.key
      )
    ) {
      return { ...entry, value: normalizedDuration };
    }
    if (
      TOP_DOWN_CREATOR_MOTION_PERCEPTIBILITY_POLICY.normalMovementSpeedKeys.includes(
        entry.key
      )
    ) {
      return { ...entry, value: baselineSpeed };
    }
    return { ...entry };
  });
  if (
    configuration.every(
      (entry, index) => entry.value === intent.configuration[index]?.value
    )
  ) {
    return intent;
  }

  const assumption = {
    id: PERCEPTIBILITY_ASSUMPTION_ID,
    description:
      "The provider-selected dash contrast was below the retained top-down host perceptibility floor.",
    inferredValue: `dash_speed_${normalizedSpeed}_normal_movement_speed_${baselineSpeed}_duration_${normalizedDuration}_ms`,
    rationale:
      "A two-times speed burst with at least 32 pixels of extra travel is the temporary retained-host floor for a visibly faster dash.",
    reversible: true as const,
  };

  return {
    ...intent,
    configuration,
    ambiguities: [
      ...intent.ambiguities.filter(
        ({ id }) => id !== PERCEPTIBILITY_ASSUMPTION_ID
      ),
      assumption,
    ],
  };
}

function isDashLikeMotionIntent(intent: MechanicIntent): boolean {
  if (!intent.requiredCapabilities.includes("object_motion_write")) {
    return false;
  }
  return [intent.summary, ...intent.behaviors, ...intent.outcomes].some(
    (value) => value.toLowerCase().includes("dash")
  );
}

function readPlayerMovementSpeed(gameSpec: TopDownGameSpec): number {
  const configuredSpeed = gameSpec.mechanics.find(
    ({ type }) => type === "player_movement"
  )?.config.speed;
  return typeof configuredSpeed === "number" &&
    Number.isFinite(configuredSpeed) &&
    configuredSpeed > 0
    ? configuredSpeed
    : RETAINED_HOST_FALLBACK_MOVEMENT_SPEED;
}

function readNumber(
  intent: MechanicIntent,
  keys: readonly string[]
): number | undefined {
  const value = intent.configuration.find(({ key }) => keys.includes(key))
    ?.value;
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}
