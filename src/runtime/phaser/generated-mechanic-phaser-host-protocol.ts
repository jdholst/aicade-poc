import type { PreparedGeneratedMechanicRuntimeProject } from "@/game-spec/game-pack/generated-mechanic-project-handoff";
import { stableIdSchema } from "@/game-spec/game-spec-schema";
import {
  acceptedGeneratedMechanicArtifactSchema,
  generatedMechanicRuntimeCandidateSchema,
  type GeneratedMechanicExecutableArtifact,
} from "@/game-spec/mechanics/generated-mechanic-project-artifact";
import type {
  RuntimeCommand,
  RuntimeViewport,
} from "@/runtime/runtime-adapter";

import type { HandAuthoredPhaserTemplate } from "./top-down-template";

export const GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION =
  "generated_mechanic_phaser_host/v1" as const;

const PROJECT_BOOTSTRAP_KIND =
  "sparkline_generated_mechanic_phaser_project_bootstrap" as const;
const BOOTSTRAP_ACKNOWLEDGEMENT_KIND =
  "sparkline_generated_mechanic_phaser_bootstrap_acknowledgement" as const;
const RUNTIME_COMMAND_KIND =
  "sparkline_generated_mechanic_phaser_runtime_command" as const;
const RUNTIME_EVENT_KIND =
  "sparkline_generated_mechanic_phaser_runtime_event" as const;

export type GeneratedMechanicPhaserProjectBootstrap = Readonly<{
  kind: typeof PROJECT_BOOTSTRAP_KIND;
  protocolVersion: typeof GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: 0;
  template: HandAuthoredPhaserTemplate;
  project: PreparedGeneratedMechanicRuntimeProject;
}>;

export type GeneratedMechanicPhaserBootstrapAcknowledgement = Readonly<{
  kind: typeof BOOTSTRAP_ACKNOWLEDGEMENT_KIND;
  protocolVersion: typeof GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: 0;
  projectKind: "accepted" | "candidate";
  runtimeExecutionId: string;
  artifactId: string;
  extensionId: string;
  extensionVersionId: string;
  finalGameSpecArtifactId: string;
  gameSpecId: string;
  mechanicId: string;
  contractId: string;
  sourceArtifactId: string;
  capabilityVersion: string;
}>;

export type GeneratedMechanicPhaserRuntimeCommandEnvelope = Readonly<{
  kind: typeof RUNTIME_COMMAND_KIND;
  protocolVersion: typeof GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: number;
  command: RuntimeCommand;
}>;

export type GeneratedMechanicPhaserRuntimeEventEnvelope = Readonly<{
  kind: typeof RUNTIME_EVENT_KIND;
  protocolVersion: typeof GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: number;
  event: unknown;
}>;

export type GeneratedMechanicPhaserMessageWindow = {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void
  ): void;
  postMessage(
    message: unknown,
    targetOrigin: string,
    transfer?: Transferable[]
  ): void;
};

export type GeneratedMechanicPhaserProtocolTimers = Readonly<{
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(timeoutId: unknown): void;
}>;

export type GeneratedMechanicPhaserChildSession = Readonly<{
  getTemplate(): HandAuthoredPhaserTemplate;
  getProject(): PreparedGeneratedMechanicRuntimeProject;
  postRuntimeEvent(candidate: unknown): void;
  consumeRuntimeCommand(event: MessageEvent<unknown>): RuntimeCommand | null;
  dispose(): void;
}>;

export type GeneratedMechanicPhaserParentSession = Readonly<{
  sendBootstrap(): void;
  postRuntimeCommand(command: RuntimeCommand): void;
  consumeIframeMessage(event: MessageEvent<unknown>): unknown | null;
  isAcknowledged(): boolean;
  dispose(): void;
}>;

export type WaitForGeneratedMechanicPhaserChildSessionInput = Readonly<{
  ownerWindow?: GeneratedMechanicPhaserMessageWindow;
  expectedParent?: GeneratedMechanicPhaserMessageWindow;
  deadlineMilliseconds?: number;
  timers?: GeneratedMechanicPhaserProtocolTimers;
}>;

export type CreateGeneratedMechanicPhaserParentSessionInput = Readonly<{
  ownerWindow: GeneratedMechanicPhaserMessageWindow;
  iframeWindow: GeneratedMechanicPhaserMessageWindow;
  template: HandAuthoredPhaserTemplate;
  project: PreparedGeneratedMechanicRuntimeProject;
  sessionId: string;
  nonce: string;
}>;

