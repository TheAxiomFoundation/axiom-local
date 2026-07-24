"use client";

import upstream from "../../engine/UPSTREAM.json";
import type { LoadedEngine } from "@/lib/wasm";

interface ProvenanceFooterProps {
  engine: LoadedEngine | null;
  networkCount: number;
}

export function ProvenanceFooter({ engine, networkCount }: ProvenanceFooterProps) {
  return (
    <footer className="rise rise-5 mt-16">
      <div className="double-rule pt-5" />

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="smallcaps mb-3 text-[0.65rem] text-ink-secondary">
            Computed locally — nothing left this page
          </h2>
          <p className="text-[0.92rem] font-light text-ink-secondary">
            The RuleSpec compiler and evaluator run as WebAssembly inside this tab. The statute
            text, the compiled artifact, your answers, and the verdict all live and die in this
            page&apos;s memory. There is no calculation API. There is nothing to subpoena.
          </p>
          <div className="mt-4 border border-rule bg-paper-elevated px-4 py-3">
            <p className="smallcaps text-[0.62rem] text-accent">Verify the claim</p>
            <p className="mt-1.5 text-[0.88rem] font-light text-ink-secondary">
              Open your browser&apos;s developer tools and watch the network tab. After the page
              loads, run as many determinations as you like — no request leaves this machine.
              The counter above reads the browser&apos;s own resource timeline:{" "}
              <span className={`font-mono text-[0.8rem] ${networkCount === 0 ? "text-success" : "text-error"}`}>
                {networkCount} since the engine came up
              </span>
              .
            </p>
          </div>
        </div>

        <div>
          <h2 className="smallcaps mb-3 text-[0.65rem] text-ink-secondary">Provenance</h2>
          <dl className="space-y-1.5 font-mono text-[0.72rem]">
            <div className="flex items-baseline">
              <dt className="text-ink-muted">engine_version()</dt>
              <span className="leader" aria-hidden="true" />
              <dd className="text-ink">{engine ? engine.engineVersion : "—"}</dd>
            </div>
            <div className="flex items-baseline">
              <dt className="text-ink-muted">artifact_format_version()</dt>
              <span className="leader" aria-hidden="true" />
              <dd className="text-ink">{engine ? engine.artifactFormatVersion : "—"}</dd>
            </div>
            <div className="flex items-baseline">
              <dt className="text-ink-muted">wasm sha-256</dt>
              <span className="leader" aria-hidden="true" />
              <dd
                className="max-w-[14rem] truncate text-ink"
                title={engine?.wasmSha256 ?? undefined}
              >
                {engine ? engine.wasmSha256 : "—"}
              </dd>
            </div>
            <div className="flex items-baseline">
              <dt className="text-ink-muted">built from</dt>
              <span className="leader" aria-hidden="true" />
              <dd className="text-ink">
                <a
                  href={`${upstream.repo}/commit/${upstream.commit}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  axiom-rules-engine@{upstream.commit.slice(0, 7)}
                </a>
              </dd>
            </div>
          </dl>

          <p className="mt-5 text-[0.85rem] font-light text-ink-secondary">
            Source:{" "}
            <a
              href="https://github.com/TheAxiomFoundation/axiom-playground"
              target="_blank"
              rel="noreferrer"
            >
              TheAxiomFoundation/axiom-playground
            </a>{" "}
            · engine:{" "}
            <a href={upstream.repo} target="_blank" rel="noreferrer">
              axiom-rules-engine
            </a>{" "}
            (Apache-2.0)
          </p>
          <p className="mt-2 text-[0.8rem] font-light italic text-ink-muted">
            Type set in Geist &amp; Geist Mono — self-hosted, like everything
            else here.
          </p>
        </div>
      </div>
    </footer>
  );
}
