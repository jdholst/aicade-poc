---
name: mechanic-generation-campaign
description: Run and interpret AI-Cade mechanic-generation campaigns when the user asks for campaign attempts, pipeline-stage isolation, repeatability measurement, or prompt-variation testing.
---

# Mechanic generation campaign

Use the repository campaign CLI as the execution boundary. Read its current interface first:

```bash
npm run campaign -- --help
```

Read the [campaign documentation](../../../tools/mechanic-generation-campaign/docs/README.md) when selecting commands, onboarding an operator, or preparing a complete mechanic-proof sequence.

## Run a campaign

1. Identify the manifest and cohort requested by the user. Read [references/protocol.md](references/protocol.md) when selecting a cohort, provider modes, or outcome classification.
2. Validate the manifest. Use `--structure-only` only when credentials are intentionally unavailable and no provider-backed run is starting.
3. State the submission ceiling and resolved planning, contract, and source modes once. Obtain one campaign-level authorization before any actual-provider requests. That authorization covers the frozen ceiling, not later campaigns or source changes.
4. Run or resume through the CLI. Count every submitted prompt, including timeouts and infrastructure failures. Preserve the run when interrupted.
5. Inspect the CLI report and attempt artifacts. Use fixture-backed results only to answer the declared isolation question.
6. Publish the sanitized summary when the evidence is complete, then give the dashboard command and URL.

## Boundaries

- Treat full-actual external-probe success as the only success that contributes to mechanic proof.
- Keep credentials in environment variables. Do not put keys or request keywords in commands, manifests, reports, URLs, or messages.
- Keep one revision identity for a cohort. A source or manifest change ends that cohort and starts a new one.
- Campaign execution records evidence. It does not edit Sparkline or the temporary-fix ledger.
- When a failure requires a code change, stop the campaign and report the exact stage, evidence, and classification. Implement a fix only when the user separately authorizes it. Follow impact analysis and TDD, and record temporary policy in the ledger when applicable.

The live dashboard is read-only. It is a review surface, not a control plane.
