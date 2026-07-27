"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PresumptionEditor } from "@/components/PresumptionEditor";
import { loadEngine } from "@/lib/engine/load";
import type { ExecutionResponse, Period } from "@/lib/engine/types";
import {
  buildPackageRequest,
  findInvalidNumericAnswers,
  type GoldenAnswers,
  type GoldenPackage,
  type PackageDefault,
  type PackageHeadline,
} from "@/lib/goldenPath";

/**
 * The runner, shaped like the thing it produces: a filing. Three acts —
 * the matter (which law, where), the facts (the handful a person actually
 * knows; everything else is a presumption behind one quiet door), and the
 * determination, computed live in the tab. There is no run button: state a
 * fact and the order re-stamps itself. That immediacy IS the product —
 * law as a calculation you can push on, with nothing leaving the page.
 */

interface ProgramIndexEntry {
  id: string;
  title: string;
  jurisdiction: string;
  rules: number;
  provenance?: "envelope" | "legacy";
}

/** The downloadable determination: the exact shape `determine.mjs --json` prints. */
interface Determination {
  program: string;
  period: Period;
  amendment: string | null;
  answers: GoldenAnswers;
  outputs: Record<string, string | number | boolean | null>;
}

const JURISDICTIONS: Record<string, string> = {
  us: "Federal",
  uk: "United Kingdom",
  "us-ak": "Alaska",
  "us-al": "Alabama",
  "us-az": "Arizona",
  "us-ca": "California",
  "us-co": "Colorado",
  "us-fl": "Florida",
  "us-il": "Illinois",
  "us-ks": "Kansas",
  "us-ma": "Massachusetts",
  "us-nc": "North Carolina",
  "us-ny": "New York",
  "us-sc": "South Carolina",
  "us-tn": "Tennessee",
  "us-tx": "Texas",
};

const ACRONYMS = /\b(snap|tanf|eitc|ssn|ssi|abawd|oasdi|fpl|usda|tca|atap|scretd|uc)\b/g;

function humanize(name: string): string {
  return name.replaceAll("_", " ").replace(ACRONYMS, (word) => word.toUpperCase());
}

const MONEYISH = /allotment|benefit|income|tax|credit|amount|payment|deduction|standard/;

