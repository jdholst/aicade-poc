import {
  createGenerationRunRepositoryJsonExportText,
  createIndexedDbGenerationRunRepository,
  type GenerationRunJsonExportOptions,
  type GenerationRunRepository,
} from "@/game-spec";

export const GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME =
  "__sparklineGenerationRunExport" as const;

export type GenerationRunDeveloperJsonExport = (
  options?: GenerationRunJsonExportOptions
) => Promise<string>;

export type GenerationRunDeveloperJsonExportTarget = {
  [GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME]?:
    | GenerationRunDeveloperJsonExport
    | undefined;
};

export type GenerationRunDeveloperJsonExportInstallation =
  | {
      status: "disabled";
      globalName: typeof GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME;
      uninstall: () => void;
    }
  | {
      status: "installed";
      globalName: typeof GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME;
      uninstall: () => void;
    };

export type InstallGenerationRunDeveloperJsonExportOptions = {
  defaultOptions?: GenerationRunJsonExportOptions;
  enabled?: boolean;
  repository?: Pick<GenerationRunRepository, "list">;
  target?: GenerationRunDeveloperJsonExportTarget | null;
};

export function installGenerationRunDeveloperJsonExport({
  defaultOptions = {
    maxRuns: 25,
  },
  enabled = process.env.NODE_ENV !== "production",
  repository,
  target = getBrowserGenerationRunExportTarget(),
}: InstallGenerationRunDeveloperJsonExportOptions = {}): GenerationRunDeveloperJsonExportInstallation {
  if (!enabled || !target) {
    return createDisabledInstallation();
  }

  const exportRepository =
    repository ?? createIndexedDbGenerationRunRepository();
  const previousExport =
    target[GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME];

  target[GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME] = (options = {}) =>
    createGenerationRunRepositoryJsonExportText(exportRepository, {
      ...defaultOptions,
      ...options,
    });

  return {
    status: "installed",
    globalName: GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME,
    uninstall() {
      if (previousExport) {
        target[GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME] =
          previousExport;
        return;
      }

      delete target[GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME];
    },
  };
}

function createDisabledInstallation(): GenerationRunDeveloperJsonExportInstallation {
  return {
    status: "disabled",
    globalName: GENERATION_RUN_DEVELOPER_JSON_EXPORT_GLOBAL_NAME,
    uninstall() {},
  };
}

function getBrowserGenerationRunExportTarget():
  | GenerationRunDeveloperJsonExportTarget
  | null {
  if (typeof globalThis.window === "undefined") {
    return null;
  }

  return globalThis.window as GenerationRunDeveloperJsonExportTarget;
}
