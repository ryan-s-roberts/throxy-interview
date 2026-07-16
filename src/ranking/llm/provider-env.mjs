/**
 * Single source of truth for the environment variables that satisfy the LLM
 * provider requirement, in priority order. Consumed by both the TypeScript
 * runtime (`llm-env.ts`) and the plain-Node startup gate
 * (`scripts/check-llm-env.mjs`), so the policy cannot drift between them.
 */
export const PROVIDER_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "OPENAPI_KEY",
  "ANTHROPIC_API_KEY",
];
