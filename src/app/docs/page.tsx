import type { Metadata } from "next";
import type { ReactNode } from "react";
import index from "../../../public/programs/index.json";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { Cmd, L, Record, dim, id } from "@/components/terminal";

export const metadata: Metadata = {
  title: "References — Axiom local",
  description:
    "Every command and flag, every program, presumption semantics, the JSON shapes, and embedding the Axiom rules engine in your own software.",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto mt-12 max-w-4xl">
      <div className="double-rule pt-4" />
      <h2 className="smallcaps mb-4 mt-2 text-[0.7rem] text-ink-secondary">{title}</h2>
      {children}
    </section>
  );
}

function FlagRow({ flag, args, desc }: { flag: string; args?: string; desc: string }) {
  return (
    <tr className="border-b border-rule-subtle align-top last:border-0">
      <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[0.75rem] text-ink">
        {flag}
        {args ? <span className="text-ink-muted"> {args}</span> : null}
      </td>
      <td className="px-3 py-2.5 text-[0.85rem] font-light text-ink-secondary">{desc}</td>
    </tr>
  );
}

export default function Docs() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <Masthead
        page="docs"
        thesis="The CLI, the programs, the presumption model, the JSON shapes, and embedding the engine in your own software."
      />

      <div className="rise rise-2">
        <Section title="The command">
          <Record>
            <Cmd>bun scripts/determine.mjs [--program &lt;id&gt;] [options]</Cmd>
          </Record>
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full">
              <tbody>
                <FlagRow flag="--programs" desc="List every certified program with its rule and input counts." />
                <FlagRow
                  flag="--program"
                  args="<id>"
                  desc="Which program to run (default ny-snap). Each starts from its descriptor's example case."
                />
                <FlagRow
                  flag="--set"
                  args="<slot>=<value>"
                  desc="Set any input by slot name — headline facts and presumptions alike. Repeatable. Unknown slots error with a pointer to --slots."
                />
                <FlagRow
                  flag="--people"
                  args="<slot>=<v1,v2,…>"
                  desc="Per-person values, position = person: member_age=42,9 sets person 1 to 42 and person 2 to 9. Works for any person-level slot (see --slots); there is no single-person shorthand — give the full list. The list length sets the unit size."
                />
                <FlagRow
                  flag="--what-if"
                  args="<parameter>=<value>"
                  desc="Amend a statutory parameter inside the compiled artifact before running. Output is labeled AMENDED LAW with the current-law value; the artifact on disk is never touched."
                />
                <FlagRow
                  flag="--month"
                  args="<YYYY-MM>"
                  desc="The determination period (default: the program's, usually 2026-01)."
                />
                <FlagRow
                  flag="--output"
                  args="<name>"
                  desc="Which output the result and trace focus on (default: the program's first output). Outputs are unit-level; person-level rules cannot be queried directly — their values appear inside the trace (--trace --depth 5 shows each member's chain)."
                />
                <FlagRow flag="--trace" desc="Print the chain of citation — every figure with the durable legal id of the rule that produced it." />
                <FlagRow flag="--depth" args="<n>" desc="Trace depth (default 3)." />
                <FlagRow flag="--slots" desc="List every input the program can consider: entity, type, and slot name." />
                <FlagRow flag="--json" desc="Machine-readable result: program, period, answers, amendment, and all outputs." />
                <FlagRow flag="--help" desc="Usage with examples." />
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="The programs">
          <div className="panel overflow-x-auto">
            <table className="w-full font-mono text-[0.72rem]">
              <thead>
                <tr className="border-b border-rule text-left text-ink-muted">
                  <th className="px-3 py-2 font-normal">id</th>
                  <th className="px-3 py-2 font-normal">program</th>
                  <th className="px-3 py-2 font-normal">certification</th>
                  <th className="px-3 py-2 text-right font-normal">rules</th>
                  <th className="px-3 py-2 text-right font-normal">inputs</th>
                </tr>
              </thead>
              <tbody>
                {index.programs.map((program) => (
                  <tr key={program.id} className="border-b border-rule-subtle last:border-0">
                    <td className="px-3 py-2 text-ink">{program.id}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {program.title} <span className="text-ink-muted">({program.jurisdiction})</span>
                    </td>
                    <td className="px-3 py-2">
                      {program.certification === "certified" ? (
                        <span className="text-success">certified</span>
                      ) : (
                        <span className="text-ink-muted">encoded</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-secondary">{program.rules}</td>
                    <td className="px-3 py-2 text-right text-ink-secondary">{program.inputs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-3xl text-[0.88rem] font-light text-ink-secondary">
            Each program is one versioned compiled artifact (
            <code className="font-mono text-[0.8rem] text-ink">public/programs/&lt;id&gt;/artifact.json</code>
            ) plus a descriptor (
            <code className="font-mono text-[0.8rem] text-ink">package.json</code>) declaring
            its inputs, screening presumptions, entities and relations, example case,
            sha-256 pin, and <em>certification status</em>. Certification is a status, not
            a gate: <em>certified</em> means the program&apos;s full node closure — every
            rule, parameter, relation, and input — is vouched for by the vendored
            certification ledger (
            <code className="font-mono text-[0.8rem] text-ink">public/corpus/ledger.json</code>
            ), with per-output certificates in the descriptor; <em>encoded</em> means it is
            served from a compiled graph without that backing — published, labeled, and on
            the certification queue. Almost nothing is certified yet; that honesty is the
            point. Set{" "}
            <code className="font-mono text-[0.8rem] text-ink">AXIOM_CERTIFIED_ENFORCEMENT=enforced</code>{" "}
            for the hard cut, where uncertified programs refuse to vendor and to load. New
            York SNAP is the flagship: certified end to end under the (fixture) ledger,
            with a parity pin ($478 for the canonical two-person household).
          </p>
        </Section>

        <Section title="Inputs and presumptions">
          <p className="max-w-3xl text-[0.88rem] font-light text-ink-secondary">
            A program can consider hundreds of inputs — New York SNAP has 143. The handful you
            set are the facts of the case; every other input takes its declared{" "}
            <em>screening presumption</em> from the descriptor. A presumption is a legal
            position, not a hidden default: list them with{" "}
            <code className="font-mono text-[0.8rem] text-ink">--slots</code>, override any
            with <code className="font-mono text-[0.8rem] text-ink">--set</code>. Inputs
            belong to entities (Household, Person, TaxUnit, …); per-person inputs take positional
            lists via <code className="font-mono text-[0.8rem] text-ink">--people</code>, and
            each person is bound to the unit by the program&apos;s declared relations. Person-level
            <em> outputs</em> are not directly queryable — read them off the trace.
          </p>
          <Record>
            <Cmd>bun scripts/determine.mjs --slots | grep -i student</Cmd>
            <L>{dim("person    bool     student_school_term_has_begun")}</L>
            <L>{dim("person    integer  student_age")}</L>
            <L>{dim("person    bool     student_physically_or_mentally_unfit")}</L>
            <L>{dim("…")}</L>
          </Record>
        </Section>

        <Section title="JSON output">
          <Record>
            <Cmd>bun scripts/determine.mjs --json</Cmd>
            <L>{dim('{ "program": "ny-snap",')}</L>
            <L>{dim('  "period": { "period_kind": "month", "start": "2026-01-01", "end": "2026-02-01" },')}</L>
            <L>{dim('  "amendment": null,')}</L>
            <L>{dim('  "answers": { "household": { … }, "people": { … }, "refOverrides": { } },')}</L>
            <L>{dim('  "outputs": { "snap_benefit_amount": "478", "snap_net_income": "226.5", "snap_eligible": "holds" } }')}</L>
          </Record>
          <p className="mt-3 max-w-3xl text-[0.88rem] font-light text-ink-secondary">
            Judgment outputs come through as{" "}
            <code className="font-mono text-[0.8rem] text-ink">holds</code> /{" "}
            <code className="font-mono text-[0.8rem] text-ink">not_holds</code>; money and
            rates as exact decimal strings — the engine does exact decimal arithmetic, never
            floats.
          </p>
        </Section>

        <Section title="Use it in your own software">
          <p className="max-w-3xl text-[0.88rem] font-light text-ink-secondary">
            The engine ships to npm as{" "}
            <code className="font-mono text-[0.8rem] text-ink">
              @axiom-foundation/rules-engine-wasm
            </code>{" "}
            — the same WebAssembly build this repo vendors, browser and Node targets in one
            package. Ship an artifact from{" "}
            <code className="font-mono text-[0.8rem] text-ink">public/programs/</code> with
            your app (verify its sha-256 against the descriptor pin), build a request, execute
            in-process. No server, no data leaving your product.
          </p>
          <Record>
            <L>{dim("// the wasm builds are vendored in this repo — copy them into your app")}</L>
            <L>{dim("// (an npm release is planned; nothing is published yet)")}</L>
            <L />
            <L>{dim("// browsers and bundlers (ESM) — from public/engine/")}</L>
            <L>
              {"import init, { execute } from "}
              {id('"./engine/axiom_rules_engine_wasm.js"')}
              {";"}
            </L>
            <L>{"await init({ module_or_path: \"./engine/axiom_rules_engine_wasm_bg.wasm\" });"}</L>
            <L>{"const response = JSON.parse(execute(artifactJson, JSON.stringify(request)));"}</L>
            <L />
            <L>{dim("// node (CommonJS) — from engine/pkg-node/")}</L>
            <L>
              {"const engine = require("}
              {id('"./engine/pkg-node/axiom_rules_engine_wasm.js"')}
              {");"}
            </L>
          </Record>
          <p className="mt-3 max-w-3xl text-[0.88rem] font-light text-ink-secondary">
            The request/response shapes are mirrored in{" "}
            <code className="font-mono text-[0.8rem] text-ink">src/lib/engine/types.ts</code>;{" "}
            <code className="font-mono text-[0.8rem] text-ink">src/lib/goldenPath.ts</code>{" "}
            builds a request from a descriptor plus answers, and{" "}
            <code className="font-mono text-[0.8rem] text-ink">src/lib/trace.ts</code> turns
            the explain trace into a citation tree —{" "}
            <code className="font-mono text-[0.8rem] text-ink">scripts/determine.mjs</code> is
            a complete worked integration. The engine also compiles RuleSpec
            YAML directly (<code className="font-mono text-[0.8rem] text-ink">compile</code>)
            if you want to go deeper than the shipped artifacts.
          </p>
        </Section>

        <Section title="Verify what you run">
          <Record>
            <Cmd>shasum -a 256 public/programs/ny-snap/artifact.json</Cmd>
            <L>{dim("# compare against source.artifact_sha256 in public/programs/ny-snap/package.json")}</L>
            <L />
            <Cmd>bun run test</Cmd>
            <L>{dim("# the suite: packaging invariants, the $478 parity pin, the certified-node gate and its leak scan, corpus slicing, the CLI")}</L>
          </Record>
        </Section>
      </div>

      <ProvenanceFooter />
    </div>
  );
}
