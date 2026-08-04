import { z } from "zod";

import { generatedMechanicContractSchema } from "@/game-spec";

export const GENERATED_MECHANIC_CONTRACT_TOOL =
  "return_generated_mechanic_contract";

export type MechanicContractJsonSchema = {
  $schema?: string;
  $defs?: Record<string, MechanicContractJsonSchema>;
  additionalProperties?: boolean;
  anyOf?: MechanicContractJsonSchema[];
  default?: unknown;
  items?: MechanicContractJsonSchema;
  oneOf?: MechanicContractJsonSchema[];
  properties?: Record<string, MechanicContractJsonSchema>;
  propertyNames?: MechanicContractJsonSchema;
  required?: string[];
  type?: string | string[];
};

export function createGeneratedMechanicContractJsonSchema() {
  const schema = z.toJSONSchema(generatedMechanicContractSchema, {
    target: "draft-7",
    unrepresentable: "any",
  }) as MechanicContractJsonSchema;

  delete schema.$schema;
  normalizeStrictToolSchema(schema);

  return schema;
}

export const generatedMechanicContractJsonSchema =
  createGeneratedMechanicContractJsonSchema();

function normalizeStrictToolSchema(schema: MechanicContractJsonSchema) {
  visitSchema(schema, (node) => {
    delete node.default;
    delete node.propertyNames;

    if (node.properties) {
      node.additionalProperties = false;
      node.required = Object.keys(node.properties);
    }
  });
}

function visitSchema(
  schema: MechanicContractJsonSchema,
  visitor: (schema: MechanicContractJsonSchema) => void
) {
  visitor(schema);

  for (const child of Object.values(schema.properties ?? {})) {
    visitSchema(child, visitor);
  }

  if (schema.items) {
    visitSchema(schema.items, visitor);
  }

  for (const child of schema.anyOf ?? []) {
    visitSchema(child, visitor);
  }

  for (const child of schema.oneOf ?? []) {
    visitSchema(child, visitor);
  }

  for (const child of Object.values(schema.$defs ?? {})) {
    visitSchema(child, visitor);
  }
}
