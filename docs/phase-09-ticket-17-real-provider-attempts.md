# Phase 09 Ticket 17 — Projectile real-provider attempts

## Goal

Generate and visibly run a playable game from this exact editor prompt:

> Create a top-down game where the player can shoot a projectile.

- Required model: `gpt-5.6-luna`
- Credential source: an existing request keyword configured in `.env.local` (secret value omitted)
- Prompt-run limit: 20
- Success condition: the generated game is visibly playable in `/editor`, and the successful browser remains open for human inspection
- Temporary-fix debt: tracked in [Phase 09 Ticket 16.5 — Temporary-fix ledger](./phase-09-ticket-16-5-temporary-fix-ledger.md)

## Preflight

- Starting commit: `39a3f37`
- Available keyword variables: `KEYWORD_BLACK_FIELD`, `KEYWORD_GREEN_PANDA` (values omitted)
- Existing unrelated local JSON artifacts are preserved and remain untracked.
- Paid prompt runs performed in this Ticket 17 session: **20 of 20**.

## Attempts

### Attempt 1 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning and browser foundation completed; generated contract creation entered bounded repair and ended at `repair_exhausted` before source generation.
- Failure: `contract.ports` — `The retained top-down generated-mechanic host does not admit mechanic ports.`
- Classification: major provider-contract guidance/repair failure, not a likely transient rerun issue. The candidate repeatedly retained an unsupported port through the bounded contract repair loop.
- Fix approach: keep port admission fail-closed, but render the retained host's exact required `ports: []` value beside the trusted intent token checklists and require literal copying on every initial and repair attempt. When repair evidence reports `unsupported_runtime_ports`, explicitly remove the ports plus scenarios, capabilities, and lifecycle behavior that existed only to use them.
- Fix result: red-to-green provider-prompt coverage added. Contract prompt/provider/service and creator continuation suites passed (4 files / 33 tests), targeted ESLint passed, and the production build completed. Port 3005 was rebuilt and restarted before Attempt 2.
- Paid prompt runs performed: **1 of 20**.

### Attempt 2 — Failed with degraded output

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: a base game named `Projectile Training Grounds` was generated, validated, mounted, and visibly rendered, but the requested projectile mechanic was explicitly omitted; this does not satisfy the goal.
- Furthest pipeline stage: creator planning and mechanic routing. The trusted degraded fallback then completed base Game Spec validation, persistence, first-playable validation, and runtime mount. Generated contract/source/realm/handoff stages were not started (0 generated-provider calls).
- Failure: `intent.triggers / unsupported_generated_host_trigger` — the provider emitted an action-specific logical trigger rather than the retained generated host's canonical `logical_action` token.
- Classification: major deterministic routing vocabulary mismatch, not a minor rerun issue. The planner followed the creator's shoot-action semantics but duplicated that action name in the lifecycle trigger even though the exact action is already carried by the trusted input connection.
- Fix approach: generalize the existing post-built-in action-trigger adapter. Only after built-in resolution fails, map exactly one stable action-specific `logical_*_action` trigger (plus optional `install`) to canonical `logical_action`, while preserving the exact active input connection and continuing to reject multiple, event, or unrelated triggers.
- Fix result: red-to-green routing coverage now admits one action-specific logical alias while preserving its exact action connection and rejects multiple aliases. Planning, degraded-fallback, editor-generation, and generation-run suites passed (5 files / 51 tests), with targeted ESLint passing. Production rebuild/restart pending before Attempt 3.
- Paid prompt runs performed: **2 of 20**.

