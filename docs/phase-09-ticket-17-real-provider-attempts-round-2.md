# Phase 09 Ticket 17 — Real-provider attempts, round 2

## Goal

Generate and visibly run a playable game from this exact editor prompt:

> Create a top-down game where the player can shoot a projectile.

Constraints for this round:

- Attempt count restarted at **0 of 15** by explicit user authorization; the ceiling was extended from 10 to 15 after Attempt 9.
- Every `/editor` submission must use `gpt-5.6-luna`.
- Provider access must use an accepted keyword from `.env.local` without recording its value.
- Each attempt must be observed through a terminal editor outcome and record its deepest pipeline stage, failure, classification, fix, and fix result.
- Success requires a newly generated projectile game to render visibly and be playable; leave that successful browser result open.
- Stop after Attempt 15 if no attempt succeeds.

This round is separate from the completed historical 20-attempt session in `phase-09-ticket-17-real-provider-attempts.md`. Interrupted pre-round subagent diagnostics are excluded from this reset count.

## Attempt counter

- Paid prompt runs performed: **12 of 15**.

## Attempt 1 — failed

- Prompt/model: exact Ticket 17 prompt with `gpt-5.6-luna`.
- Terminal outcome: Game Spec validation failed.
- Furthest pipeline stage: `semantic_validation`; generated-source construction, execution-realm conformance, Final Game Spec runtime handoff, and iframe mount were not reached.
- Failure: `entities.center_pillar` was not referenced by any spawn zone or active mechanic. The bounded automatic repair attempted once and returned the same invalid orphan entity.
- Classification: likely minor provider-plan variance on first occurrence. The validator correctly rejected an unreachable decorative entity, and this does not yet establish a deterministic pipeline defect.
- Fix/action: no code change; rerun the exact prompt once to test whether the model produces a valid plan without the orphan entity.
- Result: Attempt 2 passed planning and contract generation and reached generated-source repair, confirming the orphan entity was not deterministic.

## Attempt 2 — failed

- Prompt/model: exact Ticket 17 prompt with `gpt-5.6-luna`.
- Terminal outcome: generated mechanic source repair exhausted.
- Furthest pipeline stage: `repair_exhausted` in generated-source typecheck; deterministic evaluation, execution-realm conformance, Final Game Spec runtime handoff, and iframe mount were not reached.
- Failure: `callbacks.2.source` called `capabilities.objects.querySpatial`, but the exact accepted grant omitted `spatial_query`, so the generated callback type correctly had no `querySpatial` member. The bounded repair retained the unauthorized call.
- Classification: substantive cross-stage host-policy mismatch. The accepted intent described an owned object that survives across simulated time and required create, motion, and destroy, but omitted the only retained-host primitive that can rediscover its opaque handle in a later callback.
- Fix: at the public `generateTopDownCreatorPlan` seam, deterministically add `spatial_query` only when an intent declares owned objects, a temporal rule, and the complete `object_create` + `object_motion_write` + `object_destroy` lifecycle. Preserve the authority addition as a reversible assumption; do not mutate provider output. Recorded as TF-24 in the temporary-fix ledger.
- Fix result: red-to-green planning-service regression passes (1 file / 8 tests), full suite passes (112 files / 1,159 tests), lint passes, and the production build succeeds. Attempt 3 pending.

## Attempt 3 — failed

