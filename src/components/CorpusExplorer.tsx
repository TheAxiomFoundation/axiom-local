"use client";

import { useCallback, useMemo, useState } from "react";
import { PresumptionEditor } from "@/components/PresumptionEditor";
import { loadEngine } from "@/lib/engine/load";
import type { CompiledProgramArtifact, ExecutionResponse } from "@/lib/engine/types";
import {
  moduleUrl,
  probeFixpoint,
  resolveClosure,
  synthesizePackage,
  type CorpusManifest,
} from "@/lib/corpus";
import {
  buildPackageRequest,
  findInvalidNumericAnswers,
  type GoldenPackage,
} from "@/lib/goldenPath";

/**
 * The graph, not the bundles: search every rule in the served corpus, slice
 * at any target, compile the closure in this tab, and run it. Slices are
 * VALID (well-formed, cited, from the pinned corpus commit) but not
 * parity-PINNED like the cataloged programs — the provenance line says so.
 */

interface SearchHit {
  target: string;
  jurisdiction: string;
  ruleCount: number;
  matched: string[];
}

interface Slice {
  root: string;
  artifactJson: string;
  artifact: CompiledProgramArtifact;
  pkg: GoldenPackage;
  closureSize: number;
  corrected: number;
  admitted: number;
  compileMs: number;
}

type ManifestState = { kind: "idle" } | { kind: "loading" } | { kind: "missing" } | {
  kind: "ready";
  manifest: CorpusManifest;
};

