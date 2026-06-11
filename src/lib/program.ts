/**
 * Static analysis over a compiled program artifact.
 *
 * The artifact carries the full compiled expression tree for every derived
 * rule, plus every parameter table with its versions. That is enough to
 * discover which inputs a program needs (so the household panel can build
 * a form for *any* program, not just the bundled example) and to resolve
 * the concrete parameter entries a calculation used (so the trace can show
 * them as leaves with their durable legal ids).
 */

import type {
  CompiledProgramArtifact,
  DerivedSpec,
  JudgmentExpr,
  ParameterSpec,
  ParameterVersion,
  ScalarExpr,
  ScalarValue,
} from "./engine/types";

/** `us:policies/...#fragment` → `us:policies/...` (null when no fragment). */
export function moduleOf(durableId: string | null | undefined): string | null {
  if (!durableId) return null;
  const hash = durableId.indexOf("#");
  return hash === -1 ? null : durableId.slice(0, hash);
}

export function fragmentOf(durableId: string): string {
  const hash = durableId.indexOf("#");
  return hash === -1 ? durableId : durableId.slice(hash + 1);
}

// ---------------------------------------------------------------------------
// Expression walking
// ---------------------------------------------------------------------------

export type ExprRef =
  | { type: "input"; name: string }
  | { type: "derived"; name: string }
  | { type: "parameter"; name: string; index?: ScalarExpr };

type AnyExpr = ScalarExpr | JudgmentExpr;

function walk(expr: AnyExpr, visit: (ref: ExprRef) => void): void {
  switch (expr.kind) {
    case "input":
    case "input_or_else":
      visit({ type: "input", name: expr.name });
      return;
    case "derived":
      visit({ type: "derived", name: expr.name });
      return;
    case "parameter_lookup":
      visit({ type: "parameter", name: expr.parameter, index: expr.index });
      walk(expr.index, visit);
      return;
    case "add":
    case "max":
    case "min":
    case "and":
    case "or":
      for (const item of expr.items) walk(item, visit);
      return;
    case "sub":
    case "mul":
    case "div":
      walk(expr.left, visit);
      walk(expr.right, visit);
      return;
    case "ceil":
    case "floor":
      walk(expr.value, visit);
      return;
    case "not":
      walk(expr.item, visit);
      return;
    case "if":
      walk(expr.condition, visit);
      walk(expr.then_expr, visit);
      walk(expr.else_expr, visit);
      return;
    case "comparison":
      walk(expr.left, visit);
      walk(expr.right, visit);
      return;
    case "date_add_days":
      walk(expr.date, visit);
      walk(expr.days, visit);
      return;
    case "days_between":
      walk(expr.from, visit);
      walk(expr.to, visit);
      return;
    case "count_related":
    case "sum_related":
      if (expr.where) walk(expr.where, visit);
      return;
    case "literal":
    case "period_start":
    case "period_end":
    case "relation_member":
      return;
  }
}

