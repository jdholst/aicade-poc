import {
  MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION,
  jsonValueSchema,
  type FinalGameSpecMechanicConnectionPlan,
  type JsonValue,
  type MechanicPortEndpoint,
  type StableId,
} from "@/game-spec/game-spec-schema";
import {
  configDslValueMatches,
  type GeneratedMechanicReferenceCatalog,
  type MechanicConfigDslValue,
} from "@/game-spec/mechanics/generated-mechanic-contract";
import type {
  MechanicExecutionRealmCapabilityHost,
  MechanicExecutionRealmCapabilityResult,
} from "./mechanic-execution-realm";

export { MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION } from "@/game-spec/game-spec-schema";
export type {
  FinalGameSpecMechanicConnectionPlan,
  MechanicPortConnection,
  MechanicPortEndpoint,
} from "@/game-spec/game-spec-schema";

export type MechanicPortOwnerKind = MechanicPortEndpoint["ownerKind"];

export type MechanicPortDeclaration = {
  id: StableId;
  direction: "input" | "output";
  payload: MechanicConfigDslValue;
};

export type MechanicPortContract = {
  ownerKind: MechanicPortOwnerKind;
  ownerId: StableId;
  ports: readonly MechanicPortDeclaration[];
};

export type MechanicPortConnectionIssue = {
  path: string;
  code: "incompatible_payload" | "invalid_plan" | "unknown_port";
  message: string;
};

export type ValidateFinalGameSpecMechanicConnectionsInput = {
  contracts: readonly MechanicPortContract[];
  connectionPlan: FinalGameSpecMechanicConnectionPlan;
};

export type FinalGameSpecMechanicConnectionValidationResult =
  | {
      success: true;
      data: FinalGameSpecMechanicConnectionPlan;
    }
  | {
      success: false;
      issues: readonly MechanicPortConnectionIssue[];
    };

export type MechanicPortReceiver = {
  mechanicId: StableId;
  receive(input: {
    portId: StableId;
    payload: JsonValue;
  }): void | Promise<void>;
};

export type TrustedGameSystemPortOwner<State extends JsonValue = JsonValue> = {
  readonly systemId: StableId;
  readonly contract: MechanicPortContract & { ownerKind: "game_system" };
  readState(): State;
};

export type TrustedGameSystemPortOutput = {
  portId: StableId;
  payload: JsonValue;
};

export type CreateTrustedGameSystemPortOwnerInput<State extends JsonValue> = {
  contract: MechanicPortContract & { ownerKind: "game_system" };
  initialState: State;
  transition(input: {
    portId: StableId;
    payload: JsonValue;
    state: State;
  }):
    | {
        state: State;
        outputs?: readonly TrustedGameSystemPortOutput[];
      }
    | Promise<{
        state: State;
        outputs?: readonly TrustedGameSystemPortOutput[];
      }>;
};

type TrustedGameSystemPortOwnerInternal = {
  state: JsonValue;
  transition: CreateTrustedGameSystemPortOwnerInput<JsonValue>["transition"];
};

const trustedGameSystemPortOwnerInternals = new WeakMap<
  TrustedGameSystemPortOwner,
  TrustedGameSystemPortOwnerInternal
>();

export type MechanicPortDeliveryRecord = {
  sequence: number;
  connectionId: StableId;
  output: MechanicPortEndpoint;
  input: MechanicPortEndpoint;
  payload: JsonValue;
};

export type MechanicPortStepFailure = {
  stage: "signal_delivery";
  code: "signal_queue_limit_exceeded";
  message: string;
  maximumSignalDeliveriesPerStep: number;
  nextConnectionId: StableId;
};

export type MechanicPortStepResult<Result> =
  | {
      outcome: "completed";
      callbackResult: Result;
      deliveries: readonly MechanicPortDeliveryRecord[];
    }
  | {
      outcome: "failed";
      callbackResult: Result;
      deliveries: readonly MechanicPortDeliveryRecord[];
      failure: MechanicPortStepFailure;
    };

type ActiveMechanicPortStep = {
  queue: MechanicPortDeliveryRecord[];
  deliveries: MechanicPortDeliveryRecord[];
  nextSequence: number;
  failure?: MechanicPortStepFailure;
};

export type CreateMechanicPortRuntimeInput = {
  contracts: readonly MechanicPortContract[];
  connectionPlan: FinalGameSpecMechanicConnectionPlan;
  maximumSignalDeliveriesPerStep: number;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  mechanicReceivers: readonly MechanicPortReceiver[];
  gameSystemOwners: readonly TrustedGameSystemPortOwner[];
};

