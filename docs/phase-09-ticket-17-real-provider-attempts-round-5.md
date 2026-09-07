# Phase 09 Ticket 17 — Real-provider attempts, round 5

## Goal continuation

Continue the existing goal with this exact editor prompt:

> Create a top-down game where the player can shoot a projectile.

Constraints for this continuation:

- The authorized ceiling is now **35** total `/editor` submissions, continuing after round-four Attempt 25.
- Every submission uses `gpt-5.6-luna`.
- `creator-generation-planning` alone uses `planning-contract.json`.
- Generated Mechanic Contract and generated source use the real configured provider.
- Success requires a visibly rendered, playable generated game whose projectile originates at the player's live position.
- Stop after the first verified success or Attempt 35.

## Attempt counter

- Real GPT-5.6 Luna prompt submissions performed across the continued goal: **31 of 35**.

## Attempt 26 — failed

- Prompt/model: exact goal prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: planning used `planning-contract.json`; real contract and source generation ran.
- Terminal outcome: `repair_exhausted` during retained-host contract/evaluator admission.
- Furthest pipeline stage: fixture-backed planning passed; real contract and source generation completed; retained-host evaluator admission rejected the generated contract before deterministic scenario execution, Final Game Spec assembly, handoff, browser first-playable validation, persistence, or runtime mount.
- Failure: `contract.scenarios` did not dispatch the one exact routed intent input action exactly once in every scenario.
- Classification: first-occurrence contract-provider variance. Trusted admission correctly rejected the contract, while the contract prompt already states that every scenario must dispatch the same routed active action exactly once. One independent rerun is warranted before changing trusted validation or generation guidance.
- Fix/action: preserve fail-closed admission and rerun with a fresh real contract/source pair.
- Fix result: Attempt 27 did not reproduce the contract admission error, but its real model-generation request timed out before returning a later pipeline result.

## Attempt 27 — failed

- Prompt/model: exact goal prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: planning used `planning-contract.json`; the real generated-mechanic provider request remained active until its configured timeout.
- Terminal outcome: `model_generation` / `generation_request` failure.
- Furthest pipeline stage: fixture-backed planning passed and generated-mechanic creation entered the real provider-backed contract/source pipeline. The request did not return enough evidence to distinguish contract generation from source generation, deterministic evaluation, or later browser stages.
- Failure: `Generated mechanic creation timed out before it could finish evaluation and browser validation. Please retry the request.`
- Classification: transient provider timeout. The editor remained active without a client error through the configured 500-second provider window and then returned the expected timeout failure.
- Fix/action: rerun with a fresh real provider request; do not change validation or generation logic for a first isolated timeout.
- Fix result: Attempt 28 stopped at the earlier editor-generation deadline before the generated-mechanic continuation was armed, indicating that the planning-fixture request did not return normally after the long Attempt 27 request.

## Attempt 28 — failed

- Prompt/model: exact goal prompt with `gpt-5.6-luna` on `http://localhost:3005`.
- Provider calls: the run stopped before the client armed its generated-mechanic continuation deadline, so no evidence proves that the real contract or source provider call began.
- Terminal outcome: `model_generation` / `generation_request` failure at the editor's initial generation deadline.
- Furthest pipeline stage: the browser submitted the request, but the planning response did not return and dispatch the generated-mechanic route before the initial two-minute deadline. Contract generation, source generation, deterministic evaluation, Final Game Spec assembly, handoff, browser validation, persistence, and runtime mount were not reached by observable evidence.
- Failure: `Generation took longer than two minutes. Please retry; the model may have stalled while creating or validating the game module.`
- Classification: local request/server-state stall after Attempt 27's long provider timeout. The planning fixture is local and had completed promptly in Attempt 26, so waiting two minutes before the generated-mechanic deadline is armed is not expected provider-source variance.
- Fix/action: restart the production server cleanly with planning-only fixture flags, reload the editor, and rerun. Do not change the 120-second planning deadline or the 600-second generated-mechanic deadline based on this isolated post-timeout server state.
- Fix result: the clean server emitted the planning-fixture warning immediately in Attempt 29, proving the intended planning-only fixture was active. The run then failed independently in shared foundation conformance.

## Attempt 29 — failed

