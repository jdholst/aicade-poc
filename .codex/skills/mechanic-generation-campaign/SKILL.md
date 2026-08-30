---
name: mechanic-generation-campaign
description: Run and interpret AI-Cade mechanic-generation campaigns or bounded campaign loops for pipeline isolation, consistency measurement, prompt variation, and revision-specific mechanic proof.
---

# Mechanic generation campaign

Use the repository campaign CLI as the execution boundary. Read its current interface first:

```bash
npm run campaign -- --help
```

Read the [campaign documentation](../../../tools/mechanic-generation-campaign/docs/README.md) when selecting commands, onboarding an operator, or preparing a complete mechanic-proof sequence.

Use [campaign loops](../../../tools/mechanic-generation-campaign/docs/campaign-loops.md) only when the user requests a bounded sequence that may include repeated campaigns and verified pipeline fixes.

## Run a campaign

1. Identify the manifest and cohort requested by the user. Read [references/protocol.md](references/protocol.md) when selecting a cohort, provider modes, or outcome classification.
2. Validate the manifest. Use `--structure-only` only when credentials are intentionally unavailable and no provider-backed run is starting.
3. State the submission ceiling, resolved planning, contract, and source modes, frozen pricing snapshot when present, and execution policy. Parallel execution is explicit for a new repeatability or variation run only, is capped at three active attempts and three pending reviews, and must include its normalized policy hash in the authorization envelope. Existing frozen runs remain sequential. Obtain one campaign-level authorization before any actual-provider requests. That authorization covers the frozen ceiling and policy, not later campaigns or source changes.
4. Run or resume through the CLI. Preserve evidence for every submitted prompt and every gross provider call. The dispatcher must keep active attempts plus pending reviews within the remaining failure tolerance. An infrastructure failure in a linked loop stops the active campaign immediately and enters the budget-neutral campaign-repair lifecycle; it must not advance to another scheduled submission.
5. When the report lists pending manual QA, run `npm run campaign -- review --campaign <campaign-id> --attempt <attempt-id>` for one exact queue entry. Wait for `READY FOR MANUAL QA`, then give the user the campaign and attempt IDs, prompt variant, controls, and frozen mechanic requirements. Stop until the user explicitly approves or denies that exact candidate. Never infer approval from silence or ambiguous feedback. Process every remaining queue entry separately.
6. On approval, run `approve` with the exact attempt ID and optional note, then resume the same campaign or linked loop without requesting provider authorization again. On denial, run `deny` with the user's exact reason. Discovery denial is terminal. In repeatability and variation, denial one or two resumes the same campaign; denial three ends the campaign and sends a linked loop to `waiting_for_fix` with every denial reason preserved.
7. Inspect the CLI report and attempt artifacts. Use fixture-backed results only to answer the declared isolation question. The first and second qualifying failures remain evidence in the active campaign and do not authorize diagnosis edits or a fix cycle.
8. Publish the sanitized summary when the evidence is complete, then give the dashboard command and URL.

## Run a campaign loop

