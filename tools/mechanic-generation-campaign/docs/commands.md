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

Output: campaign ID, state, revision key, submission count, and a terminal line for every attempt.

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
