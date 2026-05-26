# AI-Cade POC Implementation Plan

Draft status: implementation roadmap with Phase 3/4 and Phase 5/6 closeout remarks. This document turns the Sparkline Architecture page into a build sequence for the AI-Cade POC. The POC is a proving ground for Sparkline's game generation and creation technology, not the full Sparkline community product.

## Purpose

The POC should prove that Sparkline can create durable, editable, validated game projects using a Phaser-based runtime path before Sparkline v1 is built.

The POC should answer these questions:

- Can the current Canvas runtime path and a new Phaser runtime path share a common editor host?
- Can a compact Game Spec configure a trusted top-down Phaser template?
- Can AI generate valid Game Spec/config data without generating arbitrary Phaser source?
- Can the app validate and repair generated specs/builds enough to protect the first playable experience?
- Can projects, checkpoints, builds, edit records, and generation telemetry be saved lightly enough to test the future Game Pack model?
- Which modules are stable enough to promote into Sparkline v1?

## Related Architecture Docs

These architecture docs describe the current authoring contracts and prep notes behind this roadmap:

- [Game Spec Authoring Model](./game-spec-authoring-model.md)
- [Mechanic Registry Authoring Model](./mechanic-registry-authoring-model.md)
- [Phase 5 Prep Notes](./phase-5-prep-notes.md)

## Scope

In scope:

- Runtime adapter interface.
- Phaser adapter alongside the existing Canvas runtime.
- One hand-authored top-down Phaser template game.
- Compact Game Spec schema.
- Game Pack-oriented schema evolution.
- Mechanic Registry and modular top-down mechanics.
- Iframe runtime protocol.
- First-playable validation.
- Bounded spec/build repair loop.
- Lightweight project/checkpoint persistence.
- GenerationRun telemetry.
- Simple Asset Records and asset replacement model.

Out of scope:

- Public community feed.
- Full publishing system.
- Full moderation queues.
- User accounts and production project storage.
- Monetization.
- Live services such as leaderboards, multiplayer, saves, and achievements.
- Godot/native runtime.
- Full export ecosystem.
- Creator-facing runtime or model picker.

## Guiding Principles

- Prove the creation engine before productizing the community layer.
- Keep time-to-first-play fast.
- Promote proven architecture, not POC scaffolding.
- Prefer structured Game Spec changes over arbitrary code generation.
- Use Phaser as the future runtime path, while keeping the Game Pack model runtime-agnostic.
- Keep generated games inside an iframe or equivalent isolated runtime boundary.
- Track useful telemetry, but do not turn metrics into hard graduation gates.

## Target Architecture Slice

The POC should move toward this creation flow:

```text
prompt
  -> compact Game Spec
  -> trusted top-down Phaser template
  -> Playable Build in iframe
  -> first-playable validation
  -> Version Checkpoint
  -> Edit Records / GenerationRun telemetry
```

The initial AI-enabled Phaser flow should generate Game Spec/config only. Sparkline-owned template code should provide the runtime, mechanic modules, layout primitives, validation hooks, and runtime protocol.

Phase 5 and Phase 6 were developed as one connected vertical slice while still being split into separately completable sub-slices. The slice moved from `Game Spec` to `Playable Build`, ran first-playable validation, saved `Validation Evidence`, attached that evidence to a distinct `Version Checkpoint`, and proved that the project can be reloaded without losing failed attempt records or creator-facing history. This kept validation and persistence from drifting apart while still allowing the board to mark validation, evidence, checkpointing, restore, and failed-attempt handling independently.

The agreed build sequence is:

1. Phase 6A: define minimal in-code schemas/types for `Game Pack`, `Playable Build`, `Version Checkpoint`, and `Validation Evidence`.
2. Phase 5A: implement first-playable validation and write results into that evidence shape.
3. Phase 6B: add IndexedDB-backed lightweight persistence and reload for the validated project/checkpoint behind a small repository/service abstraction.
4. Phase 5B: improve failure UI and repair-ready evidence once validation results survive reload, without implementing automated repair yet.

Phase 5A's first-playable validation bar required six checks: boot success, no fatal runtime error, nonblank render, player visibility, input response, and basic objective presence. The implementation stayed lightweight, but a draft should not be called first-playable unless the player can see, affect, and understand the game at a basic level.

