"use client";

import { IconGavel } from "@tabler/icons-react";
import { prettifyName } from "@/lib/format";
import type { DiscoveredInput } from "@/lib/program";
import type { DerivedSpec } from "@/lib/engine/types";
import { PanelHeading } from "./PanelHeading";

interface HouseholdPanelProps {
  inputs: DiscoveredInput[];
  answers: Record<string, string>;
  onAnswer: (ref: string, value: string) => void;
  month: string;
  onMonth: (month: string) => void;
  outputs: DerivedSpec[];
  selectedOutput: string;
  onSelectOutput: (id: string) => void;
  onRun: () => void;
  canRun: boolean;
  stale: boolean;
}

function Stepper({
  value,
  keys,
  onChange,
}: {
  value: string;
  keys: string[];
  onChange: (next: string) => void;
}) {
  const position = keys.indexOf(value);
  return (
    <div className="flex items-stretch">
      <button
        type="button"
        className="stepper-btn"
        aria-label="Decrease"
        disabled={position <= 0}
        onClick={() => onChange(keys[Math.max(0, position - 1)])}
      >
        −
      </button>
      <div className="field w-16 border-x-0 text-center" aria-live="polite">
        {value}
      </div>
      <button
        type="button"
        className="stepper-btn"
        aria-label="Increase"
        disabled={position === keys.length - 1 || position === -1}
        onClick={() => onChange(keys[Math.min(keys.length - 1, position + 1)])}
      >
        +
      </button>
    </div>
  );
}

export function HouseholdPanel({
  inputs,
  answers,
  onAnswer,
  month,
  onMonth,
  outputs,
  selectedOutput,
  onSelectOutput,
  onRun,
  canRun,
  stale,
}: HouseholdPanelProps) {
  return (
    <section className="rise rise-3" aria-label="The household">
      <PanelHeading
        section="2"
        title="The household"
        aside={`${inputs.length} answer${inputs.length === 1 ? "" : "s"} · kept on-device`}
      />

      <p className="mb-5 mt-1 text-[0.95rem] font-light text-ink-secondary">
        The facts of the case. These answers become the engine&apos;s dataset — assembled in this
        tab, handed to WebAssembly in this tab, and gone when you close it.
      </p>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onRun();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          {inputs.map((input) => (
            <div key={input.ref}>
              <label
                className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
                htmlFor={input.ref}
              >
                {prettifyName(input.name)}
                {input.flavor === "money" ? " (monthly)" : ""}
              </label>
              {input.flavor === "integer" && input.tableKeys && input.tableKeys.length > 0 ? (
                <Stepper
                  value={answers[input.ref] ?? input.tableKeys[0]}
                  keys={input.tableKeys}
                  onChange={(next) => onAnswer(input.ref, next)}
                />
              ) : (
                <div className="relative">
                  {input.flavor === "money" ? (
                    <span
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[0.9rem] text-ink-muted"
                      aria-hidden="true"
                    >
                      $
                    </span>
                  ) : null}
                  <input
                    id={input.ref}
                    className={`field ${input.flavor === "money" ? "pl-7" : ""}`}
                    inputMode="decimal"
                    value={answers[input.ref] ?? ""}
                    onChange={(event) => onAnswer(input.ref, event.target.value)}
                    spellCheck={false}
                  />
                </div>
              )}
              <p
                className="mt-1.5 truncate font-mono text-[0.62rem] text-ink-muted"
                title={input.ref}
              >
                {input.ref}
              </p>
            </div>
          ))}

          <div>
            <label
              className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
              htmlFor="benefit-month"
            >
              Benefit month
            </label>
            <input
              id="benefit-month"
              type="month"
              className="field"
              value={month}
              onChange={(event) => onMonth(event.target.value)}
            />
            <p className="mt-1.5 font-mono text-[0.62rem] text-ink-muted">
              the period the determination covers
            </p>
          </div>

          {outputs.length > 1 ? (
            <div>
              <label
                className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
                htmlFor="output-select"
              >
                Determine
              </label>
              <select
                id="output-select"
                className="field"
                value={selectedOutput}
                onChange={(event) => onSelectOutput(event.target.value)}
              >
                {outputs.map((output) => (
                  <option key={output.id ?? output.name} value={output.id ?? output.name}>
                    {output.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 font-mono text-[0.62rem] text-ink-muted">
                the output the query requests
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-4 pt-1">
          <button
            type="submit"
            className="btn-accent flex items-center gap-2.5 px-6 py-2.5 font-mono text-[0.78rem] uppercase tracking-[0.14em]"
            disabled={!canRun}
          >
            <IconGavel size={16} aria-hidden="true" />
            Run determination
          </button>
          {stale ? (
            <span className="smallcaps text-[0.62rem] text-warning">
              answers amended — run again
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
