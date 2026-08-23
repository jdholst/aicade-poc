# Getting started

The campaign harness runs outside `src/`. It drives the browser-visible editor, records attempt evidence under `.qa/mechanic-generation-campaign/`, and leaves Sparkline source unchanged during a campaign.

## Prerequisites

- Run commands from the repository root.
- Install the repository dependencies.
- Choose one manifest from `tools/mechanic-generation-campaign/manifests/`.
- Use a clean worktree for repeatability, variation, and any complete mechanic-proof sequence.
- Configure the credential environment variable named by the manifest. The seeded manifests use `AICADE_CAMPAIGN_KEYWORD`.

Keep credential values in the environment. They must not appear in commands, URLs, manifests, reports, or messages.

## Inspect the live interface

```bash
npm run campaign -- --help
```

Use the live help output as the final authority for command syntax.

## Validate a manifest

```bash
npm run campaign -- validate --manifest p09-t17-projectile
```

Validation checks the manifest contract, five frozen prompts, fixture references and hashes, external probe, and configured credential environment. Use `--structure-only` only when no provider-backed run will start.

## Run the smallest full-pipeline campaign

A discovery cohort submits the baseline prompt once. The following configuration makes planning, contract, and source generation actual provider calls:

```bash
npm run campaign -- run \
  --manifest p09-t17-projectile \
  --cohort discovery \
  --provider-modes planning=actual,contract=actual,source=actual \
  --authorize-actual
```

Before running it, state the one-submission ceiling and all three provider modes, then obtain one authorization for that bounded campaign. The authorization does not cover a later campaign or a changed revision.

## Review the result

The run command prints the campaign ID, status, revision key, submission count, and each attempt's terminal status and furthest stage.

```bash
npm run campaign -- report --campaign <campaign-id>
npm run campaign -- dashboard
```

Open `http://127.0.0.1:4310` while the dashboard command is running. The dashboard is read-only.

Publish a sanitized compact summary only after reviewing the evidence:

```bash
npm run campaign -- publish --campaign <campaign-id>
```

Publishing appends history data. It does not create a Git commit.

## Run a multi-campaign proof loop

Read [Campaign loops](campaign-loops.md), create an explicit loop definition under ignored `.qa` storage, and validate it before requesting authorization:

```bash
npm run campaign -- loop validate --definition .qa/ticket-17-loop.json
```

Validation prints the exact definition hash and all campaign, submission, fix, isolation, and provider-call ceilings. Use that hash only after the complete envelope has been authorized.
