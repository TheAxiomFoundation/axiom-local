# Axiom playground

Law that runs in your browser. A single page where RuleSpec statutes are
compiled to a program and executed against a household — entirely on-device,
through the [Axiom rules engine](https://github.com/TheAxiomFoundation/axiom-rules-engine)'s
WebAssembly build. Nothing about the household ever leaves the page.

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

## The preloaded example

The page loads with the same federal + state SNAP module pair the engine's own
test suite (`wasm/test/smoke.mjs`, `tests/module_source.rs`) runs:

- a **federal** module publishing the FY-2026 SNAP maximum-allotment table, and
- a **state** rule that imports it and computes the monthly allotment as
  `floor(maximum allotment − 30% of net income)`.

For a household of one with $100 of monthly net income, this computes **$268** —
the value the engine asserts in CI. The page runs this determination on load, so
it lands already alive.

You can also paste (or upload) your own program: a JSON object mapping canonical
targets to RuleSpec YAML text, the exact `{canonical_target: yaml}` shape the
engine's `compile` boundary receives. It is compiled in the tab like everything
else.

## Architecture

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind v4**, built as a
  fully **static export** (`output: "export"`). There is no server component to
  this product — every byte is served as-is and the calculation runs client-side.
- **Vendored wasm engine.** Both wasm-pack targets are checked into the repo:
  - `public/engine/` — the `--target web` build, fetched and instantiated by the
    browser at load time (two requests, both at startup).
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

## Development

Requires [Bun](https://bun.sh). No Rust toolchain is needed for normal
development — the wasm packages are vendored.

```sh
bun install
bun run dev          # http://localhost:3000
```

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
