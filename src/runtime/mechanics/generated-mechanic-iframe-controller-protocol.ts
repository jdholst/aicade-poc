export const GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION =
  "generated_mechanic_iframe_controller/v1";

export type GeneratedMechanicIframeControllerBootstrap = Readonly<{
  kind: "sparkline_generated_mechanic_controller_bootstrap";
  protocolVersion: typeof GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: 0;
}>;

export type GeneratedMechanicIframeControllerAcknowledgement = Readonly<{
  kind: "sparkline_generated_mechanic_controller_acknowledgement";
  protocolVersion: typeof GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: 0;
}>;

export type GeneratedMechanicIframeControllerRequest = Readonly<{
  kind: "sparkline_generated_mechanic_controller_request";
  protocolVersion: typeof GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: number;
  message: unknown;
}>;

export type GeneratedMechanicIframeControllerResponse = Readonly<{
  kind: "sparkline_generated_mechanic_controller_response";
  protocolVersion: typeof GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: number;
  message: unknown;
}>;

export type GeneratedMechanicIframeControllerTerminate = Readonly<{
  kind: "sparkline_generated_mechanic_controller_terminate";
  protocolVersion: typeof GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: number;
}>;

export type GeneratedMechanicIframeBrokerTerminated = Readonly<{
  kind: "sparkline_generated_mechanic_broker_terminated";
  protocolVersion: typeof GENERATED_MECHANIC_IFRAME_CONTROLLER_PROTOCOL_VERSION;
  sessionId: string;
  nonce: string;
  sequence: number;
}>;

export type GeneratedMechanicIframeToBrokerMessage =
  | GeneratedMechanicIframeControllerAcknowledgement
  | GeneratedMechanicIframeControllerRequest
  | GeneratedMechanicIframeControllerTerminate;

export type GeneratedMechanicBrokerToIframeMessage =
  | GeneratedMechanicIframeControllerResponse
  | GeneratedMechanicIframeBrokerTerminated;
