/**
 * Vendors runtime packages into public/programs/ — one directory per
 * program, plus an index.json manifest the page and CLI read.
 *
 * Certification is a STATUS on every vendored program, and — under
 * `--enforcement enforced` — a gate:
 *
 * - `permissive` (default, the launch posture): EVERY program that
 *   compiles/exists vendors, stamped `certification: "certified"` (with
 *   full `certified` provenance) only where the artifact's node closure —
 *   derived rules, parameters, relations, and the input refs the
 *   descriptor addresses the dataset with — is fully in the ledger;
 *   everything else vendors as `certification: "encoded"`, labeled, never
 *   dropped.
 * - `enforced`: the hard cut — a program whose closure is not fully
 *   certified is refused and dropped from the registry; uncertified law
 *   is not servable, so it is not vendorable either. Build stderr may
 *   name uncertified ids; serving surfaces never do.
 *
 * For each vendored program this emits:
 *   public/programs/<id>/artifact.json   — the artifact, byte-identical
 *   public/programs/<id>/package.json    — descriptor: per-input screening
 *     defaults keyed by durable ref, entity/relation plan, headline
 *     questions, example household, optional what-if, output ids, sha-256,
 *     certification status (+ certified provenance when earned).
 *
 * The pipeline per program:
 *   1. discover inputs with the page's own discovery (src/lib/program.ts)
 *   2. dtype from the artifact's comparison literals (bool/text evidence;
 *      text inputs also collect their enum options), else legacy registry
 *      dtype (dates), else discovery flavor
 *   3. entity attribution corrected by engine probes to a fixpoint
 *   4. the certification status/gate, then a final clean execution with
 *      the example answers, asserted here
 *
 * Usage: bun scripts/build-packages.mjs [--ledger <path>]
 *          [--enforcement permissive|enforced] [<axiom-api-checkout>]
 *
 * --ledger defaults to data/certified-nodes.json (the synced ledger copy);
 * --enforcement defaults to $AXIOM_CERTIFIED_ENFORCEMENT, else permissive.
 * Without an axiom-api checkout the api-sourced candidates cannot even be
 * read and do not vendor in either mode.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverInputs } from "../src/lib/program.ts";
import { buildPackageRequest } from "../src/lib/goldenPath.ts";
import { moduleUrl, probeFixpoint, resolveClosure, synthesizePackage } from "../src/lib/corpus.ts";
import {
  assertArtifactCertified,
  certifiedStamp,
  collectClosureIds,
  findUncertified,
  resolveEnforcement,
  validateLedger,
} from "../src/lib/certified.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, "..", "public", "programs");
const corpusRoot = join(here, "..", "public", "corpus");
const requireCjs = createRequire(import.meta.url);
const engine = requireCjs("../engine/pkg-node/axiom_rules_engine_wasm.js");

let ledgerPath = join(here, "..", "data", "certified-nodes.json");
let enforcementRaw = process.env.AXIOM_CERTIFIED_ENFORCEMENT;
let apiCheckout = null;
{
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--ledger") {
      ledgerPath = args[i + 1];
      i += 1;
    } else if (args[i] === "--enforcement") {
      enforcementRaw = args[i + 1];
      i += 1;
    } else {
      apiCheckout = args[i];
    }
  }
}
const enforcement = resolveEnforcement(enforcementRaw);

// The status authority. Enforced: a ledger that does not validate vendors
// nothing (the build dies before touching disk). Permissive: the ledger is
// metadata — fail soft, vendor everything as "encoded".
let certified = null;
try {
  certified = await validateLedger(JSON.parse(readFileSync(ledgerPath, "utf8")));
  console.log(
    `ledger ${certified.ledger.ledger_id}: ${certified.ledger.entries.length} certified nodes, ` +
      `set ${certified.setVersion}${certified.ledger.fixture ? " (FIXTURE)" : ""} — ` +
      `enforcement ${enforcement}`,
  );
} catch (error) {
  if (enforcement === "enforced") throw error;
  console.error(
    `ledger unavailable (${error instanceof Error ? error.message : error}) — ` +
      "permissive: vendoring with nothing certified",
  );
}

/**
 * The status/gate, applied to a finished descriptor: the closure is the
 * artifact's nodes plus the dataset refs in pkg.defaults (that is how the
 * artifact addresses its inputs — prefix or per-slot legal ids alike, they
 * all end up as defaults keys). Fully certified → stamp status + full
 * provenance. Anything less: enforced throws naming the uncertified ids
 * (the caller routes that to stderr and drops the program); permissive
 * labels the package "encoded" and vendors it anyway.
 */
