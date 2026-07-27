/**
 * Vendors runtime packages into public/programs/ — one directory per
 * program, plus an index.json manifest the page and CLI read. Replaces the
 * co-snap-only generator; any compiled artifact with the provenance
 * envelope can be admitted by adding a PROGRAMS entry.
 *
 * For each program this emits:
 *   public/programs/<id>/artifact.json   — the artifact, byte-identical
 *   public/programs/<id>/package.json    — descriptor: per-input screening
 *     defaults keyed by durable ref, entity/relation plan, headline
 *     questions, example household, optional what-if, output ids, sha-256.
 *
 * The pipeline per program:
 *   1. discover inputs with the page's own discovery (src/lib/program.ts)
 *   2. dtype from the artifact's comparison literals (bool/text evidence;
 *      text inputs also collect their enum options), else legacy registry
 *      dtype (dates), else discovery flavor
 *   3. entity attribution corrected by engine probes to a fixpoint
 *   4. a final clean execution with the example answers, asserted here
 *
 * Usage: bun scripts/build-packages.mjs <axiom-api-checkout>
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverInputs } from "../src/lib/program.ts";
import { buildPackageRequest } from "../src/lib/goldenPath.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "..", "public", "programs");
const requireCjs = createRequire(import.meta.url);
const engine = requireCjs("../engine/pkg-node/axiom_rules_engine_wasm.js");

const apiCheckout = process.argv[2];
if (!apiCheckout) {
  console.error("usage: build-packages.mjs <axiom-api-checkout>");
  process.exit(1);
}

/**
 * Inputs the expressions divide by (anywhere in the denominator subtree,
 * one level through derived rules). A zero screening presumption on these
 * traps the engine ("division by zero") the moment the visitor edits any
 * field on the same path — presume 1 instead. Deliberately div-only: the
 * corpus slicer also guards rate/wage comparisons, but curated descriptors
 * may rely on a vacuous comparison pass as a screening position (co-snap's
 * work-requirement presumptions do). Mirrors src/lib/corpus.ts.
 */
function zeroUnsafeInputs(artifact) {
  const unsafe = new Set();
  const derivedByName = new Map(artifact.program.derived.map((rule) => [rule.name, rule]));
  function collectInputs(node, depth) {
    if (Array.isArray(node)) return node.forEach((item) => collectInputs(item, depth));
    if (!node || typeof node !== "object") return;
    if (node.kind === "input" || node.kind === "input_or_else") unsafe.add(node.name);
    if (node.kind === "derived" && depth > 0) {
      const rule = derivedByName.get(node.name);
      if (rule) collectInputs(rule.expr, depth - 1);
    }
    for (const value of Object.values(node)) collectInputs(value, depth);
  }
  function walk(node) {
    if (Array.isArray(node)) return node.forEach((item) => walk(item));
    if (!node || typeof node !== "object") return;
    if (node.kind === "div") collectInputs(node.right, 1);
    for (const value of Object.values(node)) walk(value);
  }
  for (const derived of artifact.program.derived) walk(derived.expr);
  return unsafe;
}

/** Presume 1 for zero-valued slots the expressions cannot take a 0 for. */
function guardZeroUnsafeDefaults(artifact, defaults, label) {
  const unsafe = zeroUnsafeInputs(artifact);
  let guarded = 0;
  for (const slot of Object.values(defaults)) {
    if (!unsafe.has(slot.name)) continue;
    if ((slot.dtype === "decimal" || slot.dtype === "integer") && Number(slot.value) === 0) {
      slot.value = "1";
      guarded += 1;
    }
  }
  if (guarded) console.log(`   ${label}: ${guarded} zero-unsafe defaults presumed 1`);
}

/**
 * Per-program admission config. `entities` is the instantiation plan —
 * every entity kind the artifact's inputs mention must appear (kinds left
 * out get a single `<kind>:1` instance automatically). `example` is the
 * household the page and CLI land on. `pin` (optional) asserts outputs.
 */
