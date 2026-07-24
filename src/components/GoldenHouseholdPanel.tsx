"use client";

import { IconGavel } from "@tabler/icons-react";
import { prettifyName } from "@/lib/format";
import type { GoldenAnswers, GoldenPackage } from "@/lib/goldenPath";
import { PanelHeading } from "./PanelHeading";

interface GoldenHouseholdPanelProps {
  pkg: GoldenPackage;
  answers: GoldenAnswers;
  onAnswers: (next: GoldenAnswers) => void;
  month: string;
  onMonth: (month: string) => void;
  selectedOutput: string;
  onSelectOutput: (name: string) => void;
  onRun: () => void;
  canRun: boolean;
  stale: boolean;
  presumedCount: number;
  overriddenCount: number;
  onOpenPresumptions: () => void;
}

const MAX_HOUSEHOLD_SIZE = 10;

export function GoldenHouseholdPanel({
  pkg,
  answers,
  onAnswers,
  month,
  onMonth,
  selectedOutput,
  onSelectOutput,
  onRun,
  canRun,
  stale,
  presumedCount,
  overriddenCount,
  onOpenPresumptions,
}: GoldenHouseholdPanelProps) {
  const size = Math.max(1, Math.min(MAX_HOUSEHOLD_SIZE, Number(answers.household.household_size) || 1));

  const setHousehold = (slot: string, value: string) =>
    onAnswers({ ...answers, household: { ...answers.household, [slot]: value } });

  const setSize = (next: number) => {
    const clamped = Math.max(1, Math.min(MAX_HOUSEHOLD_SIZE, next));
    const ages = [...(answers.people?.member_age ?? [])];
    while (ages.length < clamped) ages.push("30");
    onAnswers({
      ...answers,
      household: { ...answers.household, household_size: String(clamped) },
      people: { ...answers.people, member_age: ages.slice(0, clamped) },
    });
  };

  const setAge = (index: number, value: string) => {
    const ages = [...(answers.people?.member_age ?? [])];
    while (ages.length < size) ages.push("30");
    ages[index] = value;
    onAnswers({ ...answers, people: { ...answers.people, member_age: ages } });
  };

  const moneyHeadlines = pkg.headline.filter(
    (headline) => headline.entity === "Household" && headline.slot !== "household_size",
  );
  const outputNames = Object.keys(pkg.outputs);

  return (
    <section className="rise rise-3" aria-label="The household" id="household-panel">
      <PanelHeading
        section="2"
        title="The household"
        aside={`${pkg.headline.length} questions · ${presumedCount} answers presumed · kept on-device`}
      />

      <p className="mb-5 mt-1 text-[0.95rem] font-light text-ink-secondary">
        The facts of the case. Four questions carry this determination; the program&apos;s{" "}
        {presumedCount} other inputs take screening presumptions —{" "}
        <button
          type="button"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
          onClick={onOpenPresumptions}
        >
          every one inspectable and overridable
        </button>
        {overriddenCount > 0 ? (
          <> ({overriddenCount} presumption{overriddenCount === 1 ? "" : "s"} amended)</>
        ) : null}
        . Assembled in this tab, handed to WebAssembly in this tab, gone when you close it.
      </p>

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          onRun();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
              htmlFor="golden-household-size"
            >
              People in the household
            </label>
            <div className="flex items-stretch">
              <button
                type="button"
                className="stepper-btn"
                aria-label="Fewer people"
                disabled={size <= 1}
                onClick={() => setSize(size - 1)}
              >
                −
              </button>
              <div id="golden-household-size" className="field w-16 border-x-0 text-center" aria-live="polite">
                {size}
              </div>
              <button
                type="button"
                className="stepper-btn"
                aria-label="More people"
                disabled={size >= MAX_HOUSEHOLD_SIZE}
                onClick={() => setSize(size + 1)}
              >
                +
              </button>
            </div>
            <p className="mt-1.5 font-mono text-[0.62rem] text-ink-muted">
              each person becomes an entity bound by the membership relation
            </p>
          </div>

          {moneyHeadlines.map((headline) => (
            <div key={headline.slot}>
              <label
                className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
                htmlFor={`golden-${headline.slot}`}
              >
                {headline.label}
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[0.9rem] text-ink-muted"
                  aria-hidden="true"
                >
                  $
                </span>
                <input
                  id={`golden-${headline.slot}`}
                  className="field pl-7"
                  inputMode="decimal"
                  value={answers.household[headline.slot] ?? ""}
                  onChange={(event) => setHousehold(headline.slot, event.target.value)}
                  spellCheck={false}
                />
              </div>
              <p className="mt-1.5 truncate font-mono text-[0.62rem] text-ink-muted" title={headline.slot}>
                {headline.slot}
              </p>
            </div>
          ))}

          <div className="sm:col-span-2">
            <span className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary">Ages</span>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: size }, (_, index) => (
                <div key={index}>
                  <input
                    aria-label={`Age of person ${index + 1}`}
                    className="field w-20 text-center"
                    inputMode="numeric"
                    value={answers.people?.member_age?.[index] ?? "30"}
                    onChange={(event) => setAge(index, event.target.value)}
                    spellCheck={false}
                  />
                  <p className="mt-1 text-center font-mono text-[0.62rem] text-ink-muted">
                    person {index + 1}
                  </p>
                </div>
              ))}
            </div>
          </div>

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

          <div>
            <label
              className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
              htmlFor="golden-output-select"
            >
              Determine
            </label>
            <select
              id="golden-output-select"
              className="field"
              value={selectedOutput}
              onChange={(event) => onSelectOutput(event.target.value)}
            >
              {outputNames.map((name) => (
                <option key={name} value={name}>
                  {prettifyName(name)}
                </option>
              ))}
            </select>
            <p
              className="mt-1.5 truncate font-mono text-[0.62rem] text-ink-muted"
              title={pkg.outputs[selectedOutput]}
            >
              {pkg.outputs[selectedOutput]}
            </p>
          </div>
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