### Attempt 3 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: generated-mechanic routing passed and the run reached bounded artifact repair; while finalizing repair exhaustion, the persisted repair receipt failed its own schema validation before the editor could report the underlying rejected artifact issue.
- Failure: `artifactScopedRepair.exhausted.issues` was empty, and `artifactScopedRepair.exhausted` did not exactly reference the final rejected attempt that consumed the stage maximum.
- Classification: major deterministic repair-orchestration integrity failure, not a likely transient provider issue. The pipeline lost or mismatched the final failure evidence while constructing its repair-exhausted receipt, masking the actionable source/contract failure.
- Fix approach: preserve fail-closed exhaustion semantics while explicitly distinguishing direct stage failure from upstream-invalidation exhaustion. When an invalidated stage has consumed its attempt budget, copy the exact non-empty issue list and attempt identity from the rejected failure that caused the invalidation instead of the intentionally empty downstream repair trigger.
- Fix result: the regression reproduced the browser's exact two Zod errors before the change and passed afterward. Artifact-repair, GenerationRun schema, creator pipeline, editor integration, and editor run suites passed (5 files / 52 tests), targeted ESLint passed, and the production build completed. This is a durable receipt-model correction rather than a temporary permissive bypass, so no temporary-fix ledger entry was added.
- Paid prompt runs performed: **3 of 20**.

### Attempt 4 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: planning, generated-mechanic routing, contract generation, and source generation; source TypeScript validation ran through the bounded initial and repair attempts and ended with a valid `repair_exhausted` receipt before deterministic evaluation or Game Pack handoff.
- Failure: `callbacks.1.source` — `Cannot find name 'state'.`
- Classification: major deterministic source-generation guidance failure, not a likely transient rerun issue. The provider repeatedly authored a callback against an undeclared generic `state` identifier instead of the callback scope actually admitted by the generated-mechanic source contract.
- Fix approach: keep source typechecking fail-closed while rendering the compiler's exact four callback-scope identifiers (`capabilities`, `bindings`, `config`, and `lifecycleInput`), clarifying private-state and lifecycle-input access, forbidding plausible ambient aliases, and mapping unknown `state`/`event` repair diagnostics to the admitted expressions.
- Fix result: source prompt tests failed before the guidance and passed afterward. Prompt, provider, service, orchestrator, and creator-continuation suites passed (5 files / 76 tests), targeted ESLint passed, and the production build completed. Because this remains provider-compliance guidance pending a typed generated-source SDK or synthesized callback scaffolding, the shortcut and replacement are recorded in temporary-fix ledger item TF-03.
- Paid prompt runs performed: **4 of 20**.

### Attempt 5 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: planning, generated-mechanic routing, and bounded contract generation/repair; contract semantic validation exhausted before accepted source generation, deterministic evaluation, or Game Pack handoff.
- Failure: `privateState.0.initialValue` — private state `last_shot_time` did not match its declared `integer` type; `scenarios.0.setup.1.value` repeated the same incompatible value.
- Classification: major deterministic contract-authoring/type-lineage failure, not a likely transient rerun issue. The provider retained the same non-integer sentinel across the private-state declaration and scenario setup through bounded repair.
- Fix approach: preserve semantic validation while rendering its exact private-state value rules (`boolean`, finite `number`, `Number.isInteger`, `string`, and stable ID). Require one compatible value type across each declaration, scenario setup, and `state_equals` observation, with finite integer sentinels such as `-1` or `0` for unset timestamps/deadlines/cooldowns.
- Fix result: contract prompt tests failed before the dependent-type guidance and passed afterward. Contract prompt/provider/service, creator continuation, and generated-contract semantic suites passed (5 files / 56 tests), targeted ESLint passed, and the production build completed. Because dependent typing remains provider-compliance guidance after strict JSON parsing, the shortcut and durable schema replacement are recorded as temporary-fix ledger item TF-15.
- Paid prompt runs performed: **5 of 20**.

### Attempt 6 — Failed with degraded output

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: a base game named `Top-Down Projectile Game` was generated, validated, mounted, and visibly rendered, but the requested projectile mechanic was explicitly omitted; this does not satisfy the goal.
- Furthest pipeline stage: creator planning and mechanic routing. The trusted degraded fallback then completed base validation and runtime mount. Generated contract/source/realm/browser/handoff stages were not started (0 generated-stage calls).
- Failure: routing returned three capability-gap issues: `observable_target_reference_required` at `intent.targets`, `unsupported_generated_host_trigger` at `intent.triggers`, and `trusted_action_connection_required` at `intent.connections`.
- Classification: minor stochastic planner non-compliance for this single run. The same prompt reached generated contract/source stages in Attempts 3–5, and the current planning prompt already carries the exact target-role, trigger, and active-action connection rules. Trusted routing correctly refused to infer the missing authority.
- Fix approach: one unchanged rerun. If the same three-field planner omission repeats, reclassify it as major and diagnose the planning provider boundary rather than weakening routing.
- Paid prompt runs performed: **6 of 20**.

