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

For full manual generation without pasting a key into the UI, add a local keyword mapping in `.env.local`:

```bash
OPENAI_MODEL=gpt-5.4-mini
KEYWORD_INTERNAL_TEST=sk-...
```

Then use `internal test` in the keyword field. The app normalizes that to `KEYWORD_INTERNAL_TEST`.

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
http://127.0.0.1:3000/editor?idea=A%20quick%20QA%20maze&openAiKeyword=internal%20test
```

That should render the submitted Prompt bubble, the white AI config bubble, and
enabled `Build` buttons without requiring typed input.

The Playwright-backed `npm run qa:editor-prompt-flow:browser` command does not
use the in-app Browser clipboard, so prefer it when you need typed interaction
and screenshot artifacts.
