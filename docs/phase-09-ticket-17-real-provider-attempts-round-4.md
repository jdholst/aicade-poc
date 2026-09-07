# Phase 09 Ticket 17 — Real-provider attempts, round 4

## Goal

Generate and visibly run a playable game from this exact editor prompt:

> Create a top-down game where the player can shoot a projectile.

Constraints for this round:

- Attempt count restarted at **0 of 25** by explicit user authorization, increased from 12 to 20 after Attempt 7 and from 20 to 25 after Attempt 18.
- Every `/editor` submission uses `gpt-5.6-luna`.
- Provider access uses an accepted keyword from `.env.local` without recording it.
- `AICADE_TICKET_17_PLANNING_FIXTURE=1` replaces only creator planning with `planning-contract.json`.
- `AICADE_TICKET_17_SOURCE_FOCUS_FIXTURES=0` leaves both Generated Mechanic Contract and generated source calls on the actual configured provider.
- Every submission must reach a terminal editor outcome and record its deepest pipeline stage, failure, classification, fix, and fix result.
- Success requires a newly generated game to render visibly and be playable, with a projectile visibly originating at the player's live position. Leave that successful browser result open.
- Stop after Attempt 25 if no attempt succeeds.

## Attempt counter

- Real GPT-5.6 Luna prompt submissions performed: **25 of 25**.

## Attempt 1 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during deterministic evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; generated source reached deterministic evaluation in two contract scenarios. Final Game Spec assembly, handoff, browser first-playable validation, persistence, and runtime mount were not reached.
- Failure: `shoot_creates_and_moves_projectile` observed zero owned objects, and evaluator-authored lifecycle evidence for both `shoot_creates_and_moves_projectile` and `shoot_projectile_expires` recorded zero creation, actor-origin creation, travel, interaction, and destruction. Bounded repair did not make the routed `shoot_action` create a projectile.
- Classification: first occurrence is likely contract/source provider variance. The trusted evaluator correctly rejected the no-op behavior and supplied exact lifecycle deltas, so no pipeline relaxation or code change is warranted before one independent rerun.
- Fix/action: rerun the exact prompt once with a newly generated real contract/source pair.
- Fix result: Attempt 2 reached generated-source static validation, proving the rerun moved beyond the no-op evaluator result but exposed a separate source-authoring failure.

## Attempt 2 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: the server again emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during generated-source static validation/repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract generation completed; real source generation and its bounded repairs reached trusted static authority inspection. Deterministic evaluation, final Game Spec assembly, handoff, browser first-playable validation, persistence, and runtime mount were not reached.
- Failure: `callbacks.2.source` retained `forbidden_source_authority` with `Generated mechanic source cannot reference forbidden authority "constructor".` after bounded repair.
- Classification: substantive source-prompt/repair-guidance gap. The trusted static checker correctly rejects constructor/prototype escape surfaces, but the provider prompt named only generic dynamic evaluation and did not identify constructor, dynamic property, destructuring, alias, or Object-reflection forms or their allowed replacement vocabulary.
- Fix/action: keep static admission fail-closed; add mechanic-general initial and stage-failure guidance that explicitly removes constructor/prototype-chain access and rewrites behavior through direct granted capabilities, accepted callback context, named fields, ordinary values, and numeric array indices. Add a public prompt-builder regression first and document the provider-compliance shortcut as TF-31.
- Fix result: focused prompt suite passes 12/12 after the red-to-green change; 78 source-generation tests, lint, and production build also pass. Attempt 3 cleared static admission and reached deterministic evaluation, verifying that the constructor-authority failure was removed.

