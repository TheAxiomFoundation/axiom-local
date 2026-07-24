"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CompiledProgramArtifact, ExecutionResponse } from "@/lib/engine/types";
import {
  EXAMPLE_DEFAULT_ANSWERS,
  EXAMPLE_DEFAULT_MONTH,
  EXAMPLE_MODULES,
  EXAMPLE_ROOT_TARGET,
} from "@/lib/example";
import { discoverInputs, moduleOf, type DiscoveredInput } from "@/lib/program";
import { buildRequest } from "@/lib/request";
import { buildPackageRequest, type GoldenAnswers } from "@/lib/goldenPath";
import { loadGoldenPackage, type LoadedPackage } from "@/lib/programSource";
import { applyWhatIf } from "@/lib/whatIf";
import { buildDisplayTree } from "@/lib/trace";
import { loadEngine, type LoadedEngine } from "@/lib/wasm";
import { useNetworkSentinel } from "@/lib/useNetworkSentinel";
import { DeterminationPanel, type RunRecord } from "./DeterminationPanel";
import { GoldenHouseholdPanel } from "./GoldenHouseholdPanel";
import { HouseholdPanel } from "./HouseholdPanel";
import { PackagePanel } from "./PackagePanel";
import { ProgramPanel } from "./ProgramPanel";
import { ProvenanceFooter } from "./ProvenanceFooter";
import { StatusStrip } from "./StatusStrip";
import { TakeItWithYou } from "./TakeItWithYou";
import { Tour } from "./Tour";

const GOLDEN_PROGRAM_ID = "co-snap";

/** The canonical parity household the tests pin: $478 for FY-2026. */
const GOLDEN_DEFAULT_ANSWERS: GoldenAnswers = {
  household: {
    household_size: "2",
    snap_countable_earned_income: "1200",
    household_shelter_costs_incurred: "900",
  },
  people: { member_age: ["42", "9"] },
  refOverrides: {},
};

const WHAT_IF_EDIT = {
  parameter: "snap_earned_income_deduction_rate_for_net_income",
  value: "0.3",
};

interface ModulesState {
  kind: "modules";
  modules: Record<string, string>;
  rootTarget: string;
  isExample: boolean;
  loaderOpenInitially?: boolean;
}

interface PackageState {
  kind: "package";
}

type SourceState = ModulesState | PackageState;

interface CompiledState {
  artifactJson: string;
  artifact: CompiledProgramArtifact;
  compileMs: number;
  inputs: DiscoveredInput[];
}

function defaultAnswers(inputs: DiscoveredInput[], isExample: boolean): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const input of inputs) {
    if (isExample && EXAMPLE_DEFAULT_ANSWERS[input.name] !== undefined) {
      answers[input.ref] = EXAMPLE_DEFAULT_ANSWERS[input.name];
    } else if (input.tableKeys && input.tableKeys.length > 0) {
      answers[input.ref] = input.tableKeys[0];
    } else {
      answers[input.ref] = "0";
    }
  }
  return answers;
}

