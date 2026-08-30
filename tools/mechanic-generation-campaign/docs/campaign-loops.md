# Campaign loops

A campaign loop is one bounded orchestration for one mechanic. It runs an ordered sequence of ordinary campaigns and keeps every campaign result separate. A loop can rerun an allowed failure classification on the same revision, run approved fixture-backed isolation, or wait while an agent prepares a verified pipeline fix.

Loop success and mechanic proof are different:

- The loop is `achieved` when every configured sequence step passes.
- The mechanic is proven only when discovery, repeatability, and variation pass on the same final revision, model, and all-actual provider configuration.
- Successes from separate campaign runs are never pooled.
- Isolation never contributes to proof.
- Every automated full-actual proof success pauses at `waiting_for_manual_qa`. Only explicit approval advances the submission or cohort.

## Definition contract

Every `campaign-loop-manifest/v1` contains one exact campaign manifest, its external-probe hash, one model, an ordered sequence, approved isolation profiles, and all limits. Numeric limits and retry policies have no defaults.

```json
{
  "schemaVersion": "campaign-loop-manifest/v1",
  "id": "p09-t17-proof-loop",
  "manifest": {
    "path": "tools/mechanic-generation-campaign/manifests/p09-t17-projectile.json",
    "sha256": "<64-character manifest hash>",
    "probeSha256": "<64-character probe hash>"
  },
  "model": "gpt-5.6-luna",
  "sequence": [
    {
      "id": "discovery",
      "cohort": "discovery",
      "providerModes": {
        "planning": "actual",
        "contract": "actual",
        "source": "actual"
      },
      "maxCampaignRunsPerRevision": 2,
      "retryableClassifications": [
        "provider_failure",
        "infrastructure_failure"
      ]
    },
    {
      "id": "repeatability",
      "cohort": "repeatability",
      "providerModes": {
        "planning": "actual",
        "contract": "actual",
        "source": "actual"
      },
      "executionPolicy": {
        "mode": "parallel",
        "maxConcurrentAttempts": 3,
        "maxPendingManualQa": 3,
        "stageConcurrency": {
          "planning": 2,
          "contract": 3,
          "source": 2
        },
        "scheduleOrder": "round_robin"
      },
      "maxCampaignRunsPerRevision": 1,
      "retryableClassifications": []
    }
  ],
  "isolationProfiles": [],
  "limits": {
    "maxFixCycles": 3,
    "maxCampaignRuns": 8,
    "maxSubmissions": 30,
    "maxAuxiliaryIsolationCampaigns": 2,
    "actualProviderCalls": {
      "planning": 30,
      "contract": 60,
      "source": 60
    },
    "maxActualProviderCostNanoUsd": 25000000000
  }
}
```

The values above illustrate the shape only. Choose and authorize limits for each loop explicitly. Validation rejects a definition that cannot contain one complete pass through its sequence.

An omitted execution policy is frozen as sequential behavior when the linked campaign starts. Parallel policy is valid only for repeatability and variation, with limits from one through three. The definition hash binds every execution-policy field, and validation prints the normalized policy hash for each sequence step. Existing frozen definitions never opt into parallel execution silently.

The cost ceiling is optional. When present, the referenced campaign manifest must freeze a pricing snapshot. A frozen snapshot without a cost ceiling records cost without enforcing a limit. A cost ceiling without a snapshot is invalid.

## One-time authorization

Run validation first. Present the complete sequence, provider modes, campaign ceiling, submission ceiling, fix-cycle ceiling, isolation ceiling, and per-stage actual-provider ceilings once. Start the loop with the exact printed definition hash after authorization.

The authorization remains valid on ordinary resume because usage only decreases the remaining envelope. Changing the definition, manifest, prompts, thresholds, probe, model, provider modes, pricing identity, or original ceilings invalidates the loop. An exhausted loop can receive a separately hash-authorized additive extension without changing its frozen definition. Per-step retry limits and per-profile isolation limits remain fixed.

## Provider cost accounting

