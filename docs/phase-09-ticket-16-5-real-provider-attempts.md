# Phase 09 Ticket 16.5 — Real-provider generation attempts

## Goal

Generate and visibly run a playable game from this exact editor prompt:

> Create a top-down game where pressing the existing movement action makes the player perform a short, visibly faster dash.

- Required model: `gpt-5.6-luna`
- Credential source: an existing request keyword configured in `.env.local` (secret value omitted)
- Prompt-run limit: 20 (expanded by the user after Attempts 5, 9, and 12)
- Success condition: the generated game is playable in `/editor` and the successful browser remains open for human inspection
- Temporary-fix debt: tracked in [Phase 09 Ticket 16.5 — Temporary-fix ledger](./phase-09-ticket-16-5-temporary-fix-ledger.md)

## Preflight

- Production build: passed before the first prompt run.
- Full automated suite: 107 files / 1,073 tests passed.
- Browser conformance verifier: all 25 modes passed.
- Request keyword: configured and nonempty.
- Environment model override: unset, so the editor-selected model remains authoritative.
- Earlier browser-conformance cascade: the hidden runtime depended on replaceable Next/Turbopack assets; it now uses a self-contained opaque `srcdoc` heartbeat runtime.

## Attempts

### Attempt 1 — Failed

- Model: `gpt-5.6-luna`
- Result: failed
- Furthest pipeline stage: creator planning completed; `mechanic_validation` rejected the planned intent before foundation or generated-mechanic provider work began.
- Failure: `intent.triggers` did not use the generated host's canonical `logical_action` trigger. The host reported: `The current top-down generated-mechanic host requires the canonical "logical_action" trigger and supports only optional "install" alongside it.`
- Classification: substantive planner/routing vocabulary mismatch; a blind rerun could reproduce it.
- Fix approach: trace the planning prompt and routing boundary, add a regression reproducing a dash intent that inherits built-in movement vocabulary, then normalize or constrain the routed generated intent to the host-supported trigger without weakening the built-in fast path.
- Fix result: added a red-to-green routing regression for a movement-triggered dash and a provider-prompt regression. The trusted routing boundary now translates the built-in `logical_move_action` alias to `logical_action` only after built-in resolution has been ruled out, while preserving the exact active movement action connection. The planner now explicitly distinguishes fully covered movement from a partially covered dash extension. Focused tests passed (2 files / 15 tests).

### Attempt 2 — Failed

- Model: `gpt-5.6-luna`
- Result: failed
- Furthest pipeline stage: the corrected intent passed creator routing and reached the runtime foundation's real-browser Mechanic Execution Realm conformance suite; source generation had not started.
- Failure: the first seven resource probes passed with real browser attestation. `resource_consecutive_failures` then failed with `Candidate execution acknowledgement did not match the active probe.` The conformance session disposed, so determinism, opaque-handle, cleanup, recovery, and heartbeat checks reported a 16-issue cascade.
- Classification: substantive SES executor-pool lifecycle race, not a model rerun issue. Two earlier containment probes deliberately terminated the two warm executor workers; under production load, replacements were still starting when the next probe crossed the fixed 50 ms deadline. Its terminate request raced the delayed execute acknowledgement.
- Fix approach: retain one warm executor after the two known containment probes by sizing the controller pool to three, and explicitly cancel an execution that is still waiting for a worker slot when its matching termination request arrives so no stale acknowledgement can dispose the browser session.
- Fix result: implementation added; conformance/session unit suites pass (2 files / 39 tests). Production build and real-browser Attempt 3 pending.

### Attempt 3 — Failed

- Model: `gpt-5.6-luna`
- Result: failed
- Furthest pipeline stage: runtime foundation conformance; all probes after the first remained responsive and browser-attested, proving the Attempt 2 pool/cancellation fix removed the prior cascade.
- Failure: only `admitted_capability_calls` timed out. Its result was `terminated` with `execution_deadline_exceeded`, while the other 31 probes passed their browser-attestation requirements.
- Classification: substantive production composition defect. The standalone real-candidate QA waits for `ses_controller_ready`, but `createBrowserRuntimeFoundation` created the session and started the 50 ms conformance deadline immediately after constructing the Worker. On a cold production bundle, the three SES executors had not finished booting before the first probe.
- Fix approach: expose the controller's existing trusted readiness handshake and require the production browser foundation to await it before loading/running conformance. Preserve cleanup if readiness rejects or times out.
- Fix result: red-to-green foundation ordering regression added; foundation/conformance/session suites pass (3 files / 43 tests), with targeted ESLint passing. Production build and real-browser Attempt 4 pending.

