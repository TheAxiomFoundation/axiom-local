/**
 * The runnable descriptor and its request builder: a compiled artifact
 * plus the slot/entity/output plan that makes it answerable. Descriptors
 * are synthesized per slice by src/lib/corpus.ts (there are no vendored
 * program packages) and carry a screening-presumption default for every
 * discovered input. Callers state the handful of facts they know; every
 * other input takes its default — and all of them stay visible and
 * overridable, because presuming an answer is a legal position the trace
 * must be able to show.
 *
 * This module is shared verbatim by the page (browser/web wasm build), the
 * CLI, and the test suite (vendored nodejs build), like src/lib/request.ts.
 */

import type {
  CompiledExecutionRequest,
  Dataset,
  ExecutionMode,
  InputRecord,
  Interval,
  RelationRecord,
  ScalarValue,
} from "./engine/types";
import type { CertificationStatus, CertifiedProvenance } from "./certified";

export interface PackageDefault {
  name: string;
  entity: string;
  dtype: string;
  value: unknown;
  /** For text inputs: the values the program's own comparisons mention. */
  options?: string[];
}

export interface PackageHeadline {
  slot: string;
  entity: string;
  label: string;
  per_person?: boolean;
}

export interface PackageEntityConfig {
  entity: string;
  id_template: string;
  count?: number;
  count_from?: string;
  relations?: { name: string; tuple: string[] }[];
}

export interface PackageWhatIf {
  parameter: string;
  value: string;
  label: string;
}

export interface PackageExample {
  household: Record<string, string>;
  people: Record<string, string[]>;
}

export interface GoldenPackage {
  program_id: string;
  jurisdiction: string;
  title: string;
  /** "envelope": engine-stamped artifact; "legacy": pre-envelope, hash-pinned only. */
  provenance?: "envelope" | "legacy";
  /**
   * Launch-taxonomy status stamped at vendor time: "certified" when the
   * full closure is in the ledger, "encoded" otherwise. A claim — the
   * loader recomputes the truth (packageStatus in src/lib/certified.ts).
   */
  certification?: CertificationStatus;
  /**
   * Certificate provenance, stamped only when certification was earned.
   * Under ENFORCED serving its absence is a load refusal; under
   * permissive it is the difference between the two status labels.
   */
  certified?: CertifiedProvenance;
  source: {
    repo: string;
    artifact_path: string;
    artifact_sha256: string;
    /** Corpus commit, for programs compiled directly from public/corpus/. */
    corpus_commit?: string;
    engine_version: string | null;
    artifact_format_version: number | null;
  };
  query: { entity_id: string };
  entities: PackageEntityConfig[];
  headline: PackageHeadline[];
  outputs: Record<string, string>;
  default_period: string;
  example: PackageExample;
  what_if?: PackageWhatIf;
  defaults: Record<string, PackageDefault>;
}

/** Answers for the headline questions, keyed by slot name. */
export interface GoldenAnswers {
  /** Household-entity slot overrides, e.g. { household_size: "2" }. */
  household: Record<string, string>;
  /** Per-person values for per_person headline slots, e.g. member_age. */
  people?: Record<string, string[]>;
  /**
   * Overrides for individual presumed answers, keyed by durable input ref.
   * Wins over both defaults and slot-name answers: a presumption the visitor
   * corrected is the most specific statement of the facts.
   */
  refOverrides?: Record<string, string>;
}

/**
 * axiom-api's interval convention for these artifacts: month start to the
 * first day of the next month (exclusive end). The pinned parity values were
 * produced through this shape, so this repo reproduces it exactly.
 */
