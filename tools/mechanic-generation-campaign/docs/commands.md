# Command reference

Run every command from the repository root through the package script:

```bash
npm run campaign -- <command> [options]
```

The command exits nonzero when its arguments, manifest, environment, campaign state, server, browser run, or persistence step cannot satisfy the requested operation.

## Help

```bash
npm run campaign -- --help
```

Prints the live command and option summary. It makes no provider calls and writes no campaign evidence.

## Validate

```bash
npm run campaign -- validate --manifest <id-or-path> [--structure-only]
```

Purpose: load and validate one `campaign-manifest/v1` before execution.

Arguments:

- `--manifest <id-or-path>` is required. A bare ID resolves inside `tools/mechanic-generation-campaign/manifests/`; a path resolves from the repository root.
- `--structure-only` skips the credential-environment check. It is valid only when no provider-backed run is starting.

Checks:

- Manifest schema and frozen prompt set.
- Prompt requirement coverage.
- Referenced fixture existence, JSON validity, and SHA-256 hashes.
- External probe existence and harness-root containment.
- Credential environment when `--structure-only` is absent.

Output: manifest ID, manifest hash, prompt count, and available fixture stages. It makes no provider calls and does not create a campaign run.

## Run

```bash
npm run campaign -- run \
  --manifest <id-or-path> \
  --cohort <discovery|isolation|repeatability|variation> \
  [--provider-modes planning=<actual|fixture>,contract=<actual|fixture>,source=<actual|fixture>] \
  [--authorize-actual] \
  [--base-url <url>] \
  [--headed] \
  [--resume <campaign-id>] \
  [--port <number>] \
  [--attempt-timeout-ms <number>]
```

Purpose: execute or resume one bounded campaign and persist attempt evidence.

Required arguments:

- `--manifest <id-or-path>` selects the frozen campaign definition.
- `--cohort <name>` selects the schedule and success threshold.

Options:

- `--provider-modes <modes>` overrides the manifest modes. Supply all three stages exactly once. Each mode is `actual` or `fixture`; fixture mode requires a fixture reference in the manifest. Variation requires actual planning.
- `--authorize-actual` confirms campaign-level authorization when at least one stage is actual. `AICADE_CAMPAIGN_ACTUAL_AUTHORIZED=1` is the non-command equivalent for an already authorized bounded run.
- `--base-url <url>` attaches to an existing server instead of creating a production build/server.
- `--headed` shows the Playwright browser.
- `--resume <campaign-id>` continues the unsubmitted portion of the same frozen campaign. Revision mismatch fails closed.
- `--port <number>` selects the dedicated production server port. Default: `3117`.
- `--attempt-timeout-ms <number>` sets the terminal timeout for each editor submission. Default: `300000`. `AICADE_CAMPAIGN_ATTEMPT_TIMEOUT_MS` can supply the default.

Schedules:

- Discovery: one baseline submission.
- Isolation: one baseline submission.
- Repeatability: ten baseline submissions.
- Variation: two submissions for each of five frozen prompts.

Side effects:

- Actual modes can make paid provider calls.
- Fixture modes fulfill matching browser requests without upstream provider calls.
- A clean browser context is created for every submission.
- Sanitized attempts, network envelopes, storage records, logs, screenshots, timelines, and probe evidence are written under `.qa/mechanic-generation-campaign/`.
- No Sparkline source or temporary-fix ledger entry is edited.

Output: campaign ID, state, revision key, submission count, and a terminal line for every attempt. A full-actual proof candidate stops at `waiting_for_manual_qa`.

## Review gameplay

```bash
npm run campaign -- review --campaign <campaign-id> [--port <number>]
```

Purpose: open the exact frozen automated candidate for human gameplay review.

- `--campaign <campaign-id>` is required and must be `waiting_for_manual_qa`.
- `--port <number>` selects the candidate production-server port. Default: `3117`.

