"use client";

import { PanelHeading } from "./PanelHeading";

/**
 * The exit ramps: where this page's capabilities live outside this page.
 * Three doors by audience. The engineer door tells the truth about what is
 * not yet released rather than linking somewhere that will 404 — per the
 * launch plan, binary releases are pending the engine's first tagged release.
 */
export function TakeItWithYou() {
  return (
    <section className="rise rise-4 mt-16" aria-label="Take it with you" id="take-it-with-you">
      <PanelHeading section="4" title="Take it with you" aside="the same rules, where you work" />

      <p className="mb-6 mt-1 text-[0.95rem] font-light text-ink-secondary">
        Everything this page just did — search, retrieval, determination, the cited trace — is
        available outside it. Pick your door.
      </p>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="panel flex flex-col p-5">
          <p className="smallcaps text-[0.62rem] text-accent">for AI agents · developer preview</p>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">
            Wire it into your agent
          </h3>
          <p className="mt-2 flex-1 text-[0.88rem] font-light text-ink-secondary">
            The MCP server puts these rules — search, sources, dependency graphs, and this same
            calculation — in Claude, Cursor, or any MCP client. A self-serve trial key is one
            request; no signup.
          </p>
          <pre className="mt-3 overflow-x-auto bg-code-bg px-3 py-2 font-mono text-[0.7rem] text-code-text">
            npx -y @axiom-foundation/mcp
          </pre>
          <a
            className="mt-3 font-mono text-[0.72rem] text-accent underline-offset-2 hover:underline"
            href="https://axiom-api-eta.vercel.app/docs/mcp"
            target="_blank"
            rel="noreferrer"
          >
            MCP quickstart →
          </a>
        </div>

        <div className="panel flex flex-col p-5">
          <p className="smallcaps text-[0.62rem] text-accent">for engineers · release pending</p>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">
            Run it on your machine
          </h3>
          <p className="mt-2 flex-1 text-[0.88rem] font-light text-ink-secondary">
            The unit this page executes is a versioned, signed artifact — built for download:
            pin a release, verify its attestation, execute anywhere. Engine binaries await the
            engine&apos;s first tagged release; until then, the engine builds from source with
            cargo.
          </p>
          <a
            className="mt-3 font-mono text-[0.72rem] text-accent underline-offset-2 hover:underline"
            href="https://github.com/TheAxiomFoundation/axiom-rules-engine"
            target="_blank"
            rel="noreferrer"
          >
            axiom-rules-engine →
          </a>
        </div>

        <div className="panel flex flex-col p-5">
          <p className="smallcaps text-[0.62rem] text-accent">for domain experts</p>
          <h3 className="mt-2 font-display text-lg font-semibold text-ink">
            Challenge the encoding
          </h3>
          <p className="mt-2 flex-1 text-[0.88rem] font-light text-ink-secondary">
            Every rule here is a reviewable YAML file with its citation, and every program
            carries parity cases against reference implementations. If this page computed your
            case wrong, that is a bug in the encoding of law — file it.
          </p>
          <a
            className="mt-3 font-mono text-[0.72rem] text-accent underline-offset-2 hover:underline"
            href="https://github.com/TheAxiomFoundation/rulespec-us/issues"
            target="_blank"
            rel="noreferrer"
          >
            rulespec-us issues →
          </a>
        </div>
      </div>
    </section>
  );
}