- Prompt/model: exact Ticket 17 prompt with `gpt-5.6-luna`.
- Terminal outcome: generated mechanic source repair exhausted after deterministic evaluator failure.
- Furthest pipeline stage: generated source passed schema validation, TypeScript, static authority inspection, exact grant-use validation, isolated execution, and deterministic scenario execution. Evaluator-authored acceptance ran for `projectile_creation_and_travel` and `projectile_lifetime_cleanup`; Final Game Spec runtime handoff and iframe mount were not reached.
- Failure: both scenarios failed `owned_object_lifecycle_after_action` with `requireTargetInteraction: true`. The durable repair issue serialized raw `before`/`after` activity but truncated at the archetype ID before any post-action lifecycle metrics, so source repair could not distinguish missing creation, travel, target interaction, cleanup, or active-count restoration.
- Classification: substantive repair-evidence fidelity and provider-guidance gap, not a blind rerun candidate. The evaluator remained correctly fail-closed, but its bounded diagnostic was not actionable for this one-archetype lifecycle shape.
- Fix: summarize owned-object evidence into per-archetype `activeDelta`, `createdDelta`, `destroyedDelta`, `simulatedDistanceTraveledDelta`, and `targetInteractionsDelta` before applying the existing receipt bound. Add stage-failure guidance mapping each delta to the exact granted lifecycle operation and mapping a required zero target-interaction delta to a bounded target query followed by finite nonzero target motion. The compact evidence correction is durable; the provider recipe is recorded as TF-25.
- Fix result: both red-to-green seams pass: evaluator repair-evidence formatter (1 file / 2 tests) and source prompt generation (1 file / 8 tests). Full suite passes (112 files / 1,161 tests), lint passes, and the production build succeeds. Attempt 4 pending.

## Attempt 4 — failed; clean-build verification invalidated

- Prompt/model: exact Ticket 17 prompt with `gpt-5.6-luna`.
- Terminal outcome: generated mechanic source repair exhausted after deterministic evaluator failure.
- Furthest pipeline stage: generated source again passed admission and reached evaluator-authored `owned_object_lifecycle_after_action` checks for `projectile_created_and_moves` and `projectile_expires`; Final Game Spec runtime handoff and iframe mount were not reached.
- Failure: both scenarios still reported failed lifecycle evidence requiring target interaction.
- Classification: the provider run is a valid paid attempt, but it is not valid verification of the rebuilt Attempt 3 fix. A post-attempt URL audit found that the controlled Chrome tab was on `localhost:3006` while the clean production build/restart was on `localhost:3005`; the terminal message therefore could not establish that the newly built formatter and guidance served this request.
- Fix/action: no additional code change. Move the same prepared tab to the verified `localhost:3005` production server, preserve the exact prompt/credential/model selection, and rerun there. The previous 3006 server is left untouched because it may be user-owned.
- Result: corrected tab origin is `http://localhost:3005`; Attempt 5 pending.

## Browser endpoint correction

- Attempts 1-4 were submitted through the controlled `/editor` tab later discovered at `localhost:3006`. They remain counted because each initiated a real authorized GPT-5.6 Luna operation and reached a terminal editor result.
- Production rebuild verification for code fixes is authoritative only on the separately rebuilt `localhost:3005` server. Starting with Attempt 5, the controlled tab origin is explicitly checked before submission.

## Attempt 5 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Terminal outcome: generated mechanic source repair exhausted.
- Furthest pipeline stage: planning and contract generation passed; generated source reached strict TypeScript validation. Deterministic evaluation, conformance, Final Game Spec runtime handoff, and iframe mount were not reached for the final candidate.
- Failure: `callbacks.1.source` passed behavior label `"expire_projectiles"` to `capabilities.time.schedule`, while the candidate's only scheduled callback ID—and therefore the exact TypeScript callback-ID union—was `"scheduled"`. Bounded repair retained the mismatched literal.
- Classification: substantive source-provider callback identity mismatch. The host type surface and validator were correct, but provider-authored callback IDs and schedule literals can drift even though the required callback kinds are fully deterministic.
- Fix: require every generated callback `id` to equal its unique callback `kind`. Add exact stage-failure guidance mapping a `time.schedule` callback-ID type error to literal `"scheduled"` and prohibiting behavior labels such as `"expire_projectiles"`. Recorded as TF-26 because trusted code could eventually stamp these IDs.
- Fix result: red-to-green source-prompt regression passes (1 file / 9 tests), full suite passes (112 files / 1,162 tests), lint passes, and the production build succeeds. Attempt 6 pending.