The command verifies the revision and candidate hashes, starts the candidate worktree's production server, launches a headed clean browser, restores only the recorded GenerationRun and GamePack, blocks both generation-provider endpoints, and reports `READY FOR MANUAL QA` after editor mount and runtime health pass. It remains open without a timeout until a verdict or interruption. It makes zero provider calls.

## Approve gameplay

```bash
npm run campaign -- approve --campaign <campaign-id> --attempt <attempt-id> [--note <text>]
```

Purpose: explicitly approve the exact pending candidate. The optional note is stored with the decision. Repeating the same verdict is idempotent; a conflicting or stale verdict fails. Approval consumes no budget and makes zero provider calls. Resume the same campaign or linked loop using the command printed by the CLI.

## Deny gameplay

```bash
npm run campaign -- deny --campaign <campaign-id> --attempt <attempt-id> --reason <text>
```

Purpose: record the candidate as `mechanic_incorrect` with classification `manual_qa_rejected`. A non-empty reason is required. A standalone campaign stops. A linked loop moves directly to `waiting_for_fix`. The command consumes no budget and makes zero provider calls.

## Manual-QA evidence contracts

The harness modifies its existing v1 records directly:

- `campaign-attempt/v1` includes the cohort, immutable automated outcome, optional manual-QA reference, `awaiting_manual_qa`, and the later human adjudication. A full-actual proof attempt cannot be `success` without an approved reference.
- `campaign-run/v2` includes persisted actual-provider authorization, a required compiled-knowledge baseline for new records, `waiting_for_manual_qa`, and the exact pending campaign, attempt, prompt, cohort, revision, and evidence identity. Existing v1 records are accepted with `knowledgePolicy.required: false`.
- `campaign-loop-run/v3` includes the same waiting state, compiled-knowledge policy and accepted reconciliation IDs while preserving the active sequence campaign. Existing v1 and v2 loop records are accepted with `knowledgePolicy.required: false`.
- `campaign-manual-qa/v1` stores `pending`, `approved`, or `denied`; request and decision timestamps; exact candidate artifact hashes; review sessions; an optional approval note; and a required denial reason.

Pending-review fields are required only in waiting states. Existing legacy narrative successes are normalized as approved with `legacy_assumed` provenance. They remain historical evidence and are not mixed into current revision proof cohorts.

## Compiled campaign knowledge

Validate the Git-tracked canonical file:

```bash
npm run campaign -- knowledge validate
```

Report findings with optional `--status`, `--confidence`, `--applicability`, `--stage`, `--classification`, or `--manifest` filters:

```bash
npm run campaign -- knowledge report [filters]
```

Compute read-only, deterministic context for exactly one campaign or loop:

```bash
npm run campaign -- knowledge context --loop <loop-id> [--json]
npm run campaign -- knowledge context --campaign <campaign-id> [--json]
```

The output contains the exact consulted manifest digest, context digest, applicable and related findings, and all linked evidence not reviewed by an earlier reconciliation.

Apply a schema-validated proposal atomically:

```bash
npm run campaign -- knowledge reconcile --loop <loop-id> --proposal <path>
npm run campaign -- knowledge reconcile --campaign <campaign-id> --proposal <path>
```

The proposal path must remain inside the reconciliation target. A proposal is rejected when its digests are stale, an applicable finding was not consulted, an evidence item was omitted or duplicated, confidence lacks sufficient evidence, or an operation violates revision history. Reconciliation makes no provider calls. A loop at `waiting_for_fix` writes only to its dedicated worktree. A disposed loop or standalone campaign writes to the control checkout.

## Dashboard

```bash
npm run campaign -- dashboard [--port <number>]
```

Purpose: serve the loopback-only, read-only campaign dashboard and this documentation.

Options:

- `--port <number>` selects the dashboard port. Default: `4310`.

The process remains active until interrupted. It polls local campaign files, serves sanitized artifacts, and shows canonical findings plus clearly labeled loop-local pending knowledge, amendments, reconciliations, and evidence references. It makes no provider calls and does not modify campaign evidence.

## Report

```bash
npm run campaign -- report --campaign <campaign-id>
```

