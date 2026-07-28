/**
 * Run any corpus subtree locally — same engine, same slicing machinery,
 * same request path as the page, from your terminal. The subtree is the
 * unit: pick a root, its import closure is compiled by the vendored wasm
 * engine and executed on your machine.
 *
 *   bun scripts/determine.mjs --roots [filter]         # the subtree catalog
 *   bun scripts/determine.mjs                          # the 7 CFR 273.10 example
 *   bun scripts/determine.mjs --root <target>          # slice a different subtree
 *   bun scripts/determine.mjs --set household_size=3   # state a fact
 *   bun scripts/determine.mjs --what-if <parameter>=<value>  # amend the law
 *   bun scripts/determine.mjs --trace [--depth 3]      # chain of citation
 *   bun scripts/determine.mjs --slots | --json         # discover / integrate
 *
 * Requires public/corpus/ (bun scripts/build-corpus.mjs <rulespec checkout>).
 * Inputs not stated with --set take synthesized screening presumptions; a
 * presumption is a legal position, listed by --slots, never hidden. No Rust
 * toolchain, no network. Certification is a status, not a gate: every
 * determination is labeled "certified (ledger …)" or "encoded — not
 * certified" against the vendored ledger (public/corpus/ledger.json). Set
 * AXIOM_CERTIFIED_ENFORCEMENT=enforced for the hard cut — subtrees whose
 * closure is not fully certified then refuse to run.
 *
 * Axiom-authored composition/pipeline paths are not law and refuse as
 * roots — slice the statute, regulation, or policy modules they compose.
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
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { buildPackageRequest } = await import("../src/lib/goldenPath.ts");
const { applyWhatIf } = await import("../src/lib/whatIf.ts");
const { buildDisplayTree } = await import("../src/lib/trace.ts");
const {
  assertSliceableRoot,
  moduleUrl,
  probeFixpoint,
  resolveClosure,
  subtreeCatalog,
  synthesizePackage,
} = await import("../src/lib/corpus.ts");
const { collectClosureIds, findUncertified, resolveEnforcement, validateLedger } = await import(
  "../src/lib/certified.ts"
);
const { buildDeterminationEnvelope } = await import("../src/lib/envelope.ts");

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js");

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, "..", "public", "corpus");
const ledgerFile = join(corpusDir, "ledger.json");

/** The worked example: pure 7 CFR 273.10 — the SNAP benefit computation. */
const DEFAULT_ROOT = "us:regulations/7-cfr/273/10";

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
  if (["--set", "--what-if"].includes(token)) {
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

  if (!existsSync(join(corpusDir, "manifest.json"))) {
    fail(
      "public/corpus/ is not generated — run: bun scripts/build-corpus.mjs <rulespec checkout>",
    );
  }
  const manifest = JSON.parse(readFileSync(join(corpusDir, "manifest.json"), "utf8"));
  const catalog = subtreeCatalog(manifest);

  if (has("roots")) {
    const filter = (flag("roots") ?? "").toLowerCase();
    const shown = filter
      ? catalog.filter(
          (entry) =>
            entry.target.toLowerCase().includes(filter) ||
            entry.rules.some((rule) => rule.toLowerCase().includes(filter)),
        )
      : catalog;
    for (const entry of shown) {
      console.log(`${String(entry.rules.length).padStart(4)}  ${entry.target}`);
    }
    console.log(
      `\n${shown.length} of ${catalog.length} sliceable subtrees` +
        (filter ? ` matching "${filter}"` : "") +
        " — run one with --root <target>",
    );
    return;
  }

  const root = flag("root") ?? DEFAULT_ROOT;
  // Composition/pipeline assembly is not law: refuse before anything
  // resolves or compiles, with the honest reason.
  try {
    assertSliceableRoot(root);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
  if (!manifest.modules.some((entry) => entry.target === root)) {
    fail(`Unknown root "${root}". Try: bun scripts/determine.mjs --roots ${root.split(":")[0]}`);
  }

  // Certification status/gate: this CLI is a serving surface, so refusal
  // reasons report counts, never node ids. Permissive (the default and
  // launch posture) serves every slice with the status labeled; enforced
  // is the hard cut — a closure with any uncertified node refuses to run.
  const enforcement = resolveEnforcement(process.env.AXIOM_CERTIFIED_ENFORCEMENT);
  let certified = null;
  try {
    certified = await validateLedger(JSON.parse(readFileSync(ledgerFile, "utf8")));
  } catch (error) {
    if (enforcement === "enforced") {
      fail(
        `nothing servable — public/corpus/ledger.json is missing or invalid ` +
          `(${error instanceof Error ? error.message : error})`,
      );
    }
  }

  // Slice: resolve the import closure, compile it in the vendored engine,
  // synthesize the runnable descriptor, probe entity attribution to a
  // fixpoint — the page's exact machinery.
  const closure = resolveClosure(manifest, root);
  const modules = Object.fromEntries(
    closure.map((target) => [
      target,
      readFileSync(join(corpusDir, moduleUrl(target).replace("/corpus/", "")), "utf8"),
    ]),
  );
  let artifactJson = engine.compile(JSON.stringify(modules), root);
  const artifact = JSON.parse(artifactJson);
  const { pkg } = synthesizePackage(artifact, root, manifest.sources[0]?.commit ?? "unknown");
  if (Object.keys(pkg.outputs).length === 0) {
    fail(
      `${root} defines ${artifact.program.parameters.length} parameters and no executable ` +
        `rules — nothing to run at this root. Pick one from --roots.`,
    );
  }
  probeFixpoint(engine, artifactJson, artifact, pkg);

  const uncertified = certified
    ? findUncertified(collectClosureIds(artifact, Object.keys(pkg.defaults)), certified)
    : null;
  const certification = uncertified && uncertified.length === 0 ? "certified" : "encoded";
  if (enforcement === "enforced" && certification !== "certified") {
    fail(
      `refused: ${uncertified.length} node(s) in the ${root} closure are not certified ` +
        `under the served ledger (${certified.ledger.ledger_id})`,
    );
  }
  const certificationLine =
    certification === "certified"
      ? `certified (ledger ${certified.ledger.ledger_id})`
      : "encoded — not certified";

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

  // Synthesized presumptions are the base case; --set states the facts.
  const answers = { household: {}, people: {}, refOverrides: {} };
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
      `No output named "${outputName}". This subtree has: ${Object.keys(pkg.outputs).join(", ")}`,
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
        `${message}\nThe corpus encodes law effective for its period — try the subtree's default period (${pkg.default_period}).`,
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
    // The canonical envelope — the same builder the page's JSON affordance
    // uses (src/lib/envelope.ts), so page and terminal agree byte for byte.
    const envelope = buildDeterminationEnvelope({
      root,
      closure,
      source: manifest.sources[0] ?? { repo: "corpus", commit: "unknown" },
      pkg,
      artifact: JSON.parse(artifactJson),
      request,
      response,
      answers,
      certification,
      ledger: certified
        ? {
            ledger_id: certified.ledger.ledger_id,
            certified_set_version: certified.setVersion,
          }
        : null,
      amendment: whatIf ?? null,
    });
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  console.log(`\n${root}`);
  console.log(
    `${closure.length} modules · ${artifact.program.derived.length} rules · ` +
      `${artifact.program.parameters.length} parameters — compiled and executed locally`,
  );
  console.log(`period ${request.queries[0].period.start}`);
  console.log(certificationLine);
  for (const [slot, v] of Object.entries(answers.household)) console.log(`  ${slot} = ${v}`);
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
