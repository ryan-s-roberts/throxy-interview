import { createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { PROVIDER_ENV_VARS } from "./provider-env.mjs";

export class LlmEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmEnvError";
  }
}

function resolveOpenAiKey(): string | undefined {
  return process.env.OPENAI_API_KEY ?? process.env.OPENAPI_KEY;
}

function isLlmEnvConfigured(): boolean {
  return PROVIDER_ENV_VARS.some((name) => Boolean(process.env[name]));
}

export function assertLlmEnvConfigured(): void {
  if (isLlmEnvConfigured()) return;

  throw new LlmEnvError(
    `LLM provider not configured. Set one of ${PROVIDER_ENV_VARS.join(", ")} in .env.local before starting the server.`,
  );
}

export function getLlmModel(): LanguageModel {
  assertLlmEnvConfigured();

  if (process.env.OPENROUTER_API_KEY) {
    const openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    const modelId = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
    return openrouter(modelId);
  }

  const openAiKey = resolveOpenAiKey();
  if (openAiKey) {
    // Pass the key explicitly rather than mutating process.env.
    const openai = createOpenAI({ apiKey: openAiKey });
    return openai("gpt-4o-mini");
  }

  return anthropic("claude-3-5-haiku-latest");
}
