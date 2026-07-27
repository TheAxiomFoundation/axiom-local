/**
 * The web Runner's exact flow, for EVERY vendored program — the invariant
 * the page sells: pick any program in the dropdown, see its inputs, edit a
 * presumption, run, get outputs. Mirrors Runner.tsx step for step (example
 * seeding, per-person list growth, refOverrides), so a regression here is a
 * regression a visitor would hit.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EngineBindings, ExecutionResponse } from "@/lib/engine/types";
import { buildPackageRequest, type GoldenAnswers, type GoldenPackage } from "@/lib/goldenPath";

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js") as EngineBindings;

const programsDir = join(__dirname, "..", "public", "programs");
const index = JSON.parse(readFileSync(join(programsDir, "index.json"), "utf8")) as {
  programs: { id: string; provenance?: "envelope" | "legacy" }[];
};

/** What Runner.tsx does between "program selected" and "outputs rendered". */
function runnerFlow(pkg: GoldenPackage, artifactJson: string, refOverrides: Record<string, string>) {
  // Seed from the example exactly as the effect does (join → split round-trip).
  const household = { ...pkg.example.household };
  const peopleText = Object.fromEntries(
    Object.entries(pkg.example.people ?? {}).map(([slot, values]) => [slot, values.join(", ")]),
  );
  const answers: GoldenAnswers = {
    household,
    people: Object.fromEntries(
      Object.entries(peopleText).map(([slot, text]) => [
        slot,
        text
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value !== ""),
      ]),
    ),
    refOverrides,
  };
  const sizeSlot = pkg.entities.find((entity) => entity.count_from)?.count_from;
  if (sizeSlot) {
    const lists = Object.values(answers.people ?? {}).filter((values) => values.length > 0);
    if (lists.length > 0) {
      answers.household[sizeSlot] = String(Math.max(...lists.map((v) => v.length)));
    }
  }
  const request = buildPackageRequest({ pkg, answers, month: pkg.default_period, mode: "explain" });
  const response = JSON.parse(
    engine.execute(artifactJson, JSON.stringify(request)),
  ) as ExecutionResponse;
  const result = response.results[0];
  return Object.fromEntries(
    Object.keys(pkg.outputs).map((name) => {
      const output = result.outputs[pkg.outputs[name]];
      if (!output || output.kind !== "scalar") return [name, output?.outcome ?? null];
      return [name, output.value.value];
    }),
  );
}

for (const entry of index.programs) {
  describe(`web runner flow: ${entry.id}`, () => {
    const dir = join(programsDir, entry.id);
    const artifactJson = readFileSync(join(dir, "artifact.json"), "utf8");
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as GoldenPackage;

    it("has inputs to show — the form is never empty", () => {
      expect(Object.keys(pkg.defaults).length).toBeGreaterThan(0);
    });

    it("runs with the seeded example and every output answers", () => {
      const outputs = runnerFlow(pkg, artifactJson, {});
      expect(Object.keys(outputs).length).toBeGreaterThan(0);
      for (const [name, value] of Object.entries(outputs)) {
        expect(value, `output ${name} answered`).not.toBeNull();
      }
    });

    it("accepts a presumption edit through the editor's refOverrides path", () => {
      // Flip the first bool presumption (or bump the first numeric one) —
      // exactly what typing in the PresumptionEditor produces.
      const entries = Object.entries(pkg.defaults);
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
      const outputs = runnerFlow(pkg, artifactJson, { [ref]: edited });
      for (const [name, value] of Object.entries(outputs)) {
        expect(value, `output ${name} answered after edit`).not.toBeNull();
      }
    });
  });
}