Before each actual provider request, the loop records a stable call ID and a conservative maximum reservation from the frozen snapshot. Valid returned usage replaces that reservation with exact calculated cost. Missing or malformed usage keeps the reservation as a conservative estimate. Resume settles unresolved reservations once, so interrupted evidence is not charged twice.

The cost limit is a soft stop. The current request may cross it, but settled spend plus pending reservations prevents the next provider request. Reports and the dashboard separate exact, estimated, pending, remaining, and overage amounts. Gross spend never decreases. A campaign-tool repair can credit Sparkline-attributed cost while preserving gross spend.

## Worktree preparation

Starting a new loop creates its linked worktree and then performs this sequence inside that worktree:

1. Copy every repository-root `.env` and `.env.*` file from the control checkout without logging or capturing its contents.
2. Remove `node_modules` and `.next`.
3. Run `npm install` to create worktree-local dependencies.
4. Run `npm run build` before the first editor submission.

Dependencies and build output are never copied from the control checkout. Environment files remain ignored worktree-local configuration and are excluded from campaign evidence. If copying, installation, or the production build fails, the loop stops before making an editor submission or provider request. Resuming an existing loop does not recreate its worktree or repeat installation automatically.

## Failure and fix flow

When a full-actual proof submission passes the automated pipeline and external probe, the loop preserves that active campaign and pauses at `waiting_for_manual_qa`. Run the review command, let the user inspect the live exact output, and record an explicit approval or denial. Approval resumes the same campaign without consuming another campaign, submission, provider-call, or fix-cycle unit. Discovery denial moves directly to `waiting_for_fix`. In repeatability and variation, denial one or two resumes the same campaign; denial three ends the campaign and moves to `waiting_for_fix`.

Repeatability and variation each stop immediately at three qualifying failures. Provider failure, rejected provider output, pipeline or runtime-pipeline failure, external mechanic-probe failure, and manual denial count. Pending review, infrastructure failure, cancellation, revision invalidation, and provider-budget exhaustion do not. Variation can use one targeted replacement after its ten base submissions when both submissions for exactly one prompt failed and no third failure occurred. A complete proof definition must therefore authorize up to 22 submissions and matching per-stage actual-provider calls.

Parallel proof steps dispatch only while active attempts plus pending manual reviews fit inside the remaining failure tolerance. A step with no counted failures can have at most three candidates at risk. After those attempts drain, the loop waits for exact per-attempt verdicts. The first and second qualifying failures do not start a fix. The third ends the campaign, preserves all failure clusters, and moves the loop to `waiting_for_fix`.

When a campaign fails, the loop checks only that campaign's failed attempts. It starts another campaign on the same revision only when every failure classification is listed by the current step and its same-revision run limit remains.

A defect owned by `tools/mechanic-generation-campaign/` does not enter the Sparkline fix flow. A thrown campaign-runner defect pauses at `waiting_for_campaign_repair`, preserves the active candidate and Sparkline revision, and credits the invalidated campaign, submission, isolation, and Sparkline-attributed provider usage. Gross actual-provider calls remain append-only and continue to enforce the authorization ceiling. Repair and verify the campaign tool in the control checkout, then run `loop resume` without a fix report. This does not consume a fix cycle or reset proof.

The browser runner treats `Runtime is running in the sandbox.` plus a generated iframe with source as the runtime-ready contract. A terminal-state timeout preserves the observed editor snapshot as infrastructure evidence and aborts the campaign immediately. A linked loop enters `waiting_for_campaign_repair` instead of starting the next scheduled submission.

Manual-review detector failures follow the same path and leave the exact verdict candidate pending. The user may still explicitly approve or deny that candidate while repair is pending. The harness never converts its own failure into a gameplay denial.

Otherwise the loop enters `waiting_for_fix`. The agent may run an authorized isolation profile, then work only inside the loop worktree. Before diagnosis, `knowledge context --loop <id>` selects applicable and related canonical findings and all unreconciled linked evidence. The diagnosis cites applicable `KF-*` IDs. A proposal then accounts for every evidence item and either changes compiled guidance or records an explicit no-change reason.

