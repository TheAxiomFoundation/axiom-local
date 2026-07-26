# Axiom playground

Law that runs on your machine. This repo is the local Axiom distribution —
the [Axiom rules engine](https://github.com/TheAxiomFoundation/axiom-rules-engine)'s
WebAssembly build and full composed statutory programs, hash-pinned and
checked in — plus the page that tells you how to use it. Exploring the rules
themselves is the Axiom app's job; running them on your end is this repo's.

## Why this exists

A benefits determination is a calculation over deeply personal facts: who lives
in your home, what you earn, what you pay in rent. The usual way to put that
calculation on the web is a server API — which means those facts travel to, and
are processed on, someone else's machine.

This playground exists to demonstrate that they don't have to. The RuleSpec
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

## The programs: full composed artifacts, not demos

The page ships a library of **composed compiled artifacts** — the same
versioned release units the hosted engine executes, provenance and sha-256
shown on the page — selectable from the program panel:

| Program | Rules | Inputs | Law |
|---|---|---|---|
| Colorado SNAP (the golden path) | 319 | 585 | 7 USC 2011–2036 · 7 CFR 273 · 10 CCR 2506-1 |
| Massachusetts SNAP | 372 | 719 | 7 USC · 7 CFR 273 · 106 CMR 360–366 |
| Federal individual income tax | 137 | 184 | 26 USC 1, 24, 32, 55, 63, 151… |
| Florida Temporary Cash Assistance | 831 | 2,113 | 45 CFR · FL 65A-4 |

The page lands on Colorado SNAP: for the canonical two-person household —
$1,200 monthly earned income, $900 shelter costs — it computes a **$478
monthly allotment** and **$226.50 net income**, the exact values axiom-api's
parity suite pins. The determination runs on load, so the page lands already
alive; switching programs lands on that program's example case, computed.
`scripts/build-packages.mjs` admits new artifacts (descriptor generation is
engine-probed; see the PROGRAMS config).

A handful of headline questions carry each determination; the program's
remaining inputs take **screening presumptions**, every one inspectable and overridable
from the program panel — a presumption is a legal position, so the page treats
it as one. A one-click **what-if** amends the earned-income deduction rate
(7 USC 2014(e)(2), 20% → 30%) inside the artifact and re-runs the same
household under amended law, in the tab. See
[docs/golden-path.md](docs/golden-path.md) for the full walkthrough.

A **guided tour** (`?tour=landed` … `?tour=exit`, dismissable, deep-linkable)
walks a first-time visitor from the landed verdict to the exit ramps: the
Axiom app to read every rule beside its source law, the local run for
engineers, the parity suite for domain experts who want to challenge the
encoding. (The hosted API and MCP are deliberately not surfaced — they are
not launch entry points.)

The page is deliberately lean: reading and dissecting rule text is the Axiom
app's job, and compile-your-own-RuleSpec belongs to this repo's engine tests
and the npm package — the page carries the execution story only.

## Architecture

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind v4**, built as a
  fully **static export** (`output: "export"`). There is no server component to
  this product — every byte is served as-is and the calculation runs client-side.
- **Vendored wasm engine.** Both wasm-pack targets are checked into the repo:
  - `public/engine/` — the `--target web` build, fetched and instantiated by the
    browser at load time.
  - `public/programs/<id>/` — the vendored compiled artifacts plus their
    descriptors (defaults, headline questions, provenance), emitted by
    `scripts/build-packages.mjs` and pinned by the test suite;
    `public/programs/index.json` is the registry the page and CLI read.
    Four startup requests per program (engine js + wasm once, then package
    descriptor + artifact); the network sentinel re-arms after each program
    loads, and determinations never fetch.
  - `engine/pkg-node/` — the `--target nodejs` build, loaded by the test suite.

  Checking the built packages in means **CI and any host need no Rust toolchain**;
  `bun run build` works from a clean checkout.
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

This repo is the local distribution: the wasm engine and the composed,
hash-pinned artifacts are checked in, so a clone runs the whole thing
offline with no Rust toolchain. Requires [Bun](https://bun.sh) only.

```sh
git clone https://github.com/TheAxiomFoundation/axiom-playground
cd axiom-playground && bun install

# The page, with hot reload:
bun run dev          # http://localhost:3000

# Or the same determination straight from your terminal:
bun scripts/determine.mjs --programs                        # list the programs
bun scripts/determine.mjs                                   # $478, the pinned case
bun scripts/determine.mjs --program fiit --set taxable_income=120000
bun scripts/determine.mjs --set snap_countable_earned_income=2400   # ineligible
bun scripts/determine.mjs --people member_age=42,9,70
bun scripts/determine.mjs --what-if snap_earned_income_deduction_rate_for_net_income=0.3
bun scripts/determine.mjs --set assistance_payments=500     # override a presumption
bun scripts/determine.mjs --trace                           # chain of citation
bun scripts/determine.mjs --slots                           # list all 585 inputs
bun scripts/determine.mjs --json                            # machine-readable
```

Native engine binaries (no bun, no clone) arrive with the engine's first
tagged release; until then the clone is the supported local path.

## Development

Other scripts:

```sh
bun run typecheck    # tsc --noEmit
bun run test         # vitest: runs the UI's own request path through the
                     #         vendored nodejs engine and asserts the 268 path
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
