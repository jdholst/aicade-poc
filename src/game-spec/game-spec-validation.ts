import {
  parseTopDownGameSpec,
  type TopDownGameSpec,
} from "./top-down-spec-schema";
import { getTopDownGameSpecValidationIssues } from "./validation/top-down-semantic-validation";
import { GameSpecValidationError } from "./validation/validation-issue";

export { getTopDownGameSpecValidationIssues };
export {
  GameSpecValidationError,
  type GameSpecValidationIssue,
} from "./validation/validation-issue";

export function validateTopDownGameSpec(input: unknown): TopDownGameSpec {
  const spec = parseTopDownGameSpec(input);
  const issues = getTopDownGameSpecValidationIssues(spec);

  if (issues.length > 0) {
    throw new GameSpecValidationError(issues);
  }

  return spec;
}
