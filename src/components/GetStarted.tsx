import type { ReactNode } from "react";
import index from "../../public/programs/index.json";

/**
 * The page is a replayed terminal session, annotated in the margin like a
 * marked-up filing: six docket entries down one rail, from clone to
 * building on the engine. Every number in the transcripts is real — the
 * same outputs the CLI prints, pinned by this repo's tests.
 */

function Step({
  number,
  title,
  note,
  children,
}: {
  number: string;
  title: string;
  note: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="relative pb-12 pl-8 last:pb-2 sm:pl-10">
      {/* docket marker on the rail */}
      <span
        className="absolute -left-[15px] top-0 flex h-[30px] w-[30px] items-center justify-center border border-accent bg-paper font-mono text-[0.72rem] text-accent"
        aria-hidden="true"
      >
        {number}
      </span>
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
          <div className="mt-2 text-[0.92rem] font-light leading-relaxed text-ink-secondary">
            {note}
          </div>
        </div>
        <div className="min-w-0 lg:col-span-8">{children}</div>
      </div>
    </li>
  );
}

function Term({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap bg-code-bg px-4 py-3.5 font-mono text-[0.78rem] leading-[1.7] text-code-text [overflow-wrap:anywhere]">
      {children}
    </pre>
  );
}

/** A command line: muted prompt, bright command. */
function Cmd({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="select-none text-code-comment">$ </span>
      <span>{children}</span>
      {"\n"}
    </>
  );
}

const num = (value: string) => <span className="text-code-number">{value}</span>;
const ok = (value: string) => <span className="text-code-function">{value}</span>;
const id = (value: string) => <span className="text-code-attribute">{value}</span>;
const dim = (value: string) => <span className="text-code-comment">{value}</span>;
const kw = (value: string) => <span className="text-code-keyword">{value}</span>;

