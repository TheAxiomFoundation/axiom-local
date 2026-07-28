import Link from "next/link";
import { CorpusExplorer } from "@/components/CorpusExplorer";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { Cmd, L, Record, dim, num, ok, pin } from "@/components/terminal";
import corpusLock from "../../corpus.lock.json";

/** Get started: from landing to a first run, transcript first. */
export default function Home() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <Masthead
        page="start"
        thesis="Statutes compiled to WebAssembly, determinations rendered on your machine."
      />

      {/* The hero IS the product: the subtree explorer, executing in this
          tab. The terminal path comes after. */}
      <section className="rise rise-2 mx-auto mt-10 max-w-4xl" aria-label="Run a determination">
        <p className="max-w-2xl text-[0.95rem] font-light leading-relaxed text-ink-secondary">
          The engine is WebAssembly on this page, and the corpus subtree is the unit: every
          statute, regulation, and manual section is a root you can slice at. Pick one — its
          import closure compiles to an artifact in this tab and runs. State the facts you
          know; everything you don&apos;t state is a screening presumption you can open and
          correct. Your answers never leave the page. Every slice wears its certification
          status — &quot;certified&quot; when the ledger vouches for its full closure,
          &quot;encoded — not certified&quot; otherwise.
        </p>
        <div className="mt-6">
          <CorpusExplorer />
        </div>
      </section>

      <section className="rise rise-2 mx-auto mt-14 max-w-4xl" aria-label="In your terminal">
        <div className="double-rule pt-4" />
        <p className="smallcaps mb-3 mt-2 text-[0.62rem] text-ink-secondary">
          Or in your terminal
        </p>
        <Record caption="the 7 CFR 273.10 subtree, offline" aside="the record">
          <Cmd>git clone https://github.com/TheAxiomFoundation/axiom-local</Cmd>
          <Cmd>cd axiom-local && bun install && bun scripts/build-corpus.mjs ../rulespec-us</Cmd>
          <Cmd>
            bun scripts/determine.mjs --set household_size=2 --set
            snap_gross_monthly_earned_income=1200 --set snap_total_allowable_shelter_expenses=900
          </Cmd>
          <L />
          <L>{dim("us:regulations/7-cfr/273/10")}</L>
          <L>{dim("4 modules · 17 rules · 34 parameters — compiled and executed locally")}</L>
          <L>{dim("encoded — not certified")}</L>
          <L>
            {"  snap_net_monthly_income   "}
            {num("226")}
          </L>
          <L>
            {"  snap_monthly_allotment    "}
            {pin("478")}
          </L>
          <L>
            {"  …"}
            {ok("")}
          </L>
        </Record>
        <p className="mt-2 font-mono text-[0.68rem] text-ink-muted">
          └─ the SNAP benefit computation of 7 CFR 273.10, sliced straight from the corpus
          and executed by the vendored engine — $478 for this household is pinned by this
          repo&apos;s tests
        </p>

        <p className="mt-9 max-w-2xl text-[0.95rem] font-light leading-relaxed text-ink-secondary">
          The repo is the distribution: the engine is checked in, and the corpus is
          regenerated from the pinned commit. No Rust toolchain, no API key, no network at
          run time. From here, the same command does everything:
        </p>

        <div className="mt-4">
          <Record caption="from here">
            <Cmd>
              bun scripts/determine.mjs --roots snap
              {dim("        # the subtree catalog")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --root {"<target>"}
              {dim("   # slice any subtree")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --set {"<slot>"}={"<value>"}
              {dim("  # state a fact")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --what-if {"<parameter>"}={"<value>"}
              {dim("  # amend the law")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --trace
              {dim("            # follow the citations")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --json
              {dim("             # integrate")}
            </Cmd>
          </Record>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <Link
            href="/docs/"
            style={{ textDecoration: "none" }}
            className="panel block p-5 transition-colors hover:border-accent"
          >
            <p className="smallcaps text-[0.62rem] text-accent">references →</p>
            <p className="mt-2 text-[0.92rem] font-light text-ink-secondary">
              Every flag, the subtree model, presumption semantics, JSON shapes, and
              embedding the engine in your own software.
            </p>
          </Link>
          <Link
            href="/example/"
            style={{ textDecoration: "none" }}
            className="panel block p-5 transition-colors hover:border-accent"
          >
            <p className="smallcaps text-[0.62rem] text-accent">example →</p>
            <p className="mt-2 text-[0.92rem] font-light text-ink-secondary">
              One household, start to finish: slice a regulation, change the facts, amend
              the law, follow every citation, integrate the JSON.
            </p>
          </Link>
        </div>
      </section>

      <section className="rise rise-3 mx-auto mt-14 max-w-4xl" aria-label="What ships">
        <div className="double-rule pt-4" />
        <p className="smallcaps mb-3 mt-2 text-[0.62rem] text-ink-secondary">
          What ships in the clone
        </p>
        <div className="panel overflow-x-auto">
          <table className="w-full font-mono text-[0.72rem]">
            <tbody>
              <tr className="border-b border-rule-subtle">
                <td className="px-3 py-2 text-ink">engine/</td>
                <td className="px-3 py-2 text-ink-muted">
                  the RuleSpec compiler + evaluator, WebAssembly, browser and Node builds
                </td>
              </tr>
              <tr className="border-b border-rule-subtle">
                <td className="px-3 py-2 text-ink">public/corpus/</td>
                <td className="px-3 py-2 text-ink-muted">
                  the sliceable corpus — regenerated from{" "}
                  {corpusLock.sources[0]?.repo ?? "the pinned checkout"}@
                  {(corpusLock.sources[0]?.commit ?? "").slice(0, 7)} (corpus.lock.json)
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-ink">public/corpus/ledger.json</td>
                <td className="px-3 py-2 text-ink-muted">
                  the certification ledger ({corpusLock.ledger.ledger_id}) — the status
                  authority every slice is checked against
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 max-w-2xl text-[0.88rem] font-light text-ink-secondary">
          There is no program registry and no pre-composed bundle: the subtree is the unit,
          and what runs is exactly what the corpus says, compiled on your machine.
        </p>
      </section>

      <ProvenanceFooter />
    </div>
  );
}
