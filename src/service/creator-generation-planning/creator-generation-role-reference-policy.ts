import type { MechanicIntent, TopDownGameSpec } from "@/game-spec";

const ROLE_REFERENCE_ASSUMPTION_ID =
  "assumption_generated_host_role_entity_references";
const MAXIMUM_INTENT_REFERENCES = 64;
const MAXIMUM_INTENT_AMBIGUITIES = 32;
const MAXIMUM_ASSUMPTION_TEXT_LENGTH = 600;

export function applyTopDownCreatorRoleReferencePolicy(
  intent: MechanicIntent,
  gameSpec: TopDownGameSpec
): MechanicIntent {
  if (!usesGeneratedHostProfile(intent)) {
    return intent;
  }

  const entitiesByRole = new Map<string, TopDownGameSpec["entities"]>();
  for (const entity of gameSpec.entities) {
    entitiesByRole.set(entity.role, [
      ...(entitiesByRole.get(entity.role) ?? []),
      entity,
    ]);
  }

  const entitiesById = new Map(
    gameSpec.entities.map((entity) => [entity.id, entity] as const)
  );
  const representedRoles = new Set<string>(
    intent.references.flatMap((reference) => {
      if (reference.kind !== "entity") {
        return [];
      }
      const entity = entitiesById.get(reference.id);
      return entity ? [entity.role] : [];
    })
  );
  const inferredEntityIds = [
    ...new Set([...intent.actors, ...intent.targets]),
  ].flatMap((role) => {
    if (representedRoles.has(role)) {
      return [];
    }
    const matchingEntities = entitiesByRole.get(role) ?? [];
    return matchingEntities.length === 1 ? [matchingEntities[0]!.id] : [];
  });

  if (
    inferredEntityIds.length === 0 ||
    intent.references.length + inferredEntityIds.length >
      MAXIMUM_INTENT_REFERENCES
  ) {
    return intent;
  }

  const retainedAmbiguities = intent.ambiguities.filter(
    ({ id }) => id !== ROLE_REFERENCE_ASSUMPTION_ID
  );
  if (retainedAmbiguities.length >= MAXIMUM_INTENT_AMBIGUITIES) {
    return intent;
  }
  const inferredValue = inferredEntityIds.join(",");
  if (inferredValue.length > MAXIMUM_ASSUMPTION_TEXT_LENGTH) {
    return intent;
  }

  return {
    ...intent,
    references: [
      ...intent.references,
      ...inferredEntityIds.map((id) => ({ kind: "entity" as const, id })),
    ],
    ambiguities: [
      ...retainedAmbiguities,
      {
        id: ROLE_REFERENCE_ASSUMPTION_ID,
        description:
          "The provider named generated-host actor or target roles without their exact unambiguous Game Spec entity references.",
        inferredValue,
        rationale:
          "The returned Game Spec contains exactly one entity with each named role, so retaining those exact entity IDs makes the provider's role lineage explicit without selecting among alternatives.",
        reversible: true,
      },
    ],
  };
}

function usesGeneratedHostProfile(intent: MechanicIntent): boolean {
  const usesGeneratedHostTrigger =
    intent.triggers.includes("logical_action") ||
    (intent.triggers.length === 1 && intent.triggers[0] === "install");
  const hasIndependentGeneratedEffect =
    intent.requiredCapabilities.includes("object_motion_write") ||
    (intent.ownedObjects.length > 0 &&
      ["object_create", "object_destroy"].every((capabilityId) =>
        intent.requiredCapabilities.includes(capabilityId)
      ));
  return usesGeneratedHostTrigger && hasIndependentGeneratedEffect;
}
