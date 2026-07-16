/** A lead loaded from the CSV. */
export type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  job_title: string;
  company: string;
  domain: string;
  employee_range: string;
  industry: string;
};

/** One step of the evidence chain, surfaced for the "Why?" disclosure. */
export type ReasoningStep = {
  label: string; // human-friendly step name, e.g. "Seniority fit"
  detail: string; // the authored rationale for this step
  kind: "info" | "positive" | "negative"; // drives +/− emphasis in the UI
};

/** The result of ranking a single lead against the persona spec. */
export type RankingResult = {
  lead_id: string;
  relevant: boolean;
  score: number; // 1-10, only meaningful when relevant is true
  reasoning: string; // constrained narrative prose
  steps?: ReasoningStep[]; // full evidence chain, for progressive disclosure
};

/** Response from POST /api/rank. */
export type RankResponse = {
  results: RankingResult[];
};

/** Standard error shape returned by API routes. */
export type ApiError = {
  error: string;
};
