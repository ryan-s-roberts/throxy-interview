This file provides guidance to AI coding agents working in this repository.

## Project Overview

A Next.js app that ranks sales leads against a persona spec using AI. Leads are
loaded from CSV into memory. The frontend (table + ranking trigger) is done. The
candidate implements the ranking logic in the API route.

## Commands

```bash
npm install        # Install dependencies
npm run dev        # Start dev server (http://localhost:3000)
npm run build      # Production build (use as typecheck)
npm run lint       # Run linter
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
│       └── rank/route.ts             # POST /api/rank (candidate implements)
├── components/
│   └── leads-table.tsx                # Table component (sorting + display)
├── data/
│   ├── leads.ts                       # CSV parser → Lead[]
│   └── persona.ts                     # Reads persona-spec.md → string
└── types/
    └── index.ts                       # All type definitions
```

## Lead CSV columns

account_name, lead_first_name, lead_last_name, lead_job_title,
account_domain, account_employee_range, account_industry

## Cursor Cloud specific instructions

Single service: a Next.js app. Standard commands are in the "Commands" section
above (`npm run dev`, `npm run build`, `npm run lint`). Dependencies are refreshed
automatically on startup, so no manual install is needed.

Non-obvious notes:
- `POST /api/rank` in `src/app/api/rank/route.ts` is intentionally unimplemented
  and returns HTTP 501 `{"error":"Not implemented"}`. The frontend "Rank Leads"
  button surfaces this as a red error message — that is expected until the route
  is built. `npm run lint`/`npm run build` emit "defined but never used" warnings
  from this stub; those warnings are expected, not regressions.
- Ranking (once implemented) needs an AI provider key. Copy `.env.example` to
  `.env.local` and set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. The app runs and
  serves the leads table without any key; only the rank endpoint requires one.
- `.npmrc` isolates this project from any parent monorepo config — keep it.
- `publish.sh` force-pushes an orphan single-commit to `origin/main`; do not run
  it during normal development.
