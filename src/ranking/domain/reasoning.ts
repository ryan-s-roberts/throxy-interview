import type { EvalChain } from "./evidence";
import { findStep } from "./evidence";
import { PRIMARY_TARGET_LABELS } from "./persona-tables";
import type { CompanyKind, CompanySizeBand, Department, Seniority } from "./types";
import type { ReasoningStep } from "@/types";

const BAND_ADJECTIVES: Record<CompanySizeBand, string> = {
  startup: "startup",
  smb: "SMB",
  midMarket: "mid-market",
  enterprise: "enterprise",
  unknown: "",
};

const SENIORITY_LABELS: Record<Seniority, string> = {
  founder: "Founder",
  cLevel: "C-level executive",
  vp: "VP",
  director: "Director",
  manager: "Manager",
  ic: "Individual contributor",
  unknown: "Contact",
};

const FUNCTION_PHRASES: Record<Department, string> = {
  salesDev: "sales development",
  sales: "sales",
  revOps: "revenue operations",
  bizDev: "business development",
  gtm: "go-to-market",
  executive: "executive leadership",
  marketing: "marketing",
  finance: "finance",
  hr: "HR",
  engineering: "engineering",
  customerSuccess: "customer success",
  product: "product management",
  legal: "legal",
  other: "",
};

const COMPANY_KIND_PHRASES: Record<CompanyKind, string> = {
  b2b_vendor: "B2B software vendor",
  manufacturer_employer: "manufacturer",
  government: "government body",
  unknown: "company",
};

// Acronyms whose spoken form begins with a vowel sound take "an".
const AN_ACRONYMS = new Set(["smb", "sdr", "hr", "mvp"]);

function articleFor(phrase: string): string {
  const first = phrase.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (AN_ACRONYMS.has(first) || /^[aeiou]/.test(first)) return "an";
  return "a";
}

/** Maps a 0–5 relevance score to a constrained qualitative phrase. */
function fitPhrase(relevance: number): string {
  if (relevance >= 5) return "an excellent";
  if (relevance >= 4) return "a strong";
  if (relevance === 3) return "a moderate";
  if (relevance === 2) return "a weak";
  return "a poor";
}

function lowerFirst(text: string): string {
  if (text.length === 0) return text;
  const firstWord = text.split(/\s+/)[0] ?? "";
  // Only de-capitalize ordinary Title-case words; preserve acronyms (e.g. "CEOs").
  if (!/^[A-Z][a-z]+\b/.test(firstWord)) return text;
  return text[0].toLowerCase() + text.slice(1);
}

function describeCompany(band: CompanySizeBand, kind: CompanyKind): string {
  const kindPhrase = COMPANY_KIND_PHRASES[kind];
  const adjective = BAND_ADJECTIVES[band];
  const phrase = adjective ? `${adjective} ${kindPhrase}` : kindPhrase;
  return `${articleFor(phrase)} ${phrase}`;
}

function describeSubject(
  seniority: Seniority,
  fn: Department,
  band: CompanySizeBand,
  kind: CompanyKind,
  flags: {
    is_decision_maker: boolean;
    is_champion_only: boolean;
    is_assistant_or_support: boolean;
  },
): string {
  const seniorityLabel = SENIORITY_LABELS[seniority];
  const functionPhrase = FUNCTION_PHRASES[fn];
  const rolePart = functionPhrase
    ? `${seniorityLabel} in ${functionPhrase}`
    : seniorityLabel;

  let positioning = "";
  if (flags.is_assistant_or_support) {
    positioning = ", in an assistant or support role";
  } else if (flags.is_champion_only) {
    positioning = ", positioned as a champion rather than a buyer";
  } else if (flags.is_decision_maker) {
    positioning = ", and a likely decision-maker";
  }

  return `${rolePart} at ${describeCompany(band, kind)}${positioning}.`;
}

/**
 * Renders a lead's evidence chain as a constrained, deterministic narrative
 * paragraph (Style A): verdict → subject → supporting drivers → caps/exclusions.
 */
