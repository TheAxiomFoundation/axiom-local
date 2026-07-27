/**
 * Every vendored program must hold the packaging invariants: the descriptor
 * covers everything discovery can see, the example case executes cleanly
 * through the page's own request path, and every declared output answers.
 * Program-specific values are pinned only where a reference suite pins them
 * (ny-snap, in goldenPath.test.ts).
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
    certification: "certified" | "encoded";
    certified?: { ledger_id: string; certified_set_version: string };
  }[];
};
const lock = JSON.parse(readFileSync(join(__dirname, "..", "corpus.lock.json"), "utf8")) as {
  ledger: { ledger_id: string; certified_set_version: string };
};

it("the registry publishes the full catalog — certified AND encoded", () => {
  // Certification is a status, not a gate (the launch posture): the
  // registry carries the flagship certified program plus everything else
  // that compiles, labeled "encoded". A single-program registry here means
  // the permissive vendor pipeline regressed to the hard cut.
  expect(index.programs.length).toBeGreaterThan(1);
  expect(index.programs.some((entry) => entry.certification === "certified")).toBe(true);
  expect(index.programs.some((entry) => entry.certification === "encoded")).toBe(true);
});

it("every entry wears a status; only certified ones carry ledger identity", () => {
  for (const entry of index.programs) {
    expect(["certified", "encoded"], entry.id).toContain(entry.certification);
    if (entry.certification === "certified") {
      expect(entry.certified, entry.id).toEqual(lock.ledger);
    } else {
      // An encoded entry must not wear certified identity it did not earn.
      expect(entry.certified, entry.id).toBeUndefined();
    }
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

    it("carries the certification status and provenance its registry entry claims", () => {
      expect(pkg.certification).toBe(entry.certification);
      // Certified: descriptor stamp matches the registry identity.
      // Encoded: no stamp — a certificate that was not earned must not
      // appear anywhere.
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