Purpose: print the persisted terminal summary for one campaign.

Arguments:

- `--campaign <campaign-id>` is required and must identify an existing run.

Output: campaign ID, state, revision key, submissions versus ceiling, and each attempt's status, furthest stage, and provider modes. It makes no provider calls and does not change evidence.

## Publish

```bash
npm run campaign -- publish --campaign <campaign-id>
```

Purpose: append a sanitized compact campaign summary to `tools/mechanic-generation-campaign/data/campaign-history.jsonl`.

Arguments:

- `--campaign <campaign-id>` is required and must identify an existing run.

Publishing does not create a Git commit, rewrite attempt evidence, or make provider calls. New records cannot publish qualifying evidence until it is reconciled. Review the full attempt evidence before publishing.

## Import legacy evidence

Check the existing Markdown import without writing:

```bash
npm run campaign -- import-legacy --check
```

Regenerate the committed normalized JSONL snapshots:

```bash
npm run campaign -- import-legacy --write
```

Purpose: normalize the historical attempt reports and temporary-fix ledger while leaving their Markdown authoritative.

Exactly one flag is required:

- `--check` parses and validates the expected 80 attempts and 33 temporary fixes without writing.
- `--write` regenerates `legacy-attempts.jsonl` and `legacy-temporary-fixes.jsonl`.

This command makes no provider calls. It fails if source parsing or expected historical record counts change.

## Campaign loop commands

Campaign loops coordinate several immutable campaigns for one mechanic. They use a clean dedicated `codex/campaign-loop-*` worktree in an adjacent `.qa/<repository>/mechanic-generation-campaign-worktrees/` root and central ignored evidence storage in the control checkout. Keeping the execution package tree outside the control package tree avoids nested Next.js workspace-root inference. A stopped loop retains its branch and worktree until an explicit `conclude` or `discard` command. No loop command pushes or deletes a remote branch.

### Validate a loop

```bash
npm run campaign -- loop validate --definition <path>
```

Validates `campaign-loop-manifest/v1`, the exact campaign manifest and external-probe hashes, credentials, current clean revision, sequence, retry classifications, isolation profiles, and every explicit ceiling. It prints the definition hash used for authorization and makes no provider calls.

### Start a loop

```bash
npm run campaign -- loop run \
  --definition <path> \
  --authorize <definition-hash> \
  [--headed] [--port <number>] [--attempt-timeout-ms <number>]
```

The authorization value must exactly match the validated definition hash. One successful authorization covers the frozen sequence and remaining ceilings across later resumes. The command creates a linked worktree, copies every repository-root `.env` and `.env.*` file from the control checkout without logging its contents, removes the worktree's `node_modules` and `.next`, runs `npm install` there, and then runs the production build before the first editor submission. It then runs campaigns sequentially, records every submission and actual provider request before forwarding, and stops at `waiting_for_manual_qa`, `waiting_for_fix`, or a terminal loop status. Preparation, installation, or build failure stops before submission and does not consume provider-call budget.

### Resume a loop

Resume an interrupted campaign on the unchanged revision:

```bash
npm run campaign -- loop resume --id <loop-id>
```

Resume after a verified fix commit:

```bash
npm run campaign -- loop resume --id <loop-id> --fix-report <path>
```

A fix report is accepted only from `waiting_for_fix`. Its before and after revisions, commit, changed files, verification, trigger campaign, and durable or temporary classification must match the clean loop worktree. Temporary fixes must include their canonical ledger entries. Knowledge-required loops must also commit `generation-knowledge.json` with exactly one replayable fix-cycle reconciliation that accounts for the current context. An accepted fix records its `KR-*` ID, increments the fix cycle, and restarts the sequence from its first step.

If the accepted revision contains a campaign-runner correction that the control checkout does not yet contain, execute the accepted worktree's CLI and add `--state-root <control-checkout-path>` to `loop resume`. The worktree then supplies both application and orchestration code while the original control checkout remains the persisted campaign and loop evidence root. `--state-root` is accepted only by `loop resume`.

