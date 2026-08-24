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
3. State the submission ceiling and resolved planning, contract, and source modes once. Obtain one campaign-level authorization before any actual-provider requests. That authorization covers the frozen ceiling, not later campaigns or source changes.
4. Run or resume through the CLI. Count every submitted prompt, including timeouts and infrastructure failures. Preserve the run when interrupted.
5. When a full-actual proof submission reaches `waiting_for_manual_qa`, run `npm run campaign -- review --campaign <campaign-id>`. Wait for `READY FOR MANUAL QA`, then give the user the campaign and attempt IDs, prompt variant, controls, and frozen mechanic requirements. Stop until the user explicitly approves or denies that exact candidate. Never infer approval from silence or ambiguous feedback.
6. On approval, run `approve` with the exact attempt ID and optional note, then resume the same campaign or linked loop without requesting provider authorization again. On denial, run `deny` with the user's exact reason. A standalone campaign stops; a linked loop enters `waiting_for_fix` and uses the denial reason as fix evidence.
7. Inspect the CLI report and attempt artifacts. Use fixture-backed results only to answer the declared isolation question.
8. Publish the sanitized summary when the evidence is complete, then give the dashboard command and URL.

## Run a campaign loop

1. Read the campaign-loop documentation and live `loop --help` output. Validate the selected definition.
2. Present the complete sequence, model, provider modes, definition hash, and campaign, submission, fix, isolation, and per-stage actual-provider ceilings. Obtain one authorization for that exact hash.
3. Start or resume through the loop CLI. A new loop must prepare its linked worktree by removing that worktree's `node_modules` and `.next` directories, running `npm install` there, and then completing the production build before the first editor submission. Do not reuse dependencies from the control checkout. Use the absolute worktree path reported by the CLI for every diagnosis, edit, test, and Git operation.
4. At `waiting_for_manual_qa`, launch the exact candidate review, report `READY FOR MANUAL QA`, and stop for an explicit verdict. Approval resumes the same active campaign. Denial moves directly to `waiting_for_fix` and is never retried on the same revision.
5. At `waiting_for_fix`, inspect the linked campaign artifacts. Run an authorized isolation profile only when it answers a specific stage-level question.
6. For a pipeline fix, run GitNexus impact analysis where indexed, reproduce the failure with a red test, implement a mechanic-general fix, and verify focused tests, the full relevant suite, lint, and a production build. Run `detect_changes()` before committing.
7. Classify the fix as durable or temporary. Update the canonical temporary-fix ledger only for temporary policy, then commit the verified change on the loop branch and create the exact `campaign-loop-fix/v1` report described in the loop documentation.
8. Resume with the fix report. A committed fix starts a new revision cycle and resets proof to the first configured step. Continue without per-attempt provider confirmation while the authorized envelope remains unchanged. Human gameplay approval remains required for every automated candidate.
9. Stop at `achieved`, `exhausted`, `invalid`, or `blocked`. If no safe in-scope fix exists, record `blocked` through the CLI. Publish the sanitized loop summary after reviewing its evidence.

## Boundaries

- Treat a full-actual pipeline and external-probe pass as an automated candidate. Only explicit human approval of that exact candidate contributes to mechanic proof.
- Keep credentials in environment variables. Do not put keys or request keywords in commands, manifests, reports, URLs, or messages.
- Keep one revision identity for a cohort. A source or manifest change ends that cohort and starts a new one.
- A standalone campaign records evidence and does not edit Sparkline or the temporary-fix ledger. A campaign loop may coordinate edits only through its dedicated worktree and verified fix-checkpoint contract.
- When a failure requires a code change, stop the campaign and report the exact stage, evidence, and classification. Implement a fix only when the user separately authorizes it. Follow impact analysis and TDD, and record temporary policy in the ledger when applicable.
- Loop authorization freezes prompts, probes, thresholds, model, provider modes, retry policy, and every ceiling. A change to any frozen input invalidates the loop.
- Keep loop credentials in environment variables and preserve every submitted attempt and provider call. Fixture-backed isolation never contributes to proof.
- Manual review has no timeout and consumes no campaign, submission, provider-call, or fix-cycle budget. Review and verdict commands must make zero provider calls.
- Leave loop branches and worktrees for human review. Never merge, push, delete, or clean them up automatically.

The live dashboard is read-only. It is a review surface, not a control plane.