export type MechanicPortRuntime = {
  createMechanicCapabilityHost(
    mechanicId: StableId,
    delegate: MechanicExecutionRealmCapabilityHost
  ): MechanicExecutionRealmCapabilityHost;
  runStep<Result>(
    callback: () => Result | Promise<Result>
  ): Promise<MechanicPortStepResult<Result>>;
};

export function createTrustedGameSystemPortOwner<State extends JsonValue>({
  contract,
  initialState,
  transition,
}: CreateTrustedGameSystemPortOwnerInput<State>): TrustedGameSystemPortOwner<State> {
  if (contract.ownerKind !== "game_system") {
    throw new TypeError("A trusted Game System Port owner requires a game-system contract.");
  }
  const parsedInitialState = jsonValueSchema.parse(initialState);
  const contractSnapshot = snapshotJsonData(contract);
  const internal: TrustedGameSystemPortOwnerInternal = {
    state: snapshotJson(parsedInitialState),
    transition: transition as TrustedGameSystemPortOwnerInternal["transition"],
  };
  const owner: TrustedGameSystemPortOwner<State> = Object.freeze({
    systemId: contractSnapshot.ownerId,
    contract: contractSnapshot,
    readState: () => internal.state as State,
  });
  trustedGameSystemPortOwnerInternals.set(owner, internal);
  return owner;
}

export function validateFinalGameSpecMechanicConnections({
  contracts,
  connectionPlan,
}: ValidateFinalGameSpecMechanicConnectionsInput): FinalGameSpecMechanicConnectionValidationResult {
  if (
    connectionPlan.schemaVersion !==
    MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION
  ) {
    return {
      success: false,
      issues: [
        {
          path: "schemaVersion",
          code: "invalid_plan",
          message: `Mechanic connection schema version must be "${MECHANIC_PORT_CONNECTIONS_SCHEMA_VERSION}".`,
        },
      ],
    };
  }
  const contractsByOwner = new Map(
    contracts.map((contract) => [ownerKey(contract), contract])
  );
  const issues: MechanicPortConnectionIssue[] = [];

  connectionPlan.connections.forEach((connection, connectionIndex) => {
    const output = resolvePort(contractsByOwner, connection.output, "output");
    const input = resolvePort(contractsByOwner, connection.input, "input");
    if (!output || !input) {
      issues.push({
        path: `connections.${connectionIndex}`,
        code: "unknown_port",
        message: `Connection "${connection.id}" must reference one declared output port and one declared input port.`,
      });
      return;
    }

    if (!isPayloadSchemaCompatible(output.payload, input.payload)) {
      issues.push({
        path: `connections.${connectionIndex}`,
        code: "incompatible_payload",
        message: `Output port "${connection.output.ownerId}.${connection.output.portId}" is not schema-compatible with input port "${connection.input.ownerId}.${connection.input.portId}".`,
      });
    }
  });

  return issues.length === 0
    ? { success: true, data: connectionPlan }
    : { success: false, issues };
}