Phase 5A validation used a two-layer approach: app-side orchestration and runtime events for boot status, fatal errors, and objective presence, plus lightweight runtime/browser evidence for nonblank render, player visibility, and input response. The final first-playable result includes real runtime evidence rather than only inferred schema checks.

Failed first-playable attempts should create a failed `Playable Build` record only when a runtime artifact was built or mounted enough to inspect. Pure schema, config, or preflight failures should stay in internal `failedAttempts`. This keeps `Playable Build` meaning "a runnable artifact existed to test" while still preserving earlier failures for repair, debugging, and later telemetry.

A successful first-playable validation should automatically create the initial creator-facing `Version Checkpoint`. The first playable moment should become recoverable history as soon as Sparkline proves it is playable, instead of waiting for a separate user save action that could be lost on reload. Later edits can still use explicit accept/save behavior before creating additional checkpoints.

Restoring an older `Version Checkpoint` should create a new checkpoint that copies the older state forward instead of mutating the project back in place or deleting later history. The history timeline should be append-only: restore is an action, not a rewind. This preserves rollback, auditability, remix lineage, and future publish/export references.

Phase 5B should show friendly failure states with stored validation evidence and clear next actions, but should not include automated repair attempts yet. Automated repair belongs after prompt-to-spec generation and telemetry are active, because meaningful repair depends on model output, validation errors, and run tracking. Phase 5/6 should preserve enough evidence for later repair work without pulling that behavior forward.

Phase 6A included arrays for `checkpoints`, `builds`, `validationEvidence`, reserved `generationRuns`, and internal `failedAttempts` from the start, but each record stayed thin. `GenerationRun` fields were reserved in the schema only during Phase 5/6; full run creation, cost tracking, telemetry views, failure analytics, and comparison behavior belong to Phase 8. The Phase 5/6 point was to prove the relationships early: checkpoints reference builds, builds reference validation evidence, failed attempts stay out of normal creator history, and future telemetry has a stable landing place without forcing a schema reshuffle.

The minimal Game Pack contract should be runtime-agnostic from day one while only implementing Phaser/top-down values in the POC. The schema should expose project-level concepts such as `runtimeKind`, `templateId`, `gameSpec`, `builds`, `checkpoints`, and `validationEvidence`, with Phaser-specific or top-down-specific details nested under runtime/template metadata instead of shaping the root project model.

Phase 6B started with IndexedDB as the first real persistence target because it proves save/reload inside the browser editor experience without forcing server storage decisions. Persistence access goes through a small repository boundary so the POC can later swap IndexedDB for a production database without rewriting Game Pack, checkpoint, validation, or editor orchestration code. JSON import/export can follow as a debugging and portability convenience, but IndexedDB is now the first durable POC store.

Phase 5 prep cleanup should be included in the Phase 5/6 taskboard only when it directly supports this vertical slice. Good candidates are the generated pack completion split if it blocks Game Pack schema work, shared test fixture builders if they reduce validation or persistence test drag, and mechanic config defaults only if first-playable validation needs normalized mechanic configs. General cleanup such as chat display splitting or runtime source bundling should stay out of the Phase 5/6 board unless it becomes a direct blocker.

The Phase 5/6 taskboard kept workflow status as the visible board grouping, with separate properties for `Parent Phase` and `Sub-slice`. `Parent Phase` supported Phase 5 and Phase 6 milestone reporting, while `Sub-slice` supported the execution sequence: `6A`, `5A`, `6B`, and `5B`. Tasks could carry both Phase 5 and Phase 6 in `Parent Phase` when they genuinely supported both milestones, but every task had one primary `Sub-slice` so execution order stayed clear.

The overall Phase 5/6 completion bar optimized for velocity. Completion required one successful first-playable project that saves, reloads, preserves validation evidence, and creates a recoverable checkpoint, plus a lightweight failure-state proof that broken drafts do not enter the normal play view. Broader fixture coverage for multiple failure classes was added as follow-up validation polish after the vertical slice was working.

Completed Phase 5/6 taskboard seed:

