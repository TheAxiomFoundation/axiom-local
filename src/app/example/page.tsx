import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { SiteNav } from "@/components/SiteNav";
import { Cmd, Term, dim, id, kw, num, ok } from "@/components/terminal";

export const metadata: Metadata = {
  title: "Worked example — Axiom playground",
  description:
    "One household, start to finish: run a statutory determination locally, change the facts, amend the law, follow the citations, switch programs, integrate the JSON.",
};

/** A docket entry: numbered marker on the rail, annotation, transcript. */
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
      <span
        className="absolute -left-[15px] top-0 flex h-[30px] w-[30px] items-center justify-center border border-accent bg-paper font-mono text-[0.72rem] text-accent"
        aria-hidden="true"
      >
        {number}
      </span>
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
          <div className="mt-2 text-[0.92rem] font-light leading-relaxed text-ink-secondary">
            {note}
          </div>
        </div>
        <div className="min-w-0 lg:col-span-8">{children}</div>
      </div>
    </li>
  );
}

export default function Example() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <header className="rise pt-14 text-center sm:pt-16">
        <p className="smallcaps text-accent">Axiom playground · worked example</p>
        <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          One household, start to finish
        </h1>
        <p className="mx-auto mt-4 max-w-2xl font-body text-lg font-light italic text-ink-secondary">
          Every transcript below is real — the same outputs your machine will print, pinned by
          this repo&apos;s tests.
        </p>
        <SiteNav current="example" />
        <div className="double-rule mx-auto mt-8 w-40" aria-hidden="true" />
      </header>

      <ol className="rise rise-2 mx-auto mt-12 max-w-4xl list-none border-l border-rule-strong">
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
              Every input is yours to set — including per-person values, which grow the
              household. The inputs you don&apos;t set carry declared screening presumptions;
              list them all with <code className="font-mono text-[0.82rem] text-ink">--slots</code>.
            </p>
          }
        >
          <Term>
            <Cmd>bun scripts/determine.mjs --set assistance_payments=500</Cmd>
            {"\n  snap_allotment    "}
            {num("253")}
            {"\n  snap_eligible     "}
            {ok("holds")}
            {"\n\n"}
            <Cmd>bun scripts/determine.mjs --people member_age=42,9,70</Cmd>
            {"\n  snap_allotment    "}
            {num("785")}
            {"  "}
            {dim("# three-person maximum")}
            {"\n\n"}
            <Cmd>bun scripts/determine.mjs --set snap_countable_earned_income=2400</Cmd>
            {"\n  snap_allotment    "}
            {num("0")}
            {"\n  snap_eligible     "}
            <span className="text-code-string">not_holds</span>
            {"  "}
            {dim("# over the income limit")}
          </Term>
        </Step>

        <Step
          number="04"
          title="Amend the law"
          note={
            <p>
              The program is data. Raise the earned-income deduction from 20% to 30% and the
              same family&apos;s allotment moves — labeled hypothetical, current law untouched
              and restored on the next run.
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
              engine&apos;s explain trace, not a reconstruction. Deepen with{" "}
              <code className="font-mono text-[0.82rem] text-ink">--depth N</code>.
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
            {"\n      "}
            {dim("= if does not hold and $478 < $10 then 0 else …")}
            {"\n    "}
            {dim("… 319 rules deep, every one cited")}
          </Term>
        </Step>

        <Step
          number="06"
          title="Switch programs"
          note={
            <p>
              The same commands run every vendored program — each with its own example case,
              headline inputs, and presumptions. Federal income tax doubles its brackets for
              joint filers; the law behaves.
            </p>
          }
        >
          <Term>
            <Cmd>bun scripts/determine.mjs --programs</Cmd>
            {dim("co-snap   Colorado SNAP — monthly allotment  (us-co)\nma-snap   Massachusetts SNAP — monthly benefit (us-ma)\nfiit      Federal individual income tax   (us)\nfl-tca    Florida Temporary Cash Assistance (us-fl)\n")}
            {"\n"}
            <Cmd>bun scripts/determine.mjs --program fiit --set taxable_income=60000</Cmd>
            {"\n  regular_tax_before_credits  "}
            {num("7912")}
            {"\n\n"}
            <Cmd>
              bun scripts/determine.mjs --program fiit --set taxable_income=120000 --set
              filing_status=1
            </Cmd>
            {"\n  regular_tax_before_credits  "}
            {num("15824")}
            {"  "}
            {dim("# exactly 2× — joint brackets")}
          </Term>
        </Step>

        <Step
          number="07"
          title="Integrate it"
          note={
            <p>
              <code className="font-mono text-[0.82rem] text-ink">--json</code> makes every
              determination machine-readable — pipe it into anything. For in-process use, see
              the embedding section of the reference.
            </p>
          }
        >
          <Term>
            <Cmd>bun scripts/determine.mjs --json | jq .outputs</Cmd>
            {"{\n"}
            {'  "snap_allotment": '}
            {num('"478"')}
            {",\n"}
            {'  "snap_net_income": '}
            {num('"226.5"')}
            {",\n"}
            {'  "snap_eligible": '}
            {ok('"holds"')}
            {"\n}"}
          </Term>
        </Step>
      </ol>

      <ProvenanceFooter />
    </div>
  );
}
