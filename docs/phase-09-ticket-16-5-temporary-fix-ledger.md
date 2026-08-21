# Phase 09 Ticket 16.5 — Temporary-fix ledger

This ledger records expedient fixes accepted to improve real-provider end-to-end generation yield. An entry here does not mean the implementation is known to be incorrect. It means the current solution relies on provider compliance, a retained-host special case, or another mechanism that should later be replaced or generalized.

## How to use this ledger

- Add an entry whenever a fix deliberately prioritizes reaching a playable result over the most general architecture.
- Keep the validating safety boundary intact; do not record bypassing or weakening validation as an acceptable shortcut.
- Record the attempt or failure that motivated the fix, the tests that constrain it, and the stronger replacement.
- Remove an entry only after its replacement is implemented, verified end to end, and linked from the entry.

## Active temporary fixes

### TF-01 — Generated-host trigger alias normalization

- Status: active
- Introduced after: real-provider Attempt 1
- Current shortcut: after built-in resolution has failed, trusted routing translates `logical_move_action` to the retained generated host's canonical `logical_action` trigger while preserving the exact active input action connection.
- Why temporary: the adapter knows one built-in alias and one retained-host trigger. A larger mechanic catalog or another runtime host could require a different semantic mapping.
- Robust replacement: represent trigger semantics independently from provider-authored string IDs, then resolve them through a versioned host-profile mapping with explicit coverage and capability-gap results.
- Removal criteria: generated and built-in routing share a typed trigger-semantic layer, and hostile tests cover multiple hosts without alias-specific branches.
- Current coverage: creator-generation routing and planning prompt regressions.

### TF-02 — Exact intent-token copying through prompt instructions

- Status: active
- Introduced after: real-provider Attempt 6
- Current shortcut: the contract prompt renders accepted trigger and outcome arrays as exact JSON and instructs every initial and repair response to copy the tokens literally.
- Why temporary: exact lineage is still dependent on model obedience. Semantically equivalent paraphrases consume repair attempts even though trusted code already owns the canonical values.
- Robust replacement: construct or overwrite lineage-owned contract fields from the trusted accepted intent after provider parsing, leaving the provider responsible only for fields it is authorized to design.
- Removal criteria: provider-authored paraphrases cannot alter trusted lineage fields, and tests prove deterministic stamping without weakening semantic validation.
- Current coverage: mechanic-contract prompt, provider, and service regressions.

### TF-03 — Source-visible host types supplied as prompt text

- Status: active
- Introduced after: real-provider Attempt 5
- Current shortcut: the source prompt renders the exact observation and motion-mutation shapes and explicitly warns against plausible but nonexistent direction or facing fields.
- Why temporary: the types are accurately documented, but a model can still invent fields or misunderstand nested values. Prompt text is not a compiler-enforced authoring API.
- Robust replacement: expose a smaller generated source SDK with typed helper operations for common motion semantics, or synthesize typed source scaffolding from the contract before asking the model to fill bounded behavior bodies.
- Removal criteria: common mechanics do not require the model to reconstruct host data structures from prose, while compilation remains the final fail-closed check.
- Current coverage: source prompt, provider, service, and orchestrator regressions.

### TF-04 — Runtime-budget compliance driven by authoring guidance

- Status: active
- Introduced after: real-provider Attempts 7 and 10
- Current shortcut: prompts explain lifecycle-operation accounting, tell the model to simplify over-budget paths, and steer one-shot deadlines toward `time_schedule` plus a scheduled callback instead of fixed-step polling.
- Why temporary: the model must manually reason about the maximum runtime path and callbacks dispatched by `advance_time`. Attempts still exceeded the 16-operation budget after earlier guidance.
- Robust replacement: add a trusted pre-evaluation operation-cost analyzer and deterministic repair hints, or generate bounded lifecycle scaffolding whose maximum operation cost is mechanically known.
- Removal criteria: over-budget candidates receive exact callback/path cost evidence before runtime evaluation, and supported one-shot transitions can be normalized without another model call.
- Current coverage: contract/source prompt, provider, service, and orchestrator regressions plus runtime budget tests.

