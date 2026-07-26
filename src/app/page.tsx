import Link from "next/link";
import index from "../../public/programs/index.json";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { Cmd, L, Record, dim, num, ok, pin } from "@/components/terminal";

/** Get started: from landing to a first run, transcript first. */
export default function Home() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <Masthead
        page="start"
        thesis="Statutes compiled to WebAssembly, determinations rendered on your machine — the law never needs a server."
      />

      {/* The hero is the thesis, demonstrated: law executing in a terminal. */}
      <section className="rise rise-2 mx-auto mt-10 max-w-3xl" aria-label="Get started">
        <Record caption="three commands, offline" aside="the record">
          <Cmd>git clone https://github.com/TheAxiomFoundation/axiom-playground</Cmd>
          <Cmd>cd axiom-playground && bun install</Cmd>
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

        <p className="mt-8 max-w-2xl text-[0.95rem] font-light text-ink-secondary">
          The repo is the distribution: the engine and every program artifact are checked in,
          hash-pinned. No Rust toolchain, no API key, nothing else to fetch. From here:
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Record caption="amend the law">
            <Cmd>bun scripts/determine.mjs \</Cmd>
            <L>{"    --what-if snap_earned_income_deduction_rate_for_net_income=0.3"}</L>
            <L>
              {dim("AMENDED LAW — hypothetical")}
            </L>
            <L>
              {"  snap_allotment    "}
              {num("532")}
            </L>
          </Record>
          <Record caption="switch programs">
            <Cmd>bun scripts/determine.mjs \</Cmd>
            <L>{"    --program fiit --set taxable_income=60000"}</L>
            <L />
            <L>
              {"  regular_tax_before_credits  "}
              {num("7912")}
            </L>
          </Record>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          <Link
            href="/example/"
            style={{ textDecoration: "none" }}
            className="panel block p-5 transition-colors hover:border-accent"
          >
            <p className="smallcaps text-[0.62rem] text-accent">worked example →</p>
            <p className="mt-2 text-[0.92rem] font-light text-ink-secondary">
              One household, start to finish: change the facts, amend the law, follow every
              citation, switch programs, integrate the JSON.
            </p>
          </Link>
          <Link
            href="/docs/"
            style={{ textDecoration: "none" }}
            className="panel block p-5 transition-colors hover:border-accent"
          >
            <p className="smallcaps text-[0.62rem] text-accent">reference →</p>
            <p className="mt-2 text-[0.92rem] font-light text-ink-secondary">
              Every flag, every program, presumption semantics, JSON shapes, and embedding
              the engine in your own software.
            </p>
          </Link>
        </div>
      </section>

      <section className="rise rise-3 mx-auto mt-14 max-w-3xl" aria-label="What ships">
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
                  <td className="px-3 py-2 text-right text-ink-secondary">
                    {program.rules} rules · {program.inputs} inputs
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono text-[0.65rem] text-ink-muted">
          full composed programs, one versioned artifact each · seventeen more in the pipeline
        </p>
      </section>

      <ProvenanceFooter />
    </div>
  );
}
