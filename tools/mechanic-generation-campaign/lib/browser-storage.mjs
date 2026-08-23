export async function readCampaignBrowserStorage(page) {
  return page.evaluate(async () => {
    async function readStore(databaseName, storeName) {
      const databases = await indexedDB.databases();
      if (!databases.some(({ name }) => name === databaseName)) {
        return [];
      }
      return new Promise((resolve, reject) => {
        const openRequest = indexedDB.open(databaseName);
        openRequest.onerror = () => reject(openRequest.error);
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          if (!database.objectStoreNames.contains(storeName)) {
            database.close();
            reject(
              new Error(
                `IndexedDB database ${databaseName} does not contain ${storeName}.`
              )
            );
            return;
          }
          const transaction = database.transaction(storeName, "readonly");
          const request = transaction.objectStore(storeName).getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            database.close();
            resolve(request.result);
          };
        };
      });
    }

    const [generationRuns, gamePacks] = await Promise.all([
      readStore("sparkline_generation_runs", "generation_runs"),
      readStore("sparkline_game_packs", "game_packs"),
    ]);
    return { generationRuns, gamePacks };
  });
}

export function latestGenerationRun(storage) {
  return storage.generationRuns
    .map((record) => record.generationRun ?? record)
    .sort((left, right) =>
      String(right.completedAt ?? right.startedAt ?? "").localeCompare(
        String(left.completedAt ?? left.startedAt ?? "")
      )
    )[0] ?? null;
}

export function latestGamePack(storage) {
  return storage.gamePacks
    .map((record) => record.gamePack ?? record)
    .sort((left, right) =>
      String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
    )[0] ?? null;
}