## Attempt 3 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding the production app with TF-31.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during deterministic evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; generated source passed typing/static admission and ran through deterministic evaluation. Final Game Spec assembly, handoff, browser first-playable validation, persistence, and runtime mount were not reached.
- Failure: scenario `projectile_is_created_and_travels` created one `player_projectile` at the actor origin and moved it 36 units, but left it active with no target interaction or destruction: `activeDelta: 1`, `actorOriginCreationsDelta: 1`, `createdDelta: 1`, `destroyedDelta: 0`, `simulatedDistanceTraveledDelta: 36`, `targetInteractionsDelta: 0`.
- Classification: source-provider variance. TF-25 already gives exact stage-failure instructions for positive target interaction and full transient cleanup, and the trusted evaluator correctly rejected the incomplete lifecycle. The strong positive actor-origin/travel evidence shows the current pipeline and TF-31 fix are functioning without a validation relaxation.
- Fix/action: rerun the exact prompt once with a newly generated real contract/source pair before considering another structural change.
- Fix result: Attempt 4 regressed to the constructor-authority failure despite the explicit guidance, demonstrating that TF-31 improves provider direction but cannot guarantee compliance.

## Attempt 4 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` with TF-31 active.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during generated-source static validation/repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract generation completed; real source generation and bounded repairs reached trusted static authority inspection. Deterministic evaluation and all later stages were not reached.
- Failure: `callbacks.2.source` retained `forbidden_source_authority` with `Generated mechanic source cannot reference forbidden authority "constructor".`
- Classification: repeated provider noncompliance with TF-31. The static gate remains correct; the new prompt guidance is demonstrably non-deterministic because Attempt 3 cleared it while Attempt 4 retained it.
- Fix/action: make one final independent rerun as the discriminator between ordinary provider variance and an insufficient prompt-only strategy. If Attempt 5 repeats this exact failure, stop adding prompt prose and investigate a structural authoring constraint.
- Fix result: Attempt 5 repeated the same terminal message, confirming that prompt-only TF-31 is insufficient and activating the structural diagnostic investigation.

## Attempt 5 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` with TF-31 active.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during generated-source static validation/repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract generation completed; real source generation and bounded repairs reached trusted static authority inspection. Deterministic evaluation and all later stages were not reached.
- Failure: `callbacks.2.source` again retained `forbidden_source_authority` with `Generated mechanic source cannot reference forbidden authority "constructor".`
- Classification: deeper diagnostic defect plus possible provider noncompliance. Trusted static inspection intentionally rejected both explicit constructor/prototype access and non-provably numeric runtime-computed property access, but it projected both classes as literal `"constructor"`. The provider therefore could not know whether to remove an actual constructor chain or a computed lookup.
- Fix/action: preserve the same fail-closed policy while distinguishing runtime-computed property access from explicit constructor authority in static evidence. Add a public source-builder regression proving the computed-access case is still rejected with its precise replacement vocabulary, retain hostile explicit constructor/prototype coverage, and add matching repair guidance.
- Fix result: red-to-green static-admission and prompt suites pass 70/70; 79 broader source-generation tests, lint, and production rebuild also pass. Attempt 6 proved that the previously ambiguous rejection was runtime-computed property access rather than a literal constructor chain.

## Attempt 6 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding with precise computed-access evidence.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during generated-source static validation/repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract generation completed; real source generation and bounded repairs reached trusted typed dynamic-authority inspection. Deterministic evaluation and all later stages were not reached.
- Failure: `callbacks.3.source` retained `forbidden_source_authority` with the newly precise message: `Generated mechanic source cannot use runtime-computed property access. Use a named property or a provably numeric array index instead.`
- Classification: confirmed generated-source authoring incompatibility rather than literal constructor access. The diagnostic fix worked and preserved fail-closed admission, but generic `provably numeric array index` wording did not give GPT-5.6 Luna a concrete rewrite shape for variable-index iteration.
- Fix/action: keep the checker unchanged. Add explicit mechanic-general source guidance that variable array indices are not accepted even when annotated `number`; iterate collections with `for...of`, and use a literal index such as `[0]` only for an explicitly guarded first item. Add the initial and exact repair regression before Attempt 7 and retain this prompt dependency under TF-31.
- Fix result: red-to-green prompt coverage passes; 79 source-generation tests, lint, and production build pass. Attempt 7 cleared computed-access static admission and reached deterministic evaluation.

