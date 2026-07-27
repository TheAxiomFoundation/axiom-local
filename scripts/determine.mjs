/**
 * Run any vendored program locally — same engine, same composed artifacts,
 * same request path as the page, from your terminal:
 *
 *   bun scripts/determine.mjs --programs                     # list certified programs
 *   bun scripts/determine.mjs                                # ny-snap example ($478)
 *   bun scripts/determine.mjs --program <id>                 # switch programs
 *   bun scripts/determine.mjs --set snap_gross_monthly_earned_income=2400
 *   bun scripts/determine.mjs --people member_age=42,9,70    # per-person values
 *   bun scripts/determine.mjs --what-if <parameter>=<value>  # amend the law
 *   bun scripts/determine.mjs --set household_size=4         # override a presumption
 *   bun scripts/determine.mjs --trace [--depth 3]            # chain of citation
 *   bun scripts/determine.mjs --slots | --json               # discover / integrate
 *
 * Every program starts from its descriptor's example case; --set/--people
 * override slots by name. No Rust toolchain, no network: the wasm engine
 * and the artifacts are checked into this repo. Only programs certified by
 * the vendored ledger (public/corpus/ledger.json) will run — anything
 * without matching certificate provenance refuses, by design.
 */

// This script imports the repo's TypeScript directly, which needs Bun.
// Say so before Node trips over the first .ts import.
if (!process.versions.bun) {
  console.error(
    "This script runs with Bun (it imports the repo's TypeScript directly):\n" +
      "  bun scripts/determine.mjs\n" +
      "Install Bun from https://bun.sh",
  );
  process.exit(1);
}

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { buildPackageRequest } = await import("../src/lib/goldenPath.ts");
const { applyWhatIf } = await import("../src/lib/whatIf.ts");
const { buildDisplayTree } = await import("../src/lib/trace.ts");
const { assertPackageCertified, collectClosureIds, findUncertified, validateLedger } = await import(
  "../src/lib/certified.ts"
);

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js");

const here = dirname(fileURLToPath(import.meta.url));
const programsDir = join(here, "..", "public", "programs");
const ledgerFile = join(here, "..", "public", "corpus", "ledger.json");

/** A user mistake: print the message, no stack, exit 1. */
class UsageError extends Error {}
const fail = (message) => {
  throw new UsageError(message);
};

// --- arguments --------------------------------------------------------------

// Tolerate shell-split assignments: `--set slot = 4`, `--set slot= 4`,
// and `--set slot =4` all normalize to `--set slot=4`.
const rawArgs = process.argv.slice(2);
const args = [];
for (let i = 0; i < rawArgs.length; i += 1) {
  const token = rawArgs[i];
  if (["--set", "--people", "--what-if"].includes(token)) {
    let assignment = rawArgs[i + 1] ?? "";
    let consumed = 1;
    if (!assignment.includes("=") && rawArgs[i + 2] === "=") {
      assignment = `${assignment}=${rawArgs[i + 3] ?? ""}`;
      consumed = 3;
    } else if (!assignment.includes("=") && rawArgs[i + 2]?.startsWith("=")) {
      assignment = `${assignment}${rawArgs[i + 2]}`;
      consumed = 2;
    } else if (assignment.endsWith("=") && rawArgs[i + 2] !== undefined) {
      assignment = `${assignment}${rawArgs[i + 2]}`;
      consumed = 2;
    }
    args.push(token, assignment);
    i += consumed;
    continue;
  }
  args.push(token);
}

const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};
const has = (name) => args.includes(`--${name}`);

