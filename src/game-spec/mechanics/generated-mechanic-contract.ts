import { z } from "zod";

import { jsonValueSchema, stableIdSchema } from "../game-spec-schema";
import type { StableId } from "../game-spec-schema";
import type { GenerationConstraintSet } from "./mechanic-generation-constraints";

export const GENERATED_MECHANIC_CONTRACT_SCHEMA_VERSION =
  "generated-mechanic-contract/v1";

const nonEmptyTextSchema = z.string().min(1).max(600);
const finiteNumberSchema = z.number().finite();
const finiteIntegerSchema = finiteNumberSchema.int();
const nonnegativeIntegerSchema = finiteIntegerSchema.nonnegative();

export type MechanicConfigDslValue =
  | {
      kind: "boolean";
      default?: boolean;
    }
  | {
      kind: "number";
      minimum: number;
      maximum: number;
      default?: number;
    }
  | {
      kind: "integer";
      minimum: number;
      maximum: number;
      default?: number;
    }
  | {
      kind: "string";
      minimumLength: number;
      maximumLength: number;
      default?: string;
    }
  | {
      kind: "enum";
      values: string[];
      default?: string;
    }
  | {
      kind: "stable_id";
      referenceKind: string;
      default?: string;
    }
  | {
      kind: "object";
      fields: MechanicConfigDslField[];
    }
  | {
      kind: "collection";
      minimumItems: number;
      maximumItems: number;
      item: MechanicConfigDslValue;
    };

export type MechanicConfigDslField = {
  key: string;
  required: boolean;
  value: MechanicConfigDslValue;
};

export const mechanicConfigDslValueSchema: z.ZodType<MechanicConfigDslValue> =
  z.lazy(() =>
    z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("boolean"),
          default: z.boolean().optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("number"),
          minimum: finiteNumberSchema,
          maximum: finiteNumberSchema,
          default: finiteNumberSchema.optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("integer"),
          minimum: finiteIntegerSchema,
          maximum: finiteIntegerSchema,
          default: finiteIntegerSchema.optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("string"),
          minimumLength: nonnegativeIntegerSchema,
          maximumLength: nonnegativeIntegerSchema,
          default: z.string().optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("enum"),
          values: z.array(stableIdSchema).min(1),
          default: stableIdSchema.optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("stable_id"),
          referenceKind: stableIdSchema,
          default: stableIdSchema.optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal("object"),
          fields: z.array(
            z
              .object({
                key: stableIdSchema,
                required: z.boolean(),
                value: mechanicConfigDslValueSchema,
              })
              .strict()
          ),
        })
        .strict(),
      z
        .object({
          kind: z.literal("collection"),
          minimumItems: nonnegativeIntegerSchema,
          maximumItems: nonnegativeIntegerSchema,
          item: mechanicConfigDslValueSchema,
        })
        .strict(),
    ])
  );

export const behaviorScenarioSchema = z
  .object({
    id: stableIdSchema,
    seed: finiteIntegerSchema,
    setup: z.array(
      z.discriminatedUnion("kind", [
        z
          .object({
            kind: z.literal("binding_present"),
            bindingId: stableIdSchema,
          })
          .strict(),
        z
          .object({
            kind: z.literal("state_equals"),
            stateId: stableIdSchema,
            value: jsonValueSchema,
          })
          .strict(),
      ])
    ),
    steps: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("receive_input"),
              portId: stableIdSchema,
              value: jsonValueSchema,
            })
            .strict(),
          z
            .object({
              kind: z.literal("dispatch_action"),
              actionId: stableIdSchema,
            })
            .strict(),
          z
            .object({
              kind: z.literal("advance_time"),
              milliseconds: finiteIntegerSchema.positive(),
            })
            .strict(),
        ])
      )
      .min(1),
    observations: z
      .array(
        z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("state_equals"),
              stateId: stableIdSchema,
              value: jsonValueSchema,
            })
            .strict(),
          z
            .object({
              kind: z.literal("binding_property"),
              bindingId: stableIdSchema,
              property: stableIdSchema,
              operator: z.enum([
                "equals",
                "not_equals",
                "less_than",
                "at_most",
                "greater_than",
                "at_least",
              ]),
              value: jsonValueSchema,
            })
            .strict(),
          z
            .object({
              kind: z.literal("owned_object_count"),
              archetypeId: stableIdSchema,
              operator: z.enum(["equals", "at_most", "at_least"]),
              value: nonnegativeIntegerSchema,
            })
            .strict(),
          z
            .object({
              kind: z.literal("output_emitted"),
              portId: stableIdSchema,
              value: jsonValueSchema,
            })
            .strict(),
        ])
      )
      .min(1),
  })
  .strict();