## Attempt 7 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding with the TF-31 safe-iteration recipe.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during deterministic evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing and static admission, then executed through deterministic evaluation and replay. Final Game Spec assembly and later stages were not reached.
- Failure: both `shoot_create_travel_cleanup` and `shoot_cooldown_limits_repeat` observed zero projectile creation, actor-origin creation, travel, target interaction, and destruction; `cooldown_until` remained `0` instead of `250`. Replay also reported that identical inputs produced different observable evidence.
- Classification: provider candidate-quality variance after the targeted static fix. Existing lifecycle-delta and temporal repair guidance already addresses the zero behavior and cooldown mismatch, and deterministic replay correctly rejected the unstable source.
- Fix/action: rerun the exact prompt with a new real contract/source pair; do not weaken deterministic evaluation or add another code change for this first post-fix occurrence.
- Fix result: Attempt 8 passed source typing/static admission and reached realm execution, then exceeded the callback wall-clock budget by 1 ms.

## Attempt 8 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during generated-source realm execution/repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission and began realm execution. Full deterministic scenario evidence and all later stages were not reached.
- Failure: `realm.execute` reported `Resource callback_milliseconds exceeded 8 with 9.`
- Classification: first-occurrence execution-budget variance. The callback exceeded the hard budget by only 1 ms, and there is not yet evidence that a deterministic source shape or host regression consistently requires more than the accepted budget.
- Fix/action: rerun once with a new real contract/source pair while keeping the 8 ms gate unchanged. If the same resource dimension repeats, inspect callback-cost guidance instead of raising the limit.
- Fix result: Attempt 9 repeated the same 9 ms callback overrun and added deterministic replay mismatch, so the first-occurrence variance classification is closed.

## Attempt 9 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during deterministic evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission, entered deterministic scenario evaluation, and reached replay comparison. Final Game Spec assembly and later stages were not reached.
- Failure: scenario `shoot_travel_and_expire` reported `Resource callback_milliseconds exceeded 8 with 9.` Replay also reported different observable evidence for identical inputs.
- Classification: substantive source-authoring guidance gap. Two independent provider pairs exceeded the same callback CPU dimension by the same amount, while the prompt currently explains capability-operation units but never states the separate `maximumCallbackMilliseconds` active-work budget or a repair strategy.
- Fix/action: keep the 8 ms gate unchanged. Add mechanic-general initial guidance for bounded synchronous callback work and exact stage-failure guidance that removes repeated computation, nested/unbounded iteration, sorting, serialization, and redundant local scans; prefer one bounded `for...of` pass with early exit and direct capability operations. Add the prompt regression first and record this extension under TF-04.
- Fix result: red-to-green prompt coverage passes; 80 source-generation tests, lint, and production build pass. Attempt 10 cleared the callback CPU failure but repeated the all-zero action behavior.

## Attempt 10 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding with TF-04 callback CPU guidance.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during deterministic evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission and callback resource execution, then reached deterministic scenario evaluation. Final Game Spec assembly and later stages were not reached.
- Failure: both `projectile_creation_motion_and_cleanup` and `cooldown_rate_limited_shooting` observed zero projectile creation and zero actor-origin/travel/interaction/destruction lifecycle deltas after `shoot_action`.
- Classification: repeated temporal-boundary source-authoring gap. Attempt 7 showed the same all-zero action plus `cooldown_until` remaining `0` instead of `250`. A deadline initialized to `0` must accept an action at simulation time `0`; a provider-authored `now <= cooldownUntil` guard rejects that first action and leaves every downstream delta at zero.
- Fix/action: preserve deterministic evaluation. Expand temporal guidance so `*_until` state is explicitly a deadline: reject only while `now < deadline`, accept equality, and after acceptance write `now + duration`. Add exact repair guidance for an all-zero action with unchanged deadline state and cover it red-to-green under TF-30.
- Fix result: red-to-green deadline guidance passes 80 source-generation tests, lint, and production build. Attempt 11 did not reach source generation because the pre-source browser conformance foundation failed.

