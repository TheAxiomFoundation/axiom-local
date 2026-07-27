import Link from "next/link";
import index from "../../public/programs/index.json";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { Runner } from "@/components/Runner";
import { Cmd, L, Record, dim, num, ok, pin } from "@/components/terminal";

/** Get started: from landing to a first run, transcript first. */
export default function Home() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <Masthead
        page="start"
        thesis="Statutes compiled to WebAssembly, determinations rendered on your machine."
      />

      {/* The hero IS the product: the runner, executing in this tab. The
          terminal path and the catalog come after. */}
      <section className="rise rise-2 mx-auto mt-10 max-w-4xl" aria-label="Run a determination">
        <p className="max-w-2xl text-[0.95rem] font-light leading-relaxed text-ink-secondary">
          The engine is WebAssembly on this page. Pick a program, state the facts, run — the
          determination is computed in your tab and your answers never leave it. Every input
          the program reads is visible below the headline questions, presumed and editable.
        </p>
        <div className="mt-6">
          <Runner />
        </div>
        <Link
          href="/run/"
          style={{ textDecoration: "none" }}
          className="panel mt-6 block p-5 transition-colors hover:border-accent"
        >
          <p className="smallcaps text-[0.62rem] text-accent">explore the graph →</p>
          <p className="mt-2 max-w-2xl text-[0.92rem] font-light text-ink-secondary">
            Beyond the cataloged programs: search every encoded rule — Colorado&apos;s ABAWD
            clock, New York&apos;s work requirements — and compile any citation into a
            runnable slice, in this tab.
          </p>
        </Link>
      </section>

      <section className="rise rise-2 mx-auto mt-14 max-w-4xl" aria-label="In your terminal">
        <div className="double-rule pt-4" />
        <p className="smallcaps mb-3 mt-2 text-[0.62rem] text-ink-secondary">
          Or in your terminal
        </p>
        <Record caption="three commands, offline" aside="the record">
          <Cmd>git clone https://github.com/TheAxiomFoundation/axiom-local</Cmd>
          <Cmd>cd axiom-local && bun install</Cmd>
          <Cmd>bun scripts/determine.mjs</Cmd>
          <L />
          <L>{dim("Colorado SNAP — monthly allotment (us-co)")}</L>
          <L>
            {"  snap_allotment    "}
            {pin("478")}
          </L>
          <L>
            {"  snap_net_income   "}
            {num("226.5")}
          </L>
          <L>
            {"  snap_eligible     "}
            {ok("holds")}
          </L>
        </Record>
        <p className="mt-2 font-mono text-[0.68rem] text-ink-muted">
          └─ 319 rules of 7 USC, 7 CFR 273, and 10 CCR 2506-1, executed locally — $478 is
          pinned by this repo&apos;s tests and axiom-api&apos;s parity suite
        </p>

        <p className="mt-9 max-w-2xl text-[0.95rem] font-light leading-relaxed text-ink-secondary">
          The repo is the distribution: the engine and every program artifact are checked in,
          hash-pinned. No Rust toolchain, no API key, nothing else to fetch. From here, the
          same command does everything:
        </p>

        <div className="mt-4">
          <Record caption="from here">
            <Cmd>
              bun scripts/determine.mjs --set assistance_payments=500
              {dim("   # change the facts")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --what-if {"<parameter>"}={"<value>"}
              {dim("  # amend the law")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --trace
              {dim("                        # follow the citations")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --program fiit
              {dim("                # switch programs")}
            </Cmd>
            <Cmd>
              bun scripts/determine.mjs --json
              {dim("                         # integrate")}
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
              Every flag, every program, presumption semantics, JSON shapes, and embedding
              the engine in your own software.
            </p>
          </Link>
          <Link
            href="/example/"
            style={{ textDecoration: "none" }}
            className="panel block p-5 transition-colors hover:border-accent"
          >
            <p className="smallcaps text-[0.62rem] text-accent">example →</p>
            <p className="mt-2 text-[0.92rem] font-light text-ink-secondary">
              One household, start to finish: change the facts, amend the law, follow every
              citation, switch programs, integrate the JSON.
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
              {index.programs.map((program) => (
                <tr key={program.id} className="border-b border-rule-subtle last:border-0">
                  <td className="px-3 py-2 text-ink">{program.id}</td>
                  <td className="px-3 py-2 text-ink-muted">{program.jurisdiction}</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {program.provenance === "envelope" ? (
                      <span className="text-success">envelope</span>
                    ) : (
                      "legacy"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-ink-secondary">
                    {program.rules} rules · {program.inputs} inputs
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ProvenanceFooter />
    </div>
  );
}
