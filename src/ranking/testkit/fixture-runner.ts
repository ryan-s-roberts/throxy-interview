import type { Lead } from "@/types";
import { scoreLeadFromFixture } from "../domain/pipeline";
import type { RuleTestCase } from "../domain/types";

const STUB_LEAD: Lead = {
  id: "fixture-lead",
  first_name: "Test",
  last_name: "Lead",
  job_title: "",
  company: "Fixture Co",
  domain: "fixture.co",
  employee_range: "",
  industry: "",
};

export function scoreLeadFromFixtureCase(fixture: RuleTestCase) {
  const lead: Lead = {
    ...STUB_LEAD,
    id: fixture.id,
    job_title: fixture.job_title ?? "",
    employee_range: fixture.employee_range ?? "",
  };
  return scoreLeadFromFixture(lead, fixture);
}
