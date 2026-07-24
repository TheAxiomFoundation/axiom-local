/**
 * Run any vendored program locally — same engine, same composed artifacts,
 * same request path as the page, from your terminal:
 *
 *   bun scripts/determine.mjs --programs                     # list programs
 *   bun scripts/determine.mjs                                # co-snap example ($478)
 *   bun scripts/determine.mjs --program fiit                 # federal income tax
 *   bun scripts/determine.mjs --program fiit --set taxable_income=120000
 *   bun scripts/determine.mjs --set snap_countable_earned_income=2400
 *   bun scripts/determine.mjs --people member_age=42,9,70    # per-person values
 *   bun scripts/determine.mjs --what-if <parameter>=<value>  # amend the law
 *   bun scripts/determine.mjs --set assistance_payments=500  # override a presumption
 *   bun scripts/determine.mjs --trace [--depth 3]            # chain of citation
 *   bun scripts/determine.mjs --slots | --json               # discover / integrate
 *
 * Every program starts from its descriptor's example case; --set/--people
 * override slots by name. No Rust toolchain, no network: the wasm engine
 * and the artifacts are checked into this repo.
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
const programsDir = join(here, "..", "public", "programs");

// --- arguments --------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const has = (name) => args.includes(`--${name}`);

if (has("help")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0] + "*/");
  process.exit(0);
}

const index = JSON.parse(readFileSync(join(programsDir, "index.json"), "utf8")).programs;

if (has("programs")) {
  for (const program of index) {
    console.log(
      `${program.id.padEnd(14)} ${program.title} — ${program.rules} rules, ${program.inputs} inputs (${program.jurisdiction})`,
    );
  }
  process.exit(0);
}

const programId = flag("program") ?? "co-snap";
if (!index.some((program) => program.id === programId)) {
  console.error(`Unknown program "${programId}". Try: bun scripts/determine.mjs --programs`);
  process.exit(1);
}

const programDir = join(programsDir, programId);
let artifactJson = readFileSync(join(programDir, "artifact.json"), "utf8");
const pkg = JSON.parse(readFileSync(join(programDir, "package.json"), "utf8"));

if (has("slots")) {
  for (const slot of Object.values(pkg.defaults)) {
    console.log(`${slot.entity.toLowerCase().padEnd(9)} ${slot.dtype.padEnd(8)} ${slot.name}`);
  }
  process.exit(0);
}

// The descriptor's example is the base case; --set and --people override it.
const answers = {
  household: { ...pkg.example.household },
  people: Object.fromEntries(
    Object.entries(pkg.example.people ?? {}).map(([slot, values]) => [slot, [...values]]),
  ),
  refOverrides: {},
};

const slotByName = (name) => Object.values(pkg.defaults).find((slot) => slot.name === name);

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--set") {
    const [slot, value] = (args[i + 1] ?? "").split("=");
    if (!slot || value === undefined) {
      console.error(`--set expects slot=value, got "${args[i + 1]}"`);
      process.exit(1);
    }
    if (!slotByName(slot)) {
      console.error(`No input slot named "${slot}" — see --slots`);
      process.exit(1);
    }
    answers.household[slot] = value;
  }
  if (args[i] === "--people") {
    const [slot, values] = (args[i + 1] ?? "").split("=");
    if (!slot || values === undefined) {
      console.error(`--people expects slot=v1,v2,…, got "${args[i + 1]}"`);
      process.exit(1);
    }
    answers.people[slot] = values.split(",").map((value) => value.trim());
    // Growing the people list grows the counted entity with it.
    const sizeSlot = pkg.entities.find((entity) => entity.count_from)?.count_from;
    if (sizeSlot) answers.household[sizeSlot] = String(answers.people[slot].length);
  }
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
  console.log(
    JSON.stringify(
      {
        program: pkg.program_id,
        period: request.queries[0].period,
        amendment: whatIf ?? null,
        answers,
        outputs,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(`\n${pkg.title} (${pkg.jurisdiction})`);
console.log(`period ${request.queries[0].period.start}`);
for (const [slot, v] of Object.entries(answers.household)) console.log(`  ${slot} = ${v}`);
for (const [slot, values] of Object.entries(answers.people)) {
  if (values.length) console.log(`  ${slot} = ${values.join(", ")}`);
}
if (amendment) {
  console.log(`AMENDED LAW: ${whatIf} (current law: ${amendment.previousValue}) — hypothetical`);
}
console.log("");
const width = Math.max(...Object.keys(pkg.outputs).map((name) => name.length)) + 2;
for (const name of Object.keys(pkg.outputs)) {
  console.log(`  ${name.padEnd(width)} ${value(name)}`);
}

if (has("trace")) {
  const tree = buildDisplayTree({
    outputId: pkg.outputs[flag("output") ?? Object.keys(pkg.outputs)[0]],
    result,
    artifact: JSON.parse(artifactJson),
    dataset: request.dataset,
  });
  const maxDepth = Number(flag("depth") ?? 3);
  const render = (node, depth) => {
    if (depth > maxDepth) return;
    const pad = "  ".repeat(depth);
    console.log(`${pad}${node.label} = ${node.valueText ?? "—"}  [${node.origin}] ${node.refId}`);
    if (node.substituted) console.log(`${pad}  = ${node.substituted}`);
    for (const child of node.children) render(child, depth + 1);
  };
  console.log(`\nchain of citation (to depth ${maxDepth}; --depth N for more):`);
  render(tree, 1);
}
console.log("");
