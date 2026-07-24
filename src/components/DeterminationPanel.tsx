"use client";

import type { ExecutionResponse, OutputValue } from "@/lib/engine/types";
import { formatMonth, formatOutcome, formatScalarValue, prettifyName } from "@/lib/format";
import type { DisplayNode } from "@/lib/trace";
import { PanelHeading } from "./PanelHeading";
import { Seal } from "./Seal";
import { TraceTree } from "./TraceTree";

export interface RunRecord {
  response: ExecutionResponse;
  outputId: string;
  month: string;
  executeMs: number;
  tree: DisplayNode | null;
  /** Monotonic counter so the stamp animation replays on every run. */
  sequence: number;
}

interface DeterminationPanelProps {
  run: RunRecord | null;
  runError: string | null;
  stale: boolean;
  compileMs: number | null;
  engineReady: boolean;
}

function outputHeadline(output: OutputValue): string {
  if (output.kind === "scalar") return formatScalarValue(output.value, output.unit);
  return formatOutcome(output.outcome);
}

export function DeterminationPanel({
  run,
  runError,
  stale,
  compileMs,
  engineReady,
}: DeterminationPanelProps) {
  const result = run?.response.results[0];
  const output = result?.outputs[run?.outputId ?? ""];

  return (
    <section className="rise rise-4" aria-label="The determination" id="determination-panel">
      <PanelHeading
        section="3"
        title="The determination"
        aside={
          run
            ? `mode ${run.response.metadata.actual_mode} · executed in ${run.executeMs.toFixed(1)} ms`
            : undefined
        }
      />

      {runError ? (
        <div className="mt-4 border-l-2 border-error bg-error/10 px-4 py-3">
          <p className="smallcaps text-error">Objection — execution failed</p>
          <p className="mt-1 font-mono text-[0.8rem] text-ink-secondary [overflow-wrap:anywhere]">{runError}</p>
        </div>
      ) : null}

      {!run && !runError ? (
        <p className="mt-4 text-[0.95rem] font-light italic text-ink-secondary">
          {engineReady
            ? "Run a determination to see the computed figure and its chain of citation."
            : "Waiting for the engine to instantiate…"}
        </p>
      ) : null}

      {run && output && result ? (
        <div className={stale ? "opacity-45 saturate-50 transition-all" : "transition-all"}>
          <div className="panel relative mt-4 overflow-hidden px-6 py-7 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div key={run.sequence} className="stamp-in">
                <p className="smallcaps text-[0.62rem] text-ink-muted">
                  {output.kind === "scalar"
                    ? prettifyName(output.name)
                    : `Whether ${prettifyName(output.name).toLowerCase()}`}
                  {" · "}
                  {formatMonth(run.month)}
                </p>
                <p className="mt-1 font-display text-6xl font-semibold leading-none text-ink sm:text-7xl">
                  {outputHeadline(output)}
                </p>
                {run.tree?.substituted ? (
                  <p className="mt-4 font-mono text-[0.8rem] text-warning [overflow-wrap:anywhere]">
                    <span className="text-ink-muted">= </span>
                    {run.tree.substituted}
                  </p>
                ) : null}
                {run.tree?.formula ? (
                  <p className="mt-1 font-mono text-[0.8rem] text-ink-secondary [overflow-wrap:anywhere]">
                    <span className="text-ink-muted">= </span>
                    {run.tree.formula}
                  </p>
                ) : null}
              </div>
              <Seal className="h-28 w-28 shrink-0 text-error sm:h-32 sm:w-32" />
            </div>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 border-t border-rule pt-3 font-mono text-[0.65rem] text-ink-muted">
              <span>entity {result.entity_id}</span>
              <span>
                period {result.period.start} — {result.period.end}
              </span>
              {compileMs !== null ? <span>compiled once in {compileMs.toFixed(1)} ms</span> : null}
              <span>executed in {run.executeMs.toFixed(1)} ms</span>
            </div>
          </div>

          {run.tree ? (
            <div className="mt-6">
              <h3 className="smallcaps mb-1 text-[0.65rem] text-ink-secondary">
                Chain of citation
              </h3>
              <p className="mb-3 text-[0.9rem] font-light text-ink-secondary">
                Every figure, traced to the durable legal id it came from — the engine&apos;s
                explain-mode trace, not a reconstruction.
              </p>
              <TraceTree root={run.tree} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
