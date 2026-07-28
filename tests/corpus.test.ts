/**
 * Corpus slicing, end to end against the vendored nodejs wasm build:
 * resolve a closure from the generated manifest, compile it, check it
 * against the certification ledger, synthesize a descriptor, probe to a
 * fixpoint, execute. Skipped when public/corpus/ has not been generated
 * (it is gitignored; CI regenerates it from corpus.lock.json).
 *
 * The offerable surface is the subtree catalog: corpus modules minus
 * Axiom-authored composition/pipeline assembly (excluded from listings,
 * REFUSED as roots) and minus rule-less shells. Both certification
 * postures are asserted: under PERMISSIVE (the default) every catalog
 * root slices and runs wearing its status; under ENFORCED
 * (assertArtifactCertified — pinned explicitly, so the gate cannot rot
 * while it waits behind the launch switch) a root whose closure carries
 * ANY uncertified node refuses, naming the ids (dev-tooling context).
 */
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertArtifactCertified,
  collectClosureIds,
  findUncertified,
  validateLedger,
  type CertifiedIndex,
} from "../src/lib/certified";
import {
  assertSliceableRoot,
  isCompositionPath,
  moduleUrl,
  subtreeCatalog,
  synthesizePackage,
  probeFixpoint,
} from "../src/lib/corpus";
import { buildPackageRequest } from "../src/lib/goldenPath";
import {
  GOLDEN_ROOT,
  compileAt,
  corpusDir,
  engine,
  haveCorpus,
  loadManifest,
} from "./sliceHarness";

const COMPOSITION_ROOT = "us-ny:policies/otda/snap/fy-2026-benefit-calculation";
const UNCERTIFIED_ROOTS = [
  "us-co:regulations/10-ccr-2506-1/4.311.3",
  "us-ny:regulations/18-nycrr/385/3",
];

describe("composition/pipeline exclusion (isCompositionPath)", () => {
  it("matches axiom-authored assembly in policy buckets", () => {
    for (const target of [
      "us:policies/usda/snap/state-plan-composition",
      "us-ny:policies/otda/snap/fy-2026-benefit-calculation",
      "us-co:policies/cdhs/snap/fy-2026-benefit-calculation",
      "us-az:policies/des/faa5/na-eligibility-and-benefit-determination/fy-2026-benefit-calculation",
      "us:policies/usda/snap/composition",
      "us:policies/usda/snap/composition/bridge",
    ]) {
      expect(isCompositionPath(target), target).toBe(true);
    }
  });

  it("matches the mis-kinded pilot pipeline family in ANY bucket", () => {
    // The `pilot_*_oracle_pipeline` modules live even inside statute and
    // regulation buckets — the suffix check is bucket-agnostic.
    expect(isCompositionPath("us:statutes/7/pilot_snap_oracle_pipeline")).toBe(true);
    expect(isCompositionPath("us-tx:regulations/1-tac/pilot_tanf_oracle_pipeline")).toBe(true);
  });

  it("passes real law through — statutes, regulations, non-assembly policies", () => {
    for (const target of [
      "us:statutes/7/2014/e",
      "us-la:statutes/47:294",
      "us-co:regulations/10-ccr-2506-1/4.311.3",
      "us-ny:regulations/18-nycrr/385/3",
      "us:policies/usda/snap/fy-2026-cola/maximum-allotments",
    ]) {
      expect(isCompositionPath(target), target).toBe(false);
    }
  });

  it("refuses a composition root as a slice root, with an honest message", () => {
    expect(() => assertSliceableRoot(COMPOSITION_ROOT)).toThrowError(
      /composition\/pipeline assembly, not law.*cannot be sliced/s,
    );
    expect(() => assertSliceableRoot("us:statutes/7/2014/e")).not.toThrow();
  });
});

describe.skipIf(!haveCorpus)("the subtree catalog", () => {
  const manifest = haveCorpus ? loadManifest() : null!;
  const catalog = haveCorpus ? subtreeCatalog(manifest) : [];

  it("offers real law only: no composition/pipeline paths, no rule-less shells", () => {
    expect(catalog.length).toBeGreaterThan(0);
    for (const entry of catalog) {
      expect(isCompositionPath(entry.target), entry.target).toBe(false);
      expect(entry.rules.length, entry.target).toBeGreaterThan(0);
    }
  });

  it("carries the golden-path subtree, and not the composition it also feeds", () => {
    expect(catalog.some((entry) => entry.target === GOLDEN_ROOT)).toBe(true);
    expect(catalog.some((entry) => entry.target === COMPOSITION_ROOT)).toBe(false);
    // The composition module itself stays in the MANIFEST — closures need
    // it — the catalog is what got smaller.
    expect(manifest.modules.some((entry) => entry.target === COMPOSITION_ROOT)).toBe(true);
    expect(catalog.length).toBeLessThan(manifest.modules.length);
  });
});

describe.skipIf(!haveCorpus)("corpus slicing under the certified gate", async () => {
  const manifest = haveCorpus ? loadManifest() : null!;
  const certified: CertifiedIndex = haveCorpus
    ? await validateLedger(JSON.parse(readFileSync(join(corpusDir, "ledger.json"), "utf8")))
    : null!;

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

  for (const root of UNCERTIFIED_ROOTS) {
    it(`ENFORCED: refuses the uncertified root ${root}, naming the ids`, () => {
      const { artifactJson, artifact } = compileAt(manifest, root);
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

  it("PERMISSIVE: an uncertified root slices, runs, and wears the encoded label", () => {
    // The explorer's default path: no refusal — compile, probe, execute,
    // and compute the status the provenance line shows.
    const root = UNCERTIFIED_ROOTS[0];
    const { artifactJson, artifact } = compileAt(manifest, root);
    const { pkg } = synthesizePackage(artifact, root, manifest.sources[0].commit);
    probeFixpoint(engine, artifactJson, artifact, pkg);
    const certification =
      findUncertified(collectClosureIds(artifact, Object.keys(pkg.defaults)), certified)
        .length === 0
        ? "certified"
        : "encoded";
    expect(certification).toBe("encoded");

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
});
