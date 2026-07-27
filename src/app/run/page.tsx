import type { Metadata } from "next";
import { CorpusExplorer } from "@/components/CorpusExplorer";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { Runner } from "@/components/Runner";

export const metadata: Metadata = {
  title: "Run — Axiom local",
  description:
    "Run any vendored program in your browser: the wasm engine executes the determination locally and the result downloads as JSON. No data leaves the page.",
};

export default function Run() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <Masthead
        page="run"
        thesis="The same engine, in this tab. Pick a program, state the facts, download the determination."
      />

      <section className="rise rise-2 mx-auto mt-10 max-w-4xl" aria-label="Run a determination">
        <p className="max-w-2xl text-[0.95rem] font-light leading-relaxed text-ink-secondary">
          This page loads the vendored WebAssembly engine and the same composed, hash-pinned
          artifacts the CLI runs. The determination is computed in your browser — no request
          carries your answers anywhere — and the JSON you download is the exact shape{" "}
          <code className="font-mono text-[0.82rem] text-ink">
            bun scripts/determine.mjs --json
          </code>{" "}
          prints.
        </p>

        <div className="mt-7">
          <Runner />
        </div>
      </section>

      <section className="rise rise-3 mx-auto mt-14 max-w-4xl" aria-label="Slice the corpus">
        <div className="double-rule pt-4" />
        <p className="smallcaps mb-3 mt-2 text-[0.62rem] text-ink-secondary">
          Or slice the graph — no bundle required
        </p>
        <p className="max-w-2xl text-[0.95rem] font-light leading-relaxed text-ink-secondary">
          The programs above are curated, parity-pinned compositions. Underneath them is the
          whole encoded corpus: every statute, regulation, and manual section is a target you
          can slice at directly. Search by rule name or citation, and the import closure is
          fetched, compiled to an artifact in this tab, and run — Colorado&apos;s ABAWD clock,
          New York&apos;s work requirements, a single deduction table. Same engine, same
          trace, your choice of root.
        </p>
        <div className="mt-7">
          <CorpusExplorer />
        </div>
      </section>

      <ProvenanceFooter />
    </div>
  );
}
