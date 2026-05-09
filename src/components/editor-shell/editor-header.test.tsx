import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GeneratedGameStatus } from "@/hooks/use-editor-session";
import type { StarterProjectLoadState } from "@/hooks/use-starter-project-generation";

import { EditorHeader } from "./editor-header";

const waitingStatus: GeneratedGameStatus = {
  state: "loading",
  message: "Waiting for generated module...",
};

describe("EditorHeader", () => {
  it("shows the runtime status when generation has not failed", () => {
    render(
      <EditorHeader
        projectName="Starter Project"
        gameStatus={waitingStatus}
        loadState={{ status: "loading" }}
      />
    );

    expect(screen.getByText("Waiting for generated module...")).toBeVisible();
  });

  it("shows generation errors instead of stale runtime waiting status", () => {
    const loadState: StarterProjectLoadState = {
      status: "error",
      message: 'No OpenAI API key is configured for keyword "Red".',
    };

    render(
      <EditorHeader
        projectName="Starter Project"
        gameStatus={waitingStatus}
        loadState={loadState}
      />
    );

    expect(
      screen.getByText("An error has occurred.")
    ).toBeVisible();
    expect(
      screen.queryByText("Waiting for generated module...")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('No OpenAI API key is configured for keyword "Red".')
    ).not.toBeInTheDocument();
  });
});