### Attempt 4 — Failed

- Model: `gpt-5.6-luna`
- Result: failed
- Furthest pipeline stage: the complete browser foundation passed; contract generation succeeded; source generation ran through the bounded initial and repair attempts, then ended at `repair_exhausted` before deterministic evaluation.
- Failure: every source candidate omitted the accepted contract's required `fixed_step` callback. The exact terminal issue was `callbacks / callback_coverage_mismatch / Accepted lifecycle callback kind "fixed_step" is missing from the source candidate.`
- Classification: substantive source-provider instruction weakness. The full contract and repair issue were present, but the required callback set was implicit across `lifecycle.callbacks`, `lifecycle.fixedStep`, and the unconditional dispose rule; the model repeatedly produced the primary action callback without the derived fixed-step callback.
- Fix approach: derive and render one exact callback-kind checklist adjacent to the source schema, and require the returned callbacks array to equal it after every initial or repair attempt. Explicitly call out that `fixed_step` remains mandatory even when `logical_action` performs the visible effect.
- Fix result: red-to-green prompt regression added; source prompt/provider/service/orchestrator suites pass (4 files / 64 tests), with targeted ESLint passing. Production build and final allowed real-browser Attempt 5 pending.

### Attempt 5 — Failed

- Model: `gpt-5.6-luna`
- Result: failed; this exhausted the initial five-prompt-run cap. The user subsequently expanded the cap to 10.
- Furthest pipeline stage: browser foundation and contract generation passed; the exact callback checklist was honored; source generation reached bounded repairs and stopped at `repair_exhausted` during TypeScript typechecking, before deterministic evaluation and Game Pack handoff.
- Failure: the candidate repeatedly read `observation.movementDirection`, but the exact source-visible `MechanicObjectObservation` type exposes only `active`, `kind`, `position`, `properties`, and `velocity`. The terminal issue was `callbacks.1.source / type_failure / Property 'movementDirection' does not exist...`.
- Classification: substantive source-provider type-documentation gap. Capability signatures named `MechanicObjectObservation` and `MechanicMotionMutation`, but the prompt did not include their structural definitions. The accepted assumption asked for current movement/facing direction, leading the model to invent a plausible field.
- Fix approach: render the exact source-visible observation and motion-mutation shapes next to the capability documentation; explicitly forbid invented direction/facing fields and instruct source generation to normalize `velocity.x`/`velocity.y`, using a bounded deterministic fallback only when both are zero.
- Fix result: red-to-green source-prompt regression added; source prompt/provider/service/orchestrator suites pass (4 files / 64 tests), with targeted ESLint passing. No sixth paid run was made, so end-to-end playability remains unverified.

## Checkpoint after Attempt 5

- Successful playable generation: **not yet achieved**.
- Highest verified stage: accepted creator plan, generated route, complete browser foundation, accepted generated-mechanic contract, and source-generation repair/typecheck boundary.
- Remaining verification: Attempt 6 will test the source-visible type guidance and continue through deterministic evaluation, handoff, and visible gameplay. Attempts 6–10 are authorized if further substantive failures require fixes.

### Attempt 6 — Failed

