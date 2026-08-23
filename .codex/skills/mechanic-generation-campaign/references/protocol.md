# Campaign protocol

## Cohorts

- `discovery`: one baseline submission. Achieved by one full-actual pipeline and external-probe success.
- `isolation`: one bounded diagnostic submission with one or more fixture stages. Achieved when the declared diagnostic question is answered. It never contributes to mechanic proof.
- `repeatability`: ten baseline submissions on one clean revision. Achieved at eight full-actual successes.
- `variation`: five frozen prompts with two submissions each on one clean revision. Planning remains actual. Achieved at eight full-actual successes with at least one success for every prompt.

A mechanic is proven only when discovery, repeatability, and variation are achieved with the same revision, model, and provider modes.

## Stage evidence

Report the deepest stage supported by persisted or browser evidence:

1. planning
2. intent validation and routing
3. runtime foundation
4. contract generation and validation
5. source generation and validation
6. deterministic evaluation and replay
7. Final Game Spec assembly and accepted-project handoff
8. runtime activation and first-playable validation
9. persistence and editor mount
10. runtime health and cleanup
11. external mechanic probe

If sources disagree, use the shallower stage and report the disagreement.

## Classifications

- `provider_failure`: the actual provider request failed before a candidate was evaluated.
- `provider_output_rejected`: bounded validation or repair rejected model output without weakening the gate.
- `pipeline_failure`: trusted orchestration, correlation, validation, evaluation, assembly, handoff, or persistence failed.
- `runtime_pipeline_failure`: runtime activation or first-playable validation failed.
- `semantic_runtime_failure`: the pipeline accepted and mounted, but the external mechanic probe failed.
- `infrastructure_failure`: server, browser, navigation, or harness failure prevented a valid result.
- `success`: the full-actual pipeline and external probe passed.

Treat automated classifications as provisional when evidence is incomplete. Preserve the recorded outcome and add a later adjudication instead of rewriting history.

## Campaign loops

A loop contains one mechanic manifest and an ordered campaign sequence. Every numeric ceiling and same-revision retry policy is explicit. Separate campaign runs remain separate evidence; their successful attempts are never pooled.

An achieved custom sequence is not automatically mechanic proof. Proof still requires achieved discovery, repeatability, and variation steps on the same final revision, model, and all-actual provider configuration.

Fixture-backed isolation may diagnose a failure while a loop is waiting for a fix. It consumes the loop's campaign, submission, isolation, and applicable provider-call budgets but does not advance a proof step.

A verified fix commit starts a new revision cycle and resets every sequence step. Campaign links and fix checkpoints remain append-only. Global usage does not reset.

Loop terminal states are `achieved`, `exhausted`, `invalid`, and `blocked`. `interrupted` is resumable on the same clean revision; `waiting_for_fix` is an agent action checkpoint.

Loop execution worktrees live under the adjacent `.qa/<repository>/mechanic-generation-campaign-worktrees/` root. Campaign evidence remains under the control checkout's ignored `.qa/mechanic-generation-campaign/` root. Never move a loop worktree beneath the control checkout because nested package roots can change production build behavior.

Immediately after creating a linked loop worktree, remove that worktree's `node_modules` and `.next` directories, run `npm install` from the worktree root, and only then run the production build. Never copy or share the control checkout's dependency or build directories. A preparation or build failure occurs before the first editor submission and must stop the loop without consuming a submission or provider-call budget.
