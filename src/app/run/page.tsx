import type { Metadata } from "next";
import { CorpusExplorer } from "@/components/CorpusExplorer";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";

export const metadata: Metadata = {
  title: "Explore the graph — Axiom local",
  description:
    "Search every encoded rule in the RuleSpec corpus, slice at any statute or regulation, and run it — compiled and executed in your browser. No data leaves the page.",
};

/**
 * The graph page. Running the cataloged programs lives on the landing page;
 * this page is what the catalog cannot do: slice the corpus anywhere.
 */
export default function Explore() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <Masthead
        page="run"
        thesis="The whole encoded corpus, sliceable. Search a rule, compile its closure in this tab, run it."
      />

      <section className="rise rise-2 mx-auto mt-10 max-w-4xl" aria-label="Slice the corpus">
        <p className="max-w-2xl text-[0.95rem] font-light leading-relaxed text-ink-secondary">
          The programs on the front page are curated, parity-pinned compositions. Underneath
          them is the whole encoded corpus: every statute, regulation, and manual section is a
          target you can slice at directly. Search by rule name or citation and the import
          closure is fetched, compiled to an artifact in this tab, and run —
          Colorado&apos;s ABAWD clock, New York&apos;s work requirements, a single deduction
          table. Same engine, same trace, your choice of root. Slices are valid and cited but
          not parity-pinned; the provenance line says which corpus commit they came from.
        </p>

        <div className="mt-7">
          <CorpusExplorer />
        </div>
      </section>

      <ProvenanceFooter />
    </div>
  );
}
