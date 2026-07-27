/**
 * The certified-node gate, exercised the way an attacker (or a stale
 * pipeline) would hit it: malformed ledgers refuse wholesale, a program
 * stripped from the ledger neither vendors nor loads, and nothing
 * uncertified — not even a legal id — leaks into the rendered registry or
 * a vendored descriptor.
 *
 * The mutant world is built from two tiny RuleSpec programs compiled by
 * the real engine: one whose closure a mini-ledger fully certifies, one
 * (with distinctly-named rules) the ledger has never heard of.
 */

import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompiledProgramArtifact, EngineBindings } from "@/lib/engine/types";
import {
  LEDGER_FORMAT,
  assertArtifactCertified,
  assertPackageCertified,
  certifiedSetVersion,
  certifiedStamp,
  collectClosureIds,
  findUncertified,
  validateLedger,
  type CertifiedEntry,
} from "@/lib/certified";
import { EXAMPLE_MODULES, EXAMPLE_ROOT_TARGET, FEDERAL_TARGET } from "@/lib/example";
import { discoverInputs } from "@/lib/program";
import type { GoldenPackage } from "@/lib/goldenPath";

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js") as EngineBindings;

const HEX64 = "ab".repeat(32);

function entriesFor(ids: string[]): CertifiedEntry[] {
  return ids.map((legal_id, i) => ({
    legal_id,
    certificate_id: `test-cert-${i}`,
    claim: "attested" as const,
    evidence_sha256: HEX64,
  }));
}

async function ledgerOf(entries: CertifiedEntry[], ledgerId = "test-ledger") {
  return validateLedger({
    format: LEDGER_FORMAT,
    ledger_id: ledgerId,
    issued_at: "2026-07-01T00:00:00Z",
    fixture: true,
    vintage: { encoding_release: "t", engine_release: "t", corpus_release: "t" },
    entries,
  });
}

// ---------------------------------------------------------------------------
// Ledger validation is wholesale and fail-closed
// ---------------------------------------------------------------------------

describe("ledger validation", () => {
  const base = () => ({
    format: LEDGER_FORMAT,
    ledger_id: "l",
    issued_at: "2026-07-01T00:00:00Z",
    fixture: true,
    vintage: { encoding_release: "t", engine_release: "t", corpus_release: "t" },
    entries: entriesFor(["us:statutes/7/2017/a#snap_regular_month_allotment"]),
  });

  it("accepts a well-formed ledger and computes its set version", async () => {
    const index = await validateLedger(base());
    expect(index.setVersion).toMatch(/^[0-9a-f]{24}$/);
    expect(index.byId.size).toBe(1);
  });

  it("an empty ledger is VALID — it certifies nothing, so nothing serves", async () => {
    const index = await validateLedger({ ...base(), entries: [] });
    expect(index.byId.size).toBe(0);
    expect(findUncertified(["us:statutes/7/2017/a#anything"], index)).toHaveLength(1);
  });

  it.each([
    ["wrong format string", { format: "axiom-certified-ledger/2" }],
    ["entries not an array", { entries: {} }],
  ] as const)("refuses wholesale: %s", async (_label, patch) => {
    await expect(validateLedger({ ...base(), ...patch })).rejects.toThrow(
      /certified ledger invalid/,
    );
  });

  it("refuses a synthetic axiom: id as a schema error", async () => {
    const bad = base();
    bad.entries.push(entriesFor(["axiom:us-ny-snap#input.people"])[0]);
    await expect(validateLedger(bad)).rejects.toThrow(/synthetic id/);
  });

  it("refuses duplicate legal_ids", async () => {
    const bad = base();
    bad.entries.push({ ...bad.entries[0] });
    await expect(validateLedger(bad)).rejects.toThrow(/duplicate legal_id/);
  });

  it("refuses an evidence hash that is not 64 hex chars", async () => {
    const bad = base();
    bad.entries[0].evidence_sha256 = "deadbeef";
    await expect(validateLedger(bad)).rejects.toThrow(/evidence_sha256/);
  });

  it("set version is order-independent and rotation-sensitive", async () => {
    const twoIds = entriesFor([
      "us:statutes/7/2017/a#a",
      "us:statutes/7/2017/a#b",
    ]);
    const forward = await certifiedSetVersion(twoIds);
    const reversed = await certifiedSetVersion([...twoIds].reverse());
    expect(forward).toBe(reversed);
    const rotated = await certifiedSetVersion(entriesFor(["us:statutes/7/2017/a#a"]));
    expect(rotated).not.toBe(forward);
  });
});