### Attempt 7 — Failed with degraded output

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: a base game named `Projectile Practice Arena` was generated, validated, mounted, and visibly rendered, but the requested projectile mechanic was explicitly omitted; this does not satisfy the goal.
- Furthest pipeline stage: creator planning and mechanic routing. The trusted degraded fallback then completed base validation and runtime mount. Generated contract/source/realm/browser/handoff stages were not started (0 generated-stage calls).
- Failure: the same three routing gaps as Attempt 6: `observable_target_reference_required` at `intent.targets`, `unsupported_generated_host_trigger` at `intent.triggers`, and `trusted_action_connection_required` at `intent.connections`.
- Classification: major deterministic planning-provider guidance failure after the exact omission repeated on two consecutive unchanged runs. The planner describes shooting in free-form intent text but does not materialize the concrete target entity, active shoot action, trigger, and connection required for authenticated generated-host execution.
- Fix approach: keep trusted routing fail-closed while giving planning an ordered cross-object alignment checklist: materialize a requested action as an active Game Spec control, then use canonical `logical_action`, connect the exact action ID, align actor/target roles with stable entity references, infer a simple referenced target when transient interaction evidence needs one, and retain the complete owned-object capability lifecycle. Admit `Space` as a distinct button control and authenticate it through `KeyboardEvent.code` in the generated-action bridge.
- Fix result: creator-planning prompt, Space provider-schema/semantic admission, and real runtime dispatch regressions failed before their changes and passed afterward. Planning provider/service/client/schema/route, routing, Spec Generation schema/service, top-down validation, and Phaser runtime suites passed (10 files / 141 tests), targeted ESLint passed, and the production build completed. The retained-host control shortcut is updated in TF-11 and the provider-side planning checklist is recorded as TF-16.
- Paid prompt runs performed: **7 of 20**.

### Attempt 8 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning and generated-mechanic routing passed with the new concrete-action alignment; bounded contract generation/repair then exhausted before accepted source generation, deterministic evaluation, or Game Pack handoff.
- Failure: `contract.bindings` contained a supporting/duplicate/non-routed binding beyond the exact routed entity set, and `contract.bindings.2.referenceKind` was not the host's admitted `entity` object binding.
- Classification: major deterministic contract-provider binding-manifest failure, not a likely transient rerun issue. The provider retained an over-broad binding set through all contract repairs despite the existing prose invariant.
- Fix approach: render an exact binding-reference manifest derived solely from trusted routed entity references and require `contract.bindings` to contain exactly one `cardinality: "one"`, `referenceKind: "entity"` binding per entry and no supporting, duplicate, or non-routed bindings. On binding admission failure, replace the entire array from the manifest; keep host admission unchanged.
- Fix result: initial and repair contract-prompt regressions failed before the manifest guidance and passed afterward. Contract prompt/provider/service, creator continuation, and generated-project planning suites passed (5 files / 49 tests), targeted ESLint passed, and the production build completed. Because the provider still authors fields trusted code already knows, the shortcut and deterministic-stamping replacement are recorded as TF-17.
- Paid prompt runs performed: **8 of 20**.

