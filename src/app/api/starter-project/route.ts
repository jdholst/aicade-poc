import { NextResponse } from "next/server";

import { DEFAULT_STARTER_PROMPT } from "@/constants";
import {
  generateStarterGame,
  resolveOpenAiGenerationConfig,
} from "@/service/starter-project";

export const runtime = "nodejs";

type StarterProjectRequestBody = {
  enteredPrompt?: unknown;
  openAiApiKey?: unknown;
  openAiKeyword?: unknown;
  openAiModel?: unknown;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Generated game creation failed for an unknown reason.";
}

function normalizeUserPrompt(prompt: unknown) {
  if (typeof prompt !== "string") {
    return DEFAULT_STARTER_PROMPT;
  }

  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return DEFAULT_STARTER_PROMPT;
  }

  return normalized.slice(0, 320);
}

function jsonNoStore(payload: unknown, status?: number) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const requestBody = (await request
    .json()
    .catch(() => undefined)) as StarterProjectRequestBody | undefined;
  const userPrompt = normalizeUserPrompt(requestBody?.enteredPrompt);
  const openAiConfigResult = resolveOpenAiGenerationConfig(
    {
      openAiApiKey: requestBody?.openAiApiKey,
      openAiKeyword: requestBody?.openAiKeyword,
      openAiModel: requestBody?.openAiModel,
    },
    process.env
  );

  if (!openAiConfigResult.ok) {
    return jsonNoStore(
      {
        error: openAiConfigResult.error,
      },
      openAiConfigResult.status
    );
  }

  try {
    const generatedGamePack = await generateStarterGame({
      prompt: userPrompt,
      openAiApiKey: openAiConfigResult.config.apiKey,
      openAiModel: openAiConfigResult.config.model,
    });

    return jsonNoStore(generatedGamePack);
  } catch (error) {
    console.error("starter-project route failed", error);

    return jsonNoStore(
      {
        error: getErrorMessage(error),
      },
      500
    );
  }
}
