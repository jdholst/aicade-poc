import {
  requiresOwnedObjectActorOrigin,
  type MechanicIntent,
} from "@/game-spec";

const TRANSIENT_OWNED_OBJECT_LIFECYCLE_CAPABILITIES = [
  "object_create",
  "object_destroy",
] as const;

const REDISCOVERY_ASSUMPTION_ID =
  "assumption_transient_owned_object_rediscovery";
const ACTOR_OBSERVATION_ASSUMPTION_ID =
  "assumption_transient_owned_object_actor_observation";

export function applyTopDownCreatorOwnedObjectRediscoveryPolicy(
  intent: MechanicIntent
): MechanicIntent {
  const requiresTransientLifecycle =
    intent.ownedObjects.length > 0 &&
    intent.temporalRules.length > 0 &&
    TRANSIENT_OWNED_OBJECT_LIFECYCLE_CAPABILITIES.every((capabilityId) =>
      intent.requiredCapabilities.includes(capabilityId)
    );
  const requiresRediscovery =
    requiresTransientLifecycle &&
    !intent.requiredCapabilities.includes("spatial_query");
  const requiresActorObservation =
    requiresTransientLifecycle &&
    intent.actors.length > 0 &&
    requiresOwnedObjectActorOrigin(intent) &&
    intent.references.some(({ kind }) => kind === "entity") &&
    !intent.requiredCapabilities.includes("object_read");
  if (!requiresRediscovery && !requiresActorObservation) {
    return intent;
  }

  const retainedAmbiguities = intent.ambiguities.filter(
    ({ id }) =>
      id !== REDISCOVERY_ASSUMPTION_ID &&
      id !== ACTOR_OBSERVATION_ASSUMPTION_ID
  );
  const policyAssumptions = [
    ...(requiresRediscovery
      ? [
          {
            id: REDISCOVERY_ASSUMPTION_ID,
            description:
              "The provider described a transient owned object that survives across callbacks but omitted the retained host's rediscovery authority.",
            inferredValue: "spatial_query",
            rationale:
              "Opaque object handles cannot be stored in JSON private state, so a bounded owned-object spatial query is required to rediscover and later update or destroy the object after simulated time.",
            reversible: true as const,
          },
        ]
      : []),
    ...(requiresActorObservation
      ? [
          {
            id: ACTOR_OBSERVATION_ASSUMPTION_ID,
            description:
              "The provider described actor-relative spatial behavior for a transient owned object but omitted authority to observe the actor's live transform.",
            inferredValue: "object_read",
            rationale:
              "The retained host exposes actor bindings as opaque handles, so object_read is required to place and launch an owned object from the actor's current position and motion.",
            reversible: true as const,
          },
        ]
      : []),
  ];

  return {
    ...intent,
    requiredCapabilities: [
      ...intent.requiredCapabilities,
      ...(requiresActorObservation ? ["object_read"] : []),
      ...(requiresRediscovery ? ["spatial_query"] : []),
    ],
    ambiguities: [
      ...retainedAmbiguities,
      ...policyAssumptions.slice(0, Math.max(0, 32 - retainedAmbiguities.length)),
    ],
  };
}
