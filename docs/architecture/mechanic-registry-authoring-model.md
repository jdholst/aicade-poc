# Mechanic Registry Authoring Model

Draft status: POC authoring model. This document describes how the current AI-Cade POC authors built-in top-down mechanics. It is design source material for future schemas, tests, prompts, and manifests; the Markdown document itself is not runtime source of truth.

## Purpose

The Mechanic Registry keeps gameplay behavior inspectable and opt-in. A mechanic is not only a script. In the current POC, a complete built-in mechanic has three parts:

- a registry entry that describes the mechanic and how to load it;
- a Game Spec mechanic entry that activates it for a game and points at stable IDs;
- a runtime installer that receives a narrow service context and installs behavior.

This model prevents the top-down template from silently carrying hidden chaser-game assumptions. The template owns boot, iframe protocol, scene lifecycle, layout substrate, starter entity tracking, and mechanic orchestration. Mechanic Modules own opt-in gameplay behavior.

## Registry Entry Anatomy

The registry lives in `src/game-spec/mechanics/mechanic-registry.ts`.

Current registry entry fields:

- `type`: stable mechanic type used by Game Spec entries.
- `label`: human-readable name.
- `description`: short behavior summary.
- `scope`: template/runtime pair, currently `template_top_down` plus `phaser`.
- `capabilityTags`: broad capability labels such as `movement`, `collection`, `score`, `enemy_ai`, and `health_damage`.
- `runtimeInstallerKey`: key used by the runtime script registry.
- `runtimeDependencyScriptPath`: classic script loaded into the iframe before the core template script.
- `configSchema`: future direction for per-mechanic config validation.
- `agentContract`: future direction for generation guidance.
- `runtimeContext`: optional typed context metadata.
- `validationRequirements`: declarative rules interpreted by Game Spec validation.

Current built-in top-down mechanics:

- `player_movement`: requires a player target.
- `pickup_collection`: requires a player target, a pickup-role asset, an objective, and pickup-zone coverage for a referenced pickup asset.
- `enemy_chase`: requires enemy and player targets plus an objective.
- `hazard_contact`: requires hazard and player targets plus an objective.

## Game Spec Binding

Game Spec activates mechanics through top-level `mechanics` entries. The mechanic entry's `type` must match a scoped registry entry. The remaining fields wire that behavior to stable IDs:

- `targetIds`: entity targets used by the mechanic.
- `assetIds`: assets used by the mechanic.
- `objectiveIds`: objectives the mechanic reads or mutates.
- `sceneIds` and `regionIds`: template-local scene or region references where needed.
- `config`: JSON config for mechanic-specific tuning.

The current runtime scripts prefer explicit stable-ID targets, then fall back to role-based lookup when needed. New mechanics should still declare the IDs they depend on so validation and future repair prompts can reason about the spec.

## Runtime Bridge Flow

The bridge function is `createMechanicRuntimeBridge`.

For a valid Game Spec:

1. Read active mechanics from the Game Spec.
2. Resolve each active `type` against registry entries in the requested scope.
3. Deduplicate active mechanic types.
4. Produce `mechanicInstallerKeys` for runtime installation.
5. Produce `runtimeDependencyScriptPaths` for iframe document loading.
6. Let `createTopDownPhaserTemplate` embed that bridge output in the runtime artifact.

This means dependency script ownership lives next to mechanic metadata instead of inside a hardcoded template-local list.

## Installer Contract

The public top-down installer contract lives in `src/runtime/phaser/top-down-mechanic-runtime.ts` and is re-exported from `src/runtime/phaser/index.ts` for JSDoc usage in public runtime scripts.

Mechanic scripts register installers on `globalThis.__AICADE_TOP_DOWN_MECHANICS__` using the registry entry's `runtimeInstallerKey`.

Installers receive these service groups:

- `entities`: find spec entities, create handles, get handles, and reset handles.
- `layout`: find spawn and pickup points, inspect blocked paths and points, and read static bodies.
- `physics`: add colliders and overlaps.
- `objective`: increment or reset objective progress.
- `input`: create cursor keys.
- `math`: normalize, scale, and randomize vectors.
- `runtime`: inspect viewport and reset entities.

Mechanics should not receive raw Phaser `scene`, raw `Phaser`, or the full Game Spec. If a new behavior needs more runtime power, add a narrow service method instead of widening the boundary.

Installers may return:

- `update` for per-frame behavior;
- `dispose` for cleanup;
- nothing for one-time setup behavior.

## Error Handling

Mechanic install, update, and dispose failures should be recoverable when possible.

Runtime mechanic failures are reported as `game-error` events with an issue of type `mechanic-disabled`, severity `warning`, and `recoverable: true`. The editor stores these as runtime warnings and keeps the iframe playable when a later `game-ready` event arrives.

Fatal runtime failures still use `game-error` with a `runtime-error` issue and block the runtime UI.

Game Spec validation failures happen before runtime mount. They should render the editor's Game Spec validation screen instead of throwing during module import.

## Add A Built-In Mechanic

Use this checklist for current POC built-ins:

1. Add or update the Game Spec fixture so the mechanic is explicit and targets stable IDs.
2. Add a registry entry with scope, capability tags, installer key, dependency script path, and validation requirements.
3. Add a classic script under `public/runtime/phaser/mechanics/`.
4. Register the installer on `globalThis.__AICADE_TOP_DOWN_MECHANICS__`.
5. Annotate the installer with `TopDownMechanicInstaller` via JSDoc.
6. Use only the typed service context.
7. Return `update` or `dispose` only when the mechanic needs lifecycle hooks.
8. Add validation coverage for required targets, assets, objectives, and layout coverage.
9. Add runtime tests proving the mechanic is installed only when active.
10. Add failure coverage when the mechanic owns install, update, or dispose behavior that can throw.

## Future AI-Generated Mechanics

Dynamic AI-generated mechanic ingestion is not implemented yet. The intended direction is a generated mechanic manifest plus installer, not unstructured runtime code.

A future generated mechanic manifest should declare:

- mechanic type and label;
- template/runtime scope;
- capability tags;
- runtime installer key and dependency path or packaged code reference;
- config schema and defaults;
- validation requirements;
- agent contract fragments;
- fixtures or examples;
- editor controls where useful.

Validation should check the declared manifest contract against the Game Spec. It should not try to infer truth from arbitrary generated code. Generated mechanics will also need stronger sandboxing, compatibility checks, and promotion rules before they can be trusted like built-ins.

## Current Limits

The current registry is strong enough for the Phase 3/4 POC closeout, but not final:

- config schemas are available as a field but not broadly populated;
- validation requirements cover the current built-ins only;
- `targetIds` still means entity IDs by convention;
- dependency metadata is script-path based and Phaser/top-down specific;
- dynamic generated manifest ingestion is future work;
- the validator should keep moving toward layered ownership instead of becoming one giant rule file.
