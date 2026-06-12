# AI-Cade POC Implementation Plan

Draft status: implementation roadmap with Phase 3/4, Phase 5/6, and Milestone 7 implementation notes. This document turns the Sparkline Architecture page into a build sequence for the AI-Cade POC. The POC is a proving ground for Sparkline's game generation and creation technology, not the full Sparkline community product.

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

Related Sparkline Research Notes:

- [Source Code Research: OpenGame Patterns for Phase 7 Spec Generation - 2026-05-26](https://www.notion.so/36c9db009ee5813493a3ed86f7b57245)

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

Phase 5B should show friendly failure states with stored validation evidence and clear next actions, but should not include automated repair attempts yet. Automated repair belongs after prompt-to-spec generation can provide model output and validation errors; full repair telemetry can arrive later. Phase 5/6 should preserve enough evidence for later repair work without pulling that behavior forward.

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
- Feed exact validation errors back into bounded repair attempts, expose compact attempt summaries immediately, and later record those attempts as generation/repair telemetry rather than hidden durable history.
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

Goal: generate a validated top-down Phaser Game Spec from the main prompt flow and prove it can become a playable draft without allowing invalid AI output into the runtime.

Deliverables:

- Add a new task-named Spec Generation service and API route for Phaser/top-down generation rather than branching the legacy `/api/starter-project` response shape.
- Route the homepage prompt flow to the new Spec Generation API when the editor runtime is Phaser, while keeping Canvas mode on the existing starter-project path until it is later migrated.
- Keep service language provider-neutral around a task alias such as `spec_generation.primary`, while reusing the current OpenAI key, keyword, and model input plumbing for the POC.
- Add a compact top-down Spec Generation Guide, modeled after OpenGame's template capability docs but expressed as AI-Cade's allowed `TopDownGameSpec`, mechanics, stable IDs, references, layout primitives, placeholder assets, and objective rules.
- Ask AI for a complete but narrow `TopDownGameSpec`: one scene, `template_top_down`, known built-in mechanics, stable ID references, placeholder/template assets, modest layout data, and exactly one primary objective.
- Prompt with OpenGame-inspired capability-integrity rules: no Phaser source, no GDD, no unsupported mechanics, no unsupported fields, no unresolved references, and no behavior that cannot be represented in the current spec/registry contract.
- Start with `player_movement` and `pickup_collection`, plus at most one early variation mechanic such as `enemy_chase` or `hazard_contact`.
- Validate AI output on the API/server path with schema, semantic reference, and mechanic validation before returning it to the editor.
- Return a validated spec plus generation metadata, or a structured failure with creator-friendly copy and developer/repair validation details.
- Keep generated specs ephemeral before first-playable validation passes; durable IndexedDB persistence, Version Checkpoints, and durable Validation Evidence are allowed only after the generated draft passes the first-playable bar. Full GenerationRun telemetry remains Milestone 8 scope.
- Build deterministic validation and friendly rejection before AI-assisted repair, then allow one bounded repair attempt using the invalid candidate spec plus exact validation errors.
- Keep repair-attempt visibility compact and pre-telemetry: repaired successes may show that automatic repair happened, repaired failures may show repair-attempt details, but normal UI must not expose raw invalid candidate specs.
- Distinguish Phaser fixture/test mode from Phaser AI generation mode. Hardcoded fixtures are explicit runtime-test inputs, not fallback content for failed AI generation.
- Use plain creator-facing status copy such as designing the game, checking the game plan, building the playable draft, and testing that it loads.
- Adapt the editor runtime plan so a successful generated spec can become the active runtime source and pass through the existing Phaser template and first-playable validation path.
- Keep OpenGame's broader GDD, asset-pack, tilemap, Template Skill, and Debug Skill evolution patterns as later references, not first-spine Phase 7 scope.

Milestone 7 status after the first spine tasks:

- The first server boundary is implemented as the task-oriented `/api/spec-generation` route and `spec_generation.primary` task route, separate from the legacy `/api/starter-project` path.
- The provider request now sends a strict OpenAI-compatible tool schema derived from the authoritative top-down Zod schema, then narrowed for the first Phaser generation slice. The normalizer requires all object properties, removes unsupported strict-schema keywords such as `propertyNames` and `default`, and keeps provider schema drift guarded by tests.
- The first live generation returned a mostly well-shaped `TopDownGameSpec` candidate and failed only at mechanic validation, proving that invalid model output now reaches the intended structured validation boundary instead of failing at tool/schema setup.
- Mechanic entity references were renamed from `targetIds` to `entityIds` as a strict contract break. The provider schema, validator paths, fixtures, runtime lookup, and generation guide now use `mechanics[].entityIds`.
- The generation guide now explicitly separates mechanic `entityIds` from `assetIds`, including the first built-in mechanic rules for `player_movement`, `pickup_collection`, `enemy_chase`, and `hazard_contact`.
- The debug provider can simulate deterministic success and failure modes in development, with operator-facing usage documented in `docs/debug-spec-generation-provider.md`.
- Successful Phaser Spec Generation responses first enter active generated-spec editor state, then persist as durable Game Packs only after first-playable validation passes.
- Generated specs mount through the trusted Phaser template and carry a `generated-spec` first-playable validation source. Runtime-ready alone is not enough; generated drafts stay blocked until first-playable evidence passes.
- Generated specs that pass first-playable validation now save through the existing local Game Pack repository with a creator-facing initial checkpoint, validation evidence, playable build, and compact generated-spec metadata. Failed generated specs and failed first-playable attempts do not create creator-facing checkpoints.
- Manual first-playable QA now has reliable breakpoint recipes for forcing each browser evidence failure: `nonblank_render`, `player_visible`, and `input_response`. Prompt-only requests such as "make the player invisible" are not reliable validation triggers because the trusted Phaser template owns player rendering and the runtime check currently measures player body plus viewport presence, not visual opacity.
- Restored Game Packs were rechecked against the Phaser runtime plan. A persisted pack with a creator-facing checkpoint loads from IndexedDB, parses its saved top-down Game Spec, creates a Phaser template, and mounts with `source: "restored-game-pack"` before falling back to the fixture path.
- Active generated specs now live in editor session state with their `runtimeKind`, generation metadata, and validated spec, so reset can remount the same generated draft without falling back to a fixture or losing the chat/editor summary.
- The Spec Generation Guide now distinguishes `mechanics[].entityIds`, `mechanics[].assetIds`, and `mechanics[].regionIds` more sharply. In particular, `regionIds` may reference only `scene.layout.regions` IDs; pickup zone and spawn zone IDs must stay in their own layout fields, with `regionIds: []` when no named region applies.
- The shared iframe host now treats runtime boot as a runtime-document event, not a React callback-change event. It installs the `message` listener before attaching iframe `srcdoc` so fast Phaser `game-ready` events are not missed, and it only reattaches `srcdoc` when the actual runtime document changes.
- The bounded AI repair loop now makes at most one repair provider retry after the first candidate fails schema, semantic, or mechanic validation. It preserves `attemptCount`, marks repaired successes with `repairStatus: "repaired"`, and carries compact `repairAttempts` summaries for UI/debug receipt use.
- Repaired success copy in the generated project log is intentionally creator-friendly and does not show validation issue details. It uses one AI chat bubble: `Generated a playable project plan from the prompt after {num} automatic repair(s).`
- Repaired failure receipts can show that automatic repair was attempted once and stopped, plus compact path/message summaries, while normal UI still avoids raw invalid candidate JSON.
- Provider request failures before any candidate exists remain distinct from validation failures and keep the existing model-generation copy: `I couldn't design a game plan from that prompt. Please try again.`

Acceptance criteria:

- In Phaser AI generation mode, the main homepage prompt calls the new Spec Generation path instead of the Canvas starter-project endpoint.
- A successful prompt returns a server-validated top-down Game Spec and mounts it through the trusted Phaser template.
- First-playable validation proves the generated draft boots, renders nonblank output, shows the player, responds to input, and has a basic objective before the editor treats it as playable.
- Restored saved Game Packs still remount through the Phaser runtime plan and re-run first-playable validation as restored state.
- A deterministic invalid-output test stub is rejected with structured validation issues and a friendly error, with no silent fallback to a hardcoded fixture.
- The first invalid-output suite covers OpenGame-inspired high-frequency failure classes translated into AI-Cade terms: wrong template id, invalid stable IDs, unsupported mechanic types, missing entity/asset/objective references, missing pickup-zone coverage, and missing or duplicate primary objectives.
- The generated runtime status must leave "Booting runtime..." when the iframe emits `game-ready`, and parent editor re-renders must not repeatedly reload the iframe canvas or emit duplicate boot/loading statuses.
- The hardcoded top-down fixture remains available only through explicit fixture/test mode.
- AI-assisted repair is bounded to one retry and must preserve honest failure when the repaired candidate still fails validation.

Proves:

- AI can configure the trusted top-down Phaser template reliably enough to produce a validated playable draft before Sparkline allows AI-generated source extensions.
- Sparkline can reject invalid AI specs honestly without masking failure behind runtime fixtures.

Likely promotable to v1:

- Derived prompt-to-spec provider schema aligned with the authoritative validation schema.
- Server-side validation boundary for AI output.
- Structured validation issue payload for bounded repair and later telemetry.
- Model Router task alias pattern.
- Fixture/test versus AI-generation source-mode distinction.

Likely follow-up after the first Milestone 7 spine:

- Add a dev-only first-playable evidence failure switch so manual QA can force `nonblank_render`, `player_visible`, and `input_response` failures without depending on browser breakpoints or prompt steering.
- Improve creator-facing validation-failure copy beyond the current repair receipt so mechanic/schema failures do not tell the user to "try a simpler prompt" when the prompt was reasonable.
- Migrate Canvas mode toward the same Spec Generation architecture and deprecate the legacy starter-project endpoint.
- Revisit OpenGame's Template Skill and Debug Skill concepts only after real GenerationRun receipts, successful specs, failed attempts, and validation evidence exist to mine.

OpenGame research findings to apply during Milestone 7:

- Borrow capability-bounded prompting from OpenGame's `template_api.md` and `generate_gdd` flow, but collapse it into a strict `TopDownGameSpec` contract instead of adding a separate GDD.
- Treat `TopDownGameSpec` as the only first-spine generation artifact. Do not generate Phaser code, config files, tilemap JSON, asset packs, or a persisted Game Pack in the first server slice.
- Defer archetype classification. Phase 7 is fixed to top-down Phaser through the runtime mode; OpenGame's physics-first classifier becomes useful later when multiple template families are active.
- Shape failure payloads with a small stage vocabulary inspired by OpenGame Debug Skill, such as `model_generation`, `schema_validation`, `semantic_validation`, `mechanic_validation`, and later `repair`.
- Keep friendly creator copy separate from developer/repair details so invalid output can be honestly rejected now and reused by a bounded repair prompt later.
- Use placeholder/template asset records only. OpenGame's asset-pack and tilemap tools reinforce strict key/reference contracts, but their file-generation workflow belongs after the spec-only path works.
- Keep Template Skill style learning loops out of Phase 7. Later phases can inspect repeated successful Game Specs, validation evidence, failed attempts, and GenerationRun receipts for mechanic/template promotion candidates.

Resolved implementation decisions from current Milestone 7 work:

- The Phaser Spec Generation path uses the task-oriented route `/api/spec-generation`.
- Success returns a validated top-down spec plus lightweight generation metadata; failure returns a small stage vocabulary, validation issues, attempt count, and developer/repair details without falling back to a fixture.
- The first model tool/schema contract lives in `src/service/spec-generation/spec-generation-schema.ts`, but it is now derived from the authoritative top-down Zod schema instead of being fully hand-authored. The provider-specific layer is a narrowing/normalization pass, not a separate source of truth.
- Pre-telemetry metadata stays thin until Milestone 8: task route, attempt count, optional `repairStatus`, and compact `repairAttempts` summaries for the current UI/debug receipts.
- Phaser mode is the default runtime path; `NEXT_PUBLIC_AICADE_EDITOR_RUNTIME=canvas2d` keeps Canvas mode on the legacy starter-project route.
- Dev-only debug generation uses `AICADE_DEBUG_SPEC_GENERATION_SUCCESS` and `AICADE_DEBUG_SPEC_GENERATION_FAILURE`, while production fails closed if those flags are set.
- Deterministic normalization is allowed only for provider schema compatibility before generation. Candidate specs returned by the model are validated, then at most one explicit repair attempt is made; unrepaired failures still fail honestly.
- The compact Spec Generation Guide stays aligned with the Zod schema and Mechanic Registry by importing shared constants and registered mechanic types, then documenting the few intentional first-slice narrowings.
- Mechanic reference fields should stay semantically narrow: `entityIds` for entities, `assetIds` for assets, and `regionIds` for `layout.regions` only. Collection placement should be expressed through pickup asset references plus pickup-zone layout coverage, not by putting pickup zone IDs in `regionIds`.
- Active generated specs are ephemeral until first-playable validation passes. After a pass, the resulting Game Pack is saved locally with compact generated-spec metadata and can restore on reload through `source: "restored-game-pack"`.
- Restored Game Pack mounting works for saved Phaser packs created by the validated fixture/restored path and by generated Phaser specs that passed first-playable validation.
- First-playable failure simulation should target runtime evidence directly. The spec prompt may include validation-error suggestions for operators, but the trusted template does not currently expose spec-level player visibility controls that can guarantee a `player_visible` failure.
- Iframe `srcdoc` attachment is now an idempotent runtime-document mount step. The runtime host may update callback refs during React re-renders, but callback-only changes must not reboot the iframe or reset the runtime status.
- The first golden prompt for smoke testing remains: "Make a simple top-down arcade game where the player moves around a small arena, collects coins, avoids one chasing enemy, and wins after collecting all coins."

Remaining implementation questions for later Milestone 7 tasks:

- Should generated specs be recoverable through URL or session state before first-playable validation has created durable local persistence?
- How much homepage copy should change when the app is in Phaser AI generation mode?
- Which additional invalid stub cases should be added after the current debug-provider failure modes?

### Milestone 8: GenerationRun Telemetry

Goal: record enough evidence to understand whether the generation architecture is improving.

Resolved Phase 8 decisions from the planning grill:

- A `GenerationRun` represents one AI-backed creator-intent operation, such as generating from a prompt, editing an existing game, or repairing a failed draft. It is not one record per provider call.
- Nested attempt receipts capture the initial provider call and any bounded repair calls, including per-call duration, cost inputs, validation issues, and failure evidence.
- Purely local rebuilds, restores, and validation retries do not create top-level `GenerationRun` records unless they are part of an AI-backed operation. They remain `Playable Build`, `Validation Evidence`, checkpoint, or related outcome records that can be linked from a run.
- All AI-backed operations should leave receipts, including schema failures, mechanic-validation failures, provider errors, timeouts, cancelled runs, repaired successes, and repaired failures.
- Failed pre-project AI operations should persist in a separate internal telemetry store rather than forcing failed `Game Pack` records into existence.
- `Game Pack` persistence remains reserved for successful playable drafts and later project-backed operations; when a run creates or modifies a durable project, link it to the relevant `Game Pack`, `Playable Build`, `Validation Evidence`, or `Version Checkpoint` records.
- The first telemetry store should be local IndexedDB-first, behind a repository boundary, matching the POC's lightweight persistence approach.
- Store raw prompt text and successful validated specs, but default invalid model outputs to compact structured issue/candidate summaries rather than durable raw invalid JSON.
- Use a two-layer failure vocabulary: technical `stage` for where the operation failed, and comparable `failureClass` for trend review.
- Require `failureClass` for failed, cancelled, timed-out, or repaired-but-still-failed runs. Successful runs leave `failureClass` absent.
- Represent a repaired success as one successful `GenerationRun` with repair status and nested attempt receipts, not as a failed run followed by a separate successful run.
- The first review surface should be a developer-facing JSON export or log, not a polished analytics dashboard.
- Cost tracking should be best effort: store usage metadata and pricing inputs when available, compute approximate cost when safe, and allow cost to be absent when unavailable.
- The first implementation should instrument the current Phaser Spec Generation path before retrofitting legacy Canvas starter-project telemetry or future edit flows.
- Create a correlation ID when the AI-backed operation starts and pass it through server generation, client validation, playable builds, checkpoints, and telemetry. Client-side ID creation is acceptable for the POC; v1 should likely mint the canonical run ID server-side.
- Create the receipt when the operation starts, update it as generation, validation, mounting, build, and first-playable validation progress, and finalize it only after the operation reaches a terminal status.

Deliverables:

- Expand the placeholder `GenerationRun` schema into a receipt model for AI-backed creator-intent operations, with nested attempt receipts for provider calls and bounded repair.
- Add a local IndexedDB-backed telemetry repository that can persist pre-project failed runs separately from `Game Pack` project history.
- Track prompt/request, model/provider/task route, template/mechanics used, timestamps/duration, schema validation, build result, validation result, repair attempts, failure stage, failure class, approximate cost, and created checkpoint/build IDs.
- Propagate a run correlation ID through Phaser Spec Generation, client mounting, first-playable validation, and any created build/checkpoint/evidence records.
- Store raw prompt text and successful validated specs, but default invalid model outputs to compact structured issue/candidate summaries rather than durable raw invalid JSON.
- Add a simple developer-facing JSON export or log for reviewing runs before investing in a polished analytics dashboard.
- Use OpenGame's `result.json` receipt pattern as a reference for compact per-attempt receipts, adapted to Sparkline's Game Pack, Validation Evidence, Playable Build, and Version Checkpoint relationships.

Likely implementation sequence:

1. Define the `GenerationRun` receipt schema, attempt receipt shape, status lifecycle, failure-stage/failure-class taxonomy, cost estimate shape, and relationship fields.
2. Add a local telemetry repository/export path that can save running, partial, completed, and pre-project runs independently of `Game Pack` persistence.
3. Instrument the Phaser Spec Generation flow from prompt submission through server result/failure, bounded repair metadata, runtime mounting, and first-playable validation.
4. Link successful runs to created Game Pack, Playable Build, Validation Evidence, and Version Checkpoint records once generated drafts become durable project state.
5. Add a simple developer-facing JSON review/export surface for recent runs and failure-class inspection.

Acceptance criteria:

- Each generation attempt leaves a usable receipt.
- Pre-project failures persist as telemetry without creating failed Game Packs.
- Repaired successes appear as one successful run with nested failed-and-repair attempt evidence.
- Failure classes can be compared over time.
- Approximate model cost is visible where possible.
- Missing cost data does not fail or block telemetry.
- Telemetry informs readiness without acting as a hard gate.

Proves:

- The POC can measure creation-tech progress instead of relying only on vibes.

Likely promotable to v1:

- GenerationRun model.
- Failure class taxonomy seed.
- Cost/duration tracking approach.

Follow-up polish:

- Add an environment-flagged debug mode for local investigation that can opt into storing raw invalid candidate payloads after the main Phase 8 telemetry path is working.

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

## Current Immediate Implementation Slice

Milestone 7 is now underway:

> Generate compact top-down Game Spec/config data through a new Phaser Spec Generation path, validate AI output on the server, mount the validated spec through the trusted Phaser template, and prove first-playable behavior in the editor without allowing invalid output or hardcoded fixtures to mask generation failure.

This is the right current slice because the trusted runtime, schema, validation evidence, checkpoint, and local persistence path now exist. Milestone 7 should spend model tokens only after the deterministic path can prove whether generated specs are playable.

Current implementation sequence:

1. Completed: start server-first with TDD by locking down the Spec Generation service/API route contract, structured success/failure responses, strict provider schema, compact guide, and server validation.
2. Completed: make mechanic entity references explicit with `mechanics[].entityIds` and remove the ambiguous `targetIds` contract.
3. Completed: add development-only debug success/failure providers and document manual QA usage.
4. Completed: route the main homepage prompt flow to the Spec Generation API in Phaser AI generation mode while keeping Canvas mode on the legacy starter-project route.
5. Completed: store the validated generated spec as active ephemeral editor state.
6. Completed: build and mount the Phaser template from the generated spec, then gate generated drafts on first-playable validation before treating them as playable.
7. Completed: clarify generation-guide reference rules after real validation failures, especially the distinction between entity, asset, region, pickup-zone, and spawn-zone IDs.
8. Completed: harden the shared iframe runtime host so generated Phaser drafts do not get stuck on "Booting runtime..." and do not reboot on callback-only editor re-renders.
9. Completed: confirm restored saved Phaser Game Packs still load through the Phaser runtime plan and stay distinct from active ephemeral generated specs.
10. Completed: document reliable manual first-playable evidence failure simulation and note that prompt steering alone is not enough to force runtime evidence failures.
11. Completed: add one bounded AI repair attempt for invalid generated specs and surface compact repair-attempt visibility in success chat/failure receipts without exposing raw invalid candidate specs in normal UI.
12. Completed: persist successful generated playable drafts as durable Game Packs after first-playable validation passes, while keeping failed drafts out of creator-facing checkpoint history.
13. Keep OpenGame Template Skill, Debug Skill, asset-pack, and tilemap-generation ideas deferred unless they become explicit later-phase work.
