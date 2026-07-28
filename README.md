# Axiom local

Law that runs on your machine. This repo is the local Axiom distribution —
the [Axiom rules engine](https://github.com/TheAxiomFoundation/axiom-rules-engine)'s
WebAssembly build, checked in, plus the vendored RuleSpec corpus and the page
that tells you how to use it. The corpus subtree is the unit: pick a root,
its import closure compiles on your machine and runs there. Exploring the
rules themselves is the Axiom app's job; running them on your end is this
repo's.

## Why this exists

A benefits determination is a calculation over deeply personal facts: who lives
in your home, what you earn, what you pay in rent. The usual way to put that
calculation on the web is a server API — which means those facts travel to, and
are processed on, someone else's machine.

This repo exists to demonstrate that they don't have to. The RuleSpec
compiler and evaluator are compiled to WebAssembly and shipped to the browser as
a static asset. The statute text is delivered to the page once; your answers are
assembled into the engine's dataset *in the tab*, handed to the wasm module *in
the tab*, and discarded when you close it. There is no calculation endpoint —
there is nothing to log, nothing to leak, nothing to subpoena.

That is the product. The page invites you to prove it: open your browser's
network tab, run as many determinations as you like, and watch the request count
stay at zero. A live counter reading the browser's own resource timeline is built
into the footer.

And because every rule the engine compiles carries a **durable legal id**
(`<jurisdiction>:<path>#<rule>`), the result is not just a number — it is a chain
of citation. The explain-mode trace renders as an expandable tree where every
derived value, every statutory parameter, and every answer you gave is shown with
the id it came from.

## The subtrees: the corpus is the catalog

There is no program registry and no pre-composed bundle. The unit this repo
serves is the **corpus subtree**: every module in the vendored corpus
(`public/corpus/`, regenerated from the commit pinned in `corpus.lock.json`)
is a root you can slice at — a statute section, a regulation paragraph, a
manual chapter. The root's transitive import closure is compiled by the same
wasm engine, in your tab or your terminal, and the compiled artifact's own
expression tree determines which inputs exist. Two kinds of path never
offer: **Axiom-authored composition/pipeline assembly** (state-plan
compositions, benefit-calculation compositions, `*_pipeline` modules) —
authoring scaffolding, not law, refused as a root with the reason stated —
and rule-less modules, which have nothing to run.

Every slice wears its **certification status**. Certification is a status,
not a gate (the launch posture, matching axiom-api): *certified* means the
slice's full node closure — rules, parameters, input refs — carries
verifier-issued certificates in the vendored ledger
(`data/certified-nodes.json`, served as `public/corpus/ledger.json`);
*encoded* means it runs from the compiled graph without that backing —
published, labeled, and on the certification queue. Almost nothing is
certified yet; publishing that honestly is the point. Set
`AXIOM_CERTIFIED_ENFORCEMENT=enforced` for the hard cut, where a closure
with any uncertified node refuses to run.

The golden path is **7 CFR 273.10** — the SNAP benefit computation, four
modules deep. For the canonical two-person household ($1,200 monthly earned
income, $900 shelter costs) it computes a **$478 monthly allotment**,
pinned by this repo's tests and matching the figure axiom-api's parity
suite pins for the same household. The handful of facts you state are the
case; every other input takes a **synthesized screening presumption**, all
of them inspectable and editable — a presumption is a legal position, so
the page treats it as one. The CLI's `--what-if` amends a statutory
parameter inside the compiled artifact and re-runs the same household under
amended law. See [docs/golden-path.md](docs/golden-path.md) for background.

The landing page embeds the explorer: the catalog on load, search across
every encoded rule, slice at any target, compiled in the tab and run — no
bundle, no server. Generate the corpus locally with
`bun scripts/build-corpus.mjs <rulespec-us checkout>`.

The page is deliberately lean: reading and dissecting rule text is the Axiom
app's job — this repo carries the execution story.

## Architecture

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind v4**, built as a
  fully **static export** (`output: "export"`). There is no server component to
  this product — every byte is served as-is and the calculation runs client-side.
- **Vendored wasm engine.** Both wasm-pack targets are checked into the repo:
  - `public/engine/` — the `--target web` build, fetched and instantiated by the
    browser at load time.
  - `engine/pkg-node/` — the `--target nodejs` build, loaded by the test suite.

  Checking the built engine in means **CI and any host need no Rust toolchain**;
  `bun run build` works from a clean checkout.
- **The vendored corpus** (`public/corpus/`, gitignored; regenerated by
  `scripts/build-corpus.mjs` from the commit pinned in `corpus.lock.json`)
  is the only vendored data: per-module RuleSpec YAML plus one manifest of
  targets, imports, and rule names. Slicing (`src/lib/corpus.ts`) resolves a
  root's closure from the manifest, compiles it, synthesizes the runnable
  descriptor, and probes entity attribution to a fixpoint.
- **A shared request module** (`src/lib/request.ts`) builds the
  `CompiledExecutionRequest` that crosses the wasm boundary. The page (running the
  web build) and the tests (running the nodejs build) call it identically, so the
  JSON the UI sends is the JSON the tests assert on.
- **Trace reconstruction** (`src/lib/trace.ts`) takes the engine's flat
  explain-mode trace (derived values + dependency edges) and, by walking the
  compiled expression tree and resolving parameter versions, enriches it into the
  full citation tree the UI renders — statutory leaves and your own answers
  included, each with its durable id.

```
src/
  app/                 layout, page, global styles (the "law library" theme)
  components/          Program / Household / Determination panels, trace tree, footer
  lib/
    engine/types.ts    TypeScript mirrors of the engine's JSON boundary
    wasm.ts            loads + instantiates the vendored web build (with sha-256)
    request.ts         builds the CompiledExecutionRequest (shared with tests)
    program.ts         static analysis over a compiled artifact (input discovery)
    trace.ts           explain trace -> displayable chain-of-citation tree
    format.ts          value / money / name formatting
    example.ts         the preloaded SNAP module pair
engine/
  pkg-node/            vendored nodejs wasm build (for tests)
  UPSTREAM.json        which engine commit the vendored packages were built from
public/engine/         vendored web wasm build (served to the browser)
```

## Run it locally

This repo is the local distribution: the wasm engine is checked in and the
corpus regenerates from the pinned commit, so everything runs offline with
no Rust toolchain. Requires [Bun](https://bun.sh) only.

```sh
git clone https://github.com/TheAxiomFoundation/axiom-local
cd axiom-local && bun install
bun scripts/build-corpus.mjs ../rulespec-us   # generate public/corpus/

# The page, with hot reload:
bun run dev          # http://localhost:3000

# Or the same determination straight from your terminal:
bun scripts/determine.mjs --roots snap        # the subtree catalog
bun scripts/determine.mjs \
  --set household_size=2 --set snap_gross_monthly_earned_income=1200 \
  --set snap_total_allowable_shelter_expenses=900     # $478, the pinned case
bun scripts/determine.mjs --root us-ny:regulations/18-nycrr/385/3   # any subtree
bun scripts/determine.mjs --what-if snap_earned_income_deduction_rate_for_net_income=0.3
bun scripts/determine.mjs --trace                           # chain of citation
bun scripts/determine.mjs --slots                           # every input the slice reads
bun scripts/determine.mjs --json                            # machine-readable
```

Native engine binaries (no bun, no clone) arrive with the engine's first
tagged release; until then the clone is the supported local path.

## Development

Other scripts:

```sh
bun run typecheck    # tsc --noEmit
bun run test         # vitest: the 7 CFR 273.10 golden path, the
                     #         composition/pipeline exclusion, the certified
                     #         gate, corpus slicing, and the CLI
bun run build        # static export to ./out
```

To preview the production build exactly as it ships:

```sh
bun run build
bunx serve out
```

## Regenerating the wasm engine

Run this only to pick up a newer engine version. It clones the engine
(depth 1), builds both wasm-pack targets, vendors the outputs into
`public/engine/` and `engine/pkg-node/`, and records the source commit in
`engine/UPSTREAM.json`. **This is the one step that needs Rust**
([rustup](https://rustup.rs)) and
[wasm-pack](https://github.com/drager/wasm-pack)
(`brew install wasm-pack` or `cargo install wasm-pack`):

```sh
bun run engine:setup
```

Pin a specific engine ref with environment variables:

```sh
AXIOM_RULES_ENGINE_REF=main bun run engine:setup
```

Then run `bun run test` and `bun run build` and commit the refreshed
`public/engine/`, `engine/pkg-node/`, and `engine/UPSTREAM.json`.

## License

The application code is released under Apache-2.0. The vendored engine packages
carry the upstream Apache-2.0 license (`engine/pkg-node/LICENSE`,
`public/engine/LICENSE`).