const defaultTimers: GeneratedMechanicPhaserProtocolTimers = Object.freeze({
  setTimeout(callback: () => void, milliseconds: number) {
    return globalThis.setTimeout(callback, milliseconds);
  },
  clearTimeout(timeoutId: unknown) {
    globalThis.clearTimeout(timeoutId as ReturnType<typeof setTimeout>);
  },
});

export function waitForGeneratedMechanicPhaserChildSession({
  ownerWindow = requireBrowserWindow(),
  expectedParent = requireParentWindow(),
  deadlineMilliseconds = 5_000,
  timers = defaultTimers,
}: WaitForGeneratedMechanicPhaserChildSessionInput = {}): Promise<GeneratedMechanicPhaserChildSession> {
  assertPositiveDeadline(deadlineMilliseconds);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutState: {
      armed: boolean;
      id: unknown;
    } = { armed: false, id: undefined };
    const cleanup = () => {
      if (timeoutState.armed) {
        timers.clearTimeout(timeoutState.id);
        timeoutState.armed = false;
      }
      ownerWindow.removeEventListener("message", onMessage);
    };
    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (ownDataValue(event.data, "kind") !== PROJECT_BOOTSTRAP_KIND) {
        return;
      }
      if (
        !event.isTrusted ||
        (event.currentTarget as unknown) !== ownerWindow ||
        (event.source as unknown) !== expectedParent ||
        !isNonemptyString(event.origin) ||
        !hasNoPorts(event) ||
        !isProjectBootstrap(event.data)
      ) {
        fail("The generated mechanic Phaser project bootstrap was invalid.");
        return;
      }

      const bootstrap = event.data;
      const acknowledgement = createAcknowledgement(bootstrap);
      try {
        expectedParent.postMessage(acknowledgement, event.origin, []);
      } catch {
        fail(
          "The generated mechanic Phaser bootstrap acknowledgement could not be sent."
        );
        return;
      }
      settled = true;
      cleanup();
      resolve(
        createChildSession({
          bootstrap,
          ownerWindow,
          parentWindow: expectedParent,
          parentOrigin: event.origin,
        })
      );
    };

    ownerWindow.addEventListener("message", onMessage);
    timeoutState.id = timers.setTimeout(() => {
      fail("The generated mechanic Phaser project bootstrap timed out.");
    }, deadlineMilliseconds);
    timeoutState.armed = true;
    if (settled) {
      cleanup();
    }
  });
}

export function createGeneratedMechanicPhaserParentSession({
  ownerWindow,
  iframeWindow,
  template,
  project,
  sessionId,
  nonce,
}: CreateGeneratedMechanicPhaserParentSessionInput): GeneratedMechanicPhaserParentSession {
  assertPrivateSessionIdentity(sessionId, nonce);
  if (!isTemplateCandidate(template) || !isPreparedProjectCandidate(project)) {
    throw new TypeError(
      "The generated mechanic Phaser parent session requires one exact template and prepared project."
    );
  }

  const bootstrap: GeneratedMechanicPhaserProjectBootstrap = Object.freeze({
    kind: PROJECT_BOOTSTRAP_KIND,
    protocolVersion: GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION,
    sessionId,
    nonce,
    sequence: 0,
    template,
    project,
  });
  const expectedAcknowledgement = createAcknowledgement(bootstrap);
  let disposed = false;
  let bootstrapSent = false;
  let acknowledged = false;
  let nextCommandSequence = 1;
  let expectedRuntimeSequence = 1;

  return Object.freeze({
    sendBootstrap() {
      assertActive(disposed);
      if (bootstrapSent) {
        throw new Error(
          "The generated mechanic Phaser project bootstrap is single-use."
        );
      }
      iframeWindow.postMessage(bootstrap, "*", []);
      bootstrapSent = true;
    },
    postRuntimeCommand(command) {
      assertActive(disposed);
      if (!acknowledged) {
        throw new Error(
          "Generated mechanic Phaser runtime commands require bootstrap acknowledgement."
        );
      }
      const admittedCommand = parseRuntimeCommand(command);
      if (!admittedCommand) {
        throw new TypeError("The Phaser runtime command was invalid.");
      }
      const envelope: GeneratedMechanicPhaserRuntimeCommandEnvelope =
        Object.freeze({
          kind: RUNTIME_COMMAND_KIND,
          protocolVersion: GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION,
          sessionId,
          nonce,
          sequence: nextCommandSequence,
          command: admittedCommand,
        });
      iframeWindow.postMessage(envelope, "*", []);
      nextCommandSequence += 1;
    },
    consumeIframeMessage(event) {
      if (
        disposed ||
        !bootstrapSent ||
        !event.isTrusted ||
        (event.currentTarget as unknown) !== ownerWindow ||
        (event.source as unknown) !== iframeWindow ||
        event.origin !== "null" ||
        !hasNoPorts(event)
      ) {
        return null;
      }

      if (!acknowledged) {
        if (
          isAcknowledgement(event.data) &&
          acknowledgementMatches(event.data, expectedAcknowledgement)
        ) {
          acknowledged = true;
        }
        return null;
      }
      if (
        !isRuntimeEventEnvelope(
          event.data,
          sessionId,
          nonce,
          expectedRuntimeSequence
        )
      ) {
        return null;
      }
      expectedRuntimeSequence += 1;
      return event.data.event;
    },
    isAcknowledged() {
      return acknowledged && !disposed;
    },
    dispose() {
      disposed = true;
    },
  });
}