| Task | Parent Phase | Sub-slice |
| --- | --- | --- |
| Define minimal runtime-agnostic Game Pack schema | 5, 6 | 6A |
| Add thin records for builds, checkpoints, validation evidence, failed attempts, and reserved generation runs | 5, 6 | 6A |
| Create Game Pack factory/helpers for first playable project state | 5, 6 | 6A |
| Add first-playable validation orchestration against runtime events | 5 | 5A |
| Add lightweight runtime evidence checks for nonblank/player/input | 5 | 5A |
| Write validation evidence into Playable Build and checkpoint flow | 5, 6 | 5A |
| Add IndexedDB repository/service abstraction for Game Packs | 6 | 6B |
| Save and reload the first validated project/checkpoint | 6 | 6B |
| Implement append-only checkpoint restore | 6 | 6B |
| Add friendly blocked/failure state for non-playable drafts | 5 | 5B |
| Keep automated repair deferred but preserve repair-ready evidence | 5 | 5B |

Phase 5/6 completion statement: this vertical slice is complete for the POC. The editor can validate the known top-down Phaser draft, collect pre-runtime, runtime-boot, and browser self-report evidence, write that evidence into Game Pack records, create the first creator-facing checkpoint automatically, persist the validated pack to IndexedDB, reload it into `/editor`, preserve failed attempts outside normal creator history, show friendly blocked states for non-playable drafts, and restore older checkpoints through append-only lineage instead of destructive rewind.

The final Phase 5/6 implementation also corrected the restored-checkpoint reload behavior: successful validation now preserves a valid existing `currentCheckpointId`, including restored-forward checkpoints, and only falls back to the initial checkpoint when the pointer is missing or invalid. That keeps restore history stable across editor reloads and protects later checkpoints from disappearing from lineage.

Resolved Phase 3/4 shape:

- Mechanics should be explicit Game Spec entries even when starter specs include common defaults such as player movement or win/loss.
- Objectives should remain separate from mechanics. Objectives declare player-facing success, while mechanics provide the runtime behavior that makes the objective achievable and measurable.
- Active mechanics should live as top-level module entries that can target entities, scenes, regions, or objectives by stable ID.
- Mechanic Modules should be installable behavior units, not only labels or data definitions. The Mechanic Registry should map each active mechanic type to an installer/factory that receives a narrow runtime context plus the Game Spec mechanic entry.
- The core top-down template should own Phaser boot, iframe protocol, scene lifecycle, layout/static collision setup, starter entity tracking, and module orchestration. Mechanic Modules should own opt-in gameplay behavior and may return `update`/`dispose` hooks.
- The first module extraction should use a strict vertical-slice order: `player_movement` first as the install seam tracer bullet, then `pickup_collection`, then `enemy_chase`.
- The runtime should use a middle-path object ownership model: the core creates and tracks stable world substrate and spec-declared starter entities, while modules may create dynamic mechanic-owned objects through controlled helpers for lifecycle, collision, cleanup, and error reporting.
- Mechanic install/update/dispose failures should be handled defensively so a broken mechanic can be disabled and reported without crashing the editor. Deeper sandboxing and performance checks are required before AI-generated extension modules can be trusted like built-ins.
- The schema should support an objectives list from the start, while the first top-down template only needs to fully honor one primary active objective.
- Validation goals should remain separate from objectives so the system can ask both "what is the player trying to do?" and "what must be true for Sparkline to trust this draft as playable?"

## Phase 3/4 Closeout Remarks

Phase 4 can be closed as completed for the POC. The remaining cleanup notes have been carried forward into [Phase 5 Prep Notes](./phase-5-prep-notes.md) rather than keeping Phase 4 open.

What Phase 3/4 proved:

- The existing Canvas path and the new Phaser path can share the runtime adapter and iframe host Interface.
- A compact top-down Game Spec can configure the hand-authored Phaser template.
- Mechanics can be explicit Game Spec entries, bridged through the Mechanic Registry, and installed as external runtime Mechanic Modules.
- Built-in mechanics can use a narrow typed context instead of raw Phaser scene access.
- Mechanic-aware validation can catch missing targets, missing objectives, missing pickup coverage, unsupported mechanics, and unused authoring modules before runtime boot.
- Runtime failures now distinguish recoverable mechanic warnings from fatal runtime errors.
- A second valid fixture can prove a different mechanic combination without changing runtime code.
- The editor runtime panel can present validation errors, warnings, fatal runtime errors, loading, and mounted hosts without one component owning every runtime state.

Implementation findings that shifted the plan:

- `game-error` remained the right runtime transport. Instead of adding a separate `mechanic-disabled` event, recoverable mechanic failures became typed `game-error.issue` payloads.
- Invalid Game Spec handling needed to be data-shaped instead of import-time throwing. Fixture/template state now returns valid or invalid state so the editor can render a validation screen.
- Mechanic validation belongs with declarative registry metadata, not custom validator branches per mechanic. This keeps built-ins precise while preserving a future manifest shape for generated mechanics.
- Fixture authoring needed a catalog. The original single fixture grew into named valid fixtures, with `Crystal Spec Chase` as default and `Prism Relay Gauntlet` proving a no-enemy mechanic combination.
- The runtime core needed internal Modules before further extraction. The single public classic script stayed in place, but its Implementation is now split into runtime config, layout, entity, objective, mechanic lifecycle, host protocol, and scene boot factories.
- Mechanic authoring helpers belong on the existing runtime context. A separate public helper script would have added load-order surface without enough Leverage.
- Editor runtime display needed a view model. Runtime panel behavior is now derived in a pure Module while `useEditorSession` remains the state owner.

Phase 5/6 used the carried prep notes to connect validation, evidence, checkpoints, failed attempts, and lightweight persistence. Remaining prep-note items that did not directly support that vertical slice should stay as backlog polish instead of reopening Phase 5/6.

## Phase 5/6 Closeout Remarks

Phase 5 and Phase 6 can be closed as completed for the POC. The work proved the smallest durable Game Pack loop: a trusted top-down Phaser draft can be mounted, validated as first-playable, recorded as a build/checkpoint, saved locally, reloaded, and restored without losing later history.

What Phase 5/6 proved:

- A runtime-agnostic Game Pack shape can hold thin `PlayableBuild`, `VersionCheckpoint`, `ValidationEvidence`, `failedAttempts`, and reserved `generationRuns` records without forcing a production storage decision.
- First-playable validation can combine schema/spec checks, runtime boot status, and runtime-emitted browser evidence for nonblank render, player visibility, and input response.
- Successful validation can automatically create the first creator-facing checkpoint, making the first playable moment recoverable without a separate save action.
- Failed pre-runtime drafts can be preserved as internal failed attempts without creating normal playable builds or creator-facing checkpoints.
- Runtime-mounted failures can preserve build-linked failed attempts and repair-ready validation receipts while leaving automated repair deferred.
- IndexedDB is sufficient as the first POC persistence target when hidden behind the Game Pack repository boundary.
- The editor can reload the first validated Game Pack and remount it through the same Phaser runtime path.
- Checkpoint restore should be append-only. Restoring an older checkpoint creates a restored-forward checkpoint and keeps later checkpoints visible.
- The current checkpoint pointer must be treated as lineage state. Validation writes should preserve any valid current checkpoint and only fall back to the initial checkpoint when no valid pointer exists.
- Friendly blocked states are now a distinct first-playable validation surface, separate from older Game Spec validation failures and runtime boot errors.

Implementation findings that shifted the plan:

- Validation and persistence needed to land together. Writing evidence without reload made the Game Pack model hard to trust, while persistence without validation evidence would have saved projects without proving playability.
- Browser/runtime evidence was more useful than inferred checks alone. The POC should continue preferring explicit runtime receipts whenever the iframe can report them cheaply.
- Restore semantics belong in Game Pack lineage helpers, not React/editor code. The editor should consume current lineage state, while the domain layer owns checkpoint identity and append-only behavior.
- The IndexedDB repository boundary is already paying for itself. Future server persistence should target that abstraction rather than thread storage concerns through editor components.
- Automated repair should remain deferred until Phase 7/8 provide real generation attempts and telemetry receipts. Phase 5/6 now preserves enough evidence for that future loop.
- The main architectural cleanup opportunity after Phase 5/6 is orchestration thickness: validation gate, runtime session, persistence, and failure-surface logic now have good seams, but future phases should avoid letting editor React code become the owner of Game Pack behavior.

Recommended Phase 7 starting posture:

- Treat Phase 7 as prompt-to-Game-Spec generation, not as another validation architecture phase.
- Reuse Phase 5/6 validation as the acceptance bar for generated specs.
- Feed exact validation errors back into bounded repair attempts, but record those attempts as generation/repair telemetry rather than hidden retries.
- Keep generation output spec-only for the trusted top-down template until the structured generation loop is reliable.
- Promote only the Phase 5/6 domain seams that stayed stable: Game Pack schema concepts, lineage helpers, validation evidence records, runtime adapter protocol, and the repository boundary.

Backlog polish to carry forward:

- Add creator-facing checkpoint history UI once there is enough editing/generation activity to make history worth browsing.
- Add JSON import/export for debugging and portability after IndexedDB remains stable through Phase 7.
- Add a clearer internal validation evidence inspector for developers and future support flows.
- Split any remaining editor orchestration when Phase 7 generation/repair starts making the runtime session too wide again.
- Revisit build/checkpoint identity once edits create multiple accepted playable builds, because the POC currently optimizes around the first validated build plus append-only restore lineage.

## Milestones

### Milestone 1: Runtime Adapter Foundation

Goal: make the editor talk to runtime adapters instead of directly to Canvas-specific internals.

Deliverables:

- Define a runtime adapter interface for creating/mounting playable game documents.
- Wrap the existing Canvas path in the adapter shape.
- Define the first version of the editor/runtime message contract.
- Keep current behavior working through the adapter.

Acceptance criteria:

- Existing generated Canvas games still boot in the iframe.
- Editor code has a clear adapter boundary for runtime-specific behavior.
- Adapter responsibilities are documented in code or nearby docs.

Proves:

- The POC can support Canvas and Phaser as internal runtime adapters without making users choose between them.

Likely promotable to v1:

- Runtime adapter types.
- Shared runtime protocol primitives.

### Milestone 2: Hand-Authored Phaser Template In Iframe

Goal: prove Phaser can run inside the existing sandbox path before involving AI.

Deliverables:

- Add Phaser dependency and a minimal top-down template game.
- Mount the hand-authored Phaser game through the runtime adapter.
- Emit ready/error runtime events.
- Support reset at minimum.
- Optionally support screenshot or basic observation if low effort.

Acceptance criteria:

- One known Phaser top-down game boots in the iframe.
- The player is visible and keyboard controls respond.
- The app can distinguish ready vs error states.
- No AI tokens are required to test the runtime path.

Proves:

- Phaser can be the POC's new serious runtime path.
- The iframe boundary remains viable for Phaser.

Likely promotable to v1:

- Phaser adapter shell.
- First runtime protocol implementation.
- Top-down template core patterns.

### Milestone 3: Compact Game Spec Schema

Goal: define the structured recipe that configures the Phaser template.

Deliverables:

- Add a compact Game Spec schema in code.
- Split core spec from top-down template-specific spec.
- Include stable IDs for entities, mechanics, assets, objectives, scenes, and config blocks.
- Represent generic entity roles such as player, enemy, pickup, projectile, obstacle, boss, and hazard.
- Represent one scene/arena plus basic layout primitives.
- Model objectives separately from mechanics and from validation goals.
- Support an objectives list in schema, with one primary active objective for the first top-down template.
- Keep active mechanics as top-level module entries that reference entities, scenes, regions, or objectives by stable ID.
- Keep validation goals as a separate list of system checks that can reference objective IDs when needed.

Acceptance criteria:

- A known Game Spec can configure the hand-authored top-down template.
- Invalid specs fail validation before reaching the runtime.
- The schema leaves room for versioned extensions without making the core loose.
- A known spec can express objective, mechanics, and validation goals as separate concerns without ambiguity.

Proves:

- The POC can create games through structured data rather than arbitrary code.

Likely promotable to v1:

- Game Spec schema.
- Entity/stable-ID conventions.
- Layout primitive model.

### Milestone 4: Mechanic Registry And Modular Mechanics

Goal: make top-down game behavior modular and opt-in through Game Spec.

Deliverables:

- Add a Mechanic Registry.
- Implement a small initial module set over time: player movement, enemy chase, pickups, health/damage, score/timer, win/loss, simple obstacles.
- Extract the first built-in top-down modules structurally before behavior polish: `player_movement`, then `pickup_collection`, then `enemy_chase`.
- Treat Mechanic Modules as installable behavior units with installer/factory functions, optional `update`/`dispose` hooks, and a narrow runtime context.
- Keep the top-down template core responsible for Phaser boot, iframe protocol, scene lifecycle, layout/static collision, starter entity tracking, and module orchestration.
- Allow modules to create dynamic mechanic-owned objects only through controlled runtime helpers so ownership, collision registration, cleanup, and error reporting remain centralized.
- Let the Game Spec list active mechanics and configs.
- Keep common defaults such as player movement or win/loss explicit in starter specs rather than hidden in template assumptions.
- Add `pickup_collection` explicitly to the known top-down Game Spec fixture before the runtime installs pickup/scoring behavior.
- Make mechanic configs target entities, scenes, regions, or objectives by stable ID where needed.
- Add basic validation checks per mechanic where practical.
- Keep unused modules out of a given game config.
- Keep pickup spawn quality improvements and enemy pathfinding/obstacle-aware steering out of the first extraction task; handle those as follow-up behavior-quality work after the module seam exists.

