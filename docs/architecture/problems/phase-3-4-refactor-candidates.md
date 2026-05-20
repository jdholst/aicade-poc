# Phase 3/4 Refactor Candidates

Draft status: working refactor map. This document records deepening opportunities from the Phase 3/4 architecture cleanup pass. Use it as the shared reference while exploring candidates; do not treat every candidate as approved implementation work.

Source task: `Run Phase 3/4 architecture cleanup pass` on the Phase 3 & 4 Notion taskboard.

## Purpose

Phase 3/4 added the Game Spec, Mechanic Registry, Phaser runtime path, top-down fixtures, mechanic validation, and runtime warning handling quickly. The code is functional, but several Modules now show friction around Depth, Locality, and AI-navigability.

This refactor map preserves the current candidate list so future exploration can stay focused:

- pick one candidate;
- grill the intended Interface and test surface;
- implement in small, verifiable steps;
- update this document as candidates are completed, rejected, or split.

## Candidate 1: Top-Down Game Spec Validation Module

Status: implemented. Direction: registry-owned mechanic contract validation.

Files:

- `src/game-spec/game-spec-validation.ts`
- `src/game-spec/mechanics/mechanic-registry.ts`

Problem:

The validation Module now mixes context building, reference checks, mechanic contract checks, active-reference collection, and unused-module checks in one implementation. Its public Interface is small, but the implementation has too many reasons to change.

Solution:

Deepen validation into a Module that owns validation context, reference collection, rule execution, and issue aggregation behind the existing `validateTopDownGameSpec` seam.

Chosen implementation direction:

- Keep `validateTopDownGameSpec` and `getTopDownGameSpecValidationIssues` as the public Interface.
- Move shared validation issue/error types, stable-ID helpers, top-down context building, and semantic orchestration under `src/game-spec/validation/`.
- Move mechanic requirement interpretation into the Mechanic Registry area so the validator reads registry-owned contracts instead of growing per-mechanic branches.
- Preserve current validator behavior and issue messages through the existing public seam tests.

Benefits:

- Better Locality for future Game Spec growth.
- Less risk that `game-spec-validation.ts` becomes one giant rule file.
- Tests can stay at the validator Interface instead of relying on scattered helper details.

Test implications:

- Preserve current public validation tests.
- Add focused tests only at the validator Interface unless a new internal seam earns direct tests.

## Candidate 2: Top-Down Runtime Core Module

Status: implemented. Direction: internal factory Modules inside one classic script.

Files:

- `public/runtime/phaser/top-down-template.js`
- `src/runtime/phaser/top-down-template.test.ts`

Problem:

The runtime script owns template parsing, layout math, entity handles, objective state, mechanic lifecycle, host commands, Phaser boot, and error reporting. The Interface is simply loading the runtime script, but several hidden Modules are embedded in one implementation.

Solution:

Deepen the authored runtime into internal Modules for world/layout, entity handles, objective state, mechanic lifecycle, and host protocol while preserving one iframe entry point.

Chosen implementation direction:

- Keep `public/runtime/phaser/top-down-template.js` as the only core runtime script loaded after Phaser and mechanic dependency scripts.
- Split the IIFE into internal factories for runtime config, entity lookup, layout, entities, objectives, mechanic lifecycle, host protocol, and scene boot.
- Preserve the shared host command protocol, recoverable mechanic warning flow, and fatal boot error behavior.

Benefits:

- Higher Locality when changing runtime behavior.
- Smaller and clearer runtime test surfaces.
- Easier future Agent Contract, live patch, and validation work.

Test implications:

- Keep behavior tests at the iframe/runtime script seam.
- Extract internal tests only for genuinely reusable pure runtime helpers.

## Candidate 3: Mechanic Module Authoring Helpers

Status: implemented. Direction: context-owned authoring helpers.

Files:

- `public/runtime/phaser/mechanics/player-movement.js`
- `public/runtime/phaser/mechanics/pickup-collection.js`
- `public/runtime/phaser/mechanics/enemy-chase.js`
- `public/runtime/phaser/mechanics/hazard-contact.js`

Problem:

Each Mechanic Module repeats target lookup and objective fallback rules. This makes the authoring model harder to follow and spreads behavior bugs across scripts.

Solution:

Concentrate shared mechanic authoring behavior behind narrow helper methods on the existing mechanic context.

Chosen implementation direction:

- Deepen the `entities` service with mechanic-bound target lookup helpers.
- Deepen the `objective` service with a primary objective ID helper.
- Keep the existing mechanic script loading Interface unchanged.

