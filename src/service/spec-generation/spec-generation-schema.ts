import { z } from "zod";

import {
  TOP_DOWN_GENERATION_CAPABILITY_POLICY,
  TopDownGenerationCapabilityPolicy,
  applyTopDownSpecGenerationPolicy,
} from "./top-down-generation-capability-policy";
import { topDownGameSpecSchema } from "@/game-spec";

export type JsonSchemaObject = {
  [key: string]: unknown;
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  anyOf?: JsonSchemaObject[];
  oneOf?: JsonSchemaObject[];
  required?: string[];
  enum?: unknown[];
  const?: unknown;
};

export const allowedTopDownSpecGenerationMechanics = [
  ...TOP_DOWN_GENERATION_CAPABILITY_POLICY.allowedMechanics,
] as const;

export const TOP_DOWN_GAME_SPEC_TOOL = "return_top_down_game_spec";

export function createTopDownGameSpecJsonSchema(
  policy: TopDownGenerationCapabilityPolicy = TOP_DOWN_GENERATION_CAPABILITY_POLICY
): JsonSchemaObject {
  const schema = z.toJSONSchema(topDownGameSpecSchema, {
    target: "draft-07",
    unrepresentable: "any",
    reused: "inline",
  }) as JsonSchemaObject;

  delete schema.$schema;
  applyTopDownSpecGenerationPolicy(schema, policy);

  return schema;
}

export const topDownGameSpecJsonSchema = createTopDownGameSpecJsonSchema();
