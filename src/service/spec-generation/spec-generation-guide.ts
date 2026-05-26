export const DEFAULT_SPEC_GENERATION_PROMPT =
  "Make a tiny top-down collection game where a courier gathers lost stars in a small arena while avoiding one slow shadow.";

export const TOP_DOWN_SPEC_GENERATION_GUIDE = [
  "Return only a complete TopDownGameSpec for the Phaser top-down runtime.",
  "Use template_top_down with exactly one scene and exactly one primary objective.",
  "Use player_movement and pickup_collection, with at most one early variation mechanic such as enemy_chase or hazard_contact.",
  "Use stable IDs for every entity, asset, objective, validation goal, scene, zone, and mechanic.",
  "Use template placeholder assets only; do not generate asset packs, tilemaps, Phaser source, or GDD prose.",
  "Do not include unsupported fields, unsupported mechanics, unresolved references, or behavior outside the current mechanic registry.",
].join("\n");
