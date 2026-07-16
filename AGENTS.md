This file provides guidance to AI coding agents working in this repository.

## Project Overview

A Next.js app that ranks sales leads against a persona spec using AI. Leads are
loaded from CSV into memory. The frontend (table + ranking trigger) is done. The
ranking logic lives in a two-phase pipeline under `src/ranking/`.

## Commands

```bash
npm install         # Install dependencies
npm run dev         # Start dev server (requires LLM API key in .env.local)
npm run build       # Production build (use as typecheck)
npm run start       # Start production server (requires LLM API key)
npm run lint        # Run linter
npm run check       # eslint + prettier --check
npm test            # Rule engine + evidence snapshots (deterministic, no API key)
npm run test:watch  # Vitest watch during rubric iteration
npm run test:update # Update snapshots — requires coherence review after
npm run e2e         # Live POST /api/rank smoke test (server must be running)
```

## Architecture

```
data/
├── leads.csv                          # 200 leads (loaded into memory)
└── persona-spec.md                    # Persona definition + ranking criteria
src/
├── app/
│   ├── page.tsx                       # Main page (wired to API, shows table)
│   ├── layout.tsx                     # Root layout
│   ├── globals.css                    # CSS variables + table styles
│   └── api/
│       ├── leads/route.ts             # GET /api/leads
│       └── rank/route.ts              # POST /api/rank
├── components/
│   └── leads-table.tsx                # Table component (sorting + display)
├── data/
│   └── leads.ts                       # CSV parser → Lead[]
├── ranking/
│   ├── domain/                        # Pure judge: types, tables, rules, scorer
│   ├── llm/                           # Anti-corruption: parse + provider env
│   ├── testkit/                       # Fixture runner + evidence serializer
│   ├── __fixtures__/cases/            # Injected parse fixtures for rule tests
│   ├── evidence.test.ts               # Evidence snapshot tests
│   └── persona-spec.conformance.test.ts
└── types/
    └── index.ts                       # API type definitions
```

## Ranking architecture

Leads are ranked via a two-phase pipeline:

1. **Parse** (LLM): free-text title/company → structured `ParsedLeadFeatures`
   from closed vocabularies (`primary_target`, `soft_exclude_role`, seniority,
   department, flags)
2. **Judge** (deterministic): persona table lookups on those features →
   `EvalChain<"scored">` (title priority, seniority matrix, department weights,
   hard/soft exclusions)

Every step emits typed evidence. `RankingResult.reasoning` is a deterministic
projection of that chain (Style-A narrative + expandable Why? steps).

`npm run dev` / `npm run start` require an LLM key in `.env.local`
(`OPENAI_API_KEY`, `OPENAPI_KEY`, `OPENROUTER_API_KEY`, or `ANTHROPIC_API_KEY`).
Server startup validates via `src/instrumentation.ts`.

## Evidence chain snapshots

Rule engine tests use **evidence snapshots** (`src/ranking/evidence.snap`).

- Snapshots are **deterministic evidence** — given injected parse fixtures, the
  full evidence chain is stable and reproducible.
- Tests assert the chain, not just `relevant`/`score`.
- CI runs snapshots without an API key (no LLM in default `npm test`).

### Coherence review (required)

Snapshots prove the rule engine is **consistent**. They do not prove it is
**correct**.

After changing rules, fixtures, or snapshots, a **human or agent must review for
coherence**:

- Does each evidence step's `rationale` follow from its typed `inputs`/`outputs`?
- Do `rule_id` and `spec_ref` match actual persona-spec intent?
- Do fixtures reflect real edge cases in `data/leads.csv`?
- Does the chain tell a believable story from parse → verdict?

Do not merge snapshot updates (`npm run test:update`) based solely on green
tests. Treat snapshot diffs as review artifacts — same as the interview demo.

## Lead CSV columns

account_name, lead_first_name, lead_last_name, lead_job_title,
account_domain, account_employee_range, account_industry
