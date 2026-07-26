import Link from "next/link";
import index from "../../public/programs/index.json";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { SiteNav } from "@/components/SiteNav";
import { Cmd, Term, dim, num, ok } from "@/components/terminal";

/** The main page: the fastest path from landing to a first run. */
export default function Home() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <header className="rise pt-14 text-center sm:pt-20">
        <p className="smallcaps text-accent">The Axiom Foundation · executable law</p>
        <h1 className="mt-5 font-display text-6xl font-semibold tracking-tight text-ink sm:text-7xl">
          Axiom playground
        </h1>
        <p className="mx-auto mt-5 max-w-2xl font-body text-lg font-light italic text-ink-secondary">
          Statutes compiled to WebAssembly, determinations rendered on your machine — the law
          never needs a server.
        </p>
        <SiteNav current="start" />
        <div className="double-rule mx-auto mt-9 w-40" aria-hidden="true" />
      </header>

      <section className="rise rise-2 mx-auto mt-12 max-w-3xl" aria-label="Get started">
        <p className="smallcaps mb-2 text-[0.62rem] text-accent">
          get started · no rust toolchain · no api key · offline
        </p>
        <Term>
          <Cmd>git clone https://github.com/TheAxiomFoundation/axiom-playground</Cmd>
          <Cmd>cd axiom-playground && bun install</Cmd>
          <Cmd>bun scripts/determine.mjs</Cmd>
          {"\n"}
          {dim("Colorado SNAP — monthly allotment (us-co)\n")}
          {"  snap_allotment    "}
          <span className="border-b-2 border-code-keyword text-code-keyword">478</span>
          {"\n  snap_net_income   "}
          {num("226.5")}
          {"\n  snap_eligible     "}
          {ok("holds")}
        </Term>
        <p className="mt-2 font-mono text-[0.68rem] text-ink-muted">
          └─ a real determination through 319 rules of 7 USC, 7 CFR 273, and 10 CCR 2506-1 —
          $478 is pinned by this repo&apos;s tests and axiom-api&apos;s parity suite
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Term>
            <Cmd>bun scripts/determine.mjs --what-if \</Cmd>
            {"    snap_earned_income_deduction_rate_for_net_income=0.3\n"}
            {dim("AMENDED LAW — hypothetical\n")}
            {"  snap_allotment    "}
            {num("532")}
          </Term>
          <Term>
            <Cmd>bun scripts/determine.mjs --program fiit \</Cmd>
            {"    --set taxable_income=60000\n"}
            {"  regular_tax_before_credits  "}
            {num("7912")}
          </Term>
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
              Every command and flag, every program, presumption semantics, the JSON shapes,
              and embedding the engine in your own software.
            </p>
          </Link>
        </div>
      </section>

      <section className="rise rise-3 mx-auto mt-14 max-w-3xl" aria-label="What ships">
        <div className="double-rule pt-4" />
        <p className="smallcaps mb-3 mt-3 text-[0.62rem] text-ink-secondary">
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
          full composed programs — one versioned artifact each, sha-256 pinned · seventeen more
          are in the pipeline in the pre-provenance format
        </p>
      </section>

      <ProvenanceFooter />
    </div>
  );
}
