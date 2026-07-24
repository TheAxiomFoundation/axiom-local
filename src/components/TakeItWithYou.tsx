"use client";

import { PanelHeading } from "./PanelHeading";

/**
 * The exit ramps: where this page's capabilities live outside this page.
 * Three doors by audience. Doors tell the truth about what is not yet
 * released rather than linking somewhere that will 404 — binary releases
 * are pending the engine's first tagged release. The hosted API and MCP
 * are deliberately absent: they are not launch entry points.
 */
export function TakeItWithYou() {
  return (
    <section className="rise rise-4 mt-16" aria-label="Take it with you" id="take-it-with-you">
      <PanelHeading section="4" title="Take it with you" aside="the same rules, where you work" />

      <p className="mb-6 mt-1 text-[0.95rem] font-light text-ink-secondary">
        Everything this page just did — the rules, the determination, the cited trace — is
        available outside it. Pick your door.
      </p>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="panel flex flex-col p-5">
          <p className="smallcaps text-[0.62rem] text-accent">for readers</p>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">
            Read the law behind this
          </h3>
          <p className="mt-2 flex-1 text-[0.88rem] font-light text-ink-secondary">
            Every rule this page executed is browsable: the RuleSpec encoding side-by-side with
            the statute or regulation it encodes, searchable, with the citation graph — no
            sign-in, nothing to install.
          </p>
          <a
            className="mt-3 font-mono text-[0.72rem] text-accent underline-offset-2 hover:underline"
            href="https://app.axiom-foundation.org"
            target="_blank"
            rel="noreferrer"
          >
            app.axiom-foundation.org →
          </a>
        </div>

        <div className="panel flex flex-col p-5">
          <p className="smallcaps text-[0.62rem] text-accent">for engineers · works today</p>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">
            Run it on your machine
          </h3>
          <p className="mt-2 flex-1 text-[0.88rem] font-light text-ink-secondary">
            This repo is the local distribution: the engine (WebAssembly) and the composed,
            hash-pinned artifact are checked in. Clone it and the same determination runs in
            your terminal — offline, no Rust toolchain. Amend the law, override presumptions,
            print the citation trace.
          </p>
          <pre className="mt-3 overflow-x-auto bg-code-bg px-3 py-2 font-mono text-[0.7rem] text-code-text">
            {"git clone TheAxiomFoundation/axiom-playground\nbun install && bun scripts/determine.mjs"}
          </pre>
          <a
            className="mt-3 font-mono text-[0.72rem] text-accent underline-offset-2 hover:underline"
            href="https://github.com/TheAxiomFoundation/axiom-rules-engine"
            target="_blank"
            rel="noreferrer"
          >
            axiom-rules-engine →
          </a>
        </div>

        <div className="panel flex flex-col p-5">
          <p className="smallcaps text-[0.62rem] text-accent">for domain experts</p>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">
            Challenge the encoding
          </h3>
          <p className="mt-2 flex-1 text-[0.88rem] font-light text-ink-secondary">
            Every rule here is a reviewable YAML file with its citation, and every program
            carries parity cases against reference implementations. If this page computed your
            case wrong, that is a bug in the encoding of law — file it.
          </p>
          <a
            className="mt-3 font-mono text-[0.72rem] text-accent underline-offset-2 hover:underline"
            href="https://github.com/TheAxiomFoundation/rulespec-us/issues"
            target="_blank"
            rel="noreferrer"
          >
            rulespec-us issues →
          </a>
        </div>
      </div>
    </section>
  );
}
