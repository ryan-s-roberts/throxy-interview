import { assertLlmEnvConfigured } from "@/ranking/llm/llm-env";

export async function register() {
  assertLlmEnvConfigured();
}
