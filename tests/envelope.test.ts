/**
 * The determination envelope (src/lib/envelope.ts): the pure builder both
 * the page's JSON affordance and the CLI's --json call. The golden-path
 * run's envelope must carry the pinned outputs, the ledger/lock identity,
 * the compiled closure, and honest stated-vs-presumed input flags —
 * hosted-API naming (rule_id / variable / sources) throughout.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExecutionResponse } from "@/lib/engine/types";
import { validateLedger } from "@/lib/certified";
import { buildDeterminationEnvelope, envelopeFilename } from "@/lib/envelope";
import { buildPackageRequest, type GoldenAnswers } from "@/lib/goldenPath";
import { GOLDEN_ROOT, corpusDir, engine, haveCorpus, loadManifest, sliceAt } from "./sliceHarness";

const ANSWERS: GoldenAnswers = {
  household: {
    household_size: "2",
    snap_gross_monthly_earned_income: "1200",
    snap_total_allowable_shelter_expenses: "900",
  },
  people: {},
  refOverrides: {},
};

describe("envelopeFilename", () => {
  it("slugs the root into a sensible download name", () => {
    expect(envelopeFilename("us:regulations/7-cfr/273/10")).toBe(
      "us-regulations-7-cfr-273-10-determination.json",
    );
    // Dotted section numbers survive ("4.311.3"); separators collapse.
    expect(envelopeFilename("us-co:regulations/10-ccr-2506-1/4.311.3")).toBe(
      "us-co-regulations-10-ccr-2506-1-4.311.3-determination.json",
    );
  });
});

describe.skipIf(!haveCorpus)("the golden-path determination envelope", async () => {
  const manifest = haveCorpus ? loadManifest() : null!;
  const slice = haveCorpus ? sliceAt(manifest, GOLDEN_ROOT) : null!;
  const certified = haveCorpus
    ? await validateLedger(JSON.parse(readFileSync(join(corpusDir, "ledger.json"), "utf8")))
    : null!;
  const lock = haveCorpus
    ? (JSON.parse(readFileSync(join(__dirname, "..", "corpus.lock.json"), "utf8")) as {
        sources: { repo: string; commit: string }[];
        ledger: { ledger_id: string; certified_set_version: string };
      })
    : null!;

  const request = haveCorpus ? buildPackageRequest({ pkg: slice.pkg, answers: ANSWERS }) : null!;
  const response = haveCorpus
    ? (JSON.parse(engine.execute(slice.artifactJson, JSON.stringify(request))) as ExecutionResponse)
    : null!;
  const envelope = haveCorpus
    ? buildDeterminationEnvelope({
        root: GOLDEN_ROOT,
        closure: slice.closure,
        source: manifest.sources[0],
        pkg: slice.pkg,
        artifact: slice.artifact,
        request,
        response,
        answers: ANSWERS,
        certification: "encoded",
        ledger: {
          ledger_id: certified.ledger.ledger_id,
          certified_set_version: certified.setVersion,
        },
      })
    : null!;

  it("carries engine + runtime provenance, honestly offline", () => {
    expect(envelope.engine).toBe("axiom");
    expect(envelope.runtime.id).toBe("axiom-local");
    expect(envelope.runtime.mode).toBe("local-wasm");
    expect(envelope.runtime.engine_version).toBe(engine.engine_version());
    expect(envelope.runtime.artifact_format_version).toBe(engine.artifact_format_version());
  });

  it("carries the pinned golden-path outputs", () => {
    expect(envelope.outputs.snap_monthly_allotment).toBe("478");
    expect(envelope.outputs.snap_net_monthly_income).toBe("226");
  });

  it("carries the corpus pin and the exact compiled closure", () => {
    expect(envelope.root).toBe(GOLDEN_ROOT);
    expect(envelope.jurisdiction).toBe("us");
    // The manifest's commit IS the lock's commit — the identity a deploy
    // regenerates from.
    expect(envelope.corpus.commit).toBe(lock.sources[0].commit);
    expect(envelope.corpus.repo).toBe(lock.sources[0].repo);
    expect(envelope.corpus.modules).toEqual(slice.closure);
    expect(envelope.corpus.modules).toContain(GOLDEN_ROOT);
  });

  it("carries the ledger identity the run was checked against — the lock's", () => {
    expect(envelope.certification).toBe("encoded");
    expect(envelope.ledger).toEqual(lock.ledger);
  });

  it("flags stated facts against presumed inputs, per applied record", () => {
    const stated = envelope.inputs.filter((input) => input.stated);
    expect(new Set(stated.map((input) => input.name))).toEqual(
      new Set(Object.keys(ANSWERS.household)),
    );
    const presumed = envelope.inputs.filter((input) => !input.stated);
    expect(presumed.length).toBeGreaterThan(0);
    for (const input of envelope.inputs) {
      expect(input.ref.startsWith(`${GOLDEN_ROOT}#input.`), input.ref).toBe(true);
    }
  });

  it("carries the trace in hosted naming: rule_id, variable, value, sources", () => {
    expect(envelope.trace.length).toBeGreaterThan(0);
    const allotment = envelope.trace.find(
      (node) => node.rule_id === `${GOLDEN_ROOT}#snap_monthly_allotment`,
    );
    expect(allotment).toBeDefined();
    expect(allotment?.variable).toBe("snap_monthly_allotment");
    expect(allotment?.value).toBe("478");
    for (const node of envelope.trace) {
      expect(Array.isArray(node.sources), node.rule_id).toBe(true);
    }
  });

  it("no fabricated fields: current law means null amendment, no warnings", () => {
    expect(envelope.amendment).toBeNull();
    expect(envelope.warnings).toEqual([]);
  });
});