1. Read the campaign-loop documentation and live `loop --help` output. Validate the selected definition.
2. Present the complete sequence, model, provider modes, per-step execution modes and policy hashes, definition hash, frozen pricing identity, and campaign, submission, fix, isolation, per-stage actual-provider, and cost ceilings. Obtain one authorization for that exact hash.
3. Start or resume through the loop CLI. Immediately after creating a new linked worktree, copy every repository-root `.env` and `.env.*` file from the control checkout into it without logging or capturing their contents. Then remove the worktree's `node_modules` and `.next` directories, run `npm install` there, and complete the production build before the first editor submission. Do not reuse dependencies from the control checkout. Use the absolute worktree path reported by the CLI for every diagnosis, edit, test, and Git operation.
4. At `waiting_for_manual_qa`, review each exact queued candidate by attempt ID, report `READY FOR MANUAL QA`, and stop for an explicit verdict. Approval removes only that candidate and resumes the same active campaign after the queue is decided. A repeatability or variation denial resumes the same campaign while fewer than three qualifying failures have occurred. Discovery denial or the third qualifying failure moves to `waiting_for_fix`.
5. At `waiting_for_fix`, inspect the linked campaign artifacts and the report's failure clusters. Group by classification, furthest stage, and normalized failure signature. You may spawn at most three read-only diagnostic subagents, one per distinct cluster. Subagents may inspect evidence and propose hypotheses but may not edit, commit, launch provider calls, or adjudicate gameplay. Consolidate overlapping causes before choosing one fix. Run an authorized isolation profile only when it answers a specific stage-level question.
6. Before charging or implementing a fix, identify the owning code. A defect in `tools/mechanic-generation-campaign/` is a campaign-tool defect, not a Sparkline generation failure. Record it with `loop repair-campaign`, repair and verify it in the control checkout, then use `loop resume`. Do not create a loop fix report, consume a fix cycle, reset proof, or change the candidate revision. A thrown campaign-runner defect credits its invalidated campaign, submission, isolation, and Sparkline-attributed provider usage; gross actual-provider calls remain append-only and continue to enforce the authorized ceiling.
7. Before diagnosing or editing a Sparkline generation failure, run `npm run campaign -- knowledge context --loop <loop-id> --json` from the control checkout. Treat its manifest and context digests as exact proposal inputs. Cite every applicable `KF-*` finding in the diagnosis, and explicitly distinguish related findings that do not apply.
8. For a Sparkline pipeline fix, run GitNexus impact analysis where indexed, reproduce the failure with a red test, implement a mechanic-general fix in the loop worktree, and verify focused tests, the full relevant suite, lint, and a production build. Run `detect_changes()` before committing.
9. Prepare a `campaign-knowledge-reconciliation/v1` proposal inside the loop worktree. Account exactly once for every context evidence item, including linked failures, isolation results, approved prior successes, and manual-QA verdicts. Use `incorporated`, `confirming`, or `not_reusable` with a reason. Re-run context if evidence or the manifest changed, then run `knowledge reconcile` before the fix commit.
10. Classify the Sparkline fix as durable or temporary. Update the canonical temporary-fix ledger only for temporary policy. Commit the verified code, `generation-knowledge.json`, and any temporary-policy entry together on the loop branch, then create the exact `campaign-loop-fix/v1` report described in the loop documentation.
11. Resume with the fix report. Acceptance requires exactly one append-only reconciliation whose loop, fix, trigger campaign, consulted findings, evidence dispositions, digests, and committed manifest all match. A committed Sparkline fix starts a new revision cycle and resets proof to the first configured step. Continue without per-attempt provider confirmation while the authorized envelope remains unchanged. Human gameplay approval remains required for every automated candidate.
12. Stop at `achieved`, `exhausted`, `invalid`, or `blocked`. If no safe in-scope Sparkline fix exists, record `blocked` through the CLI. Report the stopped session's worktree, branch, status, pending knowledge, and available lifecycle actions. Do not extend, conclude, discard, or publish a disposition until the user explicitly chooses it.

## Manage a stopped loop

- To extend an `exhausted` loop, run `loop extend` with the requested additive budget flags and no `--authorize`. Use `--add-cost-usd` for a cost addition. Report current usage, old ceilings, additions, resulting ceilings, resume checkpoint, and the exact extension hash. The preview must make zero provider calls and must not mutate evidence. Wait for explicit authorization of that exact hash, then repeat the same additions with `--authorize <extension-hash>`. A different hash or changed state requires a new preview and approval.
- To conclude an eligible terminal loop, wait for an explicit conclude instruction, then run `loop conclude --id <loop-id>`. Report whether fixes were merged or already present and whether the local worktree and branch were removed. Never push, switch the control checkout branch, or infer that an unverified commit should be merged.
- To discard a non-running loop, wait for an explicit discard instruction, then run `loop discard --id <loop-id>` without `--force`. If the CLI reports dirty or revision-mismatched paths, show those exact paths and request separate explicit approval before repeating with `--force`. Discard preserves evidence and records no manual-QA verdict.
- After conclude or discard, run `knowledge context --loop <loop-id>`. Reconcile any remaining approved success or final terminal failure in the control checkout before publishing. This post-disposition knowledge-only commit must not change the proven loop revision. Republishing updates the existing loop ID instead of adding a duplicate. If uncommitted history makes the control checkout dirty, handle that explicitly before conclusion.

