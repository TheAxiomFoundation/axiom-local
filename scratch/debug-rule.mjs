import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { buildPackageRequest } from "../src/lib/goldenPath.ts";
const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js");
const [id, ...names] = process.argv.slice(2);
const dir = `../public/programs/${id}`;
const artifactJson = readFileSync(`${dir}/artifact.json`, "utf8");
const artifact = JSON.parse(artifactJson);
const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"));
const byname = Object.fromEntries(artifact.program.derived.map(d => [d.name, d]));
// query the requested rules directly, on their own entities
const answers = { ...pkg.example, refOverrides: {} };
const base = buildPackageRequest({ pkg, answers });
for (const name of names) {
  const rule = byname[name];
  const entity = rule.entity;
  const ids = entity === "Person" ? ["person:1:1", "person:1:2"] : [pkg.entities.find(e => e.entity === entity)?.id_template.replace("{index}", "1") ?? entity.toLowerCase() + ":1"];
  for (const eid of ids) {
    const req = { ...base, queries: [{ entity_id: eid, period: base.queries[0].period, outputs: [rule.id || rule.name] }] };
    try {
      const res = JSON.parse(engine.execute(artifactJson, JSON.stringify(req)));
      const o = Object.values(res.results[0].outputs)[0];
      console.log(`${name} @ ${eid}:`, o.kind === "scalar" ? o.value.value : o.outcome);
    } catch (e) { console.log(`${name} @ ${eid}: ERROR ${String(e).slice(0, 80)}`); }
  }
}