- Model: `gpt-5.6-luna`
- Result: failed.
- Furthest pipeline stage: browser foundation passed and contract generation reached exact accepted-intent lineage validation; bounded contract repairs ended at `repair_exhausted` before source generation.
- Failure: the generated contract paraphrased four accepted outcome identifiers instead of retaining the exact accepted tokens: `player_performs_a_short_visibly_faster_dash`, `player_position_changes_in_current_movement_or_facing_direction`, `player_returns_to_normal_movement_after_dash`, and `dash_does_not_leave_arena`.
- Classification: substantive contract-provider instruction weakness. The validator correctly failed closed, but the prompt only said to preserve meaningful requirements; it did not render one explicit exact-token checklist for `behavior.triggers` and `behavior.outcomes`, so every repair could remain semantically similar while failing exact lineage.
- Fix approach: render the accepted trigger and outcome arrays as exact JSON adjacent to the contract shape, explicitly require literal token preservation on initial and repair attempts, and add a red-to-green prompt/provider regression before Attempt 7.
- Fix result: red-to-green exact-token prompt regression added. The provider now receives separate exact JSON arrays for accepted behavior triggers and outcomes plus a literal-copy rule that applies to initial and repair attempts. Contract prompt/provider/service suites pass (3 files / 21 tests).

## Checkpoint after Attempt 6

- Successful playable generation: **not yet achieved**.
- Highest verified stage: accepted creator plan, generated route, complete browser foundation, and generated-contract exact-lineage validation.
- Remaining verification: Attempts 7–10 may continue after the contract exact-token guidance is fixed and verified.

### Attempt 7 — Failed

- Model: `gpt-5.6-luna`
- Result: failed.
- Furthest pipeline stage: creator planning, browser foundation, exact contract lineage, source generation, parsing, typechecking, compilation, and static inspection passed. Deterministic runtime evaluation ran both accepted scenarios and bounded repair, then ended at `repair_exhausted`.
- Failure: both `dash_activates_and_moves_player` and `dash_ends_after_duration_and_cooldown_expires` crossed the fixed runtime `operations_per_tick` budget: each attempted operation 17 against the hard limit of 16.
- Classification: substantive source-provider resource-accounting guidance gap. The prompt supplied the numeric budget and per-capability costs, but did not explain that the operations counter is a hard maximum for one callback execution, that repeated/looped capability calls multiply the charge, or that repair must simplify the callback's maximum path below the limit.
- Fix approach: add an exact source-authoring resource-accounting checklist and regression: every possible callback path must remain within 16 operations, every awaited capability call is charged by its documented cost, and repair after an over-budget issue must remove/simplify calls rather than preserve an equivalent over-budget path.
- Fix result: red-to-green source-prompt regression added. The prompt now defines the hard per-callback limit, explains cumulative and looped capability charges, requires maximum-path accounting, and tells repair attempts to remove/combine/avoid calls after an over-budget failure. Source prompt/provider/service/orchestrator suites pass (4 files / 64 tests), with targeted ESLint passing.

## Checkpoint after Attempt 7

- Successful playable generation: **not yet achieved**.
- Highest verified stage: deterministic runtime evaluation of an accepted, compiled source artifact.
- Remaining verification: Attempts 8–10 may continue after the operation-budget guidance is fixed and verified.

### Attempt 8 — Failed

- Model: `gpt-5.6-luna`
- Result: failed.
- Furthest pipeline stage: planning, browser foundation, contract/source generation, typechecking, compilation, static inspection, and runtime resource enforcement passed. Evaluation reached top-down host observation admission and bounded repairs, then ended at `repair_exhausted`.
- Failure: contract scenarios requested host properties `velocity_magnitude` and `inside_region`, but neither is exposed by the current top-down evaluator fixture.
- Classification: substantive contract-provider host-vocabulary gap. The contract prompt described the required observable motion effect but did not enumerate the exact evaluator-visible binding property keys, so the model invented semantically reasonable derived properties that the retained host cannot read.
- Fix approach: derive and render the exact top-down host observation-property catalog in the contract prompt, forbid derived aliases, and add a red-to-green prompt regression before Attempt 9.
- Fix result: red-to-green prompt regression added. The exact property catalog is now a shared host-profile constant consumed by both the contract prompt and evaluation fixture; the prompt forbids invented derived aliases and points scenario authors to supported scalar components or evaluator-authored motion evidence. Contract prompt/provider/service plus browser-fixture suites pass (4 files / 30 tests).

## Checkpoint after Attempt 8

- Successful playable generation: **not yet achieved**.
- Highest verified stage: compiled source executed within budget and reached evaluator/host observation admission.
- Remaining verification: Attempts 9–10 may continue after exact observation-property guidance is fixed and verified.

