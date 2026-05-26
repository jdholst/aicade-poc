import type { SpecGenerationProvider } from "./spec-generation-service";

export const requestTopDownGameSpecFromProvider: SpecGenerationProvider =
  async () => {
    throw new Error("Spec Generation provider request is not implemented yet.");
  };
