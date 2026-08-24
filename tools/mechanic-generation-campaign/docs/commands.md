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

## Manual-QA v1 evidence contracts

The harness modifies its existing v1 records directly:

- `campaign-attempt/v1` includes the cohort, immutable automated outcome, optional manual-QA reference, `awaiting_manual_qa`, and the later human adjudication. A full-actual proof attempt cannot be `success` without an approved reference.
- `campaign-run/v1` includes persisted actual-provider authorization, `waiting_for_manual_qa`, and the exact pending campaign, attempt, prompt, cohort, revision, and evidence identity.
- `campaign-loop-run/v1` includes the same waiting state and pending identity while preserving the active sequence campaign.
- `campaign-manual-qa/v1` stores `pending`, `approved`, or `denied`; request and decision timestamps; exact candidate artifact hashes; review sessions; an optional approval note; and a required denial reason.

Pending-review fields are required only in waiting states. Existing legacy narrative successes are normalized as approved with `legacy_assumed` provenance. They remain historical evidence and are not mixed into current revision proof cohorts.

## Dashboard

```bash
npm run campaign -- dashboard [--port <number>]
```

Purpose: serve the loopback-only, read-only campaign dashboard and this documentation.

Options:

- `--port <number>` selects the dashboard port. Default: `4310`.

The process remains active until interrupted. It polls local campaign files, serves sanitized artifacts, makes no provider calls, and does not modify campaign evidence.

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

Publishing does not create a Git commit, rewrite attempt evidence, or make provider calls. Review the full attempt evidence before publishing.

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

- `--check` parses and validates the expected 80 attempts and 32 temporary fixes without writing.
- `--write` regenerates `legacy-attempts.jsonl` and `legacy-temporary-fixes.jsonl`.

This command makes no provider calls. It fails if source parsing or expected historical record counts change.

## Campaign loop commands

Campaign loops coordinate several immutable campaigns for one mechanic. They use a clean dedicated `codex/campaign-loop-*` worktree in an adjacent `.qa/<repository>/mechanic-generation-campaign-worktrees/` root and central ignored evidence storage in the control checkout. Keeping the execution package tree outside the control package tree avoids nested Next.js workspace-root inference. The loop never merges, pushes, deletes, or cleans up its branch automatically.

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

The authorization value must exactly match the validated definition hash. One successful authorization covers the frozen sequence and remaining ceilings across later resumes. The command creates a linked worktree, removes that worktree's `node_modules` and `.next`, runs `npm install` there, and then runs the production build before the first editor submission. It then runs campaigns sequentially, records every submission and actual provider request before forwarding, and stops at `waiting_for_manual_qa`, `waiting_for_fix`, or a terminal loop status. Installation or build failure stops before submission and does not consume provider-call budget.

### Resume a loop

Resume an interrupted campaign on the unchanged revision:

```bash
npm run campaign -- loop resume --id <loop-id>
```

Resume after a verified fix commit:

```bash
npm run campaign -- loop resume --id <loop-id> --fix-report <path>
```

A fix report is accepted only from `waiting_for_fix`. Its before and after revisions, commit, changed files, verification, trigger campaign, and durable or temporary classification must match the clean loop worktree. Temporary fixes must include their canonical ledger entries. An accepted fix increments the fix cycle and restarts the sequence from its first step.

If a loop is `waiting_for_manual_qa`, use the top-level `review` and verdict commands first. Approval returns the loop to `running`; denial returns it to `waiting_for_fix`. Calling `loop resume` before a verdict fails closed.

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

### Report a loop

```bash
npm run campaign -- loop report --id <loop-id>
```

Prints status, current revision cycle, worktree branch, sequence progress, usage, remaining budgets, and proof status.

### Publish a loop

```bash
npm run campaign -- loop publish --id <loop-id>
```

Appends a sanitized compact record to `campaign-loop-history.jsonl`. Absolute control/worktree paths and credentials are omitted. Publishing does not commit, merge, or push.
