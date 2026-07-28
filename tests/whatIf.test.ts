/**
 * The "change the law" step, on a corpus slice: amending the earned-income
 * deduction rate inside the compiled 7 CFR 273.10 artifact must move the
 * same household's allotment, and current law must survive untouched in
 * the original string.
 */

import { describe, expect, it } from "vitest";
import type { ExecutionResponse } from "@/lib/engine/types";
import { buildPackageRequest } from "@/lib/goldenPath";
import { applyWhatIf } from "@/lib/whatIf";
import { GOLDEN_ROOT, engine, haveCorpus, loadManifest, sliceAt } from "./sliceHarness";

const ANSWERS = {
  household: {
    household_size: "2",
    snap_gross_monthly_earned_income: "1200",
    snap_total_allowable_shelter_expenses: "900",
  },
  people: {},
};

describe.skipIf(!haveCorpus)("amending a statutory parameter in a slice", () => {
  const slice = haveCorpus ? sliceAt(loadManifest(), GOLDEN_ROOT) : null!;

  function allotment(json: string): string {
    const request = buildPackageRequest({ pkg: slice.pkg, answers: ANSWERS });
    const response = JSON.parse(
      engine.execute(json, JSON.stringify(request)),
    ) as ExecutionResponse;
    const output = response.results[0].outputs[slice.pkg.outputs.snap_monthly_allotment];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    return String(output.value.value);
  }

  it("moves the allotment, and current law is untouched", () => {
    const before = allotment(slice.artifactJson);
    expect(before).toBe("478");

    const amended = applyWhatIf(slice.artifactJson, {
      parameter: "snap_earned_income_deduction_rate_for_net_income",
      value: "0.3",
    });
    expect(amended.previousValue).toBe("0.2");
    expect(amended.parameterId).toContain("#");

    const after = allotment(amended.artifactJson);
    expect(after).not.toBe(before);
    expect(Number(after)).toBeGreaterThan(Number(before));

    // The original string is untouched: current law still computes 478.
    expect(allotment(slice.artifactJson)).toBe("478");
  });

  it("refuses to amend a parameter that does not exist", () => {
    expect(() =>
      applyWhatIf(slice.artifactJson, { parameter: "no_such_rule", value: "1" }),
    ).toThrow(/no_such_rule/);
  });
});