// ---------------------------------------------------------------------------
// The mutant world: one certified program, one the ledger never heard of
// ---------------------------------------------------------------------------

/** A second program whose every id is distinctly marked — the leak canary. */
const UNCERTIFIED_TARGET = "us-zz:policies/uncertified-benefit";
const UNCERTIFIED_MODULES: Record<string, string> = {
  [UNCERTIFIED_TARGET]: `
format: rulespec/v1
rules:
  - name: uncertified_secret_rate
    kind: parameter
    dtype: Rate
    versions:
      - effective_from: 2025-10-01
        formula: "0.5"
  - name: uncertified_secret_benefit
    kind: derived
    entity: Household
    dtype: Money
    period: Month
    unit: USD
    versions:
      - effective_from: 2025-10-01
        formula: uncertified_secret_income * uncertified_secret_rate
`,
};

function compileWorld(modules: Record<string, string>, root: string) {
  const artifactJson = engine.compile(JSON.stringify(modules), root);
  const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
  const inputRefs = discoverInputs(artifact).map((input) => `${root}#input.${input.name}`);
  return { artifact, inputRefs };
}

const certifiedWorld = compileWorld(EXAMPLE_MODULES, EXAMPLE_ROOT_TARGET);
const uncertifiedWorld = compileWorld(UNCERTIFIED_MODULES, UNCERTIFIED_TARGET);
// The mini-ledger certifies exactly the certified program's closure.
const worldLedger = () =>
  ledgerOf(entriesFor(collectClosureIds(certifiedWorld.artifact, certifiedWorld.inputRefs)));

describe("mutant: a program stripped from the ledger", () => {
  it("(a) fails vendoring — the gate refuses, naming the missing ids", async () => {
    const index = await worldLedger();
    // The certified program passes the exact gate the vendor script runs…
    assertArtifactCertified(certifiedWorld.artifact, certifiedWorld.inputRefs, index);
    // …the stripped one refuses, and the refusal (build-stderr context)
    // names the concrete uncertified ids.
    expect(() =>
      assertArtifactCertified(uncertifiedWorld.artifact, uncertifiedWorld.inputRefs, index),
    ).toThrow(/uncertified-benefit#uncertified_secret_benefit/);
  });

  it("(b) refuses at load when package certificate provenance is stale or mismatched", async () => {
    const index = await worldLedger();
    const outputs = { benefit: `${EXAMPLE_ROOT_TARGET}#snap_regular_month_allotment` };
    const good = { program_id: "example", certified: certifiedStamp(index, outputs) };
    expect(() => assertPackageCertified(good, index)).not.toThrow();

    // No stamp at all — checked-in or not, it refuses.
    expect(() => assertPackageCertified({ program_id: "example" }, index)).toThrow(
      /no certificate provenance/,
    );
    // A stamp from another ledger.
    const foreign = {
      ...good,
      certified: { ...good.certified, ledger_id: "someone-elses-ledger" },
    };
    expect(() => assertPackageCertified(foreign, index)).toThrow(/different ledger/);
    // A stale set version — the ledger rotated after vendoring.
    const stale = {
      ...good,
      certified: { ...good.certified, certified_set_version: "0".repeat(24) },
    };
    expect(() => assertPackageCertified(stale, index)).toThrow(/stale/);
  });

  it("(b, shipped) the real vendored ny-snap refuses under a tampered stamp", async () => {
    const vendored = JSON.parse(
      readFileSync(join(__dirname, "..", "public", "programs", "ny-snap", "package.json"), "utf8"),
    ) as GoldenPackage;
    const index = await validateLedger(
      JSON.parse(readFileSync(join(__dirname, "..", "data", "certified-nodes.json"), "utf8")),
    );
    expect(() => assertPackageCertified(vendored, index)).not.toThrow();
    const tampered = {
      ...vendored,
      certified: { ...vendored.certified!, certified_set_version: "f".repeat(24) },
    };
    expect(() => assertPackageCertified(tampered, index)).toThrow(/stale/);
  });
});

describe("mutant: a corpus slice with an uncertified dep in its closure", () => {
  it("refuses, naming the ids", async () => {
    // A ledger that certifies the state module's own nodes but NOT the
    // federal module it imports: the closure is not fully certified, and
    // the refusal must say exactly which dependency ids are missing.
    const closure = collectClosureIds(certifiedWorld.artifact, certifiedWorld.inputRefs);
    const withoutFederal = closure.filter((id) => !id.startsWith(FEDERAL_TARGET));
    const index = await ledgerOf(entriesFor(withoutFederal));
    let refusal = "";
    try {
      assertArtifactCertified(certifiedWorld.artifact, certifiedWorld.inputRefs, index);
    } catch (error) {
      refusal = String(error);
    }
    expect(refusal).toMatch(/closure not certified/);
    expect(refusal).toContain(`${FEDERAL_TARGET}#snap_maximum_allotment`);
    expect(refusal).toContain(`${FEDERAL_TARGET}#snap_maximum_allotment_table`);
  });
});

// ---------------------------------------------------------------------------
// Leak scan: no uncertified id appears in anything the registry serves
// ---------------------------------------------------------------------------

/** Every legal-id-with-fragment token inside a JSON document's strings. */
function idTokens(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(/[a-z][a-z0-9-]*:[A-Za-z0-9/_.:-]+#[A-Za-z0-9_.]+/g)) {
      into.add(match[0]);
    }
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) idTokens(item, into);
    return into;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      idTokens(key, into);
      idTokens(item, into);
    }
  }
  return into;
}

