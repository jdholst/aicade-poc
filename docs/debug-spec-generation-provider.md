# Debug Spec Generation Provider

Use the debug Spec Generation provider when you want to force known validation
failures without editing the production generation prompt or calling OpenAI.

The provider is selected by a local environment variable:

```bash
AICADE_DEBUG_SPEC_GENERATION_FAILURE=missing_entity_reference npm run dev:local
```

The route reads that value from `process.env` when the Next server starts, so
restart the dev server after changing modes. The route ignores OpenAI
credentials while the debug provider is active in development.

## Safety Rules

- The trigger is allowlisted. Unknown values are ignored.
- The trigger is environment-only. There is no request body, header, or
  creator-facing UI override.
- Production rejects the trigger before resolving credentials or calling a
  provider.
- The production OpenAI request body is unchanged.

## Failure Modes

| Mode | Expected stage | Expected issue path |
| --- | --- | --- |
| `missing_primary_objective` | `semantic_validation` | `objectives` |
| `missing_entity_reference` | `semantic_validation` | `mechanics.mechanic_player_movement.entityIds` |
| `invalid_validation_goal_target` | `semantic_validation` | `validationGoals.validation_collectible_reachable.objectiveId` |
| `player_spawn_outside_arena` | `semantic_validation` | `scenes.scene_arena.layout.spawnZones.spawn_player` |
| `duplicate_primary_objectives` | `semantic_validation` | `objectives` |
| `unsupported_mechanic_target` | `mechanic_validation` | `mechanics.mechanic_player_movement.entityIds` |

Each mode starts from the current valid top-down fixture, copies the submitted
prompt into `originalPrompt`, and mutates exactly enough data to exercise that
validation failure.

## Quick API Check

Start the dev server with a failure mode:

```bash
AICADE_DEBUG_SPEC_GENERATION_FAILURE=missing_entity_reference npm run dev:local
```

Then call the route directly. No OpenAI key is required:

```bash
curl -s http://127.0.0.1:3000/api/spec-generation \
  -H 'Content-Type: application/json' \
  -d '{"enteredPrompt":"Make a tiny top-down collection game."}'
```

The response should be a `422` failure with a validation issue like:

```json
{
  "ok": false,
  "stage": "semantic_validation",
  "taskRoute": "spec_generation.primary",
  "attemptCount": 1,
  "validationIssues": [
    {
      "path": "mechanics.mechanic_player_movement.entityIds",
      "message": "Unknown entity ID \"entity_missing\"."
    }
  ]
}
```

## Editor UI Check

Start the dev server with a mode, then open:

```text
http://127.0.0.1:3000/editor
```

Submit any prompt and start generation. The editor form may still require an
API key or keyword to enable the Build button; any placeholder value is enough
for this debug path because the route bypasses credential resolution in
development when the debug provider is active.

The editor should show the normal generation failure surface with the validation
stage and issue details. It should not mount an invalid game in the runtime.

## Switching Modes

Stop the dev server, restart it with another allowlisted mode, then rerun the
same API or editor flow:

```bash
AICADE_DEBUG_SPEC_GENERATION_FAILURE=player_spawn_outside_arena npm run dev:local
```

For a longer QA pass, you can also put one mode in `.env.local`:

```bash
AICADE_DEBUG_SPEC_GENERATION_FAILURE=duplicate_primary_objectives
```

Remove that line, or leave the variable unset, to return to the normal OpenAI
provider path.

## Related Files

- `src/service/spec-generation/debug-generation-provider.ts`
- `src/service/spec-generation/spec-generation-route-handler.ts`
- `src/service/spec-generation/debug-generation-provider.test.ts`
- `src/service/spec-generation/spec-generation-route-handler.test.ts`