## Attempt 6 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Terminal outcome: deterministic evaluation failure exhausted bounded repair.
- Furthest pipeline stage: planning, contract generation, generated-source schema/type/static/grant validation, isolated execution, and deterministic scenarios ran. Final Game Spec runtime handoff and iframe mount were not reached.
- Failure: scenario `shoot_creates_and_cleans_projectile` declared final `owned_object_count == 1` but observed 0 after cleanup. Separately, `cooldown_rejects_early_shot` setup asserted `last_shot_time == 0` while the contract-installed initial value was `-1`; setup is evaluated before `install`, so no generated source ran in that scenario.
- Classification: substantive repair-owner orchestration defect plus contract-provider setup mismatch. The continuation unconditionally attributed every evaluator failure to source, even when failed pre-source setup is authored entirely by the contract; source repair could not legally correct either the setup assertion or private-state declaration.
- Fix: route any failed scenario setup evidence back to contract repair while keeping setup-passing declared/external behavior failures source-owned. Add exact contract guidance that pre-install `state_equals` setup must equal the matching `privateState.initialValue`, with stage-failure repair using the observed value. Existing TF-23 guidance already requires zero final owned-object count after cleanup. The repair-owner correction is durable; setup guidance is recorded as TF-27.
- Fix result: red-to-green continuation seam plus existing source-repair integration pass (2 files / 19 tests), and contract-prompt setup guidance passes (1 file / 8 tests). Full suite passes (112 files / 1,164 tests), lint passes, and the production build succeeds. Attempt 7 pending.

## Attempt 7 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Terminal outcome: generated mechanic source repair exhausted.
- Furthest pipeline stage: planning and contract generation passed; generated source reached strict TypeScript validation. Deterministic evaluation, conformance, Final Game Spec runtime handoff, and iframe mount were not reached for the final candidate.
- Failure: `callbacks.2.source` used `Number.MAX_SAFE_INTEGER`, but the hand-authored no-lib generated-source `NumberConstructor` declaration omitted that standard runtime property.
- Classification: deterministic trusted source-type-surface mismatch. The static policy permits direct deterministic `Number` members and the runtime provides `Number.MAX_SAFE_INTEGER`; only the compile-time surface was incomplete.
- Fix: add `readonly MAX_SAFE_INTEGER: number` to the generated-source `NumberConstructor` declaration. This is durable source/runtime type-surface parity, not a temporary policy or provider workaround, so no temporary-fix-ledger entry was added.
- Fix result: the focused public source-stage regression failed before the implementation (1 failed / 56 passed) and passes afterward (1 file / 57 tests). Per user direction, work stopped after this current fix; no production rebuild or Attempt 8 was started.

## Source-focus fixture mode enabled before Attempt 8

- Purpose: isolate source generation and avoid repeating external planning and contract calls that have already reached their accepted service boundaries in this round.
- Behavior: with local `AICADE_TICKET_17_SOURCE_FOCUS_FIXTURES=1`, planning uses the Game Spec and Mechanic Intent captured in `planning-contract.json`; contract generation uses the candidate captured in `generated-mechanic-contract.json`; source generation remains the actual GPT-5.6 Luna provider path.
- Preserved checks: both fixture payloads still pass through the normal planning, routing, contract validation, capability-grant, source, evaluation, conformance, handoff, and runtime pipeline. Only the two upstream external provider calls are replaced, and the active contract attempt ID is rebound for correlation.
- Evidence: fixture-selector tests prove zero calls to the actual planning and contract providers, both supplied files pass the real planning and contract services, all 1,169 repository tests pass, lint passes, and the production build succeeds without the earlier broad file-tracing warning.
- Accounting: enabling and verifying this mode did not submit a provider request and does not increment the paid-attempt counter. Attempt 8 remains pending.

