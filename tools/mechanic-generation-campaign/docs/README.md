# Mechanic generation campaign documentation

This directory is the AI agent entry point and canonical operator documentation for the removable mechanic-generation campaign harness.

## Read by task

- [Getting started](getting-started.md): install assumptions, credentials, validation, and the first diagnostic run.
- [How to campaign](how-to-campaign.md): cohort selection, bounded parallel execution, queued gameplay review, resuming, publishing, and mechanic proof.
- [Campaign loops](campaign-loops.md): bounded multi-campaign proof, failure clustering, knowledge gathering and use, checkpointed cohort continuation across accepted fixes, budget extensions, and stopped-session lifecycle.
- [Command reference](commands.md): every `npm run campaign` command, compiled-knowledge workflow, option, default, side effect, and failure condition.

## Agent workflow

1. Read `.codex/skills/mechanic-generation-campaign/SKILL.md` for execution policy.
2. Read [How to campaign](how-to-campaign.md) before starting or resuming provider-backed work.
3. Run `npm run campaign -- --help` and treat the live CLI interface as authoritative if it disagrees with this documentation.
4. Validate the selected manifest before requesting campaign-level provider authorization.
5. Stop at every `waiting_for_manual_qa` state, launch the review browser, and wait for explicit approval or denial. Never infer approval.
6. Stop after evidence collection when a source change is required. A standalone campaign does not authorize Sparkline or ledger edits. A separately authorized campaign loop may coordinate verified fixes in its dedicated worktree.
7. Before each loop fix, read compiled knowledge context, cite applicable findings, reconcile every linked evidence item, and commit the journal update with the fix.
8. After a loop stops, wait for an explicit instruction to extend, conclude, or discard it. Preview extensions before authorization and require separate force approval for dirty discard. Reconcile remaining terminal evidence after disposition and before publication.

The browser documentation uses these Markdown files directly. Update this directory when campaign commands or protocol rules change.