### Attempt 9 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, generated-mechanic routing, contract generation/repair, and initial source generation passed far enough to enter bounded source repair; source TypeScript validation then exhausted before deterministic evaluation or Game Pack handoff.
- Failure: `callbacks.1.source` — `Operator '<' cannot be applied to types 'number' and 'string | number | boolean | { readonly [key: string]: JsonValue; } | readonly JsonValue[]'.`
- Classification: major deterministic source-generation typing guidance gap, not a likely transient rerun issue. Generated code used an un-narrowed JSON-valued observation property or generic lifecycle payload in a numeric comparison, and repair retained the invalid operator despite exact compiler evidence.
- Fix approach: preserve fail-closed strict TypeScript validation and tell initial generation plus stage-failure repair to narrow any `JsonValue` with `typeof` before arithmetic or ordered comparison, while continuing to use contract-typed config fields directly.
- Fix result: the exact operator-diagnostic regression failed before the guidance and passed afterward. Source prompt, provider, service, and orchestrator suites passed (4 files / 67 tests), and targeted ESLint passed. Because this remains provider-compliance guidance pending typed observation/payload accessors or generated callback scaffolding, the shortcut and replacement are recorded as TF-18. Production rebuild/restart pending before Attempt 10.
- Paid prompt runs performed: **9 of 20**.

### Attempt 10 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning and generated-mechanic routing passed; bounded contract generation/repair then exhausted before accepted source generation, deterministic evaluation, or Game Pack handoff.
- Failure: `lifecycle.callbacks` — `Generated mechanics must declare the "install" lifecycle callback.`
- Classification: major deterministic contract-provider lifecycle-manifest failure, not a likely transient rerun issue. Every bounded contract candidate omitted the mandatory host installation callback despite exact validator evidence.
- Fix approach: derive and render an exact mandatory lifecycle callback manifest containing `install` plus accepted routed callback triggers such as `logical_action`; require every initial candidate and repair to copy the manifest and never remove `install`, while leaving optional behavior-justified callbacks and trusted validation unchanged.
- Fix result: initial-manifest and exact lifecycle-repair regressions failed before the guidance and passed afterward. Contract prompt/provider/service and creator-continuation suites passed (4 files / 35 tests), and targeted ESLint passed. Because mandatory lifecycle entries remain provider-authored pending deterministic assembly, the shortcut and replacement are recorded as TF-19. Production rebuild/restart pending before Attempt 11.
- Paid prompt runs performed: **10 of 20**.

### Attempt 11 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, generated-mechanic routing, and contract generation/repair passed; bounded source generation/repair then exhausted before deterministic evaluation or Game Pack handoff.
- Failure: `callbacks.0.source` — generated code called `capabilities.state`, but the exact granted capability surface had no `state` group (`Property 'state' does not exist on type ...`).
- Classification: major deterministic source-provider grant-compliance failure, not a likely transient rerun issue. The source inferred state authority from declared private state even though only the rendered grant determines callable capability groups; repair retained the unauthorized member access.
- Fix approach: make the exact-grant boundary explicit, state that trusted host initialization applies contract private-state initial values before `install`, and tell repair to remove absent `capabilities.state` calls rather than inventing authority, casts, or no-op initialization writes.
- Fix result: the exact absent-state-group regression failed before the guidance and passed afterward. Source prompt, provider, service, and orchestrator suites passed (4 files / 68 tests), and targeted ESLint passed. Because this remains provider-compliance guidance pending an exact-grant typed callback SDK and host-owned scaffolding, the shortcut and replacement are recorded as TF-20. Production rebuild/restart pending before Attempt 12.
- Paid prompt runs performed: **11 of 20**.

### Attempt 12 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, generated-mechanic routing, contract generation/repair, source generation/repair, compile/static inspection, and deterministic evaluator execution. Independent observable evaluation ran before bounded repair exhausted; Final Game Spec handoff and browser runtime mount were not reached.
- Failure: scenario `projectile_launch_and_travel` failed independent observable evaluation, with the causal ownership error at `scenarios.projectile_lifetime_cleanup`: `Only mechanic-owned objects can be destroyed through this host.`
- Classification: major deterministic source ownership-semantics failure, not a likely transient rerun issue. Accepted source passed typing but attempted `object_destroy` with a bound/non-owned handle instead of a handle created by the mechanic or rediscovered through an owned-only query.
- Fix approach: preserve the host's fail-closed ownership check and make destroy provenance explicit: only destroy the direct `object_create` result or an owned object rediscovered by an `ownership: "owned"` query; never destroy bindings or results from `"any"`/`"bound"` queries. Map the exact evaluator error to full invalid-call replacement during repair.
- Fix result: initial destroy-provenance and exact evaluator-failure repair regressions failed before the guidance and passed afterward. Source prompt, provider, service, and orchestrator suites passed (4 files / 69 tests), and targeted ESLint passed. Because opaque handle ownership is still model-tracked pending branded owned-handle types, the shortcut and replacement are recorded as TF-21. Production rebuild/restart pending before Attempt 13.
- Paid prompt runs performed: **12 of 20**.