## Attempt 11 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding with TF-30 deadline-boundary guidance.
- Provider calls: the server emitted the planning-fixture warning for `planning-contract.json`; generation stopped at the foundation before a real source call could be evaluated.
- Terminal outcome: `foundation` failure before source generation.
- Furthest pipeline stage: fixture-backed planning ran, then the secure mechanic runtime conformance foundation failed. Contract/source evaluation and all later stages were not reached.
- Failure: 15 conformance checks failed after the browser session did not execute probes through its captured candidate endpoint or observe fresh runtime-iframe heartbeats. Cascading failures covered opaque-handle isolation, cleanup/recovery, and 13 browser-runtime responsiveness checks.
- Classification: minor infrastructure/session failure. The same production conformance foundation passed Attempts 1–10; this failure occurred before the new deadline guidance or generated source could be exercised and is not tied to provider output.
- Fix/action: retry once without code changes. Preserve fail-closed conformance and do not reinterpret the 15 cascading checks as source failures.
- Fix result: Attempt 12 passed the foundation, then repeated the 9 ms callback/replay failure despite TF-04 guidance, proving the failure is below provider authoring.

## Attempt 12 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during deterministic evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission, entered deterministic scenario evaluation, and reached replay comparison. Final Game Spec assembly and later stages were not reached.
- Failure: scenario `projectile_creation_and_travel` reported `Resource callback_milliseconds exceeded 8 with 9.` Replay also reported different observable evidence for identical inputs.
- Classification: trusted runtime watchdog race, not remaining provider complexity. Generated-admitted callbacks compile outside the active-work meter, and the executor reports exact accumulated active time across capability suspensions. The controller nevertheless armed a kill timer for `remaining + 1 ms`; cross-Worker delivery of the executor's finish/suspend measurement could arrive after that timer and produce the synthetic `limit + 1` observation plus replay drift.
- Fix/action: retain the exact 8 ms measured CPU limit. Add a bounded 16 ms delivery grace only to the outer watchdog timer, while continuing to reject any executor-reported active measurement above 8 ms. Runaway synchronous callbacks remain forcibly contained within 24 ms, below the 50 ms conformance execution deadline. Lock the separation in a focused policy regression before changing the controller.
- Fix result: the new policy regression passed 1/1; the focused worker-realm suite passed 21/21; the source-generation suites passed 71/71; lint and the production build passed. Attempt 13 no longer reported replay divergence, but the generated callback still produced the exact 9 ms resource failure, so bounded delivery grace fixed the controller race without making this candidate fit the unchanged active-CPU budget.

## Attempt 13 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding with the bounded watchdog-delivery grace.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during deterministic scenario execution/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission and reached scenario `shoot_travel_and_cleanup`. Final Game Spec assembly and later stages were not reached.
- Failure: `shoot_travel_and_cleanup` reported only `Resource callback_milliseconds exceeded 8 with 9.` Unlike Attempts 9 and 12, the terminal evidence did not include replay divergence.
- Classification: generated-candidate active-work variance after the watchdog correction. The missing replay error is consistent with the delivery-race fix working, while the remaining exact resource failure shows this callback still exceeded the unchanged executor-measured 8 ms budget or encountered another active-work containment path. One independent real contract/source pair is warranted before changing the trusted budget or runtime again.
- Fix/action: rerun the exact prompt once with a new real contract/source pair. Keep the 8 ms budget and bounded watchdog grace unchanged; if Attempt 14 repeats the exact failure, capture the generated callback at the provider boundary and distinguish actual callback structure from meter overhead before another fix.
- Fix result: Attempt 14 failed earlier in the shared conformance foundation, so it did not test a new generated callback.

## Attempt 14 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: the planning fixture was active, but generation stopped in the shared browser conformance foundation before a new generated callback could be evaluated.
- Terminal outcome: `foundation` failure.
- Furthest pipeline stage: fixture-backed planning ran; shared foundation install did not complete. Real generated-source evaluation and all later stages were not reached.
- Failure: `foundation.lifecycle` reported `Foundation install did not complete.`
- Classification: minor infrastructure/session failure. This is an earlier shared-runtime failure, independent of provider candidate structure and the active callback budget.
- Fix/action: retry immediately without code changes while preserving fail-closed foundation validation.
- Fix result: Attempt 15 passed the foundation and reached deterministic evaluation, confirming Attempt 14 was transient.

