import { parseGamePack, type GamePack } from "./game-pack-schema";

const DEFAULT_DATABASE_NAME = "sparkline_game_packs";
const DATABASE_VERSION = 1;
const GAME_PACK_STORE_NAME = "game_packs";
const GAME_PACK_RECORD_VERSION = 1;

export type GamePackRepository = {
  save: (gamePack: GamePack) => Promise<GamePack>;
  load: (gamePackId: GamePack["id"]) => Promise<GamePack | null>;
  list: () => Promise<GamePack[]>;
  update: (
    gamePackId: GamePack["id"],
    updater: (gamePack: GamePack) => GamePack | Promise<GamePack>
  ) => Promise<GamePack>;
  compareAndSwap: (
    gamePackId: GamePack["id"],
    expected: GamePack | null,
    replacement: GamePack | null
  ) => Promise<boolean>;
  delete: (gamePackId: GamePack["id"]) => Promise<void>;
};

export type GamePackRepositoryOperation =
  | "open"
  | "save"
  | "load"
  | "list"
  | "update"
  | "compare_and_swap"
  | "delete";

export type GamePackRepositoryErrorCode =
  | "indexeddb_unavailable"
  | "open_failed"
  | "save_failed"
  | "load_failed"
  | "list_failed"
  | "update_failed"
  | "compare_and_swap_failed"
  | "compare_and_swap_unavailable"
  | "delete_failed"
  | "update_id_mismatch"
  | "not_found"
  | "invalid_game_pack";

export class GamePackRepositoryError extends Error {
  readonly cause?: unknown;
  readonly code: GamePackRepositoryErrorCode;
  readonly gamePackId?: GamePack["id"];
  readonly operation: GamePackRepositoryOperation;

  constructor({
    cause,
    code,
    gamePackId,
    message,
    operation,
  }: {
    cause?: unknown;
    code: GamePackRepositoryErrorCode;
    gamePackId?: GamePack["id"];
    message: string;
    operation: GamePackRepositoryOperation;
  }) {
    super(message);
    this.name = "GamePackRepositoryError";
    this.cause = cause;
    this.code = code;
    this.gamePackId = gamePackId;
    this.operation = operation;
  }
}

export type StoredGamePackRecord = {
  gamePack: GamePack;
  gamePackSchemaVersion: GamePack["schemaVersion"];
  id: GamePack["id"];
  recordVersion: typeof GAME_PACK_RECORD_VERSION;
  updatedAt: GamePack["updatedAt"];
};

export type GamePackStorageDriver = {
  put: (record: StoredGamePackRecord) => Promise<void>;
  get: (gamePackId: GamePack["id"]) => Promise<StoredGamePackRecord | null>;
  getAll: () => Promise<StoredGamePackRecord[]>;
  compareAndSwap: (
    gamePackId: GamePack["id"],
    expected: StoredGamePackRecord | null,
    replacement: StoredGamePackRecord | null
  ) => Promise<boolean>;
  delete: (gamePackId: GamePack["id"]) => Promise<void>;
};

export type IndexedDbGamePackRepositoryOptions = {
  databaseName?: string;
  indexedDB?: IDBFactory | null;
};