### Attempt 9 — Failed after acceptance

- Model: `gpt-5.6-luna`
- Result: generated evaluation and acceptance succeeded, but the visible playable-game criterion failed.
- Furthest pipeline stage: the generated project passed planning, foundation, contract/source generation, deterministic evaluation, handoff, durable acceptance, and runtime mount. The editor reported “Runtime is running in the sandbox” and named the accepted game `Dashlight Run`.
- Failure: the mounted runtime surface remained blank. Browser diagnostics showed a post-mount `ZodError`: runtime validation evidence was persisted without linking the accepted generated mechanic artifact from the Playable Build and each validation-evidence record. This threw inside `onValidationEvidence`, so UI status was a false positive and visible playability was not established.
- Classification: substantive post-acceptance GamePack evidence-linkage defect; a blind rerun would preserve the broken persistence path.
- Fix approach: trace the runtime-validation evidence append/persistence seam, preserve the accepted generated-mechanic artifact IDs and exact build linkage when runtime evidence is added, add a regression that composes a real accepted GamePack through the callback, and rerun the final authorized Attempt 10.
- Fix result: the production-shaped regression reproduced the browser's exact missing-build/missing-evidence lineage errors, then passed after the writer began preserving same-ID evidence artifact links and merging first-playable evidence into the existing accepted build instead of replacing its identity and generated-artifact relationships. GamePack, handoff, editor persistence/session, and normal generated-entry suites pass (5 files / 137 tests).

## Checkpoint after Attempt 9

- Successful playable generation: **not yet achieved**; accepted metadata alone does not satisfy the visible-play criterion.
- Highest verified stage: durable generated-mechanic acceptance and specialized runtime mount.
- Remaining verification: Attempts 10–12 are authorized after fixing the runtime evidence-linkage failure.

### Attempt 10 — Failed

- Model: `gpt-5.6-luna`
- Result: failed before handoff.
- Furthest pipeline stage: planning, foundation, exact contract/source generation, typechecking, compilation, static inspection, and runtime evaluation; bounded repair ended at `repair_exhausted`.
- Failure: scenario `dash_ends_and_recovery_expires` again reported `Resource operations_per_tick exceeded 16 with 17.`
- Classification: repeated substantive failure after exact provider guidance. Because the model received a hard per-callback budget checklist and still failed at the same 17th operation, the next investigation targets the executor's counter boundary: `operations_per_tick` may be accumulating across a multi-callback scenario instead of resetting at the lifecycle/tick boundary promised to source authors.
- Fix approach: trace the SES execution kernel's resource-counter lifetime against lifecycle steps, reproduce the 17th-operation failure with multiple individually-under-budget callbacks, and correct the trusted runtime boundary if the counter is cumulative.
- Fix result: tracing showed the runtime intentionally applies the 16-operation counter to one host lifecycle operation; an `advance_time` step accumulates every scheduled/fixed-step callback it dispatches. The source prompt had incorrectly described a per-callback boundary. Red-to-green regressions now document the true cumulative boundary, and the contract prompt requires one-shot `time_schedule`/scheduled callbacks instead of fixed-step polling for dash or cooldown expiry. Contract/source prompt/provider/service/orchestrator suites pass (7 files / 85 tests).

## Checkpoint after Attempt 10

- Successful playable generation: **not yet achieved**.
- Highest verified stage remains durable acceptance/runtime mount from Attempt 9, but visible playability failed there.
- Remaining verification: Attempts 11–12 remain after resolving the repeated runtime accounting failure.

### Attempt 11 — Failed

- Model: `gpt-5.6-luna`
- Result: failed before generated-mechanic routing.
- Furthest pipeline stage: creator planning produced a candidate Game Spec and used its one planning repair; semantic validation rejected both candidates.
- Failure: `entities.center_obstacle_entity` was not referenced by any spawn zone or active mechanic. The repair repeated the same orphan entity.
- Classification: minor/stochastic provider-plan defect, correctly caught by existing semantic validation. The exact prompt passed this boundary on every relevant earlier attempt, so a fresh rerun is more appropriate than weakening entity reachability or adding mechanic-specific behavior.
- Fix approach: no code change; make one fresh GPT-5.6 Luna run using the exact prompt and credential keyword.