### Attempt 13 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, generated-mechanic routing, contract generation/repair, source generation/typecheck/static inspection, and cross-artifact source-use validation. Repair exhausted before deterministic scenario acceptance, Final Game Spec handoff, or browser runtime mount.
- Failure: `grant.capabilities.2` — `Granted capability "object_motion_write" has no verified source use and would provide unjustified authority.`
- Classification: major deterministic source-provider grant-use failure, not a likely transient rerun issue. The source relied on initial velocity supplied during `object_create` and never invoked the separately granted `capabilities.objects.writeMotion` primitive, so trusted least-authority validation correctly rejected the unused grant.
- Fix approach: require at least one reachable awaited call to every exact granted capability expression. For `object_motion_write`, explicitly call `capabilities.objects.writeMotion` on the created mechanic-owned handle with finite nonzero motion; create-time initial velocity does not count. Map exact `unused_capability` feedback to a behaviorally necessary call rather than comments, aliases, or diagnostic suppression.
- Fix result: initial all-grants source-use and exact unused-motion repair regressions failed before the guidance and passed afterward. Source prompt, provider, service, and orchestrator suites passed (4 files / 70 tests), and targeted ESLint passed. Because provider compliance still bridges contract grants to source calls pending a typed capability-use plan, the shortcut and replacement are recorded as TF-22. Production rebuild/restart pending before Attempt 14.
- Paid prompt runs performed: **13 of 20**.

### Attempt 14 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, generated-mechanic routing, contract generation/repair, source generation/typecheck/static inspection, source-use validation, and deterministic scenario execution. Replay evaluation ran before repair exhausted; Final Game Spec handoff and browser runtime mount were not reached.
- Failure: scenario `shoot_projectile_and_cleanup` reported `SES Worker contained mechanic_fixed_step_47`, followed by `evaluation.replay / nondeterministic_replay` because identical inputs produced different serialized evidence.
- Classification: major deterministic diagnostics-infrastructure bug before the underlying generated-source failure can be classified. Anonymous contained errors embed a monotonically changing execution ID in the evidence, so identical failures on first execution and replay serialize differently and are falsely labeled nondeterministic. Cross-realm Error objects also lose their safe message because they fail the worker realm's local `instanceof Error` check.
- Fix approach: extract only an own nonempty string `message` data property from cross-realm-shaped errors without invoking accessors, retain ordinary local Error messages, and use a stable caller-supplied fallback with no execution ID. Wire both SES worker diagnostic boundaries to that helper so replay evidence can match and the next provider repair receives the causal callback error.
- Fix result: the new cross-realm-shaped error/fallback tests failed before the diagnostic module existed and passed afterward. SES diagnostic, worker-realm, and deterministic evaluator suites passed (3 files / 25 tests), and targeted ESLint passed. This is a durable containment-evidence correction rather than a provider band-aid; it is listed under the ledger's fixes deliberately not classified as band-aids. Production rebuild/restart pending before Attempt 15.
- Paid prompt runs performed: **14 of 20**.