## Attempt 15 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: the server emitted only the planning-fixture warning for `planning-contract.json`; contract and source used the actual configured provider path.
- Terminal outcome: `repair_exhausted` during deterministic evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission and ran through three deterministic scenarios plus replay. Final Game Spec assembly and later stages were not reached.
- Failure: `projectile_creation_and_travel` observed zero owned projectiles and zero lifecycle deltas; `projectile_cleanup_after_lifetime` reported `Resource callback_milliseconds exceeded 8 with 9.`; `rate_limited_projectile_remains_bounded` also observed zero lifecycle deltas; replay produced different observable evidence for identical inputs.
- Classification: repeated callback-budget/replay defect requiring source-boundary evidence. Attempt 13 removed replay divergence for one candidate, but this independent pair reintroduced both exact 9 ms containment and nondeterminism. Additional blind reruns would not distinguish provider callback cost from execution-meter overhead.
- Fix/action: add a temporary, env-gated source-provider reporter that captures only returned source candidates and attempt metadata, never credentials. Use it for the next real run, inspect the exact callback shape, then remove the reporter before final handoff. Keep validation and the 8 ms budget unchanged.
- Fix result: source capture passed its red-to-green regression 8/8, lint, and production build. Attempt 16 captured both real source candidates and reproduced the callback/replay failure.

## Attempt 16 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` with temporary source-candidate capture enabled.
- Provider calls: planning alone used `planning-contract.json`; contract and both initial/repair source candidates came from the real configured provider.
- Terminal outcome: `repair_exhausted` during deterministic evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and initial/repair source generation completed; both source candidates passed typing/static admission and reached deterministic scenario execution plus replay. Final Game Spec assembly and later stages were not reached.
- Failure: `shoot_creates_moves_and_expires_projectile` and `shoot_projectile_cleanup_after_lifetime` each reported `Resource callback_milliseconds exceeded 8 with 9.` Replay again produced different observable evidence.
- Captured source evidence: the initial callback correctly created the projectile at `player.position`, then awaited time, state, object read/create/write, state write, and scheduling capabilities; fixed-step cleanup awaited spatial query plus per-object reads/mutations. The repair candidate added an owned-object query to `logical_action` and retained similar awaited cleanup. Neither candidate contained an 8 ms synchronous loop or other work proportional to host response latency.
- Classification: durable activity-meter accounting defect. The executor starts timing generated work, but each capability await is not marked suspended until a `MessageChannel` macrotask runs. The accumulated measurement therefore includes trusted event-loop delivery latency once per await; ordinary bounded callbacks can nondeterministically reach 9 ms, and replay can diverge even with identical inputs.
- Fix/action: replace only the trusted internal yield acknowledgement scheduler with a microtask. A microtask runs after the generated callback's current synchronous turn, so unawaited synchronous work remains metered; awaited capability host latency is excluded before the next macrotask; infinite synchronous work remains contained by the controller watchdog. Keep the 8 ms budget, capability-operation budgets, and 24 ms outer kill deadline unchanged. Add a scheduler-ordering regression and run the worker/runtime suites before Attempt 17.
- Fix result: the scheduler regression passed 1/1; focused callback/realm/watchdog suites passed 21/21; broader evaluator, conformance, and contained-runtime suites passed 66/66; lint and production build passed. Attempt 17 cleared callback resource failure and replay divergence entirely.

