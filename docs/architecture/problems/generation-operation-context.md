# Generation Operation Context

Draft status: exploration note. This is not approved implementation work.

Source: Phase 8 architecture review follow-up. The Strong extraction work deepened the Phaser GenerationRun receipt lifecycle and first-playable terminal finalization. This note records the next possible deeper Module without changing behavior.

## Target Module

`GenerationOperationContext`

Likely home:

- `src/service/generation-run/generation-operation-context.ts`
- or `src/service/generation-run/editor-generation-operation-context.ts` if the first implementation remains editor-only.

## Current Interface Friction

Phase 8 now has a useful GenerationRun spine, but the operation identity and provenance still travel through several local shapes:

- `startEditorGenerationRun` creates the early GenerationRun receipt and passes its ID into Spec Generation.
- Spec Generation client options carry the correlation ID to `/api/spec-generation`.
- `useEditorSession` turns successful generated specs into active editor state.
- `PlayableDraftSource` and first-playable validation source carry the same generated-spec origin into runtime validation.
- First-playable terminal finalization later links the same operation to Game Pack, build, checkpoint, validation evidence, and failed-attempt IDs.

This works for Phaser Spec Generation, but the same fields will spread further when edit, repair, validation retry, and export operations arrive. The risk is not one broken call today; it is that operation identity becomes a prop-drilled convention instead of a named Interface.

## Proposed Interface Shape

Create a small operation context object that represents one AI-backed creator-intent operation from the moment the editor starts it.

Candidate shape:

```ts
type GenerationOperationContext = {
  generationRunId: GenerationRun["id"];
  operationType: GenerationRun["operationType"];
  runtimeKind: GamePackRuntimeKind;
  source: "generated-spec";
  request: {
    summary: string;
    promptText?: string;
  };
  taskRoute?: string;
};
```

The first version should be deliberately narrower than a workflow engine. It should not own persistence, runtime mounting, or first-playable validation. Its job is to make the operation identity, source, and request summary explicit enough that the editor, Spec Generation client, active draft source, and terminal finalizer all speak the same small language.

## Likely Files Affected

- `src/service/generation-run/editor-generation-run.ts`
- `src/service/generation-run/phaser-generation-run-receipt-lifecycle.ts`
- `src/service/spec-generation/spec-generation-client.ts`
- `src/hooks/use-editor-session.ts`
- `src/runtime/playable-draft-source.ts`
- `src/components/editor-shell/editor-runtime-template-plan.ts`
- `src/components/editor-shell/editor-first-playable-validation-gate.ts`

## Migration Steps

1. Add the context type and factory next to the GenerationRun service boundary.
2. Have `startEditorGenerationRun` create and return the context for Phaser AI success/error/cancel outcomes.
3. Replace ad hoc `generationRunId` threading in the editor session with the context where the full operation origin matters.
4. Keep the Spec Generation client accepting only the minimal correlation option until there is a reason for server-side context expansion.
5. Update first-playable validation source creation to derive its GenerationRun ID and generated-spec source from the context.
6. Keep local fixture and restored Game Pack flows out of the context unless they become AI-backed operations.

## Test Strategy

- Add focused tests for the context factory around prompt summary, operation type, source, runtime kind, and missing repository behavior.
- Preserve existing `startEditorGenerationRun` tests for success, validation failure, repair, provider error, timeout, and cancellation.
- Preserve `useEditorSession` tests proving generated specs do not fall back to fixtures and restored Game Packs keep their own source.
- Preserve first-playable finalization tests proving relationships are written only for generated operations with a GenerationRun ID.

## Risks

- Making the context too broad could turn it into an anemic workflow bag.
- Moving server request details into the context too early could blur the browser/server boundary.
- Treating local rebuilds or fixture mounts as GenerationRun operations would violate the Phase 8 rule that only AI-backed creator-intent operations create top-level GenerationRuns.

## Non-Goals

- Do not introduce server-minted canonical GenerationRun IDs.
- Do not create top-level GenerationRuns for local rebuilds, restores, or validation retries.
- Do not replace the Phaser receipt lifecycle Module.
- Do not build edit, repair, or export operation support as part of this exploration.
- Do not add analytics UI.

## Decision Gate

Implement this only when a second AI-backed operation path starts repeating the same identity/provenance fields. Until then, the current lifecycle and terminal finalizer Modules are deep enough for Phase 8.
