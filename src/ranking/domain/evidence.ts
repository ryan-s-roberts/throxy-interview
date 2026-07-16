import type { Lead } from "@/types";
import type {
  CompanySizeBand,
  Confidence,
  HardExcludeOutput,
  HardExcludeRuleId,
  ParseLeadInput,
  ParsedLeadFeatures,
  PipelineState,
  ScoringInputs,
  Seniority,
  SeniorityMatrixOutput,
  SoftExcludeOutput,
  SoftExcludeRuleId,
  SpecRef,
  StateData,
  TitlePriorityOutput,
  TitlePriorityRuleId,
  Verdict,
} from "./types";

export type StepRegistry = {
  "parse.lead": {
    source: "model";
    in: ParseLeadInput;
    out: ParsedLeadFeatures;
  };
  "lookup.size_band": {
    source: "lookup";
    in: { employee_range: string };
    out: { band: CompanySizeBand; mapping_notes: string };
  };
  "rule.hard_exclude": {
    source: "rule";
    rule_id: HardExcludeRuleId;
    spec_ref: SpecRef;
    in: { features: ParsedLeadFeatures; band: CompanySizeBand };
    out: HardExcludeOutput;
  };
  "rule.soft_exclude": {
    source: "rule";
    rule_id: SoftExcludeRuleId;
    spec_ref: SpecRef;
    in: { features: ParsedLeadFeatures };
    out: SoftExcludeOutput;
  };
  "rule.title_priority": {
    source: "rule";
    rule_id: TitlePriorityRuleId;
    spec_ref: SpecRef;
    in: { features: ParsedLeadFeatures; band: CompanySizeBand };
    out: TitlePriorityOutput;
  };
  "rule.seniority_matrix": {
    source: "rule";
    rule_id: "persona.seniority_matrix";
    spec_ref: "Seniority Relevance Matrix";
    in: { seniority: Seniority; band: CompanySizeBand };
    out: SeniorityMatrixOutput;
  };
  "score.final": {
    source: "rule";
    rule_id: "scoring.composite";
    spec_ref: "derived";
    in: { rule_outputs: ScoringInputs };
    out: { relevant: boolean; score: number };
  };
};

export type StepId = keyof StepRegistry;

export type ModelStepId = {
  [K in StepId]: StepRegistry[K] extends { source: "model" } ? K : never;
}[StepId];

export type RuleStepId = {
  [K in StepId]: StepRegistry[K] extends { source: "rule" } ? K : never;
}[StepId];

export type LookupStepId = {
  [K in StepId]: StepRegistry[K] extends { source: "lookup" } ? K : never;
}[StepId];

export type ModelEvidence<Id extends ModelStepId> = {
  source: "model";
  step_id: Id;
  inputs: StepRegistry[Id]["in"];
  outputs: StepRegistry[Id]["out"];
  confidence: Confidence;
  rationale: string;
};

export type RuleEvidence<Id extends RuleStepId> = {
  source: "rule";
  step_id: Id;
  rule_id: StepRegistry[Id]["rule_id"];
  spec_ref: StepRegistry[Id]["spec_ref"];
  inputs: StepRegistry[Id]["in"];
  outputs: StepRegistry[Id]["out"];
  rationale: string;
};

export type LookupEvidence<Id extends LookupStepId> = {
  source: "lookup";
  step_id: Id;
  inputs: StepRegistry[Id]["in"];
  outputs: StepRegistry[Id]["out"];
  rationale: string;
};

export type EvidenceStep =
  | { [Id in ModelStepId]: ModelEvidence<Id> }[ModelStepId]
  | { [Id in RuleStepId]: RuleEvidence<Id> }[RuleStepId]
  | { [Id in LookupStepId]: LookupEvidence<Id> }[LookupStepId];

export type EvalChain<S extends PipelineState> = {
  readonly state: S;
  readonly data: StateData[S];
  readonly steps: readonly EvidenceStep[];
};