## Attempt 17 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding with microtask yield accounting.
- Provider calls: planning alone used `planning-contract.json`; contract and four initial/repair source candidates used the real configured provider.
- Terminal outcome: `repair_exhausted` during deterministic lifecycle evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission, all callback resource checks, and deterministic replay, then reached evaluator-authored lifecycle acceptance. Final Game Spec assembly and later stages were not reached.
- Failure: `shoot_creates_and_moves_projectile` produced strong positive evidence—`createdDelta: 1`, `actorOriginCreationsDelta: 1`, and `simulatedDistanceTraveledDelta: 36`—but the projectile remained active with `destroyedDelta: 0`. The intent has no targets, so `targetInteractionsDelta: 0` was not required by the assertion.
- Classification: provider contract/source lifecycle variance, not a remaining runtime defect. The microtask fix removed every 9 ms and replay error. The candidate correctly spawns from the live player position and travels; it did not complete cleanup within the contract scenario's observed horizon despite bounded repair.
- Fix/action: make one independent rerun with a fresh real contract/source pair while retaining the validated runtime fix and temporary source capture. Do not weaken lifecycle acceptance; if the same incomplete cleanup repeats, capture the real contract scenario horizon before changing generation guidance.
- Fix result: Attempt 18 again cleared callback/replay failures but exposed a contradictory provider-authored final-count observation.

## Attempt 18 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: planning alone used `planning-contract.json`; contract and source used the real configured provider.
- Terminal outcome: `repair_exhausted` during deterministic declared-observation evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission, callback resource checks, and deterministic replay, then reached model-declared final-state observation evaluation. Final Game Spec assembly and later stages were not reached.
- Failure: scenario `shoot_creates_travels_and_expires_projectile` declared final `owned_object_count` for `player_projectile` as `at_least 1`, but the actual final count was `0` after cleanup.
- Classification: first-occurrence provider contract variance. The contract prompt already states that a scenario advancing through explicit cleanup must declare final count `0`, and that a positive final count is valid only when the scenario ends before cleanup. The provider contradicted that final-state rule; source repair cannot satisfy both expiry cleanup and a surviving final projectile.
- Fix/action: rerun once with a fresh real contract/source pair. If the contradiction repeats, capture and validate the real contract scenario horizon at admission rather than trying to make source violate cleanup semantics.
- Fix result: Attempt 19 used a non-contradictory contract but exposed incorrect evaluator classification for immediate-creation scenarios.

## Attempt 19 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: planning alone used `planning-contract.json`; contract and source used the real configured provider.
- Terminal outcome: `repair_exhausted` during evaluator-authored causal lifecycle evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission, callback resource checks, and deterministic replay, then reached immediate post-action lifecycle acceptance. Final Game Spec assembly and later stages were not reached.
- Failure: scenario `shoot_creates_visible_projectile` correctly created one actor-origin projectile immediately after `shoot_action` (`activeDelta: 1`, `createdDelta: 1`, `actorOriginCreationsDelta: 1`), but the evaluator had authored `owned_object_lifecycle_unchanged_after_action` solely because the scenario had no later `advance_time` step.
- Classification: durable evaluator observation-classification defect. No-time action scenarios are not necessarily rejection/no-op scenarios; a positive model-declared final owned-object count identifies an intentional immediate-creation scenario. Treating it as unchanged makes correct source impossible to admit.
- Fix/action: add evaluator-authored `owned_object_creation_after_action` evidence for no-time scenarios that positively require an owned-object count. Require positive creation, a matching active increase, no immediate destruction, and actor-origin creation when the accepted lineage requires it. Preserve unchanged proof for zero/no-positive-count rejection scenarios and full lifecycle proof for scenarios with post-action simulated time.
- Fix result: red-to-green builder/evaluator regressions passed 32/32; broader evaluation, continuation, browser-fixture, and handoff suites passed 119/119; lint and production build passed. Attempt 20 reached handoff evidence validation and exposed a missing exhaustive branch for the new evidence kind.

