# Campaign protocol

## Cohorts

- `discovery`: one baseline submission. An automated full-actual pipeline and external-probe pass pauses for gameplay review. The cohort is achieved only after explicit approval.
- `isolation`: one bounded diagnostic submission with one or more fixture stages. Achieved when the declared diagnostic question is answered. It never contributes to mechanic proof.
- `repeatability`: ten baseline submissions on one clean revision. Every automated pass pauses for review. Achieved after all ten base submissions with at least eight manually approved full-actual successes. The third qualifying failure stops the campaign immediately.
- `variation`: five frozen prompts with two base submissions each on one clean revision. Planning remains actual. Every automated pass pauses for review. Achieved with at least eight manually approved full-actual successes and at least one approved success for every prompt. If both base submissions for exactly one prompt failed and fewer than three failures occurred, one targeted replacement may run. The third qualifying failure stops the campaign immediately.

A standalone mechanic proof uses one revision. A campaign loop may prove the mechanic across a continuous accepted-fix revision chain when its frozen model and provider modes remain unchanged and only exact manually approved successes are checkpointed.

New repeatability and variation campaigns may explicitly freeze bounded parallel execution. Discovery, isolation, existing frozen campaigns, and omitted policies remain sequential. Parallel execution is capped at three active attempts and three pending reviews. The dispatcher must preserve:

```text
active attempts + pending manual reviews <= failure limit - counted failures
```

Parallel variation uses round-robin base prompt order unless the frozen policy explicitly selects legacy prompt-major order. Each active attempt receives a durable slot, isolated browser process and context, artifact directory, and provider-call identity before launch. All attempts share one production server but do not share renderer scheduling for fixed browser-attestation budgets.

## Cost evidence

The campaign manifest may freeze one `openai-pricing-snapshot/v1` by path and SHA-256 hash. Every actual planning, contract, source, and repair request writes one sanitized receipt with its completion time, resolved model, service tier, token usage, and integer nano-USD cost. Fixture calls cost zero and produce no actual-provider receipt.

Valid OpenAI usage produces exact calculated cost. Before dispatch, enforce authorization, stage call-count ceilings, and previously settled spend only. Do not calculate a theoretical model-maximum reservation. When usage is absent or malformed, estimate token counts only from that call's actual OpenAI request and response payloads. If those payloads are unavailable, keep the cost unknown as unresolved exposure. Historical calls without a pricing snapshot remain unknown; they are excluded from totals rather than assigned `$0.000`.

A loop cost ceiling is a soft stop. The already-bounded parallel batch may settle above the ceiling because usage is known only after completion. Settled cost or unresolved exposure blocks dispatch of the next batch and exhausts the loop. Gross provider-call evidence is append-only. Campaign-tool repair can credit Sparkline-attributed cost without removing gross call evidence.

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
- `infrastructure_failure`: external server, browser, or navigation infrastructure prevented a valid result. Preserve the diagnostic attempt, stop the campaign immediately, and handle a linked loop through the budget-neutral campaign-repair lifecycle instead of advancing to another submission.
- `awaiting_manual_qa`: the full-actual pipeline and external probe passed, exact replay artifacts were frozen, and a human verdict is pending.
- `manual_qa_rejected`: the user denied the candidate and supplied the gameplay defect. It counts toward the active proof cohort's failure limit.
- `success`: the full-actual pipeline and external probe passed and the user explicitly approved the exact replayed candidate.

Treat automated classifications as provisional when evidence is incomplete. Preserve the recorded outcome and add a later adjudication instead of rewriting history.

## Campaign loops

A loop contains one mechanic manifest and an ordered campaign sequence. Every numeric ceiling and same-revision retry policy is explicit. Separate campaign runs remain separate evidence. An accepted fix may checkpoint exact manually approved successes from the interrupted cohort into its next campaign by immutable reference.

An achieved custom sequence is not automatically mechanic proof. Proof still requires achieved discovery, repeatability, and variation steps under one frozen model, all-actual provider configuration, and continuous accepted-fix revision chain.

Fixture-backed isolation may diagnose a failure while a loop is waiting for a fix. It consumes the loop's campaign, submission, isolation, and applicable provider-call budgets but does not advance a proof step.

Repeatability and variation continue after their first and second qualifying failures. Provider failure, rejected provider output, pipeline or runtime-pipeline failure, external mechanic-probe failure, and manual denial count. Pending review, infrastructure failure, cancellation, revision invalidation, and provider-budget exhaustion do not. The third qualifying failure ends the campaign and moves a linked loop to `waiting_for_fix`; an accepted fix begins a new revision cycle at the interrupted cohort, carries its exact approved successes, resets its failure tolerance, and reruns failed or unfinished slots. The maximum no-fix proof envelope is 22 submissions: one discovery, ten repeatability, and up to eleven variation. Fix continuations consume only their newly submitted slots from the global authorized ceilings.

