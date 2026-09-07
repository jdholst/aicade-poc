import {
  generationRunSchema,
  type GenerationRun,
} from "./generation-run-schema";

const DEFAULT_DATABASE_NAME = "sparkline_generation_runs";
const DATABASE_VERSION = 1;
const GENERATION_RUN_STORE_NAME = "generation_runs";
const GENERATION_RUN_RECORD_VERSION = 1;
const MAX_ATOMIC_UPDATE_ATTEMPTS = 16;
const pendingWritesBySerializationScope = new WeakMap<
  object,
  Map<GenerationRun["id"], Promise<void>>
>();
const indexedDbSerializationScopes = new WeakMap<
  IDBFactory,
  Map<string, object>
>();

export type GenerationRunRepository = {
  create: (generationRun: GenerationRun) => Promise<GenerationRun>;
  fetch: (
    generationRunId: GenerationRun["id"]
  ) => Promise<GenerationRun | null>;
  list: () => Promise<GenerationRun[]>;
  update: (
    generationRunId: GenerationRun["id"],
    updater: (
      generationRun: GenerationRun
    ) => GenerationRun | Promise<GenerationRun>
  ) => Promise<GenerationRun>;
  delete: (generationRunId: GenerationRun["id"]) => Promise<void>;
  clear: () => Promise<void>;
};

export type GenerationRunRepositoryOperation =
  | "open"
  | "create"
  | "fetch"
  | "list"
  | "update"
  | "delete"
  | "clear";

export type GenerationRunRepositoryErrorCode =
  | "indexeddb_unavailable"
  | "open_failed"
  | "create_failed"
  | "fetch_failed"
  | "list_failed"
  | "update_failed"
  | "delete_failed"
  | "clear_failed"
  | "update_id_mismatch"
  | "not_found"
  | "invalid_generation_run";

export class GenerationRunRepositoryError extends Error {
  readonly cause?: unknown;
  readonly code: GenerationRunRepositoryErrorCode;
  readonly generationRunId?: GenerationRun["id"];
  readonly operation: GenerationRunRepositoryOperation;

  constructor({
    cause,
    code,
    generationRunId,
    message,
    operation,
  }: {
    cause?: unknown;
    code: GenerationRunRepositoryErrorCode;
    generationRunId?: GenerationRun["id"];
    message: string;
    operation: GenerationRunRepositoryOperation;
  }) {
    super(message);
    this.name = "GenerationRunRepositoryError";
    this.cause = cause;
    this.code = code;
    this.generationRunId = generationRunId;
    this.operation = operation;
  }
}

export type StoredGenerationRunRecord = {
  generationRun: GenerationRun;
  id: GenerationRun["id"];
  recordVersion: typeof GENERATION_RUN_RECORD_VERSION;
  status: GenerationRun["status"];
  updatedAt: string;
};

export type GenerationRunStorageDriver = {
  put: (record: StoredGenerationRunRecord) => Promise<void>;
  get: (
    generationRunId: GenerationRun["id"]
  ) => Promise<StoredGenerationRunRecord | null>;
  getAll: () => Promise<StoredGenerationRunRecord[]>;
  compareAndSwap?: (
    generationRunId: GenerationRun["id"],
    expected: StoredGenerationRunRecord,
    replacement: StoredGenerationRunRecord
  ) => Promise<boolean>;
  delete: (generationRunId: GenerationRun["id"]) => Promise<void>;
  clear: () => Promise<void>;
};

export type IndexedDbGenerationRunRepositoryOptions = {
  databaseName?: string;
  indexedDB?: IDBFactory | null;
};

export function createGenerationRunRepository(
  storage: GenerationRunStorageDriver
): GenerationRunRepository {
  return createSerializedGenerationRunRepository(storage, storage);
}

