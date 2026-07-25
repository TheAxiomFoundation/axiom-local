"use client";

/**
 * The conversion moment, front and center: this repo IS the local
 * distribution — the wasm engine and the hash-pinned artifacts are checked
 * in, so a clone runs everything you see on this page from a terminal,
 * offline. Engineers should not have to scroll to the footer to learn that.
 */
export function RunItLocally() {
  return (
    <div className="panel mt-4 p-5" id="run-it-locally">
      <p className="smallcaps text-[0.62rem] text-accent">for engineers · works today</p>
      <h3 className="mt-2 font-display text-lg font-semibold text-ink">Run it on your machine</h3>
      <p className="mt-2 text-[0.88rem] font-light text-ink-secondary">
        This repo is the local distribution: the engine (WebAssembly) and every composed,
        hash-pinned artifact are checked in. Clone it and these same determinations run in your
        terminal — offline, no Rust toolchain.
      </p>
      <pre className="mt-3 overflow-x-auto bg-code-bg px-3 py-2.5 font-mono text-[0.72rem] leading-relaxed text-code-text">
        {"git clone https://github.com/TheAxiomFoundation/axiom-playground\ncd axiom-playground && bun install\nbun scripts/determine.mjs        # this page's determination, offline"}
      </pre>
      <p className="mt-3 text-[0.85rem] font-light text-ink-secondary">
        Amend the law, override presumptions, print the citation trace:
      </p>
      <pre className="mt-2 overflow-x-auto bg-code-bg px-3 py-2.5 font-mono text-[0.72rem] leading-relaxed text-code-text">
        {"bun scripts/determine.mjs --programs\nbun scripts/determine.mjs --program fiit --set taxable_income=120000\nbun scripts/determine.mjs --what-if <parameter>=<value>\nbun scripts/determine.mjs --trace"}
      </pre>
      <p className="mt-3 font-mono text-[0.72rem]">
        <a
          href="https://github.com/TheAxiomFoundation/axiom-playground"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          axiom-playground →
        </a>
        <span className="text-ink-muted"> · </span>
        <a
          href="https://github.com/TheAxiomFoundation/axiom-rules-engine"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          axiom-rules-engine →
        </a>
      </p>
    </div>
  );
}
