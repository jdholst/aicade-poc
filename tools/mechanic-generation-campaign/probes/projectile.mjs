import {
  acceptedArtifact,
  assertion,
  finishProbe,
  hasCallbacks,
  hasCapabilities,
  runtimeAssertions,
} from "./probe-helpers.mjs";

export async function runProbe({ page, gamePack }) {
  const artifact = acceptedArtifact(gamePack);
  const ownedObjects = artifact?.contract?.ownedObjects ?? [];
  const bindings = artifact?.contract?.bindings ?? [];
  const assertions = [
    assertion("accepted_generated_artifact", artifact, artifact?.id ?? "missing"),
    assertion(
      "projectile_owned_object",
      ownedObjects.some(({ objectKind }) => /projectile/i.test(objectKind)),
      JSON.stringify(ownedObjects)
    ),
    assertion(
      "actor_relative_authority",
      hasCapabilities(artifact, ["object_create", "object_read", "object_motion_write"]),
      JSON.stringify(artifact?.contract?.capabilities ?? [])
    ),
    assertion(
      "target_and_cleanup_authority",
      hasCapabilities(artifact, ["spatial_query", "object_destroy"]),
      JSON.stringify(artifact?.contract?.capabilities ?? [])
    ),
    assertion(
      "single_actor_binding",
      bindings.some(
        ({ cardinality, objectIds, referenceKind }) =>
          referenceKind === "entity" && cardinality === "one" && objectIds?.length === 1
      ),
      JSON.stringify(bindings)
    ),
    assertion(
      "action_and_cleanup_callbacks",
      hasCallbacks(artifact, ["logical_action", "scheduled"]),
      JSON.stringify(artifact?.contract?.lifecycle?.callbacks ?? [])
    ),
    ...(await runtimeAssertions(page, "Space")),
  ];
  return finishProbe(assertions);
}

