"use client";

import { useMemo, useState } from "react";
import type { PackageDefault } from "@/lib/goldenPath";

/**
 * Every input a program carries, search-first: with hundreds or thousands
 * of presumptions, typing what you know ("income", "age", "shelter") is the
 * primary way in, corrections you have made stay visible as removable
 * chips, and browsing by entity remains as the fallback. Presuming an
 * answer is a legal position the visitor must be able to see and correct.
 *
 * Browse groups mount their rows only when opened, so a 2,000-input
 * program stays responsive.
 */

const FIELD = "field text-[0.82rem]";
const MAX_SEARCH_ROWS = 60;

function InputField({
  refKey,
  slot,
  override,
  onChange,
}: {
  refKey: string;
  slot: PackageDefault;
  override: string | undefined;
  onChange: (ref: string, value: string) => void;
}) {
  const current = override ?? String(slot.value);
  const edited = override !== undefined && override !== String(slot.value);
  const edge = edited ? "border-l-2 border-accent pl-2" : "";
  return (
    <label className={`block ${edge}`}>
      <span className="block truncate font-mono text-[0.65rem] text-ink-muted">
        {slot.name}
        <span className="ml-1 text-ink-muted/60">· {slot.entity}</span>
      </span>
      {slot.dtype === "bool" ? (
        <select
          className={`${FIELD} mt-0.5`}
          value={current.toLowerCase() === "true" || override === "1" ? "true" : "false"}
          onChange={(event) => onChange(refKey, event.target.value)}
        >
          <option value="false">false</option>
          <option value="true">true</option>
        </select>
      ) : slot.options ? (
        <select
          className={`${FIELD} mt-0.5`}
          value={current}
          onChange={(event) => onChange(refKey, event.target.value)}
        >
          {slot.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          {/* The presumed default stays selectable even when it is outside
              the enumerated options — the first change must be reversible. */}
          {[String(slot.value), override]
            .filter(
              (extra, i, arr): extra is string =>
                extra !== undefined && !slot.options!.includes(extra) && arr.indexOf(extra) === i,
            )
            .map((extra) => (
              <option key={`extra:${extra}`} value={extra}>
                {extra}
              </option>
            ))}
        </select>
      ) : (
        <input
          className={`${FIELD} mt-0.5`}
          value={current}
          onChange={(event) => onChange(refKey, event.target.value)}
        />
      )}
    </label>
  );
}

export function PresumptionEditor({
  defaults,
  overrides,
  onChange,
  onClear,
}: {
  defaults: Record<string, PackageDefault>;
  overrides: Record<string, string>;
  onChange: (ref: string, value: string) => void;
  onClear: (ref: string) => void;
}) {
  const grouped = useMemo(() => {
    const byEntity = new Map<string, [string, PackageDefault][]>();
    for (const [ref, slot] of Object.entries(defaults)) {
      if (!byEntity.has(slot.entity)) byEntity.set(slot.entity, []);
      byEntity.get(slot.entity)!.push([ref, slot]);
    }
    for (const slots of byEntity.values()) {
      slots.sort((a, b) => a[1].name.localeCompare(b[1].name));
    }
    return [...byEntity.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [defaults]);

  const total = Object.keys(defaults).length;
  const small = total <= 48;
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    small ? Object.fromEntries(grouped.map(([entity]) => [entity, true])) : {},
  );
  const [query, setQuery] = useState("");
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const searching = terms.length > 0;
  const results = useMemo(() => {
    if (!searching) return [];
    const hits: [string, PackageDefault][] = [];
    for (const [ref, slot] of Object.entries(defaults)) {
      const name = slot.name.toLowerCase();
      if (terms.every((term) => name.includes(term))) hits.push([ref, slot]);
    }
    hits.sort((a, b) => a[1].name.localeCompare(b[1].name));
    return hits;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults, query]);

  // Corrections the visitor has made, as removable chips — the legal
  // positions they have taken must never be out of sight.
  const edited = Object.entries(overrides).filter(
    ([ref, value]) => defaults[ref] && value !== String(defaults[ref].value),
  );

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="smallcaps text-[0.62rem] text-ink-secondary">
          The facts — {total} inputs, every presumption editable
        </span>
        {edited.length > 0 ? (
          <span className="font-mono text-[0.65rem] text-accent">
            {edited.length} corrected by you
          </span>
        ) : null}
      </div>

      {total > 12 ? (
        <input
          className={`${FIELD} mt-2 py-2`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${total} inputs — try income, age, shelter, work…`}
          aria-label="Search inputs"
        />
      ) : null}

      {edited.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {edited.map(([ref, value]) => (
            <button
              key={ref}
              type="button"
              onClick={() => onClear(ref)}
              title="Reset to the presumption"
              className="cursor-pointer border border-accent/50 px-2 py-0.5 font-mono text-[0.62rem] text-accent transition-colors hover:border-code-string/60 hover:text-code-string"
            >
              {defaults[ref].name} = {value} ×
            </button>
          ))}
        </div>
      ) : null}

      {searching ? (
        <div className="mt-3">
          <p className="font-mono text-[0.65rem] text-ink-muted">
            {results.length === 0
              ? "no inputs match — try a shorter word"
              : results.length > MAX_SEARCH_ROWS
                ? `showing ${MAX_SEARCH_ROWS} of ${results.length} matches — refine the search`
                : `${results.length} match${results.length === 1 ? "" : "es"}`}
          </p>
          <div className="mt-2 grid max-h-96 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {results.slice(0, MAX_SEARCH_ROWS).map(([ref, slot]) => (
              <InputField
                key={ref}
                refKey={ref}
                slot={slot}
                override={overrides[ref]}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {small ? null : (
            <p className="mb-1 font-mono text-[0.65rem] text-ink-muted">
              or browse by entity:
            </p>
          )}
          {grouped.map(([entity, slots]) => {
            const isOpen = open[entity] ?? false;
            return (
              <details
                key={entity}
                open={isOpen}
                onToggle={(event) =>
                  setOpen((previous) => ({
                    ...previous,
                    [entity]: (event.target as HTMLDetailsElement).open,
                  }))
                }
                className="mt-2 border border-rule-subtle first:mt-0"
              >
                <summary className="cursor-pointer px-3 py-2">
                  <span className="smallcaps text-[0.62rem] text-ink-secondary">
                    {entity} — {slots.length} inputs
                  </span>
                </summary>
                {isOpen ? (
                  <div className="grid max-h-80 gap-3 overflow-y-auto px-3 pb-3 pt-1 sm:grid-cols-2">
                    {slots.map(([ref, slot]) => (
                      <InputField
                        key={ref}
                        refKey={ref}
                        slot={slot}
                        override={overrides[ref]}
                        onChange={onChange}
                      />
                    ))}
                  </div>
                ) : null}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
