# Campaign loops

A campaign loop is one bounded orchestration for one mechanic. It runs an ordered sequence of ordinary campaigns and keeps every campaign result separate. A loop can rerun an allowed failure classification on the same revision, run approved fixture-backed isolation, or wait while an agent prepares a verified pipeline fix.

Loop success and mechanic proof are different:

- The loop is `achieved` when every configured sequence step passes.
- The mechanic is proven only when discovery, repeatability, and variation pass on the same final revision, model, and all-actual provider configuration.
- Successes from separate campaign runs are never pooled.
- Isolation never contributes to proof.

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
    }
  }
}
```

The values above illustrate the shape only. Choose and authorize limits for each loop explicitly. Validation rejects a definition that cannot contain one complete pass through its sequence.

## One-time authorization

Run validation first. Present the complete sequence, provider modes, campaign ceiling, submission ceiling, fix-cycle ceiling, isolation ceiling, and per-stage actual-provider ceilings once. Start the loop with the exact printed definition hash after authorization.

The authorization remains valid on resume because usage only decreases the remaining envelope. Changing the definition, manifest, prompts, thresholds, probe, model, provider modes, or ceilings invalidates the loop.

## Failure and fix flow

When a campaign fails, the loop checks only that campaign's failed attempts. It starts another campaign on the same revision only when every failure classification is listed by the current step and its same-revision run limit remains.

Otherwise the loop enters `waiting_for_fix`. The agent may run an authorized isolation profile, then work only inside the loop worktree. A fix report must describe one clean committed revision and list passing verification. A temporary fix must also update the canonical temporary-fix ledger. The CLI verifies the report against Git before accepting it.

Every accepted fix creates a new revision cycle. All sequence steps reset to pending, while prior campaigns and fixes remain linked as historical evidence. Global usage never resets.

## Terminal states

- `achieved`: every configured sequence step passed.
- `exhausted`: a declared campaign, submission, fix, isolation, or provider-call ceiling was reached.
- `invalid`: frozen criteria or the worktree identity changed outside the protocol.
- `blocked`: no safe verified in-scope pipeline fix could be produced.
- `interrupted`: execution stopped unexpectedly and can be resumed on the same clean revision.

The loop branch and worktree remain after every terminal state. Execution worktrees live in an adjacent `.qa/<repository>/mechanic-generation-campaign-worktrees/` directory rather than beneath the control checkout, which prevents nested package roots from changing Next.js build behavior. Evidence remains in the control checkout's ignored `.qa/mechanic-generation-campaign/` directory. Review and merge worktree branches manually if appropriate.