export const generatedMechanicContractSchema = z
  .object({
    schemaVersion: z.literal(GENERATED_MECHANIC_CONTRACT_SCHEMA_VERSION),
    id: stableIdSchema,
    intentId: stableIdSchema,
    capabilityVersion: z.string().min(1).max(80),
    intentLineage: z
      .object({
        actors: z.array(stableIdSchema),
        targets: z.array(stableIdSchema),
        behaviors: z.array(stableIdSchema),
        stateChanges: z.array(stableIdSchema),
        temporalRules: z.array(stableIdSchema),
        spatialRules: z.array(stableIdSchema),
        constraints: z.array(stableIdSchema),
        connections: z.array(
          z
            .object({
              direction: z.enum(["input", "output"]),
              port: stableIdSchema,
            })
            .strict()
        ),
        references: z.array(
          z
            .object({
              kind: z.enum([
                "asset",
                "entity",
                "objective",
                "region",
                "scene",
              ]),
              id: stableIdSchema,
            })
            .strict()
        ),
      })
      .strict()
      .optional(),
    behavior: z
      .object({
        summary: nonEmptyTextSchema,
        triggers: z.array(stableIdSchema).min(1),
        outcomes: z.array(stableIdSchema).min(1),
      })
      .strict(),
    config: mechanicConfigDslValueSchema,
    bindings: z.array(
      z
        .object({
          id: stableIdSchema,
          referenceKind: stableIdSchema,
          cardinality: z.enum(["one", "many"]),
          objectIds: z.array(stableIdSchema).min(1),
        })
        .strict()
    ),
    ownedObjects: z.array(
      z
        .object({
          id: stableIdSchema,
          objectKind: stableIdSchema,
          maximumInstances: nonnegativeIntegerSchema,
        })
        .strict()
    ),
    privateState: z.array(
      z
        .object({
          id: stableIdSchema,
          valueType: z.enum([
            "boolean",
            "number",
            "integer",
            "string",
            "stable_id",
          ]),
          initialValue: jsonValueSchema,
        })
        .strict()
    ),
    lifecycle: z
      .object({
        callbacks: z
          .array(
            z.enum([
              "install",
              "logical_action",
              "gameplay_event",
              "scheduled",
            ])
          )
          .min(1),
        fixedStep: z.boolean(),
        dispose: z.literal(true),
      })
      .strict(),
    ports: z.array(
      z
        .object({
          id: stableIdSchema,
          direction: z.enum(["input", "output"]),
          payload: mechanicConfigDslValueSchema,
        })
        .strict()
    ),
    capabilities: z.array(stableIdSchema).min(1),
    resourceExpectations: z
      .object({
        maximumOwnedObjects: nonnegativeIntegerSchema,
        maximumOperationsPerTick: nonnegativeIntegerSchema,
        maximumScheduledCallbacks: nonnegativeIntegerSchema,
        maximumSubscriptions: nonnegativeIntegerSchema,
        maximumSignalsPerTick: nonnegativeIntegerSchema,
        maximumStateBytes: nonnegativeIntegerSchema,
        maximumCallbackMilliseconds: nonnegativeIntegerSchema,
        maximumConsecutiveFailures: nonnegativeIntegerSchema,
      })
      .strict(),
    scenarios: z.array(behaviorScenarioSchema).min(1),
  })
  .strict();

export type GeneratedMechanicContract = z.infer<
  typeof generatedMechanicContractSchema
>;

export type BehaviorScenario = z.infer<typeof behaviorScenarioSchema>;

export type GeneratedMechanicContractValidationIssue = {
  path: string;
  code:
    | "above_maximum"
    | "below_minimum"
    | "complexity_limit"
    | "contradiction"
    | "duplicate_id"
    | "invalid_contract"
    | "invalid_type"
    | "invalid_value"
    | "non_json_value"
    | "unknown_reference"
    | "unknown_field";
  message: string;
};

export type GeneratedMechanicContractValidationResult =
  | {
      success: true;
      data: GeneratedMechanicContract;
    }
  | {
      success: false;
      evidence: {
        stage: "contract_validation";
        code: "invalid_generated_mechanic_contract";
        issues: GeneratedMechanicContractValidationIssue[];
      };
    };

export type GeneratedMechanicReferenceCatalog = Readonly<
  Record<string, readonly StableId[]>
>;

export type GeneratedMechanicResourceBudget = {
  profileId: StableId;
  maximumOwnedObjects: number;
  maximumOperationsPerTick: number;
  maximumScheduledCallbacks: number;
  maximumSubscriptions: number;
  maximumSignalsPerTick: number;
  maximumStateBytes: number;
  maximumCallbackMilliseconds: number;
  maximumConsecutiveFailures: number;
};

