# Artifact distribution — decision record

Status: **decided, not yet needed.** Revisit when the catalog outgrows git
(roughly: `public/programs/` > 100MB, or admission of new programs becomes
routine rather than curated).

## Today

Compiled program artifacts are vendored byte-identical into
`public/programs/<id>/` by `scripts/build-packages.mjs` (run against a local
axiom-api checkout) and committed. The app is a static export; the browser
fetches artifacts same-origin and executes them in vendored WASM. No API, no
key, offline after clone.

## Decision

When scale demands it, keep the runtime model and change the warehouse:

1. **Source of truth** — axiom-api CI publishes each compiled artifact as a
   GitHub Release asset named by its sha-256. Provenance lives with the
   producer; no local-checkout step for maintainers.
2. **Delivery** — content-addressed bucket behind a CDN (Cloudflare R2 on our
   own subdomain, `Cache-Control: immutable`). Interim zero-infra option:
   jsDelivr over the release assets.
3. **Uniform catalog — no tiers.** Every program, co-snap included, takes
   the same path: `index.json` entry carrying hash + URL, fetched,
   sha-256-verified (WebCrypto in the browser, hash check in the CLI),
   executed. Vendoring is a *cache policy applied to all programs equally*:
   the build pre-fetches the catalog into the static export (today's
   behavior, byte-identical), and at scale the pre-fetch budget dials down
   — same code path regardless. The offline promise and deploy smoke hold
   as long as the policy is "pre-fetch everything"; dialing it down is a
   deliberate product decision, not a side effect.
4. **Uniform admission — one pipeline.** One descriptor-driven admission
   path for all programs (descriptor from the upstream envelope, engine-
   probe fixpoint for repair). Curation — headline questions, worked
   example, what-if, output pins — is an optional overlay file with the
   same schema for any program, never a separate code path. The
   envelope/legacy provenance label stays as a displayed attribute but
   gates nothing.

This is the standard registry pattern (npm / OCI / apt / Go modules): small
mutable index, immutable content-addressed blobs, client-side hash
verification. We skip the registry *server* — a static index is enough for a
public read-only catalog.

## Tradeoffs

| | Vendored in git (today) | Content-addressed CDN (at scale) |
|---|---|---|
| User setup | clone = everything, fully offline | same, while pre-fetch policy is "everything"; fetched + cached beyond that |
| Repo size | grows with catalog (14MB @ 18 programs; ~1.4GB @ 100x) | stays small (index only) |
| Provenance | sha pinned in repo, checked at deploy | same pin, verified in the visitor's browser (stronger) |
| Versioning | one commit = one global snapshot | per-artifact immutable releases |
| Admission | hand-written config per program in build script | requires descriptors in the upstream envelope |
| Test surface | CI executes every program | CI executes the pre-fetched set + verified sample of the rest |
| "Nothing else to fetch" | true | true while pre-fetch = everything; beyond that, a catalog fetch reveals *which program* to the CDN (never household inputs) |
| New infra | none | R2 bucket + subdomain (or jsDelivr: none) |

## Cost to migrate (when triggered)

- axiom-api: release-publishing CI step — ~1 day
- `build-packages.mjs`: read release manifest instead of sibling checkout — ~1 day
- `Runner.tsx`: remote fetch + WebCrypto sha-256 verify — ~1–2 days
- CLI: `~/.cache/axiom/sha256/` cache + `--offline` — ~1 day
- Tests/smoke: sample-based execution of remote catalog — ~0.5 day
- R2 + domain + CI mirror job — ~0.5 day

Roughly a week of focused work, and it's incremental — steps 1–2 alone
already remove the local-checkout requirement without touching delivery.

## Beyond artifacts: corpus + client-side slicing

The vendored engine already exposes `compile(modules_json, root_target)` —
deterministic, same artifact format `execute` consumes. So the corpus model
is available whenever we want it: serve content-addressed *modules*
(canonical target → RuleSpec YAML, hash-named) plus a manifest with import
edges; the client fetches a root's transitive closure, compiles in-tab,
executes. Artifacts then become a cache tier — memoized compilations of
cataloged slices — not a separate kind of thing.

Why bother: dedup grows with catalog density (today 1.16x duplication
across 18 mostly-disjoint programs, but co-snap/ma-snap already share ~30%
— the federal layer; at 50 state variants that layer ships once, not 50
times), and any rule becomes a queryable root, not just curated programs.

**Status: implemented in /run, shipped by the deploy.**
`scripts/build-corpus.mjs <rulespec-checkout>` generates `public/corpus/`
(gitignored — 32MB; manifest + modules, the exact shape a CDN would serve)
and writes `corpus.lock.json` (tracked) pinning the corpus commit; the
deploy workflow regenerates the corpus from that lock and smoke-checks
`/corpus/manifest.json` on the staged deployment before promoting. The
CorpusExplorer on /run searches ~22k rule names, slices at any target,
compiles in-tab, synthesizes the descriptor (structural dtype inference +
engine-probe fixpoint, `src/lib/corpus.ts`), and runs it.
`tests/corpus.test.ts` proves the thesis end to end: corpus slice + curation
applied as a data overlay reproduces the pinned $478.

Two constraints, non-negotiable:
1. **Verification is per-slice, not per-corpus.** Parity pins attach to
   specific roots. UI must distinguish *verified roots* (pinned outcomes)
   from *valid slices* (compile cleanly, sourced, unpinned).
2. **Arbitrary slices need descriptors.** Entity plans / input defaults for
   any root require per-module descriptor metadata upstream — the same
   envelope prerequisite as 100x admission, now load-bearing.

## The bottleneck that isn't storage

Per-program curation (entity plans, examples, pins in `PROGRAMS`) doesn't
scale 100x regardless of where bytes live. The durable fix is upstream:
provenance envelopes should carry the descriptor so admission is mechanical.
Storage migration is a week; this is the real prerequisite for 100x.
