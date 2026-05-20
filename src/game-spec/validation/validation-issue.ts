export type GameSpecValidationIssue = {
  path: string;
  message: string;
};

export class GameSpecValidationError extends Error {
  constructor(public readonly issues: GameSpecValidationIssue[]) {
    super(
      `Game Spec validation failed: ${issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join(" ")}`
    );
    this.name = "GameSpecValidationError";
  }
}
