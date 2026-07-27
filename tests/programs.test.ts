/**
 * Every vendored program must hold the packaging invariants: the descriptor
 * covers everything discovery can see, the example case executes cleanly
 * through the page's own request path, and every declared output answers.
 * Program-specific values are pinned only where a reference suite pins them
 * (co-snap, in goldenPath.test.ts).
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompiledProgramArtifact, EngineBindings, ExecutionResponse } from "@/lib/engine/types";
import { collectStructuralDemands } from "@/lib/corpus";
import { discoverInputs } from "@/lib/program";
import { buildPackageRequest, type GoldenPackage } from "@/lib/goldenPath";
import { buildDisplayTree } from "@/lib/trace";

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js") as EngineBindings;

const programsDir = join(__dirname, "..", "public", "programs");
const index = JSON.parse(readFileSync(join(programsDir, "index.json"), "utf8")) as {
  programs: {
    id: string;
    title: string;
    provenance: "envelope" | "legacy";
    certified?: { ledger_id: string; certified_set_version: string };
  }[];
};
const lock = JSON.parse(readFileSync(join(__dirname, "..", "corpus.lock.json"), "utf8")) as {
  ledger: { ledger_id: string; certified_set_version: string };
};

it("the registry serves at least one certified program", () => {
  // Under the certified gate the catalog is exactly what the ledger
  // covers — currently the NY SNAP direct-compile closure. An empty
  // registry would be a valid (honest) state, but this repo ships a
  // ledger that certifies it, so an empty registry here means the vendor
  // pipeline regressed.
  expect(index.programs.length).toBeGreaterThanOrEqual(1);
});

it("every registry entry carries the vendored ledger's identity", () => {
  for (const entry of index.programs) {
    expect(entry.certified, entry.id).toEqual(lock.ledger);
  }
});

for (const entry of index.programs) {
  describe(`program ${entry.id} (${entry.provenance})`, () => {
    const dir = join(programsDir, entry.id);
    const artifactJson = readFileSync(join(dir, "artifact.json"), "utf8");
    const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as GoldenPackage;
    const envelope = entry.provenance === "envelope";

    it("is sha-256 pinned", () => {
      expect(pkg.source.artifact_sha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it.skipIf(!envelope)("carries the provenance envelope the vendored engine expects", () => {
      expect(artifact.artifact_format_version).toBe(engine.artifact_format_version());
      expect(artifact.engine_version).toBe(engine.engine_version());
    });

    it.skipIf(!envelope)("declares every input discovery can see", () => {
      // By NAME, not ref: certified descriptors collapse per-module input
      // spellings to the package prefix the ledger vouches for, so the
      // durable refs differ from discovery's while covering the same slots.
      const declared = new Set(Object.values(pkg.defaults).map((slot) => slot.name));
      for (const input of discoverInputs(artifact)) {
        expect(declared.has(input.name), input.name).toBe(true);
      }
    });

    it("carries certificate provenance matching its registry entry", () => {
      expect(pkg.certified?.ledger_id).toBe(entry.certified?.ledger_id);
      expect(pkg.certified?.certified_set_version).toBe(entry.certified?.certified_set_version);
    });

    it("no division-denominator input carries a zero presumption", () => {
      // A zero presumption in a denominator traps the whole program with
      // "division by zero" the moment a visitor edits a related field.
      const { denominators } = collectStructuralDemands(artifact);
      for (const slot of Object.values(pkg.defaults)) {
        if (!denominators.has(slot.name)) continue;
        if (slot.dtype !== "decimal" && slot.dtype !== "integer") continue;
        expect(Number(slot.value), `${slot.name} presumes 0`).not.toBe(0);
      }
    });

    it("every headline slot resolves to a declared input", () => {
      for (const headline of pkg.headline) {
        const hit = Object.values(pkg.defaults).find(
          (slot) => slot.name === headline.slot && slot.entity === headline.entity,
        );
        expect(hit, headline.slot).toBeDefined();
      }
    });

    const answers = {
      household: { ...pkg.example.household },
      people: pkg.example.people ?? {},
      refOverrides: {},
    };
    const request = buildPackageRequest({ pkg, answers });
    const response = JSON.parse(
      engine.execute(artifactJson, JSON.stringify(request)),
    ) as ExecutionResponse;

    it("executes the example case in explain mode with every output answering", () => {
      expect(response.metadata.actual_mode).toBe("explain");
      for (const [name, id] of Object.entries(pkg.outputs)) {
        expect(response.results[0].outputs[id], name).toBeDefined();
      }
    });

    it.skipIf(!envelope)("builds a citation tree for the first output", () => {
      const tree = buildDisplayTree({
        outputId: pkg.outputs[Object.keys(pkg.outputs)[0]],
        result: response.results[0],
        artifact,
        dataset: request.dataset,
      });
      expect(tree).not.toBeNull();
      expect(tree?.refId.length).toBeGreaterThan(0);
    });
  });
}