const PROGRAMS = [
  {
    id: "co-snap",
    title: "Colorado SNAP — monthly allotment",
    jurisdiction: "us-co",
    artifact: "data/runtime-artifacts/us-co-snap.compiled.json",
    legacyRegistryProgram: "co-snap",
    query_entity: "Household",
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
    headline: [
      { slot: "household_size", entity: "Household", label: "People in the household" },
      { slot: "snap_countable_earned_income", entity: "Household", label: "Monthly earned income" },
      { slot: "household_shelter_costs_incurred", entity: "Household", label: "Monthly shelter costs" },
      { slot: "member_age", entity: "Person", label: "Age", per_person: true },
    ],
    outputs: ["snap_allotment", "snap_net_income", "snap_eligible"],
    example: {
      household: {
        household_size: "2",
        snap_countable_earned_income: "1200",
        household_shelter_costs_incurred: "900",
      },
      people: { member_age: ["42", "9"] },
    },
    what_if: {
      parameter: "snap_earned_income_deduction_rate_for_net_income",
      value: "0.3",
      label: "The earned-income deduction rate — 7 USC 2014(e)(2)",
    },
    pin: { snap_allotment: "478", snap_net_income: "226.5" },
  },
  {
    id: "ma-snap",
    title: "Massachusetts SNAP — monthly benefit",
    jurisdiction: "us-ma",
    artifact: "data/runtime-artifacts/us-ma-snap.compiled.json",
    // Federal SNAP slots share names with the co-snap registry descriptor
    // (7 CFR 273 citizenship/residency/student screens), so its screening
    // presumptions carry over by name.
    legacyRegistryProgram: "co-snap",
    query_entity: "Household",
    entities: [
      { entity: "Household", id_template: "household:1", count: 1 },
      {
        entity: "Person",
        id_template: "person:1:{index}",
        count_from: "household_size",
        // This artifact declares the membership relation under two names —
        // the statute-qualified id and a bare local one; different rules
        // aggregate over each, so both must bind every member.
        relations: [
          {
            name: "us:statutes/7/2012/j#relation.member_of_household",
            tuple: ["person:1:{index}", "household:1"],
          },
          { name: "member_of_household", tuple: ["person:1:{index}", "household:1"] },
        ],
      },
    ],
    headline: [
      { slot: "household_size", entity: "Household", label: "People in the household" },
      { slot: "household_gross_income", entity: "Household", label: "Monthly gross income" },
      { slot: "member_age", entity: "Person", label: "Age", per_person: true },
    ],
    outputs: ["snap_benefit", "snap_eligible"],
    example: {
      household: { household_size: "2", household_gross_income: "1200" },
      people: { member_age: ["42", "9"] },
    },
  },
  {
    id: "fiit",
    title: "Federal individual income tax",
    jurisdiction: "us",
    artifact: "data/runtime-artifacts/us-fiit.compiled.json",
    query_entity: "TaxUnit",
    entities: [
      { entity: "TaxUnit", id_template: "taxunit:1", count: 1 },
      // A single filer with no dependents: one person, none of the
      // dependent/qualifying-child relations instantiated.
      { entity: "Person", id_template: "person:1:{index}", count: 1 },
    ],
    headline: [
      { slot: "filing_status", entity: "TaxUnit", label: "Filing status code (0 = single)" },
      { slot: "taxable_income", entity: "TaxUnit", label: "Taxable income (annual)" },
    ],
    // This composition takes taxable income as the direct entry point of
    // the section 1 rate schedule; filing_status is an integer code the
    // bracket rules compare against (1–4; anything else falls through to
    // the single schedule).
    slotOverrides: {
      filing_status: { dtype: "integer", value: 0 },
    },
    outputs: [
      "income_tax_before_refundable_credits",
      "regular_tax_before_credits",
      "alternative_minimum_tax",
      "eitc",
    ],
    example: {
      household: { filing_status: "0", taxable_income: "60000" },
      people: {},
    },
  },
  {
    id: "fl-tca",
    title: "Florida Temporary Cash Assistance",
    jurisdiction: "us-fl",
    artifact: "data/runtime-artifacts/us-fl-tca.compiled.json",
    query_entity: "TanfUnit",
    entities: [
      { entity: "TanfUnit", id_template: "tanfunit:1", count: 1 },
      { entity: "Household", id_template: "household:1", count: 1 },
      { entity: "Person", id_template: "person:1:{index}", count: 1 },
      { entity: "Asset", id_template: "asset:1", count: 1 },
      { entity: "Payment", id_template: "payment:1", count: 1 },
    ],
    headline: [
      { slot: "adjusted_gross_earned_income", entity: "Household", label: "Monthly earned income" },
      { slot: "assistance_group_size", entity: "Household", label: "People in the assistance group" },
    ],
    outputs: ["fl_tca", "fl_tca_eligible", "fl_tca_payment_standard"],
    // applicable_budget_standard and the maximum benefit are supplied
    // inputs in this composition; the example feeds them the value the
    // artifact's own fl_tca_payment_standard derives for a two-person
    // group with no shelter obligation ($158) so the demo is
    // self-consistent with the encoded tables.
    example: {
      household: {
        adjusted_gross_earned_income: "300",
        assistance_group_size: "2",
        filing_unit_size: "2",
        applicable_budget_standard: "158",
        maximum_benefit_for_appropriate_assistance_group_size: "158",
      },
      people: {},
    },
  },
  // ny-income-tax excluded: the axiom-api artifact is a caller-supplies-
  // brackets pilot (0 parameters); admitting it would mean inventing
  // unsourced bracket values as presumptions. Revisit when the composed
  // artifact carries the section 601 schedule.
];