function createChildSession({
  bootstrap,
  ownerWindow,
  parentWindow,
  parentOrigin,
}: Readonly<{
  bootstrap: GeneratedMechanicPhaserProjectBootstrap;
  ownerWindow: GeneratedMechanicPhaserMessageWindow;
  parentWindow: GeneratedMechanicPhaserMessageWindow;
  parentOrigin: string;
}>): GeneratedMechanicPhaserChildSession {
  const template = bootstrap.template;
  const project = bootstrap.project;
  let disposed = false;
  let nextRuntimeSequence = 1;
  let expectedCommandSequence = 1;

  return Object.freeze({
    getTemplate() {
      assertActive(disposed);
      return template;
    },
    getProject() {
      assertActive(disposed);
      return project;
    },
    postRuntimeEvent(candidate) {
      assertActive(disposed);
      const envelope: GeneratedMechanicPhaserRuntimeEventEnvelope =
        Object.freeze({
          kind: RUNTIME_EVENT_KIND,
          protocolVersion: GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION,
          sessionId: bootstrap.sessionId,
          nonce: bootstrap.nonce,
          sequence: nextRuntimeSequence,
          event: candidate,
        });
      parentWindow.postMessage(envelope, parentOrigin, []);
      nextRuntimeSequence += 1;
    },
    consumeRuntimeCommand(event) {
      if (
        disposed ||
        !event.isTrusted ||
        (event.currentTarget as unknown) !== ownerWindow ||
        (event.source as unknown) !== parentWindow ||
        event.origin !== parentOrigin ||
        !hasNoPorts(event) ||
        !isRuntimeCommandEnvelope(
          event.data,
          bootstrap.sessionId,
          bootstrap.nonce,
          expectedCommandSequence
        )
      ) {
        return null;
      }
      const command = parseRuntimeCommand(event.data.command);
      if (!command) {
        return null;
      }
      expectedCommandSequence += 1;
      return command;
    },
    dispose() {
      disposed = true;
    },
  });
}

const bootstrapKeys = [
  "kind",
  "protocolVersion",
  "sessionId",
  "nonce",
  "sequence",
  "template",
  "project",
] as const;
const templateKeys = [
  "controls",
  "gameSpec",
  "id",
  "mechanicInstallerKeys",
  "runtime",
  "runtimeDependencyScriptPaths",
  "runtimeScriptPath",
  "title",
  "viewport",
] as const;
const acceptedProjectKeys = ["artifact", "dependency"] as const;
const candidateProjectKeys = ["runtimeCandidate", "dependency"] as const;
const acknowledgementKeys = [
  "kind",
  "protocolVersion",
  "sessionId",
  "nonce",
  "sequence",
  "projectKind",
  "runtimeExecutionId",
  "artifactId",
  "extensionId",
  "extensionVersionId",
  "finalGameSpecArtifactId",
  "gameSpecId",
  "mechanicId",
  "contractId",
  "sourceArtifactId",
  "capabilityVersion",
] as const;
const runtimeCommandEnvelopeKeys = [
  "kind",
  "protocolVersion",
  "sessionId",
  "nonce",
  "sequence",
  "command",
] as const;
const runtimeEventEnvelopeKeys = [
  "kind",
  "protocolVersion",
  "sessionId",
  "nonce",
  "sequence",
  "event",
] as const;

