/**
 * Vendors the RuleSpec corpus into public/corpus/ — the graph everything
 * slices. The subtree is the unit this repo serves; there are no
 * pre-composed program bundles.
 *
 * For every `format: rulespec/v1` module in a rulespec checkout this emits
 *   public/corpus/modules/<jurisdiction>/<path>.yaml   — byte-identical
 * plus one manifest the browser searches and resolves closures against:
 *   public/corpus/manifest.json — per module: canonical target, module-level
 *   imports (fragments stripped), rule names; plus the corpus commit so a
 *   slice's provenance line can say exactly which corpus it came from.
 *
 * Axiom-authored composition/pipeline modules (isCompositionPath in
 * src/lib/corpus.ts) ARE vendored: import closures — including the
 * ny-snap flagship's — cannot resolve without them. They are excluded
 * downstream instead: never listed in the explorer, refused as slice
 * roots (assertSliceableRoot).
 *
 * public/corpus/ is gitignored: 30+ MB of YAML belongs in a checkout or a
 * content-addressed bucket (docs/artifact-distribution.md), never in git.
 * The one exception is ledger.json — the certification ledger vendored
 * here is the authority every serving surface gates against, so it is
 * tracked (see .gitignore's carve-out) and a clone fails CLOSED to the
 * ledger's certified set rather than OPEN to whatever is on disk.
 *
 * Usage: bun scripts/build-corpus.mjs [--ledger <path>] <rulespec-us-checkout> [...more]
 */
import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { validateLedger } from "../src/lib/certified.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "..", "public", "corpus");

let ledgerPath = join(here, "..", "data", "certified-nodes.json");
const checkouts = [];
{
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--ledger") {
      ledgerPath = args[i + 1];
      i += 1;
    } else {
      checkouts.push(args[i]);
    }
  }
}
if (checkouts.length === 0) {
  console.error("usage: build-corpus.mjs [--ledger <path>] <rulespec-checkout> [...more]");
  process.exit(1);
}

// Validate before writing anything: an invalid ledger must not become the
// served one, and fail-closed means the whole corpus build dies with it.
const ledgerRaw = readFileSync(ledgerPath, "utf8");
const certified = await validateLedger(JSON.parse(ledgerRaw));

/** Directories that hold corpus tooling or fixtures, not modules. */
const SKIP_DIRS = new Set(["tests", "tools", "bulk", "programs", "node_modules", ".git"]);

function* yamlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* yamlFiles(path);
    } else if (entry.name.endsWith(".yaml") && !entry.name.endsWith(".test.yaml")) {
      yield path;
    }
  }
}

/** Top-level `imports:` block: canonical targets, `#fragment` stripped. */
function parseImports(yaml) {
  const match = yaml.match(/^imports:\n((?:-\s+.+\n|\s+-\s+.+\n)*)/m);
  if (!match) return [];
  const targets = new Set();
  for (const [, target] of match[1].matchAll(/-\s+(\S+)/g)) {
    targets.add(target.split("#")[0]);
  }
  return [...targets];
}

/** Every `- name: <word>` list entry — rule and parameter names, for search. */
function parseRuleNames(yaml) {
  const names = new Set();
  for (const [, name] of yaml.matchAll(/^\s*-\s+name:\s+([A-Za-z0-9_.]+)\s*$/gm)) {
    names.add(name);
  }
  return [...names];
}

rmSync(outRoot, { recursive: true, force: true });
const modules = [];
const sources = [];

for (const checkout of checkouts) {
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse HEAD", { cwd: checkout }).toString().trim();
  } catch {
    /* not a git checkout — recorded as unknown */
  }
  let remote = basename(checkout);
  try {
    remote = execSync("git remote get-url origin", { cwd: checkout })
      .toString()
      .trim()
      .replace(/\.git$/, "")
      .replace(/^.*github\.com[:/]/, "");
  } catch {
    /* keep directory name */
  }
  sources.push({ repo: remote, commit });

  // Jurisdiction directories are the top-level dirs that hold modules
  // (us, us-co, …); everything else at the root is tooling.
  for (const entry of readdirSync(checkout, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const jurisdiction = entry.name;
    const jurisdictionDir = join(checkout, jurisdiction);
    if (!statSync(jurisdictionDir).isDirectory()) continue;
    for (const file of yamlFiles(jurisdictionDir)) {
      const yaml = readFileSync(file, "utf8");
      if (!/^format:\s*rulespec\/v1/m.test(yaml)) continue;
      const path = relative(jurisdictionDir, file).replace(/\.yaml$/, "");
      const target = `${jurisdiction}:${path}`;
      const outPath = join(outRoot, "modules", jurisdiction, `${path}.yaml`);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, yaml);
      modules.push({
        target,
        jurisdiction,
        imports: parseImports(yaml),
        rules: parseRuleNames(yaml),
      });
    }
  }
}

modules.sort((a, b) => a.target.localeCompare(b.target));
const ruleCount = modules.reduce((n, m) => n + m.rules.length, 0);
writeFileSync(
  join(outRoot, "manifest.json"),
  JSON.stringify({ format: "axiom-local.corpus.v1", sources, modules }),
);
// The served ledger, byte-identical: everything that gates on certification
// (the Runner, the explorer, determine.mjs) reads this one spelling.
writeFileSync(join(outRoot, "ledger.json"), ledgerRaw);
// The tracked lock: deploys regenerate the corpus from exactly these
// commits, so what production serves is what was reviewed here — and the
// ledger identity pins WHICH certified set that corpus was served under.
writeFileSync(
  join(here, "..", "corpus.lock.json"),
  `${JSON.stringify(
    {
      sources,
      ledger: {
        ledger_id: certified.ledger.ledger_id,
        certified_set_version: certified.setVersion,
      },
    },
    null,
    2,
  )}\n`,
);
console.log(
  `wrote ${modules.length} modules (${ruleCount} named rules) from ` +
    `${sources.map((s) => `${s.repo}@${s.commit.slice(0, 7)}`).join(", ")} → public/corpus/ ` +
    `under ledger ${certified.ledger.ledger_id} (${certified.ledger.entries.length} nodes)`,
);