async function main() {
  if (has("help")) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0] + "*/");
    return;
  }

  const index = JSON.parse(readFileSync(join(programsDir, "index.json"), "utf8")).programs;

  if (has("programs")) {
    if (index.length === 0) {
      console.log("no certified programs — the vendored ledger serves nothing");
    }
    for (const program of index) {
      console.log(
        `${program.id.padEnd(20)} ${(program.provenance ?? "envelope").padEnd(9)} ${program.title} — ${program.rules} rules (${program.jurisdiction})`,
      );
    }
    return;
  }

  const programId = flag("program") ?? "ny-snap";
  if (!index.some((program) => program.id === programId)) {
    fail(`Unknown program "${programId}". Try: bun scripts/determine.mjs --programs`);
  }

  const programDir = join(programsDir, programId);
  let artifactJson = readFileSync(join(programDir, "artifact.json"), "utf8");
  const pkg = JSON.parse(readFileSync(join(programDir, "package.json"), "utf8"));

  // The certified-node gate: this CLI is a serving surface, so a package
  // whose certificate provenance is missing or does not match the served
  // ledger refuses to load — and refusals report counts, never node ids.
  let certified;
  try {
    certified = await validateLedger(JSON.parse(readFileSync(ledgerFile, "utf8")));
  } catch (error) {
    fail(
      `nothing servable — public/corpus/ledger.json is missing or invalid ` +
        `(${error instanceof Error ? error.message : error})`,
    );
  }
  try {
    assertPackageCertified(pkg, certified);
  } catch (error) {
    fail(`${programId} ${error instanceof Error ? error.message : error}`);
  }
  const uncertified = findUncertified(
    collectClosureIds(JSON.parse(artifactJson), Object.keys(pkg.defaults)),
    certified,
  );
  if (uncertified.length > 0) {
    fail(
      `refused: ${uncertified.length} node(s) in ${programId} are not certified under the ` +
        `served ledger (${certified.ledger.ledger_id})`,
    );
  }

  if (has("slots")) {
    for (const slot of Object.values(pkg.defaults)) {
      console.log(`${slot.entity.toLowerCase().padEnd(9)} ${slot.dtype.padEnd(8)} ${slot.name}`);
    }
    return;
  }

  // The determination month, validated before anything runs.
  const month = flag("month") ?? pkg.default_period;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    fail(`--month expects a calendar month like 2026-01, got "${month}"`);
  }

  // Trace depth: a positive number or nothing.
  const depthRaw = flag("depth");
  const maxDepth = depthRaw === undefined ? 3 : Number(depthRaw);
  if (!Number.isFinite(maxDepth) || maxDepth < 1) {
    fail(`--depth expects a positive number, got "${depthRaw}"`);
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

  /** "$1,200" is fine; "four" is not. Validated against the slot's type. */
  function checkValue(slot, raw) {
    const meta = slotByName(slot);
    const cleaned = String(raw).replace(/[$£€,\s]/g, "");
    if (meta.dtype === "integer" && !/^-?\d+$/.test(cleaned)) {
      fail(`"${raw}" is not a whole number for ${slot} (${meta.dtype})`);
    }
    if (meta.dtype === "decimal" && !/^-?\d+(\.\d+)?$/.test(cleaned)) {
      fail(`"${raw}" is not a number for ${slot} (${meta.dtype})`);
    }
    return raw;
  }

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--set") {
      const [slot, value] = (args[i + 1] ?? "").split("=");
      if (!slot || value === undefined) {
        fail(`--set expects slot=value, got "${args[i + 1]}"`);
      }
      if (!slotByName(slot)) fail(`No input slot named "${slot}" — see --slots`);
      answers.household[slot] = checkValue(slot, value);
    }
    if (args[i] === "--people") {
      const [slot, values] = (args[i + 1] ?? "").split("=");
      if (!slot || values === undefined) {
        fail(`--people expects slot=v1,v2,…, got "${args[i + 1]}"`);
      }
      if (!slotByName(slot)) fail(`No input slot named "${slot}" — see --slots`);
      answers.people[slot] = values.split(",").map((value) => checkValue(slot, value.trim()));
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
    if (!parameter || value === undefined) {
      fail(`--what-if expects parameter=value, got "${whatIf}"`);
    }
    try {
      amendment = applyWhatIf(artifactJson, { parameter, value });
    } catch (error) {
      fail(
        `${error instanceof Error ? error.message : error} — parameter names appear in --trace output`,
      );
    }
    artifactJson = amendment.artifactJson;
  }

  // --output: which output the result and trace focus on.
  const outputName = flag("output") ?? Object.keys(pkg.outputs)[0];
  if (!pkg.outputs[outputName]) {
    fail(
      `No output named "${outputName}". This program has: ${Object.keys(pkg.outputs).join(", ")}`,
    );
  }

  // --- run ------------------------------------------------------------------

  const request = buildPackageRequest({ pkg, answers, month, mode: "explain" });
  let response;
  try {
    response = JSON.parse(engine.execute(artifactJson, JSON.stringify(request)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/has no value/.test(message)) {
      fail(
        `${message}\nThe artifact encodes law effective for its period — try the program's default period (${pkg.default_period}).`,
      );
    }
    fail(message);
  }
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
    return;
  }

  console.log(`\n${pkg.title} (${pkg.jurisdiction})`);
  console.log(`period ${request.queries[0].period.start}`);
  console.log(`certified (ledger ${pkg.certified.ledger_id})`);
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
      outputId: pkg.outputs[outputName],
      result,
      artifact: JSON.parse(artifactJson),
      dataset: request.dataset,
    });
    if (!tree) fail(`No trace available for output "${outputName}"`);
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
}

try {
  await main();
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`error: ${error.message}`);
  } else {
    console.error(`error: ${error instanceof Error ? error.message : error}`);
  }
  process.exit(1);
}
