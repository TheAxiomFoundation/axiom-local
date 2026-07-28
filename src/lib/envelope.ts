/**
 * The determination envelope: the canonical JSON artifact of a local run,
 * produced identically by the page's JSON affordance and the CLI's
 * --json. Shaped as close to the hosted API's CalculateResponse
 * (axiom-api src/types.ts) as is honest offline — outputs / trace /
 * provenance keep the hosted naming (rule_id, variable, sources,
 * ledger_id, certified_set_version); fields with no offline meaning
 * (hosted runtime ids, release vintages) are not fabricated. What IS
 * meaningful offline is added explicitly: the root and its compiled
 * closure, the corpus pin (corpus.lock.json's commit), the inputs as
 * applied with their stated-vs-presumed flag, and the engine build that
 * executed in-process.
 */

import type { CertificationStatus } from "./certified";
import type {
  CompiledExecutionRequest,
  CompiledProgramArtifact,
  ExecutionResponse,
  Period,
  TraceNode,
} from "./engine/types";
import type { GoldenAnswers, GoldenPackage } from "./goldenPath";

export interface DeterminationEnvelope {
  engine: "axiom";
  runtime: {
    id: "axiom-local";
    /** Offline wasm in the caller's process — never a hosted runtime. */
    mode: "local-wasm";
    engine_version: string | null;
    artifact_format_version: number | null;
  };
  root: string;
  jurisdiction: string;
  /** Module identity: the pinned corpus and the exact compiled closure. */
  corpus: { repo: string; commit: string; modules: string[] };
  period: Period;
  /** The status the run was served under; the ledger it was checked against. */
  certification: CertificationStatus;
  ledger: { ledger_id: string; certified_set_version: string } | null;
  /** --what-if amendment applied before the run, current law otherwise. */
  amendment: string | null;
  /** Every input as applied: stated facts and screening presumptions alike. */
  inputs: Array<{
    ref: string;
    name: string;
    entity: string;
    entity_id: string;
    value: unknown;
    /** true: the caller stated it; false: the synthesized presumption. */
    stated: boolean;
  }>;
  outputs: Record<string, string | number | boolean | null>;
  trace: Array<{
    rule_id: string;
    variable: string;
    value: unknown;
    sources: string[];
  }>;
  warnings: string[];
}

const traceValue = (node: TraceNode): unknown =>
  node.kind === "scalar" ? node.value.value : node.outcome;

export interface BuildEnvelopeOptions {
  root: string;
  closure: string[];
  source: { repo: string; commit: string };
  pkg: GoldenPackage;
  artifact: CompiledProgramArtifact;
  request: CompiledExecutionRequest;
  response: ExecutionResponse;
  answers: GoldenAnswers;
  certification: CertificationStatus;
  ledger: { ledger_id: string; certified_set_version: string } | null;
  amendment?: string | null;
}

/** Pure: everything the run already has in hand, nothing recomputed. */
export function buildDeterminationEnvelope(options: BuildEnvelopeOptions): DeterminationEnvelope {
  const { pkg, request, response, answers } = options;
  const result = response.results[0];

  const statedNames = new Set([
    ...Object.keys(answers.household ?? {}),
    ...Object.keys(answers.people ?? {}),
  ]);
  const statedRefs = new Set(Object.keys(answers.refOverrides ?? {}));

  const inputs = request.dataset.inputs.map((record) => {
    const slot = pkg.defaults[record.name];
    return {
      ref: record.name,
      name: slot?.name ?? record.name,
      entity: record.entity,
      entity_id: record.entity_id,
      value: record.value.value,
      stated: statedRefs.has(record.name) || (slot ? statedNames.has(slot.name) : false),
    };
  });

  const outputs: DeterminationEnvelope["outputs"] = {};
  for (const [name, id] of Object.entries(pkg.outputs)) {
    const output = result.outputs[id];
    if (!output) {
      outputs[name] = null;
    } else {
      outputs[name] = output.kind === "scalar" ? output.value.value : output.outcome;
    }
  }

  const trace = Object.entries(result.trace ?? {}).map(([key, node]) => ({
    rule_id: node.id ?? key,
    variable: node.name,
    value: traceValue(node),
    sources: node.dependencies,
  }));

  const warnings: string[] = [];
  if (response.metadata.actual_mode !== response.metadata.requested_mode) {
    warnings.push(
      `engine fell back from ${response.metadata.requested_mode} to ` +
        `${response.metadata.actual_mode}` +
        (response.metadata.fallback_reason ? `: ${response.metadata.fallback_reason}` : ""),
    );
  }

  return {
    engine: "axiom",
    runtime: {
      id: "axiom-local",
      mode: "local-wasm",
      engine_version: options.artifact.engine_version ?? null,
      artifact_format_version: options.artifact.artifact_format_version ?? null,
    },
    root: options.root,
    jurisdiction: options.root.split(":")[0],
    corpus: {
      repo: options.source.repo,
      commit: options.source.commit,
      modules: options.closure,
    },
    period: request.queries[0].period,
    certification: options.certification,
    ledger: options.ledger,
    amendment: options.amendment ?? null,
    inputs,
    outputs,
    trace,
    warnings,
  };
}

/** `us:regulations/7-cfr/273/10` → `us-regulations-7-cfr-273-10-determination.json`. */
export function envelopeFilename(root: string): string {
  const slug = root.replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug}-determination.json`;
}