function certify(pkg, artifact) {
  const missing = certified
    ? findUncertified(collectClosureIds(artifact, Object.keys(pkg.defaults)), certified)
    : null;
  if (certified && missing.length === 0) {
    pkg.certification = "certified";
    pkg.certified = certifiedStamp(certified, pkg.outputs);
    return "certified";
  }
  if (enforcement === "enforced") {
    // Enforced guarantees a validated ledger (see the load above); throw
    // through the shared gate so the refusal names the ids exactly as the
    // enforced tests pin it.
    assertArtifactCertified(artifact, Object.keys(pkg.defaults), certified);
    throw new Error("unreachable: enforced gate passed after status said otherwise");
  }
  pkg.certification = "encoded";
  return "encoded";
}

/** The registry entry's certification block — what index.json carries. */
function certificationIndexEntry(pkg) {
  if (pkg.certification === "certified" && certified) {
    return {
      certification: "certified",
      certified: {
        ledger_id: certified.ledger.ledger_id,
        certified_set_version: certified.setVersion,
      },
    };
  }
  return { certification: "encoded" };
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

// Legacy registry (per-slot defaults for programs that have one). Absent a
// checkout there is no registry — and no way to admit api-sourced programs.
const registry = apiCheckout
  ? JSON.parse(readFileSync(join(apiCheckout, "data", "compiled-packages.current.json"), "utf8"))
  : null;

/**
 * Corpus-direct programs: compiled at vendor time from public/corpus/ by
 * the vendored engine itself — the same slice the explorer would cut,
 * plus curation (entity plan with membership relations, screening
 * presumptions that differ from the synthesized zero-state, headline
 * questions, example household). These are the only candidates whose
 * every node carries a durable legal id end to end, which is what the
 * certified gate requires; the api-sourced NY artifact addresses inputs
 * under a synthetic `axiom:` prefix and is uncertifiable by construction.
 */
const DIRECT_PROGRAMS = [
  {
    id: "ny-snap",
    title: "New York SNAP — monthly benefit",
    jurisdiction: "us-ny",
    root: "us-ny:policies/otda/snap/fy-2026-benefit-calculation",
    query_entity_id: "household:1",
    entities: [
      { entity: "Household", id_template: "household:1", count: 1 },
      {
        entity: "Person",
        id_template: "person:1:{index}",
        count_from: "household_size",
        // The artifact aggregates over three membership relations: the
        // statutory one, the state-plan composition bridge, and NY's
        // categorical-eligibility membership. All must bind every member.
        relations: [
          {
            name: "us:statutes/7/2012/j#relation.member_of_household",
            tuple: ["person:1:{index}", "household:1"],
          },
          {
            name: "us:policies/usda/snap/state-plan-composition#relation.member_of_household",
            tuple: ["person:1:{index}", "household:1"],
          },
          {
            name: "us-ny:regulations/18-nycrr/387/14/a/5#relation.ny_snap_categorical_member_of_household",
            tuple: ["person:1:{index}", "household:1"],
          },
        ],
      },
      { entity: "Asset", id_template: "asset:1:{index}", count_from: "asset_count" },
      { entity: "SnapUnit", id_template: "snap_unit:1", count: 1 },
    ],
    /**
     * Screening presumptions that differ from the synthesized zero-state,
     * carried by slot name. The first block mirrors the legacy registry
     * descriptor (citizenship, residency, adult ages, the statutory
     * minimum wage). The work-requirement block presumes procedural
     * compliance — "registered, and did not refuse anything that was
     * offered" — the same screening position the co-snap descriptor takes
     * through its vacuous-comparison pass; every one stays visible and
     * overridable in the presumption editor.
     */
    slotDefaultsByName: {
      federal_minimum_wage: "7.25",
      federal_or_state_minimum_wage: "7.25",
      household_lives_in_application_state: true,
      household_size: "1",
      member_age: "30",
      member_has_documentary_or_collateral_evidence_of_ssn_application_or_every_effort: true,
      member_is_us_citizen: true,
      student_age: "30",
      member_registered_for_work_or_registered_by_state: true,
      member_participated_in_snap_et_if_assigned: true,
      member_participated_in_workfare_if_assigned: true,
      member_provided_employment_status_or_availability_information: true,
      member_reported_to_referred_suitable_employer_if_referred: true,
      member_accepted_bona_fide_suitable_employment_offer_if_offered: true,
    },
    headline: [
      { slot: "household_size", entity: "Household", label: "People in the household" },
      { slot: "snap_gross_monthly_earned_income", entity: "Household", label: "Monthly earned income" },
      { slot: "household_shelter_costs_incurred", entity: "Household", label: "Monthly shelter costs" },
      { slot: "member_age", entity: "Person", label: "Age", per_person: true },
    ],
    outputs: {
      snap_benefit_amount: "snap_benefit",
      snap_net_income: "snap_net_income",
      snap_gross_monthly_income: "snap_gross_monthly_income",
      snap_eligible: "snap_eligible",
    },
    example: {
      household: {
        household_size: "2",
        snap_gross_monthly_earned_income: "1200",
        household_shelter_costs_incurred: "900",
      },
      people: { member_age: ["42", "9"] },
    },
    what_if: {
      parameter: "snap_earned_income_deduction_rate_for_net_income",
      value: "0.3",
      label: "The earned-income deduction rate — 7 USC 2014(e)(2)",
    },
    // The federal arithmetic dominates this household, so the benefit and
    // net income match the values axiom-api's parity suite pins for the
    // same facts through the Colorado composition.
    pin: { snap_benefit_amount: "478", snap_net_income: "226.5" },
  },
];

function buildDirectProgram(config) {
  const manifestPath = join(corpusRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      "public/corpus/ is not generated — run: bun scripts/build-corpus.mjs <rulespec checkout>",
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const closure = resolveClosure(manifest, config.root);
  const modules = Object.fromEntries(
    closure.map((target) => [
      target,
      readFileSync(join(corpusRoot, moduleUrl(target).replace("/corpus/", "")), "utf8"),
    ]),
  );
  const artifactRaw = engine.compile(JSON.stringify(modules), config.root);
  const artifact = JSON.parse(artifactRaw);
  console.log(
    `\n== ${config.id} (direct from corpus): ${closure.length} modules, ` +
      `${artifact.program.derived.length} rules, ${artifact.program.parameters.length} parameters`,
  );

  const commit = manifest.sources[0]?.commit ?? "unknown";
  const { pkg } = synthesizePackage(artifact, config.root, commit);
  pkg.program_id = config.id;
  pkg.jurisdiction = config.jurisdiction;
  pkg.title = config.title;
  pkg.provenance = "envelope";
  pkg.source = {
    repo: manifest.sources[0]?.repo ?? "corpus",
    artifact_path: config.root,
    artifact_sha256: createHash("sha256").update(artifactRaw).digest("hex"),
    corpus_commit: commit,
    engine_version: artifact.engine_version ?? null,
    artifact_format_version: artifact.artifact_format_version ?? null,
  };
  pkg.entities = config.entities;
  pkg.query = { entity_id: config.query_entity_id };
  pkg.headline = config.headline;
  pkg.example = config.example;
  if (config.what_if) pkg.what_if = config.what_if;
  let curated = 0;
  for (const slot of Object.values(pkg.defaults)) {
    const value = config.slotDefaultsByName[slot.name];
    if (value !== undefined) {
      slot.value = value;
      curated += 1;
    }
  }

  console.log(`   defaults: ${Object.keys(pkg.defaults).length} synthesized, ${curated} curated`);

  const { corrected, admitted } = probeFixpoint(engine, artifactRaw, artifact, pkg);
  console.log(`   entity attribution: ${corrected} corrected, ${admitted} admitted by probe`);

  const derivedByName = new Map(artifact.program.derived.map((rule) => [rule.name, rule]));
  pkg.outputs = {};
  for (const [name, ruleName] of Object.entries(config.outputs)) {
    const rule = derivedByName.get(ruleName);
    if (!rule?.id) throw new Error(`${config.id}: output "${ruleName}" has no durable id`);
    pkg.outputs[name] = rule.id;
  }

  // The status/gate — before anything executes as "the program" or
  // reaches disk.
  const status = certify(pkg, artifact);
  console.log(`   certification: ${status}`);

  // Final assertion: example executes clean; pins hold when configured.
  const answers = { ...config.example, refOverrides: {} };
  const request = buildPackageRequest({ pkg, answers });
  const response = JSON.parse(engine.execute(artifactRaw, JSON.stringify(request)));
  const result = response.results[0];
  for (const [name, id] of Object.entries(pkg.outputs)) {
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
    provenance: "envelope",
    ...certificationIndexEntry(pkg),
    inputs: Object.keys(pkg.defaults).length,
    rules: artifact.program.derived.length,
    parameters: artifact.program.parameters.length,
  };
}

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
  // snap/us-ny is superseded by the corpus-direct ny-snap above: the api
  // artifact addresses inputs under a synthetic `axiom:` prefix, which is
  // uncertifiable — listing it here would only re-vendor the same id.
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

  // The status/gate — enforced drops uncertified programs here.
  console.log(`   certification: ${certify(pkg, artifact)}`);

  const dir = join(outRoot, config.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "artifact.json"), artifactRaw);
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 1));
  return {
    id: config.id,
    title: config.title,
    jurisdiction: config.jurisdiction,
    ...certificationIndexEntry(pkg),
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

  // The status/gate — legacy artifacts address inputs under a synthetic
  // `axiom:` prefix, which no ledger can certify: "encoded" by
  // construction under permissive, refused under enforced, until re-cut
  // with durable input ids upstream.
  console.log(`   certification: ${certify(pkg, artifact)}`);

  const dir = join(outRoot, config.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "artifact.json"), artifactRaw);
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg, null, 1));
  return {
    id: config.id,
    title: config.title,
    jurisdiction: entry.jurisdiction,
    provenance: "legacy",
    ...certificationIndexEntry(pkg),
    inputs: Object.keys(pkg.defaults).length,
    rules: artifact.program.derived.length,
    parameters: artifact.program.parameters.length,
  };
}

