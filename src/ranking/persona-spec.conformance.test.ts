/**
 * Behavioural checks against `data/persona-spec.md`. Each assertion is labelled
 * with the SpecRef it verifies (`itSpec`). Totality checks ensure every
 * `SPEC_SECTIONS` member has ≥1 assertion and ≥1 fixture citation.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CEO_PRESIDENT_TARGETS } from "./domain/persona-tables";
import {
  createSeniorityMatrixStep,
  evaluateHardExclude,
  evaluateSoftExclude,
  evaluateTitlePriority,
  resolveDepartmentWeight,
} from "./domain/rules";
import { computeVerdict } from "./domain/scorer";
import { mapEmployeeRangeToBand } from "./domain/bands";
import { mkConfidence } from "./domain/total";
import { SPEC_SECTIONS } from "./domain/types";
import type {
  CompanySizeBand,
  Department,
  ParsedLeadFeatures,
  PrimaryTarget,
  RuleTestCase,
  Seniority,
  SoftExcludeRole,
  SpecSection,
} from "./domain/types";

const covered = new Set<SpecSection>();

function itSpec(section: SpecSection, name: string, fn: () => void): void {
  covered.add(section);
  it(`[${section}] ${name}`, fn);
}

function feat(overrides: Partial<ParsedLeadFeatures> = {}): ParsedLeadFeatures {
  return {
    seniority: "unknown",
    function: "other",
    primary_target: "none",
    soft_exclude_role: "none",
    is_decision_maker: false,
    is_champion_only: false,
    is_assistant_or_support: false,
    is_employed: true,
    company_kind: "b2b_vendor",
    parse_confidence: mkConfidence(0.9),
    ...overrides,
  };
}

describe("persona-spec.md conformance", () => {
  itSpec("Seniority Relevance Matrix", "running seniority rule emits spec relevance", () => {
    const cases: Array<[Seniority, CompanySizeBand, number]> = [
      ["ic", "startup", 0],
      ["founder", "startup", 5],
      ["founder", "enterprise", 0],
      ["vp", "enterprise", 5],
      ["director", "midMarket", 5],
    ];
    for (const [seniority, band, relevance] of cases) {
      expect(createSeniorityMatrixStep(feat({ seniority }), band).outputs.relevance).toBe(
        relevance,
      );
    }
  });

  itSpec("Department Priority", "Executive is 5/5 at startups and 1/5 elsewhere", () => {
    expect(resolveDepartmentWeight("executive", "startup")).toBe(5);
    for (const band of ["smb", "midMarket", "enterprise"] as CompanySizeBand[]) {
      expect(resolveDepartmentWeight("executive", band)).toBe(1);
    }
  });

  itSpec("Lead Targeting by Company Size", "primary target priorities match per band", () => {
    const cases: Array<[CompanySizeBand, PrimaryTarget, number]> = [
      ["startup", "founder", 5],
      ["startup", "managing_director", 4],
      ["startup", "head_of_sales", 4],
      ["smb", "vp_of_sales", 5],
      ["smb", "sales_director", 5],
      ["smb", "cro", 4],
      ["midMarket", "vp_of_sales_development", 5],
      ["midMarket", "cro", 4],
      ["enterprise", "vp_of_sales_development", 5],
      ["enterprise", "vp_of_inside_sales", 5],
      ["enterprise", "cro", 4],
    ];
    for (const [band, primary_target, priority] of cases) {
      expect(evaluateTitlePriority(feat({ primary_target }), band).priority).toBe(priority);
    }
  });

  itSpec("Lead Targeting by Company Size", "title priority is pure table lookup (no function fallback)", () => {
    const salesDevIc = feat({
      seniority: "ic",
      function: "salesDev",
      primary_target: "none",
    });
    expect(evaluateTitlePriority(salesDevIc, "enterprise")).toEqual({
      priority: 1,
      matched_target: null,
    });
  });

  itSpec("Lead Targeting by Company Size", "Vice President is not Owner/President", () => {
    const vpBizDev = feat({
      seniority: "vp",
      function: "bizDev",
      primary_target: "none",
    });
    expect(evaluateTitlePriority(vpBizDev, "smb")).toEqual({
      priority: 1,
      matched_target: null,
    });
  });

  itSpec("Who NOT to Contact > Hard Exclusions", "excluded departments are hard-excluded", () => {
    const excluded: Department[] = [
      "finance",
      "engineering",
      "hr",
      "legal",
      "customerSuccess",
      "product",
    ];
    for (const fn of excluded) {
      expect(evaluateHardExclude(feat({ function: fn }), "enterprise")).toMatchObject({
        rule_id: "persona.hard_exclude.function",
        output: { excluded: true },
      });
    }
  });

  itSpec("Who NOT to Contact > Hard Exclusions", "CEO/President vocab excludes at Mid-Market & Enterprise", () => {
    for (const primary_target of CEO_PRESIDENT_TARGETS) {
      const person = feat({
        seniority: "cLevel",
        function: "executive",
        primary_target,
        is_decision_maker: true,
      });
      expect(evaluateHardExclude(person, "enterprise")).toMatchObject({
        rule_id: "persona.hard_exclude.ceo_enterprise",
        output: { excluded: true },
      });
      expect(evaluateHardExclude(person, "midMarket")).toMatchObject({
        rule_id: "persona.hard_exclude.ceo_midmarket",
        output: { excluded: true },
      });
    }
  });

  itSpec("Who NOT to Contact > Hard Exclusions", "cLevel/executive alone is not over-broad CEO exclude", () => {
    const nonCeoCLevel = feat({
      seniority: "cLevel",
      function: "executive",
      primary_target: "none",
      is_decision_maker: true,
    });
    expect(evaluateHardExclude(nonCeoCLevel, "enterprise").output.excluded).toBe(false);
    expect(evaluateHardExclude(nonCeoCLevel, "midMarket").output.excluded).toBe(false);
  });

  itSpec("Who NOT to Contact > Hard Exclusions", "CRO is not hard-excluded at enterprise", () => {
    const cro = feat({
      seniority: "cLevel",
      function: "sales",
      primary_target: "cro",
      is_decision_maker: true,
    });
    expect(evaluateHardExclude(cro, "enterprise").output.excluded).toBe(false);
    expect(evaluateTitlePriority(cro, "enterprise")).toEqual({
      priority: 4,
      matched_target: "cro",
    });
  });

  itSpec("Who NOT to Contact > Soft Exclusions", "soft-exclude roles are applied from vocab", () => {
    const roles: Array<Exclude<SoftExcludeRole, "none">> = [
      "bdr_sdr",
      "account_executive",
      "cmo_vp_marketing",
      "board_advisor",
    ];
    for (const soft_exclude_role of roles) {
      expect(evaluateSoftExclude(feat({ soft_exclude_role }))).toMatchObject({
        applied: true,
        role: soft_exclude_role,
      });
    }
    expect(evaluateSoftExclude(feat({ soft_exclude_role: "none" }))).toEqual({
      applied: false,
    });
  });

  itSpec("Lead Targeting by Company Size", "employee ranges map to the spec's size bands", () => {
    const cases: Array<[string, CompanySizeBand]> = [
      ["11-50", "startup"],
      ["51-200", "smb"],
      ["201-500", "midMarket"],
      ["501-1000", "midMarket"],
      ["1001-5000", "enterprise"],
      ["10001+", "enterprise"],
    ];
    for (const [range, band] of cases) {
      expect(mapEmployeeRangeToBand(range).band).toBe(band);
    }
  });

  itSpec("Champions", "champion flag keeps soft-excluded contacts for multi-threading", () => {
    const championBdr = feat({
      seniority: "ic",
      function: "salesDev",
      primary_target: "none",
      soft_exclude_role: "bdr_sdr",
      is_champion_only: true,
      is_decision_maker: false,
    });
    const outputs = {
      hard_exclude: { excluded: false } as const,
      soft_exclude: evaluateSoftExclude(championBdr),
      title_priority: evaluateTitlePriority(championBdr, "enterprise"),
      seniority_matrix: { relevance: 1 as const },
      champion_penalty: 2,
      low_confidence_penalty: false,
      department_weight: 5 as const,
    };
    expect(computeVerdict(outputs).verdict.kind).toBe("relevant");
  });
});

describe("spec coverage (totality)", () => {
  function loadFixtures(): RuleTestCase[] {
    const dir = path.join(__dirname, "__fixtures__", "cases");
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as RuleTestCase);
  }

  it("every spec section has ≥1 conformance assertion", () => {
    expect([...covered].sort()).toEqual([...SPEC_SECTIONS].sort());
  });

  it("every spec section is exercised by ≥1 fixture", () => {
    const fromFixtures = new Set(loadFixtures().flatMap((f) => f.spec_refs));
    for (const section of SPEC_SECTIONS) {
      expect(fromFixtures.has(section)).toBe(true);
    }
  });
});
