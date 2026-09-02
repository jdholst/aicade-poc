# How to campaign

A campaign is one bounded cohort run for a frozen manifest, revision, model, and provider configuration. A submission is one editor prompt attempt inside that campaign. Every submission counts, including timeouts and infrastructure failures.

## Choose the question

Use one cohort per campaign:

- `discovery`: one baseline submission. An automated pass becomes a candidate; explicit gameplay approval makes it a success.
- `isolation`: one diagnostic baseline submission with one or more fixture stages. It passes when the declared isolation question is answered and never contributes to mechanic proof.
- `repeatability`: ten baseline submissions on one clean revision. It passes with at least eight manually approved full-actual successes and stops immediately at the third qualifying failure.
- `variation`: five frozen prompts with two base submissions each on one clean revision. Planning must be actual. It passes with at least eight manually approved full-actual successes and at least one approved success for every prompt. One targeted replacement is allowed when both base submissions for exactly one prompt failed and the failure limit has not been reached.

## Freeze the campaign identity

Before a provider-backed run:

1. Choose the manifest and cohort.
2. Validate the manifest with credentials enabled. The CLI loads `.env.local` and `.env` with production precedence and rejects unmapped keyword credentials before a submission.
3. Resolve planning, contract, and source to `actual` or `fixture`.
4. Record the model and repository revision identity.
5. State the submission ceiling and actual-provider stages.
6. Choose `sequential` or an explicit bounded `parallel` execution policy. Parallel is valid only for new repeatability or variation runs and is capped at three active attempts and three pending reviews.
7. Obtain one authorization for that exact bounded campaign and execution-policy hash.

Actual-provider authorization applies to the frozen attempt ceiling. A new campaign, changed manifest, changed provider configuration, or changed source revision requires a new campaign boundary.

## Run

```bash
npm run campaign -- run \
  --manifest <manifest-id-or-path> \
  --cohort <discovery|isolation|repeatability|variation> \
  --provider-modes planning=<actual|fixture>,contract=<actual|fixture>,source=<actual|fixture> \
  --authorize-actual
```

By default, the runner creates a dedicated production build/server on port `3117`. It uses a clean browser context per submission, drives the editor, records provider and fixture calls, reads GenerationRun and GamePack evidence from IndexedDB, runs the external mechanic probe, and writes sanitized attempt artifacts under `.qa`.

The runner freezes one production environment snapshot from `.env.local` and `.env` and passes it to validation, browser credential entry, the build, and the server. Do not source `.env.test`; test-only values are never part of a provider-backed campaign environment.

Use `--base-url` to attach to a server you already control. Use `--headed` when visible browser inspection is useful.

For a new parallel repeatability or variation campaign, add:

```bash
--execution-mode parallel \
--max-concurrent-attempts 3 \
--max-pending-manual-qa 3 \
--planning-concurrency 2 \
--contract-concurrency 3 \
--source-concurrency 2
```

All three stage limits are optional as a group. When omitted, each uses the active-attempt limit. Parallel variation defaults to round-robin prompt order so one prompt does not consume both of its base slots before the other variants receive a slot. Existing frozen runs and runs without `--execution-mode parallel` remain sequential with the legacy prompt order.

The dispatcher reserves a durable attempt slot before launching its clean browser context. It enforces:

```text
active attempts + pending manual reviews <= failure limit - counted failures
```

This prevents already-dispatched work from carrying the campaign past its third qualifying failure. One build, server, and browser process are shared; attempts use isolated contexts, artifact directories, provider-call IDs, and stage-concurrency permits.

## Resume an interrupted campaign

```bash
npm run campaign -- run \
  --manifest <manifest-id-or-path> \
  --cohort <cohort> \
  --resume <campaign-id>
```

Resume preserves prior submissions and continues only the remaining frozen schedule. The original campaign-level authorization is persisted and remains valid while the campaign identity, revision, provider configuration, and ceiling are unchanged.

## Review every automated success

An automated full-actual pipeline and probe pass is recorded as `awaiting_manual_qa`, not `success`. Open the exact frozen GenerationRun and GamePack:

```bash
npm run campaign -- review --campaign <campaign-id> --attempt <attempt-id>
```

The review command verifies artifact hashes and revision identity, starts the candidate's production server, restores the exact IndexedDB records into a clean headed browser, blocks generation-provider requests, and reports `READY FOR MANUAL QA` only after editor mount and runtime health pass. It has no timeout and can be reopened after interruption.

Record one explicit verdict:

```bash
npm run campaign -- approve --campaign <campaign-id> --attempt <attempt-id> [--note <text>]
npm run campaign -- deny --campaign <campaign-id> --attempt <attempt-id> --reason <text>
```

Approval changes the attempt to `success`; resume the same campaign or loop to continue. Denial records `manual_qa_rejected`. Discovery denial is terminal. A first or second repeatability or variation denial resumes the same campaign. The third qualifying failure ends the campaign and sends a linked loop to `waiting_for_fix`.

Parallel candidates form a queue. Approving or denying one attempt removes only that exact candidate. Review and decide every remaining queue entry before resuming generation. The campaign report prints a review command for each pending attempt.

## Interpret evidence

Use the deepest stage supported by persisted or browser evidence:

1. Planning.
2. Intent validation and routing.
3. Runtime foundation.
4. Contract generation and validation.
5. Source generation and validation.
6. Deterministic evaluation and replay.
7. Final Game Spec assembly and handoff.
8. Runtime activation and first-playable validation.
9. Persistence and editor mount.
10. Runtime health and cleanup.
11. External mechanic probe.

When evidence sources disagree, report the shallower stage and record the disagreement.

Use these classifications:

- `provider_failure`: the actual provider failed before a candidate was evaluated.
- `provider_output_rejected`: bounded validation or repair rejected provider output.
- `pipeline_failure`: trusted orchestration, validation, evaluation, assembly, handoff, or persistence failed.
- `runtime_pipeline_failure`: runtime activation or first-playable validation failed.
- `semantic_runtime_failure`: the project mounted, but the external mechanic probe failed.
- `infrastructure_failure`: the server, browser, navigation, or harness prevented a valid result.
- `awaiting_manual_qa`: automated pipeline and external probe success pending gameplay review.
- `manual_qa_rejected`: the user denied the candidate with a required reason.
- `success`: the exact full-actual candidate was manually approved.

Preserve the originally recorded outcome. Add later adjudication separately when deeper review changes the interpretation.

After a campaign reaches its third qualifying failure, group the failures by classification, furthest stage, and normalized failure text before diagnosis. Up to three read-only diagnostic agents may inspect separate clusters. The primary agent owns the combined hypothesis, all source edits, tests, knowledge reconciliation, and the single fix checkpoint. The first and second failures remain evidence inside the active campaign and do not authorize a fix cycle.

## Report and publish

```bash
npm run campaign -- report --campaign <campaign-id>
npm run campaign -- publish --campaign <campaign-id>
```

Inspect attempt artifacts before publishing. Fixture-backed evidence answers only its isolation question. It cannot be counted as full-pipeline success.

## Prove a mechanic

For a no-fix proof, run discovery, repeatability, and variation as separate full-actual campaigns with the same revision, model, manifest, and provider modes. Authorize capacity for up to 22 submissions: one discovery, ten repeatability, ten variation base submissions, and at most one targeted variation replacement. When no replacement is needed, the sequence uses 21 submissions.

Provider failure, rejected provider output, pipeline or runtime-pipeline failure, external mechanic-probe failure, and manual denial count toward the three-failure limit. Pending review, infrastructure failure, cancellation, revision invalidation, and provider-budget exhaustion retain their existing states and do not count.

A mechanic is proven only when all three cohorts pass and every counted success reaches the external mechanic probe. Standalone campaigns still require one revision per cohort. In a campaign loop, an accepted fix preserves earlier achieved cohorts and exact manually approved successes from the interrupted cohort, then reruns only failed or unfinished slots under the next accepted revision.

Use a [campaign loop](campaign-loops.md) when one bounded authorization should cover repeated campaigns, diagnostic isolation, and verified pipeline fix cycles. The standalone campaign commands remain the correct boundary for one cohort with no source edits.
