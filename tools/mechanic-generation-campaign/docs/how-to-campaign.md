# How to campaign

A campaign is one bounded cohort run for a frozen manifest, revision, model, and provider configuration. A submission is one editor prompt attempt inside that campaign. Every submission counts, including timeouts and infrastructure failures.

## Choose the question

Use one cohort per campaign:

- `discovery`: one baseline submission. It passes with one full-actual pipeline and external-probe success.
- `isolation`: one diagnostic baseline submission with one or more fixture stages. It passes when the declared isolation question is answered and never contributes to mechanic proof.
- `repeatability`: ten baseline submissions on one clean revision. It passes with at least eight full-actual successes.
- `variation`: five frozen prompts with two submissions each on one clean revision. Planning must be actual. It passes with at least eight full-actual successes and at least one success for every prompt.

## Freeze the campaign identity

Before a provider-backed run:

1. Choose the manifest and cohort.
2. Validate the manifest with credentials enabled.
3. Resolve planning, contract, and source to `actual` or `fixture`.
4. Record the model and repository revision identity.
5. State the submission ceiling and actual-provider stages.
6. Obtain one authorization for that exact bounded campaign.

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

Use `--base-url` to attach to a server you already control. Use `--headed` when visible browser inspection is useful.

## Resume an interrupted campaign

```bash
npm run campaign -- run \
  --manifest <manifest-id-or-path> \
  --cohort <cohort> \
  --resume <campaign-id> \
  --authorize-actual
```

Resume preserves prior submissions and continues only the remaining frozen schedule. The CLI rechecks actual-provider authorization when a resumed process starts. The same campaign-level human authorization remains valid only when the campaign identity and ceiling have not changed.

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
- `success`: the full-actual pipeline and external probe passed.

Preserve the originally recorded outcome. Add later adjudication separately when deeper review changes the interpretation.

## Report and publish

```bash
npm run campaign -- report --campaign <campaign-id>
npm run campaign -- publish --campaign <campaign-id>
```

Inspect attempt artifacts before publishing. Fixture-backed evidence answers only its isolation question. It cannot be counted as full-pipeline success.

## Prove a mechanic

Run discovery, repeatability, and variation as separate full-actual campaigns with the same revision, model, manifest, and provider modes. The complete proof sequence contains 21 submissions: one discovery, ten repeatability, and ten variation.

A mechanic is proven only when all three cohorts pass and every counted success reaches the external mechanic probe. If source or manifest changes are needed, end the current revision cohort, implement the separately authorized fix, and begin a new proof sequence.

Use a [campaign loop](campaign-loops.md) when one bounded authorization should cover repeated campaigns, diagnostic isolation, and verified pipeline fix cycles. The standalone campaign commands remain the correct boundary for one cohort with no source edits.
