import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { buildPackageRequest } from "../src/lib/goldenPath.ts";
const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js");
const dir = "../public/programs/fl-tca";
const artifactJson = readFileSync(`${dir}/artifact.json`, "utf8");
const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
const answers = {
  household: {
    adjusted_gross_earned_income: "800",
    assistance_group_size: "2",
  },
  people: {},
  refOverrides: {},
};
// also set TanfUnit filing_unit_size via household map (applies by slot name on its entity)
answers.household.filing_unit_size = "2";
const base = buildPackageRequest({ pkg, answers });
const artifact = JSON.parse(artifactJson);
const byname = Object.fromEntries(artifact.program.derived.map(d => [d.name, d]));
for (const [name, eid] of [["fl_tca_payment_standard", "household:1"], ["fl_tca_payment_standard", "tanfunit:1"]]) {
  const rule = byname[name];
  const req = { ...base, queries: [{ entity_id: eid, period: base.queries[0].period, outputs: [rule.id || rule.name] }] };
  try {
    const res = JSON.parse(engine.execute(artifactJson, JSON.stringify(req)));
    const o = Object.values(res.results[0].outputs)[0];
    console.log(`${name}@${eid}:`, o.kind === "scalar" ? o.value.value : o.outcome);
  } catch (e) { console.log(`${name}@${eid}: ERR ${String(e).slice(0, 110)}`); }
}
