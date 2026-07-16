import type { Lead } from "@/types";

export type CompanySizeBand = "startup" | "smb" | "midMarket" | "enterprise" | "unknown";

export type Seniority =
  | "founder"
  | "cLevel"
  | "vp"
  | "director"
  | "manager"
  | "ic"
  | "unknown";

/** The lead's department/function. (Named `Department` to avoid shadowing the global `Function`.) */
export type Department =
  | "salesDev"
  | "sales"
  | "revOps"
  | "bizDev"
  | "gtm"
  | "executive"
  | "marketing"
  | "finance"
  | "hr"
  | "engineering"
  | "customerSuccess"
  | "product"
  | "legal"
  | "other";

export type CompanyKind =
  | "b2b_vendor"
  | "manufacturer_employer"
  | "government"
  | "unknown";

/**
 * Closed vocabulary of primary outreach targets from the persona spec's
 * "Lead Targeting by Company Size" tables (union across all size bands),
 * plus `"none"` when no primary target fits. The LLM maps free-text titles
 * into this set; the judge never regex-matches `job_title`.
 */
export const PRIMARY_TARGETS = [
  "founder",
  "ceo",
  "owner_president",
  "managing_director",
  "head_of_sales",
  "vp_of_sales",
  "sales_director",
  "director_of_sales_development",
  "cro",
  "head_of_revops",
  "vp_of_growth",
  "vp_of_sales_development",
  "head_of_sales_development",
  "vp_of_revops",
  "vp_of_gtm",
  "vp_of_inside_sales",
  "vp_of_field_sales",
  "none",
] as const;

export type PrimaryTarget = (typeof PRIMARY_TARGETS)[number];

/**
 * Closed vocabulary for persona-spec soft exclusions ("Who NOT to Contact >
 * Soft Exclusions"). The LLM maps free-text titles into this set.
 */
export const SOFT_EXCLUDE_ROLES = [
  "bdr_sdr",
  "account_executive",
  "cmo_vp_marketing",
  "board_advisor",
  "none",
] as const;

export type SoftExcludeRole = (typeof SOFT_EXCLUDE_ROLES)[number];

export type ParsedLeadFeatures = {
  seniority: Seniority;
  function: Department;
  /** Spec primary-target id chosen by the LLM parse ACL. */
  primary_target: PrimaryTarget;
  /** Spec soft-exclusion role; `"none"` when not soft-excluded. */
  soft_exclude_role: SoftExcludeRole;
  is_decision_maker: boolean;
  is_champion_only: boolean;
  is_assistant_or_support: boolean;
  is_employed: boolean;
  company_kind: CompanyKind;
  parse_confidence: Confidence;
};

export type HardExcludeRuleId =
  | "persona.hard_exclude.function"
  | "persona.hard_exclude.support"
  | "persona.hard_exclude.not_employed"
  | "persona.hard_exclude.ceo_enterprise"
  | "persona.hard_exclude.ceo_midmarket";

export type TitlePriorityRuleId = "persona.title_priority";
export type SoftExcludeRuleId = "persona.soft_exclude";

/**
 * The exact section headings of `data/persona-spec.md`, as a runtime-enumerable
 * tuple. This is the single source of truth for spec citations — see `SpecRef`.
 */
export const SPEC_SECTIONS = [
  "Lead Targeting by Company Size",
  "Department Priority",
  "Seniority Relevance Matrix",
  "Who NOT to Contact > Hard Exclusions",
  "Who NOT to Contact > Soft Exclusions",
  "Champions",
] as const;

/** A single section heading of the persona spec. */
export type SpecSection = (typeof SPEC_SECTIONS)[number];

/**
 * Closed citation vocabulary: section headings from `SPEC_SECTIONS`, plus
 * `"derived"` for rubric-computed values (e.g. composite score). Used on rule
 * evidence, fixtures, and conformance tests so citations stay compile-checked.
 */
export type SpecRef = SpecSection | "derived";

export type RelevanceScore = 0 | 1 | 2 | 3 | 4 | 5;
export type PriorityScore = 1 | 2 | 3 | 4 | 5;

/** Department relevance in the closed interval 0–5 (persona spec "Department Priority"). */
export type DepartmentWeight = RelevanceScore;

declare const confidenceBrand: unique symbol;
/**
 * A parse confidence in the closed interval [0, 1]. A branded number so it
 * cannot be confused with a raw `number` or a `Score`. Construct via
 * `mkConfidence` in `total.ts`.
 */
export type Confidence = number & { readonly [confidenceBrand]: "Confidence" };

declare const scoreBrand: unique symbol;
/**
 * A validated composite score in the closed interval [1, 10]. It is a *newtype*
 * (branded number) so it cannot be confused with a raw `number`, a
 * `PriorityScore` (1–5), or a `RelevanceScore` (0–5). Construct only via
 * `mkScore` in `total.ts`.
 */
export type Score = number & { readonly [scoreBrand]: "Score" };

export type HardExcludeOutput =
  | { excluded: true; reason: string }
  | { excluded: false };

export type TitlePriorityOutput = {
  priority: PriorityScore;
  /** Band-table hit; `null` when `primary_target` is absent from that band's table. */
  matched_target: Exclude<PrimaryTarget, "none"> | null;
};

export type SoftExcludeOutput =
  | {
      applied: true;
      role: Exclude<SoftExcludeRole, "none">;
      reason: string;
    }
  | { applied: false };

export type SeniorityMatrixOutput = {
  relevance: RelevanceScore;
};

export type ScoringInputs = {
  hard_exclude: HardExcludeOutput;
  soft_exclude: SoftExcludeOutput;
  title_priority: TitlePriorityOutput;
  seniority_matrix: SeniorityMatrixOutput;
  champion_penalty: number;
  low_confidence_penalty: boolean;
  department_weight: DepartmentWeight;
};

/** Why a lead was disqualified — a sum type, never a sentinel score. */
export type ExclusionReason =
  | { readonly kind: "hardExclude"; readonly detail: string }
  | { readonly kind: "belowThreshold"; readonly detail: string };

/**
 * The outcome of ranking a single lead — an algebraic data type that makes
 * illegal states unrepresentable. A `Score` exists *only* on the `relevant`
 * branch, so "score present while irrelevant" cannot be constructed (contrast
 * the flat public `RankingResult`, whose `score: number` is a lossy projection
 * of this type via `toRankingResult`).
 */
export type Verdict =
  | { readonly kind: "relevant"; readonly score: Score }
  | { readonly kind: "excluded"; readonly reason: ExclusionReason };

export type ParseLeadInput = Pick<
  Lead,
  "job_title" | "company" | "domain" | "employee_range" | "industry"
>;

export type PipelineState = "raw" | "parsed" | "sized" | "scored";

export type StateData = {
  raw: { lead: Lead };
  parsed: { lead: Lead; features: ParsedLeadFeatures };
  sized: {
    lead: Lead;
    features: ParsedLeadFeatures;
    band: CompanySizeBand;
    rule_outputs: ScoringInputs;
  };
  scored: StateData["sized"] & { verdict: Verdict };
};

export type RuleTestCase = {
  id: string;
  description: string;
  features: ParsedLeadFeatures;
  /** Spec requirement(s) this fixture exercises — anchors fixture ↔ spec. */
  spec_refs: SpecRef[];
  /** Company size is derived from this range; there is no separate `band` field. */
  employee_range?: string;
  job_title?: string;
};

export type LeadEvaluation = {
  lead_id: string;
  chain: import("./evidence").EvalChain<"scored">;
  reasoning: string;
};
