"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createIndexedDbGamePackRepository,
  type GamePack,
  type GamePackRepository,
} from "@/game-spec";

export type EditorGamePackPersistenceStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "saving"
  | "error";

export type UseEditorGamePackPersistenceInput = {
  repository?: GamePackRepository;
};

export type EditorGamePackPersistence = {
  loadStatus: EditorGamePackPersistenceStatus;
  persistValidatedGamePack: (gamePack: GamePack) => Promise<GamePack | null>;
  restoredGamePack: GamePack | null;
  storageError: Error | null;
};

export function useEditorGamePackPersistence({
  repository,
}: UseEditorGamePackPersistenceInput = {}): EditorGamePackPersistence {
  const repositoryRef = useRef<GamePackRepository | null>(repository ?? null);
  const [restoredGamePack, setRestoredGamePack] = useState<GamePack | null>(
    null
  );
  const [loadStatus, setLoadStatus] =
    useState<EditorGamePackPersistenceStatus>("loading");
  const [storageError, setStorageError] = useState<Error | null>(null);

  useEffect(() => {
    if (repository) {
      repositoryRef.current = repository;
    }
  }, [repository]);

  const getRepository = useCallback(() => {
    if (repository) {
      return repository;
    }

    repositoryRef.current =
      repositoryRef.current ?? createIndexedDbGamePackRepository();

    return repositoryRef.current;
  }, [repository]);

  useEffect(() => {
    let cancelled = false;

    getRepository()
      .list()
      .then((gamePacks) => {
        if (cancelled) {
          return;
        }

        setRestoredGamePack(
          gamePacks.find(hasCreatorFacingCheckpoint) ?? null
        );
        setLoadStatus("loaded");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setRestoredGamePack(null);
        setStorageError(toError(error));
        setLoadStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [getRepository]);

  const persistValidatedGamePack = useCallback(
    async (gamePack: GamePack) => {
      if (!hasCreatorFacingCheckpoint(gamePack)) {
        return null;
      }

      setLoadStatus("saving");
      setStorageError(null);

      try {
        const savedGamePack = await getRepository().save(gamePack);

        setLoadStatus("loaded");

        return savedGamePack;
      } catch (error) {
        const storageError = toError(error);

        setStorageError(storageError);
        setLoadStatus("error");

        throw storageError;
      }
    },
    [getRepository]
  );

  return {
    loadStatus,
    persistValidatedGamePack,
    restoredGamePack,
    storageError,
  };
}

function hasCreatorFacingCheckpoint(gamePack: GamePack) {
  return gamePack.checkpoints.some((checkpoint) =>
    gamePack.builds.some(
      (build) =>
        build.id === checkpoint.buildId &&
        build.status === "validated" &&
        build.validationEvidenceIds.length > 0
    )
  );
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