### TF-05 — Evaluator vocabulary enforced through a retained-host prompt catalog

- Status: active
- Introduced after: real-provider Attempt 8
- Current shortcut: a shared top-down host-profile constant lists the exact evaluator-visible property keys, and the prompt forbids invented derived aliases such as `velocity_magnitude` and `inside_region`.
- Why temporary: sharing the catalog prevents drift, but the provider still authors low-level evaluator observations and remains coupled to one retained host's vocabulary.
- Robust replacement: have trusted code derive observation assertions from intent, bindings, and host profile; the provider should describe behavioral expectations without selecting raw host-property keys.
- Removal criteria: adding another host profile does not require provider knowledge of its internal observation field names, and evaluator assertions remain causally tied to the trusted intent.
- Current coverage: mechanic-contract prompt/provider/service and browser-evaluation-fixture regressions.

### TF-06 — Automatic removal of unused capability grants

- Status: active repair-routing shortcut; real-provider success verified on Attempt 13
- Motivated by: real-provider Attempt 12
- Current shortcut: source-proven `unused_capability` evidence is attributed to the contract stage. Contract repair is explicitly instructed to remove that exact grant unless the accepted behavior genuinely requires it; downstream source and evaluation artifacts are then regenerated.
- Risk: blindly pruning a capability could make the contract and source appear consistent while silently dropping intended behavior.
- Current guardrails: trusted code does not mutate the contract itself; the repaired provider candidate must pass full contract validation, source compilation/use validation, evaluator admission, deterministic evaluation, and least-authority evidence again. Meaningless source calls are explicitly forbidden.
- Robust replacement: derive the capability grant set from verified compiled-source use plus trusted contract requirements, with provider requests treated as proposals rather than authority.
- Removal criteria: capability derivation is deterministic and provenance-backed, so no special repair-time pruning remains.
- Current coverage: continuation-stage responsibility regression and contract repair-prompt regression.
- Real-provider evidence: Attempt 13 passed least-authority validation and completed visible runtime acceptance with this routing/prompt behavior present in the production build. This proves compatibility with the successful path, but does not prove that the model needed the repair on that specific run.

### TF-07 — Whole-millisecond adaptation at the retained top-down host

- Status: active runtime-compatibility shortcut; persisted Attempt 13 recovered without regeneration
- Motivated by: human QA of the accepted Momentum Dash artifact. Phaser advanced the trusted simulation clock by fractional frame deltas, while the accepted source combined `time.now()` with integer durations and wrote the result to integer private state. The first movement action therefore terminated the generated-mechanic Worker.
- Current shortcut: the retained top-down Phaser adapter accumulates fractional frame deltas, forwards only the whole-millisecond portion into the generated session, and carries the remainder into the next frame. `time_read` and the pinned capability version remain unchanged. Source guidance also states that top-down host time is whole deterministic simulation milliseconds and that integer private-state writes must stay finite integers.
- Risk: this compatibility behavior lives in one retained host adapter rather than a structural cross-host time-unit contract. A different host could still supply fractional advancement unless it independently follows the same convention.
- Current guardrails: no fractional time is discarded—the sub-millisecond remainder is carried—and the generic capability implementation is not reinterpreted. Top-down runtime coverage exercises fractional frame accumulation, and browser QA verifies the same persisted GamePack across movement, reset, and reload without a provider call.
- Robust replacement: version the time capability around an explicit branded integer simulation-millisecond type, encode duration/state unit compatibility in contract/source schemas, and statically reject arithmetic that can write a fractional number into integer state.
- Removal criteria: time units and numeric refinements are structural across contract, compiler, evaluator, and runtime rather than being implied by prompt prose plus boundary quantization.
- Current coverage: top-down runtime fractional-frame accumulation, source prompt, first-playable generated-action probe, and restored-game browser QA regressions.

### TF-08 — Direct accepted-artifact config retune for human QA

