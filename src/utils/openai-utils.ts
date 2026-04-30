import { OPENAI_MODEL_OPTIONS } from "@/constants";

export type OpenAIModelId = (typeof OPENAI_MODEL_OPTIONS)[number]["id"];

export function isOpenAIModelId(value: string): value is OpenAIModelId {
  return OPENAI_MODEL_OPTIONS.some((model) => model.id === value);
}