export function createMechanicPortRuntime({
  contracts,
  connectionPlan,
  maximumSignalDeliveriesPerStep,
  referenceCatalog,
  mechanicReceivers,
  gameSystemOwners,
}: CreateMechanicPortRuntimeInput): MechanicPortRuntime {
  const allContracts = snapshotJsonData([
    ...contracts,
    ...gameSystemOwners.map((owner) => owner.contract),
  ]);
  const admittedConnectionPlan = snapshotJsonData(connectionPlan);
  const admittedReferenceCatalog = snapshotJsonData(referenceCatalog);
  const validation = validateFinalGameSpecMechanicConnections({
    contracts: allContracts,
    connectionPlan: admittedConnectionPlan,
  });
  if (!validation.success) {
    throw new Error(validation.issues.map((issue) => issue.message).join(" "));
  }
  if (
    !Number.isInteger(maximumSignalDeliveriesPerStep) ||
    maximumSignalDeliveriesPerStep < 0
  ) {
    throw new TypeError(
      "Maximum signal deliveries per step must be a nonnegative integer."
    );
  }

  const contractsByOwner = new Map(
    allContracts.map((contract) => [ownerKey(contract), contract])
  );
  const receiversByMechanicId = new Map(
    mechanicReceivers.map((receiver) => [receiver.mechanicId, receiver])
  );
  const ownersBySystemId = new Map(
    gameSystemOwners.map((owner) => [owner.systemId, owner])
  );
  let activeStep: ActiveMechanicPortStep | undefined;

  const enqueueSignal = (
    outputEndpoint: MechanicPortEndpoint,
    payload: unknown
  ): MechanicExecutionRealmCapabilityResult => {
    if (!activeStep) {
      throw new Error(
        "Mechanic signals may be emitted only inside a host-controlled step."
      );
    }
    if (activeStep.failure) {
      return { kind: "json", value: null };
    }
    const snapshot = snapshotJson(
      validateSignalPayload(
        contractsByOwner,
        outputEndpoint,
        payload,
        admittedReferenceCatalog
      )
    );
    for (const connection of admittedConnectionPlan.connections) {
      if (endpointsEqual(connection.output, outputEndpoint)) {
        if (
          activeStep.nextSequence + activeStep.queue.length >=
          maximumSignalDeliveriesPerStep
        ) {
          activeStep.failure = createSignalQueueLimitFailure(
            maximumSignalDeliveriesPerStep,
            connection.id
          );
          break;
        }
        activeStep.queue.push({
          sequence: 0,
          connectionId: connection.id,
          output: snapshotEndpoint(connection.output),
          input: snapshotEndpoint(connection.input),
          payload: snapshot,
        });
      }
    }
    return { kind: "json", value: null };
  };

  const runStep = async <Result>(
    callback: () => Result | Promise<Result>
  ): Promise<MechanicPortStepResult<Result>> => {
    if (activeStep) {
      throw new Error("Mechanic port steps cannot be nested.");
    }
    const step: ActiveMechanicPortStep = {
      queue: [],
      deliveries: [],
      nextSequence: 0,
    };
    activeStep = step;
    try {
      const callbackResult = await callback();
      while (step.queue.length > 0) {
        const queued = step.queue.shift();
        if (!queued) {
          break;
        }
        step.nextSequence += 1;
        const delivery = Object.freeze({
          ...queued,
          sequence: step.nextSequence,
        });
        if (delivery.input.ownerKind === "mechanic") {
          const receiver = receiversByMechanicId.get(delivery.input.ownerId);
          if (!receiver) {
            throw new Error(
              `No receiver is registered for mechanic input "${delivery.input.ownerId}.${delivery.input.portId}".`
            );
          }
          await receiver.receive({
            portId: delivery.input.portId,
            payload: delivery.payload,
          });
        } else {
          const owner = ownersBySystemId.get(delivery.input.ownerId);
          const internal = owner
            ? trustedGameSystemPortOwnerInternals.get(owner)
            : undefined;
          if (!owner || !internal) {
            throw new Error(
              `No trusted owner is registered for Game System input "${delivery.input.ownerId}.${delivery.input.portId}".`
            );
          }
          const transition = await internal.transition({
            portId: delivery.input.portId,
            payload: delivery.payload,
            state: internal.state,
          });
          const parsedState = jsonValueSchema.safeParse(transition.state);
          if (!parsedState.success) {
            throw new TypeError(
              `Trusted Game System "${owner.systemId}" produced invalid state.`
            );
          }
          const outputEndpoints = (transition.outputs ?? []).map((output) => ({
            endpoint: {
              ownerKind: "game_system" as const,
              ownerId: owner.systemId,
              portId: output.portId,
            },
            payload: output.payload,
          }));
          outputEndpoints.forEach(({ endpoint, payload }) => {
            validateSignalPayload(
              contractsByOwner,
              endpoint,
              payload,
              admittedReferenceCatalog
            );
          });
          internal.state = snapshotJson(parsedState.data);
          outputEndpoints.forEach(({ endpoint, payload }) => {
            enqueueSignal(endpoint, payload);
          });
        }
        step.deliveries.push(delivery);
      }
      if (step.failure) {
        return {
          outcome: "failed",
          callbackResult,
          deliveries: Object.freeze([...step.deliveries]),
          failure: step.failure,
        };
      }
      return {
        outcome: "completed",
        callbackResult,
        deliveries: Object.freeze([...step.deliveries]),
      };
    } finally {
      activeStep = undefined;
    }
  };

  return Object.freeze({
    createMechanicCapabilityHost: (
      mechanicId: StableId,
      delegate: MechanicExecutionRealmCapabilityHost
    ): MechanicExecutionRealmCapabilityHost => ({
      invoke: ({ capabilityId, arguments: capabilityArguments }) => {
        if (capabilityId !== "signal_emit") {
          return delegate.invoke({
            capabilityId,
            arguments: capabilityArguments,
          });
        }
        const portId = capabilityArguments[0];
        if (typeof portId !== "string") {
          throw new TypeError("Mechanic signal port ID must be a string.");
        }
        return enqueueSignal(
          { ownerKind: "mechanic", ownerId: mechanicId, portId },
          capabilityArguments[1]
        );
      },
    }),
    runStep,
  });
}