- Status: active one-off persisted QA override; no provider call or top-level generation attempt
- Motivated by: human QA could not visually distinguish the accepted Momentum Dash's 180 ms burst from ordinary movement.
- Current shortcut: the persisted Momentum Dash GamePack was atomically updated in IndexedDB under the generated-mechanic acceptance Web Lock. All four correlated config snapshots now use `dash_duration_milliseconds: 2000` and `dash_distance: 840`, retaining `dash_speed: 420` and `normal_speed: 160`. The distance changed with duration because the accepted source caps speed at `dash_distance * 1000 / duration`; changing duration alone would have reduced the effect to 38 px/s.
- Risk: this mutates configuration beneath an already accepted immutable artifact/version ID, so its historical evaluation receipt proves the original 180 ms/76 px configuration rather than the QA override. Restore currently validates internal config consistency and the contract's allowed range, but does not reissue deterministic evaluation evidence for this edit.
- Current guardrails: the contract permits a 1–10,000 ms integer duration and 0–1,000 px distance; the update required the exact GamePack/artifact IDs and exact previous values, changed every canonical config copy in one read-write transaction, refreshed matching record metadata, and was verified through ordinary reload plus a generated-action runtime probe with no runtime error.
- Robust replacement: add a versioned config-only artifact-repair flow that derives a new extension version, reruns deterministic evaluation and first-playable proof for the new config, appends a new checkpoint, and retains the prior accepted artifact as history.
- Removal criteria: creator/editor configuration edits produce new provenance-backed artifact versions and cannot reuse acceptance evidence from a different config snapshot.
- Current coverage: one-off production-browser verification only; this override deliberately adds no production mutation API or committed test seam.

### TF-09 — Stronger external player-velocity preservation

- Status: active retained-host movement-arbitration shortcut; applied to the persisted Momentum Dash without regeneration
- Motivated by: human QA after TF-08. The generated action wrote the intended dash velocity, but the built-in `player_movement` installer replaced it with normal movement velocity on the very next Phaser frame, making the accepted mechanic visually indistinguishable from ordinary movement.
- Current shortcut: the retained top-down `player_movement` installer preserves a finite player-body velocity whose magnitude is greater than its configured normal movement speed. Once the generated mechanic writes a normal-or-lower velocity at the end of its scheduled duration, built-in keyboard movement resumes on the next frame.
- Risk: speed magnitude is only a heuristic for motion ownership. It conflates generated dashes with knockback, physics impulses, collisions, and any other faster motion; it cannot arbitrate slower effects, directional locks, stacking, cancellation, or multiple writers with different priorities.
- Current guardrails: the rule applies only while the existing finite velocity is strictly stronger than configured movement speed. A deterministic retained-runtime regression proves that a generated 550-speed write survives the built-in 220-speed frame update and that built-in control resumes after the generated mechanic releases to 160. The persisted artifact and GenerationRun are not regenerated or rewritten by this host fix.
- Robust replacement: introduce typed motion-effect leases or commands with explicit owner, priority/composition policy, direction, and expiry. The retained host should resolve all motion writers once per frame rather than inferring ownership from the current body velocity.
- Removal criteria: generated motion, player input, collisions, and other effects compose through one deterministic motion-arbitration layer, with lifecycle and conflict tests covering expiry, cancellation, stacking, and multi-writer ordering.
- Current coverage: top-down runtime generated-velocity preservation/release regression plus production-browser QA of the same persisted Momentum Dash GamePack.

### TF-10 — Host-relative dash perceptibility floor

