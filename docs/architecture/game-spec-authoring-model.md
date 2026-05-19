# Game Spec Authoring Model

Draft status: POC authoring model. This document describes how the current AI-Cade POC uses Game Spec as the editable source of truth for a generated game. It is design source material for future schemas, tests, prompts, and manifests; the Markdown document itself is not runtime source of truth.

## Purpose

Game Spec is the structured recipe that lets the editor, validators, and trusted runtime templates talk about the same game without relying on arbitrary generated source code.

For the POC, Game Spec should answer:

- What game is being configured?
- Which controls, entities, assets, objectives, validation goals, and mechanics exist?
- Which stable IDs connect those modules?
- Which template-specific world layout should the trusted runtime mount?
- What must be true before the draft can be treated as playable?

The core generation loop should eventually generate and repair Game Spec data first. Trusted templates and Mechanic Modules should turn that data into a Playable Build.

## Current Shape

The current shared schema lives in `src/game-spec/game-spec-schema.ts`.

Top-level Game Spec fields:

- `schemaVersion`: version marker for the spec contract.
- `id`: stable ID for the game draft.
- `title`: display title.
- `currentIntentSummary`: concise summary of the current generated intent.
- `originalPrompt`: optional prompt that created the draft.
- `template`: runtime/template selector plus template-specific config.
- `controls`: player input bindings.
- `entities`: game objects by stable ID and role.
- `assets`: visual or content assets by stable ID and role.
- `objectives`: player-facing goals.
- `validationGoals`: system-facing checks that help decide whether the draft is trustworthy.
- `mechanics`: active behavior modules.
- `extensions`: reserved JSON space for versioned future data.

The current top-down specialization lives in `src/game-spec/top-down-spec-schema.ts`. It narrows `template.id` to `template_top_down` and expects one scene with an arena, walls, obstacles, spawn zones, pickup zones, and regions.

## Stable IDs

Stable IDs are the connective tissue of the spec. They use lowercase underscore-separated IDs and let generated data reference modules without depending on array position or display text.

Current reference fields:

- Mechanics use `targetIds` for entity IDs.
- Mechanics use `objectiveIds`, `sceneIds`, `regionIds`, and `assetIds` for the matching top-level or template-local modules.
- Scenes use `objectiveIds` and `validationGoalIds`.
- Spawn zones use `entityIds`.
- Pickup zones use `assetIds`.
- Validation goals may reference one `objectiveId`.

For the current POC, `targetIds` means entity IDs by convention. A later contract pass may rename it to `entityIds` or `targetEntityIds` for symmetry with the other reference fields.

## Authoring Rules

An authored Game Spec should keep concerns separate:

- Entities describe things that can exist in the game world, such as a player, enemy, pickup, hazard, projectile, obstacle, boss, or UI marker.
- Assets describe renderable or replaceable content, such as a template player placeholder or pickup sprite placeholder.
- Objectives describe player-facing success, such as collecting relay prisms.
- Validation goals describe system-facing trust checks, such as whether a route remains reachable.
- Mechanics describe active behavior, such as movement, pickup collection, enemy chase, or hazard contact.
- Template config describes world layout and template-local geometry.

Common behavior should still be explicit. For example, starter specs should include a `player_movement` mechanic instead of relying on the template to install movement as an invisible default.

## Validation Layers

The current top-down validator is in `src/game-spec/game-spec-validation.ts`.

Validation currently runs in these layers:

- Schema validation parses the JSON shape and template specialization with Zod.
- Semantic reference validation checks that referenced entity, asset, objective, validation goal, scene, and region IDs exist.
- Objective validation requires exactly one primary objective for the first top-down template.
- Mechanic-aware validation reads declarative requirements from the Mechanic Registry.
- Unused-module validation flags likely authoring mistakes, such as unused non-player entities, pickup assets, objectives, and validation goals.

Validation failures should produce a friendly editor state before runtime mount. They should not crash module import or the whole app.

## Runtime Flow

For the current Phaser top-down path:

1. A fixture or generated draft is parsed as top-down Game Spec.
2. Semantic validation produces either a valid fixture state or an invalid validation state.
3. `createTopDownPhaserTemplate` builds a runtime artifact from valid Game Spec data.
4. The Mechanic Registry bridge derives active installer keys and dependency script paths from the spec's active mechanics.
5. The iframe runtime loads Phaser, active mechanic scripts, then the core top-down template script.
6. Runtime events report ready, fatal runtime errors, or recoverable mechanic warnings back to the editor.

The runtime template should not invent hidden gameplay behavior. It should mount the world substrate, wire the host protocol, and install only active mechanics declared by the Game Spec.

## POC Limits

Current limits are intentional:

- The top-down template supports one scene.
- The first top-down validator is still a POC validator, not the final layered validator architecture.
- `regionIds` are validated against all regions in the single-scene proof.
- Mechanic config schemas exist as a registry direction but are not yet broadly populated.
- Persistence, Version Checkpoints, Validation Evidence, and GenerationRun telemetry are planned around this model but are not fully represented in the current in-memory spec path.

## Future Direction

Longer term, this model should become the source material for:

- generation prompts that ask AI for structured Game Spec data instead of runtime code;
- repair prompts that fix validation issues by editing stable-ID references and config;
- versioned schema migrations;
- persisted Game Pack and Version Checkpoint records;
- Validation Evidence attached to Playable Builds;
- richer asset identity and replacement workflows;
- mechanic manifests that can declare their own config, validation, fixtures, and agent contract fragments.

Do not treat this POC document as the final Sparkline package spec. Treat it as the current authoring contract that keeps Phase 3/4 code, future agents, and later schema work pointing in the same direction.
