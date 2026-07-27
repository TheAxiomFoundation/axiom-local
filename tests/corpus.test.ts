/**
 * Corpus slicing, end to end against the vendored nodejs wasm build:
 * resolve a closure from the generated manifest, compile it, gate it
 * against the certification ledger, synthesize a descriptor, probe to a
 * fixpoint, execute. Skipped when public/corpus/ has not been generated
 * (it is gitignored; CI runs without it).
 *
 * The gate cuts both ways and both are asserted here: the certified root
 * slices and runs; roots whose closure carries ANY uncertified node
 * refuse, naming the ids (dev-tooling context).
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompiledProgramArtifact } from "../src/lib/engine/types";
import {
  assertArtifactCertified,
  validateLedger,
  type CertifiedIndex,
} from "../src/lib/certified";
import {
  moduleUrl,
  probeFixpoint,
  resolveClosure,
  synthesizePackage,
  type CorpusManifest,
} from "../src/lib/corpus";
import { buildPackageRequest, type GoldenPackage } from "../src/lib/goldenPath";

const require = createRequire(import.meta.url);
const corpusDir = join(__dirname, "..", "public", "corpus");
const manifestPath = join(corpusDir, "manifest.json");
const haveCorpus = existsSync(manifestPath);

const CERTIFIED_ROOT = "us-ny:policies/otda/snap/fy-2026-benefit-calculation";
const UNCERTIFIED_ROOTS = [
  "us-co:regulations/10-ccr-2506-1/4.311.3",
  "us-ny:regulations/18-nycrr/385/3",
  "us-co:policies/cdhs/snap/fy-2026-benefit-calculation",
];

describe.skipIf(!haveCorpus)("corpus slicing under the certified gate", async () => {
  const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js");
  const manifest = haveCorpus
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as CorpusManifest)
    : null!;
  const certified: CertifiedIndex = haveCorpus
    ? await validateLedger(JSON.parse(readFileSync(join(corpusDir, "ledger.json"), "utf8")))
    : null!;

  const compileAt = (root: string) => {
    const closure = resolveClosure(manifest, root);
    const modules = Object.fromEntries(
      closure.map((target) => [
        target,
        readFileSync(join(corpusDir, moduleUrl(target).replace("/corpus/", "")), "utf8"),
      ]),
    );
    const artifactJson = engine.compile(JSON.stringify(modules), root) as string;
    return { closure, artifactJson, artifact: JSON.parse(artifactJson) as CompiledProgramArtifact };
  };

  it("records its source commit and its ledger identity", () => {
    expect(manifest.sources[0].repo).toContain("rulespec");
    expect(manifest.sources[0].commit).toMatch(/^[0-9a-f]{40}$/);
    const lock = JSON.parse(
      readFileSync(join(__dirname, "..", "corpus.lock.json"), "utf8"),
    ) as { ledger: { ledger_id: string; certified_set_version: string } };
    expect(lock.ledger.ledger_id).toBe(certified.ledger.ledger_id);
    expect(lock.ledger.certified_set_version).toBe(certified.setVersion);
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

  it(`slices, gates, probes, and executes the certified root ${CERTIFIED_ROOT}`, () => {
    const { closure, artifactJson, artifact } = compileAt(CERTIFIED_ROOT);
    expect(closure.length).toBeGreaterThan(0);
    expect(artifact.program.derived.length).toBeGreaterThan(0);

    const { pkg } = synthesizePackage(artifact, CERTIFIED_ROOT, manifest.sources[0].commit);
    // The explorer's own gate order: post-compile, and again post-probe
    // for the refs the probe admitted.
    assertArtifactCertified(artifact, Object.keys(pkg.defaults), certified);
    probeFixpoint(engine, artifactJson, artifact, pkg);
    assertArtifactCertified(artifact, Object.keys(pkg.defaults), certified);

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

  for (const root of UNCERTIFIED_ROOTS) {
    it(`refuses the uncertified root ${root}, naming the ids`, () => {
      const { artifactJson, artifact } = compileAt(root);
      const { pkg } = synthesizePackage(artifact, root, manifest.sources[0].commit);
      expect(artifactJson.length).toBeGreaterThan(0);
      expect(() =>
        assertArtifactCertified(artifact, Object.keys(pkg.defaults), certified),
      ).toThrowError(/closure not certified .*uncertified node id/s);
      // The refusal names at least one concrete uncertified legal id, so a
      // maintainer can see exactly what the ledger is missing.
      try {
        assertArtifactCertified(artifact, Object.keys(pkg.defaults), certified);
      } catch (error) {
        expect(String(error)).toMatch(new RegExp(`${root.split(":")[0]}:[^\\s]+`));
      }
    });
  }

  /**
   * The whole thesis in one test: a slice compiled from corpus source,
   * plus curation applied as a data overlay (the vendored descriptor's
   * entity plan and screening presumptions, carried by slot name),
   * reproduces the pinned $478 determination — no pre-composed artifact
   * involved, every node certified.
   */
  it("reproduces the pinned ny-snap benefit from source + curation overlay", () => {
    const { artifactJson, artifact } = compileAt(CERTIFIED_ROOT);
    const { pkg } = synthesizePackage(artifact, CERTIFIED_ROOT, manifest.sources[0].commit);

    const vendored = JSON.parse(
      readFileSync(join(__dirname, "..", "public", "programs", "ny-snap", "package.json"), "utf8"),
    ) as GoldenPackage;
    pkg.entities = vendored.entities;
    pkg.query = vendored.query;
    const vendoredByName = new Map(
      Object.values(vendored.defaults).map((slot) => [slot.name, slot]),
    );
    for (const slot of Object.values(pkg.defaults)) {
      const carried = vendoredByName.get(slot.name);
      if (carried && carried.dtype === slot.dtype) slot.value = carried.value;
    }
    probeFixpoint(engine, artifactJson, artifact, pkg);
    assertArtifactCertified(artifact, Object.keys(pkg.defaults), certified);
    pkg.outputs = vendored.outputs;

    const request = buildPackageRequest({
      pkg,
      answers: {
        household: {
          household_size: "2",
          snap_gross_monthly_earned_income: "1200",
          household_shelter_costs_incurred: "900",
        },
        people: { member_age: ["42", "9"] },
        refOverrides: {},
      },
    });
    const response = JSON.parse(engine.execute(artifactJson, JSON.stringify(request)));
    const outputs = response.results[0].outputs;
    const benefit = outputs[pkg.outputs.snap_benefit_amount];
    expect(benefit.kind).toBe("scalar");
    expect(benefit.value.value).toBe("478");
    const eligible = outputs[pkg.outputs.snap_eligible];
    expect(eligible.outcome).toBe("holds");
  });
});
