"use client";

import { IconFileUpload, IconRestore } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { guessRootTarget } from "@/lib/program";
import { PanelHeading } from "./PanelHeading";
import { YamlView } from "./YamlView";

interface ProgramPanelProps {
  modules: Record<string, string>;
  rootTarget: string;
  isExample: boolean;
  compileMs: number | null;
  compileError: string | null;
  onLoadProgram: (modules: Record<string, string>, rootTarget: string) => void;
  onRestoreExample: () => void;
  /** What the restore button offers — defaults to restoring the example. */
  restoreLabel?: string;
  /** Open the paste-your-own loader on first render. */
  loaderOpenInitially?: boolean;
}

function parseModulesJson(text: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object mapping canonical targets to RuleSpec YAML text.");
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) throw new Error("The module map is empty.");
  for (const [target, yaml] of entries) {
    if (typeof yaml !== "string") {
      throw new Error(`The value for "${target}" must be a YAML string.`);
    }
  }
  return parsed as Record<string, string>;
}

export function ProgramPanel({
  modules,
  rootTarget,
  isExample,
  compileMs,
  compileError,
  onLoadProgram,
  onRestoreExample,
  restoreLabel = "Restore the example",
  loaderOpenInitially = false,
}: ProgramPanelProps) {
  const targets = Object.keys(modules);
  const [activeTarget, setActiveTarget] = useState(targets[0]);
  const [loaderOpen, setLoaderOpen] = useState(loaderOpenInitially);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shownTarget = targets.includes(activeTarget) ? activeTarget : targets[0];

  function applyDraft(text: string) {
    try {
      const parsed = parseModulesJson(text);
      const root = guessRootTarget(parsed);
      setLoadError(null);
      setActiveTarget(root);
      onLoadProgram(parsed, root);
      setLoaderOpen(false);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setDraft(text);
    applyDraft(text);
  }

  return (
    <section className="rise rise-2" aria-label="The statutes" id="program-panel">
      <PanelHeading
        section="1"
        title="The statutes"
        aside={
          compileMs !== null
            ? `${targets.length} module${targets.length === 1 ? "" : "s"} · compiled in ${compileMs.toFixed(1)} ms`
            : `${targets.length} module${targets.length === 1 ? "" : "s"}`
        }
      />

      <p className="mb-4 mt-1 text-[0.95rem] font-light text-parchment-dim">
        {isExample ? (
          <>
            The same federal and state SNAP module pair the engine&apos;s own test suite runs: a
            USDA maximum-allotment table, and a state rule that imports it. Each rule keeps a
            durable legal id, so the trace below can cite its way back to the statute.
          </>
        ) : (
          <>
            A program you loaded. Compilation happened in this tab — the module text was read,
            compiled, and retained entirely in memory on this page.
          </>
        )}
      </p>

      <div className="panel">
        <div className="flex flex-wrap border-b border-rule" role="tablist" aria-label="Modules">
          {targets.map((target) => {
            const active = target === shownTarget;
            return (
              <button
                key={target}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTarget(target)}
                className={`max-w-full truncate border-r border-rule px-4 py-2.5 font-mono text-[0.72rem] tracking-wide transition-colors ${
                  active
                    ? "bg-ink-well text-brass"
                    : "text-faint hover:bg-ink-well/50 hover:text-parchment-dim"
                }`}
                title={target}
              >
                {target}
                {target === rootTarget ? <span className="ml-2 text-wax-bright">root</span> : null}
              </button>
            );
          })}
        </div>
        <div className="well border-0">
          <YamlView yaml={modules[shownTarget] ?? ""} />
        </div>
      </div>

      {compileError ? (
        <div className="mt-4 border-l-2 border-wax bg-wax/10 px-4 py-3">
          <p className="smallcaps text-wax-bright">Objection — compile failed</p>
          <p className="mt-1 font-mono text-[0.8rem] text-parchment-dim">{compileError}</p>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="flex items-center gap-3">
          <button
            className="btn-quiet flex items-center gap-2 px-3 py-1.5 font-mono text-[0.72rem] tracking-wide"
            onClick={() => setLoaderOpen((open) => !open)}
            aria-expanded={loaderOpen}
          >
            <IconFileUpload size={14} aria-hidden="true" />
            Load your own program
          </button>
          <button
            className="btn-quiet flex items-center gap-2 px-3 py-1.5 font-mono text-[0.72rem] tracking-wide"
            onClick={() => {
              setLoadError(null);
              onRestoreExample();
            }}
          >
            <IconRestore size={14} aria-hidden="true" />
            {restoreLabel}
          </button>
        </div>

        {loaderOpen ? (
          <div className="mt-3 space-y-3 border border-rule bg-ink-raised p-4">
            <p className="text-[0.85rem] font-light text-parchment-dim">
              Paste (or upload) a JSON object mapping canonical targets to RuleSpec YAML, the
              exact shape <code className="font-mono text-[0.78rem] text-brass">compile</code>{" "}
              receives:{" "}
              <code className="font-mono text-[0.78rem] text-parchment">
                {'{"us:policies/...": "format: rulespec/v1\\n..."}'}
              </code>
              . It is compiled here, in this tab.
            </p>
            <textarea
              className="field min-h-36 w-full resize-y text-[0.78rem]"
              placeholder='{"jurisdiction:path/to/module": "format: rulespec/v1\n…"}'
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              spellCheck={false}
            />
            {loadError ? (
              <p className="font-mono text-[0.78rem] text-wax-bright">{loadError}</p>
            ) : null}
            <div className="flex items-center gap-3">
              <button
                className="btn-wax px-4 py-1.5 font-mono text-[0.72rem] tracking-wide"
                onClick={() => applyDraft(draft)}
              >
                Compile program
              </button>
              <button
                className="btn-quiet px-3 py-1.5 font-mono text-[0.72rem] tracking-wide"
                onClick={() => fileRef.current?.click()}
              >
                Upload .json
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(event) => onFile(event.target.files?.[0])}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
