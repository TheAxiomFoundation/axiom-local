/**
 * Corpus slicing, end to end against the vendored nodejs wasm build: resolve
 * a closure from the generated manifest, compile it, synthesize a
 * descriptor, probe to a fixpoint, execute. Skipped when public/corpus/ has
 * not been generated (it is gitignored; CI runs without it).
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompiledProgramArtifact } from "../src/lib/engine/types";
import {
  moduleUrl,
  probeFixpoint,
  resolveClosure,
  synthesizePackage,
  type CorpusManifest,
} from "../src/lib/corpus";
import { buildPackageRequest } from "../src/lib/goldenPath";

const require = createRequire(import.meta.url);
const corpusDir = join(__dirname, "..", "public", "corpus");
const manifestPath = join(corpusDir, "manifest.json");
const haveCorpus = existsSync(manifestPath);

const ROOTS = [
  "us-co:regulations/10-ccr-2506-1/4.311.3",
  "us-ny:regulations/18-nycrr/385/3",
  "us-co:policies/cdhs/snap/fy-2026-benefit-calculation",
];

describe.skipIf(!haveCorpus)("corpus slicing", () => {
  const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js");
  const manifest = haveCorpus
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as CorpusManifest)
    : null!;

  it("records its source commit", () => {
    expect(manifest.sources[0].repo).toContain("rulespec");
    expect(manifest.sources[0].commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("moduleUrl preserves colons inside statute paths (us-la:statutes/47:294)", () => {
    expect(moduleUrl("us-la:statutes/47:294")).toBe("/corpus/modules/us-la/statutes/47:294.yaml");
    expect(moduleUrl("us-co:regulations/10-ccr-2506-1/4.311.3")).toBe(
      "/corpus/modules/us-co/regulations/10-ccr-2506-1/4.311.3.yaml",
    );
  });

  it("every manifest target's module file is fetchable at its moduleUrl", () => {
    for (const entry of manifest.modules) {
      const path = join(corpusDir, moduleUrl(entry.target).replace("/corpus/", ""));
      expect(existsSync(path), entry.target).toBe(true);
    }
  });

  for (const root of ROOTS) {
    it(`slices, compiles, probes, and executes ${root}`, () => {
      const closure = resolveClosure(manifest, root);
      expect(closure.length).toBeGreaterThan(0);
      const modules = Object.fromEntries(
        closure.map((target) => [
          target,
          readFileSync(join(corpusDir, moduleUrl(target).replace("/corpus/", "")), "utf8"),
        ]),
      );
      const artifactJson = engine.compile(JSON.stringify(modules), root) as string;
      const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
      expect(artifact.program.derived.length).toBeGreaterThan(0);

      const { pkg } = synthesizePackage(artifact, root, manifest.sources[0].commit);
      probeFixpoint(engine, artifactJson, artifact, pkg);

      const request = buildPackageRequest({
        pkg,
        answers: { household: {}, people: {}, refOverrides: {} },
      });
      const response = JSON.parse(engine.execute(artifactJson, JSON.stringify(request)));
      const outputs = response.results[0].outputs;
      for (const id of Object.values(pkg.outputs)) {
        expect(outputs[id], `output ${id} present`).toBeDefined();
      }
    });
  }

  /**
   * The whole thesis in one test: a slice compiled from corpus source, plus
   * curation applied as a data overlay (the vendored descriptor's entity
   * plan and screening presumptions, carried by slot name), reproduces the
   * pinned $478 determination — no pre-composed artifact involved.
   */
  it("reproduces the pinned co-snap allotment from source + curation overlay", () => {
    const root = "us-co:policies/cdhs/snap/fy-2026-benefit-calculation";
    const closure = resolveClosure(manifest, root);
    const modules = Object.fromEntries(
      closure.map((target) => [
        target,
        readFileSync(join(corpusDir, moduleUrl(target).replace("/corpus/", "")), "utf8"),
      ]),
    );
    const artifactJson = engine.compile(JSON.stringify(modules), root) as string;
    const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
    const { pkg } = synthesizePackage(artifact, root, manifest.sources[0].commit);

    // The overlay: the vendored descriptor's entity plan (membership
    // relations, count_from) and its screening presumptions by slot name.
    const vendored = JSON.parse(
      readFileSync(join(__dirname, "..", "public", "programs", "co-snap", "package.json"), "utf8"),
    );
    pkg.entities = vendored.entities;
    pkg.query = vendored.query;
    probeFixpoint(engine, artifactJson, artifact, pkg);
    const vendoredByName = new Map<string, { dtype: string; value: unknown }>(
      (Object.values(vendored.defaults) as { name: string; dtype: string; value: unknown }[]).map(
        (slot) => [slot.name, slot],
      ),
    );
    for (const slot of Object.values(pkg.defaults)) {
      const carried = vendoredByName.get(slot.name);
      if (carried && carried.dtype === slot.dtype) slot.value = carried.value;
    }

    // The golden-path household, as ref overrides on the slice.
    const golden: Record<string, string> = {
      household_size: "2",
      snap_countable_earned_income: "1200",
      household_shelter_costs_incurred: "900",
    };
    const refOverrides: Record<string, string> = {};
    for (const [ref, slot] of Object.entries(pkg.defaults)) {
      if (golden[slot.name]) refOverrides[ref] = golden[slot.name];
    }
    pkg.outputs.snap_allotment = "us-co:regulations/10-ccr-2506-1/4.207.2#snap_allotment";

    const request = buildPackageRequest({
      pkg,
      answers: {
        household: { household_size: "2" },
        people: { member_age: ["42", "9"] },
        refOverrides,
      },
    });
    const response = JSON.parse(engine.execute(artifactJson, JSON.stringify(request)));
    const outputs = response.results[0].outputs;
    const allotment = outputs[pkg.outputs.snap_allotment];
    expect(allotment.kind).toBe("scalar");
    expect(allotment.value.value).toBe("478");
    const eligible = outputs[pkg.outputs.snap_eligible];
    expect(eligible.outcome).toBe("holds");
  });
});
