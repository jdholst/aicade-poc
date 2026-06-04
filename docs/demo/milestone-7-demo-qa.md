# Milestone 7 Demo QA Guide

Use this runbook when you want to demo or manually QA the Milestone 7 prompt-to-spec flow. It is written for a presenter: keep the app open, follow the path, and capture the small pieces of evidence that prove the milestone works.

## What This Proves

Milestone 7 proves that AI-Cade can take a creator prompt, generate a compact top-down Phaser Game Spec, validate it on the server, mount it through the trusted Phaser template, and hold the draft behind first-playable evidence before calling it playable.

It also proves the important failure behavior:

- Invalid AI output is rejected or repaired instead of silently mounted.
- Repair is bounded to one automatic attempt.
- Creator-facing success copy stays friendly.
- Failure receipts can show compact repair details without exposing raw invalid candidate JSON.
- Provider request failures stay separate from candidate validation failures.

Milestone 7 does not prove durable generated Game Pack persistence, full `GenerationRun` telemetry, Canvas migration, production auth, production storage, or long-term project history for generated drafts. Those are later milestones.

## Before You Demo

Start the app on the loopback-bound local server:

```bash
npm run dev:local
```

Open:

```text
http://127.0.0.1:3000/editor
```

If port 3000 is already occupied by this repo, keep using the running server. If you are unsure which process owns it:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

For a live model demo, use a keyword mapping or paste an API key into the UI. For keyword setup, add a local mapping in `.env.local`:

```bash
OPENAI_MODEL=gpt-5.4-mini
KEYWORD_INTERNAL_TEST=sk-...
```

Then use `internal test` in the editor keyword field. Do not include real API keys in screenshots, recordings, or copied evidence.

When you change `AICADE_DEBUG_SPEC_GENERATION_SUCCESS` or `AICADE_DEBUG_SPEC_GENERATION_FAILURE`, restart the dev server. The route reads those values when the Next server starts.

## Demo Path 1: Real Prompt-To-Playable

Use this for the main milestone demo. It exercises the real provider path.

1. Start the app with no debug generation env var set.
2. Open `http://127.0.0.1:3000/editor`.
3. In the prompt box, submit:

   ```text
   Make a simple top-down arcade game where the player moves around a small arena, collects coins, avoids one chasing enemy, and wins after collecting all coins.
   ```

4. Enter a keyword or API key.
5. Click `Build`.
6. Wait for the generated runtime to appear.
7. Confirm the generated project log says one of these:

   ```text
   Generated a playable project plan from the prompt.
   ```

   or, if the first candidate was repaired:

   ```text
   Generated a playable project plan from the prompt after 1 automatic repair.
   ```

8. Confirm the runtime does not stay stuck on a booting/loading screen.
9. Confirm the player is visible.
10. Press the arrow keys and confirm the player responds.
11. Confirm the generated project summary describes a Phaser/spec-generated project, not a Canvas starter project.

Expected result:

- The prompt creates a validated top-down Phaser draft.
- The draft mounts in the runtime surface.
- The draft becomes playable only after first-playable evidence passes.
- If repair happened, the success chat mentions automatic repair without listing validation issue details.

Evidence to capture:

- Screenshot of the generated project log.
- Screenshot of the running game.
- The prompt text and model used.
- Whether the success was first-pass or repaired.
- A short note that arrow-key input moved the player.

## Demo Path 2: Deterministic Debug Success

Use this when you want a stable demo without calling OpenAI.

1. Stop the dev server if it is already running.
2. Start the debug success provider:

   ```bash
   AICADE_DEBUG_SPEC_GENERATION_SUCCESS=1 npm run dev:local
   ```

3. Open `http://127.0.0.1:3000/editor`.
4. Submit any top-down game prompt.
5. Click `Build`.
6. Wait for the runtime to mount.
7. Confirm the generated project log says:

   ```text
   Generated a playable project plan from the prompt.
   ```

8. Confirm no automatic repair copy appears.
9. Confirm the player appears and responds to arrow-key input.

Expected result:

- The app uses a deterministic valid top-down spec.
- The editor still follows the generated-spec path.
- No OpenAI call is required.
- No repair copy appears because the candidate is valid on the first attempt.

Evidence to capture:

- Screenshot of the generated project log.
- Screenshot of the running game.
- Note that `AICADE_DEBUG_SPEC_GENERATION_SUCCESS=1` was active.

## Demo Path 3: Repaired Success

Use this when the live model naturally returns an invalid first candidate and the repair retry succeeds. There is not currently a dedicated debug env mode that forces this browser path. The deterministic proof for repaired success is the controlled provider coverage in the Spec Generation route/service tests and the generated project log component test.

1. During a live prompt-to-playable demo, watch the generated project log after the build succeeds.
2. If the run was repaired, confirm there is one AI success bubble.
3. Confirm it says:

   ```text
   Generated a playable project plan from the prompt after 1 automatic repair.
   ```

4. Confirm the success chat does not show validation paths such as `entities.*`, `mechanics.*`, `objectives`, or raw issue messages.
5. Confirm the game still mounts and passes first-playable behavior.
6. If the live demo does not produce a repaired success, record that repaired success is covered by deterministic tests instead of treating the manual run as failed.

