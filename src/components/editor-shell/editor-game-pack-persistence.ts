"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  createIndexedDbGamePackRepository,
  hasCreatorFacingCheckpoint,
  isGamePackAcceptanceRestorable,
  reconcileGeneratedMechanicAcceptanceTransactions,
  withGeneratedMechanicAcceptanceLock,
  type GamePack,
  type GamePackRepository,
  type GenerationRunRepository,
} from "@/game-spec";

export type EditorGamePackPersistenceStatus =
  | "idle"
  | "loading"
  | "loaded"
  | "saving"
  | "error";

export type UseEditorGamePackPersistenceInput = {
  generationRunRepository?: Pick<
    GenerationRunRepository,
    "fetch" | "list" | "update"
  > | null;
  repository?: GamePackRepository;
};

export type EditorGamePackPersistence = {
  loadStatus: EditorGamePackPersistenceStatus;
  persistValidatedGamePack: (gamePack: GamePack) => Promise<GamePack | null>;
  restoredGamePack: GamePack | null;
  storageError: Error | null;
};

export function useEditorGamePackPersistence({
  generationRunRepository,
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

    const gamePackRepository = getRepository();
    const loadGamePacks = async () => {
      if (generationRunRepository) {
        const reconciliation =
          await reconcileGeneratedMechanicAcceptanceTransactions({
            gamePackRepository,
            generationRunRepository,
          });
        if (reconciliation.issues.length > 0) {
          throw new EditorGamePackAcceptanceRecoveryError(
            reconciliation.issues
          );
        }
        return reconciliation.restorableGamePack
          ? [reconciliation.restorableGamePack]
          : [];
      }
      return gamePackRepository.list();
    };

    loadGamePacks()
      .then((gamePacks) => {
        if (cancelled) {
          return;
        }

        setRestoredGamePack(
          gamePacks.find(
            (gamePack) =>
              isGamePackAcceptanceRestorable(gamePack) &&
              hasCreatorFacingCheckpoint(gamePack)
          ) ?? null
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
  }, [generationRunRepository, getRepository]);

  const persistValidatedGamePack = useCallback(
    async (gamePack: GamePack) => {
      if (!hasCreatorFacingCheckpoint(gamePack)) {
        return null;
      }

      setLoadStatus("saving");
      setStorageError(null);

      try {
        const savedGamePack = await withGeneratedMechanicAcceptanceLock({
          operation: () => getRepository().save(gamePack),
        });

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

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

class EditorGamePackAcceptanceRecoveryError extends Error {
  readonly issues: readonly Readonly<{
    path: string;
    code: string;
    message: string;
  }>[];

  constructor(issues: EditorGamePackAcceptanceRecoveryError["issues"]) {
    super(
      "A finalized generated mechanic Game Pack is waiting for exact cross-store acceptance recovery."
    );
    this.name = "EditorGamePackAcceptanceRecoveryError";
    this.issues = issues;
  }
}
