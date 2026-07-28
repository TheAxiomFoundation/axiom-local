import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { Cmd, L, Record, dim, id, kw, no, num, ok, pin } from "@/components/terminal";

export const metadata: Metadata = {
  title: "Example — Axiom local",
  description:
    "One household, start to finish: slice a regulation from the corpus, run it locally, change the facts, amend the law, follow the citations, integrate the JSON.",
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
              The engine (WebAssembly) is checked in; the corpus regenerates from the commit
              pinned in <code className="font-mono text-[0.82rem] text-ink">corpus.lock.json</code>.
              No Rust toolchain, no API key, no network at run time.
            </p>
          }
        >
          <Record>
            <Cmd>git clone https://github.com/TheAxiomFoundation/axiom-local</Cmd>
            <Cmd>cd axiom-local && bun install</Cmd>
            <Cmd>bun scripts/build-corpus.mjs ../rulespec-us</Cmd>
          </Record>
        </Step>

        <Step
          number="02"
          title="Slice a regulation and run it"
          note={
            <p>
              The subtree is the unit: 7 CFR 273.10 — the SNAP benefit computation — plus
              the three modules it imports, compiled and executed locally. A family of two,
              $1,200 wages, $900 shelter.
            </p>
          }
        >
          <Record caption="determine.mjs" aside="us:regulations/7-cfr/273/10">
            <Cmd>
              bun scripts/determine.mjs --set household_size=2 --set
              snap_gross_monthly_earned_income=1200 --set
              snap_total_allowable_shelter_expenses=900
            </Cmd>
            <L />
            <L>{dim("us:regulations/7-cfr/273/10")}</L>
            <L>{dim("4 modules · 17 rules · 34 parameters — compiled and executed locally")}</L>
            <L>{dim("period 2026-01-01")}</L>
            <L>{dim("encoded — not certified")}</L>
            <L />
            <L>
              {"  snap_total_gross_income                       "}
              {num("1200")}
            </L>
            <L>
              {"  snap_earned_income_deduction_for_net_income   "}
              {num("240")}
            </L>
            <L>
              {"  snap_excess_shelter_deduction_for_net_income  "}
              {num("525")}
            </L>
            <L>
              {"  snap_net_monthly_income                       "}
              {num("226")}
            </L>
            <L>
              {"  snap_monthly_allotment                        "}
              {pin("478")}
            </L>
          </Record>
          <p className="mt-2 font-mono text-[0.68rem] text-ink-muted">
            └─ $478 is pinned by this repo&apos;s tests, straight from the regulation text —
            if your machine disagrees, that is a bug with a reproduction. This slice is the
            allotment arithmetic of §&nbsp;273.10; eligibility screens live in their own
            subtrees (§§&nbsp;273.4–273.9 — slice them the same way)
          </p>
        </Step>

        <Step
          number="03"
          title="Change the facts"
          note={
            <p>
              Every input is yours to state. Unset inputs carry synthesized screening
              presumptions — list them with{" "}
              <code className="font-mono text-[0.82rem] text-ink">--slots</code>, override
              them with the same <code className="font-mono text-[0.82rem] text-ink">--set</code>.
            </p>
          }
        >
          <Record>
            <Cmd>… --set snap_total_monthly_unearned_income=500</Cmd>
            <L>
              {"  snap_monthly_allotment   "}
              {num("210")}
            </L>
            <L />
            <Cmd>… --set household_size=3</Cmd>
            <L>
              {"  snap_monthly_allotment   "}
              {num("717")}
              {"   "}
              {dim("# household of three")}
            </L>
            <L />
            <Cmd>… --set snap_gross_monthly_earned_income=2400</Cmd>
            <L>
              {"  snap_monthly_allotment   "}
              {num("24")}
              {"   "}
              {dim("# the §273.10(e)(2)(ii)(C) minimum benefit")}
            </L>
          </Record>
        </Step>

        <Step
          number="04"
          title="Amend the law"
          note={
            <p>
              The slice is data. Raise the earned-income deduction from 20% to 30% and the
              same family&apos;s allotment moves — labeled hypothetical, current law
              untouched.
            </p>
          }
        >
          <Record>
            <Cmd>
              … --what-if snap_earned_income_deduction_rate_for_net_income=0.3
            </Cmd>
            <L>
              {kw("AMENDED LAW")}
              {dim(" (current law: 0.2) — hypothetical")}
            </L>
            <L />
            <L>
              {"  snap_monthly_allotment   "}
              {num("532")}
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
            <Cmd>… --trace</Cmd>
            <L>
              {"  snap_monthly_allotment = "}
              {num("$478")}
              {"  "}
              {id("us:regulations/7-cfr/273/10#snap_monthly_allotment")}
            </L>
            <L>
              {"    snap_calculated_monthly_allotment_before_minimums = "}
              {num("$478")}
            </L>
            <L>{dim("      = max(0, floor($546 − $226 × 0.3))")}</L>
            <L>
              {"    snap_minimum_benefit = "}
              {num("$24")}
              {"  "}
              {id("us:regulations/7-cfr/273/10#snap_minimum_benefit")}
            </L>
            <L>{dim("      = floor($298 × 0.08 + 0.5)")}</L>
            <L>{dim("    … every figure cited to the rule that produced it")}</L>
          </Record>
        </Step>

        <Step
          number="06"
          title="Certification is a status, not a gate"
          note={
            <p>
              Every slice is checked against the vendored ledger and labeled. Almost nothing
              is certified yet — that honesty is the point. Set{" "}
              <code className="font-mono text-[0.82rem] text-ink">
                AXIOM_CERTIFIED_ENFORCEMENT=enforced
              </code>{" "}
              for the hard cut, where an uncertified closure refuses to run. Axiom-authored
              composition/pipeline paths are not law and refuse as roots in any posture.
            </p>
          }
        >
          <Record>
            <Cmd>bun scripts/determine.mjs</Cmd>
            <L>{no("encoded — not certified")}</L>
            <L />
            <Cmd>AXIOM_CERTIFIED_ENFORCEMENT=enforced bun scripts/determine.mjs</Cmd>
            <L>
              {no("error: refused: ")}
              {no("7 node(s) in the us:regulations/7-cfr/273/10 closure are not")}
            </L>
            <L>{no("certified under the served ledger (fixture-us-ny-snap)")}</L>
            <L />
            <Cmd>bun scripts/determine.mjs --root us:policies/usda/snap/state-plan-composition</Cmd>
            <L>{no("error: … is Axiom-authored composition/pipeline assembly, not law —")}</L>
            <L>{no("it is excluded from the corpus explorer and cannot be sliced.")}</L>
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
            <Cmd>bun scripts/determine.mjs … --json | jq .outputs</Cmd>
            <L>{"{"}</L>
            <L>
              {'  "snap_net_monthly_income": '}
              {num('"226"')}
              {","}
            </L>
            <L>
              {'  "snap_monthly_allotment": '}
              {ok('"478"')}
              {","}
            </L>
            <L>{dim("  …")}</L>
            <L>{"}"}</L>
          </Record>
        </Step>
      </ol>

      <ProvenanceFooter />
    </div>
  );
}
