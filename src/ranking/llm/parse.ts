import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";
import { getLlmModel } from "./llm-env";
import { mkConfidence } from "../domain/total";
import { modelStep } from "../domain/evidence";
import type { ModelEvidence } from "../domain/evidence";
import { PRIMARY_TARGETS, SOFT_EXCLUDE_ROLES } from "../domain/types";
import type { Lead } from "@/types";

const BATCH_SIZE = 20;
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;

const primaryTargetSchema = z.enum(PRIMARY_TARGETS);
const softExcludeRoleSchema = z.enum(SOFT_EXCLUDE_ROLES);

const parsedFeaturesSchema = z.object({
  lead_id: z.string(),
  seniority: z.enum([
    "founder",
    "cLevel",
    "vp",
    "director",
    "manager",
    "ic",
    "unknown",
  ]),
  function: z.enum([
    "salesDev",
    "sales",
    "revOps",
    "bizDev",
    "gtm",
    "executive",
    "marketing",
    "finance",
    "hr",
    "engineering",
    "customerSuccess",
    "product",
    "legal",
    "other",
  ]),
  primary_target: primaryTargetSchema,
  soft_exclude_role: softExcludeRoleSchema,
  is_decision_maker: z.boolean(),
  is_champion_only: z.boolean(),
  is_assistant_or_support: z.boolean(),
  is_employed: z.boolean(),
  company_kind: z.enum([
    "b2b_vendor",
    "manufacturer_employer",
    "government",
    "unknown",
  ]),
  parse_confidence: z.number().min(0).max(1),
  rationale: z.string(),
});

const batchSchema = z.object({
  leads: z.array(parsedFeaturesSchema),
});

type ParsedBatch = z.infer<typeof batchSchema>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES) break;
      const backoff =
        BASE_RETRY_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 250);
      await delay(backoff);
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${label} failed after ${MAX_RETRIES + 1} attempts: ${reason}`);
}

async function parseBatch(
  model: LanguageModel,
  batch: Lead[],
  batchIndex: number,
): Promise<ParsedBatch> {
  return withRetry(async () => {
    const { object } = await generateObject({
      model,
      schema: batchSchema,
      temperature: 0.1,
      prompt: `Parse each lead for a B2B sales persona ranker. Extract structured features only from the provided fields.

Rules:
- Do NOT infer funding, hiring, promotions, or signals not in the data.
- Map job_title to exactly one primary_target from this closed vocabulary:
  ${PRIMARY_TARGETS.join(", ")}
- primary_target is the best-matching outreach persona id (or "none" if none fit).
- CEO / President hard-exclude vocabulary (use these ids, not seniority alone):
  - Standalone CEO / Chief Executive Officer → primary_target "ceo"
  - Owner / Co-Owner / President (NOT Vice President) → primary_target "owner_president"
  - "Vice President" / "VP" is NEVER owner_president or ceo
  - CRO / Chief Revenue Officer → "cro" (never "ceo"); other C-levels that are not CEO/President → usually "none" (or a matching sales target)
  - Founder & CEO → prefer "founder"
- Map soft_exclude_role from this closed vocabulary (soft exclusions — not hard):
  ${SOFT_EXCLUDE_ROLES.join(", ")}
  - BDR / SDR / Sales Development Rep (IC) → "bdr_sdr"
  - Account Executive / AE (closer) → "account_executive"
  - CMO / VP Marketing → "cmo_vp_marketing"
  - Board Member / Advisor (still employed on a board) → "board_advisor"
  - Otherwise → "none"
- Use company name/domain to disambiguate titles (e.g. government "President" → owner_president).
- Mark assistants separately from the role they support.
- Retired/student/garbage titles: low confidence, is_employed=false where appropriate; primary_target "none"; soft_exclude_role "none".
- function: classify the department. Use "customerSuccess" for customer success/support, "product" for product management, "legal" for legal/compliance.
- company_kind: b2b_vendor (sells software/services), manufacturer_employer (makes physical goods), government, unknown
- You MUST return exactly one entry per input lead_id.

Leads:
${JSON.stringify(
  batch.map((l) => ({
    lead_id: l.id,
    job_title: l.job_title,
    company: l.company,
    domain: l.domain,
    employee_range: l.employee_range,
    industry: l.industry,
  })),
  null,
  2,
)}`,
    });
    return object;
  }, `LLM parse batch ${batchIndex}`);
}

export async function parseLeadBatch(
  leads: Lead[],
): Promise<Map<string, ModelEvidence<"parse.lead">>> {
  const model = getLlmModel();

  const batches: Lead[][] = [];
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    batches.push(leads.slice(i, i + BATCH_SIZE));
  }

  // Dispatch all batches concurrently; each batch is independently retried.
  const parsedBatches = await Promise.all(
    batches.map((batch, index) => parseBatch(model, batch, index)),
  );

  const results = new Map<string, ModelEvidence<"parse.lead">>();

  batches.forEach((batch, index) => {
    const object = parsedBatches[index];
    const byId = new Map(object.leads.map((p) => [p.lead_id, p]));

    for (const lead of batch) {
      const parsed = byId.get(lead.id);
      if (!parsed) {
        throw new Error(
          `LLM parse batch ${index} missing lead_id ${lead.id} — expected ${batch.length} results, got ${object.leads.length}`,
        );
      }

      results.set(
        lead.id,
        modelStep("parse.lead", {
          inputs: {
            job_title: lead.job_title,
            company: lead.company,
            domain: lead.domain,
            employee_range: lead.employee_range,
            industry: lead.industry,
          },
          outputs: {
            seniority: parsed.seniority,
            function: parsed.function,
            primary_target: parsed.primary_target,
            soft_exclude_role: parsed.soft_exclude_role,
            is_decision_maker: parsed.is_decision_maker,
            is_champion_only: parsed.is_champion_only,
            is_assistant_or_support: parsed.is_assistant_or_support,
            is_employed: parsed.is_employed,
            company_kind: parsed.company_kind,
            parse_confidence: mkConfidence(parsed.parse_confidence),
          },
          confidence: mkConfidence(parsed.parse_confidence),
          rationale: parsed.rationale,
        }),
      );
    }
  });

  return results;
}
