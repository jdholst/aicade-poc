# Phase 09 Ticket 17 — Real-provider attempts, round 3

## Goal

Generate and visibly run a playable game from this exact editor prompt:

> Create a top-down game where the player can shoot a projectile.

Constraints for this round:

- Attempt count restarted at **0 of 20** by explicit user authorization.
- Every `/editor` submission must use `gpt-5.6-luna`.
- Provider access must use an accepted keyword from `.env.local` without recording it.
- The local source-focus mode replaces planning and contract provider calls with `planning-contract.json` and `generated-mechanic-contract.json`; generated source still uses the real configured OpenAI model.
- Each attempt must reach a terminal editor outcome and record its deepest pipeline stage, failure, classification, fix, and fix result.
- Success requires a newly generated projectile game to render visibly and be playable; leave that successful browser result open.
- Stop after Attempt 20 if no attempt succeeds.

This round starts after the durable trusted-evaluator correction exposed by round-two Attempt 12. Historical attempts remain in `phase-09-ticket-17-real-provider-attempts.md` and `phase-09-ticket-17-real-provider-attempts-round-2.md` and are excluded from this reset count.

## Attempt counter

- Real GPT-5.6 Luna source-generation prompt runs performed: **4 of 20**.

## Attempt 1 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Provider calls: planning and contract used the local source-focus fixtures; source generation used the real configured GPT-5.6 Luna provider.
- Terminal outcome: Final Game Spec repair exhausted.
- Furthest pipeline stage: the fixture-backed planning and contract passed; generated source passed schema, strict TypeScript, static authority/use checks, isolated execution, and both deterministic scenarios. Final Game Spec assembly ran; runtime conformance, accepted-project handoff, first-playable browser validation, and iframe mount were not reached.
- Failure: `planning-contract.json` retained two pre-existing base `mechanicConnections` for movement and collection. Phase 9 assembly deliberately refuses to replace or authenticate any provider-authored base connection, so it rejected `baseGameSpec.mechanicConnections` before it could append the generated mechanic.
- Classification: substantive source-focus fixture-boundary defect, not source-provider variance or a rerun candidate. The real source result advanced through deterministic evaluation after the round-two evaluator fix.
- Fix: remove the two existing mechanic connections from the temporary planning fixture while leaving the production fail-closed assembler unchanged. Add a fixture regression requiring the saved base spec to enter generated assembly without `mechanicConnections`. This is an expansion of TF-28, not a durable production relaxation.
- Fix result: the fixture regression fails on the captured response and passes after correction (1 file / 5 tests). Attempt 2 pending.

## Attempt 2 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Provider calls: planning and contract used the corrected source-focus fixtures; source generation used the real configured GPT-5.6 Luna provider.
- Terminal outcome: generated-mechanic handoff rejected deterministic evaluation evidence.
- Furthest pipeline stage: generated source and both deterministic scenarios passed, Final Game Spec assembly succeeded, and accepted-project handoff reached deterministic-evaluation preflight. Runtime dependency loading, conformance, first-playable browser validation, persistence, and iframe mount were not reached.
- Failure: the handoff authenticity checker recognized only `referenced_entity_motion_changed`; it rejected the evaluator's authentic positive and unchanged owned-object lifecycle evidence as incomplete scenario evidence.
- Classification: substantive trusted handoff compatibility defect exposed by the new evaluator evidence, not provider variance and not a rerun candidate.
- Fix: independently recompute lifecycle expectations during handoff from the accepted contract and scenario. Verify the exact action, owned archetype set, target-interaction requirement, scenario timing, exact baseline/after activity shape, and positive or zero deltas rather than trusting the evaluator's `passed` flag. Existing actor-motion verification remains fail-closed for non-transient mechanics.
- Fix result: the new public handoff regression fails before implementation and passes afterward; the complete handoff suite passes (1 file / 89 tests), full suite passes (113 files / 1,176 tests), lint passes, and the production build succeeds. This is durable trusted handoff verification, so no temporary-fix entry was added. Attempt 3 pending.

## Attempt 3 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005` after the clean production rebuild.
- Provider calls: planning and contract used the corrected source-focus fixtures; source generation used the real configured GPT-5.6 Luna provider.
- Terminal outcome: first-playable browser validation failed.
- Furthest pipeline stage: generated source, deterministic evaluation, Final Game Spec assembly, handoff preflight, and runtime activation all passed. The first-playable browser host mounted its iframe but did not receive the trusted `/runtime/phaser-generated` route's load event before the 12-second navigation deadline; persistence and the editor's final playable iframe were not reached.
- Failure: runtime evidence recorded `runtime_boot` failed after 11,994 ms with `fatal_runtime_error`; no browser error or warning was emitted.
- Classification: likely minor one-off iframe navigation timing failure on first occurrence. A direct same-browser probe loaded the exact trusted runtime route from the same production server in 425 ms, so the route and build were healthy and no deterministic defect was yet reproduced.
- Fix/action: no code or timeout change. Retry the exact prompt once; treat a repeated navigation deadline as a substantive runtime-host defect.
- Result: Attempt 4 pending.

## Attempt 4 — succeeded

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Provider calls: planning and contract used the corrected source-focus fixtures; source generation used the real configured GPT-5.6 Luna provider.
- Terminal outcome: accepted and visibly playable.
- Furthest pipeline stage: the complete pipeline passed—fixture-backed planning and contract admission, real source generation, strict source admission, isolated deterministic evaluation and replay, Final Game Spec assembly, handoff preflight, runtime activation, first-playable browser checks, accepted persistence, and the editor's sandboxed generated-mechanic iframe mount.
- Visible result: the editor rendered `Projectile Pursuit` with a player, arena objects, pickup objective, movement controls, and Space as `Shoot Projectile`. ArrowRight visibly moved the player. Pressing Space produced a visible white projectile and the outer runtime remained healthy. Subsequent focused QA established that the projectile originated at the arena center rather than at the player's live position, so this attempt proved pipeline completion but not correct actor-relative creation.
- Classification: goal achieved. Attempt 3's navigation deadline did not recur and is retained as a one-off timing failure; no timeout or runtime-host change was made.
- Verification baseline: evaluator and handoff regressions are green; full suite passes (113 files / 1,176 tests), lint passes, and the production build succeeds. The successful Chrome tab is intentionally left open.

## Post-success QA correction — durable actor-origin enforcement

- Root cause: the accepted planning intent and contract described player-relative creation but omitted `object_read`, generated source therefore had no legal way to observe the opaque player binding's live position, and the Phaser host correctly applied its generic center fallback when `object_create` omitted `initial.position`. Deterministic evaluation proved creation, travel, interaction, and cleanup but did not prove origin.
- Durable fix: trusted planning closes actor-relative owned-object authority with `object_read`; planning, contract, and source prompts preserve that requirement; source-focused fixtures carry it; the browser evaluator records creations at exact actor origins; evaluator-authored lifecycle assertions require that evidence; handoff independently revalidates the same contract-derived requirement; and repair feedback exposes the actor-origin delta.
- Scope: mechanic-general actor-relative owned-object behavior. The Phaser center fallback remains valid for mechanics that intentionally omit a position; no projectile-specific runtime branch or validation bypass was added.
- Temporary-fix ledger: no entry added. This changes trusted capability closure and acceptance semantics rather than relying on provider-only compliance or a retained-host exception.
