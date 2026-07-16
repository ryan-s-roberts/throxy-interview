import { NextResponse } from "next/server";
import { LEADS } from "@/data/leads";
import { LlmEnvError } from "@/ranking/llm/llm-env";
import { parseLeadBatch } from "@/ranking/llm/parse";
import { scoreLeadFromParsed, toRankingResult } from "@/ranking/domain/pipeline";
import type { RankResponse, ApiError } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(): Promise<NextResponse<RankResponse | ApiError>> {
  try {
    const parseResults = await parseLeadBatch(LEADS);

    const results = LEADS.map((lead) => {
      const parseStep = parseResults.get(lead.id);
      if (!parseStep) {
        throw new Error(`Missing parse result for ${lead.id}`);
      }
      return toRankingResult(scoreLeadFromParsed(lead, parseStep));
    });

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ranking failed";
    const status = error instanceof LlmEnvError ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