export type ValidateGeneratedMechanicContractInput = {
  input: unknown;
  constraintSet: GenerationConstraintSet;
  referenceCatalog: GeneratedMechanicReferenceCatalog;
  resourceBudget: GeneratedMechanicResourceBudget;
};

export function validateGeneratedMechanicContract({
  input,
  constraintSet,
  referenceCatalog,
  resourceBudget,
}: ValidateGeneratedMechanicContractInput): GeneratedMechanicContractValidationResult {
  const parsed = generatedMechanicContractSchema.safeParse(input);

  if (parsed.success) {
    const issues: GeneratedMechanicContractValidationIssue[] = [];
    addConfigDslConstraintIssues(
      issues,
      parsed.data.config,
      "config",
      constraintSet
    );
    parsed.data.ports.forEach((port, portIndex) => {
      addConfigDslConstraintIssues(
        issues,
        port.payload,
        `ports.${portIndex}.payload`,
        constraintSet
      );
    });
    addContractDeclarationIssues(
      issues,
      parsed.data,
      constraintSet,
      referenceCatalog,
      resourceBudget
    );
    addBehaviorScenarioReferenceIssues(
      issues,
      parsed.data,
      referenceCatalog
    );
    addBehaviorScenarioValueIssues(issues, parsed.data, referenceCatalog);
    addBehaviorScenarioLifecycleIssues(issues, parsed.data);

    if (issues.length > 0) {
      return createContractValidationFailure(issues);
    }

    return parsed;
  }

  const issues: GeneratedMechanicContractValidationIssue[] = [];

  for (const issue of parsed.error.issues) {
    const parentPath = issue.path.map(String);

    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        const path = [...parentPath, key].join(".");
        issues.push({
          path,
          code: "unknown_field",
          message: `Generated mechanic contract field "${path}" is not supported.`,
        });
      }
      continue;
    }

    const path = parentPath.join(".") || "<root>";
    const code = normalizeContractIssueCode(issue.code);
    issues.push({
      path,
      code,
      message: createContractIssueMessage(path, code),
    });
  }

  return createContractValidationFailure(issues);
}

function addConfigDslConstraintIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  value: MechanicConfigDslValue,
  path: string,
  constraintSet: GenerationConstraintSet
) {
  addConfigDslDepthIssues(
    issues,
    value,
    path,
    1,
    constraintSet.configDslComplexity.maximumDepth
  );
  const fieldCount = countConfigDslFields(value);
  const maximumFields = constraintSet.configDslComplexity.maximumFields;

  if (fieldCount > maximumFields) {
    issues.push({
      path,
      code: "complexity_limit",
      message:
        path === "config"
          ? `Config DSL uses ${fieldCount} fields, exceeding the active limit of ${maximumFields}.`
          : `Config DSL at "${path}" uses ${fieldCount} fields, exceeding the active limit of ${maximumFields}.`,
    });
  }
  addConfigDslCollectionLimitIssues(
    issues,
    value,
    path,
    constraintSet.configDslComplexity.maximumCollectionItems
  );
  addConfigDslSemanticIssues(issues, value, path);
}

function addConfigDslDepthIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  value: MechanicConfigDslValue,
  path: string,
  depth: number,
  maximumDepth: number
) {
  visitConfigDslDeclarations(value, path, ({ path: nodePath, depth: nodeDepth }) => {
    if (nodeDepth <= maximumDepth) {
      return;
    }
    issues.push({
      path: nodePath,
      code: "complexity_limit",
      message:
        nodePath.startsWith("config")
          ? `Config DSL nesting depth ${nodeDepth} exceeds the active limit of ${maximumDepth}.`
          : `Config DSL nesting depth ${nodeDepth} at "${nodePath}" exceeds the active limit of ${maximumDepth}.`,
    });
    return false;
  }, depth);
}

function countConfigDslFields(value: MechanicConfigDslValue): number {
  let count = 0;
  visitConfigDslDeclarations(value, "<count>", ({ value: node }) => {
    if (node.kind === "object") {
      count += node.fields.length;
    }
  });
  return count;
}

function addConfigDslCollectionLimitIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  value: MechanicConfigDslValue,
  path: string,
  maximumCollectionItems: number
) {
  visitConfigDslDeclarations(value, path, ({ value: node, path: nodePath }) => {
    if (node.kind === "enum" && node.values.length > maximumCollectionItems) {
      issues.push({
        path: `${nodePath}.values`,
        code: "complexity_limit",
        message: `Config DSL enum declares ${node.values.length} values, exceeding the active limit of ${maximumCollectionItems}.`,
      });
    }
    if (
      node.kind === "collection" &&
      node.maximumItems > maximumCollectionItems
    ) {
      issues.push({
        path: `${nodePath}.maximumItems`,
        code: "complexity_limit",
        message: `Config DSL collection maximum ${node.maximumItems} exceeds the active limit of ${maximumCollectionItems}.`,
      });
    }
  });
}

function addConfigDslSemanticIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  value: MechanicConfigDslValue,
  path: string
) {
  visitConfigDslDeclarations(value, path, ({ value: node, path: nodePath }) => {
  if (node.kind === "object") {
    const fieldKeys = new Set<string>();

    node.fields.forEach((field, index) => {
      if (fieldKeys.has(field.key)) {
        issues.push({
          path: `${nodePath}.fields.${index}.key`,
          code: "duplicate_id",
          message: `Config DSL field key "${field.key}" is duplicated.`,
        });
      }
      fieldKeys.add(field.key);
    });
    return;
  }

  if (node.kind === "collection") {
    if (node.maximumItems < node.minimumItems) {
      issues.push({
        path: `${nodePath}.maximumItems`,
        code: "contradiction",
        message: `Config DSL collection maximum ${node.maximumItems} is below its minimum ${node.minimumItems}.`,
      });
    }
    return;
  }

  if (node.kind === "enum") {
    const declaredValues = new Set<string>();

    node.values.forEach((enumValue, index) => {
      if (declaredValues.has(enumValue)) {
        issues.push({
          path: `${nodePath}.values.${index}`,
          code: "duplicate_id",
          message: `Config DSL enum value "${enumValue}" is duplicated.`,
        });
      }
      declaredValues.add(enumValue);
    });

    if (node.default !== undefined && !declaredValues.has(node.default)) {
      issues.push({
        path: `${nodePath}.default`,
        code: "invalid_value",
        message: `Config DSL enum default "${node.default}" is not one of its declared values.`,
      });
    }
    return;
  }

  if (node.kind === "number" || node.kind === "integer") {
    if (node.maximum < node.minimum) {
      issues.push({
        path: `${nodePath}.maximum`,
        code: "contradiction",
        message: `Config DSL maximum ${node.maximum} is below its minimum ${node.minimum}.`,
      });
    }

    if (node.default !== undefined && node.default < node.minimum) {
      issues.push({
        path: `${nodePath}.default`,
        code: "below_minimum",
        message: `Config DSL default ${node.default} is below the declared minimum ${node.minimum}.`,
      });
    } else if (node.default !== undefined && node.default > node.maximum) {
      issues.push({
        path: `${nodePath}.default`,
        code: "above_maximum",
        message: `Config DSL default ${node.default} is above the declared maximum ${node.maximum}.`,
      });
    }
    return;
  }

  if (node.kind === "string") {
    if (node.maximumLength < node.minimumLength) {
      issues.push({
        path: `${nodePath}.maximumLength`,
        code: "contradiction",
        message: `Config DSL maximum length ${node.maximumLength} is below its minimum length ${node.minimumLength}.`,
      });
    }

    if (
      node.default !== undefined &&
      node.default.length < node.minimumLength
    ) {
      issues.push({
        path: `${nodePath}.default`,
        code: "below_minimum",
        message: `Config DSL default length ${node.default.length} is below the declared minimum ${node.minimumLength}.`,
      });
    } else if (
      node.default !== undefined &&
      node.default.length > node.maximumLength
    ) {
      issues.push({
        path: `${nodePath}.default`,
        code: "above_maximum",
        message: `Config DSL default length ${node.default.length} is above the declared maximum ${node.maximumLength}.`,
      });
    }
  }
  });
}

type ConfigDslDeclarationVisit = {
  value: MechanicConfigDslValue;
  path: string;
  depth: number;
};

function visitConfigDslDeclarations(
  value: MechanicConfigDslValue,
  path: string,
  visitor: (visit: ConfigDslDeclarationVisit) => void | false,
  depth = 1
) {
  if (visitor({ value, path, depth }) === false) {
    return;
  }

  if (value.kind === "object") {
    value.fields.forEach((field, index) => {
      visitConfigDslDeclarations(
        field.value,
        `${path}.fields.${index}.value`,
        visitor,
        depth + 1
      );
    });
  } else if (value.kind === "collection") {
    visitConfigDslDeclarations(value.item, `${path}.item`, visitor, depth + 1);
  }
}

function addBehaviorScenarioReferenceIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  contract: GeneratedMechanicContract,
  referenceCatalog: GeneratedMechanicReferenceCatalog
) {
  const bindingIds = new Set(contract.bindings.map(({ id }) => id));
  const stateIds = new Set(contract.privateState.map(({ id }) => id));
  const archetypeIds = new Set(contract.ownedObjects.map(({ id }) => id));
  const inputPortIds = new Set(
    contract.ports
      .filter(({ direction }) => direction === "input")
      .map(({ id }) => id)
  );
  const outputPortIds = new Set(
    contract.ports
      .filter(({ direction }) => direction === "output")
      .map(({ id }) => id)
  );

  contract.scenarios.forEach((scenario, scenarioIndex) => {
    const scenarioPath = `scenarios.${scenarioIndex}`;

    scenario.setup.forEach((setup, setupIndex) => {
      if (setup.kind === "binding_present" && !bindingIds.has(setup.bindingId)) {
        addUnknownScenarioReferenceIssue(
          issues,
          `${scenarioPath}.setup.${setupIndex}.bindingId`,
          "binding",
          setup.bindingId,
          "declared binding"
        );
      }

      if (setup.kind === "state_equals" && !stateIds.has(setup.stateId)) {
        addUnknownScenarioReferenceIssue(
          issues,
          `${scenarioPath}.setup.${setupIndex}.stateId`,
          "state",
          setup.stateId,
          "declared private state field"
        );
      }
    });

    scenario.steps.forEach((step, stepIndex) => {
      if (step.kind === "receive_input" && !inputPortIds.has(step.portId)) {
        addUnknownScenarioReferenceIssue(
          issues,
          `${scenarioPath}.steps.${stepIndex}.portId`,
          "input",
          step.portId,
          "declared input port"
        );
      }

      if (
        step.kind === "dispatch_action" &&
        !referenceCatalogContains(referenceCatalog, "action", step.actionId)
      ) {
        issues.push({
          path: `${scenarioPath}.steps.${stepIndex}.actionId`,
          code: "unknown_reference",
          message: `Scenario action reference "${step.actionId}" is absent from the trusted "action" catalog.`,
        });
      }
    });

    scenario.observations.forEach((observation, observationIndex) => {
      const observationPath = `${scenarioPath}.observations.${observationIndex}`;

      if (
        observation.kind === "binding_property" &&
        !bindingIds.has(observation.bindingId)
      ) {
        addUnknownScenarioReferenceIssue(
          issues,
          `${observationPath}.bindingId`,
          "binding",
          observation.bindingId,
          "declared binding"
        );
      }

      if (
        observation.kind === "owned_object_count" &&
        !archetypeIds.has(observation.archetypeId)
      ) {
        addUnknownScenarioReferenceIssue(
          issues,
          `${observationPath}.archetypeId`,
          "archetype",
          observation.archetypeId,
          "declared owned object"
        );
      }

      if (
        observation.kind === "output_emitted" &&
        !outputPortIds.has(observation.portId)
      ) {
        addUnknownScenarioReferenceIssue(
          issues,
          `${observationPath}.portId`,
          "output",
          observation.portId,
          "declared output port"
        );
      }

      if (observation.kind === "state_equals" && !stateIds.has(observation.stateId)) {
        addUnknownScenarioReferenceIssue(
          issues,
          `${observationPath}.stateId`,
          "state",
          observation.stateId,
          "declared private state field"
        );
      }
    });
  });
}

function addContractDeclarationIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  contract: GeneratedMechanicContract,
  constraintSet: GenerationConstraintSet,
  referenceCatalog: GeneratedMechanicReferenceCatalog,
  resourceBudget: GeneratedMechanicResourceBudget
) {
  if (contract.capabilityVersion !== constraintSet.capabilityVersion) {
    issues.push({
      path: "capabilityVersion",
      code: "contradiction",
      message: `Contract capability version "${contract.capabilityVersion}" does not match the active version "${constraintSet.capabilityVersion}".`,
    });
  }

  const minimumBehaviorScenarios =
    constraintSet.evidenceRequirements.minimumBehaviorScenarios;
  if (contract.scenarios.length < minimumBehaviorScenarios) {
    issues.push({
      path: "scenarios",
      code: "below_minimum",
      message: `Contract provides ${contract.scenarios.length} behavior scenario${contract.scenarios.length === 1 ? "" : "s"}, below the active minimum of ${minimumBehaviorScenarios}.`,
    });
  }

  addDuplicateDeclarationIdIssues(issues, contract.bindings, "bindings", "binding");
  addDuplicateDeclarationIdIssues(
    issues,
    contract.ownedObjects,
    "ownedObjects",
    "owned object"
  );
  addDuplicateDeclarationIdIssues(
    issues,
    contract.privateState,
    "privateState",
    "private state"
  );
  addDuplicateDeclarationIdIssues(issues, contract.ports, "ports", "port");
  addDuplicateDeclarationIdIssues(
    issues,
    contract.scenarios,
    "scenarios",
    "scenario"
  );

  contract.bindings.forEach((binding, index) => {
    if (binding.cardinality === "one" && binding.objectIds.length !== 1) {
      issues.push({
        path: `bindings.${index}.objectIds`,
        code: "contradiction",
        message: `Binding "${binding.id}" declares cardinality "one" but references ${binding.objectIds.length} objects.`,
      });
    }

    if (!referenceCatalogHasKind(referenceCatalog, binding.referenceKind)) {
      issues.push({
        path: `bindings.${index}.referenceKind`,
        code: "unknown_reference",
        message: `Binding reference kind "${binding.referenceKind}" is absent from the trusted reference catalog.`,
      });
    } else {
      binding.objectIds.forEach((objectId, objectIndex) => {
        if (
          !referenceCatalogContains(
            referenceCatalog,
            binding.referenceKind,
            objectId
          )
        ) {
          issues.push({
            path: `bindings.${index}.objectIds.${objectIndex}`,
            code: "unknown_reference",
            message: `Binding object reference "${objectId}" is absent from the trusted "${binding.referenceKind}" catalog.`,
          });
        }
      });
    }
  });

  addConfigDslReferenceIssues(
    issues,
    contract.config,
    "config",
    referenceCatalog
  );
  contract.ports.forEach((port, portIndex) => {
    addConfigDslReferenceIssues(
      issues,
      port.payload,
      `ports.${portIndex}.payload`,
      referenceCatalog
    );
  });

  const capabilityIds = new Set<string>();
  contract.capabilities.forEach((capability, index) => {
    if (capabilityIds.has(capability)) {
      issues.push({
        path: `capabilities.${index}`,
        code: "duplicate_id",
        message: `Contract capability "${capability}" is duplicated.`,
      });
    }
    capabilityIds.add(capability);
  });

  const maximumOwnedObjects = contract.ownedObjects.reduce(
    (total, declaration) => total + declaration.maximumInstances,
    0
  );

  if (
    maximumOwnedObjects > contract.resourceExpectations.maximumOwnedObjects
  ) {
    issues.push({
      path: "resourceExpectations.maximumOwnedObjects",
      code: "contradiction",
      message: `Owned object declarations allow ${maximumOwnedObjects} instances, exceeding the contract expectation of ${contract.resourceExpectations.maximumOwnedObjects}.`,
    });
  }

  contract.privateState.forEach((state, index) => {
    if (!privateStateInitialValueMatchesType(state)) {
      issues.push({
        path: `privateState.${index}.initialValue`,
        code: "invalid_value",
        message: `Private state "${state.id}" initial value does not match declared type "${state.valueType}".`,
      });
    }
  });

  if (
    contract.privateState.length > 0 &&
    contract.resourceExpectations.maximumStateBytes === 0
  ) {
    issues.push({
      path: "resourceExpectations.maximumStateBytes",
      code: "contradiction",
      message: "Private state is declared but the contract expects zero state bytes.",
    });
  }

  addResourceBudgetIssues(issues, contract, constraintSet, resourceBudget);
}

function addConfigDslReferenceIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  value: MechanicConfigDslValue,
  path: string,
  referenceCatalog: GeneratedMechanicReferenceCatalog
) {
  visitConfigDslDeclarations(value, path, ({ value: node, path: nodePath }) => {
    if (node.kind !== "stable_id") {
      return;
    }

    if (!referenceCatalogHasKind(referenceCatalog, node.referenceKind)) {
      issues.push({
        path: `${nodePath}.referenceKind`,
        code: "unknown_reference",
        message: `Config DSL reference kind "${node.referenceKind}" is absent from the trusted reference catalog.`,
      });
      return;
    }

    if (
      node.default !== undefined &&
      !referenceCatalogContains(
        referenceCatalog,
        node.referenceKind,
        node.default
      )
    ) {
      issues.push({
        path: `${nodePath}.default`,
        code: "unknown_reference",
        message: `Config DSL stable ID "${node.default}" is absent from the trusted "${node.referenceKind}" catalog.`,
      });
    }
  });
}

const resourceExpectationFields = [
  "maximumOwnedObjects",
  "maximumOperationsPerTick",
  "maximumScheduledCallbacks",
  "maximumSubscriptions",
  "maximumSignalsPerTick",
  "maximumStateBytes",
  "maximumCallbackMilliseconds",
  "maximumConsecutiveFailures",
] as const;

function addResourceBudgetIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  contract: GeneratedMechanicContract,
  constraintSet: GenerationConstraintSet,
  resourceBudget: GeneratedMechanicResourceBudget
) {
  if (resourceBudget.profileId !== constraintSet.resourceBudgetProfile) {
    issues.push({
      path: "resourceExpectations",
      code: "contradiction",
      message: `Selected resource budget "${resourceBudget.profileId}" does not match the active profile "${constraintSet.resourceBudgetProfile}".`,
    });
    return;
  }

  resourceExpectationFields.forEach((field) => {
    if (contract.resourceExpectations[field] > resourceBudget[field]) {
      issues.push({
        path: `resourceExpectations.${field}`,
        code: "above_maximum",
        message: `Contract resource expectation ${field} exceeds the selected budget maximum of ${resourceBudget[field]}.`,
      });
    }
  });
}