Acceptance criteria:

- A Game Spec can turn mechanics on/off and tune values.
- Mechanics map from spec entries to code through the registry.
- The authored top-down runtime installs behavior from declared active mechanics instead of relying on hidden chaser-game assumptions.
- A missing active mechanic should not silently install its behavior.
- Mechanic installation, update, and disposal failures should be reported gracefully without crashing the editor.
- Basic mechanic validation can detect obvious missing/broken behavior.
- The first registry surface stays game-level and inspectable instead of hiding behavior inside entity-local blobs.

Proves:

- The top-down template can be reliable without becoming hardcoded and inflexible.

Likely promotable to v1:

- Mechanic Registry.
- Initial Mechanic Module interface.
- First stable top-down modules.

### Milestone 5: First-Playable Validation

Goal: protect the creator from seeing broken drafts as playable games.

Status: completed for the Phase 5/6 POC slice.

Deliverables:

- Define the first-playable validation bar.
- Check boot success, fatal runtime errors, nonblank render, player visibility, control response, and basic objective presence.
- Store Validation Evidence for successful builds.
- Show a friendly failure state for broken drafts, backed by repair-ready validation details.

Acceptance criteria:

- Blank or non-booting games are blocked from the normal playable view.
- Validation result is saved with the build/checkpoint data.
- Failure state gives the creator clear next actions.

Proves:

- The POC can distinguish "generated something" from "created a playable draft."

Likely promotable to v1:

- Validation evidence model.
- First-playable validation checks.
- Failure-state UX language/patterns.

### Milestone 6: Game Pack, Checkpoints, And Lightweight Persistence

Goal: test the future Game Pack model without committing to production storage yet.

Status: completed for the Phase 5/6 POC slice with IndexedDB as the first durable browser store.

Deliverables:

- Define a runtime-agnostic Game Pack shape in code.
- Separate Project, Version Checkpoint, Playable Build, Edit Record, Asset Record, and GenerationRun concepts.
- Add lightweight persistence using IndexedDB, local storage, JSON-backed dev storage, local file import/export, or a minimal DB.
- Save and reload generated projects/checkpoints.

Acceptance criteria:

- A project can be saved and reloaded.
- A Version Checkpoint is distinct from a Playable Build.
- Restoring an older checkpoint creates a new checkpoint rather than deleting history.
- Failed generation attempts can be stored internally without cluttering creator history.

Proves:

- The POC can honestly test versioned game projects.

Likely promotable to v1:

- Game Pack schema concepts.
- Checkpoint/build distinction.
- Edit Record model.

Likely rewrite for v1:

- Actual persistence backend and product project storage.

### Milestone 7: AI Prompt-To-Spec Generation

Goal: add AI generation to the Phaser path only after the runtime/spec path works.

Deliverables:

- Define strict prompt-to-spec structured output schema.
- Route model calls through a small task alias such as `spec_generation.primary`.
- Validate schema and semantic references.
- Repair invalid model output with exact validation errors and a small retry cap.
- Fall back to simpler spec or friendly failure state if repair fails.

Acceptance criteria:

- AI can generate valid Game Spec/config for the top-down template.
- Invalid model output never reaches the runtime unchecked.
- Repair attempts are bounded and recorded.
- The generated spec can produce a playable draft through the trusted template.

Proves:

- AI can configure the template reliably before Sparkline allows AI-generated source extensions.

Likely promotable to v1:

- Prompt-to-spec schema.
- Validation/repair loop structure.
- Model Router task alias pattern.

### Milestone 8: GenerationRun Telemetry

Goal: record enough evidence to understand whether the generation architecture is improving.

Deliverables:

- Add GenerationRun records for generation, edit, and repair attempts.
- Track prompt/request, model/provider/task route, template/mechanics used, timestamps/duration, schema validation, build result, validation result, repair attempts, failure class, approximate cost, and created checkpoint/build IDs.
- Add a simple internal view, log, or export path for reviewing runs.
- Use OpenGame's `result.json` receipt pattern as a reference for compact per-attempt receipts, adapted to Sparkline's Game Pack, Validation Evidence, Playable Build, and Version Checkpoint relationships.

