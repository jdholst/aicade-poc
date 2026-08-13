import type {
  FirstPlayableValidationAttempt,
  GamePack,
  GeneratedMechanicFinalGameSpec,
  GeneratedMechanicProjectActivation,
  GeneratedMechanicProjectBrowserResult,
  GeneratedMechanicProjectDependency,
  GeneratedMechanicProjectRuntime,
  LoadedGeneratedMechanicProjectDependency,
} from "@/game-spec";

export type GeneratedMechanicProjectRuntimeHost<
  LoadedResource = unknown,
  ActiveResource = unknown,
> = Readonly<{
  loadProjectDependency(
    dependency: GeneratedMechanicProjectDependency
  ): Promise<LoadedResource>;
  installTrustedTemplate(input: Readonly<{
    dependency: GeneratedMechanicProjectDependency;
    finalGameSpec: GeneratedMechanicFinalGameSpec;
    loadedResource: LoadedResource;
  }>): Promise<ActiveResource>;
  runFirstPlayableBrowserChecks(input: Readonly<{
    activeResource: ActiveResource;
    dependency: GeneratedMechanicProjectDependency;
    finalGameSpec: GeneratedMechanicFinalGameSpec;
    gamePack: GamePack;
  }>): Promise<FirstPlayableValidationAttempt>;
  disposeProjectDependency(input: Readonly<{
    activeResource?: ActiveResource;
    loadedResource?: LoadedResource;
  }>): Promise<void>;
}>;

const authenticGeneratedMechanicProjectRuntimes =
  new WeakSet<GeneratedMechanicProjectRuntime>();

export function createGeneratedMechanicProjectRuntime<
  LoadedResource,
  ActiveResource,
>(
  host: GeneratedMechanicProjectRuntimeHost<LoadedResource, ActiveResource>
): GeneratedMechanicProjectRuntime {
  const loadedResources = new WeakMap<
    LoadedGeneratedMechanicProjectDependency,
    Readonly<{ value: LoadedResource }>
  >();
  const activeResources = new WeakMap<
    GeneratedMechanicProjectActivation,
    Readonly<{ value: ActiveResource }>
  >();

  const runtime: GeneratedMechanicProjectRuntime = Object.freeze({
    async loadProjectDependency(dependency) {
      const admittedDependency = snapshot(dependency);
      const loadedResource = await host.loadProjectDependency(admittedDependency);
      const loadedDependency = Object.freeze({
        dependency: admittedDependency,
        ...createIdentity(admittedDependency),
      });
      loadedResources.set(loadedDependency, { value: loadedResource });
      return loadedDependency;
    },

    async installTrustedTemplate({ finalGameSpec, loadedDependency }) {
      const loadedResourceBox = loadedResources.get(loadedDependency);
      if (!loadedResourceBox) {
        throw new Error(
          "Trusted template installation requires a loader-issued project dependency receipt."
        );
      }
      if (!jsonEqual(finalGameSpec, loadedDependency.dependency.finalGameSpec)) {
        throw new Error(
          "Trusted template installation requires the exact loaded Final Game Spec."
        );
      }
      const activeResource = await host.installTrustedTemplate({
        dependency: loadedDependency.dependency,
        finalGameSpec: loadedDependency.dependency.finalGameSpec,
        loadedResource: loadedResourceBox.value,
      });
      const activation = Object.freeze({
        dependency: loadedDependency.dependency,
        extensionId: loadedDependency.extensionId,
        extensionVersionId: loadedDependency.extensionVersionId,
        mechanicId: loadedDependency.mechanicId,
        sourceArtifactId: loadedDependency.sourceArtifactId,
        capabilityVersion: loadedDependency.capabilityVersion,
      });
      activeResources.set(activation, { value: activeResource });
      return activation;
    },

    async runFirstPlayableBrowserChecks({
      activation,
      finalGameSpec,
      gamePack,
    }) {
      const activeResourceBox = activeResources.get(activation);
      if (!activeResourceBox) {
        throw new Error(
          "First-playable checks require a trusted-template activation receipt."
        );
      }
      if (!jsonEqual(finalGameSpec, activation.dependency.finalGameSpec)) {
        throw new Error(
          "First-playable checks require the exact activated Final Game Spec."
        );
      }
      const attempt = await host.runFirstPlayableBrowserChecks({
        activeResource: activeResourceBox.value,
        dependency: activation.dependency,
        finalGameSpec: activation.dependency.finalGameSpec,
        gamePack: snapshot(gamePack),
      });
      return Object.freeze({
        activation,
        attempt: snapshot(attempt),
      }) satisfies GeneratedMechanicProjectBrowserResult;
    },

    async disposeProjectDependency({ activation, loadedDependency }) {
      const activeResourceBox = activation
        ? activeResources.get(activation)
        : undefined;
      const loadedResourceBox = loadedDependency
        ? loadedResources.get(loadedDependency)
        : undefined;
      try {
        await host.disposeProjectDependency({
          ...(activeResourceBox
            ? { activeResource: activeResourceBox.value }
            : {}),
          ...(loadedResourceBox
            ? { loadedResource: loadedResourceBox.value }
            : {}),
        });
      } finally {
        if (activation) {
          activeResources.delete(activation);
        }
        if (loadedDependency) {
          loadedResources.delete(loadedDependency);
        }
      }
    },
  });
  authenticGeneratedMechanicProjectRuntimes.add(runtime);
  return runtime;
}

export function isGeneratedMechanicProjectRuntimeAuthentic(
  runtime: GeneratedMechanicProjectRuntime
): boolean {
  return authenticGeneratedMechanicProjectRuntimes.has(runtime);
}

function createIdentity(dependency: GeneratedMechanicProjectDependency) {
  return {
    extensionId: dependency.finalGameSpec.extension.id,
    extensionVersionId: dependency.finalGameSpec.extension.versionId,
    mechanicId: dependency.finalGameSpec.extension.mechanicId,
    sourceArtifactId: dependency.sourceArtifact.id,
    capabilityVersion: dependency.sourceArtifact.capabilityVersion,
  };
}

function snapshot<Value>(value: Value): Value {
  return deepFreeze(JSON.parse(JSON.stringify(value)) as Value);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(child)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
