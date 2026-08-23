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