export function packageMonthInterval(period: string): Interval {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error(`Not a calendar month: "${period}" (expected YYYY-MM)`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Not a calendar month: "${period}"`);
  const mm = String(month).padStart(2, "0");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${year}-${mm}-01`,
    end: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

/** Typed engine value from a descriptor default or a typed-in override. */
export function packageFact(value: unknown, dtype: string): ScalarValue {
  if (dtype === "bool") {
    if (typeof value === "string") {
      return { kind: "bool", value: value === "true" || value === "True" || value === "1" };
    }
    return { kind: "bool", value: Boolean(value) };
  }
  if (dtype === "integer") {
    const numeric = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
    return { kind: "integer", value: Math.round(Number.isFinite(numeric) ? numeric : 0) };
  }
  if (dtype === "date") return { kind: "date", value: String(value) };
  if (dtype === "text") return { kind: "text", value: String(value) };
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  return { kind: "decimal", value: String(Number.isFinite(numeric) ? numeric : 0) };
}

/**
 * Answers that would silently coerce to 0: non-numeric text supplied for a
 * decimal/integer slot. packageFact's forgiving coercion is right for
 * presumed defaults, but a typo the visitor typed ("12oo") must be rejected
 * loudly, not computed as $0.
 */
export function findInvalidNumericAnswers(pkg: GoldenPackage, answers: GoldenAnswers): string[] {
  const problems: string[] = [];
  const numeric = (dtype: string) => dtype === "decimal" || dtype === "integer";
  const bad = (value: string) =>
    value.trim() !== "" && !Number.isFinite(Number(value.replace(/[$,\s]/g, "")));
  const byName = new Map<string, PackageDefault>();
  for (const slot of Object.values(pkg.defaults)) byName.set(slot.name, slot);

  for (const [name, value] of Object.entries(answers.household)) {
    const slot = byName.get(name);
    if (slot && numeric(slot.dtype) && bad(value)) problems.push(`${name} = "${value}"`);
  }
  for (const [name, values] of Object.entries(answers.people ?? {})) {
    const slot = byName.get(name);
    if (!slot || !numeric(slot.dtype)) continue;
    for (const value of values) if (bad(value)) problems.push(`${name} = "${value}"`);
  }
  for (const [ref, value] of Object.entries(answers.refOverrides ?? {})) {
    const slot = pkg.defaults[ref];
    if (slot && numeric(slot.dtype) && bad(value)) problems.push(`${slot.name} = "${value}"`);
  }
  return problems;
}

function renderTemplate(template: string, index: number): string {
  return template.replaceAll("{index}", String(index));
}

function entityCount(config: PackageEntityConfig, answers: GoldenAnswers): number {
  if (typeof config.count === "number") return Math.max(1, Math.floor(config.count));
  if (config.count_from) {
    const fromAnswer = Number(answers.household[config.count_from]);
    if (Number.isFinite(fromAnswer) && fromAnswer >= 1) return Math.floor(fromAnswer);
  }
  return 1;
}

export interface BuildPackageRequestOptions {
  pkg: GoldenPackage;
  answers: GoldenAnswers;
  month?: string;
  /** Output names (keys of pkg.outputs) to query. Defaults to all. */
  outputs?: string[];
  mode?: ExecutionMode;
}

export function buildPackageRequest(options: BuildPackageRequestOptions): CompiledExecutionRequest {
  const { pkg, answers } = options;
  const interval = packageMonthInterval(options.month ?? pkg.default_period);
  const inputs: InputRecord[] = [];
  const relations: RelationRecord[] = [];

  for (const entityConfig of pkg.entities) {
    const count = entityCount(entityConfig, answers);
    for (let index = 1; index <= count; index += 1) {
      const entityId = renderTemplate(entityConfig.id_template, index);
      for (const [ref, slot] of Object.entries(pkg.defaults)) {
        if (slot.entity !== entityConfig.entity) continue;
        let value: unknown = slot.value;
        // Slot-name answers apply to whichever entity the slot lives on —
        // Household for the SNAPs, TaxUnit for the tax programs. Per-person
        // arrays win on indexed entities; ref overrides are most specific.
        if (answers.household[slot.name] !== undefined) {
          value = answers.household[slot.name];
        }
        const perPerson = answers.people?.[slot.name];
        if (perPerson?.[index - 1] !== undefined) {
          value = perPerson[index - 1];
        }
        if (answers.refOverrides?.[ref] !== undefined) {
          value = answers.refOverrides[ref];
        }
        inputs.push({
          name: ref,
          entity: entityConfig.entity,
          entity_id: entityId,
          interval,
          value: packageFact(value, slot.dtype),
        });
      }
      for (const relation of entityConfig.relations ?? []) {
        relations.push({
          name: relation.name,
          tuple: relation.tuple.map((part) => renderTemplate(part, index)),
          interval,
        });
      }
    }
  }

  const outputNames = options.outputs ?? Object.keys(pkg.outputs);
  const dataset: Dataset = { inputs, relations };
  return {
    mode: options.mode ?? "explain",
    dataset,
    queries: [
      {
        entity_id: pkg.query.entity_id,
        period: { period_kind: "month", ...interval },
        outputs: outputNames.map((name) => {
          const id = pkg.outputs[name];
          if (!id) throw new Error(`Package has no output named "${name}"`);
          return id;
        }),
      },
    ],
  };
}
