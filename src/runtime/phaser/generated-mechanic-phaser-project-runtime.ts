import {
  recordFirstPlayableRuntimeEvidence,
  recordFirstPlayableRuntimeStatus,
  startFirstPlayableValidation,
  type FirstPlayableRuntimeStatus,
  type FirstPlayableValidationAttempt,
  type PreparedGeneratedMechanicRuntimeProject,
} from "@/game-spec";
import { createGeneratedMechanicProjectRuntime } from "@/runtime/mechanics/generated-mechanic-project-runtime";
import type {
  RuntimeHostStatus,
  RuntimeValidationEvidence,
} from "@/runtime/runtime-adapter";

import {
  createGeneratedMechanicPhaserRuntimeController,
  type CreateGeneratedMechanicPhaserRuntimeControllerInput,
  type GeneratedMechanicPhaserFirstPlayableResult,
  type GeneratedMechanicPhaserRuntimeController,
} from "./generated-mechanic-phaser-runtime-controller";
import {
  createTopDownPhaserTemplate,
  type HandAuthoredPhaserTemplate,
} from "./top-down-template";

export type CreateGeneratedMechanicPhaserProjectRuntimeInput = Readonly<{
  ownerDocument?: Document;
  now?: () => string;
  signal?: AbortSignal;
  createController?: (
    input: CreateGeneratedMechanicPhaserRuntimeControllerInput
  ) => GeneratedMechanicPhaserRuntimeController;
}>;

type LoadedBrowserProjectResource = Readonly<{
  project: PreparedGeneratedMechanicRuntimeProject;
}>;

type RuntimeObservation =
  | Readonly<{
      kind: "status";
      observedAt: string;
      status: RuntimeHostStatus;
    }>
  | Readonly<{
      kind: "evidence";
      observedAt: string;
      evidence: RuntimeValidationEvidence;
    }>;

type FirstPlayableObservationState = {
  acceptingEvidence: boolean;
  appliedObservationCount: number;
  attempt?: FirstPlayableValidationAttempt;
  observations: RuntimeObservation[];
  started: boolean;
};

type ActiveBrowserProjectResource = {
  abortListener?: () => void;
  abortSignal?: AbortSignal;
  controller: GeneratedMechanicPhaserRuntimeController;
  disposed: boolean;
  mount: HTMLDivElement;
  observationState: FirstPlayableObservationState;
  project: PreparedGeneratedMechanicRuntimeProject;
  template: HandAuthoredPhaserTemplate;
};

/**
 * Adapts the real authenticated Phaser iframe controller to the opaque project
 * runtime boundary used by generated-mechanic handoff. This layer performs
 * browser validation only; it never accepts or persists an artifact.
 */