Acceptance criteria:

- Each generation attempt leaves a usable receipt.
- Failure classes can be compared over time.
- Approximate model cost is visible where possible.
- Telemetry informs readiness without acting as a hard gate.

Proves:

- The POC can measure creation-tech progress instead of relying only on vibes.

Likely promotable to v1:

- GenerationRun model.
- Failure class taxonomy seed.
- Cost/duration tracking approach.

Later-phase reference:

- OpenGame's Template Skill evolution loop is a useful reference for a later template/mechanic-learning phase, but it is not part of Phase 5/6. Phase 5/6 should preserve enough Game Spec, build, checkpoint, validation, and failed-attempt evidence for that future analysis; Phase 8 telemetry can start making the repeated-pattern data reviewable.

### Milestone 9: Basic Creator Editing Loop

Goal: prove the first version of iterative creation.

Deliverables:

- Let small edits update Game Spec first.
- Produce an Edit Record and creator-language what-changed summary.
- Create a Version Checkpoint for accepted edits.
- Rebuild/reload for structural edits.
- Optionally live-patch narrow safe edits such as speed or color.

Acceptance criteria:

- A creator can make at least one meaningful edit to a generated Phaser game.
- The edit updates Game Spec before runtime output.
- The edit produces a checkpoint summary.
- The previous version remains recoverable.

Proves:

- Sparkline can move beyond first generation into editable game projects.

Likely promotable to v1:

- Edit Record model.
- Checkpoint summary pattern.
- Spec-first edit flow.

### Milestone 10: Simple Asset Records And Replacement

Goal: test asset identity/provenance without slowing down first playable.

Deliverables:

- Let first playable use simple placeholders/shapes.
- Add simple Asset Records for generated/template/uploaded assets.
- Let asset replacement update Asset Records and Game Spec refs before runtime code.
- Track source type, role, basic license status, AI disclosure, and usage.

Acceptance criteria:

- A player/enemy/pickup asset can be replaced through the project model.
- Asset identity is not hidden as a hardcoded runtime path.
- Unknown/restricted asset states can exist in private drafts.

Proves:

- Asset provenance can be introduced early without blocking the first magic moment.

Likely promotable to v1:

- Asset Record schema seed.
- Asset replacement flow through Game Spec.

## POC-To-V1 Code Promotion Strategy

Before Sparkline v1 implementation, classify POC modules as:

- **Promote:** stable schemas, runtime adapters, Phaser template code, Mechanic Modules, validation helpers, Agent Contract/runtime protocol, Game Spec utilities, GenerationRun model.
- **Rewrite:** product UI, persistence/storage integration, auth/project management, hosting/deployment integration, production UX.
- **Discard:** debug shortcuts, throwaway experiments, POC-specific state hacks, temporary provider wiring, and code that only existed to test an idea.

Transition rule: promote proven architecture, not POC scaffolding.

Deferred learning loop: a later POC phase may inspect repeated successful Game Specs, builds, validation evidence, edit records, failed attempts, and GenerationRun receipts to identify candidates for promoted Mechanic Modules or template families. This should be treated as a deliberate later capability inspired by OpenGame's Template Skill, not as hidden Phase 5/6 scope.

## Open Decisions

These should not block the first milestones, but they need decisions before or during v1 planning:

- Exact first-playable timing targets.
- Exact model/provider defaults for spec generation and repair.
- Whether Phaser dependency is bundled directly into the app or isolated in a template/runtime package.
- How much of the runtime protocol is implemented in the POC vs reserved for v1.
- Whether generated extension modules are attempted in the POC or deferred until after spec-only generation proves reliable.
- Which later POC phase, if any, introduces an OpenGame-inspired template/mechanic promotion loop over completed projects and validation evidence.
- Production database, auth, object storage/CDN, queue/worker, observability, search, and moderation stack.

## Next Immediate Implementation Slice

When moving into Plan Mode for coding after Phase 5/6, start with Milestone 7:

> Generate compact top-down Game Spec/config data through a bounded AI prompt-to-spec path, validate it with the Phase 5/6 first-playable bar, and record generation/repair attempts without allowing invalid output to reach the runtime unchecked.

This is the right next slice because the trusted runtime, schema, validation evidence, checkpoint, and local persistence path now exist. Phase 7 should spend model tokens only after the deterministic path can prove whether generated specs are playable.
