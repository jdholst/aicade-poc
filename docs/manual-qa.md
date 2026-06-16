# Manual QA

## Stable Local Server

Use the loopback-bound dev script when manually testing in Codex:

```bash
npm run dev:local
```

Open:

```text
http://127.0.0.1:3000
```

The explicit host avoids sandbox friction from binding to `0.0.0.0`.
In Codex, starting a local server may still require approving the command because
it opens a listening port.

If port 3000 is already occupied by this repo, keep using the existing server.
If you are unsure which process owns it:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

## Editor Prompt Flow

Run the browser QA helper for the lowest-friction check:

```bash
npm run qa:editor-prompt-flow:browser
```

This command:

- runs the focused prompt-flow regression tests,
- starts a dedicated local Next dev server on `127.0.0.1:3100` if `/editor` is not already reachable,
- drives `/editor` in headless Chrome or Playwright Chromium,
- verifies the no-prompt textarea, submitted prompt bubble, AI config bubble, and enabled build buttons,
- saves screenshots under `.qa/editor-prompt-flow`.

In Codex, this command may require approval because it starts a local server and
launches headless Chrome. If Chrome closes immediately with an `EPERM` process
error, run the command from your local terminal or approve the command in Codex.

Set `QA_PORT=3200` to use a different dedicated QA port, or set `QA_BASE_URL`
to point the browser QA at an already-running server.
If Next refuses to start a second dev server because this repo already has one
running on port 3000, the browser QA helper falls back to `http://localhost:3000`
when that route is reachable.

If Playwright is not installed yet:

```bash
npm install --save-dev @playwright/test
```

If Chrome and Playwright Chromium are both unavailable, install the browser once:

```bash
npx playwright install chromium
```

Run the lightweight QA helper when you only need tests plus route reachability:

```bash
npm run qa:editor-prompt-flow
```

With a running dev server, make the route probe required:

```bash
npm run qa:editor-prompt-flow -- --require-server
```

In Codex, the live route probe may also require approval to reach the local dev
server. Without approval, the helper still runs the focused regression tests and
prints the manual recovery path.

The QA helpers run the hook/component regression tests for:

- `/editor` with no query prompt shows a prompt textarea in the black Prompt bubble.
- Sending the prompt reveals the white AI config bubble.
- A query-string prompt still counts as already submitted.

The lightweight helper then checks whether `/editor` is reachable and prints the
exact manual browser steps.

## Keyword Setup

For full manual generation without pasting a key into the UI, add or reuse a
local keyword mapping in `.env.local`:

```bash
OPENAI_MODEL=gpt-5.4-mini
KEYWORD_<LOCAL_LABEL>=sk-...
```

Find usable local keywords by checking the repo's `.env` files for `KEYWORD_*`
entries. Use the matching label in the keyword field; for example,
`KEYWORD_MY_QA_KEY` maps to `my qa key`. Do not copy real local keyword labels
or API keys into this guide.

## Debug Spec Generation Failures

Use the debug Spec Generation provider when you need to simulate known
generation validation failures without calling OpenAI:

```bash
AICADE_DEBUG_SPEC_GENERATION_FAILURE=missing_entity_reference npm run dev:local
```

See [Debug Spec Generation Provider](./debug-spec-generation-provider.md) for
the full mode list and API/UI examples.

## Durable Outcome Link Inspection

Use this runbook for manual QA that needs raw proof that a successful generated
Phaser run is linked to durable Game Pack outcomes after first-playable
validation.

What to verify:

- A successful build creates one saved Game Pack and one succeeded GenerationRun.
- The saved GenerationRun relationships point at the saved Game Pack,
  Game Spec, Build, Checkpoint, and validation evidence ids.
- The developer export reports those same ids through `linkedOutcomeIds`.
- Failed pre-project or first-playable attempts remain telemetry-only and do
  not get durable project relationships.

Recommended reliable path:

1. Keep any existing user dev server on `localhost:3000` running.
2. Create a temporary QA copy under `/private/tmp`, excluding `.env.local`,
   `.git`, `.next`, and `node_modules`.
3. Symlink the temp copy's `node_modules` to this repo's `node_modules`.
4. Start the temp server with deterministic debug success and webpack:

```bash
env AICADE_DEBUG_SPEC_GENERATION_SUCCESS=1 npm run dev -- --hostname 127.0.0.1 --port 3002 --webpack
```

Use webpack for this temp-copy path. Turbopack rejects a symlinked
`node_modules` that points outside the temp project root.

5. Open:

```text
http://127.0.0.1:3002/editor?idea=Make%20a%20simple%20top-down%20arcade%20game&openAiKeyword=<url-encoded-keyword-label-from-env>
```

6. Click `Build the project`.
7. Wait for durable success UI, not ambiguous transient text:

- `Generated a playable project plan`
- `Runtime is running in the sandbox`

8. Inspect IndexedDB in page context:

- database `sparkline_game_packs`, store `game_packs`
- database `sparkline_generation_runs`, store `generation_runs`
- `window.__sparklineGenerationRunExport({ maxRuns: 5 })`

9. Compare the latest Game Pack ids to the latest GenerationRun
   `relationships`, and compare those to export `runs[0].linkedOutcomeIds`.
10. Stop the temp QA server after verification.

Gotchas from the June 12, 2026 manual QA run:

- The in-app Browser can verify visible UI, but its page scope may hide
  `indexedDB`, `localStorage`, and `window.__sparklineGenerationRunExport`.
  Do not treat it as raw id-link evidence.
- Browser policy blocks `javascript:` bookmarklet or page-context execution.
  Do not bypass that policy with lower-level browser commands.
- Local Playwright may exist without bundled Chromium. If downloading browsers
  is not part of the task, use system Chrome with Playwright's
  `executablePath` instead.
- Launching system Chrome from Codex may need approval because the sandbox can
  block process launch or cleanup.
- `next start` is not a substitute for this debug-success check because debug
  Spec Generation is intentionally blocked under production `NODE_ENV`.
- A live provider headless run can time out while waiting for success. Prefer
  deterministic debug success when the goal is relationship/id inspection.
- Avoid strict waits for text like `Building the project`; multiple elements
  can match. Wait for final success/runtime indicators instead.
- The developer export uses `linkedOutcomeIds`; do not look for raw
  `relationships` in the export payload.

## Browser Check

Manual path:

1. Open `http://127.0.0.1:3000/editor`.
2. Confirm the black Prompt bubble shows a textarea and `Send prompt` is disabled while empty.
3. Enter a game idea and click `Send prompt`.
4. Confirm the white AI config bubble appears.
5. Enter a key word or API key.
6. Confirm both `Build` buttons enable.

If a browser screenshot export flakes, use DOM state and console logs as the primary evidence. The in-app Browser screenshot display may still work even when saving screenshots to disk times out.

If Browser automation cannot type into fields because its virtual clipboard is
unavailable, verify the submitted state directly with query params:

```text
http://127.0.0.1:3000/editor?idea=A%20quick%20QA%20maze&openAiKeyword=<url-encoded-keyword-label-from-env>
```

That should render the submitted Prompt bubble, the white AI config bubble, and
enabled `Build` buttons without requiring typed input.

The Playwright-backed `npm run qa:editor-prompt-flow:browser` command does not
use the in-app Browser clipboard, so prefer it when you need typed interaction
and screenshot artifacts.