export function Playground() {
  const [engine, setEngine] = useState<LoadedEngine | null>(null);
  const [engineError, setEngineError] = useState<string | null>(null);

  const [goldenPackage, setGoldenPackage] = useState<LoadedPackage | null>(null);
  const [packageError, setPackageError] = useState<string | null>(null);
  const [startupSettled, setStartupSettled] = useState(false);

  const [source, setSource] = useState<SourceState>({ kind: "package" });

  // --- modules-mode state ---------------------------------------------------
  const [compiled, setCompiled] = useState<CompiledState | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedOutput, setSelectedOutput] = useState<string>("");

  // --- package-mode state ---------------------------------------------------
  const [goldenAnswers, setGoldenAnswers] = useState<GoldenAnswers>(GOLDEN_DEFAULT_ANSWERS);
  const [selectedOutputName, setSelectedOutputName] = useState<string>("snap_allotment");
  const [whatIfActive, setWhatIfActive] = useState(false);
  const [presumptionsOpen, setPresumptionsOpen] = useState(false);

  const [month, setMonth] = useState(EXAMPLE_DEFAULT_MONTH);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runKey, setRunKey] = useState<string>("");

  // The sentinel arms once everything the page fetches at startup — engine
  // and golden package alike — has arrived. Determinations never fetch.
  const networkCount = useNetworkSentinel(engine !== null && startupSettled);

  // --- startup: engine + golden package, in parallel ------------------------

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
    loadGoldenPackage(GOLDEN_PROGRAM_ID)
      .then(
        (loaded) => {
          if (cancelled) return;
          setGoldenPackage(loaded);
          setMonth(loaded.pkg.default_period);
        },
        (error: unknown) => {
          if (cancelled) return;
          setPackageError(error instanceof Error ? error.message : String(error));
          // The teaching example still works without the package.
          setSource({ kind: "modules", modules: EXAMPLE_MODULES, rootTarget: EXAMPLE_ROOT_TARGET, isExample: true });
        },
      )
      .finally(() => {
        if (!cancelled) setStartupSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- modules mode: compile once per program -------------------------------

  useEffect(() => {
    if (!engine || source.kind !== "modules") return;
    setRun(null);
    setRunError(null);
    try {
      const startedAt = performance.now();
      const artifactJson = engine.compile(JSON.stringify(source.modules), source.rootTarget);
      const compileMs = performance.now() - startedAt;
      const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
      const inputs = discoverInputs(artifact);
      setCompiled({ artifactJson, artifact, compileMs, inputs });
      setCompileError(null);
      setAnswers(defaultAnswers(inputs, source.isExample));
      const rootDerived = artifact.program.derived.filter(
        (derived) => moduleOf(derived.id) === source.rootTarget,
      );
      const preferred =
        rootDerived[rootDerived.length - 1] ??
        artifact.program.derived[artifact.program.derived.length - 1];
      setSelectedOutput(preferred?.id ?? preferred?.name ?? "");
    } catch (error) {
      setCompiled(null);
      setCompileError(error instanceof Error ? error.message : String(error));
    }
  }, [engine, source]);

  // --- the artifact in force (package mode) ---------------------------------

  const packageArtifact = useMemo(() => {
    if (!goldenPackage) return null;
    if (!whatIfActive) {
      return { artifactJson: goldenPackage.artifactJson, previousValue: null as string | null };
    }
    const amended = applyWhatIf(goldenPackage.artifactJson, WHAT_IF_EDIT);
    return { artifactJson: amended.artifactJson, previousValue: amended.previousValue };
  }, [goldenPackage, whatIfActive]);

  // --- run ------------------------------------------------------------------

  const currentKey = useMemo(
    () =>
      JSON.stringify(
        source.kind === "package"
          ? { goldenAnswers, month, selectedOutputName, whatIfActive }
          : { answers, month, selectedOutput },
      ),
    [source.kind, goldenAnswers, month, selectedOutputName, whatIfActive, answers, selectedOutput],
  );

  const sequenceRef = useRef(0);

  const doRun = useCallback(() => {
    if (!engine) return;
    try {
      if (source.kind === "package") {
        if (!goldenPackage || !packageArtifact) return;
        const request = buildPackageRequest({
          pkg: goldenPackage.pkg,
          answers: goldenAnswers,
          month,
          mode: "explain",
        });
        const startedAt = performance.now();
        const responseJson = engine.execute(packageArtifact.artifactJson, JSON.stringify(request));
        const executeMs = performance.now() - startedAt;
        const response = JSON.parse(responseJson) as ExecutionResponse;
        const outputId = goldenPackage.pkg.outputs[selectedOutputName];
        const tree = buildDisplayTree({
          outputId,
          result: response.results[0],
          artifact: JSON.parse(packageArtifact.artifactJson) as CompiledProgramArtifact,
          dataset: request.dataset,
        });
        sequenceRef.current += 1;
        setRun({ response, outputId, month, executeMs, tree, sequence: sequenceRef.current });
      } else {
        if (!compiled || !selectedOutput) return;
        const entity =
          compiled.artifact.program.derived.find(
            (derived) => derived.id === selectedOutput || derived.name === selectedOutput,
          )?.entity ?? "Household";
        const request = buildRequest({
          inputs: compiled.inputs,
          answers,
          month,
          outputId: selectedOutput,
          entity,
          mode: "explain",
        });
        const startedAt = performance.now();
        const responseJson = engine.execute(compiled.artifactJson, JSON.stringify(request));
        const executeMs = performance.now() - startedAt;
        const response = JSON.parse(responseJson) as ExecutionResponse;
        const tree = buildDisplayTree({
          outputId: selectedOutput,
          result: response.results[0],
          artifact: compiled.artifact,
          dataset: request.dataset,
        });
        sequenceRef.current += 1;
        setRun({
          response,
          outputId: selectedOutput,
          month,
          executeMs,
          tree,
          sequence: sequenceRef.current,
        });
      }
      setRunError(null);
      setRunKey(currentKey);
    } catch (error) {
      setRun(null);
      setRunError(error instanceof Error ? error.message : String(error));
    }
  }, [
    engine,
    source.kind,
    goldenPackage,
    packageArtifact,
    goldenAnswers,
    month,
    selectedOutputName,
    compiled,
    selectedOutput,
    answers,
    currentKey,
  ]);

  // Auto-run whenever the program in force changes (first landing, what-if
  // toggles, source switches) — the page must always be alive, and the
  // what-if verdict must appear without a second click.
  const autoRunKeyRef = useRef("");
  useEffect(() => {
    if (!engine) return;
    const programKey =
      source.kind === "package"
        ? packageArtifact
          ? `package:${whatIfActive}`
          : ""
        : compiled
          ? `modules:${compiled.artifactJson.length}:${selectedOutput}`
          : "";
    if (!programKey || autoRunKeyRef.current === programKey) return;
    autoRunKeyRef.current = programKey;
    doRun();
  }, [engine, source.kind, packageArtifact, whatIfActive, compiled, selectedOutput, doRun]);

  // --- handlers -------------------------------------------------------------

  const onLoadProgram = useCallback((modules: Record<string, string>, rootTarget: string) => {
    setSource({ kind: "modules", modules, rootTarget, isExample: false });
    setMonth(EXAMPLE_DEFAULT_MONTH);
  }, []);

  const onLoadTeachingExample = useCallback(() => {
    setSource({ kind: "modules", modules: EXAMPLE_MODULES, rootTarget: EXAMPLE_ROOT_TARGET, isExample: true });
    setMonth(EXAMPLE_DEFAULT_MONTH);
  }, []);

  const onOpenLoader = useCallback(() => {
    setSource({
      kind: "modules",
      modules: EXAMPLE_MODULES,
      rootTarget: EXAMPLE_ROOT_TARGET,
      isExample: true,
      loaderOpenInitially: true,
    });
    setMonth(EXAMPLE_DEFAULT_MONTH);
  }, []);

  const onRestorePackage = useCallback(() => {
    if (!goldenPackage) return;
    setSource({ kind: "package" });
    setRun(null);
    setRunError(null);
    setMonth(goldenPackage.pkg.default_period);
  }, [goldenPackage]);

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
  const outputs = compiled?.artifact.program.derived ?? [];
  const packageReady = source.kind === "package" && goldenPackage !== null;

  return (
    <>
      <StatusStrip engine={engine} engineError={engineError} networkCount={networkCount} />

      {engineError ? (
        <div className="mx-auto mt-10 max-w-2xl border-l-2 border-error bg-error/10 px-4 py-3">
          <p className="smallcaps text-error">The engine could not be instantiated</p>
          <p className="mt-1 font-mono text-[0.8rem] text-ink-secondary">{engineError}</p>
        </div>
      ) : null}
      {packageError && source.kind === "modules" ? (
        <div className="mx-auto mt-10 max-w-2xl border-l-2 border-error bg-error/10 px-4 py-3">
          <p className="smallcaps text-error">The Colorado SNAP package could not be fetched</p>
          <p className="mt-1 font-mono text-[0.8rem] text-ink-secondary">
            {packageError} — the two-module teaching example is loaded instead.
          </p>
        </div>
      ) : null}

      <main className="mt-12 grid gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          {packageReady && goldenPackage ? (
            <PackagePanel
              pkg={goldenPackage.pkg}
              fetchedSha256={goldenPackage.fetchedSha256}
              whatIfActive={whatIfActive}
              whatIfPreviousValue={packageArtifact?.previousValue ?? null}
              onToggleWhatIf={() => setWhatIfActive((active) => !active)}
              presumptionsOpen={presumptionsOpen}
              onTogglePresumptions={() => setPresumptionsOpen((open) => !open)}
              refOverrides={goldenAnswers.refOverrides ?? {}}
              onRefOverride={onRefOverride}
              onOpenLoader={onOpenLoader}
              onLoadTeachingExample={onLoadTeachingExample}
            />
          ) : source.kind === "modules" ? (
            <ProgramPanel
              modules={source.modules}
              rootTarget={source.rootTarget}
              isExample={source.isExample}
              compileMs={compiled?.compileMs ?? null}
              compileError={compileError}
              onLoadProgram={onLoadProgram}
              onRestoreExample={goldenPackage ? onRestorePackage : onLoadTeachingExample}
              restoreLabel={goldenPackage ? "Return to Colorado SNAP" : "Restore the example"}
              loaderOpenInitially={source.loaderOpenInitially}
            />
          ) : (
            <section className="rise rise-2" aria-label="The program" id="program-panel">
              <p className="mt-8 text-center font-mono text-[0.75rem] text-ink-muted">
                fetching the Colorado SNAP package…
              </p>
            </section>
          )}
        </div>
        <div className="space-y-14 lg:col-span-7">
          {packageReady && goldenPackage ? (
            <GoldenHouseholdPanel
              pkg={goldenPackage.pkg}
              answers={goldenAnswers}
              onAnswers={setGoldenAnswers}
              month={month}
              onMonth={setMonth}
              selectedOutput={selectedOutputName}
              onSelectOutput={setSelectedOutputName}
              onRun={doRun}
              canRun={engine !== null && packageArtifact !== null}
              stale={stale}
              presumedCount={Object.keys(goldenPackage.pkg.defaults).length}
              overriddenCount={Object.keys(goldenAnswers.refOverrides ?? {}).length}
              onOpenPresumptions={() => setPresumptionsOpen(true)}
            />
          ) : (
            <HouseholdPanel
              inputs={compiled?.inputs ?? []}
              answers={answers}
              onAnswer={(ref, value) => setAnswers((current) => ({ ...current, [ref]: value }))}
              month={month}
              onMonth={setMonth}
              outputs={outputs}
              selectedOutput={selectedOutput}
              onSelectOutput={setSelectedOutput}
              onRun={doRun}
              canRun={engine !== null && compiled !== null}
              stale={stale}
            />
          )}
          <DeterminationPanel
            run={run}
            runError={runError}
            stale={stale}
            compileMs={compiled?.compileMs ?? null}
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
