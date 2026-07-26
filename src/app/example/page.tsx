import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { Cmd, L, Record, dim, id, kw, no, num, ok, pin } from "@/components/terminal";

export const metadata: Metadata = {
  title: "Worked example — Axiom playground",
  description:
    "One household, start to finish: run a statutory determination locally, change the facts, amend the law, follow the citations, switch programs, integrate the JSON.",
};

/** A docket entry: numbered marker on the rail, annotation, the record. */
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

      <Masthead
        page="example"
        thesis="One household, start to finish. Every transcript is real — the outputs your machine will print, pinned by tests."
      />

      <ol className="rise rise-2 mx-auto mt-12 max-w-4xl list-none border-l border-rule-strong">
        <Step
          number="01"
          title="Clone it"
          note={
            <p>
              The engine (WebAssembly) and every composed, hash-pinned program artifact are
              checked in. No Rust toolchain, no API key, works offline.
            </p>
          }
        >
          <Record>
            <Cmd>git clone https://github.com/TheAxiomFoundation/axiom-playground</Cmd>
            <Cmd>cd axiom-playground && bun install</Cmd>
          </Record>
        </Step>

        <Step
          number="02"
          title="Run a determination"
          note={
            <p>
              Colorado SNAP for a family of two — 319 rules from 7&nbsp;USC,
              7&nbsp;CFR&nbsp;273, and 10&nbsp;CCR&nbsp;2506-1.
            </p>
          }
        >
          <Record caption="determine.mjs" aside="co-snap · us-co">
            <Cmd>bun scripts/determine.mjs</Cmd>
            <L />
            <L>{dim("Colorado SNAP — monthly allotment (us-co)")}</L>
            <L>{dim("period 2026-01-01")}</L>
            <L>
              {"  household_size = "}
              {num("2")}
            </L>
            <L>
              {"  snap_countable_earned_income = "}
              {num("1200")}
            </L>
            <L>
              {"  household_shelter_costs_incurred = "}
              {num("900")}
            </L>
            <L>
              {"  member_age = "}
              {num("42, 9")}
            </L>
            <L />
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
            └─ $478 is pinned here and by axiom-api&apos;s parity suite — if your machine
            disagrees, that is a bug with a reproduction
          </p>
        </Step>

        <Step
          number="03"
          title="Change the facts"
          note={
            <p>
              Every input is yours to set; per-person values grow the household. Unset inputs
              carry declared screening presumptions — list them with{" "}
              <code className="font-mono text-[0.82rem] text-ink">--slots</code>.
            </p>
          }
        >
          <Record>
            <Cmd>bun scripts/determine.mjs --set assistance_payments=500</Cmd>
            <L>
              {"  snap_allotment    "}
              {num("253")}
            </L>
            <L />
            <Cmd>bun scripts/determine.mjs --people member_age=42,9,70</Cmd>
            <L>
              {"  snap_allotment    "}
              {num("785")}
              {"   "}
              {dim("# household of three")}
            </L>
            <L />
            <Cmd>bun scripts/determine.mjs --set snap_countable_earned_income=2400</Cmd>
            <L>
              {"  snap_allotment    "}
              {num("0")}
            </L>
            <L>
              {"  snap_eligible     "}
              {no("not_holds")}
              {"   "}
              {dim("# over the income limit")}
            </L>
          </Record>
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
          <Record>
            <Cmd>
              bun scripts/determine.mjs --what-if
              snap_earned_income_deduction_rate_for_net_income=0.3
            </Cmd>
            <L>
              {kw("AMENDED LAW")}
              {dim(" (current law: 0.2) — hypothetical")}
            </L>
            <L />
            <L>
              {"  snap_allotment    "}
              {num("532")}
            </L>
            <L>
              {"  snap_net_income   "}
              {num("166.5")}
            </L>
          </Record>
        </Step>

        <Step
          number="05"
          title="Follow the citations"
          note={
            <p>
              Every figure carries the durable legal id of the rule that produced it — the
              engine&apos;s explain trace. Deepen with{" "}
              <code className="font-mono text-[0.82rem] text-ink">--depth N</code>.
            </p>
          }
        >
          <Record>
            <Cmd>bun scripts/determine.mjs --trace</Cmd>
            <L>
              {"  snap_allotment = "}
              {num("$478")}
              {"  "}
              {id("us-co:regulations/10-ccr-2506-1/4.207.2#snap_allotment")}
            </L>
            <L>
              {"    snap_eligible = "}
              {ok("holds")}
              {"  "}
              {id("us-co:policies/cdhs/snap/fy-2026-benefit-calculation#snap_eligible")}
            </L>
            <L>
              {"    snap_monthly_allotment = "}
              {num("$478")}
              {"  "}
              {id("us:regulations/7-cfr/273/10#snap_monthly_allotment")}
            </L>
            <L>{dim("      = if does not hold and $478 < $10 then 0 else …")}</L>
            <L>{dim("    … 319 rules deep, every one cited")}</L>
          </Record>
        </Step>

        <Step
          number="06"
          title="Switch programs"
          note={
            <p>
              The same commands run every vendored program. Federal income tax doubles its
              brackets for joint filers — the law behaves.
            </p>
          }
        >
          <Record>
            <Cmd>bun scripts/determine.mjs --programs</Cmd>
            <L>{dim("co-snap   Colorado SNAP — monthly allotment      (us-co)")}</L>
            <L>{dim("ma-snap   Massachusetts SNAP — monthly benefit   (us-ma)")}</L>
            <L>{dim("fiit      Federal individual income tax          (us)")}</L>
            <L>{dim("fl-tca    Florida Temporary Cash Assistance      (us-fl)")}</L>
            <L />
            <Cmd>bun scripts/determine.mjs --program fiit --set taxable_income=60000</Cmd>
            <L>
              {"  regular_tax_before_credits  "}
              {num("7912")}
            </L>
            <L />
            <Cmd>
              bun scripts/determine.mjs --program fiit --set taxable_income=120000 --set
              filing_status=1
            </Cmd>
            <L>
              {"  regular_tax_before_credits  "}
              {num("15824")}
              {"   "}
              {dim("# exactly 2× — joint brackets")}
            </L>
          </Record>
        </Step>

        <Step
          number="07"
          title="Integrate it"
          note={
            <p>
              <code className="font-mono text-[0.82rem] text-ink">--json</code> makes every
              determination machine-readable. For in-process use, see the embedding section of
              the reference.
            </p>
          }
        >
          <Record>
            <Cmd>bun scripts/determine.mjs --json | jq .outputs</Cmd>
            <L>{"{"}</L>
            <L>
              {'  "snap_allotment": '}
              {num('"478"')}
              {","}
            </L>
            <L>
              {'  "snap_net_income": '}
              {num('"226.5"')}
              {","}
            </L>
            <L>
              {'  "snap_eligible": '}
              {ok('"holds"')}
            </L>
            <L>{"}"}</L>
          </Record>
        </Step>
      </ol>

      <ProvenanceFooter />
    </div>
  );
}