- Prompt/model: exact goal prompt with `gpt-5.6-luna` on a freshly restarted production server at `http://localhost:3005`.
- Provider calls: server evidence confirmed `planning-contract.json` replaced planning. The run stopped in foundation before real contract or source generation began.
- Terminal outcome: `foundation` failure.
- Furthest pipeline stage: fixture-backed planning passed; secure mechanic runtime conformance reached its logical-action probe. Contract generation, source generation, deterministic evaluation, Final Game Spec assembly, handoff, browser validation, persistence, and runtime mount were not reached.
- Failure: `foundation.lifecycle: Foundation logical action did not complete.`
- Classification: first occurrence after the clean restart and a shared browser/Worker conformance failure rather than provider candidate quality. The same foundation has passed in prior attempts, so one independent rerun is warranted before changing containment logic.
- Fix/action: rerun without code changes while preserving fail-closed conformance.
- Fix result: Attempt 30 passed foundation and reached contract admission, where TF-32 rejected the repeated post-lifetime positive final-count contradiction.

## Attempt 30 — failed

- Prompt/model: exact goal prompt with `gpt-5.6-luna` on the clean planning-only production server.
- Provider calls: planning used `planning-contract.json`; real contract generation and its bounded repair ran. Source generation did not begin because the contract remained invalid.
- Terminal outcome: `repair_exhausted` during trusted contract admission.
- Furthest pipeline stage: fixture-backed planning and shared foundation passed; real contract generation reached TF-32 post-lifetime consistency admission and exhausted contract repair. Source generation, deterministic evaluation, Final Game Spec assembly, handoff, browser validation, persistence, and runtime mount were not reached.
- Failure: scenario `shoot_creates_moves_and_expires_projectile` advanced 1300 ms after the action against an accepted 1200 ms transient lifetime, but still required an active `player_projectile` in its final owned-object count.
- Classification: repeated provider contract-repair noncompliance. TF-32 correctly rejected the contradiction, but the existing generic repair rule did not cause GPT-5.6 Luna to change the exact observation.
- Fix/action: add red-to-green public prompt-builder coverage and exact stage-failure guidance that sets the reported post-lifetime `owned_object_count` observation to `operator: "equals"`, `value: 0`, while preserving the routed action and cleanup time steps. This extends temporary TF-32 and remains documented as a suffix-based compatibility bridge.
- Fix result: focused prompt regression passed 9/9; affected contract/continuation suites passed 37/37; lint, `git diff --check`, and the production build passed. Attempt 31 completed the entire pipeline and mounted a visible playable project.

## Attempt 31 — succeeded; goal achieved

- Prompt/model: exact goal prompt with `gpt-5.6-luna` on the rebuilt planning-only production server.
- Provider calls: server evidence emitted only the planning-fixture warning for `planning-contract.json`; Generated Mechanic Contract and generated source used the real configured provider.
- Terminal outcome: successful generated-mechanic project acceptance and browser mount.
- Furthest pipeline stage: fixture-backed planning, shared foundation, real contract generation and repair, real source generation and repair, source admission, deterministic evaluation and replay, Final Game Spec assembly, authenticated handoff, first-playable browser validation, persistence, and sandbox runtime mount all completed.
- Result: the editor reported `Generated, evaluated, and accepted a playable mechanic project.` The accepted project `Projectile Pursuit` exposes movement on the arrow keys and `Shoot Projectile` on Space, with one generated mechanic and the required object read/create/motion/destroy, spatial query, state, and time capabilities.
- Browser evidence: the sandbox visibly rendered the game title, objective counter, player, arena obstacle, and pickup. The trusted accepted evaluator/handoff evidence necessarily authenticated the exact generated action plus actor-origin owned-object creation, nonzero travel, and cleanup before the success state could commit.
- Final action: stop after Attempt 31 and leave the successful runtime open for user inspection. Attempts 32–35 were not used.

## Round outcome

- Goal achieved on **Attempt 31 of the authorized 35**.
- Planning remained fixture-backed while both generated-mechanic generation stages remained real provider calls.
- TF-32 remains temporary and documented because its lifetime relation depends on the `*_lifetime_ms` naming convention. Attempt 30 added exact provider repair guidance; Attempt 31 verified that the full real contract/source sequence can succeed with that bridge.
