# The golden path: Colorado SNAP

One household, one program, carried across every way of running Axiom — this
page in the browser, a clone of this repo on your own machine, and (once the
engine has a tagged release) a native binary. The numbers below are pinned by tests
at every layer, so if any surface disagrees, that is a bug with a
reproduction, not a shrug.

## The household

| Fact | Value |
|---|---|
| People | 2 (ages 42 and 9) |
| Monthly earned income | $1,200 |
| Monthly shelter costs | $900 |
| Benefit month | 2026-01 (FY-2026 rules) |
| Everything else | screening presumptions (see below) |

## The determination

| Output | Value | Where pinned |
|---|---|---|
| `snap_allotment` | **$478 / month** | this repo's `tests/goldenPath.test.ts`; axiom-api `examples/parity/co-snap-us-co.json` |
| `snap_net_income` | **$226.50 / month** | same |

The arithmetic, readable straight off the explain trace: $1,200 earned income
less the 20% earned-income deduction (7 USC 2014(e)(2)) and the $209 standard
deduction leaves $751; shelter costs of $900 exceed half of that by $524.50,
all deductible under the FY-2026 excess-shelter cap; net income lands at
$226.50; the two-person maximum allotment of $546 less 30% of net income,
floored, is **$478**.

## The program

The composed compiled artifact `us-co-snap` — 319 derived rules, 127
statutory parameters, 585 inputs — composed from:

- **7 USC 2011–2036** (the Food and Nutrition Act),
- **7 CFR 273** (federal SNAP regulations),
- **10 CCR 2506-1** (Colorado's SNAP rules).

Provenance travels with it: the descriptor pins the artifact's sha-256, the
compiling engine version, and the artifact format version; the page shows all
three and compares the fetched hash against the pin.

## Screening presumptions

Four questions carry the determination above. The program's ~580 other inputs
each carry a **screening presumption** — resident of the state, not a
duplicate participant, no student exemptions in play, and so on. A
presumption is a legal position: the page lists every one, and correcting any
of them re-runs the determination with your answer in force. The
presumption values live in the package descriptor
(`public/programs/co-snap/package.json`), matched by durable input ref.

## Change the law

The artifact is data. The page's what-if amends the earned-income deduction
rate from 20% to 30% — one JSON entry, patched in the tab — and re-runs the
same household under amended law. Current law is never mutated; restoring it
is running the original artifact again. `tests/whatIf.test.ts` pins that the
amendment moves the allotment and that current law still computes $478
afterward.

## The same rules, elsewhere

- **Read them:** every rule this page executed is browsable at
  app.axiom-foundation.org — the RuleSpec encoding beside the statute or
  regulation it encodes, with the citation graph. No sign-in.
- **Your machine (release pending):** the artifact is built for download —
  pin a release, verify its attestation, execute anywhere. Blocked on the
  engine's first tagged release (`v0.1.0`) and dated artifact roll-ups;
  tracked in the launch plan's versioning checklist.
- **Challenge it:** the parity suite in axiom-api and the encodings in
  rulespec-us are public. If your case computes differently than the law
  says it should, file it against rulespec-us with the trace.

The hosted API and MCP server are deliberately not surfaced here — they are
not launch entry points. When they open up, the agent door slots back into
this page's exit ramps.
