import { lookupStep } from "./evidence";
import type { CompanySizeBand } from "./types";

/**
 * Maps an employee-count range to a size band using the thresholds in the
 * persona spec's section headers (Startups 1–50, SMB 51–200, Mid-Market
 * 201–1,000, Enterprise 1,000+).
 */
const RANGE_TO_BAND: Record<string, CompanySizeBand> = {
  "2-10": "startup",
  "11-50": "startup",
  "51-200": "smb",
  "201-500": "midMarket",
  "501-1000": "midMarket",
  "1001-5000": "enterprise",
  "5001-10000": "enterprise",
  "10001+": "enterprise",
};

export function mapEmployeeRangeToBand(employee_range: string): {
  band: CompanySizeBand;
  mapping_notes: string;
} {
  const trimmed = employee_range.trim();
  if (!trimmed) {
    return { band: "unknown", mapping_notes: "empty employee_range → unknown band" };
  }
  const band = RANGE_TO_BAND[trimmed];
  if (band) {
    return {
      band,
      mapping_notes: `employee_range ${trimmed} maps to ${band} band`,
    };
  }
  return {
    band: "unknown",
    mapping_notes: `unrecognized employee_range ${trimmed} → unknown band`,
  };
}

export function createSizeBandStep(employee_range: string) {
  const { band, mapping_notes } = mapEmployeeRangeToBand(employee_range);
  return lookupStep("lookup.size_band", {
    inputs: { employee_range },
    outputs: { band, mapping_notes },
    rationale: mapping_notes,
  });
}