function createSerializedGenerationRunRepository(
  storage: GenerationRunStorageDriver,
  serializationScope: object
): GenerationRunRepository {
  const pendingWritesById = getPendingWritesForScope(serializationScope);
  const repository: GenerationRunRepository = {
    async create(generationRun) {
      let record: StoredGenerationRunRecord;

      try {
        record = createStoredGenerationRunRecord(generationRun);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "invalid_generation_run",
          generationRunId: generationRun.id,
          operation: "create",
          message: `Cannot create invalid GenerationRun "${generationRun.id}".`,
        });
      }

      try {
        await storage.put(record);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "create_failed",
          generationRunId: record.id,
          operation: "create",
          message: `Failed to create GenerationRun "${record.id}".`,
        });
      }

      return record.generationRun;
    },

    async fetch(generationRunId) {
      let record: StoredGenerationRunRecord | null;

      try {
        record = await storage.get(generationRunId);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "fetch_failed",
          generationRunId,
          operation: "fetch",
          message: `Failed to fetch GenerationRun "${generationRunId}".`,
        });
      }

      return record
        ? parseStoredGenerationRunRecord(record, "fetch").generationRun
        : null;
    },

    async list() {
      let records: StoredGenerationRunRecord[];

      try {
        records = await storage.getAll();
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "list_failed",
          operation: "list",
          message: "Failed to list GenerationRuns.",
        });
      }

      return records
        .map(
          (record) => parseStoredGenerationRunRecord(record, "list").generationRun
        )
        .sort((left, right) =>
          getGenerationRunUpdatedAt(right).localeCompare(
            getGenerationRunUpdatedAt(left)
          )
        );
    },

    async update(generationRunId, updater) {
      const previousWrite = pendingWritesById.get(generationRunId) ??
        Promise.resolve();
      let releaseWrite!: () => void;
      const currentWrite = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      pendingWritesById.set(generationRunId, currentWrite);
      await previousWrite;

      try {
        if (storage.compareAndSwap) {
          for (
            let attempt = 0;
            attempt < MAX_ATOMIC_UPDATE_ATTEMPTS;
            attempt += 1
          ) {
            let currentRecord: StoredGenerationRunRecord | null;
            try {
              currentRecord = await storage.get(generationRunId);
            } catch (error) {
              throw createRepositoryError({
                cause: error,
                code: "fetch_failed",
                generationRunId,
                operation: "update",
                message: `Failed to fetch GenerationRun "${generationRunId}" for update.`,
              });
            }
            if (!currentRecord) {
              throw createRepositoryError({
                code: "not_found",
                generationRunId,
                operation: "update",
                message: `Cannot update missing GenerationRun "${generationRunId}".`,
              });
            }
            const parsedCurrentRecord = parseStoredGenerationRunRecord(
              currentRecord,
              "update"
            );
            const nextGenerationRun = await applyGenerationRunUpdater({
              currentGenerationRun: parsedCurrentRecord.generationRun,
              generationRunId,
              updater,
            });
            let nextRecord: StoredGenerationRunRecord;
            try {
              nextRecord = createStoredGenerationRunRecord(nextGenerationRun);
            } catch (error) {
              throw createRepositoryError({
                cause: error,
                code: "invalid_generation_run",
                generationRunId,
                operation: "update",
                message: `Cannot update GenerationRun "${generationRunId}" with an invalid receipt.`,
              });
            }
            let swapped: boolean;
            try {
              swapped = await storage.compareAndSwap(
                generationRunId,
                parsedCurrentRecord,
                nextRecord
              );
            } catch (error) {
              throw createRepositoryError({
                cause: error,
                code: "update_failed",
                generationRunId,
                operation: "update",
                message: `Failed to atomically update GenerationRun "${generationRunId}".`,
              });
            }
            if (swapped) {
              return nextRecord.generationRun;
            }
          }

          throw createRepositoryError({
            code: "update_failed",
            generationRunId,
            operation: "update",
            message: `GenerationRun "${generationRunId}" changed too many times to update safely.`,
          });
        }

        const currentGenerationRun = await repository.fetch(generationRunId);

        if (!currentGenerationRun) {
          throw createRepositoryError({
            code: "not_found",
            generationRunId,
            operation: "update",
            message: `Cannot update missing GenerationRun "${generationRunId}".`,
          });
        }

        const nextGenerationRun = await applyGenerationRunUpdater({
          currentGenerationRun,
          generationRunId,
          updater,
        });

        return repository.create(nextGenerationRun);
      } finally {
        releaseWrite();
        if (pendingWritesById.get(generationRunId) === currentWrite) {
          pendingWritesById.delete(generationRunId);
        }
      }
    },

    async delete(generationRunId) {
      try {
        await storage.delete(generationRunId);
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "delete_failed",
          generationRunId,
          operation: "delete",
          message: `Failed to delete GenerationRun "${generationRunId}".`,
        });
      }
    },

    async clear() {
      try {
        await storage.clear();
      } catch (error) {
        throw createRepositoryError({
          cause: error,
          code: "clear_failed",
          operation: "clear",
          message: "Failed to clear GenerationRuns.",
        });
      }
    },
  };
  return repository;
}

