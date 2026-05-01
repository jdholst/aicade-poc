import {
  GENERATED_GAME_FACTORY_ASSIGNMENT,
  GENERATED_GAME_REQUIRED_METHODS,
} from "@/service/starter-project/generated-game-contract";

export function createGeneratedGameSystemPrompt(userPrompt: string) {
  const requiredMethodSignatures = GENERATED_GAME_REQUIRED_METHODS.map(
    (method) => {
      if (method === "update") {
        return "update(dt, input)";
      }

      if (method === "render") {
        return "render(ctx)";
      }

      if (method === "resize") {
        return "resize(width, height, dpr)";
      }

      if (method === "applyPatch") {
        return "applyPatch(patch)";
      }

      return `${method}()`;
    }
  ).join(", ");

  return `
You are creating the first magic moment for an AI game creation product.

Return a generated game pack for this user prompt:
"${userPrompt}".

You must generate TypeScript source for a self-contained Canvas 2D game runtime.

Hard module contract:
- Do not use imports, exports, React, JSX, DOM queries, network calls, storage APIs, eval, Function, timers, parent/top/opener access, or external assets.
- The source must assign:
  ${GENERATED_GAME_FACTORY_ASSIGNMENT} = function createGameModule(host) { ... }
- The factory receives host = { canvas, ctx, spec, viewport }.
- It must return an object with these functions:
  ${requiredMethodSignatures}.
- The game must use host.spec as its editable game spec and source of truth.
- The generated code and editableSpecJson must agree exactly. Every spec path read by the module must exist in editableSpecJson.
- Before reading nested data such as position.x, ball.x, paddle.y, or entity.size, initialize that object from a complete default object merged with host.spec.
- Do not read .x, .y, .width, .height, .radius, .speed, or similar properties from possibly undefined objects.
- Prefer a small local state object created in start() from validated spec values, then update/render from that local state.
- The game must treat host.viewport.width and host.viewport.height as the full logical playable viewport.
- resize(width, height, dpr) receives the same logical viewport size; the host scales that viewport to fill the iframe.
- The game must read controls from input.actions[actionName].down and input.actions[actionName].pressed.
- The game may also inspect input.rawKeys[keyCode] when useful.
- The game must render visible primitive Canvas 2D shapes without external assets.
- The game must be immediately playable and match the user's requested genre and fantasy.
- Do not force the design into a platformer unless the user asks for a platformer.
- The render output must fill the entire logical viewport from x=0..width and y=0..height.
- Gameplay boundaries must match visible drawn boundaries. Do not create invisible walls, invisible floors, hidden collision barriers, or unreachable dead zones.
- If the game uses an arena, room, court, maze, or track, draw its edges clearly and keep the playable area inside those visible edges.
- Avoid large purely decorative areas that the player cannot interact with unless they are clearly background and do not block movement.
- Keep the initial player, avatar, paddle, cursor, or primary controlled object visible and usable in the first frame.
- Do not rely on requestAnimationFrame; the iframe host owns the animation loop.
- Do not call postMessage; the iframe host owns the handshake.

Pack requirements:
- The first chat message must be a user message whose text is exactly the user prompt above.
- Include assistant messages explaining that code, spec, controls, and editor metadata were generated.
- The manifest must list canvas2d runtime, genre, viewport, controls, and capabilities.
- The manifest viewport should usually be 960x540 for wide games, 800x600 for classic arcade games, or 720x720 for square arenas.
- The manifest viewport scaling must be "stretch_to_fill" so the host can fill the iframe without letterboxing.
- Manifest controls must include action names, labels, key codes, and kinds.
- Use browser KeyboardEvent.code values for keys, such as ArrowLeft, ArrowRight, ArrowUp, ArrowDown, KeyW, KeyA, KeyS, KeyD, Space, Enter, Escape, ShiftLeft, and ShiftRight.
- editableSpecJson must be a JSON string representing one object that fully describes the generated game state/config.
- editableSpecJson must contain only JSON values, stay compact, and be enough for the generated module to run.
- The editor metadata panels should summarize the generated runtime, controls, and editable spec.
`.trim();
}
