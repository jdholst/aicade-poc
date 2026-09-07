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
  const assertions = [
    assertion("accepted_generated_artifact", artifact, artifact?.id ?? "missing"),
    assertion("owned_hazards_declared", ownedObjects.length > 0, JSON.stringify(ownedObjects)),
    assertion(
      "seeded_scheduling_authority",
      hasCapabilities(artifact, ["random_next", "time_schedule", "object_create"]),
      JSON.stringify(artifact?.contract?.capabilities ?? [])
    ),
    assertion(
      "bounded_owned_instances",
      ownedObjects.every(
        ({ maximumInstances }) =>
          Number.isInteger(maximumInstances) && maximumInstances > 0
      ),
      JSON.stringify(ownedObjects)
    ),
    assertion(
      "repeated_and_cleanup_callbacks",
      hasCallbacks(artifact, ["scheduled", "dispose"]),
      JSON.stringify(artifact?.contract?.lifecycle?.callbacks ?? [])
    ),
    ...(await runtimeAssertions(page)),
  ];
  return finishProbe(assertions);
}