## Attempt 8 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Provider calls: `planning-contract.json` replaced the external planning call and `generated-mechanic-contract.json` replaced the external contract call; server warnings confirmed both substitutions. Source generation used the actual configured GPT-5.6 Luna provider.
- Terminal outcome: generated mechanic source repair exhausted.
- Furthest pipeline stage: the captured planning and contract candidates passed their normal trusted services; generated source reached strict TypeScript validation and bounded repair. Deterministic evaluation, conformance, Final Game Spec runtime handoff, and iframe mount were not reached for the final candidate.
- Failure: `callbacks.1.source` read `.velocity` directly from a `MechanicObjectHandle`. Handles returned by creation, bindings, and `querySpatial` are intentionally opaque identities; only a separately granted `capabilities.objects.read(handle)` call returns a `MechanicObjectObservation` with velocity fields. The captured contract does not grant `object_read`.
- Classification: substantive source-provider type-surface misunderstanding, not minor provider variance. Every bounded source repair retained the invalid property access despite the compiler diagnostic.
- Fix: state explicitly that `MechanicObjectHandle` exposes no readable properties and `querySpatial` returns handles rather than observations. If `object_read` is granted, source may await it and read the returned observation; otherwise it must derive finite motion from accepted config, lifecycle input, or deterministic constants. Add exact stage-failure guidance that removes handle property access without adding authority, casting, or suppressing diagnostics. Recorded as TF-29.
- Fix result: red-to-green public source-prompt regression passes (1 file / 10 tests), the full suite passes (113 files / 1,170 tests), lint passes, and the production build succeeds. Attempt 9 pending.

## Attempt 9 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Provider calls: planning and contract used the source-focus fixtures; source generation used the actual configured GPT-5.6 Luna provider.
- Terminal outcome: deterministic evaluation failure exhausted bounded repair.
- Furthest pipeline stage: generated source passed schema validation, strict TypeScript, static authority and exact grant-use validation, isolated execution, and deterministic scenario execution. Conformance, Final Game Spec runtime handoff, and iframe mount were not reached.
- Failure: `shoot_creates_and_cleans_projectile` advanced through the full 1,200 ms projectile lifetime but declared final `owned_object_count == 1`; evaluation correctly observed 0 after cleanup. `cooldown_rejects_early_shot` declared pre-install setup `last_shot_time == 0`, contradicting the contract's `-1` initial value. Repair ownership correctly returned the setup failure to contract, but fixture mode deliberately returned the same captured contract and exhausted repair.
- Classification: substantive temporary-fixture defect, not a source-generation defect or blind-rerun candidate. Attempt 9 confirms the Attempt 8 opaque-handle guidance moved actual source generation through typing and into deterministic evaluation.
- Fix: correct `generated-mechanic-contract.json` rather than production validation. Remove the impossible positive final count from the post-cleanup scenario. Align cooldown setup with initial state `-1`, then dispatch once at time zero before advancing 100 ms and dispatching again so the scenario actually tests rejection inside the 250 ms cooldown window.
- Fix result: the fixture regression fails on both original contradictions and passes after correction (1 file / 5 tests). The same suite also proves the corrected fixture passes the real planning and contract services. Attempt 10 pending.

## Attempt 10 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Provider calls: planning and contract used the source-focus fixtures. Contract admission failed before another source call was needed.
- Terminal outcome: contract repair exhausted.
- Furthest pipeline stage: fixture planning passed; Generated Mechanic Contract host admission ran and rejected the corrected cooldown scenario before source generation, deterministic evaluation, conformance, handoff, or iframe mount.
- Failure: `contract.scenarios` required every retained-host evaluator scenario to dispatch the one exact routed input action exactly once. The first Attempt 9 fixture correction represented a prior accepted shot by dispatching twice in `cooldown_rejects_early_shot`, violating that invariant; fixture-backed contract repair repeated the same candidate.
- Classification: substantive temporary-fixture modeling defect, not provider variance or a production contract-admission defect. The validator correctly rejected an unsupported multi-action scenario.
- Fix: use an initial `last_shot_time` of `0` for both scenarios. The success scenario advances 250 ms before its one dispatch, then advances the 1,200 ms lifetime and expects cleanup plus `last_shot_time == 250`. The cooldown scenario advances only 100 ms before its one dispatch and expects rejection with unchanged state `0`. This preserves exactly one routed action per scenario while testing both sides of the cooldown.
- Fix result: the fixture regression fails on the prior two-dispatch shape and passes after correction (1 file / 5 tests); JSON parsing and real planning/contract service admission pass. Attempt 11 pending.