function isProjectBootstrap(
  value: unknown
): value is GeneratedMechanicPhaserProjectBootstrap {
  if (!hasExactOwnDataKeys(value, bootstrapKeys)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.kind === PROJECT_BOOTSTRAP_KIND &&
    record.protocolVersion ===
      GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION &&
    isNonemptyString(record.sessionId) &&
    isNonemptyString(record.nonce) &&
    record.sessionId !== record.nonce &&
    record.sequence === 0 &&
    isTemplateCandidate(record.template) &&
    isPreparedProjectCandidate(record.project)
  );
}

function isTemplateCandidate(
  value: unknown
): value is HandAuthoredPhaserTemplate {
  if (!hasExactOwnDataKeys(value, templateKeys)) {
    return false;
  }
  const template = value as Record<string, unknown>;
  return (
    template.runtime === "phaser" &&
    isNonemptyString(template.id) &&
    isNonemptyString(template.title) &&
    isNonemptyString(template.runtimeScriptPath) &&
    Array.isArray(template.controls) &&
    Array.isArray(template.runtimeDependencyScriptPaths) &&
    isPlainRecord(template.gameSpec) &&
    isPlainRecord(template.mechanicInstallerKeys) &&
    isPlainRecord(template.viewport)
  );
}

function isPreparedProjectCandidate(
  value: unknown
): value is PreparedGeneratedMechanicRuntimeProject {
  if (
    !hasExactOwnDataKeys(value, acceptedProjectKeys) &&
    !hasExactOwnDataKeys(value, candidateProjectKeys)
  ) {
    return false;
  }
  const project = value as Record<string, unknown>;
  if (!isPlainRecord(project.dependency)) {
    return false;
  }
  const artifact = executableArtifactForProjectCandidate(project);
  if (!artifact) {
    return false;
  }
  const dependency = project.dependency;
  if (
    !isPlainRecord(dependency.contract) ||
    !isPlainRecord(dependency.finalGameSpec) ||
    !isPlainRecord(dependency.sourceArtifact) ||
    !isPlainRecord(dependency.runtimePolicy) ||
    !Array.isArray(dependency.trustedPortContracts)
  ) {
    return false;
  }
  const finalGameSpec = dependency.finalGameSpec;
  const extension = isPlainRecord(finalGameSpec.extension)
    ? finalGameSpec.extension
    : undefined;
  return Boolean(
    extension &&
      isNonemptyString(artifact.id) &&
      artifact.id === artifact.versionId &&
      artifact.id === extension.versionId &&
      artifact.extensionId === extension.id &&
      artifact.finalGameSpecArtifactId === finalGameSpec.id &&
      isPlainRecord(artifact.contract) &&
      artifact.contract.id === dependency.contract.id &&
      artifact.contract.capabilityVersion ===
        dependency.contract.capabilityVersion &&
      isPlainRecord(artifact.sourceArtifact) &&
      artifact.sourceArtifact.id === dependency.sourceArtifact.id &&
      artifact.sourceArtifact.contractId === dependency.sourceArtifact.contractId &&
      isPlainRecord(artifact.runtimePolicy) &&
      runtimePolicyMatches(
        artifact.runtimePolicy,
        dependency.runtimePolicy
      )
  );
}

function runtimePolicyMatches(
  left: Record<string, unknown>,
  right: Record<string, unknown>
): boolean {
  const keys = [
    "schemaVersion",
    "hostProfileId",
    "executionRealmCandidateId",
    "resourceBudgetProfileId",
    "seed",
    "fixedStepIntervalMilliseconds",
  ] as const;
  return (
    hasExactOwnDataKeys(left, keys) &&
    hasExactOwnDataKeys(right, keys) &&
    keys.every((key) => left[key] === right[key])
  );
}

