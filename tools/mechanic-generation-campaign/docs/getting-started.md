# Getting started

The campaign harness runs outside `src/`. It drives the browser-visible editor, records attempt evidence under `.qa/mechanic-generation-campaign/`, and leaves Sparkline source unchanged during a campaign.

## Prerequisites

- Run commands from the repository root.
- Install the repository dependencies.
- Choose one manifest from `tools/mechanic-generation-campaign/manifests/`.
- Use a clean worktree for repeatability, variation, and any complete mechanic-proof sequence.
- Configure the credential environment variable named by the manifest in `.env.local` or `.env`. The seeded manifests use `AICADE_CAMPAIGN_KEYWORD`.

Keep credential values in the environment. They must not appear in commands, URLs, manifests, reports, or messages.

The campaign CLI loads `.env.local` and `.env` itself using Next.js production precedence. Do not source `.env.test` before a provider-backed command. Test-only values are intentionally excluded from the campaign environment.

## Inspect the live interface

```bash
npm run campaign -- --help
```

Use the live help output as the final authority for command syntax.

## Validate a manifest

```bash
npm run campaign -- validate --manifest p09-t17-projectile
```

Validation checks the manifest contract, five frozen prompts, fixture references and hashes, external probe, and configured credential environment. Keyword credentials must resolve to their matching server-side `KEYWORD_*` entry before validation succeeds. This preflight makes no provider call. Use `--structure-only` only when no provider-backed run will start.

When the manifest includes pricing, validation also checks the immutable snapshot hash and model coverage. Use `npm run campaign -- pricing refresh --check` to compare the latest snapshot with the official OpenAI documentation before authorizing a new loop.

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

## Review an automated candidate

A full-actual proof run pauses at `waiting_for_manual_qa`. A parallel run can queue as many as three exact candidates. Launch one candidate by attempt ID:

```bash
npm run campaign -- review --campaign <campaign-id> --attempt <attempt-id>
```

Wait for `READY FOR MANUAL QA`, play the game in the headed browser, and explicitly approve or deny the attempt in another terminal:

```bash
npm run campaign -- approve --campaign <campaign-id> --attempt <attempt-id> --note "Optional note"
npm run campaign -- deny --campaign <campaign-id> --attempt <attempt-id> --reason "Required gameplay defect"
```

The review and verdict commands make zero provider calls. Approval lets the same frozen campaign resume without another authorization. Discovery denial is terminal. Repeatability and variation continue after denial one or two and enter a linked loop fix cycle only at the third qualifying failure. A campaign-tool or review-detector defect instead pauses at `waiting_for_campaign_repair`; repair the tool in the control checkout and resume without a Sparkline fix cycle or regenerated candidate.

Campaign browser readiness requires `Runtime is running in the sandbox.` and a generated iframe with source. If that observation times out, the attempt retains the editor snapshot and a linked loop stops at `waiting_for_campaign_repair` before another submission.

## Opt into bounded parallel proof runs

Discovery and isolation remain sequential. A new repeatability or variation run can explicitly freeze a parallel execution policy:

```bash
npm run campaign -- run \
  --manifest p09-t17-projectile \
  --cohort repeatability \
  --provider-modes planning=actual,contract=actual,source=actual \
  --execution-mode parallel \
  --max-concurrent-attempts 3 \
  --max-pending-manual-qa 3 \
  --planning-concurrency 2 \
  --contract-concurrency 3 \
  --source-concurrency 2 \
  --authorize-actual
```

The runner uses one production server and isolated browser contexts. It never allows active attempts plus pending reviews to exceed the remaining three-failure tolerance. A batch therefore contains at most three candidates. Review every queued candidate and resume the same campaign to dispatch the next bounded batch. Existing frozen campaigns remain sequential when resumed.

## Review the result

The report prints the campaign ID, status, revision key, submission count, pending review, and each attempt's terminal status and furthest stage.

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

When the loop starts, the CLI creates the linked worktree, copies every repository-root `.env` and `.env.*` file from the control checkout without logging its contents, loads the copied `.env.local` and `.env` into one production environment snapshot, removes its `node_modules` and `.next`, runs `npm install` inside it, and then runs the production build before submitting the first prompt. The same snapshot supplies validation, browser credential input, the build, and the server. `.env.test` is copied for repository parity but is not loaded. Do not copy dependencies or build output from the control checkout into the loop worktree.