function formatValue(
  value: string | number | boolean | null,
  name: string,
  jurisdiction: string,
): string {
  if (value === "holds") return "yes";
  if (value === "not_holds") return "no";
  const numeric = Number(value);
  if (value !== null && value !== "" && Number.isFinite(numeric) && MONEYISH.test(name)) {
    const symbol = jurisdiction.startsWith("uk") ? "£" : "$";
    return `${symbol}${numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  return String(value);
}

/**
 * The facts worth asking for. Curated programs carry a headline; for the
 * rest, pull the questions a person can actually answer out of the
 * descriptor: how many people, the incomes, the rent, the ages.
 */
function keyFacts(pkg: GoldenPackage): PackageHeadline[] {
  if (pkg.headline.length > 0) return pkg.headline;
  const slots = Object.values(pkg.defaults);
  const picks: PackageHeadline[] = [];
  const taken = new Set<string>();
  const take = (slot: PackageDefault | undefined, label: string, per_person?: boolean) => {
    if (!slot || taken.has(slot.name) || picks.length >= 6) return;
    taken.add(slot.name);
    picks.push({ slot: slot.name, entity: slot.entity, label, ...(per_person ? { per_person } : {}) });
  };

  const sizeName = pkg.entities.find((entity) => entity.count_from)?.count_from;
  if (sizeName) {
    take(slots.find((slot) => slot.name === sizeName), "People in the household");
  }
  for (const slot of slots) {
    if (picks.length >= 4) break;
    if (
      /income/.test(slot.name) &&
      /(gross|earned|countable|monthly|total|household|net)/.test(slot.name) &&
      (slot.dtype === "decimal" || slot.dtype === "integer")
    ) {
      take(slot, humanize(slot.name));
    }
  }
  take(
    slots.find(
      (slot) =>
        /(shelter|housing|rent)/.test(slot.name) &&
        !/rental_income/.test(slot.name) &&
        slot.dtype !== "bool",
    ),
    "Monthly shelter costs",
  );
  const age = slots.find((slot) => slot.name === "member_age");
  if (age && pkg.entities.some((entity) => entity.count_from && entity.entity === age.entity)) {
    take(age, "Ages", true);
  }
  return picks;
}

export function Runner() {
  const [programs, setPrograms] = useState<ProgramIndexEntry[]>([]);
  const [programId, setProgramId] = useState("ny-snap");
  const [pkg, setPkg] = useState<GoldenPackage | null>(null);
  const artifactRef = useRef<string | null>(null);
  const loadSeq = useRef(0);
  const [engineVersion, setEngineVersion] = useState<string | null>(null);

  const [household, setHousehold] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Record<string, string>>({});
  const [refOverrides, setRefOverrides] = useState<Record<string, string>>({});
  const [month, setMonth] = useState("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [determination, setDetermination] = useState<Determination | null>(null);
  const [runStamp, setRunStamp] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    fetch("/programs/index.json")
      .then((response) => response.json())
      .then((index: { programs: ProgramIndexEntry[] }) => setPrograms(index.programs))
      .catch((cause) => setError(String(cause)));
    loadEngine()
      .then((engine) => setEngineVersion(engine.engine_version()))
      .catch((cause) => setError(`Engine failed to load: ${String(cause)}`));
  }, []);

  // Load a program's artifact + descriptor, seeding the facts from its example.
  useEffect(() => {
    let cancelled = false;
    loadSeq.current += 1;
    setPkg(null);
    setDetermination(null);
    setError(null);
    setElapsedMs(null);
    artifactRef.current = null;
    const mustOk = (response: Response) => {
      if (!response.ok) throw new Error(`fetch failed (${response.status}): ${response.url}`);
      return response;
    };
    Promise.all([
      fetch(`/programs/${programId}/artifact.json`).then((response) => mustOk(response).text()),
      fetch(`/programs/${programId}/package.json`).then(
        (response) => mustOk(response).json() as Promise<GoldenPackage>,
      ),
    ])
      .then(([artifactJson, descriptor]) => {
        if (cancelled) return;
        artifactRef.current = artifactJson;
        setPkg(descriptor);
        setRefOverrides({});
        setHousehold({ ...descriptor.example.household });
        setPeople(
          Object.fromEntries(
            Object.entries(descriptor.example.people ?? {}).map(([slot, values]) => [
              slot,
              values.join(", "),
            ]),
          ),
        );
        setMonth(descriptor.default_period);
      })
      .catch((cause) => {
        if (!cancelled) setError(String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  const run = useCallback(async () => {
    // Snapshot everything before any await: a program switch mid-run nulls
    // artifactRef and swaps pkg, and this run must not see either change.
    const artifactJson = artifactRef.current;
    const seq = loadSeq.current;
    if (!pkg || !artifactJson) return;
    setRunning(true);
    try {
      const answers: GoldenAnswers = {
        household: { ...household },
        people: Object.fromEntries(
          Object.entries(people).map(([slot, text]) => [
            slot,
            text
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value !== ""),
          ]),
        ),
        refOverrides: { ...refOverrides },
      };
      // Growing a per-person list grows the counted entity, as the CLI does —
      // but never below the size the visitor typed: missing people take the
      // slot presumptions.
      const sizeSlot = pkg.entities.find((entity) => entity.count_from)?.count_from;
      if (sizeSlot) {
        const lists = Object.values(answers.people ?? {}).filter((values) => values.length > 0);
        if (lists.length > 0) {
          const typed = Number(answers.household[sizeSlot]);
          const fromLists = Math.max(...lists.map((v) => v.length));
          answers.household[sizeSlot] = String(
            Number.isFinite(typed) && typed >= 1 ? Math.max(typed, fromLists) : fromLists,
          );
        }
      }

      const invalid = findInvalidNumericAnswers(pkg, answers);
      if (invalid.length > 0) {
        throw new Error(`Not a number: ${invalid.join(", ")} — fix the value or clear it`);
      }

      const engine = await loadEngine();
      const started = performance.now();
      const request = buildPackageRequest({ pkg, answers, month, mode: "explain" });
      const response = JSON.parse(
        engine.execute(artifactJson, JSON.stringify(request)),
      ) as ExecutionResponse;
      if (seq !== loadSeq.current) return; // program switched mid-run — discard
      const result = response.results[0];

      const outputs = Object.fromEntries(
        Object.keys(pkg.outputs).map((name) => {
          const output = result.outputs[pkg.outputs[name]];
          if (!output || output.kind !== "scalar") return [name, output?.outcome ?? null];
          return [name, output.value.value];
        }),
      );

      setElapsedMs(Math.max(1, Math.round(performance.now() - started)));
      setError(null);
      setDetermination({
        program: pkg.program_id,
        period: request.queries[0].period,
        amendment: null,
        answers,
        outputs,
      });
      setRunStamp((previous) => previous + 1);
    } catch (cause) {
      if (seq !== loadSeq.current) return; // stale run — its error is noise
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }, [pkg, household, people, refOverrides, month]);

  // The determination is live: it computes when the program lands and
  // recomputes as facts change. A short debounce lets typing settle.
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!pkg) return;
    const delay = determination ? 500 : 0;
    const timer = setTimeout(() => runRef.current(), delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pkg, household, people, refOverrides, month]);

  const download = useCallback(() => {
    if (!determination) return;
    const blob = new Blob([`${JSON.stringify(determination, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${determination.program}-determination.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [determination]);

  const fieldClass = "field text-[0.82rem]";
  const entry = programs.find((program) => program.id === programId);
  const facts = pkg ? keyFacts(pkg) : [];
  const editedCount = Object.keys(refOverrides).length;

  // Group the catalog for the picker: federal-level first, then states.
  const groups = new Map<string, ProgramIndexEntry[]>();
  for (const program of programs) {
    const label = JURISDICTIONS[program.jurisdiction] ?? program.jurisdiction;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(program);
  }
  const groupOrder = [...groups.keys()].sort((a, b) => {
    const rank = (label: string) => (label === "Federal" ? 0 : label === "United Kingdom" ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  // The order's decretal lines: the primary money line set large, the rest
  // as ledger entries.
  const outputEntries = determination ? Object.entries(determination.outputs) : [];
  const primary =
    outputEntries.find(
      ([name, value]) => MONEYISH.test(name) && Number.isFinite(Number(value)),
    ) ?? outputEntries[0];
  const secondary = outputEntries.filter(([name]) => name !== primary?.[0]);

  return (
    <div className="panel">
      {/* ── The matter ─────────────────────────────────────────────── */}
      <div className="border-b border-rule p-5">
        <p className="smallcaps text-[0.62rem] text-ink-secondary">In the matter of</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-[2fr_1fr]">
          <label className="block">
            <span className="sr-only">Program</span>
            <select
              className={`${fieldClass} py-2`}
              value={programId}
              onChange={(event) => setProgramId(event.target.value)}
            >
              {groupOrder.map((label) => (
                <optgroup key={label} label={label}>
                  {groups.get(label)!.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Month</span>
            <input
              className={`${fieldClass} py-2`}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              placeholder="month — 2026-01"
            />
          </label>
        </div>
        {entry ? (
          <p className="mt-2 font-mono text-[0.65rem] text-ink-muted">
            {entry.rules} rules ·{" "}
            {entry.provenance === "envelope" ? "engine-stamped provenance" : "hash-pinned"} ·
            executes in this tab
          </p>
        ) : null}
      </div>

      {/* ── The facts ──────────────────────────────────────────────── */}
      <div className="border-b border-rule p-5">
        <p className="smallcaps text-[0.62rem] text-ink-secondary">The facts as you state them</p>
        {pkg ? (
          <>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {facts.map((question) =>
                question.per_person ? (
                  <label key={question.slot} className="block">
                    <span className="block text-[0.8rem] font-light text-ink-secondary">
                      {question.label}{" "}
                      <span className="font-mono text-[0.65rem] text-ink-muted">
                        one per person
                      </span>
                    </span>
                    <input
                      className={`${fieldClass} mt-1 py-2`}
                      value={people[question.slot] ?? ""}
                      onChange={(event) =>
                        setPeople((previous) => ({
                          ...previous,
                          [question.slot]: event.target.value,
                        }))
                      }
                      placeholder="42, 9"
                    />
                  </label>
                ) : (
                  <label key={question.slot} className="block">
                    <span className="block text-[0.8rem] font-light text-ink-secondary">
                      {question.label}
                    </span>
                    <input
                      className={`${fieldClass} mt-1 py-2`}
                      value={household[question.slot] ?? ""}
                      onChange={(event) =>
                        setHousehold((previous) => ({
                          ...previous,
                          [question.slot]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ),
              )}
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer font-mono text-[0.7rem] text-ink-muted transition-colors hover:text-accent">
                Everything else is presumed — review all {Object.keys(pkg.defaults).length}{" "}
                answers{editedCount > 0 ? ` (${editedCount} corrected by you)` : ""} ›
              </summary>
              <div className="mt-3">
                <PresumptionEditor
                  defaults={pkg.defaults}
                  overrides={refOverrides}
                  onChange={(ref, value) =>
                    setRefOverrides((previous) => ({ ...previous, [ref]: value }))
                  }
                  onClear={(ref) =>
                    setRefOverrides((previous) => {
                      const next = { ...previous };
                      delete next[ref];
                      return next;
                    })
                  }
                />
              </div>
            </details>
          </>
        ) : (
          <p className="mt-3 font-mono text-[0.72rem] text-ink-muted">loading the program…</p>
        )}
      </div>

      {/* ── The determination ──────────────────────────────────────── */}
      <div className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="smallcaps text-[0.62rem] text-ink-secondary">The determination</p>
          <span className="flex items-center gap-2 font-mono text-[0.65rem] text-ink-muted">
            <span className={`lamp-dot ${error ? "lamp-dot--warn" : ""}`} aria-hidden="true" />
            {error
              ? "awaiting valid facts"
              : running
                ? "recomputing…"
                : elapsedMs !== null
                  ? `determined locally in ${elapsedMs}ms`
                  : "computing…"}
          </span>
        </div>

        {error ? (
          <p className="mt-3 border border-code-string/40 px-4 py-3 font-mono text-[0.72rem] text-code-string">
            {error}
          </p>
        ) : null}

        {determination && pkg && primary ? (
          <div className={error || running ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <div key={runStamp} className="stamp-in mt-4">
              <p className="font-mono text-[0.7rem] text-ink-secondary">
                {humanize(primary[0])}
              </p>
              <p className="mt-1 font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
                {formatValue(primary[1], primary[0], pkg.jurisdiction)}
                {MONEYISH.test(primary[0]) && Number.isFinite(Number(primary[1])) ? (
                  <span className="ml-2 font-mono text-[0.75rem] font-normal text-ink-muted">
                    / month
                  </span>
                ) : null}
              </p>
            </div>

            {secondary.length > 0 ? (
              <div className="mt-5 max-w-md">
                {secondary.map(([name, value]) => (
                  <div key={name} className="flex items-baseline gap-2 py-1">
                    <span className="font-mono text-[0.72rem] text-ink-secondary">
                      {humanize(name)}
                    </span>
                    <span className="leader min-w-8 flex-1" aria-hidden="true" />
                    <span
                      className={`font-mono text-[0.8rem] ${
                        value === "holds"
                          ? "text-success"
                          : value === "not_holds"
                            ? "text-code-string"
                            : "text-ink"
                      }`}
                    >
                      {formatValue(value, name, pkg.jurisdiction)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={download}
                className="btn-quiet cursor-pointer px-4 py-1.5 font-mono text-[0.72rem]"
              >
                download the record (JSON)
              </button>
              <span className="font-mono text-[0.65rem] text-ink-muted">
                the exact shape <code>determine.mjs --json</code> prints
              </span>
            </div>
          </div>
        ) : !error ? (
          <p className="mt-4 font-mono text-[0.72rem] text-ink-muted">
            the first determination lands with the program…
          </p>
        ) : null}

        <p className="mt-5 border-t border-rule-subtle pt-3 font-mono text-[0.65rem] text-ink-muted">
          └─ engine {engineVersion ?? "…"} (wasm, this tab) — your answers never left the page;
          inputs beyond the stated facts carry the descriptor&apos;s screening presumptions
        </p>
      </div>
    </div>
  );
}
