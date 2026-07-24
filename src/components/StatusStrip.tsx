"use client";

import type { LoadedEngine } from "@/lib/wasm";

interface StatusStripProps {
  engine: LoadedEngine | null;
  engineError: string | null;
  networkCount: number;
}

export function StatusStrip({ engine, engineError, networkCount }: StatusStripProps) {
  return (
    <div className="rise rise-1 mt-9 border-y border-rule">
      <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-1.5 px-2 py-2.5 font-mono text-[0.65rem] tracking-[0.08em] text-ink-muted">
        <span className="border border-accent/50 px-2 py-0.5 text-accent">developer preview</span>
        <span className="flex items-center gap-2">
          <span
            className={`lamp-dot ${engineError ? "lamp-dot--warn" : ""}`}
            aria-hidden="true"
          />
          {engineError
            ? "engine failed to load"
            : engine
              ? "engine resident in this tab"
              : "instantiating engine…"}
        </span>
        {engine ? (
          <>
            <span>
              engine v{engine.engineVersion} · artifact format v{engine.artifactFormatVersion}
            </span>
            <span title={`sha-256 ${engine.wasmSha256}`}>
              wasm {(engine.wasmByteLength / 1024).toFixed(0)} KiB · sha-256{" "}
              {engine.wasmSha256.slice(0, 12)}…
            </span>
            <span className={networkCount === 0 ? "text-success" : "text-error"}>
              {networkCount} network request{networkCount === 1 ? "" : "s"} since engine ready
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}