// Legacy registry (per-slot defaults for programs that have one)
const registry = JSON.parse(
  readFileSync(join(apiCheckout, "data", "compiled-packages.current.json"), "utf8"),
);

/**
 * Legacy-format programs: the axiom-api registry carries a full descriptor
 * for each (entities, slots with dtypes and screening defaults, relations,
 * outputs), but the artifacts pre-date the provenance envelope. Admitted
 * with provenance: "legacy" — executable and hash-pinned, not yet
 * engine-stamped. A program that fails its probe is excluded from the
 * index with the reason logged, never shipped broken.
 *
 * tanf/us-ny is known-broken upstream (a parameter schedule with no value
 * for the period) and stays out until the artifact is re-cut.
 */
const LEGACY_PROGRAMS = [
  { registry: ["universal-credit", "uk"], id: "uk-universal-credit", title: "UK Universal Credit" },
  { registry: ["snap", "us-al"], id: "al-snap", title: "Alabama SNAP" },
  { registry: ["snap", "us-az"], id: "az-snap", title: "Arizona SNAP" },
  { registry: ["snap", "us-ca"], id: "ca-snap", title: "California SNAP" },
  { registry: ["snap", "us-nc"], id: "nc-snap", title: "North Carolina SNAP" },
  { registry: ["snap", "us-ny"], id: "ny-snap", title: "New York SNAP" },
  { registry: ["snap", "us-sc"], id: "sc-snap", title: "South Carolina SNAP" },
  { registry: ["snap", "us-tn"], id: "tn-snap", title: "Tennessee SNAP" },
  { registry: ["tanf", "us-co"], id: "co-tanf", title: "Colorado TANF" },
  { registry: ["tanf", "us-ak"], id: "ak-tanf", title: "Alaska ATAP" },
  { registry: ["tanf", "us-ks"], id: "ks-tanf", title: "Kansas TANF" },
  { registry: ["tanf", "us-tx"], id: "tx-tanf", title: "Texas TANF" },
  { registry: ["scretd", "us-il"], id: "il-scretd", title: "Illinois SCRETD" },
  { registry: ["oasdi-wage-tax", "us"], id: "us-oasdi", title: "Federal OASDI wage tax" },
];