At the third failure, normalize failures into clusters by classification, furthest stage, and failure signature. The primary agent may assign at most three clusters to read-only diagnostic subagents. Subagents report evidence and hypotheses only. The primary agent consolidates overlapping causes, chooses one mechanic-general fix, performs every edit and verification step, and records one fix checkpoint. Fixing each failed output independently is not permitted because one pipeline defect may explain several attempts.

A fix report must describe one clean committed revision and list passing verification. A temporary fix must also update the canonical temporary-fix ledger. The same commit includes the code fix and `generation-knowledge.json` with exactly one new `KR-*` reconciliation. The CLI independently reloads the prior Git version, recomputes context, replays the journal operation, and verifies the source loop, fix, trigger campaign, digests, consulted findings, and evidence dispositions before accepting the report.

Every accepted fix creates a new revision cycle. All sequence steps reset to pending, while prior campaigns and fixes remain linked as historical evidence. Global usage never resets.

## Knowledge gathering and use

Campaign knowledge has two layers. Campaign artifacts are immutable evidence: submitted attempts, stage outcomes, isolation results, manual-QA verdicts, accepted fixes, and terminal loop outcomes remain attached to the run that produced them. `generation-knowledge.json` is the compiled interpretation of that evidence. Its `KF-*` findings may be corrected as new evidence arrives, while stable IDs and amendment history preserve what changed and why.

### Gather knowledge

1. A new loop records the current knowledge-manifest digest as its baseline. This identifies the compiled knowledge available when the loop began without copying it into the loop record.
2. Campaign execution records raw evidence. A failure that triggers a fix, an approved candidate, and the final failure behind a terminal stop are qualifying evidence. Isolation results and manual-QA verdicts linked to the same interval also enter the next reconciliation context.
3. At `waiting_for_fix`, run `knowledge context --loop <id> --json` before diagnosis. The command gathers every linked evidence item not covered by an earlier reconciliation and selects canonical findings by mechanic or manifest, pipeline stage, and failure classification. Empty stage or classification scope means the finding applies to any value in that dimension.
4. Inspect the referenced artifacts rather than relying only on their summaries. Account for every context evidence ID exactly once as `incorporated`, `confirming`, or `not_reusable`. A `not_reusable` disposition requires a specific rationale.
5. Prepare one reconciliation proposal using the exact manifest and context digests returned by `knowledge context`. The proposal may `add`, `amend`, `confirm`, or `retire` findings. If the evidence changes no compiled guidance, use an explicit no-change reason instead of an operation.
6. Run `knowledge reconcile` before the fix commit. It recomputes context and rejects stale digests, omitted applicable findings, incomplete evidence coverage, invalid confidence, and revision conflicts. A successful reconciliation appends one `KR-*` journal event and atomically updates the manifest.
7. Commit the manifest update with the corresponding code fix. After explicit conclude or discard, gather and reconcile any remaining approved success or terminal failure in the control checkout before publication.

Evidence strength limits confidence. Fixture or isolation evidence can support a `hypothesis`. An actual submission or verified fix can support a finding. `confirmed` requires an approved manual-QA candidate or matching evidence from two independent actual campaigns. Confidence describes the evidence behind guidance, not whether the current loop has proven its mechanic.

### Use knowledge

The context output separates `applicable` findings from `related` findings. Applicable findings match the current mechanic or manifest and the stage and classification of at least one unreconciled evidence item. Related findings match the evidence dimensions but belong to another mechanic or manifest. Use them for comparison and explicitly state that they do not govern the current fix.

Before editing, cite each applicable `KF-*` ID in the diagnosis and state how its current guidance affects the failure hypothesis, implementation boundary, and regression tests. The finding's evidence references provide the prior artifacts to inspect. Its scope prevents mechanic-specific behavior from being generalized to the whole pipeline, and its confidence indicates how cautiously to rely on it.

