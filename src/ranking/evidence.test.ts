import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findStep,
  scoreLeadFromFixtureCase,
  serializeEvidenceChain,
} from "./testkit";
import type { RuleTestCase } from "./domain/types";

const FIXTURES_DIR = path.join(__dirname, "__fixtures__", "cases");

function loadFixtures(): RuleTestCase[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = fs.readFileSync(path.join(FIXTURES_DIR, file), "utf8");
      return JSON.parse(raw) as RuleTestCase;
    });
}

describe("rule engine evidence chains", () => {
  const fixtures = loadFixtures();

  it.each(fixtures.map((f) => [f.id, f] as const))(
    "case %s produces stable evidence chain",
    (id, fixture) => {
      const eval_ = scoreLeadFromFixtureCase(fixture);
      const serialized = serializeEvidenceChain(eval_.chain, {
        id: fixture.id,
        description: fixture.description,
        features: fixture.features,
      });

      expect(serialized).toMatchSnapshot();
    },
  );
});

describe("evidence-first assertions", () => {
  it("steelcase CFO assistant hard excludes with support rule", () => {
    const fixture = loadFixtures().find((f) => f.id === "steelcase-cfo-assistant")!;
    const eval_ = scoreLeadFromFixtureCase(fixture);
    const hard = findStep(eval_.chain, "rule.hard_exclude");

    expect(hard).toMatchObject({
      source: "rule",
      rule_id: "persona.hard_exclude.support",
      outputs: { excluded: true },
    });
    expect(eval_.chain.data.verdict.kind).toBe("excluded");
  });

  it("allie founder CEO is relevant with high score", () => {
    const fixture = loadFixtures().find((f) => f.id === "allie-founder-ceo")!;
    const eval_ = scoreLeadFromFixtureCase(fixture);
    const verdict = eval_.chain.data.verdict;

    expect(verdict.kind).toBe("relevant");
    // Narrow the ADT: score exists ONLY on the relevant branch.
    if (verdict.kind === "relevant") {
      expect(verdict.score).toBeGreaterThanOrEqual(7);
    }
    expect(findStep(eval_.chain, "rule.title_priority")?.outputs.matched_target).toBeTruthy();
  });

  it("enterprise C-level/exec is hard excluded (CEOs too far removed)", () => {
    const fixture = loadFixtures().find((f) => f.id === "elche-government-president")!;
    const eval_ = scoreLeadFromFixtureCase(fixture);
    const hard = findStep(eval_.chain, "rule.hard_exclude");

    expect(hard).toMatchObject({
      rule_id: "persona.hard_exclude.ceo_enterprise",
      outputs: { excluded: true },
    });
    expect(eval_.chain.data.verdict.kind).toBe("excluded");
  });
});
