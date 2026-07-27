"use client";

import { useMemo, useState } from "react";
import type { PackageDefault } from "@/lib/goldenPath";

/**
 * Every input a program carries, grouped by entity, presumptions visible and
 * editable. Presuming an answer is a legal position the visitor must be able
 * to see and correct — for curated programs this sits under the headline
 * questions; for legacy programs and corpus slices it IS the form.
 *
 * Groups mount their rows only when opened, so a 2,000-input program stays
 * responsive: the DOM holds group headers, not every field.
 */

export function PresumptionEditor({
  defaults,
  overrides,
  onChange,
}: {
  defaults: Record<string, PackageDefault>;
  overrides: Record<string, string>;
  onChange: (ref: string, value: string) => void;
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

  // Small programs open outright; big ones open on demand.
  const total = Object.keys(defaults).length;
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    total <= 48 ? Object.fromEntries(grouped.map(([entity]) => [entity, true])) : {},
  );
  const [filter, setFilter] = useState("");

  const fieldClass = "field text-[0.82rem]";
  const filterTerms = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (slot: PackageDefault) =>
    filterTerms.length === 0 || filterTerms.every((term) => slot.name.toLowerCase().includes(term));

  return (
    <div>
      {total > 24 ? (
        <input
          className={`${fieldClass} mb-2`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={`filter ${total} inputs — e.g. income, age, shelter`}
        />
      ) : null}
      {grouped.map(([entity, slots]) => {
        const visible = filterTerms.length > 0 ? slots.filter(([, s]) => matches(s)) : slots;
        const isOpen = filterTerms.length > 0 ? visible.length > 0 : (open[entity] ?? false);
        return (
          <details
            key={entity}
            open={isOpen}
            onToggle={(event) => {
              // A filter forces groups open for display only — that forced
              // state must not be written back as user intent, or clearing
              // the filter leaves every group (and its rows) mounted.
              if (filterTerms.length > 0) return;
              setOpen((previous) => ({
                ...previous,
                [entity]: (event.target as HTMLDetailsElement).open,
              }));
            }}
            className="mt-2 border border-rule-subtle first:mt-0"
          >
            <summary className="cursor-pointer px-3 py-2">
              <span className="smallcaps text-[0.62rem] text-ink-secondary">
                {entity} — {visible.length}
                {filterTerms.length > 0 ? ` of ${slots.length}` : ""} inputs, presumptions
                editable
              </span>
            </summary>
            {isOpen ? (
              <div className="grid max-h-80 gap-3 overflow-y-auto px-3 pb-3 pt-1 sm:grid-cols-2">
                {visible.map(([ref, slot]) => (
                  <label key={ref} className="block">
                    <span className="block truncate font-mono text-[0.65rem] text-ink-muted">
                      {slot.name}
                    </span>
                    {slot.dtype === "bool" ? (
                      <select
                        className={`${fieldClass} mt-0.5`}
                        value={
                          (overrides[ref] ?? String(slot.value)).toLowerCase() === "true" ||
                          overrides[ref] === "1"
                            ? "true"
                            : "false"
                        }
                        onChange={(event) => onChange(ref, event.target.value)}
                      >
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    ) : slot.options ? (
                      <select
                        className={`${fieldClass} mt-0.5`}
                        value={overrides[ref] ?? String(slot.value)}
                        onChange={(event) => onChange(ref, event.target.value)}
                      >
                        {slot.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                        {/* The presumed default stays selectable even when it
                            is outside the enumerated options — otherwise the
                            first change is irreversible. */}
                        {[String(slot.value), overrides[ref]]
                          .filter(
                            (extra, i, arr): extra is string =>
                              extra !== undefined &&
                              !slot.options!.includes(extra) &&
                              arr.indexOf(extra) === i,
                          )
                          .map((extra) => (
                            <option key={`extra:${extra}`} value={extra}>
                              {extra}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        className={`${fieldClass} mt-0.5`}
                        value={overrides[ref] ?? String(slot.value)}
                        onChange={(event) => onChange(ref, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}
