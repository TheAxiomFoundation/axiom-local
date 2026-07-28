/**
 * The local CLI is a launch entry point: a clone of this repo (plus a
 * generated corpus) must slice a subtree and produce the golden-path
 * values from the terminal with no toolchain beyond bun. These tests
 * spawn the real script — everything serves with its certification status
 * labeled (the permissive default); the enforced posture, pinned
 * explicitly below, is the hard cut where only fully-certified closures
 * run. Skipped when public/corpus/ has not been generated.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { haveCorpus } from "./sliceHarness";

const script = join(__dirname, "..", "scripts", "determine.mjs");
const run = (...args: string[]) =>
  execFileSync("bun", [script, ...args], { encoding: "utf8", timeout: 60_000 });

/** The canonical household, as --set flags. */
const FACTS = [
  "--set",
  "household_size=2",
  "--set",
  "snap_gross_monthly_earned_income=1200",
  "--set",
  "snap_total_allowable_shelter_expenses=900",
];

/** Run expecting failure; returns stderr. */
const runFailWith = (env: Record<string, string>, ...args: string[]): string => {
  try {
    execFileSync("bun", [script, ...args], {
      encoding: "utf8",
      timeout: 60_000,
      stdio: "pipe",
      env: { ...process.env, ...env },
    });
  } catch (error) {
    const spawn = error as { status: number | null; stderr: string };
    expect(spawn.status).toBe(1);
    return spawn.stderr;
  }
  throw new Error(`expected failure: ${args.join(" ")}`);
};
const runFail = (...args: string[]): string => runFailWith({}, ...args);

describe.skipIf(!haveCorpus)("bun scripts/determine.mjs", () => {
  it("computes the pinned $478 allotment for the canonical household", () => {
    const out = run(...FACTS);
    expect(out).toContain("us:regulations/7-cfr/273/10");
    expect(out).toMatch(/snap_monthly_allotment\s+478/);
    expect(out).toMatch(/snap_net_monthly_income\s+226/);
  });

  it("labels the determination with its certification status", () => {
    // Nothing in the current catalog earns "certified" under the served
    // fixture ledger — the honest label is encoded, never a blank.
    const out = run(...FACTS);
    expect(out).toContain("encoded — not certified");
    expect(out).not.toContain("certified (ledger");
  });

  it("lists the subtree catalog with --roots, composition/pipeline excluded", () => {
    const out = run("--roots", "snap");
    expect(out).toContain("us:regulations/7-cfr/273/10");
    expect(out).toMatch(/\d+ of \d+ sliceable subtrees/);
    expect(out).not.toContain("state-plan-composition");
    expect(out).not.toContain("fy-2026-benefit-calculation");
    expect(out).not.toMatch(/_pipeline\b/);
  });

  it("slices a different root with --root", () => {
    const out = run("--root", "us-ny:regulations/18-nycrr/385/3");
    expect(out).toContain("us-ny:regulations/18-nycrr/385/3");
    expect(out).toContain("compiled and executed locally");
  });

  it("refuses a composition/pipeline root with the honest reason", () => {
    const stderr = runFail("--root", "us:policies/usda/snap/state-plan-composition");
    expect(stderr).toMatch(/composition\/pipeline assembly, not law/);
    expect(stderr).toMatch(/cannot be sliced/);
  });

  it("amends the law with --what-if and says so", () => {
    const out = run(...FACTS, "--what-if", "snap_earned_income_deduction_rate_for_net_income=0.3");
    expect(out).toContain("AMENDED LAW");
    expect(out).toContain("current law: 0.2");
    expect(out).toMatch(/snap_monthly_allotment\s+532/);
  });

  it("overrides a presumption with --set", () => {
    const out = run(...FACTS, "--set", "snap_total_monthly_unearned_income=500", "--json");
    const parsed = JSON.parse(out);
    expect(Number(parsed.outputs.snap_monthly_allotment)).toBeLessThan(478);
  });

  it("emits the determination envelope with --json", () => {
    const parsed = JSON.parse(run(...FACTS, "--json"));
    expect(parsed.engine).toBe("axiom");
    expect(parsed.runtime.mode).toBe("local-wasm");
    expect(parsed.root).toBe("us:regulations/7-cfr/273/10");
    expect(parsed.corpus.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(parsed.corpus.modules).toContain("us:regulations/7-cfr/273/10");
    expect(parsed.certification).toBe("encoded");
    expect(parsed.ledger.ledger_id).toBe("fixture-us-ny-snap");
    expect(parsed.outputs.snap_monthly_allotment).toBe("478");
    // Stated facts flagged against presumptions; trace in hosted naming.
    expect(
      parsed.inputs.filter((input: { stated: boolean }) => input.stated).length,
    ).toBe(3);
    expect(parsed.trace.length).toBeGreaterThan(0);
    expect(parsed.trace[0]).toHaveProperty("rule_id");
    expect(parsed.trace[0]).toHaveProperty("sources");
  });

  it("tolerates shell-split assignments (--set slot = value)", () => {
    const spaced = run("--set", "household_size", "=", "4", "--json");
    const compact = run("--set", "household_size=4", "--json");
    expect(JSON.parse(spaced).outputs).toEqual(JSON.parse(compact).outputs);
  });

  it("the one-flag flip to enforced refuses uncertified closures by count, never by id", () => {
    // Same slice, same ledger — only the posture changes. Serving-surface
    // refusals report counts; node ids never leak.
    const stderr = runFailWith({ AXIOM_CERTIFIED_ENFORCEMENT: "enforced" }, ...FACTS);
    expect(stderr).toMatch(/refused: \d+ node\(s\) .* not certified/);
    expect(stderr).not.toMatch(/#/);
  });

  it("accepts currency formatting in values", () => {
    const out = run(...FACTS, "--set", "snap_gross_monthly_earned_income=$1,200", "--json");
    expect(JSON.parse(out).outputs.snap_monthly_allotment).toBe("478");
  });

  it("rejects user mistakes with one-line errors, no stack traces", () => {
    const cases: [string[], RegExp][] = [
      [["--set", "household_size=four"], /not a whole number for household_size/],
      [["--set", "no_such_slot=1"], /No input slot named "no_such_slot"/],
      [["--month", "2026-13"], /--month expects a calendar month/],
      [["--trace", "--depth", "abc"], /--depth expects a positive number/],
      [["--trace", "--output", "nope"], /No output named "nope".*snap_monthly_allotment/],
      [["--what-if", "not_a_param=0.5"], /No parameter named "not_a_param"/],
      [["--root", "us:statutes/9999/nope"], /Unknown root "us:statutes\/9999\/nope"/],
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
    const out = run(...FACTS, "--trace", "--output", "snap_monthly_allotment");
    expect(out).toContain("chain of citation");
    expect(out).toContain("us:regulations/7-cfr/273/10#snap_monthly_allotment");
  });
});
