/**
 * The preloaded example program: the same federal + state SNAP module pair
 * the engine's own smoke test (wasm/test/smoke.mjs) and integration test
 * (tests/module_source.rs) run. Two RuleSpec modules:
 *
 *  - a federal module publishing the FY-2026 SNAP maximum-allotment table,
 *  - a state benefit rule importing it and computing the monthly allotment
 *    as floor(maximum allotment − 30% of net income).
 *
 * With a household of one and $100 monthly net income this computes 268 —
 * the value the engine's CI asserts.
 */

export const FEDERAL_TARGET = "us:policies/usda/snap/fy-2026-cola/maximum-allotments";
export const STATE_TARGET = "us-co:policies/cdhs/snap/fy-2026-benefit";
export const EXAMPLE_OUTPUT_ID = `${STATE_TARGET}#snap_regular_month_allotment`;

export const FEDERAL_MODULE = `
format: rulespec/v1
rules:
  - name: snap_maximum_allotment_table
    kind: parameter
    dtype: Money
    unit: USD
    indexed_by: household_size
    versions:
      - effective_from: 2025-10-01
        values:
          1: 298
          2: 546
  - name: snap_maximum_allotment
    kind: derived
    entity: Household
    dtype: Money
    period: Month
    unit: USD
    versions:
      - effective_from: 2025-10-01
        formula: snap_maximum_allotment_table[household_size]
`;

export const STATE_MODULE = `
format: rulespec/v1
imports:
  - ${FEDERAL_TARGET}
rules:
  - name: snap_household_food_contribution_rate
    kind: parameter
    dtype: Rate
    versions:
      - effective_from: 2025-10-01
        formula: "0.30"
  - name: snap_regular_month_allotment
    kind: derived
    entity: Household
    dtype: Money
    period: Month
    unit: USD
    versions:
      - effective_from: 2025-10-01
        formula: floor(snap_maximum_allotment - (net_income * snap_household_food_contribution_rate))
`;

/** Canonical target → RuleSpec YAML, the exact map `compile` receives. */
export const EXAMPLE_MODULES: Record<string, string> = {
  [FEDERAL_TARGET]: FEDERAL_MODULE,
  [STATE_TARGET]: STATE_MODULE,
};

export const EXAMPLE_ROOT_TARGET = STATE_TARGET;

/** Default answers: the smoke test's household — size 1, $100 net income. */
export const EXAMPLE_DEFAULT_ANSWERS: Record<string, string> = {
  household_size: "1",
  net_income: "100",
};

/** Default benefit month for the example (FY-2026 rules are live). */
export const EXAMPLE_DEFAULT_MONTH = "2026-01";

/** The value the engine's own CI asserts for the default answers. */
export const EXAMPLE_EXPECTED_ALLOTMENT = "268";
