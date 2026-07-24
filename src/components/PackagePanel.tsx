"use client";

import { IconFlask, IconSearch } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import type { GoldenPackage } from "@/lib/goldenPath";
import type { ProgramIndexEntry } from "@/lib/programSource";
import { prettifyName } from "@/lib/format";
import { PanelHeading } from "./PanelHeading";

interface PackagePanelProps {
  pkg: GoldenPackage;
  fetchedSha256: string;
  programs: ProgramIndexEntry[];
  onSelectProgram: (programId: string) => void;
  whatIfActive: boolean;
  whatIfPreviousValue: string | null;
  onToggleWhatIf: () => void;
  presumptionsOpen: boolean;
  onTogglePresumptions: () => void;
  refOverrides: Record<string, string>;
  onRefOverride: (ref: string, value: string | null) => void;
}

const PAGE_SIZE = 40;

export function PackagePanel({
  pkg,
  fetchedSha256,
  programs,
  onSelectProgram,
  whatIfActive,
  whatIfPreviousValue,
  onToggleWhatIf,
  presumptionsOpen,
  onTogglePresumptions,
  refOverrides,
  onRefOverride,
}: PackagePanelProps) {
  const [query, setQuery] = useState("");

  const shaMatches = fetchedSha256 === pkg.source.artifact_sha256;
  const entries = useMemo(() => Object.entries(pkg.defaults), [pkg.defaults]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter(
      ([ref, slot]) => slot.name.includes(needle) || ref.toLowerCase().includes(needle),
    );
  }, [entries, query]);

  return (
    <section className="rise rise-2" aria-label="The program" id="program-panel">
      <PanelHeading
        section="1"
        title="The program"
        aside={`${pkg.jurisdiction} · composed artifact · ${entries.length} inputs · developer preview`}
      />

      {programs.length > 1 ? (
        <div className="mb-4 mt-1">
          <label
            className="smallcaps mb-1.5 block text-[0.65rem] text-ink-secondary"
            htmlFor="program-select"
          >
            Program
          </label>
          <select
            id="program-select"
            className="field"
            value={pkg.program_id}
            onChange={(event) => onSelectProgram(event.target.value)}
          >
            {programs.map((program) => (
              <option key={program.id} value={program.id}>
                {program.title} · {program.rules} rules
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <p className="mb-4 mt-1 text-[0.95rem] font-light text-ink-secondary">
        The full composed program, compiled to one versioned artifact — the same release unit
        the hosted engine executes. It is delivered to the page once and executed in this tab.
      </p>

      <div className="panel">
        <dl className="space-y-1.5 px-4 py-3 font-mono text-[0.72rem]">
          <div className="flex items-baseline">
            <dt className="text-ink-muted">artifact</dt>
            <span className="leader" aria-hidden="true" />
            <dd className="min-w-0 truncate text-ink" title={pkg.source.artifact_path}>
              <a
                href={`https://github.com/${pkg.source.repo}/blob/main/${pkg.source.artifact_path}`}
                target="_blank"
                rel="noreferrer"
              >
                {pkg.source.repo.split("/")[1]}:{pkg.source.artifact_path.split("/").pop()}
              </a>
            </dd>
          </div>
          <div className="flex items-baseline">
            <dt className="text-ink-muted">sha-256 (fetched · pinned)</dt>
            <span className="leader" aria-hidden="true" />
            <dd
              className={`min-w-0 truncate ${shaMatches ? "text-success" : "text-error"}`}
              title={`fetched ${fetchedSha256}\npinned ${pkg.source.artifact_sha256}`}
            >
              {fetchedSha256.slice(0, 12)}… {shaMatches ? "= pinned" : "≠ PINNED"}
            </dd>
          </div>
          <div className="flex items-baseline">
            <dt className="text-ink-muted">compiled by engine</dt>
            <span className="leader" aria-hidden="true" />
            <dd className="min-w-0 truncate text-ink">
              v{pkg.source.engine_version} · artifact format v{pkg.source.artifact_format_version}
            </dd>
          </div>
          <div className="flex items-baseline">
            <dt className="text-ink-muted">jurisdiction</dt>
            <span className="leader" aria-hidden="true" />
            <dd className="text-ink">{pkg.jurisdiction}</dd>
          </div>
        </dl>
      </div>

      {pkg.what_if ? (
        <div className="mt-4 border border-rule bg-paper-elevated p-4" id="what-if">
          <p className="smallcaps text-[0.62rem] text-accent">What if the law changed?</p>
          <p className="mt-1.5 text-[0.88rem] font-light text-ink-secondary">
            {pkg.what_if.label}
            {whatIfPreviousValue ? (
              <>
                , currently{" "}
                <span className="font-mono text-[0.8rem] text-ink">{whatIfPreviousValue}</span>,
              </>
            ) : null}{" "}
            is one JSON entry in the artifact. Amend it to{" "}
            <span className="font-mono text-[0.8rem] text-ink">{pkg.what_if.value}</span> and
            re-run: the same case, under amended law, in this tab.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              className={`${whatIfActive ? "btn-accent" : "btn-quiet"} flex items-center gap-2 px-3 py-1.5 font-mono text-[0.72rem] tracking-wide`}
              onClick={onToggleWhatIf}
              aria-pressed={whatIfActive}
            >
              <IconFlask size={14} aria-hidden="true" />
              {whatIfActive ? "Amended law in force — restore current law" : "Amend the parameter"}
            </button>
            {whatIfActive ? (
              <span className="smallcaps text-[0.62rem] text-warning">
                hypothetical — not current law
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-quiet flex items-center gap-2 px-3 py-1.5 font-mono text-[0.72rem] tracking-wide"
            onClick={onTogglePresumptions}
            aria-expanded={presumptionsOpen}
          >
            <IconSearch size={14} aria-hidden="true" />
            {presumptionsOpen ? "Close the presumed answers" : `Inspect the ${entries.length} presumed answers`}
          </button>
        </div>

        {presumptionsOpen ? (
          <div className="mt-3 border border-rule bg-paper-elevated p-4" id="presumptions">
            <p className="text-[0.85rem] font-light text-ink-secondary">
              Every input the program can consider, with the answer this page presumes. A
              presumption is a legal position — correct any of them and the determination will
              say so. Values are matched by durable ref.
            </p>
            <input
              className="field mt-3 w-full"
              placeholder="filter by name or durable ref…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
              aria-label="Filter presumed answers"
            />
            <div className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
              {filtered.slice(0, PAGE_SIZE).map(([ref, slot]) => {
                const overridden = refOverrides[ref] !== undefined;
                return (
                  <div key={ref} className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8rem] text-ink-secondary" title={slot.name}>
                        {prettifyName(slot.name)}
                        <span className="ml-2 font-mono text-[0.62rem] text-ink-muted">
                          {slot.entity.toLowerCase()} · {slot.dtype}
                        </span>
                      </p>
                      <p className="truncate font-mono text-[0.62rem] text-ink-muted" title={ref}>
                        {ref}
                      </p>
                    </div>
                    <input
                      className={`field w-24 text-right font-mono text-[0.75rem] ${overridden ? "border-accent" : ""}`}
                      value={refOverrides[ref] ?? String(slot.value)}
                      onChange={(event) => onRefOverride(ref, event.target.value)}
                      aria-label={`Answer for ${slot.name}`}
                      spellCheck={false}
                    />
                    {overridden ? (
                      <button
                        type="button"
                        className="btn-quiet px-2 py-1 font-mono text-[0.62rem]"
                        onClick={() => onRefOverride(ref, null)}
                      >
                        presume
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {filtered.length > PAGE_SIZE ? (
                <p className="pt-1 font-mono text-[0.62rem] text-ink-muted">
                  {filtered.length - PAGE_SIZE} more — narrow the filter to see them
                </p>
              ) : null}
              {filtered.length === 0 ? (
                <p className="pt-1 font-mono text-[0.62rem] text-ink-muted">
                  nothing matches — the program has no such input
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
