/**
 * E2E smoke test: POST /api/rank and validate response shape.
 * Usage: node scripts/e2e-rank.mjs [base_url]
 */
const BASE = process.argv[2] ?? "http://localhost:3000";

async function main() {
  console.log(`E2E rank test → ${BASE}/api/rank`);

  const res = await fetch(`${BASE}/api/rank`, { method: "POST" });
  const body = await res.json();

  if (!res.ok) {
    console.error("FAIL:", res.status, body);
    process.exit(1);
  }

  const { results } = body;
  if (!Array.isArray(results)) {
    console.error("FAIL: missing results array", body);
    process.exit(1);
  }

  if (results.length !== 200) {
    console.error(`FAIL: expected 200 results, got ${results.length}`);
    process.exit(1);
  }

  const relevant = results.filter((r) => r.relevant);
  const sample = relevant.slice(0, 3);

  console.log("OK");
  console.log(`  total:     ${results.length}`);
  console.log(`  relevant:  ${relevant.length}`);
  console.log(`  irrelevant:${results.length - relevant.length}`);
  console.log("  sample relevant:");
  for (const r of sample) {
    console.log(`    ${r.lead_id} score=${r.score} — ${r.reasoning?.slice(0, 80)}…`);
  }

  const missing = results.filter(
    (r) =>
      typeof r.lead_id !== "string" ||
      typeof r.relevant !== "boolean" ||
      typeof r.score !== "number" ||
      typeof r.reasoning !== "string",
  );
  if (missing.length > 0) {
    console.error(`FAIL: ${missing.length} results missing required fields`);
    process.exit(1);
  }

  console.log("E2E PASSED");
}

main().catch((err) => {
  console.error("E2E ERROR:", err);
  process.exit(1);
});
