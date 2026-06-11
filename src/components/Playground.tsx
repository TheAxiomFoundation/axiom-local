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
import { buildDisplayTree } from "@/lib/trace";
import { loadEngine, type LoadedEngine } from "@/lib/wasm";
import { useNetworkSentinel } from "@/lib/useNetworkSentinel";
import { DeterminationPanel, type RunRecord } from "./DeterminationPanel";
import { HouseholdPanel } from "./HouseholdPanel";
import { ProgramPanel } from "./ProgramPanel";
import { ProvenanceFooter } from "./ProvenanceFooter";
import { StatusStrip } from "./StatusStrip";

interface ProgramState {
  modules: Record<string, string>;
  rootTarget: string;
  isExample: boolean;
}

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

  const [program, setProgram] = useState<ProgramState>({
    modules: EXAMPLE_MODULES,
    rootTarget: EXAMPLE_ROOT_TARGET,
    isExample: true,
  });
  const [compiled, setCompiled] = useState<CompiledState | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [month, setMonth] = useState(EXAMPLE_DEFAULT_MONTH);
  const [selectedOutput, setSelectedOutput] = useState<string>("");

  const [run, setRun] = useState<RunRecord | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runKey, setRunKey] = useState<string>("");

  const networkCount = useNetworkSentinel(engine !== null);

  // --- engine -------------------------------------------------------------

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
    return () => {
      cancelled = true;
    };
  }, []);

  // --- compile (once per program, cached until the program changes) --------

  useEffect(() => {
    if (!engine) return;
    setRun(null);
    setRunError(null);
    try {
      const startedAt = performance.now();
      const artifactJson = engine.compile(JSON.stringify(program.modules), program.rootTarget);
      const compileMs = performance.now() - startedAt;
      const artifact = JSON.parse(artifactJson) as CompiledProgramArtifact;
      const inputs = discoverInputs(artifact);
      setCompiled({ artifactJson, artifact, compileMs, inputs });
      setCompileError(null);
      setAnswers(defaultAnswers(inputs, program.isExample));
      const rootDerived = artifact.program.derived.filter(
        (derived) => moduleOf(derived.id) === program.rootTarget,
      );
      const preferred =
        rootDerived[rootDerived.length - 1] ??
        artifact.program.derived[artifact.program.derived.length - 1];
      setSelectedOutput(preferred?.id ?? preferred?.name ?? "");
    } catch (error) {
      setCompiled(null);
      setCompileError(error instanceof Error ? error.message : String(error));
    }
  }, [engine, program]);

  // --- run ------------------------------------------------------------------

  const currentKey = useMemo(
    () => JSON.stringify({ answers, month, selectedOutput }),
    [answers, month, selectedOutput],
  );

  const sequenceRef = useRef(0);

  const doRun = useCallback(() => {
    if (!engine || !compiled || !selectedOutput) return;
    try {
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
      setRunError(null);
      setRunKey(JSON.stringify({ answers, month, selectedOutput }));
    } catch (error) {
      setRun(null);
      setRunError(error instanceof Error ? error.message : String(error));
    }
  }, [engine, compiled, selectedOutput, answers, month]);

  // Auto-run the example once, so the page lands already alive.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current || !engine || !compiled || !program.isExample || !selectedOutput) {
      return;
    }
    autoRanRef.current = true;
    doRun();
  }, [engine, compiled, program.isExample, selectedOutput, doRun]);

  // --- handlers --------------------------------------------------------------

  const onLoadProgram = useCallback((modules: Record<string, string>, rootTarget: string) => {
    setProgram({ modules, rootTarget, isExample: false });
  }, []);

  const onRestoreExample = useCallback(() => {
    autoRanRef.current = false;
    setProgram({
      modules: EXAMPLE_MODULES,
      rootTarget: EXAMPLE_ROOT_TARGET,
      isExample: true,
    });
    setMonth(EXAMPLE_DEFAULT_MONTH);
  }, []);

  const stale = run !== null && currentKey !== runKey;

  const outputs = compiled?.artifact.program.derived ?? [];

  return (
    <>
      <StatusStrip engine={engine} engineError={engineError} networkCount={networkCount} />

      {engineError ? (
        <div className="mx-auto mt-10 max-w-2xl border-l-2 border-wax bg-wax/10 px-4 py-3">
          <p className="smallcaps text-wax-bright">The engine could not be instantiated</p>
          <p className="mt-1 font-mono text-[0.8rem] text-parchment-dim">{engineError}</p>
        </div>
      ) : null}

      <main className="mt-12 grid gap-14 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5">
          <ProgramPanel
            modules={program.modules}
            rootTarget={program.rootTarget}
            isExample={program.isExample}
            compileMs={compiled?.compileMs ?? null}
            compileError={compileError}
            onLoadProgram={onLoadProgram}
            onRestoreExample={onRestoreExample}
          />
        </div>
        <div className="space-y-14 lg:col-span-7">
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
          <DeterminationPanel
            run={run}
            runError={runError}
            stale={stale}
            compileMs={compiled?.compileMs ?? null}
            engineReady={engine !== null}
          />
        </div>
      </main>

      <ProvenanceFooter engine={engine} networkCount={networkCount} />
    </>
  );
}