If a loop is `waiting_for_manual_qa`, use the top-level `review` and verdict commands first. Approval returns the loop to `running`; denial returns it to `waiting_for_fix`. Calling `loop resume` before a verdict fails closed.

### Extend an exhausted loop

Preview an additive budget extension:

```bash
npm run campaign -- loop extend \
  --id <loop-id> \
  --add-campaign-runs <number> \
  [--add-fix-cycles <number>] \
  [--add-submissions <number>] \
  [--add-auxiliary-isolations <number>] \
  [--add-planning-calls <number>] \
  [--add-contract-calls <number>] \
  [--add-source-calls <number>]
```

At least one addition must be positive. A preview prints usage, current ceilings, additions, resulting ceilings, the recorded resume checkpoint, and a canonical extension hash. It is read-only and makes zero provider calls.

Apply the exact preview and resume:

```bash
npm run campaign -- loop extend \
  --id <loop-id> \
  --add-campaign-runs <number> \
  --authorize <extension-hash> \
  [--fix-report <path>] \
  [--headed] [--port <number>] [--attempt-timeout-ms <number>]
```

The hash binds the loop identity, authorization, revision, usage, old ceilings, additions, resulting ceilings, and exhaustion checkpoint. It can be applied once. Only `exhausted` loops can be extended. An active campaign resumes from its recorded checkpoint. A fix-required checkpoint remains at `waiting_for_fix` unless the same command includes a valid fix report. Per-step retry limits and per-profile isolation limits remain frozen policy and cannot be extended.

### Run auxiliary isolation

```bash
npm run campaign -- loop isolate \
  --id <loop-id> \
  --profile <authorized-profile-id>
```

Runs one approved fixture-backed isolation campaign while the loop is waiting for a fix. It consumes global and profile limits, but never advances proof.

### Mark a loop blocked

```bash
npm run campaign -- loop block --id <loop-id> --reason <text>
```

Use this only when the agent cannot produce a safe verified in-scope fix. The worktree and evidence remain available for review.

### Conclude a loop

```bash
npm run campaign -- loop conclude --id <loop-id>
```

Concluding accepts `achieved`, `exhausted`, `blocked`, and safely verifiable `invalid` loops. It verifies that the recorded control checkout is clean, on a branch, still rooted at the recorded path, and descended from the loop base. The loop worktree must be clean, and accepted fix checkpoints must form a continuous commit chain ending at the loop branch tip. Verified fixes are merged with `--no-ff` unless they are already ancestors of the control branch. A no-fix loop skips the merge. Merge conflicts are aborted and leave the loop branch, worktree, and status available for recovery. Successful reconciliation removes the worktree and local loop branch, then records `concluded`. The command is idempotent when cleanup or merging was already completed manually.

### Discard a loop

```bash
npm run campaign -- loop discard --id <loop-id> [--force]
```

Discard accepts any non-running loop state. It removes the worktree and local loop branch without merging, clears pending execution references without recording a QA verdict, preserves all run, attempt, fix, and loop evidence, and records `discarded`. Dirty worktrees or revision mismatches fail with the affected paths listed. Review those paths and issue a separate, explicit `--force` command to delete them. The command is idempotent when cleanup already happened manually.

### Report a loop

```bash
npm run campaign -- loop report --id <loop-id>
```

Prints status, current revision cycle, worktree branch, sequence progress, usage, remaining budgets, extension history, lifecycle disposition, and proof status.

### Publish a loop

```bash
npm run campaign -- loop publish --id <loop-id>
```

Atomically upserts one sanitized `campaign-loop-history/v2` record by loop ID in `campaign-loop-history.jsonl`. Republish after an extension, conclusion, or discard to refresh the existing dashboard row without creating a duplicate. Absolute control/worktree paths and credentials are omitted. Publishing does not commit, merge, or push. Uncommitted published history makes the control checkout dirty and therefore blocks conclusion until it is committed or otherwise handled.