// Fail closed on disk too: wipe the vendored tree so nothing stale (or
// previously admitted under a different ledger) survives a re-vendor.
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

/** Refusals go to stderr in full — build tooling may name uncertified ids. */
function excluded(id, error) {
  console.error(`EXCLUDED ${id}: ${error instanceof Error ? error.message : error}`);
}

const index = [];
for (const config of DIRECT_PROGRAMS) {
  try {
    index.push(buildDirectProgram(config));
  } catch (error) {
    excluded(config.id, error);
  }
}
if (!apiCheckout) {
  console.error(
    `no axiom-api checkout supplied — ${PROGRAMS.length + LEGACY_PROGRAMS.length} api-sourced ` +
      "candidates cannot be read and therefore do not vendor",
  );
} else {
  for (const config of PROGRAMS) {
    try {
      index.push({ ...buildProgram(config), provenance: "envelope" });
    } catch (error) {
      excluded(config.id, error);
    }
  }
  for (const config of LEGACY_PROGRAMS) {
    try {
      index.push(buildLegacyProgram(config));
    } catch (error) {
      excluded(config.id, error);
    }
  }
}
writeFileSync(join(outRoot, "index.json"), JSON.stringify({ programs: index }, null, 1));
const counts = index.reduce((acc, entry) => {
  acc[entry.certification] = (acc[entry.certification] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `\nwrote ${outRoot}/index.json with ${index.length} program(s) ` +
    `(${counts.certified ?? 0} certified, ${counts.encoded ?? 0} encoded) — ` +
    `enforcement ${enforcement}, ledger ${certified ? certified.ledger.ledger_id : "(none)"}`,
);
