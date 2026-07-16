import type {
  CompanySizeBand,
  Department,
  DepartmentWeight,
  PrimaryTarget,
  PriorityScore,
  RelevanceScore,
  Seniority,
} from "./types";

/**
 * Seniority Relevance Matrix, transliterated verbatim from the persona spec and
 * kept side-by-side here so code and requirement are verifiable at a glance:
 *
 *                  Startup  SMB  Mid-Market  Enterprise
 *   Founder/Owner     5      3       1           0
 *   C-Level           5      3       2           1
 *   Vice President    3      5       5           5
 *   Director          2      4       5           4
 *   Manager           1      2       3           3
 *   IC                0      0       1           1
 *
 * The `unknown` seniority and `unknown` band are conservative fallbacks not in
 * the spec. The `Record<Seniority, Record<CompanySizeBand, RelevanceScore>>`
 * type makes the grid total by construction — every cell must exist and be a
 * `RelevanceScore` (0–5). Behaviour is exercised in the conformance test.
 */
export const SENIORITY_MATRIX: Record<Seniority, Record<CompanySizeBand, RelevanceScore>> = {
  founder: { startup: 5, smb: 3, midMarket: 1, enterprise: 0, unknown: 1 },
  cLevel: { startup: 5, smb: 3, midMarket: 2, enterprise: 1, unknown: 2 },
  vp: { startup: 3, smb: 5, midMarket: 5, enterprise: 5, unknown: 3 },
  director: { startup: 2, smb: 4, midMarket: 5, enterprise: 4, unknown: 2 },
  manager: { startup: 1, smb: 2, midMarket: 3, enterprise: 3, unknown: 1 },
  ic: { startup: 0, smb: 0, midMarket: 1, enterprise: 1, unknown: 0 },
  unknown: { startup: 0, smb: 0, midMarket: 0, enterprise: 0, unknown: 0 },
};

/**
 * Base department relevance (persona spec "Department Priority"). Executive is
 * intentionally size-dependent ("5/5 → 1/5, only relevant at startups") and is
 * resolved in `resolveDepartmentWeight` (rules.ts); the value here is only a
 * non-startup fallback. Functions absent from the spec's table (marketing,
 * finance, hr, engineering, customerSuccess, product, legal) are scored 0 and
 * handled by the hard-exclusion / soft-exclusion rules.
 */
export const DEPARTMENT_WEIGHT: Record<Department, DepartmentWeight> = {
  salesDev: 5,
  sales: 5,
  revOps: 4,
  bizDev: 4,
  gtm: 4,
  executive: 1,
  marketing: 2,
  finance: 0,
  hr: 0,
  engineering: 0,
  customerSuccess: 0,
  product: 0,
  legal: 0,
  other: 1,
};

/**
 * Human-readable labels for primary-target ids (narrative / evidence trail).
 */
export const PRIMARY_TARGET_LABELS: Record<PrimaryTarget, string> = {
  founder: "Founder",
  ceo: "CEO",
  owner_president: "Owner/President",
  managing_director: "Managing Director",
  head_of_sales: "Head of Sales",
  vp_of_sales: "VP of Sales",
  sales_director: "Sales Director",
  director_of_sales_development: "Director of Sales Development",
  cro: "CRO",
  head_of_revops: "Head of RevOps",
  vp_of_growth: "VP of Growth",
  vp_of_sales_development: "VP of Sales Development",
  head_of_sales_development: "Head of Sales Development",
  vp_of_revops: "VP of RevOps",
  vp_of_gtm: "VP of GTM",
  vp_of_inside_sales: "VP of Inside Sales",
  vp_of_field_sales: "VP of Field Sales",
  none: "none",
};

/**
 * Spec primary targets that count as CEO/President for the mid-market &
 * enterprise hard exclusion ("too far removed from outbound execution").
 */
export const CEO_PRESIDENT_TARGETS: ReadonlyArray<Exclude<PrimaryTarget, "none">> = [
  "ceo",
  "owner_president",
];

/**
 * Ranked "Primary Targets" per company-size band (persona spec "Lead Targeting
 * by Company Size"). Keys are controlled-vocab ids emitted by the LLM parse;
 * values are the spec's per-size priorities. Spec-only — no invented rows.
 */
export const TITLE_PRIORITY: Record<
  CompanySizeBand,
  Partial<Record<Exclude<PrimaryTarget, "none">, PriorityScore>>
> = {
  startup: {
    founder: 5,
    ceo: 5,
    owner_president: 5,
    managing_director: 4,
    head_of_sales: 4,
  },
  smb: {
    vp_of_sales: 5,
    head_of_sales: 5,
    sales_director: 5,
    director_of_sales_development: 5,
    cro: 4,
    head_of_revops: 4,
    vp_of_growth: 4,
  },
  midMarket: {
    vp_of_sales_development: 5,
    vp_of_sales: 5,
    head_of_sales_development: 5,
    director_of_sales_development: 5,
    cro: 4,
    vp_of_revops: 4,
    vp_of_gtm: 4,
  },
  enterprise: {
    vp_of_sales_development: 5,
    vp_of_inside_sales: 5,
    head_of_sales_development: 5,
    cro: 4,
    vp_of_revops: 4,
    director_of_sales_development: 4,
    vp_of_field_sales: 4,
  },
  unknown: {},
};

/**
 * Persona spec "Who NOT to Contact > Hard Exclusions": CFO/Finance,
 * CTO/Engineering, HR/Legal/Compliance, Customer Success, Product Management.
 * (CEO/President at Mid-Market & Enterprise is handled via `CEO_PRESIDENT_TARGETS`.)
 */
export const HARD_EXCLUDE_FUNCTIONS: Department[] = [
  "hr",
  "finance",
  "engineering",
  "customerSuccess",
  "product",
  "legal",
];