### Attempt 15 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, generated-mechanic routing, contract generation/repair, source generation/typecheck/static inspection, source-use validation, and deterministic scenario execution plus replay. Replay evidence matched after the Attempt 14 diagnostics fix; bounded source repair then exhausted before Final Game Spec handoff or browser runtime mount.
- Failure: scenarios `shoot_creates_and_moves_projectile` and `shoot_projectile_expires` failed independent observable evaluation, but the repair receipt contained only generic `deterministic_evaluation_failed` messages and omitted which declared/evaluator-authored observations failed, their assertions, and their actual values.
- Classification: major deterministic evaluator-to-repair diagnostics gap, not a likely transient rerun issue. The evaluator has exact bounded observation evidence, but `evaluationIssues` discards it whenever a scenario has no runtime exception, leaving source repair unable to distinguish creation, travel, interaction, or cleanup defects.
- Fix approach: project each failed setup, model-declared observation, and evaluator-authored external observation into an exact bounded repair issue containing a stable indexed path, evidence-specific code, assertion JSON, and actual JSON. Retain generic scenario failure only when no finer issue exists; do not change evaluation criteria or admit failed evidence.
- Fix result: the editor integration regression failed while repair receipts still contained one generic scenario issue, then exposed and asserted both exact failed model-declared and evaluator-authored observations after the projection. Full editor integration, creator continuation, and deterministic evaluator suites passed (3 files / 29 tests), and targeted ESLint passed. This is durable repair-evidence fidelity rather than a provider band-aid; it is listed under the ledger's fixes deliberately not classified as band-aids. Production rebuild/restart pending before Attempt 16.
- Paid prompt runs performed: **15 of 20**.

### Attempt 16 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, routing, contract/source generation and repair, source validation, and deterministic evaluation. Exact observation projection ran, but GenerationRun repair-receipt validation then rejected the oversized diagnostic before a durable repair loop or Final Game Spec handoff could complete.
- Failure: four Zod `too_big` issues reported evaluator-projected repair messages longer than the ArtifactScopedRepairIssue schema's 500-character maximum (`artifactScopedRepair.attempts.*.issues.2.message` and copied repair evidence).
- Classification: major deterministic regression in the new evaluator-to-repair evidence projection, not a provider failure or rerun candidate. Exact assertion/actual JSON can be larger than the durable receipt limit, and unbounded serialization made otherwise useful diagnostics unpersistable.
- Fix approach: route observation diagnostics through one bounded formatter that preserves exact compact evidence, truncates assertion and actual JSON independently with explicit ellipses, and enforces the final 500-character ceiling. Keep stable paths/codes and evaluation pass/fail behavior unchanged.
- Fix result: the new bounded-formatter regression failed before the formatter module existed and passed afterward; the existing compact exact-evidence integration remained exact. Formatter, editor integration, creator continuation, and deterministic evaluator suites passed (4 files / 30 tests), and targeted ESLint passed. This corrects durable evidence serialization rather than adding provider policy; the non-band-aid ledger note now includes the receipt-size bound. Production rebuild/restart pending before Attempt 17.
- Paid prompt runs performed: **16 of 20**.

### Attempt 17 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, routing, contract/source generation and repair, source validation, and deterministic scenario evaluation. Exact model-declared and evaluator-authored observation evidence survived the bounded repair receipt; Final Game Spec handoff and browser runtime mount were not reached.
- Failure: scenario `fire_move_and_expire_projectile` ended with zero active `projectile` objects after cleanup, contradicting its model-declared `owned_object_count equals 1`; the evaluator also selected `referenced_entity_motion_changed` for `player_binding`, even though the accepted artifacts created, moved, and destroyed a mechanic-owned projectile.
- Classification: two deterministic acceptance-alignment defects, not a transient rerun candidate. The evaluator incorrectly required `spatial_query` in both intent and contract before selecting transient owned-object lifecycle evidence, even though create/move/destroy is sufficient and spatial querying is optional authority. Separately, contract guidance did not tell the provider that a post-cleanup final active count must be zero.
- Fix approach: TDD first. Add a no-target transient create/move/destroy evaluator regression and remove `spatial_query` from the lifecycle-evidence selector while retaining exact owned-object and capability checks in both intent and contract. Tighten planning guidance to populate `mechanicIntent.ownedObjects` plus create/move/destroy capabilities explicitly, and tell contract generation that post-cleanup `owned_object_count` must equal zero because evaluator-authored lifecycle evidence proves creation, travel, and destruction over the whole scenario.
- Fix result: all three regressions failed before implementation and passed afterward. Planner-provider, contract-prompt, and browser-evaluation fixture suites passed (3 files / 27 tests). The evaluator correction is durable; the provider-field/count guidance remains temporary compatibility policy and is recorded in TF-16 and TF-23. Production rebuild/restart pending before Attempt 18.
- Paid prompt runs performed: **17 of 20**.