/** References in order of first appearance, de-duplicated. */
export function collectRefs(expr: AnyExpr): ExprRef[] {
  const refs: ExprRef[] = [];
  const seen = new Set<string>();
  walk(expr, (ref) => {
    const key = `${ref.type}:${ref.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  });
  return refs;
}

// ---------------------------------------------------------------------------
// Lookup tables over the artifact
// ---------------------------------------------------------------------------

export interface ProgramIndex {
  artifact: CompiledProgramArtifact;
  derivedById: Map<string, DerivedSpec>;
  derivedByName: Map<string, DerivedSpec>;
  parameterByName: Map<string, ParameterSpec>;
}

export function indexProgram(artifact: CompiledProgramArtifact): ProgramIndex {
  const derivedById = new Map<string, DerivedSpec>();
  const derivedByName = new Map<string, DerivedSpec>();
  const parameterByName = new Map<string, ParameterSpec>();
  for (const derived of artifact.program.derived) {
    if (derived.id) derivedById.set(derived.id, derived);
    derivedByName.set(derived.name, derived);
  }
  for (const parameter of artifact.program.parameters) {
    parameterByName.set(parameter.name, parameter);
  }
  return { artifact, derivedById, derivedByName, parameterByName };
}

/** The key a derived rule appears under in trace maps: durable id, else name. */
export function publicKeyOf(index: ProgramIndex, name: string): string {
  return index.derivedByName.get(name)?.id ?? name;
}

// ---------------------------------------------------------------------------
// Parameter resolution (mirrors the engine's version selection for display)
// ---------------------------------------------------------------------------

/** Latest version whose effective_from is on or before the period start. */
export function liveVersion(
  parameter: ParameterSpec,
  periodStart: string,
): ParameterVersion | undefined {
  let best: ParameterVersion | undefined;
  for (const version of parameter.versions) {
    if (version.effective_from > periodStart) continue;
    if (!best || version.effective_from > best.effective_from) best = version;
  }
  return best;
}

export function resolveParameterValue(
  parameter: ParameterSpec,
  periodStart: string,
  indexKey: string,
): ScalarValue | undefined {
  return liveVersion(parameter, periodStart)?.values[indexKey];
}

// ---------------------------------------------------------------------------
// Input discovery (drives the household form for any loaded program)
// ---------------------------------------------------------------------------

export type InputFlavor = "integer" | "money" | "decimal";

export interface DiscoveredInput {
  /** Bare name as written in formulas, e.g. `net_income`. */
  name: string;
  /** Durable reference the dataset must use: `<module>#input.<name>`. */
  ref: string;
  /** Canonical target of the module whose rules read this input. */
  module: string;
  /** Entity the referencing rule is computed for (e.g. `Household`). */
  entity: string;
  /** Heuristic for picking a friendly form control. */
  flavor: InputFlavor;
  /** When the input indexes a parameter table: the table's valid keys. */
  tableKeys?: string[];
  /** Unit of the money amounts this input is combined with, if money. */
  unit?: string | null;
}

const INTEGERISH = /(^|_)(size|count|number|members|age|persons|children)(_|$)/;
const MONEYISH = /(income|amount|cost|expense|rent|earning|wage|asset|saving|benefit|payment)/;

/**
 * Scan every derived rule's expression tree for input references. An input
 * resolves relative to the module whose formula reads it, exactly like the
 * engine resolves it, so `<module-of-derived>#input.<name>` is the durable
 * dataset name. The same bare name read from two modules is two inputs.
 */
export function discoverInputs(artifact: CompiledProgramArtifact): DiscoveredInput[] {
  const index = indexProgram(artifact);
  const found = new Map<string, DiscoveredInput>();

  for (const derived of artifact.program.derived) {
    const module = moduleOf(derived.id);
    if (!module) continue;
    for (const ref of collectRefs(derived.expr)) {
      if (ref.type !== "input") continue;
      const durable = `${module}#input.${ref.name}`;
      if (found.has(durable)) continue;
      found.set(durable, {
        name: ref.name,
        ref: durable,
        module,
        entity: derived.entity,
        flavor: INTEGERISH.test(ref.name)
          ? "integer"
          : MONEYISH.test(ref.name)
            ? "money"
            : "decimal",
        unit: MONEYISH.test(ref.name) ? (derived.unit ?? "USD") : null,
      });
    }

    // An input used as a table index gets the table's keys as its domain,
    // so the form can bound the control to entries the statute defines.
    for (const ref of collectRefs(derived.expr)) {
      if (ref.type !== "parameter" || !ref.index || ref.index.kind !== "input") continue;
      const durable = `${module}#input.${ref.index.name}`;
      const input = found.get(durable);
      const parameter = index.parameterByName.get(ref.name);
      if (!input || !parameter?.indexed_by) continue;
      const keys = new Set<string>();
      for (const version of parameter.versions) {
        for (const key of Object.keys(version.values)) keys.add(key);
      }
      input.tableKeys = [...keys].sort((a, b) => Number(a) - Number(b));
      if (input.tableKeys.every((k) => /^\d+$/.test(k))) input.flavor = "integer";
    }
  }

  return [...found.values()];
}

/**
 * Pick a sensible default root target: one that no *other* module's text
 * mentions (i.e. nothing imports it). Falls back to the last key.
 */
export function guessRootTarget(modules: Record<string, string>): string {
  const entries = Object.entries(modules);
  const targets = entries.map(([target]) => target);
  const imported = new Set(
    targets.filter((target) =>
      entries.some(([other, yaml]) => other !== target && yaml.includes(target)),
    ),
  );
  const roots = targets.filter((target) => !imported.has(target));
  return roots[roots.length - 1] ?? targets[targets.length - 1];
}
