import { ruleStep, type RuleEvidence } from "./evidence";
import { mkScore } from "./total";
import type { ScoringInputs, Verdict } from "./types";

/**
 * Composite scoring. Returns a {@link Verdict} ADT (never a sentinel score) plus
 * the human rationale recorded on the `score.final` evidence step.
 *
 * The composite is `derived` from the weighted sub-scores; the spec prescribes
 * no combination formula, so the weights (title ×5, seniority ×3, department ×1)
 * are an explicit modelling choice.
 */
export function computeVerdict(rule_outputs: ScoringInputs): {
  verdict: Verdict;
  rationale: string;
} {
  if (rule_outputs.hard_exclude.excluded) {
    const detail = rule_outputs.hard_exclude.reason;
    return {
      verdict: { kind: "excluded", reason: { kind: "hardExclude", detail } },
      rationale: `Hard excluded: ${detail}`,
    };
  }

  const belowThreshold = (detail: string) =>
    ({
      verdict: { kind: "excluded", reason: { kind: "belowThreshold", detail } },
      rationale: detail,
    }) as const;

  // Soft exclusions deprioritize primary outreach. Champions may still be kept
  // for multi-threading (persona "Champions").
  const isChampion = rule_outputs.champion_penalty > 0;
  if (rule_outputs.soft_exclude.applied && !isChampion) {
    return belowThreshold(`Soft exclusion: ${rule_outputs.soft_exclude.reason}`);
  }

  if (
    rule_outputs.low_confidence_penalty &&
    rule_outputs.title_priority.priority <= 2
  ) {
    return belowThreshold(
      "Low parse confidence with weak title match — conservative exclude",
    );
  }

  const title = rule_outputs.title_priority.priority;
  const seniority = rule_outputs.seniority_matrix.relevance;
  const deptNorm = rule_outputs.department_weight / 5;

  const seniorityNorm = seniority / 5;
  const titleNorm = title / 5;

  let raw =
    titleNorm * 5 + seniorityNorm * 3 + deptNorm * 1 - rule_outputs.champion_penalty;

  if (rule_outputs.low_confidence_penalty) {
    raw -= 2;
  }

  if (title <= 1 && seniority <= 1 && !isChampion) {
    return belowThreshold("Title priority and seniority both too low for outreach");
  }

  if (
    !rule_outputs.title_priority.matched_target &&
    title <= 2 &&
    seniority <= 2 &&
    !isChampion
  ) {
    return belowThreshold("No matched persona target and weak seniority");
  }

  const relevant =
    raw >= 3 || title >= 3 || seniority >= 3 || isChampion;
  if (!relevant) {
    return belowThreshold("Composite score below relevance threshold");
  }

  return {
    verdict: { kind: "relevant", score: mkScore(raw) },
    rationale: `Composite: title=${title}/5 (×5), seniority=${seniority}/5 (×3), dept=${rule_outputs.department_weight}/5 (×1)`,
  };
}

/**
 * Builds the `score.final` evidence step and returns the {@link Verdict} that
 * seeds the `scored` state. The step's flat `{ relevant, score }` output is a
 * lossy projection of the verdict, kept for the human-readable evidence trail.
 */
export function createScoreFinalStep(rule_outputs: ScoringInputs): {
  step: RuleEvidence<"score.final">;
  verdict: Verdict;
} {
  const { verdict, rationale } = computeVerdict(rule_outputs);
  const step = ruleStep("score.final", {
    inputs: { rule_outputs },
    outputs: {
      relevant: verdict.kind === "relevant",
      score: verdict.kind === "relevant" ? verdict.score : 0,
    },
    rationale,
  });
  return { step, verdict };
}