export function createGamePackRepository(
  storage: GamePackStorageDriver
): GamePackRepository {
  return {
    async save(gamePack) {
      let record: StoredGamePackRecord;

      try {
        record = createStoredGamePackRecord(gamePack);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "invalid_game_pack",
          gamePackId: gamePack.id,
          operation: "save",
          message: `Cannot save invalid Game Pack "${gamePack.id}".`,
        });
      }

      try {
        await storage.put(record);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "save_failed",
          gamePackId: record.id,
          operation: "save",
          message: `Failed to save Game Pack "${record.id}".`,
        });
      }

      return record.gamePack;
    },

    async load(gamePackId) {
      let record: StoredGamePackRecord | null;

      try {
        record = await storage.get(gamePackId);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "load_failed",
          gamePackId,
          operation: "load",
          message: `Failed to load Game Pack "${gamePackId}".`,
        });
      }

      return record ? parseStoredGamePackRecord(record, "load").gamePack : null;
    },

    async list() {
      let records: StoredGamePackRecord[];

      try {
        records = await storage.getAll();
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "list_failed",
          operation: "list",
          message: "Failed to list Game Packs.",
        });
      }

      return records
        .map((record) => parseStoredGamePackRecord(record, "list").gamePack)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },

    async update(gamePackId, updater) {
      const currentGamePack = await this.load(gamePackId);

      if (!currentGamePack) {
        throw createRepositoryError({
          code: "not_found",
          gamePackId,
          operation: "update",
          message: `Cannot update missing Game Pack "${gamePackId}".`,
        });
      }

      let nextGamePack: GamePack;

      try {
        nextGamePack = await updater(currentGamePack);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "update_failed",
          gamePackId,
          operation: "update",
          message: `Failed to update Game Pack "${gamePackId}".`,
        });
      }

      if (nextGamePack.id !== gamePackId) {
        throw createRepositoryError({
          code: "update_id_mismatch",
          gamePackId,
          operation: "update",
          message: `Cannot update Game Pack "${gamePackId}" with payload for "${nextGamePack.id}".`,
        });
      }

      return this.save(nextGamePack);
    },

    async compareAndSwap(gamePackId, expected, replacement) {
      if (!storage.compareAndSwap) {
        throw createRepositoryError({
          code: "compare_and_swap_unavailable",
          gamePackId,
          operation: "compare_and_swap",
          message: `Game Pack storage cannot atomically compare and swap "${gamePackId}".`,
        });
      }
      let expectedRecord: StoredGamePackRecord | null;
      let replacementRecord: StoredGamePackRecord | null;
      try {
        expectedRecord = expected ? createStoredGamePackRecord(expected) : null;
        replacementRecord = replacement
          ? createStoredGamePackRecord(replacement)
          : null;
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "invalid_game_pack",
          gamePackId,
          operation: "compare_and_swap",
          message: `Cannot compare and swap invalid Game Pack "${gamePackId}".`,
        });
      }
      if (
        (expectedRecord?.id !== undefined &&
          expectedRecord.id !== gamePackId) ||
        (replacementRecord?.id !== undefined &&
          replacementRecord.id !== gamePackId)
      ) {
        throw createRepositoryError({
          code: "update_id_mismatch",
          gamePackId,
          operation: "compare_and_swap",
          message: `Cannot compare and swap Game Pack "${gamePackId}" with a different ID.`,
        });
      }
      try {
        return await storage.compareAndSwap(
          gamePackId,
          expectedRecord,
          replacementRecord
        );
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "compare_and_swap_failed",
          gamePackId,
          operation: "compare_and_swap",
          message: `Failed to compare and swap Game Pack "${gamePackId}".`,
        });
      }
    },

    async delete(gamePackId) {
      try {
        await storage.delete(gamePackId);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "delete_failed",
          gamePackId,
          operation: "delete",
          message: `Failed to delete Game Pack "${gamePackId}".`,
        });
      }
    },
  };
}

export function createIndexedDbGamePackRepository(
  options: IndexedDbGamePackRepositoryOptions = {}
): GamePackRepository {
  return createGamePackRepository(createIndexedDbGamePackStorage(options));
}

function createStoredGamePackRecord(gamePack: GamePack): StoredGamePackRecord {
  const parsedGamePack = parseGamePack(gamePack);

  return {
    id: parsedGamePack.id,
    recordVersion: GAME_PACK_RECORD_VERSION,
    gamePackSchemaVersion: parsedGamePack.schemaVersion,
    updatedAt: parsedGamePack.updatedAt,
    gamePack: parsedGamePack,
  };
}

function parseStoredGamePackRecord(
  record: StoredGamePackRecord,
  operation: GamePackRepositoryOperation
): StoredGamePackRecord {
  if (record.recordVersion !== GAME_PACK_RECORD_VERSION) {
    throw createRepositoryError({
      code: "invalid_game_pack",
      gamePackId: record.id,
      operation,
      message: `Stored Game Pack "${record.id}" uses unsupported record version "${record.recordVersion}".`,
    });
  }

  let gamePack: GamePack;

  try {
    gamePack = parseGamePack(record.gamePack);
  } catch (error) {
    throw createRepositoryError({
      cause: error,
      code: "invalid_game_pack",
      gamePackId: record.id,
      operation,
      message: `Stored Game Pack "${record.id}" does not match the current Game Pack schema.`,
    });
  }

  if (
    record.id !== gamePack.id ||
    record.gamePackSchemaVersion !== gamePack.schemaVersion ||
    record.updatedAt !== gamePack.updatedAt
  ) {
    throw createRepositoryError({
      code: "invalid_game_pack",
      gamePackId: record.id,
      operation,
      message: `Stored Game Pack "${record.id}" metadata does not match its Game Pack payload.`,
    });
  }

  return {
    ...record,
    gamePack,
  };
}