## Attempt 20 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding with immediate-creation evaluation.
- Provider calls: planning alone used `planning-contract.json`; contract and source used the real configured provider.
- Terminal outcome: `deterministic_evaluation` handoff validation failure.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed admission and deterministic execution under the new immediate-creation evaluator, then reached final Game Pack handoff evidence validation. Browser first-playable mount and persistence were not reached.
- Failure: `deterministicEvaluation.evidence.scenarios` reported that evidence did not exactly cover the accepted contract. The evaluator emitted authentic `owned_object_creation_after_action` evidence, but the downstream handoff authenticity matcher recognized only full-lifecycle and unchanged-lifecycle assertions.
- Classification: internal exhaustive-union integration defect introduced by the durable Attempt 19 fix. Provider output is not implicated.
- Fix/action: extend handoff authenticity matching to derive the same three-way expected kind from scenario semantics, validate immediate creation deltas and actor origin, and include the new kind in bounded repair-evidence summarization. Add handoff and repair-message regressions before Attempt 21.
- Fix result: red-to-green downstream handoff and repair-message regressions passed 93/93; the complete affected evaluator, runtime, continuation, repair, and handoff suite passed 137/137; lint and production build passed. Attempt 21 did not reproduce the handoff mismatch but hit a transient realm startup timeout.

## Attempt 21 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding the complete three-kind evidence integration.
- Provider calls: planning alone used `planning-contract.json`; contract and source used the real configured provider.
- Terminal outcome: `repair_exhausted` due realm initialization failure.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; generated source reached secure realm creation. Callback execution, deterministic scenario evidence, final handoff, browser mount, and persistence were not reached for the final candidate.
- Failure: `realmAdapter.create` reported `SES Worker realm initialization timed out.`
- Classification: minor browser/worker infrastructure failure. The same realm initialized across prior attempts, and this failure does not exercise the new observation semantics.
- Fix/action: rerun without code changes while preserving fail-closed realm startup.
- Fix result: Attempt 22 passed realm startup and all internal evidence integration, then separated active travel scenarios from cleanup scenarios and exposed the remaining three-state lifecycle classification limit.

## Attempt 22 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: planning alone used `planning-contract.json`; contract and source used the real configured provider.
- Terminal outcome: `repair_exhausted` during evaluator-authored lifecycle evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed admission, callback resource checks, replay, and the complete handoff evidence schema, then reached multi-scenario lifecycle acceptance. Final Game Spec assembly and browser mount were not reached.
- Failure: `projectile_creation_and_motion` correctly created at actor origin and traveled 108 units while remaining active, but was rejected because the evaluator required destruction. `projectile_lifetime_cleanup` also remained active after traveling about 468 units, contradicting its declared final count `0` and correctly failing cleanup.
- Classification: one durable evaluator classification gap plus one genuine provider cleanup miss. A post-action time step can intentionally observe an active projectile before expiry; it must not always imply full cleanup. The separate cleanup scenario must continue to require destruction.
- Fix/action: add `owned_object_lifecycle_progress_after_action` for scenarios that advance time and positively require a final owned-object count. Require creation, actor origin when applicable, nonzero travel, and a matching positive active delta without requiring cleanup. Preserve full lifecycle for post-time scenarios that require final zero, immediate creation for no-time positive-count scenarios, and unchanged proof for no-time rejection scenarios. Integrate the new kind through evaluator, repair summary, and handoff authenticity with regressions before Attempt 23.
- Fix result: red-to-green fixture/evaluator/handoff/repair regressions passed 128/128; the full affected integration set passed 140/140; lint and production build passed. Attempt 23 exercised all four-state branches without an internal mismatch, but its provider source remained a no-op.

## Attempt 23 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` after rebuilding the four-state lifecycle model.
- Provider calls: planning alone used `planning-contract.json`; contract and source used the real configured provider.
- Terminal outcome: `repair_exhausted` during deterministic lifecycle evaluation/source repair.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed typing/static admission and reached immediate creation, active progress, and full cleanup evaluator branches. Final Game Spec assembly and browser mount were not reached.
- Failure: `shoot_creates_projectile`, `projectile_travels_then_expires`, and `cooldown_preserves_active_projectile` all observed zero creation, actor-origin creation, travel, interaction, and destruction. Positive model counts were also `0` instead of `1`.
- Classification: provider source candidate-quality variance. The evaluator selected and reported the correct four-state assertions, and the all-zero evidence directly indicates that the routed action performed no admitted behavior. Existing repair guidance already requires exact positive lifecycle deltas.
- Fix/action: rerun with a fresh real contract/source pair; do not alter the validated evaluator for a first all-zero candidate after this fix.
- Fix result: Attempt 24 produced a correct full lifecycle but repeated the positive-final-count contract contradiction from Attempt 18.

