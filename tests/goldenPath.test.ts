/**
 * The 7 CFR 273.10 golden path: the SNAP benefit-computation subtree,
 * sliced straight from the vendored corpus and executed by the vendored
 * engine, must reproduce the canonical two-person household — $478 monthly
 * allotment, $226 net monthly income for $1,200 wages and $900 shelter.
 * The allotment matches the value axiom-api's parity suite pins for the
 * same household (the federal §273.10 arithmetic dominates it); the values
 * here are regression pins on this corpus commit, asserted through the
 * page's own request path.
 *
 * There is no vendored program behind this: the subtree IS the unit, and
 * this test is the proof that pick → compile → state facts → execute is
 * end-to-end sound.
 */

import { describe, expect, it } from "vitest";
import type { ExecutionResponse } from "@/lib/engine/types";
import { buildPackageRequest } from "@/lib/goldenPath";
import { GOLDEN_ROOT, engine, haveCorpus, loadManifest, sliceAt } from "./sliceHarness";

/** The canonical household: two people, $1,200 wages, $900 shelter. */
const PARITY_ANSWERS = {
  household: {
    household_size: "2",
    snap_gross_monthly_earned_income: "1200",
    snap_total_allowable_shelter_expenses: "900",
  },
  people: {},
};

describe.skipIf(!haveCorpus)("the 7 CFR 273.10 golden path", () => {
  const manifest = haveCorpus ? loadManifest() : null!;
  const slice = haveCorpus ? sliceAt(manifest, GOLDEN_ROOT) : null!;

  it("compiles to the provenance envelope the vendored engine expects", () => {
    expect(slice.artifact.artifact_format_version).toBe(engine.artifact_format_version());
    expect(slice.artifact.engine_version).toBe(engine.engine_version());
  });

  it("the outputs are the root module's own rules, durably identified", () => {
    expect(Object.keys(slice.pkg.outputs).length).toBeGreaterThan(0);
    for (const id of Object.values(slice.pkg.outputs)) {
      expect(id.startsWith(`${GOLDEN_ROOT}#`), id).toBe(true);
    }
  });

  it("every default is keyed by the root-prefix input ref", () => {
    for (const ref of Object.keys(slice.pkg.defaults)) {
      expect(ref.startsWith(`${GOLDEN_ROOT}#input.`), ref).toBe(true);
    }
  });

  it("executes the canonical household in explain mode", () => {
    const response = JSON.parse(
      engine.execute(
        slice.artifactJson,
        JSON.stringify(buildPackageRequest({ pkg: slice.pkg, answers: PARITY_ANSWERS })),
      ),
    ) as ExecutionResponse;
    expect(response.metadata.requested_mode).toBe("explain");
    expect(response.metadata.actual_mode).toBe("explain");
  });

  const outputs = () => {
    const response = JSON.parse(
      engine.execute(
        slice.artifactJson,
        JSON.stringify(buildPackageRequest({ pkg: slice.pkg, answers: PARITY_ANSWERS })),
      ),
    ) as ExecutionResponse;
    return response.results[0].outputs;
  };

  it("computes the $478 allotment — the same figure axiom-api's parity suite pins", () => {
    const output = outputs()[slice.pkg.outputs.snap_monthly_allotment];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    expect(output.value).toEqual({ kind: "decimal", value: "478" });
  });

  it("computes the $226 net monthly income", () => {
    const output = outputs()[slice.pkg.outputs.snap_net_monthly_income];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    expect(output.value).toEqual({ kind: "decimal", value: "226" });
  });

  it("a stated fact by ref override wins over the presumption", () => {
    const ref = Object.entries(slice.pkg.defaults).find(
      ([, slot]) => slot.name === "snap_total_monthly_unearned_income",
    )?.[0];
    if (!ref) throw new Error("snap_total_monthly_unearned_income not discovered");
    const response = JSON.parse(
      engine.execute(
        slice.artifactJson,
        JSON.stringify(
          buildPackageRequest({
            pkg: slice.pkg,
            answers: { ...PARITY_ANSWERS, refOverrides: { [ref]: "500" } },
          }),
        ),
      ),
    ) as ExecutionResponse;
    const output = response.results[0].outputs[slice.pkg.outputs.snap_monthly_allotment];
    if (output.kind !== "scalar") throw new Error("expected scalar");
    expect(Number(output.value.value)).toBeLessThan(478);
  });
});
