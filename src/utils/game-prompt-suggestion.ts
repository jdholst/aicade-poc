const promptSuggestionParts = {
  styles: [
    "arcade-style",
    "retro",
    "neon",
    "minimalist",
    "fast-paced",
    "tactical",
  ],
  genres: [
    "platformer",
    "top-down arena game",
    "survival shooter",
    "puzzle platformer",
    "side-scrolling runner",
    "grid-based puzzle game",
    "breakout-style action game",
    "rhythm runner",
  ],
  players: [
    "a drone",
    "a hover bike",
    "a space pilot",
    "a parkour runner",
    "a shield bot",
    "a salvage rover",
    "a racing ship",
    "a dungeon explorer",
  ],
  objectives: [
    "collects energy cores",
    "survives timed enemy waves",
    "captures control zones",
    "reaches checkpoints before the timer runs out",
    "solves switch puzzles",
    "dodges hazards while building a score multiplier",
    "escorts a payload across the map",
    "clears rooms to unlock the exit",
  ],
  settings: [
    "a compact space station",
    "an industrial city rooftop",
    "a desert race track",
    "an underground lab",
    "a modular dungeon",
    "a flooded factory",
    "a training arena",
    "a shifting asteroid field",
  ],
  mechanics: [
    "dash boosts",
    "moving platforms",
    "destructible barriers",
    "limited ammo pickups",
    "color-coded switches",
    "enemy spawn gates",
    "combo scoring",
    "temporary shields",
  ],
  twists: [
    "the arena layout changes every wave",
    "power-ups have short cooldowns",
    "the exit only opens after a perfect combo",
    "hazards speed up as the score increases",
    "players choose between safe paths and bonus routes",
    "enemies adapt after each checkpoint",
    "the timer extends when objectives are chained",
    "boss attacks create new cover",
  ],
} as const;

function pickRandom<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)] ?? items[0];
}

export function createGamePromptSuggestion() {
  return `A ${pickRandom(promptSuggestionParts.styles)} ${pickRandom(
    promptSuggestionParts.genres
  )} where ${pickRandom(promptSuggestionParts.players)} ${pickRandom(
    promptSuggestionParts.objectives
  )} through ${pickRandom(promptSuggestionParts.settings)}, with ${pickRandom(
    promptSuggestionParts.mechanics
  )} and ${pickRandom(promptSuggestionParts.twists)}.`;
}