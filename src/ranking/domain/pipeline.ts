import {
  appendParseLead,
  appendRuleStep,
  appendScoreFinal,
  appendSizeBand,
  injectParsed,
  ingest,
  type EvalChain,
} from "./evidence";
import { createSizeBandStep } from "./bands";
import {
  buildRuleOutputs,
  createHardExcludeStep,
  createSeniorityMatrixStep,
  createSoftExcludeStep,
  createTitlePriorityStep,
} from "./rules";
import { createScoreFinalStep } from "./scorer";
import { buildReasoningSteps, renderReasoning } from "./reasoning";
import { verdictScore } from "./total";
import type { LeadEvaluation, RuleTestCase } from "./types";
import type { ModelEvidence } from "./evidence";
import type { Lead, RankingResult } from "@/types";

function applyRules(
  chain: EvalChain<"sized">,
): EvalChain<"sized"> {
  const { features, band } = chain.data;
  const rule_outputs = buildRuleOutputs(features, band);

  let current = chain;
  const steps = [
    createHardExcludeStep(features, band),
    createSoftExcludeStep(features),
    createTitlePriorityStep(features, band),
    createSeniorityMatrixStep(features, band),
  ];

  for (const step of steps) {
    current = appendRuleStep(current, step, rule_outputs);
  }

  return { ...current, data: { ...current.data, rule_outputs } };
}

export function scoreLeadFromParsed(
  lead: Lead,
  parseStep: ModelEvidence<"parse.lead">,
): LeadEvaluation {
  const chain = appendParseLead(ingest(lead), parseStep);
  const sized = appendSizeBand(chain, createSizeBandStep(lead.employee_range));
  const ruled = applyRules(sized);
  const { step: finalStep, verdict } = createScoreFinalStep(ruled.data.rule_outputs);
  const scored = appendScoreFinal(ruled, finalStep, verdict);

  return {
    lead_id: lead.id,
    chain: scored,
    reasoning: renderReasoning(scored),
  };
}

export function scoreLeadFromFixture(
  lead: Lead,
  fixture: RuleTestCase,
): LeadEvaluation {
  const chain = injectParsed(ingest(lead), fixture.features);
  const sized = appendSizeBand(
    chain,
    createSizeBandStep(fixture.employee_range ?? lead.employee_range),
  );
  const ruled = applyRules(sized);
  const { step: finalStep, verdict } = createScoreFinalStep(ruled.data.rule_outputs);
  const scored = appendScoreFinal(ruled, finalStep, verdict);

  return {
    lead_id: lead.id,
    chain: scored,
    reasoning: renderReasoning(scored),
  };
}

export function toRankingResult(eval_: LeadEvaluation): RankingResult {
  const { verdict } = eval_.chain.data;
  return {
    lead_id: eval_.lead_id,
    relevant: verdict.kind === "relevant",
    score: verdictScore(verdict),
    reasoning: eval_.reasoning,
    steps: buildReasoningSteps(eval_.chain),
  };
}
