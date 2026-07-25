import index from "../../public/programs/index.json";
import { PanelHeading } from "./PanelHeading";

/**
 * The page's whole job: getting Axiom running on your end. Exploring the
 * programs — the rules, the cases, the graph — is the Axiom app's job;
 * this page is the local distribution's front door.
 */
export function GetStarted() {
  return (
    <section className="rise rise-2 mt-12" aria-label="Run it on your machine" id="get-started">
      <PanelHeading title="Run it on your machine" aside="works today · no api key · offline" />

      <p className="mb-6 mt-1 max-w-3xl text-[0.95rem] font-light text-ink-secondary">
        This repo is the local distribution: the engine (WebAssembly) and every composed,
        hash-pinned artifact are checked in. Clone it and full statutory programs run in your
        terminal — offline, no Rust toolchain. Amend the law, override presumptions, print the
        citation trace.
      </p>

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="smallcaps mb-2 text-[0.62rem] text-accent">get it running</p>
          <pre className="overflow-x-auto bg-code-bg px-4 py-3 font-mono text-[0.78rem] leading-relaxed text-code-text">
            {"git clone https://github.com/TheAxiomFoundation/axiom-playground\ncd axiom-playground && bun install\nbun scripts/determine.mjs"}
          </pre>

          <p className="smallcaps mb-2 mt-5 text-[0.62rem] text-accent">play with it</p>
          <pre className="overflow-x-auto bg-code-bg px-4 py-3 font-mono text-[0.78rem] leading-relaxed text-code-text">
            {"bun scripts/determine.mjs --programs\nbun scripts/determine.mjs --program fiit --set taxable_income=120000\nbun scripts/determine.mjs --what-if <parameter>=<value>   # amend the law\nbun scripts/determine.mjs --set <slot>=<value>            # override a presumption\nbun scripts/determine.mjs --trace                         # chain of citation\nbun scripts/determine.mjs --json                          # machine-readable"}
          </pre>

          <p className="smallcaps mb-2 mt-5 text-[0.62rem] text-accent">build on it</p>
          <p className="text-[0.88rem] font-light text-ink-secondary">
            The engine ships to npm as{" "}
            <code className="font-mono text-[0.8rem] text-ink">
              @axiom-foundation/rules-engine-wasm
            </code>{" "}
            — browser and Node targets, no vendoring. Compile and execute RuleSpec inside your
            own product; this repo&apos;s{" "}
            <code className="font-mono text-[0.8rem] text-ink">src/lib/</code> is the reference
            for request building and trace reconstruction.
          </p>
        </div>

        <div>
          <p className="smallcaps mb-2 text-[0.62rem] text-accent">what ships in the clone</p>
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
            each: one versioned compiled artifact, sha-256 pinned, screening presumptions
            declared — the same release units the hosted engine executes
          </p>

          <p className="smallcaps mb-2 mt-5 text-[0.62rem] text-accent">what a run looks like</p>
          <pre className="overflow-x-auto bg-code-bg px-4 py-3 font-mono text-[0.72rem] leading-relaxed text-code-text">
            {"$ bun scripts/determine.mjs\n\nColorado SNAP — monthly allotment (us-co)\nperiod 2026-01-01\n  household_size = 2\n  snap_countable_earned_income = 1200\n  household_shelter_costs_incurred = 900\n  member_age = 42, 9\n\n  snap_allotment    478\n  snap_net_income   226.5\n  snap_eligible     holds"}
          </pre>
          <p className="mt-2 font-mono text-[0.65rem] text-ink-muted">
            $478 is pinned by tests here and by axiom-api&apos;s parity suite — if your machine
            disagrees, that is a bug with a reproduction
          </p>
        </div>
      </div>
    </section>
  );
}