function buildProgram(config) {
  const artifactRaw = readFileSync(join(apiCheckout, config.artifact));
  const artifact = JSON.parse(artifactRaw.toString("utf8"));
  const discovered = discoverInputs(artifact);
  console.log(`\n== ${config.id}: ${discovered.length} inputs`);

  // Legacy defaults by slot name, when a registry descriptor exists.
  const legacyDefaults = new Map();
  if (config.legacyRegistryProgram) {
    const legacy = registry.find((entry) => entry.program_id === config.legacyRegistryProgram);
    for (const entity of legacy?.entities ?? []) {
      for (const slot of entity.inputs) {
        legacyDefaults.set(slot.name, { dtype: slot.dtype, value: slot.default });
      }
    }
  }

  // Type evidence + enum options from the artifact's own comparisons.
  const literalEvidence = new Map();
  const textOptions = new Map();
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
        if (literal.kind === "text") {
          if (!textOptions.has(node.left.name)) textOptions.set(node.left.name, new Set());
          textOptions.get(node.left.name).add(String(literal.value));
        }
      }
    }
    for (const value of Object.values(node)) walkEvidence(value);
  }
  for (const derived of artifact.program.derived) walkEvidence(derived.expr);

  const defaults = {};
  let matched = 0;
  for (const input of discovered) {
    const fromLegacy = legacyDefaults.get(input.name);
    if (fromLegacy) matched += 1;
    const evidence = literalEvidence.get(input.name);
    const dtype =
      evidence === "bool"
        ? "bool"
        : evidence === "text"
          ? "text"
          : fromLegacy?.dtype === "date"
            ? "date"
            : input.flavor === "integer"
              ? "integer"
              : "decimal";
    let value = fromLegacy?.value ?? (dtype === "bool" ? false : dtype === "text" ? "none" : "0");
    if (dtype === "bool") value = value === true || value === "True" || value === "1";
    if (dtype === "text" && input.name.includes("frequency")) value = "monthly";
    const entry = { name: input.name, entity: input.entity, dtype, value };
    const options = textOptions.get(input.name);
    if (dtype === "text" && options?.size) entry.options = [...options].sort();
    const override = config.slotOverrides?.[input.name];
    if (override) Object.assign(entry, override, { name: input.name, entity: entry.entity });
    defaults[input.ref] = entry;
  }
  console.log(`   defaults: ${matched} from registry, ${discovered.length - matched} inferred`);
  guardZeroUnsafeDefaults(artifact, defaults, config.id);

  // Auto-add single instances for entity kinds the config doesn't plan.
  const planned = new Set(config.entities.map((entity) => entity.entity));
  const kinds = new Set(Object.values(defaults).map((slot) => slot.entity));
  const entities = [...config.entities];
  for (const kind of kinds) {
    if (!planned.has(kind)) {
      entities.push({ entity: kind, id_template: `${kind.toLowerCase()}:1`, count: 1 });
      console.log(`   auto entity: ${kind.toLowerCase()}:1`);
    }
  }

  // Output ids from the artifact.
  const derivedByName = new Map(artifact.program.derived.map((d) => [d.name, d]));
  const outputs = {};
  for (const name of config.outputs) {
    const rule = derivedByName.get(name);
    if (!rule) throw new Error(`${config.id}: output "${name}" not found`);
    outputs[name] = rule.id || name;
  }

  const pkg = {
    program_id: config.id,
    jurisdiction: config.jurisdiction,
    title: config.title,
    source: {
      repo: "TheAxiomFoundation/axiom-api",
      artifact_path: config.artifact,
      artifact_sha256: createHash("sha256").update(artifactRaw).digest("hex"),
      engine_version: artifact.engine_version,
      artifact_format_version: artifact.artifact_format_version,
    },
    query: { entity_id: entities.find((e) => e.entity === config.query_entity).id_template },
    entities,
    headline: config.headline,
    outputs,
    default_period: "2026-01",
    example: config.example,
    ...(config.what_if ? { what_if: config.what_if } : {}),
    defaults,
  };

  // Engine-guided entity correction to a fixpoint, on the example answers.
  const answers = { ...config.example, refOverrides: {} };
  let flips = 0;
  let admitted = 0;
  for (let round = 0; round < 4000; round += 1) {
    const request = buildPackageRequest({ pkg, answers });
    try {
      engine.execute(artifactRaw.toString("utf8"), JSON.stringify(request));
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const missing = /missing input `([^`]+)` for entity `([^`]+)`/.exec(message);
      if (!missing) throw new Error(`${config.id}: engine probe failed: ${message}`);
      const [, name, entityId] = missing;
      const wantKind = entities.find((e) =>
        entityId.startsWith(e.id_template.split(":")[0]),
      )?.entity;
      if (!wantKind) throw new Error(`${config.id}: unknown entity id ${entityId}`);
      let flipped = false;
      for (const slot of Object.values(pkg.defaults)) {
        if (slot.name === name && slot.entity !== wantKind) {
          slot.entity = wantKind;
          flipped = true;
          flips += 1;
        }
      }
      if (!flipped) {
        // An input discovery could not see: referenced by bare name from an
        // id-less root-module rule. The dataset needs an absolute ref, but
        // the artifact does not record the root module's target — so probe:
        // try `<module>#input.<name>` for every module in the program until
        // the engine accepts one.
        const evidence = literalEvidence.get(name);
        const dtype = evidence === "bool" ? "bool" : evidence === "text" ? "text" : "decimal";
        const entry = {
          name,
          entity: wantKind,
          dtype,
          value: dtype === "bool" ? false : dtype === "text" ? "none" : "0",
        };
        const modules = new Set();
        for (const rule of [...artifact.program.derived, ...artifact.program.parameters]) {
          if (rule.id?.includes("#")) modules.add(rule.id.split("#")[0]);
        }
        let accepted = null;
        for (const module of modules) {
          const candidate = `${module}#input.${name}`;
          pkg.defaults[candidate] = entry;
          try {
            engine.execute(
              artifactRaw.toString("utf8"),
              JSON.stringify(buildPackageRequest({ pkg, answers })),
            );
            accepted = candidate;
            break;
          } catch (probeError) {
            const probeMessage = String(probeError);
            delete pkg.defaults[candidate];
            // A different failure than this input's resolution means the
            // candidate resolved — keep it and let the outer loop continue.
            if (!probeMessage.includes(`\`${name}\``)) {
              pkg.defaults[candidate] = entry;
              accepted = candidate;
              break;
            }
          }
        }
        if (!accepted) throw new Error(`${config.id}: no module resolves input "${name}"`);
        admitted += 1;
        flipped = true;
      }
      if (!flipped) throw new Error(`${config.id}: no progress on: ${message}`);
    }
  }
  console.log(`   entity attribution: ${flips} corrected, ${admitted} bare-name inputs admitted`);

  // Final assertion: example executes clean; pins hold when configured.
  const request = buildPackageRequest({ pkg, answers });
  const response = JSON.parse(engine.execute(artifactRaw.toString("utf8"), JSON.stringify(request)));
  const result = response.results[0];
  for (const [name, id] of Object.entries(outputs)) {
    const output = result.outputs[id];
    if (!output) throw new Error(`${config.id}: output ${name} missing from response`);
    const value = output.kind === "scalar" ? output.value.value : output.outcome;
    console.log(`   ${name} = ${value}`);
    if (config.pin?.[name] !== undefined && String(value) !== config.pin[name]) {
      throw new Error(`${config.id}: pin failed — ${name} = ${value}, expected ${config.pin[name]}`);
    }
  }

  const dir = join(outRoot, config.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "artifact.json"), artifactRaw);
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 1));
  return {
    id: config.id,
    title: config.title,
    jurisdiction: config.jurisdiction,
    inputs: discovered.length,
    rules: artifact.program.derived.length,
    parameters: artifact.program.parameters.length,
  };
}

