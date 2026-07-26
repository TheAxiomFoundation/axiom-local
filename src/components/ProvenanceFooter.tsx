import upstream from "../../engine/UPSTREAM.json";

export function ProvenanceFooter() {
  return (
    <footer className="rise rise-5 mt-16">
      <div className="double-rule pt-5" />

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="smallcaps mb-3 text-[0.65rem] text-ink-secondary">
            Computed on your machine — nothing to send
          </h2>
          <p className="text-[0.92rem] font-light text-ink-secondary">
            The RuleSpec compiler and evaluator run as WebAssembly wherever you put them — your
            terminal, your product, your network. The statutes, the compiled artifacts, the
            household facts, and the verdict never need to touch a server. There is no
            calculation API to call. There is nothing to log, nothing to leak, nothing to
            subpoena.
          </p>
        </div>

        <div>
          <h2 className="smallcaps mb-3 text-[0.65rem] text-ink-secondary">Provenance</h2>
          <dl className="space-y-1.5 font-mono text-[0.72rem]">
            <div className="flex items-baseline">
              <dt className="text-ink-muted">engine built from</dt>
              <span className="leader" aria-hidden="true" />
              <dd className="text-ink">
                <a
                  href={`${upstream.repo}/commit/${upstream.commit}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  axiom-rules-engine@{upstream.commit.slice(0, 7)}
                </a>
              </dd>
            </div>
            <div className="flex items-baseline">
              <dt className="text-ink-muted">artifacts</dt>
              <span className="leader" aria-hidden="true" />
              <dd className="text-ink">sha-256 pinned per program, asserted in CI</dd>
            </div>
          </dl>

          <p className="mt-5 text-[0.85rem] font-light text-ink-secondary">
            Source:{" "}
            <a
              href="https://github.com/TheAxiomFoundation/axiom-playground"
              target="_blank"
              rel="noreferrer"
            >
              TheAxiomFoundation/axiom-playground
            </a>{" "}
            · engine:{" "}
            <a href={upstream.repo} target="_blank" rel="noreferrer">
              axiom-rules-engine
            </a>{" "}
            (Apache-2.0)
          </p>
        </div>
      </div>
    </footer>
  );
}