Benefits:

- More Leverage for every new built-in mechanic.
- Better Locality for target and objective lookup behavior.
- Cleaner path toward future AI-generated mechanic manifests.

Test implications:

- Keep mechanic behavior tests through runtime installation.
- Add helper tests only if the helper becomes a real Module with meaningful logic.

## Candidate 4: Fixture Catalog Module

Status: implemented. Direction: one file per authored fixture plus a separate catalog/state Module.

Files:

- `src/runtime/phaser/top-down-game-spec-fixture.ts`

Problem:

One file mixes large fixture data, catalog selection, environment lookup, lazy validation, invalid-state shaping, and default exports. It is doing both authoring and runtime selection.

Solution:

Split fixture data from fixture catalog selection and validation state.

Chosen implementation direction:

- Move each authored top-down fixture input into its own `src/runtime/phaser/fixtures/` Module.
- Keep fixture ID resolution, environment selection, lazy validation, invalid-state shaping, and state caching in `top-down-game-spec-fixture.ts`.
- Build the default Phaser template from a validated default fixture helper instead of a raw fixture input cast.

Benefits:

- Easier fixture authoring.
- Less import-time fragility.
- Cleaner tests for fixture selection versus fixture validity.

Test implications:

- Preserve fixture selector tests.
- Add or keep tests proving invalid fixture state is data, not a module-evaluation crash.

## Candidate 5: Phaser Runtime Test Harness Module

Status: implemented. Direction: harness-only extraction before Candidate 2.

Files:

- `src/runtime/phaser/top-down-template.test.ts`

Problem:

The test file includes a fake Phaser runtime harness, fixture mutations, installer loading, behavior tests, and failure tests. Its implementation has become a second runtime.

Solution:

Move the harness into a dedicated test Module and keep behavior tests focused on public runtime seams.

Chosen implementation direction:

- Move fake Phaser context creation, runtime script execution, source loading, fixture layout mutation, and harness types into `src/runtime/phaser/testing/top-down-runtime-harness.ts`.
- Keep `src/runtime/phaser/top-down-template.test.ts` as the behavior assertion suite.
- Defer splitting the behavior suite until after or during the runtime core Module cleanup.

Benefits:

- More readable tests.
- Less duplicated setup.
- Future runtime refactors become easier because the fake adapter is concentrated.

Test implications:

- No behavior change expected.
- Run the focused Phaser runtime tests after each extraction step.

## Candidate 6: Editor Runtime Panel Module

Status: implemented. Direction: view model plus display Modules.

Files:

- `src/components/editor-shell/editor-game-canvas.tsx`
- `src/hooks/use-editor-session.ts`

Problem:

Runtime mode selection, Phaser validation state, Canvas mounting, warning panels, fatal errors, controls, and loading screens all meet in one React Module. The Interface is broad because the Module owns too many runtime states.

Solution:

Deepen the editor runtime display into smaller orchestration and display Modules, while keeping the session hook as the state owner until a stronger state-machine seam is justified.

Chosen implementation direction:

- Extract runtime surface decisions into a pure editor runtime panel view model.
- Move runtime controls, warning panel, runtime screens, error banner, and host mounting into focused display Modules.
- Keep `EditorGameCanvas` as the public orchestration Interface and leave `useEditorSession` as the state owner.

Benefits:

- Better Locality for validation, warning, and fatal-error UI behavior.
- Less chance that adding a runtime state creates render-loop or stale-state bugs.
- Easier future support for more runtime states.

Test implications:

- Preserve current editor canvas tests.
- Prefer testing the public editor runtime display behavior rather than private display helpers.

## Recommended Order

1. Top-Down Game Spec Validation Module.
2. Fixture Catalog Module.
3. Phaser Runtime Test Harness Module.
4. Top-Down Runtime Core Module.
5. Mechanic Module Authoring Helpers.
6. Editor Runtime Panel Module.

The first two candidates clean up lower-risk data and validation seams before touching the runtime script. Candidates 3 and 4 should be considered together because the runtime script is easier to deepen once the test harness is less tangled.

## Notes

- Use the architecture skill vocabulary: Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, and Locality.
- Apply the deletion test before extracting a new Module.
- Avoid re-litigating settled Game Spec and Mechanic Registry decisions unless concrete friction appears.
- Do not touch Next.js app APIs during these refactors unless the relevant `node_modules/next/dist/docs/` guidance has been read first.
