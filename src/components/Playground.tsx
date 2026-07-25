"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompiledProgramArtifact, ExecutionResponse } from "@/lib/engine/types";
import { buildPackageRequest, type GoldenAnswers } from "@/lib/goldenPath";
import {
  loadGoldenPackage,
  loadProgramsIndex,
  type LoadedPackage,
  type ProgramIndexEntry,
} from "@/lib/programSource";
import { applyWhatIf } from "@/lib/whatIf";
import { buildDisplayTree } from "@/lib/trace";
import { loadEngine, type LoadedEngine } from "@/lib/wasm";
import { useNetworkSentinel } from "@/lib/useNetworkSentinel";
import { DeterminationPanel, type RunRecord } from "./DeterminationPanel";
import { GoldenHouseholdPanel } from "./GoldenHouseholdPanel";
import { PackagePanel } from "./PackagePanel";
import { ProvenanceFooter } from "./ProvenanceFooter";
import { RunItLocally } from "./RunItLocally";
import { StatusStrip } from "./StatusStrip";
import { TakeItWithYou } from "./TakeItWithYou";
import { Tour } from "./Tour";

/** The golden path: the program the page lands on. */
const DEFAULT_PROGRAM_ID = "co-snap";

function exampleAnswers(loaded: LoadedPackage): GoldenAnswers {
  return {
    household: { ...loaded.pkg.example.household },
    people: Object.fromEntries(
      Object.entries(loaded.pkg.example.people ?? {}).map(([slot, values]) => [slot, [...values]]),
    ),
    refOverrides: {},
  };
}

