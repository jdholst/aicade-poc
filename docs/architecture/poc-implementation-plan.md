# AI-Cade POC Implementation Plan

Draft status: planning draft. This document turns the Sparkline Architecture page into a build sequence for the AI-Cade POC. The POC is a proving ground for Sparkline's game generation and creation technology, not the full Sparkline community product.

## Purpose

The POC should prove that Sparkline can create durable, editable, validated game projects using a Phaser-based runtime path before Sparkline v1 is built.

The POC should answer these questions:

- Can the current Canvas runtime path and a new Phaser runtime path share a common editor host?
- Can a compact Game Spec configure a trusted top-down Phaser template?
- Can AI generate valid Game Spec/config data without generating arbitrary Phaser source?
- Can the app validate and repair generated specs/builds enough to protect the first playable experience?
- Can projects, checkpoints, builds, edit records, and generation telemetry be saved lightly enough to test the future Game Pack model?
- Which modules are stable enough to promote into Sparkline v1?

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

Acceptance criteria:

- A known Game Spec can configure the hand-authored top-down template.
- Invalid specs fail validation before reaching the runtime.
- The schema leaves room for versioned extensions without making the core loose.

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
- Implement a small initial module set: player movement, enemy chase, pickups, health/damage, score/timer, win/loss, simple obstacles.
- Let the Game Spec list active mechanics and configs.
- Add basic validation checks per mechanic where practical.
- Keep unused modules out of a given game config.

Acceptance criteria:

- A Game Spec can turn mechanics on/off and tune values.
- Mechanics map from spec entries to code through the registry.
- Basic mechanic validation can detect obvious missing/broken behavior.

Proves:

- The top-down template can be reliable without becoming hardcoded and inflexible.

Likely promotable to v1:

- Mechanic Registry.
- Initial Mechanic Module interface.
- First stable top-down modules.

### Milestone 5: First-Playable Validation

Goal: protect the creator from seeing broken drafts as playable games.

Deliverables:

- Define the first-playable validation bar.
- Check boot success, fatal runtime errors, nonblank render, player visibility, control response, and basic objective presence.
- Store Validation Evidence for successful builds.
- Show a friendly repair/failure state for broken drafts.

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

## Open Decisions

These should not block the first milestones, but they need decisions before or during v1 planning:

- Exact POC persistence technology.
- Exact first-playable timing targets.
- Exact model/provider defaults for spec generation and repair.
- Whether Phaser dependency is bundled directly into the app or isolated in a template/runtime package.
- How much of the runtime protocol is implemented in the POC vs reserved for v1.
- Whether generated extension modules are attempted in the POC or deferred until after spec-only generation proves reliable.
- Production database, auth, object storage/CDN, queue/worker, observability, search, and moderation stack.

## First Immediate Implementation Slice

When moving into Plan Mode for coding, start with Milestone 1 and the non-AI part of Milestone 2:

> Implement a runtime adapter interface and mount one hand-authored top-down Phaser game inside the existing iframe host, while preserving the current Canvas generated-game path.

This is the right first slice because it proves the runtime boundary without spending model tokens or entangling schema/generation questions too early.
