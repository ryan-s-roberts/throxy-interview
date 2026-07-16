import type { EvalChain } from "../domain/evidence";
import { findStep } from "../domain/evidence";
import { renderReasoning } from "../domain/reasoning";

function formatValue(value: unknown): string {
  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatStep(step: ReturnType<typeof findStep>): string[] {
  if (!step) return [];
  const lines: string[] = [];
  const header = `── ${step.step_id} ${"─".repeat(Math.max(0, 40 - step.step_id.length))}`;
  lines.push(header);

  if (step.source === "model") {
    lines.push(`  conf: ${step.confidence}`);
  }
  if (step.source === "rule") {
    lines.push(`  rule: ${step.rule_id}`);
    lines.push(`  ref:  ${step.spec_ref}`);
  }

  lines.push(`  in:  ${formatValue(step.inputs)}`);
  lines.push(`  out: ${formatValue(step.outputs)}`);
  lines.push(`  » ${step.rationale}`);
  return lines;
}

export function serializeEvidenceChain(
  chain: EvalChain<"scored">,
  fixture?: { id: string; description: string; features?: unknown },
): string {
  const lines: string[] = [];

  if (fixture) {
    lines.push(`# case: ${fixture.id}`);
    lines.push(`# ${fixture.description}`);
    lines.push(`# band: ${chain.data.band}`);
    lines.push("");
  }

  if (fixture?.features) {
    lines.push("── parse.lead [SKIPPED IN FIXTURE] ──────────────────────────");
    for (const [key, value] of Object.entries(fixture.features as Record<string, unknown>)) {
      lines.push(`  ${key}: ${formatValue(value)}`);
    }
    lines.push("");
  } else {
    const parse = findStep(chain, "parse.lead");
    lines.push(...formatStep(parse));
    lines.push("");
  }

  for (const step_id of [
    "lookup.size_band",
    "rule.hard_exclude",
    "rule.soft_exclude",
    "rule.title_priority",
    "rule.seniority_matrix",
    "score.final",
  ] as const) {
    const step = findStep(chain, step_id);
    if (step) {
      lines.push(...formatStep(step));
      lines.push("");
    }
  }

  lines.push("── reasoning ─────────────────────────────────────────────────");
  lines.push(`  ${renderReasoning(chain)}`);

  return lines.join("\n");
}

export { findStep } from "../domain/evidence";
