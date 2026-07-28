# Research storage

Use two research modes:

- **Task-local:** write a dated, cited Markdown file under `docs/research/` and link it from the current task.
- **Durable cross-feature:** create or update a page under the configured Notion Research Notes page and maintain a mirror under `docs/research/`.

Durable research is **Notion-authoritative**. Begin its repository mirror with:

```markdown
Canonical Notion page: <url>
Last synced from Notion: <ISO-8601 timestamp>
```

Fetch the Notion page before refreshing a mirror. Do not overwrite newer Notion content from a stale repository copy. Prefer primary sources and include direct citations in both copies.
