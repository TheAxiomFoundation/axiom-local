"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PresumptionEditor } from "@/components/PresumptionEditor";
import { loadEngine } from "@/lib/engine/load";
import type { CompiledProgramArtifact, ExecutionResponse } from "@/lib/engine/types";
import {
  assertArtifactCertified,
  collectClosureIds,
  findUncertified,
  resolveEnforcement,
  validateLedger,
  type CertificationStatus,
  type CertifiedIndex,
} from "@/lib/certified";
import {
  assertSliceableRoot,
  moduleUrl,
  probeFixpoint,
  resolveClosure,
  subtreeCatalog,
  synthesizePackage,
  type CorpusManifest,
  type CorpusModuleEntry,
} from "@/lib/corpus";
import {
  buildPackageRequest,
  findInvalidNumericAnswers,
  type GoldenPackage,
} from "@/lib/goldenPath";
import { humanizeCitation, humanizeRuleName } from "@/lib/citations";
import {
  buildDeterminationEnvelope,
  envelopeFilename,
  type DeterminationEnvelope,
} from "@/lib/envelope";

/**
 * The subtree IS the unit — there is no program registry. Every module in
 * the vendored corpus (minus Axiom-authored composition/pipeline assembly,
 * minus rule-less shells) is a root: pick one from the catalog or search
 * by rule name or citation, its import closure is fetched and compiled to
 * an artifact in this tab, its inputs are discovered from the compiled
 * artifact, and it runs — with every unstated input carried as a visible,
 * overridable screening presumption.
 *
 * Certification is a status on every slice: the closure is checked against
 * the served ledger and labeled "certified (ledger …)" or "encoded — not
 * certified". Under permissive (default, the launch posture) that is all
 * it is; under enforced a closure with ANY uncertified node refuses, and
 * the refusal names the ids — this explorer is dev tooling, the one
 * surface where naming them is allowed (src/lib/certified.ts).
 */

const ENFORCEMENT = resolveEnforcement(process.env.NEXT_PUBLIC_AXIOM_CERTIFIED_ENFORCEMENT);

/** The worked example: pure 7 CFR 273.10 — the SNAP benefit computation. */
const DEFAULT_ROOT = "us:regulations/7-cfr/273/10";

interface SearchHit {
  target: string;
  jurisdiction: string;
  ruleCount: number;
  matched: string[];
  /** Headline derived rule from the manifest — the entry's title. */
  headline?: string;
}

interface Slice {
  root: string;
  closure: string[];
  artifactJson: string;
  artifact: CompiledProgramArtifact;
  pkg: GoldenPackage;
  certification: CertificationStatus;
  closureSize: number;
  corrected: number;
  admitted: number;
  compileMs: number;
}

