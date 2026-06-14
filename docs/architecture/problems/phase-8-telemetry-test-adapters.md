# Phase 8 Telemetry Test Adapters

Draft status: implemented for Phase 8's current repeated telemetry setup. Further adapter expansion is not approved implementation work.

Source: Phase 8 architecture review follow-up. The Strong extraction work added dedicated modules for Phaser GenerationRun receipt lifecycle and first-playable terminal finalization. The next testing friction is setup duplication around repositories, clocks, IDs, and terminal operation assertions.

## Target Module

Phase 8 telemetry test adapters.

Likely homes:

- `src/service/generation-run/testing/generation-run-test-harness.ts`
- `src/game-spec/game-pack/testing/first-playable-terminal-harness.ts`
- or a single `src/service/generation-run/testing/phase-8-telemetry-harness.ts` if the helpers are tightly coupled.

Current implemented helper:

- `src/service/generation-run/testing/generation-run-test-harness.ts`

## Current Interface Friction

Several tests now need the same small pieces of infrastructure:

- in-memory `GenerationRunStorageDriver` implementations;
- deterministic `now()` helpers;
- deterministic GenerationRun ID factories;
- running GenerationRun fixtures for generated Phaser specs;
- first-playable pass, runtime failure, and pre-runtime failure attempts;
- async waiting for repository updates triggered from React handlers.

Copying these helpers keeps tests explicit, but it also makes every future telemetry scenario pay setup tax before it can state the behavior being protected. Phase 8 will likely add more scenarios around exports, filters, cost metadata, and repair evidence, so the duplication is starting to hide the business rule under test.

## Implemented Interface Shape

The test-only adapters build real domain objects through the production repositories and validators.

Implemented helpers:

```ts
function createGenerationRunTestRepository(): {
  repository: GenerationRunRepository;
  storage: GenerationRunStorageDriver;
};

function createDeterministicClock(timestamps: string[]): () => string;

function createRunningPhaserSpecGenerationRun(input: {
  id: GenerationRun["id"];
  gamePack?: GamePack;
  attempts?: "single-success" | "repaired-success";
}): GenerationRun;

function createFirstPlayableAttemptFixture(input: {
  scenario: "passed" | "runtime-failed" | "pre-runtime-failed";
  gamePack?: GamePack;
}): {
  attempt: FirstPlayableValidationAttempt;
  gamePack: GamePack;
};
```

These are adapters over production behavior, not fake pass/fail shortcuts. For example, a passed first-playable attempt still calls `startFirstPlayableValidation`, `recordFirstPlayableRuntimeStatus`, and `recordFirstPlayableRuntimeEvidence`.

## Likely Files Affected

- `src/service/generation-run/editor-generation-run.test.ts`
- `src/service/generation-run/phaser-generation-run-receipt-lifecycle.test.ts`
- `src/game-spec/game-pack/first-playable-terminal-result.test.ts`
- `src/components/editor-shell/editor-first-playable-validation-gate.test.tsx`
- possibly `src/game-spec/generation-run/generation-run-repository.test.ts` if the memory storage helper becomes shared.

## Migration Steps

1. Start with the repeated in-memory GenerationRun storage and repository setup. Implemented.
2. Move deterministic clock creation into the same test helper area. Implemented.
3. Move running Phaser GenerationRun fixture creation after the current terminal finalization tests are stable. Implemented.
4. Move first-playable attempt fixtures only if the helper still exercises production validation functions. Implemented.
5. Replace duplicated helpers one test file at a time, keeping assertions local and readable.

The implemented first-playable attempt fixtures still call the production validation functions (`startFirstPlayableValidation`, `recordFirstPlayableRuntimeStatus`, and `recordFirstPlayableRuntimeEvidence`) rather than creating fake terminal attempts directly. Behavior assertions remain local to the tests that protect terminal finalization, runtime-session persistence, and GenerationRun linking.

## Test Strategy

- Add focused tests for the test adapters only when they contain branching behavior.
- Prefer proving adapters indirectly through existing behavior tests.
- Run the full Phase 8 telemetry cluster after each migration:
  - `src/service/generation-run/editor-generation-run.test.ts`
  - `src/service/generation-run/phaser-generation-run-receipt-lifecycle.test.ts`
  - `src/game-spec/game-pack/first-playable-terminal-result.test.ts`
  - `src/components/editor-shell/editor-first-playable-validation-gate.test.tsx`
  - `src/service/spec-generation/spec-generation-client.test.ts`
  - `src/service/spec-generation/spec-generation-route-handler.test.ts`

## Risks

- A too-clever harness could hide important receipt fields and weaken the tests.
- Shared fixtures can accidentally freeze behavior that should remain scenario-specific.
- Moving all setup at once would make failures harder to interpret.

## Non-Goals

- Do not add production adapters or runtime abstractions.
- Do not introduce a mocked telemetry backend.
- Do not weaken assertions around failure class, stage, repair status, relationships, or validation evidence IDs.
- Do not use fixtures to mask AI-generation failures.
- Do not change the GenerationRun schema.

## Future Expansion Gate

Expand these adapters only when future Phase 8 tests repeat additional setup beyond the current repository, clock, running-run, and first-playable attempt helpers. Keep the harness small enough that deleting it would leave the production tests easy to rewrite.
