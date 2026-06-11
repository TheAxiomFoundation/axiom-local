/**
 * Turning an explain-mode response into a display tree.
 *
 * The engine's trace is a flat map of durable id → derived value with
 * dependency edges between *derived* rules. The compiled artifact carries
 * each rule's full expression tree, every parameter table, and the dataset
 * carries the visitor's answers — together that pins every node of the
 * calculation to either a statutory id or an answer given on this page.
 */

import type {
  CompiledProgramArtifact,
  Dataset,
  DerivedSpec,
  JudgmentExpr,
  ParameterSpec,
  QueryResult,
  ScalarExpr,
  ScalarValue,
} from "./engine/types";
import { formatOutcome, formatScalarValue } from "./format";
import {
  collectRefs,
  indexProgram,
  moduleOf,
  publicKeyOf,
  resolveParameterValue,
  type ProgramIndex,
} from "./program";

// ---------------------------------------------------------------------------
// Pretty-printing expressions
// ---------------------------------------------------------------------------

type AnyExpr = ScalarExpr | JudgmentExpr;

/** Resolver used when substituting concrete values into a formula. */
interface Substitution {
  input(name: string): string | undefined;
  derived(name: string): string | undefined;
  parameter(name: string, indexKey: string | undefined): string | undefined;
}

const COMPARISON_GLYPHS: Record<string, string> = {
  lt: "<",
  le: "≤",
  gt: ">",
  ge: "≥",
  eq: "=",
  ne: "≠",
};

/** Precedence levels for minimal parenthesisation. */
function precedence(expr: AnyExpr): number {
  switch (expr.kind) {
    case "or":
      return 1;
    case "and":
      return 2;
    case "comparison":
      return 3;
    case "add":
    case "sub":
      return 4;
    case "mul":
    case "div":
      return 5;
    default:
      return 9;
  }
}

function renderLiteralIndex(expr: ScalarExpr): string | undefined {
  if (expr.kind !== "literal") return undefined;
  return String(expr.value.value);
}

function formatExprInner(expr: AnyExpr, substitute: Substitution | null): string {
  const child = (inner: AnyExpr, parent: AnyExpr, rightOfNoncommutative = false): string => {
    const text = formatExprInner(inner, substitute);
    const needsParens =
      precedence(inner) < precedence(parent) ||
      (rightOfNoncommutative && precedence(inner) === precedence(parent));
    return needsParens ? `(${text})` : text;
  };

  switch (expr.kind) {
    case "literal":
      return String(expr.value.value);
    case "input":
      return substitute?.input(expr.name) ?? expr.name;
    case "input_or_else":
      return substitute?.input(expr.name) ?? `${expr.name} else ${String(expr.default.value)}`;
    case "derived":
      return substitute?.derived(expr.name) ?? expr.name;
    case "parameter_lookup": {
      const literalIndex = renderLiteralIndex(expr.index);
      if (substitute) {
        const indexKey =
          literalIndex ??
          (expr.index.kind === "input"
            ? substitute.input(expr.index.name)?.replace(/[^0-9.-]/g, "")
            : undefined);
        const resolved = substitute.parameter(expr.parameter, indexKey);
        if (resolved !== undefined) return resolved;
      }
      // A scalar parameter compiles to a lookup at literal index 0 — print
      // it as the bare name the statute used.
      if (literalIndex === "0") return expr.parameter;
      return `${expr.parameter}[${formatExprInner(expr.index, substitute)}]`;
    }
    case "add":
      return expr.items.map((item) => child(item, expr)).join(" + ");
    case "sub":
      return `${child(expr.left, expr)} − ${child(expr.right, expr, true)}`;
    case "mul":
      return `${child(expr.left, expr)} × ${child(expr.right, expr)}`;
    case "div":
      return `${child(expr.left, expr)} ÷ ${child(expr.right, expr, true)}`;
    case "max":
      return `max(${expr.items.map((item) => formatExprInner(item, substitute)).join(", ")})`;
    case "min":
      return `min(${expr.items.map((item) => formatExprInner(item, substitute)).join(", ")})`;
    case "ceil":
      return `ceil(${formatExprInner(expr.value, substitute)})`;
    case "floor":
      return `floor(${formatExprInner(expr.value, substitute)})`;
    case "period_start":
      return "period_start";
    case "period_end":
      return "period_end";
    case "date_add_days":
      return `date_add_days(${formatExprInner(expr.date, substitute)}, ${formatExprInner(expr.days, substitute)})`;
    case "days_between":
      return `days_between(${formatExprInner(expr.from, substitute)}, ${formatExprInner(expr.to, substitute)})`;
    case "count_related":
      return `count_related(${expr.relation})`;
    case "sum_related":
      return `sum_related(${expr.relation})`;
    case "if":
      return `if ${formatExprInner(expr.condition, substitute)} then ${formatExprInner(
        expr.then_expr,
        substitute,
      )} else ${formatExprInner(expr.else_expr, substitute)}`;
    case "comparison":
      return `${child(expr.left, expr)} ${COMPARISON_GLYPHS[expr.op] ?? expr.op} ${child(
        expr.right,
        expr,
      )}`;
    case "and":
      return expr.items.map((item) => child(item, expr)).join(" and ");
    case "or":
      return expr.items.map((item) => child(item, expr)).join(" or ");
    case "not":
      return `not ${child(expr.item, expr)}`;
    case "relation_member":
      return `relation_member(${expr.relation})`;
  }
}

