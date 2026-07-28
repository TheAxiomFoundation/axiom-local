/**
 * The web explorer's exact flow, for a spread of catalog subtrees — the
 * invariant the page sells: pick any offerable root, its closure compiles
 * in-tab, its inputs are discovered from the compiled artifact, it runs
 * with synthesized presumptions, and a presumption edit re-runs cleanly.
 * Mirrors CorpusExplorer.tsx step for step (root gate, slice, probe,
 * refOverrides), so a regression here is a regression a visitor would hit.
 */

import { describe, expect, it } from "vitest";
import type { ExecutionResponse } from "@/lib/engine/types";
import { assertSliceableRoot, subtreeCatalog } from "@/lib/corpus";
import { buildPackageRequest } from "@/lib/goldenPath";
import { GOLDEN_ROOT, engine, haveCorpus, loadManifest, sliceAt } from "./sliceHarness";

/** A federal regulation, a state regulation, another state's — the spread. */
const ROOTS = [
  GOLDEN_ROOT,
  "us-co:regulations/10-ccr-2506-1/4.311.3",
  "us-ny:regulations/18-nycrr/385/3",
];

describe.skipIf(!haveCorpus)("web explorer flow", () => {
  const manifest = haveCorpus ? loadManifest() : null!;
  const catalog = haveCorpus ? subtreeCatalog(manifest) : [];

  it("every flow root is actually offerable — in the catalog, sliceable", () => {
    for (const root of ROOTS) {
      expect(catalog.some((entry) => entry.target === root), root).toBe(true);
      expect(() => assertSliceableRoot(root), root).not.toThrow();
    }
  });

  for (const root of ROOTS) {
    describe(`subtree ${root}`, () => {
      const slice = haveCorpus ? sliceAt(manifest, root) : null!;

      it("has inputs to show — the form is never empty", () => {
        expect(Object.keys(slice.pkg.defaults).length).toBeGreaterThan(0);
      });

      const run = (refOverrides: Record<string, string>) => {
        const request = buildPackageRequest({
          pkg: slice.pkg,
          answers: { household: {}, people: {}, refOverrides },
          month: slice.pkg.default_period,
          mode: "explain",
        });
        const response = JSON.parse(
          engine.execute(slice.artifactJson, JSON.stringify(request)),
        ) as ExecutionResponse;
        const result = response.results[0];
        return Object.fromEntries(
          Object.entries(slice.pkg.outputs).map(([name, id]) => {
            const output = result.outputs[id];
            if (!output || output.kind !== "scalar") return [name, output?.outcome ?? null];
            return [name, output.value.value];
          }),
        );
      };

      it("runs on its synthesized presumptions and every output answers", () => {
        const outputs = run({});
        expect(Object.keys(outputs).length).toBeGreaterThan(0);
        for (const [name, value] of Object.entries(outputs)) {
          expect(value, `output ${name} answered`).not.toBeNull();
        }
      });

      it("accepts a presumption edit through the editor's refOverrides path", () => {
        // Flip the first bool presumption (or bump the first numeric one) —
        // exactly what typing in the PresumptionEditor produces.
        const entries = Object.entries(slice.pkg.defaults);
        const bool = entries.find(([, slot]) => slot.dtype === "bool");
        const numeric = entries.find(
          ([, slot]) => slot.dtype === "decimal" || slot.dtype === "integer",
        );
        const [ref, slot] = bool ?? numeric ?? entries[0];
        const edited =
          slot.dtype === "bool"
            ? String(slot.value).toLowerCase() === "true"
              ? "false"
              : "true"
            : String(Number(String(slot.value).replace(/[$,\s]/g, "") || 0) + 1);
        const outputs = run({ [ref]: edited });
        for (const [name, value] of Object.entries(outputs)) {
          expect(value, `output ${name} answered after edit`).not.toBeNull();
        }
      });
    });
  }
});