type ManifestState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "missing" }
  /** Corpus present but no valid ledger — under ENFORCED nothing slices. */
  | { kind: "uncertified"; reason: string }
  /** `certified` is null when the ledger is absent (permissive only). */
  | { kind: "ready"; manifest: CorpusManifest; certified: CertifiedIndex | null };

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
    envelope: DeterminationEnvelope;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureManifest = useCallback(() => {
    if (manifestState.kind !== "idle") return;
    setManifestState({ kind: "loading" });
    Promise.all([
      fetch("/corpus/manifest.json").then((response) => {
        if (!response.ok) throw new Error(`manifest ${response.status}`);
        return response.json() as Promise<CorpusManifest>;
      }),
      // The ledger travels with the corpus. Permissive: absent means every
      // slice is simply "encoded". Enforced: absent means nothing slices.
      fetch("/corpus/ledger.json")
        .then((response) => {
          if (!response.ok) throw new Error(`ledger not served (${response.status})`);
          return response.json();
        })
        .then((raw) => validateLedger(raw))
        .catch((cause): CertifiedIndex | null => {
          if (ENFORCEMENT === "enforced") {
            throw new Error(
              `uncertified: ${cause instanceof Error ? cause.message : String(cause)}`,
            );
          }
          return null;
        }),
    ])
      .then(([manifest, certified]) => setManifestState({ kind: "ready", manifest, certified }))
      .catch((cause) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        setManifestState(
          message.startsWith("uncertified: ")
            ? { kind: "uncertified", reason: message.slice("uncertified: ".length) }
            : { kind: "missing" },
        );
      });
  }, [manifestState.kind]);

  // Load the catalog immediately: the subtree list IS the landing surface,
  // not something hidden behind a focused search box.
  useEffect(() => {
    ensureManifest();
  }, [ensureManifest]);

  // The offerable catalog: corpus modules minus composition/pipeline
  // assembly, minus rule-less shells (subtreeCatalog in src/lib/corpus.ts).
  const catalog = useMemo<CorpusModuleEntry[]>(
    () => (manifestState.kind === "ready" ? subtreeCatalog(manifestState.manifest) : []),
    [manifestState],
  );

  const { hits, totalHits } = useMemo<{ hits: SearchHit[]; totalHits: number }>(() => {
    if (manifestState.kind !== "ready") return { hits: [], totalHits: 0 };
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      // No search: offer the largest subtrees as a browsable starting
      // point; the full catalog is one search away.
      const top = [...catalog]
        .sort((a, b) => b.rules.length - a.rules.length || a.target.localeCompare(b.target))
        .slice(0, 12)
        .map((entry) => ({
          target: entry.target,
          jurisdiction: entry.jurisdiction,
          ruleCount: entry.rules.length,
          matched: [],
          headline: entry.headline,
        }));
      return { hits: top, totalHits: catalog.length };
    }
    // Score every match, sort, THEN cap — manifest order is alphabetical by
    // target, and a raw first-30 cut would hide every late-alphabet state.
    const scored: (SearchHit & { score: number })[] = [];
    for (const entry of catalog) {
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
      scored.push({
        target: entry.target,
        jurisdiction: entry.jurisdiction,
        ruleCount: entry.rules.length,
        matched: matched.slice(0, 3),
        headline: entry.headline,
        score,
      });
    }
    scored.sort((a, b) => b.score - a.score || b.ruleCount - a.ruleCount);
    return { hits: scored.slice(0, 12), totalHits: scored.length };
  }, [manifestState, catalog, query]);

  const sliceAt = useCallback(
    async (root: string) => {
      if (manifestState.kind !== "ready") return;
      setSlicing(root);
      setSlice(null);
      setOutputs(null);
      setOverrides({});
      setError(null);
      try {
        // Composition/pipeline paths are refused as roots outright — before
        // any closure resolution, compilation, or certification talk.
        assertSliceableRoot(root);
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
        // The certified-node gate, ENFORCED mode only: refuse a slice whose
        // closure carries ANY uncertified node before anything renders.
        // Naming the ids is allowed here (dev tooling) and nowhere servable.
        if (ENFORCEMENT === "enforced" && manifestState.certified) {
          assertArtifactCertified(artifact, Object.keys(pkg.defaults), manifestState.certified);
        }
        if (Object.keys(pkg.outputs).length === 0) {
          setError(
            `${root} defines ${artifact.program.parameters.length} parameters and no executable ` +
              `rules — there is nothing to run at this target. Pick a hit that lists rule names.`,
          );
          return;
        }
        const { corrected, admitted } = probeFixpoint(engine, artifactJson, artifact, pkg);
        if (ENFORCEMENT === "enforced" && manifestState.certified) {
          // Probe-admitted refs are rendered in the editor too — re-gate.
          assertArtifactCertified(artifact, Object.keys(pkg.defaults), manifestState.certified);
        }
        // The status label, recomputed over the final defaults (permissive
        // shows it; enforced only ever reaches here with "certified").
        const certification: CertificationStatus =
          manifestState.certified &&
          findUncertified(
            collectClosureIds(artifact, Object.keys(pkg.defaults)),
            manifestState.certified,
          ).length === 0
            ? "certified"
            : "encoded";
        setMonth(pkg.default_period);
        setSlice({
          root,
          closure,
          artifactJson,
          artifact,
          pkg,
          certification,
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
      // The canonical JSON artifact of this run — the same builder the
      // CLI's --json prints, byte for byte.
      const envelope = buildDeterminationEnvelope({
        root: slice.root,
        closure: slice.closure,
        source:
          manifestState.kind === "ready"
            ? (manifestState.manifest.sources[0] ?? { repo: "corpus", commit: "unknown" })
            : { repo: "corpus", commit: "unknown" },
        pkg: slice.pkg,
        artifact: slice.artifact,
        request,
        response,
        answers,
        certification: slice.certification,
        ledger:
          manifestState.kind === "ready" && manifestState.certified
            ? {
                ledger_id: manifestState.certified.ledger.ledger_id,
                certified_set_version: manifestState.certified.setVersion,
              }
            : null,
      });
      setOutputs({
        month,
        envelope,
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
  }, [slice, overrides, month, manifestState]);

  // The default subtree slices itself: the landing state is a live
  // determination over real law, not an empty search box.
  const autoSliced = useRef(false);
  useEffect(() => {
    if (autoSliced.current || manifestState.kind !== "ready") return;
    if (!catalog.some((entry) => entry.target === DEFAULT_ROOT)) return;
    autoSliced.current = true;
    void sliceAt(DEFAULT_ROOT);
  }, [manifestState, catalog, sliceAt]);

  // A fresh slice runs once with its presumptions so outputs render
  // without a click; presumption edits re-run through the button.
  const ranFor = useRef<Slice | null>(null);
  useEffect(() => {
    if (!slice || ranFor.current === slice) return;
    ranFor.current = slice;
    void run();
  }, [slice, run]);

  const fieldClass = "field text-[0.82rem]";
  const corpusSource =
    manifestState.kind === "ready" ? manifestState.manifest.sources[0] : null;

  return (
    <div>
      <div className="panel p-5">
        <label className="block">
          <span className="smallcaps text-[0.62rem] text-ink-secondary">
            Pick a subtree — any rule, any citation
          </span>
          <input
            className={`${fieldClass} mt-1`}
            value={query}
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
        {manifestState.kind === "uncertified" ? (
          <p className="mt-3 font-mono text-[0.72rem] text-ink-muted">
            corpus not certified — under enforced certification nothing is sliceable without
            a valid ledger (public/corpus/ledger.json): {manifestState.reason}
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
            {query
              ? `showing the ${hits.length} most relevant of ${totalHits} matches — refine the search to narrow further`
              : `the ${hits.length} largest of ${totalHits} sliceable subtrees — search to reach the rest`}
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
                  {/* Title first: the module's headline rule, humanized;
                      the citation reads as the subtitle. Rule-less-of-
                      derived shells fall back to the citation itself. */}
                  <span className="block text-[0.82rem] font-light text-ink">
                    {hit.headline ? humanizeRuleName(hit.headline) : humanizeCitation(hit.target)}
                  </span>
                  <span className="mt-0.5 block font-mono text-[0.65rem] text-ink-muted">
                    {hit.headline ? `${humanizeCitation(hit.target)} · ` : ""}
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
            <p className="text-[0.95rem] font-light text-ink">
              {humanizeCitation(slice.root)}
            </p>
            <p className="font-mono text-[0.65rem] text-ink-muted">
              {slice.root} · {slice.closureSize} modules ·{" "}
              {slice.artifact.program.derived.length} rules ·{" "}
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
              onClear={(ref) =>
                setOverrides((previous) => {
                  const next = { ...previous };
                  delete next[ref];
                  return next;
                })
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
        <>
          <div className="record mt-6">
            <div className="record-caption">
              <span>
                {humanizeCitation(slice.root)} · {outputs.month}
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
          <EnvelopeAffordance root={slice.root} envelope={outputs.envelope} />
        </>
      ) : null}

      {slice ? (
        <p className="mt-4 font-mono text-[0.68rem] text-ink-muted">
          └─ valid slice, compiled in this tab from corpus{" "}
          {corpusSource ? `${corpusSource.repo}@${corpusSource.commit.slice(0, 7)}` : "(unknown)"}
          {" · "}
          {slice.certification === "certified" &&
          manifestState.kind === "ready" &&
          manifestState.certified ? (
            <span className="text-success">
              certified (ledger {manifestState.certified.ledger.ledger_id})
            </span>
          ) : (
            "encoded — not certified"
          )}
          {slice.corrected + slice.admitted > 0
            ? ` (${slice.corrected} attributions corrected, ${slice.admitted} inputs admitted by probe)`
            : ""}{" "}
          — well-formed and cited; unstated inputs carry synthesized screening presumptions
        </p>
      ) : null}
    </div>
  );
}

/**
 * The run's canonical JSON artifact: view raw, copy, download — the exact
 * envelope `determine.mjs --json` prints (src/lib/envelope.ts).
 */
function EnvelopeAffordance({
  root,
  envelope,
}: {
  root: string;
  envelope: DeterminationEnvelope;
}) {
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => `${JSON.stringify(envelope, null, 2)}\n`, [envelope]);
  const href = useMemo(
    () => `data:application/json;charset=utf-8,${encodeURIComponent(json)}`,
    [json],
  );
  return (
    <details className="mt-3">
      <summary className="cursor-pointer font-mono text-[0.7rem] text-ink-muted transition-colors hover:text-accent">
        JSON — the determination as a record ›
      </summary>
      <div className="mt-2 border border-rule">
        <div className="flex items-center justify-between border-b border-rule-subtle px-3 py-1.5">
          <span className="font-mono text-[0.65rem] text-ink-muted">
            outputs · trace · inputs as applied · corpus + ledger identity
          </span>
          <span className="flex items-center gap-4">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(json);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="cursor-pointer select-none font-mono text-[0.62rem] uppercase tracking-wider text-ink-muted transition-colors hover:text-accent"
            >
              {copied ? "copied" : "copy"}
            </button>
            <a
              href={href}
              download={envelopeFilename(root)}
              className="font-mono text-[0.62rem] uppercase tracking-wider text-ink-muted transition-colors hover:text-accent"
              style={{ textDecoration: "none" }}
            >
              download
            </a>
          </span>
        </div>
        <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-[0.65rem] leading-relaxed text-ink-secondary">
          {json}
        </pre>
      </div>
    </details>
  );
}
