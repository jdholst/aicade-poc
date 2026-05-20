import type { StableId } from "../game-spec-schema";

import type { GameSpecValidationIssue } from "./validation-issue";

export function toIdSet(items: Array<{ id: StableId }>): Set<StableId> {
  return new Set(items.map((item) => item.id));
}

export function toIdMap<TItem extends { id: StableId }>(
  items: readonly TItem[]
): Map<StableId, TItem> {
  return new Map(items.map((item) => [item.id, item]));
}

export function addUnknownReferenceIssues(
  issues: GameSpecValidationIssue[],
  path: string,
  referenceIds: StableId[] | undefined,
  knownIds: Set<StableId>,
  label: string
) {
  for (const referenceId of referenceIds ?? []) {
    if (!knownIds.has(referenceId)) {
      issues.push({
        path,
        message: `Unknown ${label} ID "${referenceId}".`,
      });
    }
  }
}

export function referencesAreKnown(
  referenceIds: StableId[] | undefined,
  knownIds: Set<StableId>
) {
  return (referenceIds ?? []).every((referenceId) => knownIds.has(referenceId));
}

export function addReferences(
  references: Set<StableId>,
  referenceIds: StableId[] | undefined
) {
  for (const referenceId of referenceIds ?? []) {
    references.add(referenceId);
  }
}
