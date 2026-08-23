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
  const bindings = artifact?.contract?.bindings ?? [];
  const ownedObjects = artifact?.contract?.ownedObjects ?? [];
  const assertions = [
    assertion("accepted_generated_artifact", artifact, artifact?.id ?? "missing"),
    assertion(
      "live_entity_bindings",
      bindings.filter(({ referenceKind }) => referenceKind === "entity").length >= 2,
      JSON.stringify(bindings)
    ),
    assertion(
      "spatial_and_temporary_state_authority",
      hasCapabilities(artifact, ["spatial_query", "state_read", "state_write", "time_schedule"]),
      JSON.stringify(artifact?.contract?.capabilities ?? [])
    ),
    assertion(
      "spawning_not_core",
      ownedObjects.length === 0,
      JSON.stringify(ownedObjects)
    ),
    assertion(
      "expiration_and_disposal_callbacks",
      hasCallbacks(artifact, ["scheduled", "dispose"]),
      JSON.stringify(artifact?.contract?.lifecycle?.callbacks ?? [])
    ),
    ...(await runtimeAssertions(page)),
  ];
  return finishProbe(assertions);
}

