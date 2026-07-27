/**
 * The local CLI is a launch entry point: a clone of this repo must produce
 * the pinned golden-path values from the terminal with no toolchain beyond
 * bun. These tests spawn the real script — which serves only what the
 * vendored certification ledger vouches for.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(__dirname, "..", "scripts", "determine.mjs");
const run = (...args: string[]) =>
  execFileSync("bun", [script, ...args], { encoding: "utf8", timeout: 60_000 });

/** Run expecting failure; returns stderr. */
const runFail = (...args: string[]): string => {
  try {
    execFileSync("bun", [script, ...args], { encoding: "utf8", timeout: 60_000, stdio: "pipe" });
  } catch (error) {
    const spawn = error as { status: number | null; stderr: string };
    expect(spawn.status).toBe(1);
    return spawn.stderr;
  }
  throw new Error(`expected failure: ${args.join(" ")}`);
};

describe("bun scripts/determine.mjs", () => {
  it("computes the pinned $478 for the canonical household", () => {
    const out = run();
    expect(out).toMatch(/snap_benefit_amount\s+478/);
    expect(out).toMatch(/snap_net_income\s+226\.5/);
    expect(out).toContain("holds");
  });

  it("prints the certificate provenance line — served because certified", () => {
    const out = run();
    expect(out).toContain("certified (ledger fixture-us-ny-snap)");
  });

  it("pins the /example page's three-person transcript: --people member_age=42,9,70 → 717", () => {
    // The example page shows this exact transcript; a drift here means the
    // page is lying about what a visitor's machine will print.
    const out = run("--people", "member_age=42,9,70");
    expect(out).toMatch(/snap_benefit_amount\s+717/);
  });

  it("amends the law with --what-if and says so", () => {
    const out = run("--what-if", "snap_earned_income_deduction_rate_for_net_income=0.3");
    expect(out).toContain("AMENDED LAW");
    expect(out).toContain("current law: 0.2");
    expect(out).toMatch(/snap_benefit_amount\s+532/);
  });

  it("overrides a presumption with --set", () => {
    const out = run("--set", "snap_total_monthly_unearned_income=500", "--json");
    const parsed = JSON.parse(out);
    expect(Number(parsed.outputs.snap_benefit_amount)).toBeLessThan(478);
  });

  it("emits machine-readable JSON with --json", () => {
    const parsed = JSON.parse(run("--json"));
    expect(parsed.program).toBe("ny-snap");
    expect(parsed.outputs.snap_benefit_amount).toBe("478");
  });

  it("tolerates shell-split assignments (--set slot = value)", () => {
    const spaced = run("--set", "household_size", "=", "4", "--json");
    const compact = run("--set", "household_size=4", "--json");
    expect(JSON.parse(spaced).outputs).toEqual(JSON.parse(compact).outputs);
  });

  it("lists only certified programs with --programs", () => {
    const out = run("--programs");
    expect(out).toContain("ny-snap");
    // The uncertified catalog is gone — dropped at vendor time, not hidden.
    expect(out).not.toContain("co-snap");
    expect(out).not.toContain("fiit");
  });

  it("accepts currency formatting in values", () => {
    const out = run("--set", "snap_gross_monthly_earned_income=$1,200", "--json");
    expect(JSON.parse(out).outputs.snap_benefit_amount).toBe("478");
  });

  it("rejects user mistakes with one-line errors, no stack traces", () => {
    const cases: [string[], RegExp][] = [
      [["--set", "household_size=four"], /not a whole number for household_size/],
      [["--set", "no_such_slot=1"], /No input slot named "no_such_slot"/],
      [["--people", "no_such_slot=1,2"], /No input slot named "no_such_slot"/],
      [["--month", "2026-13"], /--month expects a calendar month/],
      [["--trace", "--depth", "abc"], /--depth expects a positive number/],
      [["--trace", "--output", "nope"], /No output named "nope".*snap_benefit_amount/],
      [["--what-if", "not_a_param=0.5"], /No parameter named "not_a_param"/],
      [["--program", "nope"], /Unknown program "nope"/],
    ];
    for (const [flags, pattern] of cases) {
      const stderr = runFail(...flags);
      expect(stderr, flags.join(" ")).toMatch(pattern);
      expect(stderr, flags.join(" ")).not.toMatch(/at .*\.ts:/);
    }
  });

  it("explains out-of-period months instead of dumping a wasm stack", () => {
    const stderr = runFail("--month", "2020-01");
    expect(stderr).toMatch(/has no value/);
    expect(stderr).toMatch(/default period \(2026-01\)/);
  });

  it("guards Node users before the TypeScript imports load", () => {
    // Real Node prints the use-Bun message and exits 1 (verified by hand);
    // it cannot be spawned from inside `bun run`, which shims `node` to
    // Bun itself — so assert the source ordering the guard depends on: the
    // versions check must precede every .ts import.
    const source = readFileSync(script, "utf8");
    const guardAt = source.indexOf("process.versions.bun");
    const firstTsImport = source.indexOf('import("../src/lib/');
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstTsImport).toBeGreaterThan(guardAt);
    expect(source.slice(0, firstTsImport)).toContain("bun scripts/determine.mjs");
  });

  it("prints the chain of citation with --trace", () => {
    const out = run("--trace");
    expect(out).toContain("chain of citation");
    expect(out).toContain("us:policies/usda/snap/state-plan-composition#snap_benefit");
  });
});
