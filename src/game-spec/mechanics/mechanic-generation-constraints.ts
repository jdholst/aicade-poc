import { z } from "zod";

import { stableIdSchema } from "../game-spec-schema";
import {
  MECHANIC_CAPABILITY_VERSION,
  mechanicCapabilityRegistry,
} from "./mechanic-capability-registry";

export const GENERATION_CONSTRAINT_SET_SCHEMA_VERSION =
  "generation-constraint-set/v1";

const positiveIntegerSchema = z.number().int().positive();
const repairAttemptLimitSchema = z.number().int().nonnegative();

export const generationConstraintSetSchema = z
  .object({
    schemaVersion: z.literal(GENERATION_CONSTRAINT_SET_SCHEMA_VERSION),
    id: stableIdSchema,
    maximumGeneratedMechanicsPerRun: positiveIntegerSchema,
    capabilityVersion: z.string().min(1).max(80),
    admittedCapabilities: z.array(stableIdSchema).min(1),
    resourceBudgetProfile: stableIdSchema,
    configDslComplexity: z
      .object({
        maximumDepth: positiveIntegerSchema,
        maximumFields: positiveIntegerSchema,
        maximumCollectionItems: positiveIntegerSchema,
      })
      .strict(),
    evidenceRequirements: z
      .object({
        minimumBehaviorScenarios: positiveIntegerSchema,
        minimumExternalAcceptanceObservations: positiveIntegerSchema,
      })
      .strict(),
    maximumRepairAttempts: z
      .object({
        contract: repairAttemptLimitSchema,
        source: repairAttemptLimitSchema,
        finalGameSpec: repairAttemptLimitSchema,
      })
      .strict(),
  })
  .strict();

export type GenerationConstraintSet = z.infer<
  typeof generationConstraintSetSchema
>;

export type GenerationConstraintValidationIssue = {
  path: string;
  code:
    | "above_maximum"
    | "below_minimum"
    | "invalid_constraint"
    | "invalid_type"
    | "invalid_value"
    | "unknown_field";
  message: string;
};

export type GenerationConstraintParseResult =
  | {
      success: true;
      data: GenerationConstraintSet;
    }
  | {
      success: false;
      evidence: {
        stage: "constraint_parsing";
        code: "invalid_generation_constraint_set";
        issues: GenerationConstraintValidationIssue[];
      };
    };

export const PHASE_9_GENERATION_CONSTRAINT_SET =
  generationConstraintSetSchema.parse({
    schemaVersion: GENERATION_CONSTRAINT_SET_SCHEMA_VERSION,
    id: "phase_9_generation_constraints",
    maximumGeneratedMechanicsPerRun: 1,
    capabilityVersion: MECHANIC_CAPABILITY_VERSION,
    admittedCapabilities: mechanicCapabilityRegistry.capabilities.map(
      (capability) => capability.id
    ),
    resourceBudgetProfile: "phase_9_fixed_budget",
    configDslComplexity: {
      maximumDepth: 4,
      maximumFields: 32,
      maximumCollectionItems: 32,
    },
    evidenceRequirements: {
      minimumBehaviorScenarios: 1,
      minimumExternalAcceptanceObservations: 1,
    },
    maximumRepairAttempts: {
      contract: 3,
      source: 3,
      finalGameSpec: 3,
    },
  });

export function parseGenerationConstraintSet(
  input: unknown
): GenerationConstraintParseResult {
  const parsed = generationConstraintSetSchema.safeParse(input);

  if (parsed.success) {
    return parsed;
  }

  const issues: GenerationConstraintValidationIssue[] = [];

  for (const issue of parsed.error.issues) {
    const parentPath = issue.path.map(String);

    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        const path = [...parentPath, key].join(".");
        issues.push({
          path,
          code: "unknown_field",
          message: `Generation constraint field "${path}" is not supported.`,
        });
      }
      continue;
    }

    const path = parentPath.join(".") || "<root>";
    const code = normalizeConstraintIssueCode(issue.code);
    issues.push({
      path,
      code,
      message: createConstraintIssueMessage(path, code),
    });
  }

  issues.sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );

  return {
    success: false,
    evidence: {
      stage: "constraint_parsing",
      code: "invalid_generation_constraint_set",
      issues,
    },
  };
}

function normalizeConstraintIssueCode(
  code: z.core.$ZodIssue["code"]
): GenerationConstraintValidationIssue["code"] {
  switch (code) {
    case "too_small":
      return "below_minimum";
    case "too_big":
      return "above_maximum";
    case "invalid_type":
      return "invalid_type";
    case "invalid_value":
      return "invalid_value";
    default:
      return "invalid_constraint";
  }
}

function createConstraintIssueMessage(
  path: string,
  code: GenerationConstraintValidationIssue["code"]
) {
  switch (code) {
    case "below_minimum":
      return `Generation constraint field "${path}" is below its minimum.`;
    case "above_maximum":
      return `Generation constraint field "${path}" is above its maximum.`;
    case "invalid_type":
      return `Generation constraint field "${path}" has the wrong type.`;
    case "invalid_value":
      return `Generation constraint field "${path}" has an unsupported value.`;
    default:
      return `Generation constraint field "${path}" is invalid.`;
  }
}