### Attempt 18 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning, routing, contract generation, and bounded source generation/repair. The Attempt 17 evaluator-alignment failure did not recur; source TypeScript validation exhausted before deterministic evaluation, Final Game Spec handoff, or browser runtime mount.
- Failure: `callbacks.1.source` — `Cannot find name 'input'.`
- Classification: major deterministic source-host naming compatibility failure, not a likely transient rerun issue. Initial and repair prompts already forbade ambient `input` and mapped this exact error to `lifecycleInput`, but every bounded candidate retained the conventional callback name, proving more prompt text would not be a useful repair.
- Fix approach: add a narrow trusted compatibility adapter. Treat `input` as a readonly alias with exactly `typeof lifecycleInput` during source policy inspection and TypeScript checking; bind it directly to the already frozen `lifecycleInput` value in source-stage execution and persisted generated lifecycle programs. Reject declarations, assignments, and shadowing through the existing trusted-context rules; do not add capabilities or any new data.
- Fix result: typecheck/runtime-source and persisted-lifecycle regressions failed before the alias existed and passed afterward. Source service, source prompt, and generated lifecycle program suites passed (3 files / 71 tests). The alias is explicitly temporary and is recorded as an Attempt 18 expansion of TF-03. Production rebuild/restart pending before Attempt 19.
- Paid prompt runs performed: **18 of 20**.

### Attempt 19 — Failed

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed.
- Furthest pipeline stage: creator planning completed and the browser Runtime and Contract Foundation Gate started; the nominal foundation lifecycle stopped before contract generation, source generation, deterministic artifact evaluation, Final Game Spec handoff, or runtime mount.
- Failure: `foundation.lifecycle` — `Foundation install did not complete.`
- Classification: minor stochastic foundation/Worker startup failure. The trusted foundation fixture is independent of provider-authored source and does not execute the Attempt 18 compatibility alias; it passed on preceding runs, and this attempt produced no contract/source artifact issue that a deterministic provider fix could address.
- Fix approach: no code or policy change. Preserve every gate and use one unchanged retry with the exact prompt and Luna model, as permitted for an isolated transient failure.
- Fix result: final retry pending as Attempt 20.
- Paid prompt runs performed: **19 of 20**.

### Attempt 20 — Failed; attempt ceiling reached

- Model: `gpt-5.6-luna`
- Prompt: `Create a top-down game where the player can shoot a projectile.`
- Result: failed. No additional prompt submissions are permitted in this Ticket 17 session.
- Furthest pipeline stage: creator planning completed and the browser Runtime and Contract Foundation Gate started; the nominal foundation install stopped before contract generation, source generation, deterministic artifact evaluation, Final Game Spec handoff, or runtime mount.
- Failure: `foundation.lifecycle` — `Foundation install did not complete.`
- Classification: repeated deterministic foundation/Worker blocker for the final session state. The identical pre-artifact failure occurred on Attempts 19 and 20 after a clean production rebuild, so it can no longer be treated as a one-off stochastic result. It is independent of the exact projectile prompt and generated provider artifacts.
- Fix approach: none in this session. The explicit 20-run ceiling requires stopping after this terminal result. A future authorized session should diagnose the nominal foundation install result/Worker lifecycle with browser-visible causal evidence before spending another provider call.
- Fix result: not attempted because the paid prompt-run ceiling was reached.
- Paid prompt runs performed: **20 of 20**.

## Final outcome

- Goal status: not achieved in this session.
- Visible success: no newly generated projectile game reached Final Game Spec handoff or rendered as a playable runtime.
- Final blocker: two consecutive production-browser runs stopped at `foundation.lifecycle` with `Foundation install did not complete.` before generated contract/source work began.
- Browser state: the final failed attempt remains visible in the existing Chrome editor tab for inspection.