export function formatExpr(expr: AnyExpr): string {
  return formatExprInner(expr, null);
}

// ---------------------------------------------------------------------------
// The display tree
// ---------------------------------------------------------------------------

export type NodeOrigin = "derived" | "parameter" | "input";

export interface DisplayNode {
  /** Unique key within the tree (path-based, for React). */
  key: string;
  /** Durable legal id (or bare name when the module declared none). */
  refId: string;
  /** Rule/input name as written in formulas. */
  label: string;
  origin: NodeOrigin;
  module: string | null;
  /** Formatted value, or judgment outcome, or null when unresolvable. */
  valueText: string | null;
  rawValue?: ScalarValue;
  unit?: string | null;
  /** Pretty formula (derived rules only). */
  formula?: string;
  /** The formula with every operand replaced by its concrete value. */
  substituted?: string;
  /** Context line, e.g. `entry for household_size = 1` or `your answer`. */
  note?: string;
  source?: string | null;
  sourceUrl?: string | null;
  children: DisplayNode[];
}

export interface BuildTreeOptions {
  outputId: string;
  result: QueryResult;
  artifact: CompiledProgramArtifact;
  dataset: Dataset;
}

function datasetValue(dataset: Dataset, bareName: string): ScalarValue | undefined {
  return dataset.inputs.find((record) => record.name.endsWith(`#input.${bareName}`))?.value;
}

function indexKeyFor(
  index: ProgramIndex,
  dataset: Dataset,
  indexExpr: ScalarExpr | undefined,
): string | undefined {
  if (!indexExpr) return undefined;
  if (indexExpr.kind === "literal") return String(indexExpr.value.value);
  if (indexExpr.kind === "input") {
    const value = datasetValue(dataset, indexExpr.name);
    return value === undefined ? undefined : String(value.value);
  }
  return undefined;
}

function makeSubstitution(
  index: ProgramIndex,
  result: QueryResult,
  dataset: Dataset,
): Substitution {
  const periodStart = result.period.start;
  return {
    input(name) {
      const value = datasetValue(dataset, name);
      if (value === undefined) return undefined;
      // Inputs are unitless in the dataset; borrow no unit — show the raw
      // figure (money formatting happens on the node's own value line).
      return formatScalarValue(value);
    },
    derived(name) {
      const traceNode = result.trace[publicKeyOf(index, name)];
      if (!traceNode) return undefined;
      if (traceNode.kind === "scalar") return formatScalarValue(traceNode.value, traceNode.unit);
      return formatOutcome(traceNode.outcome);
    },
    parameter(name, indexKey) {
      const parameter = index.parameterByName.get(name);
      if (!parameter) return undefined;
      const value = resolveParameterValue(parameter, periodStart, indexKey ?? "0");
      if (value === undefined) return undefined;
      return formatScalarValue(value, parameter.unit);
    },
  };
}