export function createIndexedDbGenerationRunRepository(
  options: IndexedDbGenerationRunRepositoryOptions = {}
): GenerationRunRepository {
  const normalizedOptions = {
    databaseName: options.databaseName ?? DEFAULT_DATABASE_NAME,
    indexedDB:
      options.indexedDB === undefined
        ? getBrowserIndexedDbFactory()
        : options.indexedDB,
  } satisfies Required<IndexedDbGenerationRunRepositoryOptions>;
  const storage = createIndexedDbGenerationRunStorage(normalizedOptions);

  return createSerializedGenerationRunRepository(
    storage,
    normalizedOptions.indexedDB
      ? getIndexedDbSerializationScope(
          normalizedOptions.indexedDB,
          normalizedOptions.databaseName
        )
      : storage
  );
}

function getPendingWritesForScope(
  serializationScope: object
): Map<GenerationRun["id"], Promise<void>> {
  const existing = pendingWritesBySerializationScope.get(serializationScope);
  if (existing) {
    return existing;
  }

  const created = new Map<GenerationRun["id"], Promise<void>>();
  pendingWritesBySerializationScope.set(serializationScope, created);
  return created;
}

function getIndexedDbSerializationScope(
  indexedDB: IDBFactory,
  databaseName: string
): object {
  const scopesByDatabase = indexedDbSerializationScopes.get(indexedDB) ??
    new Map<string, object>();
  indexedDbSerializationScopes.set(indexedDB, scopesByDatabase);

  const existing = scopesByDatabase.get(databaseName);
  if (existing) {
    return existing;
  }

  const created = Object.freeze({});
  scopesByDatabase.set(databaseName, created);
  return created;
}

function createStoredGenerationRunRecord(
  generationRun: GenerationRun
): StoredGenerationRunRecord {
  const parsedGenerationRun = generationRunSchema.parse(generationRun);

  return {
    id: parsedGenerationRun.id,
    recordVersion: GENERATION_RUN_RECORD_VERSION,
    status: parsedGenerationRun.status,
    updatedAt: getGenerationRunUpdatedAt(parsedGenerationRun),
    generationRun: parsedGenerationRun,
  };
}

function parseStoredGenerationRunRecord(
  record: StoredGenerationRunRecord,
  operation: GenerationRunRepositoryOperation
): StoredGenerationRunRecord {
  if (record.recordVersion !== GENERATION_RUN_RECORD_VERSION) {
    throw createRepositoryError({
      code: "invalid_generation_run",
      generationRunId: record.id,
      operation,
      message: `Stored GenerationRun "${record.id}" uses unsupported record version "${record.recordVersion}".`,
    });
  }

  let generationRun: GenerationRun;

  try {
    generationRun = generationRunSchema.parse(record.generationRun);
  } catch (error) {
    throw createRepositoryError({
      cause: error,
      code: "invalid_generation_run",
      generationRunId: record.id,
      operation,
      message: `Stored GenerationRun "${record.id}" does not match the current GenerationRun schema.`,
    });
  }

  if (
    record.id !== generationRun.id ||
    record.status !== generationRun.status ||
    record.updatedAt !== getGenerationRunUpdatedAt(generationRun)
  ) {
    throw createRepositoryError({
      code: "invalid_generation_run",
      generationRunId: record.id,
      operation,
      message: `Stored GenerationRun "${record.id}" metadata does not match its GenerationRun payload.`,
    });
  }

  return {
    ...record,
    generationRun,
  };
}

function getGenerationRunUpdatedAt(generationRun: GenerationRun): string {
  return generationRun.completedAt ?? generationRun.startedAt;
}

async function applyGenerationRunUpdater({
  currentGenerationRun,
  generationRunId,
  updater,
}: Readonly<{
  currentGenerationRun: GenerationRun;
  generationRunId: GenerationRun["id"];
  updater: (
    generationRun: GenerationRun
  ) => GenerationRun | Promise<GenerationRun>;
}>): Promise<GenerationRun> {
  let nextGenerationRun: GenerationRun;
  try {
    nextGenerationRun = await updater(currentGenerationRun);
  } catch (error) {
    throw createRepositoryError({
      cause: error,
      code: "update_failed",
      generationRunId,
      operation: "update",
      message: `Failed to update GenerationRun "${generationRunId}".`,
    });
  }
  if (nextGenerationRun.id !== generationRunId) {
    throw createRepositoryError({
      code: "update_id_mismatch",
      generationRunId,
      operation: "update",
      message: `Cannot update GenerationRun "${generationRunId}" with payload for "${nextGenerationRun.id}".`,
    });
  }
  return nextGenerationRun;
}