function ownerKey(owner: {
  ownerKind: MechanicPortOwnerKind;
  ownerId: StableId;
}): string {
  return `${owner.ownerKind}:${owner.ownerId}`;
}

function endpointsEqual(
  left: MechanicPortEndpoint,
  right: MechanicPortEndpoint
): boolean {
  return (
    left.ownerKind === right.ownerKind &&
    left.ownerId === right.ownerId &&
    left.portId === right.portId
  );
}

function snapshotEndpoint(
  endpoint: MechanicPortEndpoint
): MechanicPortEndpoint {
  return Object.freeze({ ...endpoint });
}

function snapshotJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    const snapshot = value.map((item) => snapshotJson(item));
    Object.freeze(snapshot);
    return snapshot;
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, snapshotJson(item)])
      )
    );
  }
  return value;
}

function snapshotJsonData<Value>(value: Value): Value {
  return snapshotJson(jsonValueSchema.parse(value)) as Value;
}

function createSignalQueueLimitFailure(
  maximumSignalDeliveriesPerStep: number,
  nextConnectionId: StableId
): MechanicPortStepFailure {
  return Object.freeze({
    stage: "signal_delivery",
    code: "signal_queue_limit_exceeded",
    message: `Mechanic signal delivery limit ${maximumSignalDeliveriesPerStep} was exceeded.`,
    maximumSignalDeliveriesPerStep,
    nextConnectionId,
  });
}

function validateSignalPayload(
  contractsByOwner: ReadonlyMap<string, MechanicPortContract>,
  outputEndpoint: MechanicPortEndpoint,
  payload: unknown,
  referenceCatalog: GeneratedMechanicReferenceCatalog
): JsonValue {
  const outputPort = resolvePort(
    contractsByOwner,
    outputEndpoint,
    "output"
  );
  const parsedPayload = jsonValueSchema.safeParse(payload);
  if (
    !outputPort ||
    !parsedPayload.success ||
    !configDslValueMatches(
      outputPort.payload,
      parsedPayload.data,
      referenceCatalog
    )
  ) {
    throw new TypeError(
      `Signal payload does not match output port "${outputEndpoint.ownerId}.${outputEndpoint.portId}".`
    );
  }
  return parsedPayload.data;
}

function resolvePort(
  contractsByOwner: ReadonlyMap<string, MechanicPortContract>,
  endpoint: MechanicPortEndpoint,
  direction: MechanicPortDeclaration["direction"]
): MechanicPortDeclaration | undefined {
  return contractsByOwner
    .get(ownerKey(endpoint))
    ?.ports.find(
      (port) => port.id === endpoint.portId && port.direction === direction
    );
}

function isPayloadSchemaCompatible(
  output: MechanicConfigDslValue,
  input: MechanicConfigDslValue
): boolean {
  if (output.kind === "boolean" || input.kind === "boolean") {
    return output.kind === "boolean" && input.kind === "boolean";
  }
  if (output.kind === "number") {
    return (
      input.kind === "number" &&
      output.minimum >= input.minimum &&
      output.maximum <= input.maximum
    );
  }
  if (output.kind === "integer") {
    return (
      (input.kind === "integer" || input.kind === "number") &&
      output.minimum >= input.minimum &&
      output.maximum <= input.maximum
    );
  }
  if (output.kind === "string") {
    return (
      input.kind === "string" &&
      output.minimumLength >= input.minimumLength &&
      output.maximumLength <= input.maximumLength
    );
  }
  if (output.kind === "enum") {
    return (
      input.kind === "enum" &&
      output.values.every((value) => input.values.includes(value))
    );
  }
  if (output.kind === "stable_id") {
    return (
      input.kind === "stable_id" &&
      output.referenceKind === input.referenceKind
    );
  }
  if (output.kind === "collection") {
    return (
      input.kind === "collection" &&
      output.minimumItems >= input.minimumItems &&
      output.maximumItems <= input.maximumItems &&
      isPayloadSchemaCompatible(output.item, input.item)
    );
  }
  if (input.kind !== "object") {
    return false;
  }
  const outputFields = new Map(
    output.fields.map((field) => [field.key, field])
  );
  const inputFields = new Map(input.fields.map((field) => [field.key, field]));

  return (
    output.fields.every((outputField) => {
      const inputField = inputFields.get(outputField.key);
      return (
        inputField !== undefined &&
        (!inputField.required || outputField.required) &&
        isPayloadSchemaCompatible(outputField.value, inputField.value)
      );
    }) &&
    input.fields.every(
      (inputField) => !inputField.required || outputFields.has(inputField.key)
    )
  );
}