/**
 * Build the chain-of-citation tree for one queried output. Derived nodes
 * come from the engine's trace; their operands are read out of the compiled
 * expression so parameter tables and the visitor's own answers appear as
 * leaves with durable references.
 */
export function buildDisplayTree(options: BuildTreeOptions): DisplayNode | null {
  const { outputId, result, artifact, dataset } = options;
  const index = indexProgram(artifact);
  const substitution = makeSubstitution(index, result, dataset);
  const periodStart = result.period.start;

  function derivedNode(traceKey: string, path: string, seen: Set<string>): DisplayNode | null {
    const traceEntry = result.trace[traceKey];
    if (!traceEntry) return null;
    const spec: DerivedSpec | undefined =
      index.derivedById.get(traceKey) ?? index.derivedByName.get(traceEntry.name);
    const module = moduleOf(traceEntry.id ?? spec?.id);

    const children: DisplayNode[] = [];
    if (spec && !seen.has(traceKey)) {
      const nextSeen = new Set(seen).add(traceKey);
      for (const [position, ref] of collectRefs(spec.expr).entries()) {
        const childPath = `${path}.${position}`;
        if (ref.type === "derived") {
          const childKey = publicKeyOf(index, ref.name);
          const node = derivedNode(childKey, childPath, nextSeen);
          if (node) children.push(node);
        } else if (ref.type === "input") {
          children.push(inputNode(ref.name, module, childPath));
        } else {
          children.push(parameterNode(ref.name, ref.index, childPath));
        }
      }
    }

    return {
      key: path,
      refId: traceEntry.id ?? traceEntry.name,
      label: traceEntry.name,
      origin: "derived",
      module,
      valueText:
        traceEntry.kind === "scalar"
          ? formatScalarValue(traceEntry.value, traceEntry.unit)
          : formatOutcome(traceEntry.outcome),
      rawValue: traceEntry.kind === "scalar" ? traceEntry.value : undefined,
      unit: traceEntry.unit,
      formula: spec ? formatExpr(spec.expr) : undefined,
      substituted: spec ? formatExprInner(spec.expr, substitution) : undefined,
      source: traceEntry.source ?? spec?.source ?? null,
      sourceUrl: traceEntry.source_url ?? spec?.source_url ?? null,
      children,
    };
  }

  function inputNode(name: string, module: string | null, path: string): DisplayNode {
    const value = datasetValue(dataset, name);
    return {
      key: path,
      refId: module ? `${module}#input.${name}` : name,
      label: name,
      origin: "input",
      module,
      valueText: value === undefined ? null : formatScalarValue(value),
      rawValue: value,
      note: "your answer — never left this page",
      children: [],
    };
  }

  function parameterNode(
    name: string,
    indexExpr: ScalarExpr | undefined,
    path: string,
  ): DisplayNode {
    const parameter = index.parameterByName.get(name);
    const indexKey = indexKeyFor(index, dataset, indexExpr);
    const value = parameter
      ? resolveParameterValue(parameter, periodStart, indexKey ?? "0")
      : undefined;
    const version = parameter ? liveEffectiveFrom(parameter, periodStart) : undefined;
    const noteParts: string[] = [];
    if (parameter?.indexed_by && indexKey !== undefined) {
      noteParts.push(`entry for ${parameter.indexed_by} = ${indexKey}`);
    }
    if (version) noteParts.push(`effective from ${version}`);
    return {
      key: path,
      refId: parameter?.id ?? name,
      label: name,
      origin: "parameter",
      module: moduleOf(parameter?.id),
      valueText: value === undefined ? null : formatScalarValue(value, parameter?.unit),
      rawValue: value,
      unit: parameter?.unit,
      note: noteParts.length > 0 ? noteParts.join(" · ") : undefined,
      children: [],
    };
  }

  function liveEffectiveFrom(parameter: ParameterSpec, start: string): string | undefined {
    let best: string | undefined;
    for (const version of parameter.versions) {
      if (version.effective_from > start) continue;
      if (!best || version.effective_from > best) best = version.effective_from;
    }
    return best;
  }

  return derivedNode(outputId, "root", new Set());
}
