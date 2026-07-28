/**
 * Titles, not paths: the humanizers ported from the Axiom app's
 * graph-viewer (legal ids must read identically wherever a user meets
 * them) and the headline-rule heuristic that titles catalog entries.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { humanizeCitation, humanizeRuleName } from "@/lib/citations";
import { headlineRuleName } from "@/lib/headline";
import { GOLDEN_ROOT, corpusDir, haveCorpus, loadManifest } from "./sliceHarness";
import { moduleUrl } from "@/lib/corpus";

describe("humanizeRuleName", () => {
  it("title-cases snake_case and upper-cases the acronym set", () => {
    expect(humanizeRuleName("snap_monthly_allotment")).toBe("SNAP Monthly Allotment");
    expect(humanizeRuleName("snap_agi_limit")).toBe("SNAP AGI Limit");
    expect(humanizeRuleName("abawd_time_limit_eligible")).toBe("ABAWD Time Limit Eligible");
    expect(humanizeRuleName("maximum-allotments")).toBe("Maximum Allotments");
  });
});

describe("humanizeCitation", () => {
  it("federal regulations: part.section with parenthetical subsections", () => {
    expect(humanizeCitation("us:regulations/7-cfr/273/10")).toBe("7 CFR § 273.10");
    expect(humanizeCitation("us-ny:regulations/18-nycrr/387/14/a/5")).toBe(
      "18 NYCRR § 387.14(a)(5)",
    );
    expect(humanizeCitation("us-co:regulations/10-ccr-2506-1/4.311.3")).toBe(
      "10 CCR 2506 1 § 4.311.3 (Colorado)",
    );
  });

  it("statutes: only the federal code is the USC; state codes read dotted", () => {
    expect(humanizeCitation("us:statutes/7/2014/e/6/A")).toBe("7 USC § 2014(e)(6)(A)");
    expect(humanizeCitation("us:statutes/7/2012/j")).toBe("7 USC § 2012(j)");
    // Statute paths can contain colons — split on the FIRST colon only.
    expect(humanizeCitation("us-la:statutes/47:294")).toBe("Louisiana Code § 47:294");
    expect(humanizeCitation("us-ia:statutes/422/12C")).toBe("Iowa Code § 422.12C");
  });

  it("policies: jurisdiction · agency · humanized leaf", () => {
    expect(humanizeCitation("us:policies/usda/snap/fy-2026-cola/maximum-allotments")).toBe(
      "Federal · USDA · Maximum Allotments",
    );
  });

  it("manuals: state, agency, dotted section; encoding leaves drop", () => {
    expect(humanizeCitation("us-mo:manual/dss/snap/1115-000-00/1115-035-25/block-1")).toBe(
      "MO DSS SNAP Manual 1115.035.25",
    );
  });

  it("passes non-legal-id strings through untouched", () => {
    expect(humanizeCitation("not-a-target")).toBe("not-a-target");
  });
});

describe("headlineRuleName", () => {
  it("picks the deepest derived rule — the one most of the module feeds", () => {
    const yaml = `
format: rulespec/v1
rules:
  - name: base_rate
    kind: parameter
    versions:
      - effective_from: 2025-10-01
        formula: "0.3"
  - name: helper_amount
    kind: derived
    entity: Household
    versions:
      - effective_from: 2025-10-01
        formula: income * base_rate
  - name: final_benefit
    kind: derived
    entity: Household
    versions:
      - effective_from: 2025-10-01
        formula: floor(maximum - helper_amount)
`;
    // helper_amount reaches 1 in-module rule (base_rate); final_benefit
    // reaches 2 (helper_amount → base_rate) — the culmination wins.
    expect(headlineRuleName(yaml)).toBe("final_benefit");
  });

  it("breaks ties toward the last-defined derived rule", () => {
    const yaml = `
format: rulespec/v1
rules:
  - name: first_rule
    kind: derived
    versions:
      - effective_from: 2025-10-01
        formula: a + b
  - name: second_rule
    kind: derived
    versions:
      - effective_from: 2025-10-01
        formula: c + d
`;
    expect(headlineRuleName(yaml)).toBe("second_rule");
  });

  it("returns null for parameter-only and source_relation-only modules", () => {
    const parameterOnly = `
format: rulespec/v1
rules:
  - name: some_table
    kind: parameter
    versions:
      - effective_from: 2025-10-01
        formula: "1"
`;
    expect(headlineRuleName(parameterOnly)).toBeNull();
    const shellOnly = `
format: rulespec/v1
rules:
  - name: restates_something
    kind: source_relation
`;
    expect(headlineRuleName(shellOnly)).toBeNull();
  });
});

describe.skipIf(!haveCorpus)("headlines in the vendored manifest", () => {
  const manifest = haveCorpus ? loadManifest() : null!;

  it("the golden-path subtree is titled by its culminating rule", () => {
    const entry = manifest.modules.find((module) => module.target === GOLDEN_ROOT);
    expect(entry?.headline).toBe("snap_monthly_allotment");
    expect(humanizeRuleName(entry!.headline!)).toBe("SNAP Monthly Allotment");
  });

  it("manifest headlines reproduce from the vendored yaml", () => {
    // Spot-check: the precomputed headline is exactly what the heuristic
    // says about the module text on disk.
    for (const target of [GOLDEN_ROOT, "us-co:regulations/10-ccr-2506-1/4.311.3"]) {
      const entry = manifest.modules.find((module) => module.target === target)!;
      const yaml = readFileSync(
        join(corpusDir, moduleUrl(target).replace("/corpus/", "")),
        "utf8",
      );
      expect(headlineRuleName(yaml), target).toBe(entry.headline ?? null);
    }
  });
});