function createIndexedDbGenerationRunStorage({
  databaseName = DEFAULT_DATABASE_NAME,
  indexedDB = getBrowserIndexedDbFactory(),
}: IndexedDbGenerationRunRepositoryOptions): GenerationRunStorageDriver {
  return {
    async put(record) {
      const db = await openGenerationRunDatabase({
        databaseName,
        indexedDB,
        operation: "create",
      });

      try {
        const transaction = db.transaction(
          GENERATION_RUN_STORE_NAME,
          "readwrite"
        );
        transaction.objectStore(GENERATION_RUN_STORE_NAME).put(record);
        await waitForTransaction(transaction);
      } finally {
        db.close();
      }
    },

    async get(generationRunId) {
      const db = await openGenerationRunDatabase({
        databaseName,
        indexedDB,
        operation: "fetch",
      });

      try {
        const transaction = db.transaction(
          GENERATION_RUN_STORE_NAME,
          "readonly"
        );
        const request = transaction
          .objectStore(GENERATION_RUN_STORE_NAME)
          .get(generationRunId);
        const record = await requestToPromise<
          StoredGenerationRunRecord | undefined
        >(request);

        await waitForTransaction(transaction);

        return record ?? null;
      } finally {
        db.close();
      }
    },

    async getAll() {
      const db = await openGenerationRunDatabase({
        databaseName,
        indexedDB,
        operation: "list",
      });

      try {
        const transaction = db.transaction(
          GENERATION_RUN_STORE_NAME,
          "readonly"
        );
        const request = transaction
          .objectStore(GENERATION_RUN_STORE_NAME)
          .getAll();
        const records =
          await requestToPromise<StoredGenerationRunRecord[]>(request);

        await waitForTransaction(transaction);

        return records;
      } finally {
        db.close();
      }
    },

    async compareAndSwap(generationRunId, expected, replacement) {
      const db = await openGenerationRunDatabase({
        databaseName,
        indexedDB,
        operation: "update",
      });

      try {
        const transaction = db.transaction(
          GENERATION_RUN_STORE_NAME,
          "readwrite"
        );
        const store = transaction.objectStore(GENERATION_RUN_STORE_NAME);
        const current =
          (await requestToPromise<StoredGenerationRunRecord | undefined>(
            store.get(generationRunId)
          )) ?? null;
        const matches = storedGenerationRunRecordsEqual(current, expected);
        if (matches) {
          store.put(replacement);
        }
        await waitForTransaction(transaction);
        return matches;
      } finally {
        db.close();
      }
    },

    async delete(generationRunId) {
      const db = await openGenerationRunDatabase({
        databaseName,
        indexedDB,
        operation: "delete",
      });

      try {
        const transaction = db.transaction(
          GENERATION_RUN_STORE_NAME,
          "readwrite"
        );
        transaction.objectStore(GENERATION_RUN_STORE_NAME).delete(generationRunId);
        await waitForTransaction(transaction);
      } finally {
        db.close();
      }
    },

    async clear() {
      const db = await openGenerationRunDatabase({
        databaseName,
        indexedDB,
        operation: "clear",
      });

      try {
        const transaction = db.transaction(
          GENERATION_RUN_STORE_NAME,
          "readwrite"
        );
        transaction.objectStore(GENERATION_RUN_STORE_NAME).clear();
        await waitForTransaction(transaction);
      } finally {
        db.close();
      }
    },
  };
}

function storedGenerationRunRecordsEqual(
  left: StoredGenerationRunRecord | null,
  right: StoredGenerationRunRecord
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getBrowserIndexedDbFactory(): IDBFactory | null {
  return typeof globalThis.indexedDB === "undefined"
    ? null
    : globalThis.indexedDB;
}

async function openGenerationRunDatabase({
  databaseName,
  indexedDB,
  operation,
}: {
  databaseName: string;
  indexedDB: IDBFactory | null | undefined;
  operation: GenerationRunRepositoryOperation;
}): Promise<IDBDatabase> {
  if (!indexedDB) {
    throw createRepositoryError({
      code: "indexeddb_unavailable",
      operation: "open",
      message:
        "IndexedDB is not available. GenerationRuns can only be persisted in a browser context.",
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

    if (db.objectStoreNames.contains(GENERATION_RUN_STORE_NAME)) {
      return;
    }

    const store = db.createObjectStore(GENERATION_RUN_STORE_NAME, {
      keyPath: "id",
    });

    store.createIndex("status", "status");
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
  generationRunId,
  message,
  operation,
}: {
  cause?: unknown;
  code: GenerationRunRepositoryErrorCode;
  generationRunId?: GenerationRun["id"];
  message: string;
  operation: GenerationRunRepositoryOperation;
}) {
  if (cause instanceof GenerationRunRepositoryError) {
    return cause;
  }

  return new GenerationRunRepositoryError({
    cause,
    code,
    generationRunId,
    message,
    operation,
  });
}
