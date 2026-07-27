/**
 * The NY SNAP golden path: the artifact compiled directly from the pinned
 * corpus, executed by the vendored engine through the descriptor in
 * public/programs/ny-snap/, must reproduce the canonical two-person
 * household: $478 monthly benefit, $226.50 net income — the same values
 * axiom-api's parity suite pins for these facts (the federal arithmetic
 * dominates this household).
 *
 * The golden path is also the certified path: the descriptor must carry
 * certificate provenance that matches the vendored ledger, or the runtime
 * loader would refuse the very program this test blesses.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CompiledProgramArtifact, EngineBindings, ExecutionResponse } from "@/lib/engine/types";
import {
  assertPackageCertified,
  certifiedSetVersion,
  collectClosureIds,
  findUncertified,
  validateLedger,
} from "@/lib/certified";
import { discoverInputs } from "@/lib/program";
import { buildPackageRequest, type GoldenPackage } from "@/lib/goldenPath";

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js") as EngineBindings;

const programDir = join(__dirname, "..", "public", "programs", "ny-snap");
const artifactJson = readFileSync(join(programDir, "artifact.json"), "utf8");
const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
const pkg = JSON.parse(readFileSync(join(programDir, "package.json"), "utf8")) as GoldenPackage;
const ledgerRaw = JSON.parse(
  readFileSync(join(__dirname, "..", "data", "certified-nodes.json"), "utf8"),
);

/** The canonical household: two people (42, 9), $1,200 wages, $900 shelter. */
const PARITY_ANSWERS = {
  household: {
    household_size: "2",
    snap_gross_monthly_earned_income: "1200",
    household_shelter_costs_incurred: "900",
  },
  people: { member_age: ["42", "9"] },
};

describe("the vendored engine accepts the direct-compiled artifact", () => {
  it("carries the provenance envelope the vendored engine expects", () => {
    expect(artifact.artifact_format_version).toBe(engine.artifact_format_version());
    expect(artifact.engine_version).toBe(engine.engine_version());
  });

  it("addresses every discovered input through the certified prefix spelling", () => {
    // The descriptor collapses per-module input spellings to the package
    // prefix the ledger certifies; every discovered NAME must still be
    // declared, and no ref may use another spelling.
    const prefix = "us-ny:policies/otda/snap/fy-2026-benefit-calculation#input.";
    const declaredNames = new Set(Object.values(pkg.defaults).map((slot) => slot.name));
    for (const input of discoverInputs(artifact)) {
      expect(declaredNames.has(input.name), input.name).toBe(true);
    }
    for (const ref of Object.keys(pkg.defaults)) {
      expect(ref.startsWith(prefix), ref).toBe(true);
    }
  });

  it("every headline slot resolves to at least one declared input", () => {
    for (const headline of pkg.headline) {
      const hits = Object.values(pkg.defaults).filter(
        (slot) => slot.name === headline.slot && slot.entity === headline.entity,
      );
      expect(hits.length, headline.slot).toBeGreaterThan(0);
    }
  });
});

describe("certificate provenance — the reason this program is servable at all", () => {
  it("carries a stamp that matches the vendored ledger identity", async () => {
    const certified = await validateLedger(ledgerRaw);
    expect(pkg.certified).toBeDefined();
    expect(pkg.certified?.ledger_id).toBe(certified.ledger.ledger_id);
    expect(pkg.certified?.certified_set_version).toBe(
      await certifiedSetVersion(certified.ledger.entries),
    );
    // The loader's own gate must accept the shipped descriptor.
    assertPackageCertified(pkg, certified);
  });

  it("names a certificate for every output, matching the ledger's", async () => {
    const certified = await validateLedger(ledgerRaw);
    for (const [name, id] of Object.entries(pkg.outputs)) {
      const certificate = pkg.certified?.certificates[name];
      expect(certificate, name).toBeDefined();
      expect(certificate, name).toBe(certified.byId.get(id)?.certificate_id);
    }
  });

  it("has a fully certified node closure — nothing served is uncertified", async () => {
    const certified = await validateLedger(ledgerRaw);
    const missing = findUncertified(
      collectClosureIds(artifact, Object.keys(pkg.defaults)),
      certified,
    );
    expect(missing).toEqual([]);
  });
});

describe("the pinned parity case, through the page's own request path", () => {
  const request = buildPackageRequest({ pkg, answers: PARITY_ANSWERS });
  const response = JSON.parse(
    engine.execute(artifactJson, JSON.stringify(request)),
  ) as ExecutionResponse;

  it("executes in explain mode", () => {
    expect(response.metadata.requested_mode).toBe("explain");
    expect(response.metadata.actual_mode).toBe("explain");
  });

  it("computes the $478 benefit the parity suite pins", () => {
    const output = response.results[0].outputs[pkg.outputs.snap_benefit_amount];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    expect(output.value).toEqual({ kind: "decimal", value: "478" });
  });

  it("computes the $226.50 net income the parity suite pins", () => {
    const output = response.results[0].outputs[pkg.outputs.snap_net_income];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    expect(output.value).toEqual({ kind: "decimal", value: "226.5" });
  });

  it("finds the household eligible", () => {
    const output = response.results[0].outputs[pkg.outputs.snap_eligible];
    expect(output.kind).not.toBe("scalar");
    expect((output as { outcome?: string }).outcome).toBe("holds");
  });
});

describe("the member_of_household relations actually bind people to the household", () => {
  const benefitFor = (people: Record<string, string[]>, shelter: string) => {
    const request = buildPackageRequest({
      pkg,
      answers: {
        household: {
          household_size: "2",
          snap_gross_monthly_earned_income: "1200",
          household_shelter_costs_incurred: shelter,
        },
        people,
      },
    });
    const response = JSON.parse(
      engine.execute(artifactJson, JSON.stringify(request)),
    ) as ExecutionResponse;
    const output = response.results[0].outputs[pkg.outputs.snap_benefit_amount];
    if (output.kind !== "scalar") throw new Error(`expected scalar, got ${output.kind}`);
    return output.value;
  };

  it("an elderly-or-disabled member lifts the excess-shelter cap", () => {
    // With $2,000 shelter costs the excess-shelter deduction hits the cap
    // for a household with no elderly or disabled member; flagging one
    // lifts the cap, so the benefit must differ. If the relation records
    // were silently dropped, the person-level flag could never reach the
    // household-level rule and these two values would be equal.
    const capped = benefitFor({ member_age: ["42", "9"] }, "2000");
    const lifted = benefitFor(
      { member_age: ["70", "9"], snap_member_is_elderly_or_disabled: ["1", "0"] },
      "2000",
    );
    expect(capped).not.toEqual(lifted);
  });
});