function referenceCatalogContains(
  referenceCatalog: GeneratedMechanicReferenceCatalog,
  referenceKind: string,
  referenceId: string
) {
  return getReferenceCatalogEntry(referenceCatalog, referenceKind)?.includes(
    referenceId
  ) ?? false;
}

function referenceCatalogHasKind(
  referenceCatalog: GeneratedMechanicReferenceCatalog,
  referenceKind: string
) {
  return getReferenceCatalogEntry(referenceCatalog, referenceKind) !== undefined;
}

function getReferenceCatalogEntry(
  referenceCatalog: GeneratedMechanicReferenceCatalog,
  referenceKind: string
): readonly StableId[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(referenceCatalog, referenceKind)) {
    return undefined;
  }
  const entry = (referenceCatalog as Readonly<Record<string, unknown>>)[
    referenceKind
  ];
  return Array.isArray(entry) ? (entry as readonly StableId[]) : undefined;
}

function addBehaviorScenarioValueIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  contract: GeneratedMechanicContract,
  referenceCatalog: GeneratedMechanicReferenceCatalog
) {
  const statesById = new Map(contract.privateState.map((state) => [state.id, state]));
  const inputPortsById = new Map(
    contract.ports
      .filter(({ direction }) => direction === "input")
      .map((port) => [port.id, port])
  );
  const outputPortsById = new Map(
    contract.ports
      .filter(({ direction }) => direction === "output")
      .map((port) => [port.id, port])
  );

  contract.scenarios.forEach((scenario, scenarioIndex) => {
    scenario.setup.forEach((setup, setupIndex) => {
      if (setup.kind !== "state_equals") {
        return;
      }
      const state = statesById.get(setup.stateId);
      if (state && !privateStateValueMatchesType(state, setup.value)) {
        issues.push({
          path: `scenarios.${scenarioIndex}.setup.${setupIndex}.value`,
          code: "invalid_value",
          message: `Scenario state value does not match the declared type for "${setup.stateId}".`,
        });
      }
    });

    scenario.steps.forEach((step, stepIndex) => {
      if (step.kind !== "receive_input") {
        return;
      }
      const port = inputPortsById.get(step.portId);
      if (
        port &&
        !configDslValueMatches(port.payload, step.value, referenceCatalog)
      ) {
        issues.push({
          path: `scenarios.${scenarioIndex}.steps.${stepIndex}.value`,
          code: "invalid_value",
          message: `Scenario input value does not match the declared payload for port "${step.portId}".`,
        });
      }
    });

    scenario.observations.forEach((observation, observationIndex) => {
      if (observation.kind === "state_equals") {
        const state = statesById.get(observation.stateId);
        if (state && !privateStateValueMatchesType(state, observation.value)) {
          issues.push({
            path: `scenarios.${scenarioIndex}.observations.${observationIndex}.value`,
            code: "invalid_value",
            message: `Scenario state value does not match the declared type for "${observation.stateId}".`,
          });
        }
      }

      if (observation.kind === "output_emitted") {
        const port = outputPortsById.get(observation.portId);
        if (
          port &&
          !configDslValueMatches(
            port.payload,
            observation.value,
            referenceCatalog
          )
        ) {
          issues.push({
            path: `scenarios.${scenarioIndex}.observations.${observationIndex}.value`,
            code: "invalid_value",
            message: `Scenario output value does not match the declared payload for port "${observation.portId}".`,
          });
        }
      }
    });
  });
}

export function configDslValueMatches(
  declaration: MechanicConfigDslValue,
  value: unknown,
  referenceCatalog: GeneratedMechanicReferenceCatalog
): boolean {
  switch (declaration.kind) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= declaration.minimum &&
        value <= declaration.maximum
      );
    case "integer":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= declaration.minimum &&
        value <= declaration.maximum
      );
    case "string":
      return (
        typeof value === "string" &&
        value.length >= declaration.minimumLength &&
        value.length <= declaration.maximumLength
      );
    case "enum":
      return typeof value === "string" && declaration.values.includes(value);
    case "stable_id":
      return (
        typeof value === "string" &&
        stableIdSchema.safeParse(value).success &&
        referenceCatalogContains(
          referenceCatalog,
          declaration.referenceKind,
          value
        )
      );
    case "collection":
      return (
        Array.isArray(value) &&
        value.length >= declaration.minimumItems &&
        value.length <= declaration.maximumItems &&
        value.every((item) =>
          configDslValueMatches(declaration.item, item, referenceCatalog)
        )
      );
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      const record = value as Record<string, unknown>;
      const declaredFields = new Set(
        declaration.fields.map((field) => field.key)
      );
      if (Object.keys(record).some((key) => !declaredFields.has(key))) {
        return false;
      }
      return declaration.fields.every((field) => {
        if (!(field.key in record)) {
          return !field.required;
        }
        return configDslValueMatches(
          field.value,
          record[field.key],
          referenceCatalog
        );
      });
    }
  }
}