## Checkpoint after Attempt 11

- Successful playable generation: **not yet achieved**.
- Remaining verification: Attempt 12 is the final authorized prompt run.

### Attempt 12 — Failed

- Model: `gpt-5.6-luna`
- Result: failed; this exhausted the authorized 12-prompt-run cap.
- Furthest pipeline stage: creator planning, browser foundation, contract generation, source generation, and bounded contract/source repair completed far enough to run the least-authority source-use validator; the run ended at `repair_exhausted` before deterministic evaluation and Game Pack handoff.
- Failure: the generated contract granted capability `time_read`, but the final generated source did not call it. The exact terminal issue was `grant.capabilities.4 / capability_not_used / Granted capability "time_read" has no verified source use and would provide unjustified authority.`
- Classification: substantive generated contract/source consistency failure. The retained validator correctly rejected unused authority, and the bounded repair attempts did not remove the unused grant or add a justified source use.
- Fix approach: after the prompt-run cap was expanded to 20, route the canonical source-proven `unused_capability` evidence back to the contract stage, and tell contract repair to remove the exact unused declaration unless the accepted behavior genuinely requires it. Do not weaken the least-authority validator or add a meaningless source call.
- Fix result: red-to-green continuation and contract-prompt regressions pass (2 files / 14 tests). The artifact-scoped pipeline now attributes source-proven unused authority to the contract and invalidates/regenerates its downstream source; contract repair receives an explicit least-authority correction rule. Attempt 13 will provide real-provider verification.

## Final checkpoint after Attempt 12

- Successful playable generation: **not achieved within the first 12 authorized GPT-5.6 Luna prompt runs**.
- Highest verified stage: Attempt 9 durably accepted and mounted a generated project, but the runtime surface was blank because of a post-acceptance evidence-linkage defect. That defect was fixed and covered by production-shaped tests, but no later paid run reached acceptance to verify visible playability end to end.
- Final run stage: least-authority contract/source validation, ending in bounded repair exhaustion before deterministic evaluation.
- Paid prompt runs performed at this checkpoint: **12 of 20**.
- Browser state at this checkpoint: Attempt 12 ended on its failure report; a fresh production editor will be opened for Attempt 13.

### Attempt 13 — Succeeded

- Model: `gpt-5.6-luna`
- Result: succeeded; the requested playable game was generated, evaluated, accepted, mounted, and visibly rendered in `/editor`.
- Furthest pipeline stage: complete. Creator planning, browser foundation, contract generation, source generation, parsing, typechecking, compilation, static inspection, least-authority validation, deterministic evaluation, Final Game Spec assembly, durable Game Pack handoff, first-playable validation, and specialized Phaser runtime mount all passed.
- Generated project: `Momentum Dash` — “Collect repositioning energy pickups while using the movement action to trigger a short, visibly faster dash.”
- Visible verification: the sandboxed Phaser iframe visibly rendered the `Momentum Dash` HUD, a cyan player, a world obstacle, and an energy collectible rather than a blank surface. The editor reported `Runtime is running in the sandbox.`
- Interaction/runtime verification: Pause changed the editor control to Resume and the runtime resumed successfully. Browser diagnostics contained only Phaser's normal startup banner and no page/runtime errors.
- Attempt 12 fix verification: the production build included source-proven unused-grant routing to contract repair plus the explicit least-authority repair rule. Attempt 13 passed the least-authority boundary with an accepted capability set and continued through visible runtime acceptance; no validator was weakened.
- Final disposition: goal achieved on Attempt 13. No Attempts 14–20 were made.

## Successful completion checkpoint

- Successful playable generation: **achieved on Attempt 13**.
- Paid prompt runs performed: **13 of the authorized maximum 20**.
- Required prompt: used exactly.
- Required model: `gpt-5.6-luna` selected and verified in the editor.
- Credential handling: used the configured request keyword; no OpenAI API key was exposed.
- Browser state: the successful `Momentum Dash` editor tab and its running production server were deliberately left open for human inspection.
