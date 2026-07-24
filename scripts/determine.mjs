/**
 * Run the Colorado SNAP determination locally — same engine, same composed
 * artifact, same request path as the page, from your terminal:
 *
 *   bun scripts/determine.mjs                       # the canonical household ($478)
 *   bun scripts/determine.mjs --earned 2400
 *   bun scripts/determine.mjs --size 3 --ages 42,9,70 --shelter 1400
 *   bun scripts/determine.mjs --what-if snap_earned_income_deduction_rate_for_net_income=0.3
 *   bun scripts/determine.mjs --set assistance_payments=500   # override any presumption
 *   bun scripts/determine.mjs --trace                          # chain of citation
 *   bun scripts/determine.mjs --json                           # machine-readable
 *
 * No Rust toolchain, no network: the wasm engine and the artifact are
 * checked into this repo. This is the "run it on your machine" door made
 * literal — a clone of this repo IS the local distribution until the
 * engine's first tagged binary release.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackageRequest } from "../src/lib/goldenPath.ts";
import { applyWhatIf } from "../src/lib/whatIf.ts";
import { buildDisplayTree } from "../src/lib/trace.ts";

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js");

const here = dirname(fileURLToPath(import.meta.url));
const programDir = join(here, "..", "public", "programs", "co-snap");
let artifactJson = readFileSync(join(programDir, "artifact.json"), "utf8");
const pkg = JSON.parse(readFileSync(join(programDir, "package.json"), "utf8"));

// --- arguments --------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return args[index + 1];
};
const has = (name) => args.includes(`--${name}`);

if (has("help")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0] + "*/");
  process.exit(0);
}

const size = flag("size") ?? "2";
const ages = (flag("ages") ?? (size === "2" ? "42,9" : Array(Number(size)).fill("30").join(",")))
  .split(",")
  .map((age) => age.trim());
if (ages.length !== Number(size) && !flag("size")) {
  // --ages alone implies the size
  args.push("--size", String(ages.length));
}

const answers = {
  household: {
    household_size: flag("size") ?? String(ages.length),
    snap_countable_earned_income: flag("earned") ?? "1200",
    household_shelter_costs_incurred: flag("shelter") ?? "900",
  },
  people: { member_age: ages },
  refOverrides: {},
};

// --set slot=value: override any presumption by slot name (all matching refs)
for (let i = 0; i < args.length; i += 1) {
  if (args[i] !== "--set") continue;
  const [slot, value] = (args[i + 1] ?? "").split("=");
  if (!slot || value === undefined) {
    console.error(`--set expects slot=value, got "${args[i + 1]}"`);
    process.exit(1);
  }
  const refs = Object.entries(pkg.defaults).filter(([, s]) => s.name === slot);
  if (refs.length === 0) {
    console.error(`No input slot named "${slot}" — try: bun scripts/determine.mjs --slots | grep ${slot}`);
    process.exit(1);
  }
  for (const [ref, s] of refs) {
    if (s.entity === "Household") answers.refOverrides[ref] = value;
    else answers.people[slot] = ages.map(() => value);
  }
}

if (has("slots")) {
  for (const s of Object.values(pkg.defaults)) {
    console.log(`${s.entity.toLowerCase().padEnd(9)} ${s.dtype.padEnd(8)} ${s.name}`);
  }
  process.exit(0);
}

// --what-if parameter=value: amend the law before running
const whatIf = flag("what-if");
let amendment = null;
if (whatIf) {
  const [parameter, value] = whatIf.split("=");
  amendment = applyWhatIf(artifactJson, { parameter, value });
  artifactJson = amendment.artifactJson;
}

// --- run --------------------------------------------------------------------

const request = buildPackageRequest({ pkg, answers, month: flag("month"), mode: "explain" });
const response = JSON.parse(engine.execute(artifactJson, JSON.stringify(request)));
const result = response.results[0];

const value = (name) => {
  const output = result.outputs[pkg.outputs[name]];
  if (!output || output.kind !== "scalar") return output?.outcome ?? null;
  return output.value.value;
};

if (has("json")) {
  const outputs = Object.fromEntries(Object.keys(pkg.outputs).map((name) => [name, value(name)]));
  console.log(JSON.stringify({ program: pkg.program_id, period: request.queries[0].period, amendment: whatIf ?? null, answers, outputs }, null, 2));
  process.exit(0);
}

console.log(`\n${pkg.title}`);
console.log(`period ${request.queries[0].period.start} — household of ${answers.household.household_size}, ages ${ages.join("/")}`);
console.log(`earned $${answers.household.snap_countable_earned_income}/mo · shelter $${answers.household.household_shelter_costs_incurred}/mo`);
if (amendment) {
  console.log(`AMENDED LAW: ${whatIf} (current law: ${amendment.previousValue}) — hypothetical`);
}
console.log("");
for (const name of Object.keys(pkg.outputs)) {
  console.log(`  ${name.padEnd(18)} ${value(name)}`);
}

if (has("trace")) {
  const tree = buildDisplayTree({
    outputId: pkg.outputs[flag("output") ?? "snap_allotment"],
    result,
    artifact: JSON.parse(artifactJson),
    dataset: request.dataset,
  });
  const render = (node, depth) => {
    const pad = "  ".repeat(depth);
    console.log(`${pad}${node.label} = ${node.valueText ?? "—"}  [${node.origin}] ${node.refId}`);
    if (node.substituted) console.log(`${pad}  = ${node.substituted}`);
    for (const child of node.children) render(child, depth + 1);
  };
  console.log("\nchain of citation:");
  render(tree, 1);
}
console.log("");