## Boundaries

- Treat a full-actual pipeline and external-probe pass as an automated candidate. Only explicit human approval of that exact candidate contributes to mechanic proof.
- Keep credentials in environment variables. Do not put keys or request keywords in commands, manifests, reports, URLs, or messages.
- Keep one revision identity for a cohort. A source or manifest change ends that cohort and starts a new one.
- A standalone campaign records evidence and does not edit Sparkline or the temporary-fix ledger. A campaign loop may coordinate edits only through its dedicated worktree and verified fix-checkpoint contract.
- When a failure requires a code change, stop the campaign and report the exact stage, evidence, and classification. Implement a fix only when the user separately authorizes it. Follow impact analysis and TDD, and record temporary policy in the ledger when applicable.
- Initial loop authorization freezes prompts, probes, thresholds, model, provider modes, retry policy, per-step retries, per-profile isolation limits, and the original ceilings. Only an exhausted loop's global budgets can receive a separately previewed, exact-hash-authorized additive extension.
- Keep loop credentials in environment variables and preserve every submitted attempt and provider call. Fixture-backed isolation never contributes to proof.
- Treat the manifest's pricing snapshot as immutable campaign evidence. Every actual call receives a stable receipt, and missing or malformed provider usage settles at the frozen conservative upper bound. Cost ceilings are soft stops: the current call may cross the limit, then the loop exhausts before another call is forwarded. Campaign-tool repair may reduce attributed cost but never gross provider spend.
- Run `pricing refresh --check` to detect official pricing drift. `--write --effective-at` creates a new immutable snapshot and never updates manifests or reprices existing evidence. Unpriced historical calls remain unknown and display as `—`.
- Raw attempt and manual-QA evidence is immutable. Compiled `KF-*` guidance can change only through an `amend`, `confirm`, or `retire` operation that preserves the prior revision in amendment history.
- Manual review has no timeout and consumes no campaign, submission, provider-call, or fix-cycle budget. Review and verdict commands must make zero provider calls.
- A manual-review detector failure leaves the frozen verdict pending and moves a linked loop to `waiting_for_campaign_repair`. It must never be converted automatically into a Sparkline runtime failure or manual denial.
- Repeatability and variation schedule ten base submissions, require eight approved successes, and stop immediately at the third qualifying failure. Provider, rejected-output, pipeline, runtime-pipeline, external-probe, and manual-denial failures count. Infrastructure failures, pending review, cancellation, revision invalidation, and provider-budget exhaustion retain their own states and do not count.
- Parallel execution is opt-in for new repeatability and variation runs. It uses one production server and isolated browser contexts, with no more than three active attempts or pending reviews. Active attempts plus pending reviews must fit within the remaining failure tolerance. Existing frozen campaigns and omitted policies remain sequential.
- The first and second qualifying failures do not trigger a fix. At the third, cluster the campaign's failures and use read-only diagnostic subagents only to increase inspection coverage. The primary agent alone owns source edits, verification, compiled-knowledge reconciliation, and the fix checkpoint.
- Variation may schedule one targeted eleventh submission only when both base submissions for one prompt variant failed and the campaign has not reached three failures. A proof sequence therefore requires authorization capacity for up to 22 submissions.
- Browser execution recognizes runtime readiness only when the editor reports `Runtime is running in the sandbox.` and the generated runtime iframe has source. A readiness timeout must preserve an editor snapshot and stop for campaign repair instead of consuming the next submission.
- Leave stopped loop branches and worktrees for human review until the user explicitly requests conclusion or discard. Never push or delete remote branches. Use only the lifecycle commands for local merge and cleanup.

The live dashboard is read-only. It is a review surface, not a control plane.