export function GetStarted() {
  return (
    <section className="rise rise-2 mt-16" aria-label="Run it on your machine" id="get-started">
      <p className="mx-auto max-w-2xl text-center text-[1.02rem] font-light text-ink-secondary">
        Six commands from clone to building on the engine. The transcripts below are real — the
        same outputs your machine will print, pinned by this repo&apos;s tests.
      </p>

      <ol className="mx-auto mt-12 max-w-4xl list-none border-l border-rule-strong">
        <Step
          number="01"
          title="Clone it"
          note={
            <p>
              The repo is the distribution: the engine (WebAssembly) and every composed,
              hash-pinned program artifact are checked in. Nothing else to fetch — no Rust
              toolchain, no API key, works offline.
            </p>
          }
        >
          <Term>
            <Cmd>git clone https://github.com/TheAxiomFoundation/axiom-playground</Cmd>
            <Cmd>cd axiom-playground && bun install</Cmd>
          </Term>
        </Step>

        <Step
          number="02"
          title="Run a determination"
          note={
            <p>
              Colorado SNAP for a family of two — the full composed program: 319 rules from
              7&nbsp;USC, 7&nbsp;CFR&nbsp;273, and 10&nbsp;CCR&nbsp;2506-1, executed on your
              machine.
            </p>
          }
        >
          <Term>
            <Cmd>bun scripts/determine.mjs</Cmd>
            {"\n"}
            {dim("Colorado SNAP — monthly allotment (us-co)\n")}
            {dim("period 2026-01-01\n")}
            {"  household_size = "}
            {num("2")}
            {"\n  snap_countable_earned_income = "}
            {num("1200")}
            {"\n  household_shelter_costs_incurred = "}
            {num("900")}
            {"\n  member_age = "}
            {num("42, 9")}
            {"\n\n  snap_allotment    "}
            <span className="border-b-2 border-code-keyword text-code-keyword">478</span>
            {"\n  snap_net_income   "}
            {num("226.5")}
            {"\n  snap_eligible     "}
            {ok("holds")}
          </Term>
          <p className="mt-2 font-mono text-[0.68rem] text-ink-muted">
            └─ $478 is pinned here and by axiom-api&apos;s parity suite — if your machine
            disagrees, that is a bug with a reproduction
          </p>
        </Step>

        <Step
          number="03"
          title="Change the facts"
          note={
            <p>
              Every input is yours to set. The ones you don&apos;t carry declared screening
              presumptions — list them all with{" "}
              <code className="font-mono text-[0.82rem] text-ink">--slots</code>.
            </p>
          }
        >
          <Term>
            <Cmd>bun scripts/determine.mjs --set assistance_payments=500</Cmd>
            {"\n  snap_allotment    "}
            {num("253")}
            {"\n  snap_net_income   "}
            {num("976.5")}
            {"\n  snap_eligible     "}
            {ok("holds")}
          </Term>
        </Step>

        <Step
          number="04"
          title="Amend the law"
          note={
            <p>
              The program is data. Raise the earned-income deduction from 20% to 30% and the
              same family&apos;s allotment moves — labeled hypothetical, current law untouched.
            </p>
          }
        >
          <Term>
            <Cmd>
              bun scripts/determine.mjs --what-if
              snap_earned_income_deduction_rate_for_net_income=0.3
            </Cmd>
            {"\n"}
            {kw("AMENDED LAW")}
            {dim(" (current law: 0.2) — hypothetical\n")}
            {"\n  snap_allotment    "}
            {num("532")}
            {"\n  snap_net_income   "}
            {num("166.5")}
          </Term>
        </Step>

        <Step
          number="05"
          title="Follow the citations"
          note={
            <p>
              Every figure carries the durable legal id of the rule that produced it — the
              engine&apos;s explain trace, not a reconstruction.
            </p>
          }
        >
          <Term>
            <Cmd>bun scripts/determine.mjs --trace</Cmd>
            {"\n  snap_allotment = "}
            {num("$478")}
            {"  "}
            {id("us-co:regulations/10-ccr-2506-1/4.207.2#snap_allotment")}
            {"\n    snap_eligible = "}
            {ok("holds")}
            {"  "}
            {id("us-co:policies/cdhs/snap/fy-2026-benefit-calculation#snap_eligible")}
            {"\n    snap_monthly_allotment = "}
            {num("$478")}
            {"  "}
            {id("us:regulations/7-cfr/273/10#snap_monthly_allotment")}
            {"\n    "}
            {dim("… 319 rules deep, every one cited")}
          </Term>
        </Step>

        <Step
          number="06"
          title="Build on it"
          note={
            <p>
              The engine ships to npm — browser and Node targets, no vendoring. This
              repo&apos;s <code className="font-mono text-[0.82rem] text-ink">src/lib/</code> is
              the reference for request building and trace reconstruction.
            </p>
          }
        >
          <Term>
            <Cmd>npm install @axiom-foundation/rules-engine-wasm</Cmd>
            {"\n"}
            {dim("// browsers and bundlers\n")}
            {"import init, { execute } from "}
            {id('"@axiom-foundation/rules-engine-wasm"')}
            {";\n\n"}
            {dim("// node\n")}
            {"const engine = require("}
            {id('"@axiom-foundation/rules-engine-wasm/node"')}
            {");"}
          </Term>
        </Step>
      </ol>

      <div className="mx-auto mt-14 max-w-4xl">
        <div className="double-rule pt-4" />
        <p className="smallcaps mb-3 text-[0.62rem] text-ink-secondary">What ships in the clone</p>
        <div className="panel overflow-x-auto">
          <table className="w-full font-mono text-[0.72rem]">
            <thead>
              <tr className="border-b border-rule text-left text-ink-muted">
                <th className="px-3 py-2 font-normal">program</th>
                <th className="px-3 py-2 text-right font-normal">rules</th>
                <th className="px-3 py-2 text-right font-normal">inputs</th>
              </tr>
            </thead>
            <tbody>
              {index.programs.map((program) => (
                <tr key={program.id} className="border-b border-rule-subtle last:border-0">
                  <td className="px-3 py-2 text-ink" title={program.title}>
                    {program.id}
                    <span className="ml-2 text-ink-muted">{program.jurisdiction}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-ink-secondary">{program.rules}</td>
                  <td className="px-3 py-2 text-right text-ink-secondary">{program.inputs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 font-mono text-[0.65rem] text-ink-muted">
          each: one versioned compiled artifact, sha-256 pinned, screening presumptions declared
          ·{" "}
          <span className="text-ink-secondary">
            bun scripts/determine.mjs --program &lt;id&gt;
          </span>
        </p>
        <p className="mt-3 max-w-3xl text-[0.85rem] font-light text-ink-secondary">
          Seventeen more compiled programs exist in the pipeline — seven further state SNAPs,
          five TANFs, UK Universal Credit, Illinois SCRETD, and federal OASDI — in the
          pre-provenance artifact format. They join this table as they are re-cut with
          provenance envelopes.
        </p>
      </div>
    </section>
  );
}