const STEP_META: {
  [K in RuleStepId]: {
    rule_id: StepRegistry[K]["rule_id"];
    spec_ref: StepRegistry[K]["spec_ref"];
  };
} = {
  "rule.hard_exclude": {
    rule_id: "persona.hard_exclude.function",
    spec_ref: "Who NOT to Contact > Hard Exclusions",
  },
  "rule.soft_exclude": {
    rule_id: "persona.soft_exclude",
    spec_ref: "Who NOT to Contact > Soft Exclusions",
  },
  "rule.title_priority": {
    rule_id: "persona.title_priority",
    spec_ref: "Lead Targeting by Company Size",
  },
  "rule.seniority_matrix": {
    rule_id: "persona.seniority_matrix",
    spec_ref: "Seniority Relevance Matrix",
  },
  "score.final": {
    rule_id: "scoring.composite",
    spec_ref: "derived",
  },
};

export function ingest(lead: Lead): EvalChain<"raw"> {
  return { state: "raw", data: { lead }, steps: [] };
}

export function modelStep<Id extends ModelStepId>(
  id: Id,
  args: Omit<ModelEvidence<Id>, "source" | "step_id">,
): ModelEvidence<Id> {
  return { source: "model", step_id: id, ...args };
}

export function ruleStep<Id extends RuleStepId>(
  id: Id,
  args: Omit<RuleEvidence<Id>, "source" | "step_id" | "rule_id" | "spec_ref"> & {
    rule_id?: StepRegistry[Id]["rule_id"];
    spec_ref?: StepRegistry[Id]["spec_ref"];
  },
): RuleEvidence<Id> {
  const meta = STEP_META[id];
  return {
    source: "rule",
    step_id: id,
    rule_id: (args.rule_id ?? meta.rule_id) as StepRegistry[Id]["rule_id"],
    spec_ref: (args.spec_ref ?? meta.spec_ref) as StepRegistry[Id]["spec_ref"],
    inputs: args.inputs,
    outputs: args.outputs,
    rationale: args.rationale,
  };
}

export function lookupStep<Id extends LookupStepId>(
  id: Id,
  args: Omit<LookupEvidence<Id>, "source" | "step_id">,
): LookupEvidence<Id> {
  return { source: "lookup", step_id: id, ...args };
}

export function appendParseLead(
  chain: EvalChain<"raw">,
  step: ModelEvidence<"parse.lead">,
): EvalChain<"parsed"> {
  return {
    state: "parsed",
    data: { lead: chain.data.lead, features: step.outputs },
    steps: [...chain.steps, step],
  };
}

export function appendSizeBand(
  chain: EvalChain<"parsed">,
  step: LookupEvidence<"lookup.size_band">,
): EvalChain<"sized"> {
  const empty_outputs: ScoringInputs = {
    hard_exclude: { excluded: false },
    soft_exclude: { applied: false },
    title_priority: { priority: 1, matched_target: null },
    seniority_matrix: { relevance: 0 },
    champion_penalty: 0,
    low_confidence_penalty: false,
    department_weight: 1,
  };
  return {
    state: "sized",
    data: {
      lead: chain.data.lead,
      features: chain.data.features,
      band: step.outputs.band,
      rule_outputs: empty_outputs,
    },
    steps: [...chain.steps, step],
  };
}

export function appendRuleStep(
  chain: EvalChain<"sized">,
  step: Exclude<EvidenceStep, ModelEvidence<"parse.lead"> | LookupEvidence<"lookup.size_band">>,
  rule_outputs: ScoringInputs,
): EvalChain<"sized"> {
  return {
    state: "sized",
    data: {
      lead: chain.data.lead,
      features: chain.data.features,
      band: chain.data.band,
      rule_outputs,
    },
    steps: [...chain.steps, step],
  };
}

export function appendScoreFinal(
  chain: EvalChain<"sized">,
  step: RuleEvidence<"score.final">,
  verdict: Verdict,
): EvalChain<"scored"> {
  return {
    state: "scored",
    data: {
      lead: chain.data.lead,
      features: chain.data.features,
      band: chain.data.band,
      rule_outputs: chain.data.rule_outputs,
      verdict,
    },
    steps: [...chain.steps, step],
  };
}

export function injectParsed(
  chain: EvalChain<"raw">,
  features: ParsedLeadFeatures,
): EvalChain<"parsed"> {
  return {
    state: "parsed",
    data: { lead: chain.data.lead, features },
    steps: chain.steps,
  };
}

export function findStep<Id extends StepId>(
  chain: EvalChain<PipelineState>,
  step_id: Id,
): Extract<EvidenceStep, { step_id: Id }> | undefined {
  return chain.steps.find((s) => s.step_id === step_id) as
    | Extract<EvidenceStep, { step_id: Id }>
    | undefined;
}