function createAcknowledgement(
  bootstrap: GeneratedMechanicPhaserProjectBootstrap
): GeneratedMechanicPhaserBootstrapAcknowledgement {
  const project = bootstrap.project;
  const isCandidate = "runtimeCandidate" in project;
  const artifact = isCandidate
    ? project.runtimeCandidate.executableArtifact
    : acceptedGeneratedMechanicArtifactSchema.parse(project.artifact);
  return Object.freeze({
    kind: BOOTSTRAP_ACKNOWLEDGEMENT_KIND,
    protocolVersion: GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION,
    sessionId: bootstrap.sessionId,
    nonce: bootstrap.nonce,
    sequence: 0,
    projectKind: isCandidate ? "candidate" : "accepted",
    runtimeExecutionId: isCandidate
      ? project.runtimeCandidate.runtimeExecutionId
      : project.artifact.buildId,
    artifactId: artifact.id,
    extensionId: artifact.extensionId,
    extensionVersionId: artifact.versionId,
    finalGameSpecArtifactId: artifact.finalGameSpecArtifactId,
    gameSpecId: artifact.gameSpecId,
    mechanicId: artifact.mechanicId,
    contractId: artifact.contract.id,
    sourceArtifactId: artifact.sourceArtifact.id,
    capabilityVersion: artifact.contract.capabilityVersion,
  });
}

function executableArtifactForProjectCandidate(
  project: Record<string, unknown>
): GeneratedMechanicExecutableArtifact | null {
  if (Object.prototype.hasOwnProperty.call(project, "runtimeCandidate")) {
    const parsed = generatedMechanicRuntimeCandidateSchema.safeParse(
      project.runtimeCandidate
    );
    return parsed.success ? parsed.data.executableArtifact : null;
  }
  const parsed = acceptedGeneratedMechanicArtifactSchema.safeParse(
    project.artifact
  );
  if (!parsed.success) {
    return null;
  }
  const artifact = parsed.data;
  return {
    schemaVersion: "generated_mechanic_executable_artifact/v1",
    id: artifact.id,
    extensionId: artifact.extensionId,
    versionId: artifact.versionId,
    finalGameSpecArtifactId: artifact.finalGameSpecArtifactId,
    finalGameSpec: artifact.finalGameSpec,
    gameSpecId: artifact.gameSpecId,
    mechanicId: artifact.mechanicId,
    mechanicType: artifact.mechanicType,
    contract: artifact.contract,
    sourceArtifact: artifact.sourceArtifact,
    runtimePolicy: artifact.runtimePolicy,
    config: artifact.config,
    bindings: artifact.bindings,
    referenceCatalog: artifact.referenceCatalog,
  };
}

function isAcknowledgement(
  value: unknown
): value is GeneratedMechanicPhaserBootstrapAcknowledgement {
  if (!hasExactOwnDataKeys(value, acknowledgementKeys)) {
    return false;
  }
  const acknowledgement = value as Record<string, unknown>;
  return (
    acknowledgement.kind === BOOTSTRAP_ACKNOWLEDGEMENT_KIND &&
    acknowledgement.protocolVersion ===
      GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION &&
    acknowledgement.sequence === 0 &&
    (acknowledgement.projectKind === "accepted" ||
      acknowledgement.projectKind === "candidate") &&
    acknowledgementKeys
      .filter(
        (key) =>
          !["sequence", "kind", "protocolVersion"].includes(key)
      )
      .every((key) => isNonemptyString(acknowledgement[key]))
  );
}

function acknowledgementMatches(
  actual: GeneratedMechanicPhaserBootstrapAcknowledgement,
  expected: GeneratedMechanicPhaserBootstrapAcknowledgement
): boolean {
  return acknowledgementKeys.every((key) => actual[key] === expected[key]);
}

function isRuntimeCommandEnvelope(
  value: unknown,
  sessionId: string,
  nonce: string,
  sequence: number
): value is GeneratedMechanicPhaserRuntimeCommandEnvelope {
  if (!hasExactOwnDataKeys(value, runtimeCommandEnvelopeKeys)) {
    return false;
  }
  const envelope = value as Record<string, unknown>;
  return (
    envelope.kind === RUNTIME_COMMAND_KIND &&
    envelope.protocolVersion ===
      GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION &&
    envelope.sessionId === sessionId &&
    envelope.nonce === nonce &&
    envelope.sequence === sequence
  );
}

function isRuntimeEventEnvelope(
  value: unknown,
  sessionId: string,
  nonce: string,
  sequence: number
): value is GeneratedMechanicPhaserRuntimeEventEnvelope {
  if (!hasExactOwnDataKeys(value, runtimeEventEnvelopeKeys)) {
    return false;
  }
  const envelope = value as Record<string, unknown>;
  return (
    envelope.kind === RUNTIME_EVENT_KIND &&
    envelope.protocolVersion ===
      GENERATED_MECHANIC_PHASER_HOST_PROTOCOL_VERSION &&
    envelope.sessionId === sessionId &&
    envelope.nonce === nonce &&
    envelope.sequence === sequence
  );
}