The first and second failures do not authorize a fix. At the third, group failed attempts by classification, furthest stage, and normalized failure signature. Up to three read-only diagnostic subagents may inspect separate clusters. They report evidence and hypotheses to the primary agent, which owns the combined diagnosis, source changes, tests, knowledge reconciliation, and one verified fix checkpoint.

Campaign-tool defects are repaired outside the loop's Sparkline budget. A thrown campaign-runner defect or persisted infrastructure failure moves the loop to `waiting_for_campaign_repair`, preserves the candidate revision, and credits the invalidated campaign, submission, isolation, and Sparkline-attributed provider usage. Gross actual-provider calls remain append-only and enforce the authorization ceiling. Repair `tools/mechanic-generation-campaign/` in the control checkout, then resume without a fix report or proof reset. Runtime readiness requires the exact editor message `Runtime is running in the sandbox.` plus a generated iframe with source; timeout evidence includes the observed editor state.

A verified fix commit starts a new revision cycle at the interrupted sequence step. Earlier achieved steps remain achieved, exact approved successes in the interrupted cohort carry forward by immutable reference, and failed or unfinished slots run again. Campaign links and fix checkpoints remain append-only. Global usage does not reset.

Every new standalone campaign and loop records the digest of `data/generation-knowledge.json` at creation. Older records are normalized with `knowledgePolicy.required: false` and remain readable and resumable.

Before a new loop fix, read the compiled context. Applicable findings are mandatory diagnosis inputs. The context includes all linked failures, isolation results, approved prior successes, and manual-QA verdicts not reviewed by an earlier reconciliation. A reconciliation must preserve its exact manifest and context digests, consult every applicable finding, and dispose every evidence item exactly once. It either performs `add`, `amend`, `confirm`, or `retire` operations or records an explicit no-change reason.

Raw campaign evidence is append-only. A contradiction changes compiled guidance under the same `KF-*` ID, increments its revision, and snapshots the previous mutable fields. A fix commit must append exactly one matching `KR-*` journal entry and include the knowledge file. Remaining terminal evidence is reconciled only after explicit conclusion or discard, so a knowledge-only control-checkout commit cannot change the revision that produced campaign proof.

Loop execution terminal states are `achieved`, `exhausted`, `invalid`, and `blocked`. `interrupted` is resumable on the same clean revision, `waiting_for_manual_qa` requires an explicit user verdict, `waiting_for_campaign_repair` preserves the active campaign while the control-checkout tool is repaired, and `waiting_for_fix` is a Sparkline-fix checkpoint. `concluded` and `discarded` are post-stop lifecycle states. They preserve evidence after local session cleanup.

Only an `exhausted` loop can be extended. The extension is additive to global fix-cycle, campaign-run, submission, isolation, and per-stage provider-call ceilings. Previewing it is read-only and produces a canonical authorization hash. Apply only after the user explicitly authorizes that exact hash. Per-step retry and per-profile isolation policy never changes. Resume from the recorded active-campaign or fix-required exhaustion checkpoint.

Conclude and discard require explicit user direction. Conclusion verifies the clean recorded control checkout and continuous accepted-fix chain, merges verified fixes when necessary, then removes the local worktree and branch. Discard removes them without merging or recording a QA verdict. Dirty or revision-mismatched discard requires a separate force approval after the exact paths are reported. Neither action pushes, switches the control branch, deletes a remote branch, or removes campaign evidence.

Manual review consumes no campaign or provider budget and has no timeout. Parallel candidates are stored as an ordered queue; each review and verdict command targets one exact attempt and removes only that entry. The review command restores only the frozen GenerationRun and GamePack into a clean browser context, blocks provider endpoints, verifies editor mount and runtime health, and remains open until approval, denial, or interruption. A detector or harness exception leaves the verdict pending and moves a linked loop to `waiting_for_campaign_repair`. Only an explicit human denial turns observed gameplay into `manual_qa_rejected` Sparkline evidence.

Loop execution worktrees live under the adjacent `.qa/<repository>/mechanic-generation-campaign-worktrees/` root. Campaign evidence remains under the control checkout's ignored `.qa/mechanic-generation-campaign/` root. Never move a loop worktree beneath the control checkout because nested package roots can change production build behavior.

Immediately after creating a linked loop worktree, copy every repository-root `.env` and `.env.*` file from the control checkout into the worktree without recording its contents in logs or evidence. Then remove that worktree's `node_modules` and `.next` directories, run `npm install` from the worktree root, and only then run the production build. Never copy or share the control checkout's dependency or build directories. A preparation or build failure occurs before the first editor submission and must stop the loop without consuming a submission or provider-call budget.