Deterministic proof:

```bash
npx vitest run src/service/spec-generation/spec-generation-service.test.ts src/service/spec-generation/spec-generation-route-handler.test.ts src/components/editor-shell/editor-ai-chat.test.tsx -t "repair"
```

Expected result:

- Repair is visible to the presenter.
- The copy is friendly enough for a creator-facing demo.
- Validation issue detail stays out of the success chat.

Evidence to capture:

- Screenshot of the single AI success bubble.
- Screenshot of the playable runtime.
- Note that the success came after automatic repair.
- If no live repaired success occurred, terminal output from the deterministic repaired-success tests.

## Failure Path 1: Invalid Candidate / Repaired Failure

Use this to prove invalid generated specs do not sneak into the runtime.

1. Stop the dev server if it is already running.
2. Start the debug failure provider:

   ```bash
   AICADE_DEBUG_SPEC_GENERATION_FAILURE=missing_entity_reference npm run dev:local
   ```

3. Optional API proof. In another terminal, call:

   ```bash
   curl -s http://127.0.0.1:3000/api/spec-generation \
     -H 'Content-Type: application/json' \
     -d '{"enteredPrompt":"Make a tiny top-down collection game."}'
   ```

4. Confirm the response is a structured failure. It should include:

   ```json
   {
     "ok": false,
     "stage": "semantic_validation",
     "taskRoute": "spec_generation.primary",
     "attemptCount": 2
   }
   ```

   The exact issue text can vary by mode, but the response should include validation issues and compact `repairAttempts` summaries.

5. Open `http://127.0.0.1:3000/editor`.
6. Submit any prompt.
7. Enter any keyword or placeholder API key if the Build button needs one. The debug provider bypasses credential resolution in development.
8. Click `Build`.
9. Confirm the runtime does not mount an invalid game.
10. Confirm the failure details include:

   ```text
   Automatic repair was attempted once and stopped.
   ```

11. Confirm the receipt shows compact path/message issue summaries.
12. Confirm normal UI does not show raw invalid candidate JSON.

Expected result:

- The invalid first candidate triggers one repair retry.
- The repaired candidate still fails.
- The editor stops with a validation failure surface.
- No fixture or invalid generated draft is mounted as a fallback.

Evidence to capture:

- API response snippet or terminal output.
- Screenshot of the editor failure surface.
- Note the debug mode used.
- Note that the runtime did not become playable.

## Failure Path 2: Provider Request Failure

Use this to prove provider failures before candidate validation keep the existing generation error copy.

This is different from `AICADE_DEBUG_SPEC_GENERATION_FAILURE`. Debug failure modes return an invalid candidate, which then fails validation. Provider request failure means the provider throws before any candidate exists, so schema, semantic, and mechanic validation never run.

Deterministic proof:

```bash
npx vitest run src/service/spec-generation/spec-generation-route-handler.test.ts -t "returns model-generation failure when the provider request fails"
```

Expected result:

- The failure stage is `model_generation`.
- The user-facing copy remains:

  ```text
  I couldn't design a game plan from that prompt. Please try again.
  ```

- No repair receipt is shown because there was no candidate to repair.

Evidence to capture:

- Terminal output for the focused test.
- Note that this is a provider/request failure, not candidate validation failure.

## Failure Path 3: First-Playable Evidence Block

Use this when you need to prove that runtime-ready alone is not enough for generated drafts.

Generated specs must pass the runtime/browser evidence checks:

- `nonblank_render`
- `player_visible`
- `input_response`

Follow the current breakpoint/manual QA recipes for forcing these evidence failures. Do not rely on prompt-only instructions such as "make the player invisible"; the trusted Phaser template owns player rendering, and prompt steering is not a reliable way to fail these checks.

For each evidence check:

1. Start from a generated-spec flow.
2. Use the relevant breakpoint/manual recipe to force one evidence check to fail.
3. Let the runtime emit or withhold evidence.
4. Confirm the generated draft stays blocked.
5. Confirm the validation details identify the failed check.
6. Reset the breakpoint or restart the server before moving to the next check.

Expected result:

- A generated draft is not considered playable on runtime boot alone.
- Failed evidence keeps the editor on the blocked/failure surface.
- The failed check is visible in validation details.

Evidence to capture:

- Screenshot of the blocked/failure surface.
- The failed check ID.
- A short note describing how the check was forced.

## Sign-Off Checklist

Use this checklist when closing the task:

- Real prompt-to-playable demo captured.
- Deterministic debug success captured.
- Repaired success behavior captured or accounted for with controlled-provider/test evidence.
- Invalid candidate / repaired failure captured.
- Provider request failure accounted for.
- First-playable evidence block accounted for.
- No raw invalid candidate spec appeared in normal UI.
- Intentional boundaries noted: generated drafts are ephemeral, durable repair telemetry is deferred, and Canvas migration is out of scope.

When all boxes are checked, Milestone 7 has demo evidence for the happy path and the failure paths that protect the first playable experience.