function parseRuntimeCommand(value: unknown): RuntimeCommand | null {
  if (!isPlainRecord(value)) {
    return null;
  }
  const type = ownDataValue(value, "type");
  if (type === "game-run-first-playable-checks") {
    if (hasExactOwnDataKeys(value, ["type"])) {
      return Object.freeze({ type });
    }
    if (
      hasExactOwnDataKeys(value, ["type", "actionId"]) &&
      stableIdSchema.safeParse(ownDataValue(value, "actionId")).success
    ) {
      return Object.freeze({
        type,
        actionId: ownDataValue(value, "actionId") as string,
      });
    }
    return null;
  }
  if (
    (type === "game-focus" ||
      type === "game-reload") &&
    hasExactOwnDataKeys(value, ["type"])
  ) {
    return Object.freeze({ type });
  }
  if (
    type === "game-pause" &&
    hasExactOwnDataKeys(value, ["type", "paused"]) &&
    typeof value.paused === "boolean"
  ) {
    return Object.freeze({ type, paused: value.paused });
  }
  if (
    type === "game-resize" &&
    hasExactOwnDataKeys(value, ["type", "viewport"])
  ) {
    const viewport = parseRuntimeViewport(value.viewport);
    return viewport ? Object.freeze({ type, viewport }) : null;
  }
  return null;
}

function parseRuntimeViewport(value: unknown): RuntimeViewport | null {
  if (!hasExactOwnDataKeys(value, ["width", "height", "scaling"])) {
    return null;
  }
  const viewport = value as Record<string, unknown>;
  return typeof viewport.width === "number" &&
    Number.isFinite(viewport.width) &&
    viewport.width > 0 &&
    typeof viewport.height === "number" &&
    Number.isFinite(viewport.height) &&
    viewport.height > 0 &&
    viewport.scaling === "stretch_to_fill"
    ? Object.freeze({
        width: viewport.width,
        height: viewport.height,
        scaling: viewport.scaling,
      })
    : null;
}

function hasNoPorts(event: MessageEvent<unknown>): boolean {
  return Array.isArray(event.ports) && event.ports.length === 0;
}

function ownDataValue(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function hasExactOwnDataKeys(
  value: unknown,
  expectedKeys: readonly string[]
): value is Record<string, unknown> {
  if (!isPlainRecord(value)) {
    return false;
  }
  const actualKeys = Reflect.ownKeys(value);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key) => typeof key !== "string")
  ) {
    return false;
  }
  const expected = new Set(expectedKeys);
  return actualKeys.every(
    (key) =>
      typeof key === "string" &&
      expected.has(key) &&
      Object.prototype.hasOwnProperty.call(value, key) &&
      "value" in Object.getOwnPropertyDescriptor(value, key)!
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function assertPrivateSessionIdentity(sessionId: string, nonce: string): void {
  if (
    !isNonemptyString(sessionId) ||
    !isNonemptyString(nonce) ||
    sessionId === nonce
  ) {
    throw new TypeError(
      "The generated mechanic Phaser protocol requires distinct non-empty private session and nonce values."
    );
  }
}

function assertPositiveDeadline(deadlineMilliseconds: number): void {
  if (
    !Number.isFinite(deadlineMilliseconds) ||
    deadlineMilliseconds <= 0
  ) {
    throw new TypeError(
      "The generated mechanic Phaser bootstrap deadline must be positive."
    );
  }
}

function assertActive(disposed: boolean): void {
  if (disposed) {
    throw new Error("The generated mechanic Phaser protocol session is disposed.");
  }
}

function requireBrowserWindow(): GeneratedMechanicPhaserMessageWindow {
  if (typeof window === "undefined") {
    throw new Error("The generated mechanic Phaser protocol requires a window.");
  }
  return window;
}

function requireParentWindow(): GeneratedMechanicPhaserMessageWindow {
  const ownerWindow = requireBrowserWindow();
  const parentWindow = window.parent;
  if (!parentWindow || (parentWindow as unknown) === ownerWindow) {
    throw new Error(
      "The generated mechanic Phaser child protocol requires a parent window."
    );
  }
  return parentWindow as GeneratedMechanicPhaserMessageWindow;
}