function privateStateInitialValueMatchesType(
  state: GeneratedMechanicContract["privateState"][number]
) {
  return privateStateValueMatchesType(state, state.initialValue);
}

function privateStateValueMatchesType(
  state: GeneratedMechanicContract["privateState"][number],
  value: unknown
) {
  switch (state.valueType) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "string":
      return typeof value === "string";
    case "stable_id":
      return stableIdSchema.safeParse(value).success;
  }
}

function addBehaviorScenarioLifecycleIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  contract: GeneratedMechanicContract
) {
  const callbacks = new Set(contract.lifecycle.callbacks);

  if (!callbacks.has("install")) {
    issues.push({
      path: "lifecycle.callbacks",
      code: "contradiction",
      message: 'Generated mechanics must declare the "install" lifecycle callback.',
    });
  }

  contract.scenarios.forEach((scenario, scenarioIndex) => {
    scenario.steps.forEach((step, stepIndex) => {
      const path = `scenarios.${scenarioIndex}.steps.${stepIndex}.kind`;

      if (step.kind === "receive_input" && !callbacks.has("gameplay_event")) {
        issues.push({
          path,
          code: "contradiction",
          message:
            'Scenario input delivery requires lifecycle callback "gameplay_event".',
        });
      }

      if (step.kind === "dispatch_action" && !callbacks.has("logical_action")) {
        issues.push({
          path,
          code: "contradiction",
          message:
            'Scenario action dispatch requires lifecycle callback "logical_action".',
        });
      }

      if (
        step.kind === "advance_time" &&
        !callbacks.has("scheduled") &&
        !contract.lifecycle.fixedStep
      ) {
        issues.push({
          path,
          code: "contradiction",
          message:
            'Scenario time advancement requires lifecycle callback "scheduled" or fixed-step updates.',
        });
      }
    });
  });
}

function addDuplicateDeclarationIdIssues(
  issues: GeneratedMechanicContractValidationIssue[],
  declarations: readonly { id: string }[],
  path: string,
  label: string
) {
  const ids = new Set<string>();

  declarations.forEach((declaration, index) => {
    if (ids.has(declaration.id)) {
      issues.push({
        path: `${path}.${index}.id`,
        code: "duplicate_id",
        message: `Contract ${label} ID "${declaration.id}" is duplicated.`,
      });
    }
    ids.add(declaration.id);
  });
}

function addUnknownScenarioReferenceIssue(
  issues: GeneratedMechanicContractValidationIssue[],
  path: string,
  referenceLabel: string,
  referenceId: string,
  expectedLabel: string
) {
  issues.push({
    path,
    code: "unknown_reference",
    message: `Scenario ${referenceLabel} reference "${referenceId}" does not match a ${expectedLabel}.`,
  });
}

function createContractValidationFailure(
  issues: GeneratedMechanicContractValidationIssue[]
): GeneratedMechanicContractValidationResult {
  issues.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );

  return {
    success: false,
    evidence: {
      stage: "contract_validation",
      code: "invalid_generated_mechanic_contract",
      issues,
    },
  };
}

function normalizeContractIssueCode(
  code: z.core.$ZodIssue["code"]
): GeneratedMechanicContractValidationIssue["code"] {
  switch (code) {
    case "too_small":
      return "below_minimum";
    case "too_big":
      return "above_maximum";
    case "invalid_type":
      return "invalid_type";
    case "invalid_value":
      return "invalid_value";
    case "custom":
      return "non_json_value";
    default:
      return "invalid_contract";
  }
}

function createContractIssueMessage(
  path: string,
  code: GeneratedMechanicContractValidationIssue["code"]
) {
  switch (code) {
    case "below_minimum":
      return `Generated mechanic contract field "${path}" is below its minimum.`;
    case "above_maximum":
      return `Generated mechanic contract field "${path}" is above its maximum.`;
    case "invalid_type":
      return `Generated mechanic contract field "${path}" has the wrong type.`;
    case "invalid_value":
      return `Generated mechanic contract field "${path}" has an unsupported value.`;
    case "non_json_value":
      return `Generated mechanic contract field "${path}" must contain only JSON-safe values.`;
    default:
      return `Generated mechanic contract field "${path}" is invalid.`;
  }
}