describe("leak scan", () => {
  it("a fixture registry vendored under the gate never mentions the uncertified program", async () => {
    const index = await worldLedger();
    // The vendor pipeline in miniature: gate each candidate, stamp and
    // register the admitted, drop the refused.
    const registry: unknown[] = [];
    const descriptors: unknown[] = [];
    for (const [id, world, outputs] of [
      ["certified-example", certifiedWorld, { benefit: `${EXAMPLE_ROOT_TARGET}#snap_regular_month_allotment` }],
      ["uncertified-example", uncertifiedWorld, { benefit: `${UNCERTIFIED_TARGET}#uncertified_secret_benefit` }],
    ] as const) {
      try {
        assertArtifactCertified(world.artifact, world.inputRefs, index);
        const certified = certifiedStamp(index, outputs);
        descriptors.push({ program_id: id, outputs, defaults: world.inputRefs, certified });
        registry.push({ id, certified: { ledger_id: certified.ledger_id } });
      } catch {
        // dropped — exactly what the vendor script does
      }
    }
    const rendered = JSON.stringify({ programs: registry, descriptors });
    expect(registry).toHaveLength(1);
    expect(rendered).not.toContain("uncertified-benefit");
    expect(rendered).not.toContain("uncertified_secret");
    for (const token of idTokens(JSON.parse(rendered))) {
      expect(index.byId.has(token), token).toBe(true);
    }
  });

  it("the shipped registry and every vendored descriptor carry only certified ids", async () => {
    const index = await validateLedger(
      JSON.parse(readFileSync(join(__dirname, "..", "data", "certified-nodes.json"), "utf8")),
    );
    const programsDir = join(__dirname, "..", "public", "programs");
    const registry = JSON.parse(readFileSync(join(programsDir, "index.json"), "utf8")) as {
      programs: { id: string }[];
    };
    const documents: unknown[] = [registry];
    for (const entry of registry.programs) {
      documents.push(
        JSON.parse(readFileSync(join(programsDir, entry.id, "package.json"), "utf8")),
      );
    }
    for (const document of documents) {
      const serialized = JSON.stringify(document);
      expect(serialized).not.toContain("axiom:");
      for (const token of idTokens(document)) {
        expect(index.byId.has(token), token).toBe(true);
      }
    }
    // And nothing beyond the registry survives on disk to be served.
    const onDisk = readdirSync(programsDir).filter((name) => name !== "index.json");
    expect(onDisk.sort()).toEqual(registry.programs.map((entry) => entry.id).sort());
  });
});