export function Playground() {
  const [engine, setEngine] = useState<LoadedEngine | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [programs, setPrograms] = useState<ProgramIndexEntry[]>([]);
  const [programId, setProgramId] = useState(DEFAULT_PROGRAM_ID);
  const [loadedPackage, setLoadedPackage] = useState<LoadedPackage | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(true);

  const [goldenAnswers, setGoldenAnswers] = useState<GoldenAnswers>({
    household: {},
    people: {},
    refOverrides: {},
  });
  const [selectedOutputName, setSelectedOutputName] = useState<string>("");
  const [whatIfActive, setWhatIfActive] = useState(false);
  const [presumptionsOpen, setPresumptionsOpen] = useState(false);

  const [month, setMonth] = useState("2026-01");
  const [run, setRun] = useState<RunRecord | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runKey, setRunKey] = useState<string>("");

  // The sentinel arms once the engine and the current program's package are
  // both resident; switching programs re-arms it (a switch fetches the next
  // package — determinations still never fetch).
  const networkCount = useNetworkSentinel(engine !== null && !loadingProgram);

  // --- startup: engine + program index --------------------------------------

  useEffect(() => {
    let cancelled = false;
    loadEngine().then(
      (loaded) => {
        if (!cancelled) setEngine(loaded);
      },
      (error: unknown) => {
        if (!cancelled) setEngineError(error instanceof Error ? error.message : String(error));
      },
    );
    loadProgramsIndex().then(
      (index) => {
        if (!cancelled) setPrograms(index);
      },
      () => {
        // The picker degrades to the current program; the page still works.
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // --- package loading (initial and on switch) ------------------------------

  useEffect(() => {
    let cancelled = false;
    setLoadingProgram(true);
    setRun(null);
    setRunError(null);
    loadGoldenPackage(programId)
      .then(
        (loaded) => {
          if (cancelled) return;
          setLoadedPackage(loaded);
          setPackageError(null);
          setGoldenAnswers(exampleAnswers(loaded));
          setSelectedOutputName(Object.keys(loaded.pkg.outputs)[0] ?? "");
          setMonth(loaded.pkg.default_period);
          setWhatIfActive(false);
          setPresumptionsOpen(false);
        },
        (error: unknown) => {
          if (cancelled) return;
          setPackageError(error instanceof Error ? error.message : String(error));
        },
      )
      .finally(() => {
        if (!cancelled) setLoadingProgram(false);
      });
    return () => {
      cancelled = true;
    };
  }, [programId]);

  // --- the artifact in force ------------------------------------------------

  const packageArtifact = useMemo(() => {
    if (!loadedPackage) return null;
    const whatIf = loadedPackage.pkg.what_if;
    if (!whatIfActive || !whatIf) {
      return { artifactJson: loadedPackage.artifactJson, previousValue: null as string | null };
    }
    const amended = applyWhatIf(loadedPackage.artifactJson, {
      parameter: whatIf.parameter,
      value: whatIf.value,
    });
    return { artifactJson: amended.artifactJson, previousValue: amended.previousValue };
  }, [loadedPackage, whatIfActive]);

  // --- run ------------------------------------------------------------------

  const currentKey = useMemo(
    () => JSON.stringify({ programId, goldenAnswers, month, selectedOutputName, whatIfActive }),
    [programId, goldenAnswers, month, selectedOutputName, whatIfActive],
  );

  const sequenceRef = useRef(0);

  const doRun = useCallback(() => {
    if (!engine || !loadedPackage || !packageArtifact || !selectedOutputName) return;
    try {
      const request = buildPackageRequest({
        pkg: loadedPackage.pkg,
        answers: goldenAnswers,
        month,
        mode: "explain",
      });
      const startedAt = performance.now();
      const responseJson = engine.execute(packageArtifact.artifactJson, JSON.stringify(request));
      const executeMs = performance.now() - startedAt;
      const response = JSON.parse(responseJson) as ExecutionResponse;
      const outputId = loadedPackage.pkg.outputs[selectedOutputName];
      const tree = buildDisplayTree({
        outputId,
        result: response.results[0],
        artifact: JSON.parse(packageArtifact.artifactJson) as CompiledProgramArtifact,
        dataset: request.dataset,
      });
      sequenceRef.current += 1;
      setRun({ response, outputId, month, executeMs, tree, sequence: sequenceRef.current });
      setRunError(null);
      setRunKey(currentKey);
    } catch (error) {
      setRun(null);
      setRunError(error instanceof Error ? error.message : String(error));
    }
  }, [
    engine,
    loadedPackage,
    packageArtifact,
    goldenAnswers,
    month,
    selectedOutputName,
    currentKey,
  ]);

  // Auto-run whenever the program in force changes (first landing, program
  // switches, what-if toggles) — the page must always land on a computed
  // verdict.
  const autoRunKeyRef = useRef("");
  useEffect(() => {
    if (!engine || !packageArtifact || !loadedPackage || !selectedOutputName) return;
    const programKey = `${programId}:${whatIfActive}`;
    if (autoRunKeyRef.current === programKey) return;
    autoRunKeyRef.current = programKey;
    doRun();
  }, [engine, packageArtifact, loadedPackage, selectedOutputName, programId, whatIfActive, doRun]);

  // --- handlers -------------------------------------------------------------

  const onSelectProgram = useCallback((next: string) => {
    autoRunKeyRef.current = "";
    setProgramId(next);
  }, []);

  const onRefOverride = useCallback((ref: string, value: string | null) => {
    setGoldenAnswers((current) => {
      const refOverrides = { ...current.refOverrides };
      if (value === null) {
        delete refOverrides[ref];
      } else {
        refOverrides[ref] = value;
      }
      return { ...current, refOverrides };
    });
  }, []);

  const stale = run !== null && currentKey !== runKey;
  const ready = loadedPackage !== null && !loadingProgram;

  return (
    <>
      <StatusStrip engine={engine} engineError={engineError} networkCount={networkCount} />

      {engineError ? (
        <div className="mx-auto mt-10 max-w-2xl border-l-2 border-error bg-error/10 px-4 py-3">
          <p className="smallcaps text-error">The engine could not be instantiated</p>
          <p className="mt-1 font-mono text-[0.8rem] text-ink-secondary">{engineError}</p>
        </div>
      ) : null}
      {packageError ? (
        <div className="mx-auto mt-10 max-w-2xl border-l-2 border-error bg-error/10 px-4 py-3">
          <p className="smallcaps text-error">The program package could not be fetched</p>
          <p className="mt-1 font-mono text-[0.8rem] text-ink-secondary">{packageError}</p>
        </div>
      ) : null}

      <main className="mt-12 grid gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          {ready && loadedPackage ? (
            <PackagePanel
              pkg={loadedPackage.pkg}
              fetchedSha256={loadedPackage.fetchedSha256}
              programs={programs}
              onSelectProgram={onSelectProgram}
              whatIfActive={whatIfActive}
              whatIfPreviousValue={packageArtifact?.previousValue ?? null}
              onToggleWhatIf={() => setWhatIfActive((active) => !active)}
              presumptionsOpen={presumptionsOpen}
              onTogglePresumptions={() => setPresumptionsOpen((open) => !open)}
              refOverrides={goldenAnswers.refOverrides ?? {}}
              onRefOverride={onRefOverride}
            />
          ) : (
            <section className="rise rise-2" aria-label="The program" id="program-panel">
              <p className="mt-8 text-center font-mono text-[0.75rem] text-ink-muted">
                fetching the program package…
              </p>
            </section>
          )}
          <RunItLocally />
        </div>
        <div className="space-y-14 lg:col-span-7">
          {ready && loadedPackage ? (
            <GoldenHouseholdPanel
              pkg={loadedPackage.pkg}
              answers={goldenAnswers}
              onAnswers={setGoldenAnswers}
              month={month}
              onMonth={setMonth}
              selectedOutput={selectedOutputName}
              onSelectOutput={setSelectedOutputName}
              onRun={doRun}
              canRun={engine !== null && packageArtifact !== null}
              stale={stale}
              presumedCount={Object.keys(loadedPackage.pkg.defaults).length}
              overriddenCount={Object.keys(goldenAnswers.refOverrides ?? {}).length}
              onOpenPresumptions={() => setPresumptionsOpen(true)}
            />
          ) : null}
          <DeterminationPanel
            run={run}
            runError={runError}
            stale={stale}
            compileMs={null}
            engineReady={engine !== null}
          />
        </div>
      </main>

      <TakeItWithYou />
      <ProvenanceFooter engine={engine} networkCount={networkCount} />
      <Tour />
    </>
  );
}