## Attempt 11 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Provider calls: planning and contract used the corrected source-focus fixtures; source generation used the actual configured GPT-5.6 Luna provider.
- Terminal outcome: deterministic evaluation failure exhausted bounded source repair.
- Furthest pipeline stage: planning, contract admission, generated-source schema/type/static/grant validation, isolated execution, and both deterministic scenarios ran. Conformance, Final Game Spec handoff, and iframe mount were not reached.
- Failure: the generated source treated `last_shot_time` as a future cooldown deadline. In the accepted scenario it wrote `250 + 250 == 500` instead of current shot time 250. In the rejection scenario it accepted the action at 100 ms, wrote deadline 350, and created an object. It also used scheduled behavior without producing owned-object travel or cleanup: lifecycle deltas were active +1, created +1, destroyed 0, distance 0.
- Classification: substantive source-provider semantic mismatch, not fixture clock drift or rerun noise. The actual values exactly expose `now + shoot_cooldown_ms` deadline semantics where the contract declares last-accepted-action time.
- Fix: for `last_*_time` plus `*_cooldown_ms`, require source to reject while `now - lastAcceptedTime < cooldown`, write current `now` only on an accepted action, and never store `now + cooldown`. Keep timestamp-enforced cooldown synchronous; reserve `time.schedule` for the contract's separate delayed lifecycle behavior and its own duration. Recorded as TF-30.
- Fix result: red-to-green public source-prompt regression passes (1 file / 11 tests), the full suite passes (113 files / 1,172 tests), lint passes, and the production build succeeds. Attempt 12 pending.

## Attempt 12 — failed

- Prompt/model/origin: exact Ticket 17 prompt with `gpt-5.6-luna` on verified `http://localhost:3005`.
- Provider calls: planning and contract used the corrected source-focus fixtures; source generation used the actual configured GPT-5.6 Luna provider.
- Terminal outcome: deterministic evaluation failure exhausted bounded source repair.
- Furthest pipeline stage: planning, contract admission, generated-source schema/type/static/grant validation, isolated execution, and both deterministic scenarios ran. Conformance, Final Game Spec handoff, and iframe mount were not reached.
- Failure: TF-30 worked—the generated source rejected `cooldown_rejects_early_shot` and left every owned-object lifecycle delta at zero. The trusted evaluator nevertheless attached the positive `owned_object_lifecycle_after_action` assertion to that deliberate rejection scenario, so correct zero activity was reported as a source failure through every bounded repair.
- Classification: substantive trusted evaluator-selection defect, not source-provider variance and not a fixture contradiction. A positive create/travel/destroy assertion is only observable when a transient-object scenario advances simulation after its routed action; a scenario ending at the action needs causal unchanged-lifecycle evidence.
- Fix: add evaluator-authored `owned_object_lifecycle_unchanged_after_action` evidence. Transient-object scenarios with post-action time advancement retain positive lifecycle proof; action-terminal scenarios require zero active, created, destroyed, traveled, and target-interaction deltas from the causal pre-action baseline. Compact delta projection now covers failures of either lifecycle assertion.
- Fix result: red-to-green evaluator selection regression passes; focused evaluator/runtime/repair suites pass (3 files / 31 tests), the full suite passes (113 files / 1,175 tests), lint passes, and the production build succeeds. This is durable trusted evaluator correctness, so no temporary-fix entry was added.

## Pre-round excluded diagnostic

- Accounting: excluded from the reset counter because it completed before the new 0-of-10 authorization.
- Prompt/model: exact Ticket 17 prompt with `gpt-5.6-luna`.
- Furthest stage: bounded generated-source repair; Final Game Spec handoff and runtime mount were not reached.
- Failure: `callbacks.1.source` — `Property 'hypot' does not exist on type 'Math'.`
- Classification: deterministic trusted source-type-surface mismatch. Direct deterministic `Math` members are allowed by static policy and the SES/browser runtime supports `Math.hypot`, but the hand-authored no-lib TypeScript declaration omitted it.
- Fix: add `hypot(...values: readonly number[]): number` to the trusted generated-source `Math` declaration through a red-to-green public source-stage regression. No grant, authority, runtime behavior, or provider guidance changed.
- Fix result: focused generated-source service suite passes (1 file / 56 tests), full suite passes (112 files / 1,158 tests), and the production rebuild succeeds. Attempt 1 remains pending action-time confirmation before the prepared credential is submitted.
