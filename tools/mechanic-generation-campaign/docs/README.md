# Mechanic generation campaign documentation

This directory is the AI agent entry point and canonical operator documentation for the removable mechanic-generation campaign harness.

## Read by task

- [Getting started](getting-started.md): install assumptions, credentials, validation, and the first diagnostic run.
- [How to campaign](how-to-campaign.md): cohort selection, authorization, evidence review, resuming, publishing, and mechanic proof.
- [Campaign loops](campaign-loops.md): bounded multi-campaign proof, fix checkpoints, revision resets, and one-time authorization.
- [Command reference](commands.md): every `npm run campaign` command, option, default, side effect, and failure condition.

## Agent workflow

1. Read `.codex/skills/mechanic-generation-campaign/SKILL.md` for execution policy.
2. Read [How to campaign](how-to-campaign.md) before starting or resuming provider-backed work.
3. Run `npm run campaign -- --help` and treat the live CLI interface as authoritative if it disagrees with this documentation.
4. Validate the selected manifest before requesting campaign-level provider authorization.
5. Stop after evidence collection when a source change is required. A standalone campaign does not authorize Sparkline or ledger edits. A separately authorized campaign loop may coordinate verified fixes in its dedicated worktree.

The browser documentation uses these Markdown files directly. Update this directory when campaign commands or protocol rules change.