- Status: active creator-planning policy shortcut
- Motivated by: human QA of `generation_run_mt1ufhax_wujn9ijl`. The generated dash used speed 360 for 180 ms while the retained host's ordinary player movement was 220. It passed deterministic evaluation because velocity changed, but its roughly 25 pixels of extra travel was not visually distinguishable during ordinary play.
- Current shortcut: trusted creator planning recognizes a dash-like `object_motion_write` intent with the retained canonical speed/duration configuration aliases and raises provider-selected values to a host-relative floor before routing. The floor is at least 2x ordinary player speed, at least 150 ms, and at least 32 pixels of extra travel. A matching `normal_movement_speed`/`normal_speed` entry is aligned to the actual built-in movement speed. The same policy is rendered in the planning prompt.
- Risk: the policy recognizes `dash` text plus a small alias catalog, and fixed perceptibility thresholds cannot account for camera scale, sprite size, acceleration, input latency, animation, accessibility preferences, or non-dash motion effects. A source can also satisfy the normalized config lineage without producing the intended visible displacement.
- Current guardrails: the adjustment occurs before deterministic routing and contract/source generation, never mutates the provider envelope, preserves unrelated configuration, records the adjustment as a reversible assumption, and applies only to dash-like intents requiring `object_motion_write`. Contract generation must still preserve the normalized trusted intent values exactly, and all existing compile, evaluation, first-playable, persistence, and runtime gates remain enabled.
- Robust replacement: add typed motion-effect semantics to the Mechanic Intent/Contract and host profile, including baseline movement, requested contrast, duration/distance units, and effect ownership. Browser evaluation should measure authenticated displacement over the declared effect window against the same host baseline rather than accepting any velocity change.
- Removal criteria: perceptibility is proved from typed intent through measured browser evidence without keyword/config-alias recognition or fixed top-down-only constants.
- Current coverage: creator-planning service regression for the observed 360/180/150 configuration, provider-prompt profile assertions, and immutable provider-input verification.

### TF-11 — Retained-host physical control-key admission

- Status: active pipeline-admission shortcut
- Motivated by: human QA of `generation_run_mt1vsw0i_fx1nqcx8`. The generated dash source correctly wrote 550 px/s for 200 ms, but its Game Spec bound `move_action` to the aggregate labels `WASD` and `ARROW KEYS`. Built-in Phaser movement still responded to cursor keys, while the generated-action bridge compared each browser `KeyboardEvent.key` against those labels and therefore never dispatched the dash.
- Current shortcut: the retained top-down generation profile exposes only `ArrowUp`, `ArrowDown`, `ArrowLeft`, and `ArrowRight` as provider-authorable control keys. The strict provider tool schema enumerates those values, the generation guide forbids aggregate labels, and trusted semantic validation returns exact indexed issues that feed the existing bounded repair attempt.
- Risk: this couples generated Game Specs to the current Phaser cursor-key host and excludes future legitimate controls, remapping, accessibility bindings, gamepads, and concrete WASD support. It proves that a key token is dispatchable by this host, but not that every intended action is bound to the complete desired key set.
- Current guardrails: invalid labels are never silently expanded or accepted. They fail before routing/runtime and can only proceed after the provider returns a fully validated repaired Game Spec. Core Game Spec syntax remains host-neutral; the restriction lives in the top-down semantic/generation profile.
- Robust replacement: introduce typed logical input bindings plus a versioned host input profile. Built-in movement and generated-action dispatch should consume the same resolved bindings, and first-playable/browser evidence should exercise the authenticated physical-input route rather than directly invoking the logical action.
- Removal criteria: host negotiation can resolve keyboard, remapped, accessibility, and gamepad bindings into one action-semantic contract, and end-to-end conformance proves that the configured physical input dispatches the generated action.
- Current coverage: top-down semantic-validation regression, strict provider-schema regression, Spec Generation repair-loop regression, and combined creator-planning envelope repair regression.

### TF-12 — Conservative pre-generation degraded fallback

