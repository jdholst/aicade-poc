# Campaign prompt authoring

Use this policy when creating a new campaign manifest or replacing a manifest's frozen prompt set. The prompts should resemble requests that a game developer would submit while building a game. Campaign metadata and probes carry the technical proof burden.

## Write the baseline prompt

Write a short, natural request in ordinary game-development language. Describe:

- the mechanic the developer wants;
- how the player or game activates it when activation matters;
- the player-visible result and important gameplay interactions;
- existing gameplay that should remain intact only when a developer would reasonably mention it.

Prefer one short paragraph of one to four sentences. Include concrete controls, timing, distances, or limits only when they are part of the intended player experience. Leave implementation choices to the generator.

Keep internal campaign and pipeline vocabulary in the manifest rather than the prompt. Capability IDs, schemas, contracts, bindings, provider stages, fixture modes, artifact lineage, deterministic replay, and validator terminology belong in requirement IDs, external probes, provider configuration, and thresholds.

Example:

> Add a simple projectile attack to the arena. Pressing Space should fire from the player toward the enemy, and the shot should disappear after it hits something or leaves the arena. Keep the existing movement and objective working.

## Write the variation set

Create five frozen prompts with the same mechanic requirements and requirement IDs:

1. `baseline`: the clearest natural request.
2. `plain_paraphrase`: an independently worded request a different developer might write.
3. `constraints_first`: a natural request that mentions the important gameplay constraints before the desired result.
4. `outcomes_first`: a natural request that leads with what should happen during play.
5. `compact`: the shortest version that still communicates the complete gameplay intent.

Vary wording and ordering without adding implementation instructions or changing scope. Each prompt must stand alone and should not refer to the campaign, another variant, or a requirement checklist.

## Review before freezing

Confirm all five prompts satisfy these checks:

- A game developer could paste the prompt directly into the editor.
- Every sentence describes the desired game or preserves relevant existing gameplay.
- The prompt describes observable behavior rather than pipeline implementation.
- Technical acceptance details live in the manifest and external probe.
- The variants remain semantically equivalent while sounding independently natural.

If a gameplay requirement cannot be expressed naturally in the prompt, keep the user-facing intent in the prompt and encode the exact test condition in its requirement ID and external probe.
