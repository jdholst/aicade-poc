# Phase 09 Ticket 17 — Real-provider attempts, round 2

## Goal

Generate and visibly run a playable game from this exact editor prompt:

> Create a top-down game where the player can shoot a projectile.

Constraints for this round:

- Attempt count restarted at **0 of 10** by explicit user authorization.
- Every `/editor` submission must use `gpt-5.6-luna`.
- Provider access must use an accepted keyword from `.env.local` without recording its value.
- Each attempt must be observed through a terminal editor outcome and record its deepest pipeline stage, failure, classification, fix, and fix result.
- Success requires a newly generated projectile game to render visibly and be playable; leave that successful browser result open.
- Stop after Attempt 10 if no attempt succeeds.

This round is separate from the completed historical 20-attempt session in `phase-09-ticket-17-real-provider-attempts.md`. Interrupted pre-round subagent diagnostics are excluded from this reset count.

## Attempt counter

- Paid prompt runs performed: **0 of 10**.

## Pre-round excluded diagnostic

- Accounting: excluded from the reset counter because it completed before the new 0-of-10 authorization.
- Prompt/model: exact Ticket 17 prompt with `gpt-5.6-luna`.
- Furthest stage: bounded generated-source repair; Final Game Spec handoff and runtime mount were not reached.
- Failure: `callbacks.1.source` — `Property 'hypot' does not exist on type 'Math'.`
- Classification: deterministic trusted source-type-surface mismatch. Direct deterministic `Math` members are allowed by static policy and the SES/browser runtime supports `Math.hypot`, but the hand-authored no-lib TypeScript declaration omitted it.
- Fix: add `hypot(...values: readonly number[]): number` to the trusted generated-source `Math` declaration through a red-to-green public source-stage regression. No grant, authority, runtime behavior, or provider guidance changed.
- Fix result: focused generated-source service suite passes (1 file / 56 tests), full suite passes (112 files / 1,158 tests), and the production rebuild succeeds. Attempt 1 remains pending action-time confirmation before the prepared credential is submitted.
