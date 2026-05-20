# Phase 5 Prep Notes

Draft status: carried prep notes from the Phase 3/4 closeout. These are not
required to close Phase 4. They are the next cleanup and hardening opportunities
that became clearer while finishing Game Spec, Mechanic Registry, Phaser runtime,
validation, and editor runtime-panel work.

## Closeout Position

Phase 4 can be treated as complete for the POC.

The completed Phase 3/4 work proves the core architecture direction:

- Canvas and Phaser can share the runtime adapter and iframe host path.
- A compact top-down Game Spec can configure a trusted Phaser template.
- Mechanic behavior can be selected through explicit Game Spec mechanic entries.
- The Mechanic Registry can bridge active mechanics to runtime installer scripts.
- Mechanic-aware validation can fail invalid specs before runtime boot.
- Recoverable mechanic runtime failures can be surfaced as warnings without
  blocking iframe readiness.
- The editor can distinguish validation errors, recoverable runtime warnings,
  fatal runtime errors, loading, and mounted runtime states.

The remaining items below should move into Phase 5 or later backlog work instead
of keeping Phase 4 open.

## Recommended Next Cleanup

### 1. Generated Game Pack Completion Module

Current hotspot: `src/service/starter-project/generated-game-pack-contract.ts`.

Why it matters:

- This Module currently owns editable-spec JSON safety, generated source static
  validation, spec-reference checking, TypeScript transpilation, and final pack
  completion.
- Phase 5 prompt-to-spec, repair, persistence, and telemetry work will likely
  touch this path often.

Recommended direction:

- Split editable-spec safety into its own Module.
- Split generated-source validation/transpilation into its own Module.
- Keep pack completion as the orchestration Interface that assembles and validates
  the final `GeneratedGamePack`.
- Preserve existing public behavior and tests while moving logic.

### 2. Editor AI Chat Display Split

Current hotspot: `src/components/editor-shell/editor-ai-chat.tsx`.

Why it matters:

- This Module still owns chat shell layout, OpenAI config UI, loading timeline,
  error display, manifest/spec summaries, controls, metadata panels, and the
  disabled follow-up prompt area.
- It is now similar to what `EditorGameCanvas` was before Candidate 6.

Recommended direction:

- Add a small view model for chat display decisions and pack summary data.
- Split generated-pack summary, generation timeline, config/error blocks, and
  follow-up prompt placeholder into focused display Modules.
- Keep `useEditorSession` as the state owner.

### 3. Shared Test Fixture Builders

Current hotspot: repeated `GeneratedGamePack` and editor session setup in tests.

Why it matters:

- Several tests duplicate full generated-pack objects and canvas/session builders.
- Future persistence and generation work will add more tests around the same
  shape, making duplication noisy.

Recommended direction:

- Add test-only builders for generated Canvas packs, editor canvas sessions, and
  common runtime warnings.
- Keep tests explicit at assertion sites, but stop repeating full object bodies.

### 4. Mechanic Config Schema And Defaults Ownership

Current hotspot: Mechanic Registry entries have a `configSchema` direction, but
built-in runtime scripts still parse simple config defaults locally.

Why it matters:

- Future AI-generated or editor-authored mechanic configs should be normalized
  before runtime install.
- Registry-owned config schemas/defaults would keep generated spec validation,
  editor controls, and runtime installer assumptions aligned.

Recommended direction:

- Add typed config schema/default metadata for built-in mechanics.
- Validate and normalize mechanic config before runtime template construction.
- Pass normalized config to installers without changing the mechanic script
  loading Interface.

### 5. Runtime Source Bundling Durability Pass

Current hotspot: `public/runtime/phaser/top-down-template.js` is still the
authored source, even though it now has internal factory Modules.

Why it matters:

- The internal factory split improved Locality, but source-level unit testing and
  reuse remain awkward while the runtime core lives directly in `public/`.
- Future template variants may want shared runtime infrastructure without copying
  classic-script code.

Recommended direction:

- Move runtime internals to source Modules under `src/runtime/phaser/core/`.
- Bundle them back into one classic public script so iframe script loading stays
  unchanged: Phaser script, mechanic scripts, then one core runtime script.
- Treat this as a durability pass, not a Phase 4 blocker, because it introduces
  build/tooling surface.

## Not Blocking Phase 4

These notes should not reopen Phase 4:

- They do not invalidate the current Game Spec or Mechanic Registry authoring
  model.
- They do not require changes to the editor runtime protocol.
- They do not block moving to persistence, prompt-to-spec generation, telemetry,
  or creator editing work.
- They are best handled as Phase 5 prep tasks when they directly support the next
  milestone.