export function CorpusExplorer() {
  const [manifestState, setManifestState] = useState<ManifestState>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [slice, setSlice] = useState<Slice | null>(null);
  const [slicing, setSlicing] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [month, setMonth] = useState("2026-01");
  const [running, setRunning] = useState(false);
  // The month is captured at run time: editing the month field afterwards
  // must not relabel an old determination.
  const [outputs, setOutputs] = useState<{
    values: Record<string, string | number | boolean | null>;
    month: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureManifest = useCallback(() => {
    if (manifestState.kind !== "idle") return;
    setManifestState({ kind: "loading" });
    fetch("/corpus/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<CorpusManifest>;
      })
      .then((manifest) => setManifestState({ kind: "ready", manifest }))
      .catch(() => setManifestState({ kind: "missing" }));
  }, [manifestState.kind]);

  const { hits, totalHits } = useMemo<{ hits: SearchHit[]; totalHits: number }>(() => {
    if (manifestState.kind !== "ready") return { hits: [], totalHits: 0 };
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return { hits: [], totalHits: 0 };
    // Score every match, sort, THEN cap — manifest order is alphabetical by
    // target, and a raw first-30 cut would hide every late-alphabet state.
    const scored: (SearchHit & { score: number })[] = [];
    for (const entry of manifestState.manifest.modules) {
      const targetText = entry.target.toLowerCase();
      const matched: string[] = [];
      let score = 0;
      let ok = true;
      for (const term of terms) {
        if (targetText.includes(term)) {
          score += 3;
          continue;
        }
        const rules = entry.rules.filter((name) => name.toLowerCase().includes(term));
        if (rules.length > 0) {
          score += 1 + Math.min(rules.length, 5) / 10;
          for (const rule of rules) if (!matched.includes(rule)) matched.push(rule);
          continue;
        }
        ok = false;
        break;
      }
      if (!ok) continue;
      if (matched.length === 0) {
        for (const term of terms) {
          for (const rule of entry.rules) {
            if (rule.toLowerCase().includes(term) && !matched.includes(rule)) matched.push(rule);
            if (matched.length >= 3) break;
          }
        }
      }
      // Rule-less parameter/citation shells rank below executable modules.
      if (entry.rules.length === 0) score -= 2;
      scored.push({
        target: entry.target,
        jurisdiction: entry.jurisdiction,
        ruleCount: entry.rules.length,
        matched: matched.slice(0, 3),
        score,
      });
    }
    scored.sort((a, b) => b.score - a.score || b.ruleCount - a.ruleCount);
    return { hits: scored.slice(0, 30), totalHits: scored.length };
  }, [manifestState, query]);

  const sliceAt = useCallback(
    async (root: string) => {
      if (manifestState.kind !== "ready") return;
      setSlicing(root);
      setSlice(null);
      setOutputs(null);
      setOverrides({});
      setError(null);
      try {
        const closure = resolveClosure(manifestState.manifest, root);
        const texts = await Promise.all(
          closure.map((target) =>
            fetch(moduleUrl(target)).then((response) => {
              if (!response.ok) throw new Error(`fetch ${target}: ${response.status}`);
              return response.text();
            }),
          ),
        );
        const modules = Object.fromEntries(closure.map((target, i) => [target, texts[i]]));
        const engine = await loadEngine();
        const started = performance.now();
        const artifactJson = engine.compile(JSON.stringify(modules), root);
        const compileMs = Math.round(performance.now() - started);
        const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
        const commit = manifestState.manifest.sources[0]?.commit ?? "unknown";
        const { pkg } = synthesizePackage(artifact, root, commit);
        if (Object.keys(pkg.outputs).length === 0) {
          setError(
            `${root} defines ${artifact.program.parameters.length} parameters and no executable ` +
              `rules — there is nothing to run at this target. Pick a hit that lists rule names.`,
          );
          return;
        }
        const { corrected, admitted } = probeFixpoint(engine, artifactJson, artifact, pkg);
        setSlice({
          root,
          artifactJson,
          artifact,
          pkg,
          closureSize: closure.length,
          corrected,
          admitted,
          compileMs,
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(
          message.includes("division by zero")
            ? `This slice divides by a value whose screening presumption is 0 and the engine ` +
              `traps before the form can render (${message}). The module needs a curated ` +
              `presumption — try a broader target that composes it.`
            : message,
        );
      } finally {
        setSlicing(null);
      }
    },
    [manifestState],
  );

  const run = useCallback(async () => {
    if (!slice) return;
    setRunning(true);
    setError(null);
    try {
      const answers = { household: {}, people: {}, refOverrides: { ...overrides } };
      const invalid = findInvalidNumericAnswers(slice.pkg, answers);
      if (invalid.length > 0) {
        throw new Error(`Not a number: ${invalid.join(", ")} — fix the value or clear it`);
      }
      const engine = await loadEngine();
      const request = buildPackageRequest({
        pkg: slice.pkg,
        answers,
        month,
        mode: "explain",
      });
      const response = JSON.parse(
        engine.execute(slice.artifactJson, JSON.stringify(request)),
      ) as ExecutionResponse;
      const result = response.results[0];
      setOutputs({
        month,
        values: Object.fromEntries(
          Object.entries(slice.pkg.outputs).map(([name, id]) => {
            const output = result.outputs[id];
            if (!output || output.kind !== "scalar") return [name, output?.outcome ?? null];
            return [name, output.value.value];
          }),
        ),
      });
    } catch (cause) {
      setOutputs(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  }, [slice, overrides, month]);

  const fieldClass = "field text-[0.82rem]";
  const corpusSource =
    manifestState.kind === "ready" ? manifestState.manifest.sources[0] : null;

  return (
    <div>
      <div className="panel p-5">
        <label className="block">
          <span className="smallcaps text-[0.62rem] text-ink-secondary">
            Search the graph — any rule, any citation
          </span>
          <input
            className={`${fieldClass} mt-1`}
            value={query}
            onFocus={ensureManifest}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="work requirement us-co · abawd · 18-nycrr 385 · standard deduction"
          />
        </label>

        {manifestState.kind === "missing" ? (
          <p className="mt-3 font-mono text-[0.72rem] text-ink-muted">
            corpus not served — generate it locally:{" "}
            <code className="text-ink">bun scripts/build-corpus.mjs &lt;rulespec-us checkout&gt;</code>
          </p>
        ) : null}
        {manifestState.kind === "loading" ? (
          <p className="mt-3 font-mono text-[0.72rem] text-ink-muted">loading manifest…</p>
        ) : null}
        {manifestState.kind === "ready" && query && hits.length === 0 ? (
          <p className="mt-3 font-mono text-[0.72rem] text-ink-muted">no modules match</p>
        ) : null}

        {totalHits > hits.length ? (
          <p className="mt-3 font-mono text-[0.68rem] text-ink-muted">
            showing the {hits.length} most relevant of {totalHits} matches — refine the search
            to narrow further
          </p>
        ) : null}
        {hits.length > 0 ? (
          <ul className="mt-3 max-h-72 divide-y divide-rule-subtle overflow-y-auto border border-rule">
            {hits.map((hit) => (
              <li key={hit.target}>
                <button
                  type="button"
                  onClick={() => sliceAt(hit.target)}
                  disabled={slicing !== null}
                  className="block w-full cursor-pointer px-3 py-2 text-left transition-colors hover:bg-rule-subtle/40"
                >
                  <span className="font-mono text-[0.72rem] text-ink">{hit.target}</span>
                  <span className="ml-2 font-mono text-[0.65rem] text-ink-muted">
                    {hit.ruleCount} rules
                  </span>
                  {hit.matched.length > 0 ? (
                    <span className="mt-0.5 block font-mono text-[0.65rem] text-ink-secondary">
                      {hit.matched.join(" · ")}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {slicing ? (
          <p className="mt-3 font-mono text-[0.72rem] text-ink-muted">
            slicing {slicing} — fetching closure, compiling in this tab…
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 border border-code-string/40 px-4 py-3 font-mono text-[0.72rem] text-code-string">
          {error}
        </p>
      ) : null}

      {slice ? (
        <div className="panel mt-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-mono text-[0.78rem] text-ink">{slice.root}</p>
            <p className="font-mono text-[0.65rem] text-ink-muted">
              {slice.closureSize} modules · {slice.artifact.program.derived.length} rules ·{" "}
              {slice.artifact.program.parameters.length} parameters · compiled in{" "}
              {slice.compileMs}ms
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
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

          <div className="mt-4">
            <PresumptionEditor
              defaults={slice.pkg.defaults}
              overrides={overrides}
              onChange={(ref, value) =>
                setOverrides((previous) => ({ ...previous, [ref]: value }))
              }
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={run}
              disabled={running}
              className="btn-accent cursor-pointer px-4 py-1.5 font-mono text-[0.75rem]"
            >
              {running ? "running…" : "run the slice"}
            </button>
          </div>
        </div>
      ) : null}

      {outputs && slice ? (
        <div className="record mt-6">
          <div className="record-caption">
            <span>
              {slice.root} · {outputs.month}
            </span>
            <span>determined locally</span>
          </div>
          <div className="record-body">
            {Object.entries(outputs.values).map(([name, value]) => (
              <div key={name} className="rec-line">
                {"  "}
                {name.padEnd(Math.max(...Object.keys(outputs.values).map((n) => n.length)) + 2)}
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

      {slice ? (
        <p className="mt-4 font-mono text-[0.68rem] text-ink-muted">
          └─ valid slice, compiled in this tab from corpus{" "}
          {corpusSource ? `${corpusSource.repo}@${corpusSource.commit.slice(0, 7)}` : "(unknown)"}
          {slice.corrected + slice.admitted > 0
            ? ` (${slice.corrected} attributions corrected, ${slice.admitted} inputs admitted by probe)`
            : ""}{" "}
          — well-formed and cited, but not parity-pinned like the cataloged programs above
        </p>
      ) : null}
    </div>
  );
}
