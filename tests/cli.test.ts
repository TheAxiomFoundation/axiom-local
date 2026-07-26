/**
 * The local CLI is a launch entry point: a clone of this repo must produce
 * the pinned golden-path values from the terminal with no toolchain beyond
 * bun. These tests spawn the real script.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(__dirname, "..", "scripts", "determine.mjs");
const run = (...args: string[]) =>
  execFileSync("bun", [script, ...args], { encoding: "utf8", timeout: 60_000 });

describe("bun scripts/determine.mjs", () => {
  it("computes the pinned $478 for the canonical household", () => {
    const out = run();
    expect(out).toMatch(/snap_allotment\s+478/);
    expect(out).toMatch(/snap_net_income\s+226\.5/);
    expect(out).toContain("holds");
  });

  it("amends the law with --what-if and says so", () => {
    const out = run("--what-if", "snap_earned_income_deduction_rate_for_net_income=0.3");
    expect(out).toContain("AMENDED LAW");
    expect(out).toContain("current law: 0.2");
    expect(out).not.toMatch(/snap_allotment\s+478\b/);
  });

  it("overrides a presumption with --set", () => {
    const out = run("--set", "assistance_payments=500", "--json");
    const parsed = JSON.parse(out);
    expect(Number(parsed.outputs.snap_allotment)).toBeLessThan(478);
  });

  it("emits machine-readable JSON with --json", () => {
    const parsed = JSON.parse(run("--json"));
    expect(parsed.program).toBe("co-snap");
    expect(parsed.outputs.snap_allotment).toBe("478");
  });

  it("runs other programs with --program", () => {
    const out = run("--program", "fiit");
    expect(out).toMatch(/regular_tax_before_credits\s+7912/);
    const fl = run("--program", "fl-tca", "--json");
    expect(JSON.parse(fl).outputs.fl_tca_eligible).toBe("holds");
  });

  it("tolerates shell-split assignments (--set slot = value)", () => {
    const spaced = run("--set", "household_size", "=", "4", "--json");
    const compact = run("--set", "household_size=4", "--json");
    expect(JSON.parse(spaced).outputs).toEqual(JSON.parse(compact).outputs);
  });

  it("lists programs with --programs", () => {
    const out = run("--programs");
    expect(out).toContain("co-snap");
    expect(out).toContain("fiit");
  });

  it("prints the chain of citation with --trace", () => {
    const out = run("--trace");
    expect(out).toContain("chain of citation");
    expect(out).toContain("us-co:regulations/10-ccr-2506-1/4.207.2#snap_allotment");
  });
});