export function createGeneratedMechanicPhaserProjectRuntime({
  ownerDocument = requireBrowserDocument(),
  now = () => new Date().toISOString(),
  signal,
  createController = createGeneratedMechanicPhaserRuntimeController,
}: CreateGeneratedMechanicPhaserProjectRuntimeInput = {}) {
  return createGeneratedMechanicProjectRuntime<
    LoadedBrowserProjectResource,
    ActiveBrowserProjectResource
  >({
    async loadProjectDependency(project) {
      return Object.freeze({ project });
    },

    async installTrustedTemplate({
      dependency,
      finalGameSpec,
      loadedResource,
    }) {
      if (signal?.aborted) {
        throw new Error(
          "Generated mechanic browser installation was cancelled."
        );
      }
      if (
        !jsonEqual(loadedResource.project.dependency, dependency) ||
        !jsonEqual(loadedResource.project.dependency.finalGameSpec, finalGameSpec)
      ) {
        throw new Error(
          "Generated mechanic browser installation requires the exact loaded project."
        );
      }
      const template = createTopDownPhaserTemplate(finalGameSpec.gameSpec);
      const mount = createHiddenRuntimeMount(ownerDocument, template);
      const observationState: FirstPlayableObservationState = {
        acceptingEvidence: false,
        appliedObservationCount: 0,
        observations: [],
        started: false,
      };
      let controller: GeneratedMechanicPhaserRuntimeController;
      try {
        controller = createController({
          mount,
          template,
          generatedMechanicProject: loadedResource.project,
          options: {
            isPaused: false,
            focusOnReadyKey: 0,
            runFirstPlayableChecksOnReady: false,
            onStatusChange(status) {
              appendRuntimeObservation(observationState, {
                kind: "status",
                observedAt: now(),
                status,
              });
            },
            onValidationEvidence(evidence) {
              if (!observationState.acceptingEvidence) {
                return;
              }
              appendRuntimeObservation(observationState, {
                kind: "evidence",
                observedAt: now(),
                evidence,
              });
            },
          },
        });
      } catch (error) {
        mount.remove();
        throw error;
      }
      const abortListener = signal
        ? () => controller.dispose()
        : undefined;
      if (signal && abortListener) {
        signal.addEventListener("abort", abortListener, { once: true });
      }
      return {
        ...(abortListener ? { abortListener, abortSignal: signal } : {}),
        controller,
        disposed: false,
        mount,
        observationState,
        project: loadedResource.project,
        template,
      };
    },

    async runFirstPlayableBrowserChecks({ activeResource, gamePack }) {
      const { observationState } = activeResource;
      if (activeResource.disposed) {
        throw new Error(
          "Generated mechanic browser checks require an active runtime controller."
        );
      }
      if (observationState.started) {
        throw new Error(
          "Generated mechanic first-playable browser checks are single-use per activation."
        );
      }
      observationState.started = true;
      observationState.attempt = startFirstPlayableValidation({
        gamePack,
        runtimeCandidate: {
          runtimeDependencyScriptPaths:
            activeResource.template.runtimeDependencyScriptPaths,
          runtimeKind: "phaser",
          runtimeScriptPath: activeResource.template.runtimeScriptPath,
          templateId: activeResource.template.gameSpec.template.id,
        },
        startedAt: now(),
      });
      applyPendingRuntimeObservations(observationState);
      if (observationState.attempt.status !== "running") {
        return observationState.attempt;
      }

      observationState.acceptingEvidence = true;
      let controllerResult: GeneratedMechanicPhaserFirstPlayableResult;
      try {
        controllerResult = await activeResource.controller.runFirstPlayableChecks();
      } catch (error) {
        applyPendingRuntimeObservations(observationState);
        if (observationState.attempt.status !== "running") {
          return observationState.attempt;
        }
        throw error;
      } finally {
        observationState.acceptingEvidence = false;
      }
      applyPendingRuntimeObservations(observationState);
      requireExactControllerEvidence(controllerResult, observationState);
      if (
        observationState.attempt.status === "running" ||
        observationState.attempt.status !== controllerResult.status
      ) {
        throw new Error(
          "Generated mechanic browser checks did not produce one correlated terminal first-playable attempt."
        );
      }
      return observationState.attempt;
    },

    async disposeProjectDependency({ activeResource }) {
      if (!activeResource || activeResource.disposed) {
        return;
      }
      activeResource.disposed = true;
      if (activeResource.abortListener && activeResource.abortSignal) {
        activeResource.abortSignal.removeEventListener(
          "abort",
          activeResource.abortListener
        );
      }
      try {
        activeResource.controller.dispose();
      } finally {
        activeResource.mount.remove();
      }
    },
  });
}

function appendRuntimeObservation(
  state: FirstPlayableObservationState,
  observation: RuntimeObservation
): void {
  state.observations.push(observation);
  applyPendingRuntimeObservations(state);
}

function applyPendingRuntimeObservations(
  state: FirstPlayableObservationState
): void {
  if (!state.attempt) {
    return;
  }
  while (state.appliedObservationCount < state.observations.length) {
    const observation = state.observations[state.appliedObservationCount];
    state.appliedObservationCount += 1;
    if (!observation) {
      continue;
    }
    state.attempt =
      observation.kind === "status"
        ? recordFirstPlayableRuntimeStatus({
            attempt: state.attempt,
            observedAt: observation.observedAt,
            status: observation.status satisfies FirstPlayableRuntimeStatus,
          })
        : recordFirstPlayableRuntimeEvidence({
            attempt: state.attempt,
            evidence: observation.evidence,
            observedAt: observation.observedAt,
          });
  }
}

function requireExactControllerEvidence(
  result: GeneratedMechanicPhaserFirstPlayableResult,
  state: FirstPlayableObservationState
): void {
  const authenticatedEvidence = new Map(
    state.observations.flatMap((observation) =>
      observation.kind === "evidence"
        ? [[observation.evidence.checkId, observation.evidence] as const]
        : []
    )
  );
  if (
    authenticatedEvidence.size !== result.evidence.length ||
    result.evidence.some(
      (evidence) =>
        !jsonEqual(authenticatedEvidence.get(evidence.checkId), evidence)
    )
  ) {
    throw new Error(
      "Generated mechanic first-playable evidence must arrive through the authenticated runtime callback."
    );
  }
}

function createHiddenRuntimeMount(
  ownerDocument: Document,
  template: HandAuthoredPhaserTemplate
): HTMLDivElement {
  const mount = ownerDocument.createElement("div");
  mount.dataset.aicadeGeneratedMechanicRuntime = "true";
  mount.setAttribute("aria-hidden", "true");
  mount.tabIndex = -1;
  Object.assign(mount.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${template.viewport.width}px`,
    height: `${template.viewport.height}px`,
    overflow: "hidden",
    opacity: "0",
    pointerEvents: "none",
  });
  ownerDocument.body.append(mount);
  return mount;
}

function requireBrowserDocument(): Document {
  if (typeof document === "undefined") {
    throw new Error(
      "Generated mechanic Phaser project runtime requires a browser document."
    );
  }
  return document;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJsonStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, child]) =>
          `${JSON.stringify(key)}:${stableJsonStringify(child)}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
