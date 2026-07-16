import { ruleStep } from "./evidence";
import {
  CEO_PRESIDENT_TARGETS,
  DEPARTMENT_WEIGHT,
  HARD_EXCLUDE_FUNCTIONS,
  PRIMARY_TARGET_LABELS,
  SENIORITY_MATRIX,
  TITLE_PRIORITY,
} from "./persona-tables";
import type {
  CompanySizeBand,
  DepartmentWeight,
  HardExcludeRuleId,
  ParsedLeadFeatures,
  ScoringInputs,
  SoftExcludeOutput,
  TitlePriorityOutput,
} from "./types";

function isCeoOrPresident(features: ParsedLeadFeatures): boolean {
  return (CEO_PRESIDENT_TARGETS as readonly string[]).includes(features.primary_target);
}

/**
 * Role- and position-based hard exclusions: not-employed (Advisor/Consultant),
 * assistants/support, excluded departments (HR/Finance/Engineering/CS/Product/
 * Legal), and CEO/President at Mid-Market & Enterprise ("too far removed from
 * outbound execution"). CEO/President is decided from the LLM's `primary_target`
 * vocab (`ceo` | `owner_president`) — never by regex or blanket `cLevel`.
 */
export function evaluateHardExclude(
  features: ParsedLeadFeatures,
  band: CompanySizeBand,
): {
  output: ScoringInputs["hard_exclude"];
  rule_id: HardExcludeRuleId;
  rationale: string;
} {
  if (!features.is_employed) {
    return {
      output: { excluded: true, reason: "not employed (retired/advisor/consultant)" },
      rule_id: "persona.hard_exclude.not_employed",
      rationale: "Retired, advisor, or consultant roles have no buying power",
    };
  }

  if (features.is_assistant_or_support) {
    return {
      output: { excluded: true, reason: "assistant/support role" },
      rule_id: "persona.hard_exclude.support",
      rationale: "Assistant or support staff are not decision-makers",
    };
  }

  if (HARD_EXCLUDE_FUNCTIONS.includes(features.function)) {
    return {
      output: {
        excluded: true,
        reason: `wrong department: ${features.function}`,
      },
      rule_id: "persona.hard_exclude.function",
      rationale: `Hard exclusion: ${features.function} department`,
    };
  }

  if (band === "enterprise" && isCeoOrPresident(features)) {
    return {
      output: {
        excluded: true,
        reason: "CEO/President too far removed at enterprise",
      },
      rule_id: "persona.hard_exclude.ceo_enterprise",
      rationale: "CEOs at enterprise companies do not own outbound execution",
    };
  }

  if (band === "midMarket" && isCeoOrPresident(features)) {
    return {
      output: {
        excluded: true,
        reason: "CEO/President too far removed at mid-market",
      },
      rule_id: "persona.hard_exclude.ceo_midmarket",
      rationale: "CEOs at mid-market companies are hard excluded per persona",
    };
  }

  return {
    output: { excluded: false },
    rule_id: "persona.hard_exclude.function",
    rationale: "No hard exclusion rules matched",
  };
}

/**
 * Soft exclusions from the persona spec. Driven solely by the LLM-emitted
 * `soft_exclude_role` controlled vocabulary — no title regex, no function→priority
 * inventing. Champions may still be kept for multi-threading (handled in scorer).
 */
export function evaluateSoftExclude(features: ParsedLeadFeatures): SoftExcludeOutput {
  const role = features.soft_exclude_role;
  if (role === "none") return { applied: false };

  const reasons = {
    bdr_sdr: "BDR/SDR — not a decision-maker; may feel threatened",
    account_executive: "Account Executive — closer, not outbound owner",
    cmo_vp_marketing: "CMO/VP Marketing — rarely owns outbound directly",
    board_advisor: "Board Member/Advisor — too removed from operations",
  } as const;

  return {
    applied: true,
    role,
    reason: reasons[role],
  };
}

/**
 * Looks up the LLM-emitted `primary_target` in the band's TITLE_PRIORITY table.
 * Pure table lookup — no function-based fallbacks, no champion priority inventing.
 */
export function evaluateTitlePriority(
  features: ParsedLeadFeatures,
  band: CompanySizeBand,
): TitlePriorityOutput {
  const target = features.primary_target;
  if (target !== "none") {
    const priority = TITLE_PRIORITY[band][target];
    if (priority != null) {
      return { priority, matched_target: target };
    }
  }

  return { priority: 1, matched_target: null };
}

/**
 * Resolves department relevance (persona spec "Department Priority"). Executive
 * is size-dependent: "5/5 → 1/5, only relevant at startups".
 */
export function resolveDepartmentWeight(
  function_: ParsedLeadFeatures["function"],
  band: CompanySizeBand,
): DepartmentWeight {
  if (function_ === "executive") return band === "startup" ? 5 : 1;
  return DEPARTMENT_WEIGHT[function_];
}

export function buildRuleOutputs(
  features: ParsedLeadFeatures,
  band: CompanySizeBand,
): ScoringInputs {
  const hard = evaluateHardExclude(features, band);
  const champion_penalty =
    features.is_champion_only && !features.is_decision_maker ? 2 : 0;
  const low_confidence_penalty = features.parse_confidence < 0.5;

  return {
    hard_exclude: hard.output,
    soft_exclude: evaluateSoftExclude(features),
    title_priority: evaluateTitlePriority(features, band),
    seniority_matrix: {
      relevance: SENIORITY_MATRIX[features.seniority][band],
    },
    champion_penalty,
    low_confidence_penalty,
    department_weight: resolveDepartmentWeight(features.function, band),
  };
}

export function createHardExcludeStep(
  features: ParsedLeadFeatures,
  band: CompanySizeBand,
) {
  const result = evaluateHardExclude(features, band);
  return ruleStep("rule.hard_exclude", {
    rule_id: result.rule_id,
    inputs: { features, band },
    outputs: result.output,
    rationale: result.rationale,
  });
}

export function createSoftExcludeStep(features: ParsedLeadFeatures) {
  const output = evaluateSoftExclude(features);
  const rationale = output.applied
    ? `Soft exclusion: ${output.reason}`
    : "No soft exclusion roles matched";
  return ruleStep("rule.soft_exclude", {
    inputs: { features },
    outputs: output,
    rationale,
  });
}

export function createTitlePriorityStep(
  features: ParsedLeadFeatures,
  band: CompanySizeBand,
) {
  const output = evaluateTitlePriority(features, band);
  const rationale = output.matched_target
    ? `Matched target "${PRIMARY_TARGET_LABELS[output.matched_target]}" with priority ${output.priority}/5`
    : "No primary title target matched; default priority 1/5";
  return ruleStep("rule.title_priority", {
    inputs: { features, band },
    outputs: output,
    rationale,
  });
}

export function createSeniorityMatrixStep(
  features: ParsedLeadFeatures,
  band: CompanySizeBand,
) {
  const relevance = SENIORITY_MATRIX[features.seniority][band];
  return ruleStep("rule.seniority_matrix", {
    inputs: { seniority: features.seniority, band },
    outputs: { relevance },
    rationale: `Seniority ${features.seniority} at ${band} → relevance ${relevance}/5`,
  });
}
