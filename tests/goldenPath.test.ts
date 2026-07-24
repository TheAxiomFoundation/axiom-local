/**
 * The CO SNAP golden path: the composed compiled artifact from axiom-api's
 * runtime-artifacts, executed by the vendored engine through the descriptor
 * in public/programs/co-snap/, must reproduce the parity values axiom-api
 * pins for the canonical two-person Colorado household (examples/parity/
 * co-snap-us-co.json): $478 monthly allotment, $226.50 net income.
 *
 * If this passes, the page's golden-path request code is exercised end to
 * end against the exact artifact the browser downloads.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompiledProgramArtifact, EngineBindings, ExecutionResponse } from "@/lib/engine/types";
import { discoverInputs } from "@/lib/program";
import { buildPackageRequest, type GoldenPackage } from "@/lib/goldenPath";

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js") as EngineBindings;

const programDir = join(__dirname, "..", "public", "programs", "co-snap");
const artifactJson = readFileSync(join(programDir, "artifact.json"), "utf8");
const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
const pkg = JSON.parse(readFileSync(join(programDir, "package.json"), "utf8")) as GoldenPackage;

/** The canonical parity household: two people (42, 9), $1,200 wages, $900 shelter. */
const PARITY_ANSWERS = {
  household: {
    household_size: "2",
    snap_countable_earned_income: "1200",
    household_shelter_costs_incurred: "900",
  },
  people: { member_age: ["42", "9"] },
};

describe("the vendored engine accepts the composed artifact", () => {
  it("carries the provenance envelope the vendored engine expects", () => {
    expect(artifact.artifact_format_version).toBe(engine.artifact_format_version());
    expect(artifact.engine_version).toBe(engine.engine_version());
  });

  it("the descriptor covers every discovered input, and no more", () => {
    const discovered = new Set(discoverInputs(artifact).map((input) => input.ref));
    const declared = new Set(Object.keys(pkg.defaults));
    expect(declared).toEqual(discovered);
  });

  it("every headline slot resolves to at least one declared input", () => {
    for (const headline of pkg.headline) {
      const hits = Object.values(pkg.defaults).filter(
        (slot) => slot.name === headline.slot && slot.entity === headline.entity,
      );
      expect(hits.length, headline.slot).toBeGreaterThan(0);
    }
  });
});

describe("the pinned parity case, through the page's own request path", () => {
  const request = buildPackageRequest({ pkg, answers: PARITY_ANSWERS });
  const response = JSON.parse(
    engine.execute(artifactJson, JSON.stringify(request)),
  ) as ExecutionResponse;

  it("executes in explain mode", () => {
    expect(response.metadata.requested_mode).toBe("explain");
    expect(response.metadata.actual_mode).toBe("explain");
  });

  it("computes the $478 allotment axiom-api pins", () => {
    const output = response.results[0].outputs[pkg.outputs.snap_allotment];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    expect(output.value).toEqual({ kind: "decimal", value: "478" });
  });

  it("computes the $226.50 net income axiom-api pins", () => {
    const output = response.results[0].outputs[pkg.outputs.snap_net_income];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    expect(output.value).toEqual({ kind: "decimal", value: "226.5" });
  });

  it("finds the household eligible", () => {
    const output = response.results[0].outputs[pkg.outputs.snap_eligible];
    expect(output.kind).not.toBe("scalar_missing");
  });
});

describe("the member_of_household relation actually binds people to the household", () => {
  const allotmentFor = (people: Record<string, string[]>, shelter: string) => {
    const request = buildPackageRequest({
      pkg,
      answers: {
        household: {
          household_size: "2",
          snap_countable_earned_income: "1200",
          household_shelter_costs_incurred: shelter,
        },
        people,
      },
    });
    const response = JSON.parse(
      engine.execute(artifactJson, JSON.stringify(request)),
    ) as ExecutionResponse;
    const output = response.results[0].outputs[pkg.outputs.snap_allotment];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    return output.value;
  };

  it("an elderly-or-disabled member lifts the excess-shelter cap", () => {
    // With $2,000 shelter costs the excess-shelter deduction hits the cap for
    // a household with no elderly or disabled member; flagging one member
    // lifts the cap, so the allotment must differ. If the relation records
    // were silently dropped, the person-level flag could never reach the
    // household-level rule and these two values would be equal.
    const capped = allotmentFor({ member_age: ["42", "9"] }, "2000");
    const lifted = allotmentFor(
      { member_age: ["70", "9"], snap_member_is_elderly_or_disabled: ["1", "0"] },
      "2000",
    );
    expect(capped).not.toEqual(lifted);
  });
});