## Attempt 24 — failed

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: planning alone used `planning-contract.json`; contract and source used the real configured provider.
- Terminal outcome: `repair_exhausted` during deterministic declared/evaluator lifecycle evaluation.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; source passed admission and produced a complete actor-origin create/travel/destroy lifecycle under the four-state evaluator. Final Game Spec assembly and browser mount were not reached because the contract's declared final observation contradicted that lifecycle.
- Failure: scenario `shoot_creates_travels_and_expires` created at actor origin, traveled 432 units, and destroyed the projectile (`createdDelta: 1`, `destroyedDelta: 1`, `activeDelta: 0`), but the contract declared final `owned_object_count at_least 1` and therefore selected active-progress evidence.
- Classification: repeated real-provider contract semantic contradiction. Attempts 18 and 24 independently violated the prompt's final-state cleanup rule. Source cannot both expire the projectile and leave it active.
- Fix/action: add temporary contract-admission policy for transient create/move/destroy intents with a positive accepted `*_lifetime_ms` configuration. Sum post-action `advance_time`; when it meets/exceeds the accepted lifetime, reject any positive final owned-object count with exact repair evidence. This is a suffix-based bridge until the contract DSL carries an explicit cleanup-duration relation, so record it in the temporary-fix ledger. Preserve shorter active-progress scenarios.
- Fix result: red-to-green contract-admission regression passed 11/11; broader contract, orchestration, prompt, provider, and continuation coverage passed 60/60; planning-only selector cleanup passed 6/6; lint and production build passed. TF-32 records the suffix-based temporary policy. Attempt 25 stopped earlier at shared conformance infrastructure and therefore did not exercise a repaired real contract.

## Attempt 25 — failed; attempt ceiling reached

- Prompt/model: exact round prompt with `gpt-5.6-luna` on `http://localhost:3005` from the cleaned production build.
- Provider calls: planning used `planning-contract.json`; the run stopped in the shared foundation before generated source began. The temporary source-candidate reporter had already been removed, and the generated-mechanic contract/source route was restored to the real provider.
- Terminal outcome: `foundation` failure.
- Furthest pipeline stage: fixture-backed planning ran, then secure mechanic runtime conformance stopped before generated source execution. Contract/source candidate evaluation, final Game Spec assembly, handoff, browser first-playable mount, and persistence were not reached.
- Failure: 9 conformance checks failed: runaway containment, cleanup/recovery, missing fresh runtime-iframe heartbeats, and browser host responsiveness after runaway plus six resource probes.
- Classification: transient shared browser/runtime infrastructure failure, independent of TF-32 and provider candidate quality. The same production foundation passed prior attempts, but no additional prompt submission is authorized to discriminate it.
- Fix/action: none. The user-authorized ceiling of 25 `/editor` prompt submissions is reached, so stop without submitting Attempt 26.
- Fix result: goal not achieved within the authorized attempt ceiling.

## Round outcome

- Stopped at exactly **25 of 25** GPT-5.6 Luna submissions.
- No generated game reached a visible playable browser mount in this round, so the success condition was not met and the goal must not be marked complete.
- Durable progress retained: callback CPU accounting no longer charges trusted macrotask delivery latency; evaluator and handoff now authenticate rejection, immediate creation, active travel, and full cleanup as distinct lifecycle phases.
- Temporary policy retained and documented: TF-32 rejects positive final owned-object counts after an accepted `*_lifetime_ms` cleanup horizon until the contract DSL gains an explicit lifetime relation.
- Temporary diagnostic cleanup completed: the source-candidate capture wrapper, flag, and tests were removed before the final build; the requested planning-only fixture remains.
