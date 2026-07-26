/**
 * The "change the law" step: amending the earned-income deduction rate
 * inside the compiled artifact must move the same household's allotment,
 * and current law must survive untouched in the original string.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EngineBindings, ExecutionResponse } from "@/lib/engine/types";
import { buildPackageRequest, type GoldenPackage } from "@/lib/goldenPath";
import { applyWhatIf } from "@/lib/whatIf";

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js") as EngineBindings;

const programDir = join(__dirname, "..", "public", "programs", "co-snap");
const artifactJson = readFileSync(join(programDir, "artifact.json"), "utf8");
const pkg = JSON.parse(readFileSync(join(programDir, "package.json"), "utf8")) as GoldenPackage;

const ANSWERS = {
  household: {
    household_size: "2",
    snap_countable_earned_income: "1200",
    household_shelter_costs_incurred: "900",
  },
  people: { member_age: ["42", "9"] },
};

function allotment(json: string): string {
  const request = buildPackageRequest({ pkg, answers: ANSWERS });
  const response = JSON.parse(engine.execute(json, JSON.stringify(request))) as ExecutionResponse;
  const output = response.results[0].outputs[pkg.outputs.snap_allotment];
  if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
  return String(output.value.value);
}

describe("amending a statutory parameter in the artifact", () => {
  it("moves the allotment, and current law is untouched", () => {
    const before = allotment(artifactJson);
    expect(before).toBe("478");

    const amended = applyWhatIf(artifactJson, {
      parameter: "snap_earned_income_deduction_rate_for_net_income",
      value: "0.3",
    });
    expect(amended.previousValue).toBe("0.2");
    expect(amended.parameterId).toContain("#");

    const after = allotment(amended.artifactJson);
    expect(after).not.toBe(before);
    expect(Number(after)).toBeGreaterThan(Number(before));

    // The original string is untouched: current law still computes 478.
    expect(allotment(artifactJson)).toBe("478");
  });

  it("refuses to amend a parameter that does not exist", () => {
    expect(() => applyWhatIf(artifactJson, { parameter: "no_such_rule", value: "1" })).toThrow(
      /no_such_rule/,
    );
  });
});

describe("presumed-answer overrides by durable ref", () => {
  it("a ref override wins over the descriptor default", () => {
    // Flag unearned income (assistance payments) via the ref directly.
    const ref = Object.entries(pkg.defaults).find(
      ([, slot]) => slot.name === "assistance_payments",
    )?.[0];
    if (!ref) throw new Error("assistance_payments not in descriptor");
    const request = buildPackageRequest({
      pkg,
      answers: { ...ANSWERS, refOverrides: { [ref]: "500" } },
    });
    const response = JSON.parse(
      engine.execute(artifactJson, JSON.stringify(request)),
    ) as ExecutionResponse;
    const output = response.results[0].outputs[pkg.outputs.snap_allotment];
    if (output.kind !== "scalar") throw new Error("expected scalar");
    expect(Number(output.value.value)).toBeLessThan(478);
  });
});