export function renderReasoning(chain: EvalChain<"scored">): string {
  const { features, band, verdict } = chain.data;
  const relevant = verdict.kind === "relevant";
  const score = verdict.kind === "relevant" ? verdict.score : 0;

  const subject = describeSubject(
    features.seniority,
    features.function,
    band,
    features.company_kind,
    {
      is_decision_maker: features.is_decision_maker,
      is_champion_only: features.is_champion_only,
      is_assistant_or_support: features.is_assistant_or_support,
    },
  );

  const hard = findStep(chain, "rule.hard_exclude");
  const soft = findStep(chain, "rule.soft_exclude");
  const title = findStep(chain, "rule.title_priority");
  const seniority = findStep(chain, "rule.seniority_matrix");
  const final = findStep(chain, "score.final");

  if (!relevant) {
    let reason: string;
    if (hard?.outputs.excluded) {
      reason = lowerFirst(hard.rationale);
    } else if (soft?.outputs.applied) {
      reason = lowerFirst(soft.rationale);
    } else if (final) {
      reason = lowerFirst(final.rationale);
    } else {
      reason = "it did not meet the relevance threshold";
    }
    return `Not relevant. ${subject} Excluded because ${reason}.`;
  }

  const drivers: string[] = [];
  if (title?.outputs.matched_target) {
    const label = PRIMARY_TARGET_LABELS[title.outputs.matched_target];
    drivers.push(
      `it matches the "${label}" outreach target (${title.outputs.priority}/5)`,
    );
  }
  if (seniority) {
    drivers.push(
      `seniority is ${fitPhrase(seniority.outputs.relevance)} fit for this company size (${seniority.outputs.relevance}/5)`,
    );
  }
  if (final?.inputs.rule_outputs.department_weight != null) {
    const dept = final.inputs.rule_outputs.department_weight;
    if (dept >= 4) {
      drivers.push(`the department is a core fit (${dept}/5)`);
    }
  }

  const caps: string[] = [];
  if (title && !title.outputs.matched_target) {
    caps.push(
      `the title did not match a priority outreach target (${title.outputs.priority}/5)`,
    );
  }
  if (features.is_champion_only && !features.is_decision_maker) {
    caps.push("it is a champion-only contact rather than a buyer");
  }
  if (features.parse_confidence < 0.5) {
    caps.push("parse confidence was low");
  }

  const driverSentence =
    drivers.length > 0
      ? `${lowerFirst(drivers[0]).replace(/^./, (c) => c.toUpperCase())}${
          drivers.length > 1 ? `, and ${drivers.slice(1).join(", and ")}` : ""
        }.`
      : "It clears the persona rules.";

  const closing =
    caps.length > 0
      ? `No disqualifying rules fired, but the score is held to ${score} because ${caps.join(", and ")}.`
      : "No disqualifying rules fired.";

  return `Relevant · ${score}/10. ${subject} ${driverSentence} ${closing}`;
}

const STEP_LABELS: Record<string, string> = {
  "parse.lead": "Profile",
  "lookup.size_band": "Company size",
  "rule.hard_exclude": "Hard exclusion",
  "rule.soft_exclude": "Soft exclusion",
  "rule.title_priority": "Title match",
  "rule.seniority_matrix": "Seniority fit",
  "score.final": "Score",
};

const STEP_ORDER = [
  "parse.lead",
  "lookup.size_band",
  "rule.hard_exclude",
  "rule.soft_exclude",
  "rule.title_priority",
  "rule.seniority_matrix",
  "score.final",
] as const;

/**
 * Projects the evidence chain into an ordered, UI-friendly list of steps —
 * the verbatim reasoning chain surfaced behind the "Why?" disclosure.
 */
export function buildReasoningSteps(chain: EvalChain<"scored">): ReasoningStep[] {
  const steps: ReasoningStep[] = [];

  for (const step_id of STEP_ORDER) {
    const step = findStep(chain, step_id);
    if (!step) continue;

    let kind: ReasoningStep["kind"] = "info";
    if (step.step_id === "rule.hard_exclude") {
      kind = step.outputs.excluded ? "negative" : "info";
    } else if (step.step_id === "rule.soft_exclude") {
      kind = step.outputs.applied ? "negative" : "info";
    } else if (step.step_id === "rule.title_priority") {
      kind = step.outputs.matched_target ? "positive" : "info";
    } else if (step.step_id === "rule.seniority_matrix") {
      const r = step.outputs.relevance;
      kind = r >= 3 ? "positive" : r <= 1 ? "negative" : "info";
    }

    steps.push({
      label: STEP_LABELS[step.step_id] ?? step.step_id,
      detail: step.rationale,
      kind,
    });
  }

  return steps;
}
