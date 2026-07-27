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
} from "@/lib/goldenPath";

/**
 * The in-browser runner: the same web-target wasm engine served from
 * /engine/, the same vendored artifacts served from /programs/, the same
 * buildPackageRequest the CLI and the golden-path test use. Nothing leaves
 * the page; the determination is downloadable as the JSON the CLI's --json
 * flag prints.
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

export function Runner() {
  const [programs, setPrograms] = useState<ProgramIndexEntry[]>([]);
  const [programId, setProgramId] = useState("co-snap");
  const [pkg, setPkg] = useState<GoldenPackage | null>(null);
  const artifactRef = useRef<string | null>(null);
  // Bumped on every program switch: a run that started under an older value
  // must discard its result instead of rendering it under the new program.
  const loadSeq = useRef(0);
  const [engineVersion, setEngineVersion] = useState<string | null>(null);

  const [household, setHousehold] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Record<string, string>>({});
  const [refOverrides, setRefOverrides] = useState<Record<string, string>>({});
  const [month, setMonth] = useState("");

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [determination, setDetermination] = useState<Determination | null>(null);

  useEffect(() => {
    fetch("/programs/index.json")
      .then((response) => response.json())
      .then((index: { programs: ProgramIndexEntry[] }) => setPrograms(index.programs))
      .catch((cause) => setError(String(cause)));
    loadEngine()
      .then((engine) => setEngineVersion(engine.engine_version()))
      .catch((cause) => setError(`Engine failed to load: ${String(cause)}`));
  }, []);

  // Load a program's artifact + descriptor, seeding the form from its example.
  useEffect(() => {
    let cancelled = false;
    loadSeq.current += 1;
    setPkg(null);
    setDetermination(null);
    setError(null);
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
    setError(null);
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
      // but never below the size the visitor typed: a stated 5-person
      // household with two ages listed stays a 5-person household (missing
      // people take the slot presumptions).
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

      setDetermination({
        program: pkg.program_id,
        period: request.queries[0].period,
        amendment: null,
        answers,
        outputs,
      });
    } catch (cause) {
      if (seq !== loadSeq.current) return; // stale run — its error is noise
      setDetermination(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
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

  return (
    <div>
      <div className="panel p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="smallcaps text-[0.62rem] text-ink-secondary">Program</span>
            <select
              className={`${fieldClass} mt-1`}
              value={programId}
              onChange={(event) => setProgramId(event.target.value)}
            >
              {programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.id} — {program.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="smallcaps text-[0.62rem] text-ink-secondary">Month</span>
            <input
              className={`${fieldClass} mt-1`}
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              placeholder="2026-01"
            />
          </label>
        </div>

        {pkg ? (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {pkg.headline.map((question) =>
              question.per_person ? (
                <label key={question.slot} className="block">
                  <span className="smallcaps text-[0.62rem] text-ink-secondary">
                    {question.label} <span className="normal-case">(one per person)</span>
                  </span>
                  <input
                    className={`${fieldClass} mt-1`}
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
                  <span className="smallcaps text-[0.62rem] text-ink-secondary">
                    {question.label}
                  </span>
                  <input
                    className={`${fieldClass} mt-1`}
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
        ) : (
          <p className="mt-5 font-mono text-[0.72rem] text-ink-muted">loading program…</p>
        )}

        {pkg ? (
          <div className="mt-5">
            {pkg.headline.length === 0 ? (
              <p className="mb-2 font-mono text-[0.72rem] text-ink-muted">
                No curated headline questions for this program yet — every input it reads is
                below, presumed and editable.
              </p>
            ) : null}
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
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={run}
            disabled={!pkg || running}
            className="btn-accent cursor-pointer px-4 py-1.5 font-mono text-[0.75rem]"
          >
            {running ? "running…" : "run determination"}
          </button>
          {determination ? (
            <button
              type="button"
              onClick={download}
              className="btn-quiet cursor-pointer px-4 py-1.5 font-mono text-[0.75rem]"
            >
              download JSON
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-4 border border-code-string/40 px-4 py-3 font-mono text-[0.72rem] text-code-string">
          {error}
        </p>
      ) : null}

      {determination && pkg ? (
        <div className="record mt-6">
          <div className="record-caption">
            <span>
              {pkg.program_id} · {determination.period.start}
            </span>
            <span>determined locally</span>
          </div>
          <div className="record-body">
            {Object.entries(determination.outputs).map(([name, value]) => (
              <div key={name} className="rec-line">
                {"  "}
                {name.padEnd(
                  Math.max(...Object.keys(determination.outputs).map((n) => n.length)) + 2,
                )}
                <span
                  className={
                    value === "holds"
                      ? "text-code-function"
                      : value === "not_holds"
                        ? "text-code-string"
                        : "text-code-number"
                  }
                >
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 font-mono text-[0.68rem] text-ink-muted">
        └─ engine {engineVersion ?? "…"} (wasm, running in this tab) — inputs beyond the
        questions above carry the descriptor&apos;s screening presumptions
      </p>
    </div>
  );
}