function createIndexedDbGamePackStorage({
  databaseName = DEFAULT_DATABASE_NAME,
  indexedDB = getBrowserIndexedDbFactory(),
}: IndexedDbGamePackRepositoryOptions): GamePackStorageDriver {
  return {
    async put(record) {
      const db = await openGamePackDatabase({
        databaseName,
        indexedDB,
        operation: "save",
      });

      try {
        const transaction = db.transaction(GAME_PACK_STORE_NAME, "readwrite");
        transaction.objectStore(GAME_PACK_STORE_NAME).put(record);
        await waitForTransaction(transaction);
      } finally {
        db.close();
      }
    },

    async get(gamePackId) {
      const db = await openGamePackDatabase({
        databaseName,
        indexedDB,
        operation: "load",
      });

      try {
        const transaction = db.transaction(GAME_PACK_STORE_NAME, "readonly");
        const request = transaction
          .objectStore(GAME_PACK_STORE_NAME)
          .get(gamePackId);
        const record = await requestToPromise<StoredGamePackRecord | undefined>(
          request
        );

        await waitForTransaction(transaction);

        return record ?? null;
      } finally {
        db.close();
      }
    },

    async getAll() {
      const db = await openGamePackDatabase({
        databaseName,
        indexedDB,
        operation: "list",
      });

      try {
        const transaction = db.transaction(GAME_PACK_STORE_NAME, "readonly");
        const request = transaction
          .objectStore(GAME_PACK_STORE_NAME)
          .getAll();
        const records = await requestToPromise<StoredGamePackRecord[]>(request);

        await waitForTransaction(transaction);

        return records;
      } finally {
        db.close();
      }
    },

    async compareAndSwap(gamePackId, expected, replacement) {
      const db = await openGamePackDatabase({
        databaseName,
        indexedDB,
        operation: "compare_and_swap",
      });

      try {
        const transaction = db.transaction(GAME_PACK_STORE_NAME, "readwrite");
        const store = transaction.objectStore(GAME_PACK_STORE_NAME);
        const current =
          (await requestToPromise<StoredGamePackRecord | undefined>(
            store.get(gamePackId)
          )) ?? null;
        const matches = storedGamePackRecordsEqual(current, expected);
        if (matches) {
          if (replacement) {
            store.put(replacement);
          } else {
            store.delete(gamePackId);
          }
        }
        await waitForTransaction(transaction);
        return matches;
      } finally {
        db.close();
      }
    },

    async delete(gamePackId) {
      const db = await openGamePackDatabase({
        databaseName,
        indexedDB,
        operation: "delete",
      });

      try {
        const transaction = db.transaction(GAME_PACK_STORE_NAME, "readwrite");
        transaction.objectStore(GAME_PACK_STORE_NAME).delete(gamePackId);
        await waitForTransaction(transaction);
      } finally {
        db.close();
      }
    },
  };
}

function storedGamePackRecordsEqual(
  left: StoredGamePackRecord | null,
  right: StoredGamePackRecord | null
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getBrowserIndexedDbFactory(): IDBFactory | null {
  return typeof globalThis.indexedDB === "undefined"
    ? null
    : globalThis.indexedDB;
}

async function openGamePackDatabase({
  databaseName,
  indexedDB,
  operation,
}: {
  databaseName: string;
  indexedDB: IDBFactory | null | undefined;
  operation: GamePackRepositoryOperation;
}): Promise<IDBDatabase> {
  if (!indexedDB) {
    throw createRepositoryError({
      code: "indexeddb_unavailable",
      operation: "open",
      message:
        "IndexedDB is not available. Game Packs can only be persisted in a browser context.",
    });
  }

  let request: IDBOpenDBRequest;

  try {
    request = indexedDB.open(databaseName, DATABASE_VERSION);
  } catch (error) {
    throw createRepositoryError({
      cause: error,
      code: "open_failed",
      operation,
      message: `Failed to open IndexedDB database "${databaseName}".`,
    });
  }

  request.onupgradeneeded = () => {
    const db = request.result;

    if (db.objectStoreNames.contains(GAME_PACK_STORE_NAME)) {
      return;
    }

    const store = db.createObjectStore(GAME_PACK_STORE_NAME, {
      keyPath: "id",
    });

    store.createIndex("updatedAt", "updatedAt");
  };

  try {
    return await requestToPromise<IDBDatabase>(request);
  } catch (error) {
    throw createRepositoryError({
      cause: error,
      code: "open_failed",
      operation,
      message: `Failed to open IndexedDB database "${databaseName}".`,
    });
  }
}

function requestToPromise<TResult>(
  request: IDBRequest<TResult>
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    };
  });
}

function createRepositoryError({
  cause,
  code,
  gamePackId,
  message,
  operation,
}: {
  cause?: unknown;
  code: GamePackRepositoryErrorCode;
  gamePackId?: GamePack["id"];
  message: string;
  operation: GamePackRepositoryOperation;
}) {
  if (cause instanceof GamePackRepositoryError) {
    return cause;
  }

  return new GamePackRepositoryError({
    cause,
    code,
    gamePackId,
    message,
    operation,
  });
}
