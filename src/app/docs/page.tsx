import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Masthead } from "@/components/Masthead";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { Cmd, L, Record, dim, id } from "@/components/terminal";

export const metadata: Metadata = {
  title: "References — Axiom local",
  description:
    "Every command and flag, the subtree model, presumption semantics, the JSON shapes, and embedding the Axiom rules engine in your own software.",
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
        thesis="The CLI, the subtree model, the presumption model, the JSON shapes, and embedding the engine in your own software."
      />

      <div className="rise rise-2">
        <Section title="The command">
          <Record>
            <Cmd>bun scripts/determine.mjs [--root &lt;target&gt;] [options]</Cmd>
          </Record>
          <div className="panel mt-4 overflow-x-auto">
            <table className="w-full">
              <tbody>
                <FlagRow
                  flag="--roots"
                  args="[filter]"
                  desc="The subtree catalog: every sliceable root with its rule count. An optional filter matches targets and rule names (--roots snap, --roots 18-nycrr)."
                />
                <FlagRow
                  flag="--root"
                  args="<target>"
                  desc="Which subtree to slice (default us:regulations/7-cfr/273/10, the SNAP benefit computation). The root's import closure is compiled by the vendored engine and executed."
                />
                <FlagRow
                  flag="--set"
                  args="<slot>=<value>"
                  desc="State a fact by slot name; anything unset takes its synthesized screening presumption. Repeatable. Unknown slots error with a pointer to --slots."
                />
                <FlagRow
                  flag="--what-if"
                  args="<parameter>=<value>"
                  desc="Amend a statutory parameter inside the compiled artifact before running. Output is labeled AMENDED LAW with the current-law value; the corpus on disk is never touched."
                />
                <FlagRow
                  flag="--month"
                  args="<YYYY-MM>"
                  desc="The determination period (default: the earliest month every parameter in the slice is live for, usually 2026-01)."
                />
                <FlagRow
                  flag="--output"
                  args="<name>"
                  desc="Which output the trace focuses on (default: the slice's first output — the root module's own rules are the outputs)."
                />
                <FlagRow flag="--trace" desc="Print the chain of citation — every figure with the durable legal id of the rule that produced it." />
                <FlagRow flag="--depth" args="<n>" desc="Trace depth (default 3)." />
                <FlagRow flag="--slots" desc="List every input the slice can consider: entity, type, and slot name." />
                <FlagRow flag="--json" desc="Machine-readable result: root, corpus commit, period, certification, answers, amendment, and all outputs." />
                <FlagRow flag="--help" desc="Usage with examples." />
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="The subtree model">
          <p className="max-w-3xl text-[0.88rem] font-light text-ink-secondary">
            The corpus subtree is the unit — there is no program registry and no
            pre-composed bundle. Every module in the vendored corpus (
            <code className="font-mono text-[0.8rem] text-ink">public/corpus/</code>,
            regenerated from the commit pinned in{" "}
            <code className="font-mono text-[0.8rem] text-ink">corpus.lock.json</code>) is a
            root you can slice at: its transitive import closure is compiled by the same
            wasm engine, in your tab or your terminal, and the compiled artifact&apos;s own
            expression tree determines which inputs exist. Two kinds of path never offer:
            Axiom-authored composition/pipeline assembly (state-plan compositions,
            benefit-calculation compositions, <em>*_pipeline</em> modules) — that is
            authoring scaffolding, not law, and refuses as a root — and rule-less modules,
            which have nothing to run.
          </p>
          <p className="mt-3 max-w-3xl text-[0.88rem] font-light text-ink-secondary">
            Certification is a status, not a gate: <em>certified</em> means the slice&apos;s
            full node closure — every rule, parameter, and input ref — is vouched for by the
            vendored certification ledger (
            <code className="font-mono text-[0.8rem] text-ink">public/corpus/ledger.json</code>
            ); <em>encoded</em> means it runs from the compiled graph without that backing —
            published, labeled, and on the certification queue. Almost nothing is certified
            yet; that honesty is the point. Set{" "}
            <code className="font-mono text-[0.8rem] text-ink">AXIOM_CERTIFIED_ENFORCEMENT=enforced</code>{" "}
            for the hard cut, where a closure with any uncertified node refuses to run.
          </p>
          <Record>
            <Cmd>bun scripts/determine.mjs --roots 7-cfr/273</Cmd>
            <L>{dim("  18  us:regulations/7-cfr/273/10")}</L>
            <L>{dim("  11  us:regulations/7-cfr/273/11/c")}</L>
            <L>{dim("   4  us:regulations/7-cfr/273/2/j")}</L>
            <L>{dim("  12  us:regulations/7-cfr/273/24")}</L>
            <L>{dim("   …")}</L>
          </Record>
        </Section>

        <Section title="Inputs and presumptions">
          <p className="max-w-3xl text-[0.88rem] font-light text-ink-secondary">
            A slice can consider anything its expressions read. The handful you{" "}
            <code className="font-mono text-[0.8rem] text-ink">--set</code> are the facts of
            the case; every other input takes a <em>synthesized screening presumption</em> —
            zero-state by type, with counts and division denominators presuming 1, dates
            presuming the period start. A presumption is a legal position, not a hidden
            default: list them with{" "}
            <code className="font-mono text-[0.8rem] text-ink">--slots</code>, override any
            with <code className="font-mono text-[0.8rem] text-ink">--set</code>. Inputs
            belong to entities (Household, Person, …); a slice instantiates one of each kind,
            with entity attribution corrected by engine probes.
          </p>
          <Record>
            <Cmd>bun scripts/determine.mjs --slots | grep -i shelter</Cmd>
            <L>{dim("household decimal  snap_claimed_homeless_shelter_deduction")}</L>
            <L>{dim("household decimal  snap_total_allowable_shelter_expenses")}</L>
          </Record>
        </Section>

        <Section title="JSON output">
          <Record>
            <Cmd>bun scripts/determine.mjs --json --set household_size=2</Cmd>
            <L>{dim('{ "root": "us:regulations/7-cfr/273/10",')}</L>
            <L>{dim('  "corpus_commit": "5cc39ed…",')}</L>
            <L>{dim('  "period": { "period_kind": "month", "start": "2026-01-01", "end": "2026-02-01" },')}</L>
            <L>{dim('  "certification": "encoded",')}</L>
            <L>{dim('  "amendment": null,')}</L>
            <L>{dim('  "answers": { "household": { "household_size": "2" }, … },')}</L>
            <L>{dim('  "outputs": { "snap_monthly_allotment": "546", "snap_net_monthly_income": "0", … } }')}</L>
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
            The same WebAssembly build this repo vendors runs in browsers and Node. Serve
            corpus modules with your app, compile the closure at a root with{" "}
            <code className="font-mono text-[0.8rem] text-ink">compile</code>, build a
            request, execute in-process. No server, no data leaving your product.
          </p>
          <Record>
            <L>{dim("// the wasm builds are vendored in this repo — copy them into your app")}</L>
            <L>{dim("// (an npm release is planned; nothing is published yet)")}</L>
            <L />
            <L>{dim("// browsers and bundlers (ESM) — from public/engine/")}</L>
            <L>
              {"import init, { compile, execute } from "}
              {id('"./engine/axiom_rules_engine_wasm.js"')}
              {";"}
            </L>
            <L>{"await init({ module_or_path: \"./engine/axiom_rules_engine_wasm_bg.wasm\" });"}</L>
            <L>{"const artifactJson = compile(JSON.stringify(modules), rootTarget);"}</L>
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
            <code className="font-mono text-[0.8rem] text-ink">src/lib/corpus.ts</code>{" "}
            resolves closures, synthesizes the runnable descriptor, and probes entity
            attribution; <code className="font-mono text-[0.8rem] text-ink">src/lib/goldenPath.ts</code>{" "}
            builds a request from that descriptor plus answers, and{" "}
            <code className="font-mono text-[0.8rem] text-ink">src/lib/trace.ts</code> turns
            the explain trace into a citation tree —{" "}
            <code className="font-mono text-[0.8rem] text-ink">scripts/determine.mjs</code> is
            a complete worked integration.
          </p>
        </Section>

        <Section title="Verify what you run">
          <Record>
            <Cmd>cat corpus.lock.json</Cmd>
            <L>{dim("# the corpus commit and ledger identity this clone serves — deploys regenerate from exactly these")}</L>
            <L />
            <Cmd>bun run test</Cmd>
            <L>{dim("# the suite: the 7 CFR 273.10 golden path ($478), the composition/pipeline exclusion, the certified-node gate and its leak scan, corpus slicing, the CLI")}</L>
          </Record>
        </Section>
      </div>

      <ProvenanceFooter />
    </div>
  );
}
