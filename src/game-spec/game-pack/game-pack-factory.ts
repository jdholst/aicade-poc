import type { RuntimeKind } from "@/runtime/runtime-adapter";

import type { GameSpec, JsonValue, StableId } from "../game-spec-schema";
import { parseGamePack, type GamePack } from "./game-pack-schema";

export type CreateInitialGamePackInput = {
  gameSpec: GameSpec;
  runtimeKind: RuntimeKind;
  id?: StableId;
  title?: string;
  templateId?: StableId;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, JsonValue>;
};

export function createInitialGamePack({
  gameSpec,
  runtimeKind,
  id = createDefaultGamePackId(gameSpec.id),
  title = gameSpec.title,
  templateId = gameSpec.template.id,
  createdAt = new Date().toISOString(),
  updatedAt = createdAt,
  metadata,
}: CreateInitialGamePackInput): GamePack {
  return parseGamePack({
    schemaVersion: "game-pack/v1",
    id,
    title,
    createdAt,
    updatedAt,
    runtimeKind,
    templateId,
    gameSpec,
    builds: [],
    checkpoints: [],
    validationEvidence: [],
    failedAttempts: [],
    generationRuns: [],
    metadata,
  });
}

function createDefaultGamePackId(gameSpecId: StableId): StableId {
  return `game_pack_${gameSpecId.replace(/^game_/, "")}`;
}