- Status: active creator-generation yield shortcut
- Motivated by: valid built-in collection games being discarded when an optional generated-mechanic intent was malformed or could not satisfy the retained generated host.
- Current shortcut: when intent transport or capability/host admission fails before any generated work begins, trusted dispatch may return an independently validated base Game Spec as a distinct degraded success. The first slice permits this only when the spec has no generated extension data, uses trusted built-in mechanics, has a primary objective, and contains `player_movement` plus `pickup_collection` tied to that objective. Provider-authored `mechanicConnections` are metadata that the trusted built-in top-down runtime does not execute, so fallback removes them from a cloned Game Spec before persistence instead of treating their presence as a terminal error. The creator receives an omission warning, the GenerationRun records the degraded outcome and zero generated-stage calls, and the normal first-playable path remains required.
- Risk: the collection-specific proof rejects other valid standalone games and can return a playable game that only partially satisfies the creator prompt. Intent transport failures cannot always name the omitted behavior as precisely as a trusted compiled requirement could.
- Current guardrails: base-spec validation is rerun before transformation; generated extension data, post-start generated work, existing generated lineage, ambiguous acceptance, cancellation, warning-receipt failure, and final GamePack persistence failure remain fail-closed. Connection metadata is removed only on a new fallback object, the provider response remains unchanged, and the exact sanitized Game Spec still passes the ordinary first-playable and persistence paths. The fallback is behind one explicit policy switch (`?degradedGenerationFallback=off` disables it for comparison), preserves original routing plus policy evidence, never invokes generated continuation, and is visually distinguished from full success.
- Robust replacement: the trusted intent compiler assigns each atomic requirement to built-in, trusted Game Spec, generated, or clarification ownership, then proves whether an omitted requirement is optional without relying on a collection-template heuristic.
- Removal criteria: compiled requirement ownership and dependency proofs can classify fallback eligibility across game types; the temporary `player_movement` plus `pickup_collection` predicate and raw-intent recovery path are removed.
- Current coverage: split-envelope transport tests, centralized policy tests, dispatcher zero-call/cancellation and connection-sanitization tests, editor receipt/persistence tests, developer export and creator UI tests, and a real planning-to-first-playable collection integration replay.

### TF-13 — Exact generated-target role guidance

- Status: active creator-planning compatibility shortcut
- Motivated by: real-provider Ticket 17 projectile attempts that passed contract admission and then stopped during evaluator setup with `Top-down generated mechanic evaluation requires exactly one single-entity binding for every trusted actor-role entity reference.` The retained evaluator selects transient-object interaction targets by matching Mechanic Intent target tokens to exact referenced `gameSpec.entities[].role` values, but the planning prompt previously stated that invariant only for actors.
- Current shortcut: the creator-planning prompt now tells the provider to copy every generated-host target from the exact role of a referenced Game Spec entity and explicitly rejects generic aliases such as `visible_target` when the referenced role is `enemy`, `pickup`, `hazard`, or another exact role. Trusted routing independently checks that every target role is represented by an exact routed entity reference before contract or source generation begins.
- Risk: a successful full generated-mechanic run still depends on provider compliance with duplicated role-plus-reference vocabulary. A mismatched target now fails closed before paid generated stages and may enter the existing degraded fallback, but trusted code does not yet repair or derive the intended target mapping.
- Current guardrails: routing never rewrites or guesses a target, unknown and duplicate stable references remain rejected, contract admission still requires one exact single-entity binding per routed entity reference, and evaluator target-interaction evidence remains tied to the trusted lineage.
- Robust replacement: use the trusted intent compiler to resolve provider-proposed target semantics to exact stable entity IDs, preserve ambiguity when resolution is not unique, and derive contract bindings plus evaluator target IDs from that compiled mapping rather than repeating free-form role tokens.
- Removal criteria: provider-authored target aliases cannot reach routing, contract generation, or evaluator setup; accepted target identity is compiled from stable references with deterministic ambiguity handling and covered by prompt-shaped end-to-end tests.
- Current coverage: creator-generation routing regression for a `visible_target` alias paired with an exact non-player entity reference, plus creator-planning provider-prompt assertions for the target-role invariant.

## Fixes deliberately not classified as band-aids

The following changes address trusted infrastructure invariants and should remain even after the temporary entries above are replaced:

- Worker-pool readiness, queued-execution cancellation, and containment recovery.
- Fail-closed runtime and browser conformance checks.
- Preservation of accepted generated-artifact lineage when first-playable evidence is appended.
- Dispatch of the exact authenticated generated action during first-playable validation.
- Preservation of the causal authenticated mechanic failure when the containing Worker subsequently closes.
- Shared, versioned host-profile constants that prevent prompt/evaluator drift, even if provider-facing raw vocabulary is later removed.
