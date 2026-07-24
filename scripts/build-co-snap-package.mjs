/**
 * Vendors the CO SNAP golden-path package into public/programs/co-snap/.
 *
 * Reads the composed compiled artifact (the versioned release unit from
 * axiom-api's data/runtime-artifacts) plus the co-snap registry descriptor
 * (which carries per-slot screening defaults), and emits:
 *
 *   public/programs/co-snap/artifact.json   — the artifact, byte-identical
 *   public/programs/co-snap/package.json    — playground package descriptor:
 *     per-input defaults keyed by durable ref, entity/relation templates,
 *     curated headline inputs, output ids, and source provenance (sha256).
 *
 * Usage:
 *   bun scripts/build-co-snap-package.mjs <artifact.json> <registry.json>
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverInputs } from "../src/lib/program.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "programs", "co-snap");

const [artifactPath, registryPath] = process.argv.slice(2);
if (!artifactPath || !registryPath) {
  console.error("usage: build-co-snap-package.mjs <artifact.json> <registry.json>");
  process.exit(1);
}

const artifactRaw = readFileSync(artifactPath);
const artifact = JSON.parse(artifactRaw.toString("utf8"));
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
const legacy = registry.find((entry) => entry.program_id === "co-snap");
if (!legacy) throw new Error("co-snap not found in registry");

// Defaults by slot name from the legacy registry descriptor (dtype is
// authoritative there — discovery cannot tell a bool from a decimal).
const legacyDefaults = new Map();
for (const entity of legacy.entities) {
  for (const slot of entity.inputs) {
    legacyDefaults.set(slot.name, { dtype: slot.dtype, value: slot.default });
  }
}

// Discover the artifact's inputs with the page's own discovery, so the
// descriptor and the UI can never disagree about what the program needs.
const discovered = discoverInputs(artifact);
const inputRefs = new Map(
  discovered.map((input) => [input.ref, { name: input.name, entity: input.entity }]),
);
console.log(`discovered ${inputRefs.size} input refs (via src/lib/program discoverInputs)`);

// The artifact itself is the type authority: walk every comparison whose
// left side is an input and record the kind of literal it is compared to.
// An input compared to a bool literal must cross as a bool; to a text
// literal, as text. Everything else falls back to the legacy dtype (dates)
// and then the discovery flavor.
const literalEvidence = new Map();
function walkEvidence(node) {
  if (Array.isArray(node)) {
    for (const item of node) walkEvidence(item);
    return;
  }
  if (!node || typeof node !== "object") return;
  if (node.op && node.left?.kind === "input" && node.right?.kind === "literal") {
    const literal = node.right.value;
    if (literal && typeof literal === "object" && typeof literal.kind === "string") {
      literalEvidence.set(node.left.name, literal.kind);
    }
  }
  for (const value of Object.values(node)) walkEvidence(value);
}
for (const derived of artifact.program.derived) walkEvidence(derived.expr);
console.log(`type evidence from comparisons: ${literalEvidence.size} inputs`);

const flavorByRef = new Map(discovered.map((input) => [input.ref, input.flavor]));
const defaults = {};
let matched = 0;
for (const [ref, meta] of inputRefs) {
  const fromLegacy = legacyDefaults.get(meta.name);
  if (fromLegacy) matched += 1;
  const evidence = literalEvidence.get(meta.name);
  const dtype =
    evidence === "bool"
      ? "bool"
      : evidence === "text"
        ? "text"
        : fromLegacy?.dtype === "date"
          ? "date"
          : flavorByRef.get(ref) === "integer"
            ? "integer"
            : "decimal";
  let value = fromLegacy?.value ?? (dtype === "bool" ? false : dtype === "text" ? "none" : "0");
  if (dtype === "bool") value = value === true || value === "True" || value === "1";
  if (dtype === "text" && meta.name.includes("frequency")) value = "monthly";
  defaults[ref] = { name: meta.name, entity: meta.entity, dtype, value };
}
console.log(`defaults: ${matched} matched from registry, ${inputRefs.size - matched} inferred`);

const pkg = {
  program_id: "co-snap",
  jurisdiction: "us-co",
  title: "Colorado SNAP — monthly allotment",
  source: {
    repo: "TheAxiomFoundation/axiom-api",
    artifact_path: "data/runtime-artifacts/us-co-snap.compiled.json",
    artifact_sha256: createHash("sha256").update(artifactRaw).digest("hex"),
    engine_version: artifact.engine_version,
    artifact_format_version: artifact.artifact_format_version,
  },
  query: { entity_id: "household:1" },
  entities: [
    { entity: "Household", id_template: "household:1", count: 1 },
    {
      entity: "Person",
      id_template: "person:1:{index}",
      count_from: "household_size",
      relations: [
        {
          name: "us:statutes/7/2012/j#relation.member_of_household",
          tuple: ["person:1:{index}", "household:1"],
        },
      ],
    },
  ],
  // The curated front door: the handful of answers the guided flow asks for.
  // Everything else takes its screening-presumption default (all overridable).
  headline: [
    { slot: "household_size", entity: "Household", label: "People in the household" },
    { slot: "snap_countable_earned_income", entity: "Household", label: "Monthly earned income" },
    { slot: "household_shelter_costs_incurred", entity: "Household", label: "Monthly shelter costs" },
    { slot: "member_age", entity: "Person", label: "Age", per_person: true },
  ],
  outputs: {},
  default_period: "2026-01",
};

// Output ids: prefer the well-known names if present in the artifact.
const derivedByName = new Map(artifact.program.derived.map((d) => [d.name, d]));
for (const name of [
  "snap_allotment",
  "snap_benefit_amount",
  "snap_net_income",
  "gross_income",
  "snap_eligible",
]) {
  const rule = derivedByName.get(name);
  if (rule?.id) pkg.outputs[name] = rule.id;
}
console.log("outputs:", pkg.outputs);

// --- engine-guided entity correction --------------------------------------
//
// Discovery attributes each input to the entity of the rule that references
// it, but an aggregated per-member input referenced from a Household rule
// actually lives on Person. The engine knows the truth: execute with the
// defaults, read each "missing input `<name>` for entity `<id>`" error,
// reattribute that slot, and repeat until the artifact executes clean.
const { createRequire } = await import("node:module");
const requireCjs = createRequire(import.meta.url);
const engine = requireCjs("../engine/pkg-node/axiom_rules_engine_wasm.js");
const { buildPackageRequest } = await import("../src/lib/goldenPath.ts");

const candidate = { ...pkg, defaults };
const probeAnswers = {
  household: { household_size: "2" },
  people: {},
};

let flips = 0;
for (let round = 0; round < 2000; round += 1) {
  const request = buildPackageRequest({ pkg: candidate, answers: probeAnswers });
  try {
    engine.execute(artifactRaw.toString("utf8"), JSON.stringify(request));
    break;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missing = /missing input `([^`]+)` for entity `([^`]+)`/.exec(message);
    if (!missing) throw new Error(`engine probe failed for another reason: ${message}`);
    const [, name, entityId] = missing;
    const wantEntity = entityId.startsWith("person") ? "Person" : "Household";
    const slots = Object.values(candidate.defaults).filter((slot) => slot.name === name);
    if (slots.length === 0) throw new Error(`engine wants undeclared input: ${name}`);
    let flipped = false;
    for (const slot of slots) {
      if (slot.entity !== wantEntity) {
        slot.entity = wantEntity;
        flipped = true;
        flips += 1;
      }
    }
    if (!flipped) throw new Error(`no progress on: ${message}`);
  }
}
console.log(`entity attribution: ${flips} slots corrected by engine probes`);

// Final smoke: the corrected descriptor must execute clean.
engine.execute(
  artifactRaw.toString("utf8"),
  JSON.stringify(buildPackageRequest({ pkg: candidate, answers: probeAnswers })),
);
console.log("engine probe: clean execution with pure defaults");

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "artifact.json"), artifactRaw);
writeFileSync(join(outDir, "package.json"), JSON.stringify(candidate, null, 1));
console.log(`wrote ${outDir}/{artifact.json,package.json}`);
