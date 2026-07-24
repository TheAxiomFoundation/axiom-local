"use client";

import { IconGavel } from "@tabler/icons-react";
import { prettifyName } from "@/lib/format";
import type { GoldenAnswers, GoldenPackage, PackageHeadline } from "@/lib/goldenPath";
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

const MAX_COUNT = 10;

/** The slot (if any) that drives an entity's instance count. */
function countSlot(pkg: GoldenPackage): string | null {
  for (const entity of pkg.entities) {
    if (entity.count_from) return entity.count_from;
  }
  return null;
}

/** The descriptor entry backing a headline slot, for dtype and options. */
function slotMeta(pkg: GoldenPackage, headline: PackageHeadline) {
  return Object.values(pkg.defaults).find(
    (slot) => slot.name === headline.slot && slot.entity === headline.entity,
  );
}

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
  const sizeSlot = countSlot(pkg);
  const sizeHeadline = pkg.headline.find((headline) => headline.slot === sizeSlot) ?? null;
  const perPersonHeadlines = pkg.headline.filter((headline) => headline.per_person);
  const scalarHeadlines = pkg.headline.filter(
    (headline) => headline !== sizeHeadline && !headline.per_person,
  );
  const size = sizeSlot
    ? Math.max(1, Math.min(MAX_COUNT, Number(answers.household[sizeSlot]) || 1))
    : 1;

  const setHousehold = (slot: string, value: string) =>
    onAnswers({ ...answers, household: { ...answers.household, [slot]: value } });

  const setSize = (next: number) => {
    if (!sizeSlot) return;
    const clamped = Math.max(1, Math.min(MAX_COUNT, next));
    const people = { ...answers.people };
    for (const headline of perPersonHeadlines) {
      const values = [...(people[headline.slot] ?? [])];
      const fill = values[values.length - 1] ?? "30";
      while (values.length < clamped) values.push(fill);
      people[headline.slot] = values.slice(0, clamped);
    }
    onAnswers({
      ...answers,
      household: { ...answers.household, [sizeSlot]: String(clamped) },
      people,
    });
  };

  const setPerPerson = (slot: string, index: number, value: string) => {
    const values = [...(answers.people?.[slot] ?? [])];
    while (values.length < size) values.push(values[values.length - 1] ?? "30");
    values[index] = value;
    onAnswers({ ...answers, people: { ...answers.people, [slot]: values } });
  };

  const outputNames = Object.keys(pkg.outputs);
  const questionCount = pkg.headline.length;

  return (
    <section className="rise rise-3" aria-label="The case" id="household-panel">
      <PanelHeading
        section="2"
        title="The case"
        aside={`${questionCount} question${questionCount === 1 ? "" : "s"} · ${presumedCount} answers presumed · kept on-device`}
      />

      <p className="mb-5 mt-1 text-[0.95rem] font-light text-ink-secondary">
        The facts of the case. {questionCount} question{questionCount === 1 ? "" : "s"} carr
        {questionCount === 1 ? "ies" : "y"} this determination; the program&apos;s {presumedCount}{" "}
        other inputs take screening presumptions —{" "}
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
          {sizeHeadline && sizeSlot ? (
            <div>
              <label
                className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
                htmlFor="golden-size"
              >
                {sizeHeadline.label}
              </label>
              <div className="flex items-stretch">
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label="Fewer"
                  disabled={size <= 1}
                  onClick={() => setSize(size - 1)}
                >
                  −
                </button>
                <div id="golden-size" className="field w-16 border-x-0 text-center" aria-live="polite">
                  {size}
                </div>
                <button
                  type="button"
                  className="stepper-btn"
                  aria-label="More"
                  disabled={size >= MAX_COUNT}
                  onClick={() => setSize(size + 1)}
                >
                  +
                </button>
              </div>
              <p className="mt-1.5 font-mono text-[0.62rem] text-ink-muted">
                each one becomes an entity bound by the program&apos;s relations
              </p>
            </div>
          ) : null}

          {scalarHeadlines.map((headline) => {
            const meta = slotMeta(pkg, headline);
            const money = meta?.dtype === "decimal";
            const options = meta?.options;
            return (
              <div key={headline.slot}>
                <label
                  className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
                  htmlFor={`golden-${headline.slot}`}
                >
                  {headline.label}
                </label>
                {options && options.length > 0 ? (
                  <select
                    id={`golden-${headline.slot}`}
                    className="field"
                    value={answers.household[headline.slot] ?? String(meta?.value ?? "")}
                    onChange={(event) => setHousehold(headline.slot, event.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option} value={option}>
                        {prettifyName(option)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="relative">
                    {money ? (
                      <span
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[0.9rem] text-ink-muted"
                        aria-hidden="true"
                      >
                        $
                      </span>
                    ) : null}
                    <input
                      id={`golden-${headline.slot}`}
                      className={`field ${money ? "pl-7" : ""}`}
                      inputMode={meta?.dtype === "integer" ? "numeric" : "decimal"}
                      value={answers.household[headline.slot] ?? ""}
                      onChange={(event) => setHousehold(headline.slot, event.target.value)}
                      spellCheck={false}
                    />
                  </div>
                )}
                <p
                  className="mt-1.5 truncate font-mono text-[0.62rem] text-ink-muted"
                  title={headline.slot}
                >
                  {headline.slot}
                </p>
              </div>
            );
          })}

          {perPersonHeadlines.map((headline) => (
            <div key={headline.slot} className="sm:col-span-2">
              <span className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary">
                {headline.label}
              </span>
              <div className="flex flex-wrap gap-3">
                {Array.from({ length: size }, (_, index) => (
                  <div key={index}>
                    <input
                      aria-label={`${headline.label} of person ${index + 1}`}
                      className="field w-20 text-center"
                      inputMode="numeric"
                      value={answers.people?.[headline.slot]?.[index] ?? ""}
                      onChange={(event) => setPerPerson(headline.slot, index, event.target.value)}
                      spellCheck={false}
                    />
                    <p className="mt-1 text-center font-mono text-[0.62rem] text-ink-muted">
                      person {index + 1}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <label
              className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
              htmlFor="benefit-month"
            >
              Determination month
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
