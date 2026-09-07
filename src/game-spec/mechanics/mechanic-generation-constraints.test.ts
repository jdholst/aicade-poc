import { describe, expect, it } from "vitest";

import {
  parseGenerationConstraintSet,
  PHASE_9_GENERATION_CONSTRAINT_SET,
} from "..";

describe("parseGenerationConstraintSet", () => {
  it("parses the versioned Phase 9 constraint set", () => {
    expect(parseGenerationConstraintSet(PHASE_9_GENERATION_CONSTRAINT_SET)).toEqual(
      {
        success: true,
        data: PHASE_9_GENERATION_CONSTRAINT_SET,
      }
    );
  });

  it("returns deterministic normalized diagnostics for invalid constraints", () => {
    const invalidConstraintSet = {
      ...PHASE_9_GENERATION_CONSTRAINT_SET,
      maximumGeneratedMechanicsPerRun: 0,
      unsupportedSetting: true,
    };
    const expected = {
      success: false,
      evidence: {
        stage: "constraint_parsing",
        code: "invalid_generation_constraint_set",
        issues: [
          {
            path: "maximumGeneratedMechanicsPerRun",
            code: "below_minimum",
            message:
              'Generation constraint field "maximumGeneratedMechanicsPerRun" is below its minimum.',
          },
          {
            path: "unsupportedSetting",
            code: "unknown_field",
            message:
              'Generation constraint field "unsupportedSetting" is not supported.',
          },
        ],
      },
    };

    expect(parseGenerationConstraintSet(invalidConstraintSet)).toEqual(expected);
    expect(parseGenerationConstraintSet(invalidConstraintSet)).toEqual(expected);
  });
});
