/**
 * TypeScript mirrors of the engine's JSON boundary.
 *
 * The wasm bindings serialize the exact serde types the axiom-rules-engine
 * CLI speaks (see src/api.rs, src/spec.rs, src/compile.rs upstream). Nothing
 * here is invented on the JS side — these are transcriptions of those
 * shapes so the UI and tests stay honest about what crosses the boundary.
 */

// ---------------------------------------------------------------------------
// Scalar values
// ---------------------------------------------------------------------------

export type ScalarValue =
  | { kind: "bool"; value: boolean }
  | { kind: "integer"; value: number }
  | { kind: "decimal"; value: string }
  | { kind: "text"; value: string }
  | { kind: "date"; value: string };

export type JudgmentOutcome = "holds" | "not_holds" | "undetermined";

export type DType = "judgment" | "bool" | "integer" | "decimal" | "text" | "date";

// ---------------------------------------------------------------------------
// Dataset (the household's answers — built and consumed on-device)
// ---------------------------------------------------------------------------

export interface Interval {
  start: string; // ISO date
  end: string; // ISO date
}

export interface InputRecord {
  /** Absolute legal reference, e.g. `us:policies/...#input.net_income`. */
  name: string;
  entity: string;
  entity_id: string;
  interval: Interval;
  value: ScalarValue;
}

export interface RelationRecord {
  name: string;
  entity_ids: string[];
  interval: Interval;
}

export interface Dataset {
  inputs: InputRecord[];
  relations: RelationRecord[];
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type ExecutionMode = "explain" | "fast";

export interface Period extends Interval {
  period_kind: "month" | "benefit_week" | "tax_year" | { custom: { name: string } };
}

export interface ExecutionQuery {
  entity_id: string;
  period: Period;
  outputs: string[];
  assessment_date?: string;
}

export interface CompiledExecutionRequest {
  mode: ExecutionMode;
  dataset: Dataset;
  queries: ExecutionQuery[];
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface ExecutionMetadata {
  requested_mode: ExecutionMode;
  actual_mode: ExecutionMode;
  fallback_reason: string | null;
}

export type OutputValue =
  | {
      kind: "scalar";
      name: string;
      id?: string;
      dtype: DType;
      unit: string | null;
      value: ScalarValue;
    }
  | {
      kind: "judgment";
      name: string;
      id?: string;
      unit: string | null;
      outcome: JudgmentOutcome;
    };

export type TraceNode =
  | {
      kind: "scalar";
      name: string;
      id?: string;
      dtype: DType;
      unit: string | null;
      value: ScalarValue;
      source?: string;
      source_url?: string;
      dependencies: string[];
    }
  | {
      kind: "judgment";
      name: string;
      id?: string;
      unit: string | null;
      outcome: JudgmentOutcome;
      source?: string;
      source_url?: string;
      dependencies: string[];
    };

export interface QueryResult {
  entity_id: string;
  period: Period;
  assessment_date?: string;
  outputs: Record<string, OutputValue>;
  trace: Record<string, TraceNode>;
}

export interface ExecutionResponse {
  metadata: ExecutionMetadata;
  results: QueryResult[];
}

// ---------------------------------------------------------------------------
// Compiled program artifact (what `compile` returns)
// ---------------------------------------------------------------------------

export type ScalarExpr =
  | { kind: "literal"; value: ScalarValue }
  | { kind: "input"; name: string }
  | { kind: "input_or_else"; name: string; default: ScalarValue }
  | { kind: "derived"; name: string }
  | { kind: "parameter_lookup"; parameter: string; index: ScalarExpr }
  | { kind: "add"; items: ScalarExpr[] }
  | { kind: "sub"; left: ScalarExpr; right: ScalarExpr }
  | { kind: "mul"; left: ScalarExpr; right: ScalarExpr }
  | { kind: "div"; left: ScalarExpr; right: ScalarExpr }
  | { kind: "max"; items: ScalarExpr[] }
  | { kind: "min"; items: ScalarExpr[] }
  | { kind: "ceil"; value: ScalarExpr }
  | { kind: "floor"; value: ScalarExpr }
  | { kind: "period_start" }
  | { kind: "period_end" }
  | { kind: "date_add_days"; date: ScalarExpr; days: ScalarExpr }
  | { kind: "days_between"; from: ScalarExpr; to: ScalarExpr }
  | {
      kind: "count_related";
      relation: string;
      current_slot: number;
      related_slot: number;
      where?: JudgmentExpr;
    }
  | {
      kind: "sum_related";
      relation: string;
      current_slot: number;
      related_slot: number;
      value: unknown;
      where?: JudgmentExpr;
    }
  | { kind: "if"; condition: JudgmentExpr; then_expr: ScalarExpr; else_expr: ScalarExpr };

export type ComparisonOp = "lt" | "le" | "gt" | "ge" | "eq" | "ne";

export type JudgmentExpr =
  | { kind: "comparison"; left: ScalarExpr; op: ComparisonOp; right: ScalarExpr }
  | { kind: "derived"; name: string }
  | { kind: "relation_member"; relation: string; current_slot: number; related_slot: number }
  | { kind: "and"; items: JudgmentExpr[] }
  | { kind: "or"; items: JudgmentExpr[] }
  | { kind: "not"; item: JudgmentExpr };

export interface ParameterVersion {
  effective_from: string;
  values: Record<string, ScalarValue>;
}

export interface ParameterSpec {
  id?: string | null;
  name: string;
  unit: string | null;
  indexed_by: string | null;
  versions: ParameterVersion[];
}

export interface DerivedSpec {
  id?: string | null;
  name: string;
  entity: string;
  dtype: DType;
  unit: string | null;
  period?: string | null;
  source?: string | null;
  source_url?: string | null;
  semantics: "scalar" | "judgment";
  expr: ScalarExpr | JudgmentExpr;
}

export interface ProgramSpec {
  extends?: string | null;
  units: unknown[];
  relations: unknown[];
  parameters: ParameterSpec[];
  derived: DerivedSpec[];
}

export interface CompiledProgramArtifact {
  artifact_format_version: number;
  engine_version?: string;
  program: ProgramSpec;
  metadata: {
    evaluation_order: string[];
    fast_path: { strategy: string; compatible: boolean; blockers: string[] };
  };
}

// ---------------------------------------------------------------------------
// The wasm module surface
// ---------------------------------------------------------------------------

/** The four exports of axiom-rules-engine-wasm, shared by both targets. */
export interface EngineBindings {
  compile(modules_json: string, root_target: string): string;
  execute(artifact_json: string, request_json: string): string;
  engine_version(): string;
  artifact_format_version(): number;
}
