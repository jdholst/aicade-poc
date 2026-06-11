import {
  createGenerationRunRepository,
  type GenerationRunStorageDriver,
  type StoredGenerationRunRecord,
} from "@/game-spec";

export function createGenerationRunTestRepository() {
  const storage = new MemoryGenerationRunStorage();

  return {
    repository: createGenerationRunRepository(storage),
    storage,
  };
}

export function createDeterministicClock(timestamps: string[]) {
  let index = 0;

  return () => timestamps[Math.min(index++, timestamps.length - 1)];
}

export class MemoryGenerationRunStorage implements GenerationRunStorageDriver {
  readonly records = new Map<string, StoredGenerationRunRecord>();

  async put(record: StoredGenerationRunRecord) {
    this.records.set(record.id, cloneRecord(record));
  }

  async get(generationRunId: string) {
    return this.records.get(generationRunId) ?? null;
  }

  async getAll() {
    return Array.from(this.records.values()).map(cloneRecord);
  }

  async delete(generationRunId: string) {
    this.records.delete(generationRunId);
  }

  async clear() {
    this.records.clear();
  }
}

function cloneRecord(record: StoredGenerationRunRecord): StoredGenerationRunRecord {
  return JSON.parse(JSON.stringify(record)) as StoredGenerationRunRecord;
}