When current evidence contradicts a finding, amend the existing stable ID rather than silently overwriting it or adding a duplicate. The amendment increments the revision, snapshots the previous mutable fields, and records the contradiction reason and evidence. Retire a finding when its guidance should no longer direct future work. Later contexts use the current active revision while retaining the complete history for review.

The fix checkpoint enforces this use mechanically. Resume verifies that the fix commit contains exactly one matching reconciliation, every applicable finding was consulted, every context evidence item was dispositioned, and the committed manifest is the result of replaying the proposal against the prior Git version. A fix cannot be accepted when its knowledge context is missing, stale, or incomplete.

## Terminal states

- `achieved`: every configured sequence step passed.
- `exhausted`: a declared campaign, submission, fix, isolation, or provider-call ceiling was reached.
- `invalid`: frozen criteria or the worktree identity changed outside the protocol.
- `blocked`: no safe verified in-scope pipeline fix could be produced.
- `interrupted`: execution stopped unexpectedly and can be resumed on the same clean revision.
- `waiting_for_manual_qa`: the exact playable candidate is ready for an explicit human verdict. This state has no timeout.
- `waiting_for_campaign_repair`: campaign orchestration is paused while `tools/mechanic-generation-campaign/` is repaired outside Sparkline budgets; the active candidate and revision remain frozen.
- `concluded`: the stopped loop was reconciled with its recorded control checkout and its local worktree and branch were removed.
- `discarded`: the stopped loop's local worktree and branch were removed without merging or recording a QA verdict.

The loop branch and worktree remain after a stop until an explicit lifecycle command runs. Execution worktrees live in an adjacent `.qa/<repository>/mechanic-generation-campaign-worktrees/` directory rather than beneath the control checkout, which prevents nested package roots from changing Next.js build behavior. Evidence remains in the control checkout's ignored `.qa/mechanic-generation-campaign/` directory through every lifecycle action.

## Post-stop session management

### Extend and resume

Only an `exhausted` loop can be extended. Budget additions are available for fix cycles, campaign runs, submissions, auxiliary isolation campaigns, planning, contract, and source provider calls, and USD cost. At least one addition must be positive. Cost can be extended only when pricing was already frozen for the loop.

Run `loop extend` without `--authorize` first. The read-only preview reports current usage, old ceilings, additions, resulting ceilings, the exhaustion resume checkpoint, and a canonical extension hash. It changes no evidence and makes no provider calls. Supplying that exact hash applies the extension once and resumes from the checkpoint. A loop exhausted during an active campaign continues that campaign. A loop exhausted while waiting for a fix remains there unless a verified fix report is supplied.

### Conclude

`loop conclude` accepts stopped `achieved`, `exhausted`, `blocked`, or safely verifiable `invalid` loops. The command verifies the recorded control checkout, base ancestry, cleanliness, loop worktree identity, and the continuous accepted-fix chain. One accepted fix checkpoint may span multiple commits only when they form a linear single-parent sequence from the recorded before revision to the recorded after revision and the aggregate changed files exactly match the fix report. If verified fixes are not already merged, conclusion performs a no-fast-forward merge into the branch currently checked out at the recorded control root. If there are no fixes or the loop tip is already an ancestor, it skips the merge. A conflict is aborted without changing loop lifecycle state or deleting the session. After successful reconciliation, it removes the local worktree and branch and records `concluded` last so retries can reconcile manual or partial cleanup.

### Discard

`loop discard` accepts any non-running loop state. It removes the local worktree and branch without merging, preserves all campaign evidence, and records `discarded` without inferring a manual-QA verdict. Dirty or revision-mismatched work requires a separate `--force` invocation after the CLI reports the exact affected paths. Conclude and discard are idempotent when the worktree or branch was already removed manually.

No lifecycle command switches the control checkout branch, pushes commits, or deletes remote branches. After disposition, remaining approved success or final terminal failure is reconciled in the control checkout before publication. This knowledge-only commit does not change the proven loop revision. Publishing after disposition atomically refreshes the loop's existing history row by ID. A dirty control checkout, including uncommitted published history, blocks conclusion.