function buildLegacyProgram(config) {
  const entry = registry.find(
    (item) => item.program_id === config.registry[0] && item.jurisdiction === config.registry[1],
  );
  if (!entry) throw new Error(`${config.id}: not in registry`);
  const artifactRaw = readFileSync(join(apiCheckout, entry.artifact_path));
  const artifact = JSON.parse(artifactRaw.toString("utf8"));
  console.log(`\n== ${config.id} (legacy)`);

  const queryId = entry.query.entity_id.replaceAll("{index}", "1");
  const prefix = entry.input_legal_id_prefix ?? "";
  const defaults = {};
  const entities = [];
  let countFrom = null;
  for (const entityBlock of entry.entities) {
    for (const slot of entityBlock.inputs) {
      const ref = slot.legal_id ?? `${prefix}${slot.name}`;
      defaults[ref] = {
        name: slot.name,
        entity: entityBlock.entity,
        dtype: slot.dtype,
        value: slot.default,
      };
    }
    if (entityBlock.count_from) countFrom = entityBlock.count_from;
    // (defaults guarded below, after all entity blocks are read)
    entities.push({
      entity: entityBlock.entity,
      id_template: entityBlock.id_template,
      ...(typeof entityBlock.count === "number" ? { count: entityBlock.count } : {}),
      ...(entityBlock.count_from ? { count_from: entityBlock.count_from } : {}),
      ...(entityBlock.relations
        ? {
            relations: entityBlock.relations.map((relation) => ({
              name: relation.name,
              tuple: relation.tuple.map((part) =>
                part.replaceAll("{query_entity_id}", queryId),
              ),
            })),
          }
        : {}),
    });
  }

  guardZeroUnsafeDefaults(artifact, defaults, config.id);

  const outputs = {};
  for (const name of entry.default_outputs) {
    const resolved = entry.output_aliases?.[name] ?? name;
    const oid = entry.outputs_by_name?.[resolved] ?? entry.outputs_by_name?.[name];
    if (oid) outputs[name] = oid;
  }
  if (Object.keys(outputs).length === 0) throw new Error(`${config.id}: no resolvable outputs`);

  const example = { household: {}, people: {} };
  if (countFrom) example.household[countFrom] = "2";

  const pkg = {
    program_id: config.id,
    jurisdiction: entry.jurisdiction,
    title: config.title,
    provenance: "legacy",
    source: {
      repo: "TheAxiomFoundation/axiom-api",
      artifact_path: entry.artifact_path,
      artifact_sha256: createHash("sha256").update(artifactRaw).digest("hex"),
      engine_version: artifact.engine_version ?? null,
      artifact_format_version: artifact.artifact_format_version ?? null,
    },
    query: { entity_id: queryId },
    entities,
    headline: [],
    outputs,
    default_period: entry.default_period ?? "2026-01",
    example,
    defaults,
  };

  // The same engine-guided fixpoint as enveloped programs: admit inputs the
  // descriptor is missing, trying the legacy prefix namespace first.
  const answers = { ...example, refOverrides: {} };
  let admitted = 0;
  for (let round = 0; round < 2000; round += 1) {
    const request = buildPackageRequest({ pkg, answers });
    try {
      engine.execute(artifactRaw.toString("utf8"), JSON.stringify(request));
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const missing = /missing input `([^`]+)` for entity `([^`]+)`/.exec(message);
      if (!missing) throw new Error(`${config.id}: ${message}`);
      const [, name, entityId] = missing;
      const wantKind = entities.find((e) =>
        entityId.startsWith(e.id_template.split(":")[0]),
      )?.entity;
      if (!wantKind) throw new Error(`${config.id}: unknown entity id ${entityId}`);
      let progressed = false;
      for (const slot of Object.values(pkg.defaults)) {
        if (slot.name === name && slot.entity !== wantKind) {
          slot.entity = wantKind;
          progressed = true;
        }
      }
      if (!progressed) {
        const candidate = `${prefix}${name}`;
        if (!pkg.defaults[candidate]) {
          pkg.defaults[candidate] = { name, entity: wantKind, dtype: "decimal", value: "0" };
          admitted += 1;
          progressed = true;
        }
      }
      if (!progressed) throw new Error(`${config.id}: no progress on: ${message}`);
    }
  }

  const request = buildPackageRequest({ pkg, answers });
  const response = JSON.parse(engine.execute(artifactRaw.toString("utf8"), JSON.stringify(request)));
  const result = response.results[0];
  for (const [name, oid] of Object.entries(outputs)) {
    const output = result.outputs[oid];
    if (!output) throw new Error(`${config.id}: output ${name} missing from response`);
    const value = output.kind === "scalar" ? output.value.value : output.outcome;
    console.log(`   ${name} = ${value}`);
  }
  if (admitted) console.log(`   ${admitted} inputs admitted by probe`);

  const dir = join(outRoot, config.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "artifact.json"), artifactRaw);
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 1));
  return {
    id: config.id,
    title: config.title,
    jurisdiction: entry.jurisdiction,
    provenance: "legacy",
    inputs: Object.keys(pkg.defaults).length,
    rules: artifact.program.derived.length,
    parameters: artifact.program.parameters.length,
  };
}

const index = PROGRAMS.map(buildProgram).map((item) => ({ ...item, provenance: "envelope" }));
for (const config of LEGACY_PROGRAMS) {
  try {
    index.push(buildLegacyProgram(config));
  } catch (error) {
    console.log(`   EXCLUDED ${config.id}: ${String(error).slice(0, 120)}`);
  }
}
writeFileSync(join(outRoot, "index.json"), JSON.stringify({ programs: index }, null, 1));
console.log(`\nwrote ${outRoot}/index.json with ${index.length} programs`);
