/**
 * Runs the exact pipeline the page runs — discoverInputs → buildRequest →
 * execute(explain) → buildDisplayTree — against the vendored *nodejs* build
 * of the same engine the browser loads, and asserts the 268 allotment the
 * engine's own CI asserts. If this passes, the UI's request and trace code
 * are exercised end to end without a browser.
 */

import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { CompiledProgramArtifact, EngineBindings, ExecutionResponse } from "@/lib/engine/types";
import {
  EXAMPLE_DEFAULT_ANSWERS,
  EXAMPLE_DEFAULT_MONTH,
  EXAMPLE_EXPECTED_ALLOTMENT,
  EXAMPLE_MODULES,
  EXAMPLE_OUTPUT_ID,
  EXAMPLE_ROOT_TARGET,
  FEDERAL_TARGET,
  STATE_TARGET,
} from "@/lib/example";
import { discoverInputs } from "@/lib/program";
import { buildRequest, monthInterval } from "@/lib/request";
import { buildDisplayTree } from "@/lib/trace";

const require = createRequire(import.meta.url);
const engine = require("../engine/pkg-node/axiom_rules_engine_wasm.js") as EngineBindings;

function compileExample() {
  const artifactJson = engine.compile(JSON.stringify(EXAMPLE_MODULES), EXAMPLE_ROOT_TARGET);
  return { artifactJson, artifact: JSON.parse(artifactJson) as CompiledProgramArtifact };
}

describe("provenance exports", () => {
  it("reports a semver engine version and a numeric artifact format", () => {
    expect(engine.engine_version()).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof engine.artifact_format_version()).toBe("number");
  });
});

describe("the example program, through the UI's own request path", () => {
  const { artifactJson, artifact } = compileExample();
  const inputs = discoverInputs(artifact);

  it("stamps the artifact with matching provenance", () => {
    expect(artifact.artifact_format_version).toBe(engine.artifact_format_version());
    expect(artifact.engine_version).toBe(engine.engine_version());
  });

  it("discovers the two household inputs with their durable references", () => {
    const refs = inputs.map((input) => input.ref).sort();
    expect(refs).toEqual([
      `${STATE_TARGET}#input.net_income`,
      `${FEDERAL_TARGET}#input.household_size`,
    ].sort());
    const size = inputs.find((input) => input.name === "household_size");
    expect(size?.flavor).toBe("integer");
    expect(size?.tableKeys).toEqual(["1", "2"]);
    expect(inputs.find((input) => input.name === "net_income")?.flavor).toBe("money");
  });

  it("computes the 268 allotment the engine's CI asserts", () => {
    const answers = Object.fromEntries(
      inputs.map((input) => [input.ref, EXAMPLE_DEFAULT_ANSWERS[input.name]]),
    );
    const request = buildRequest({
      inputs,
      answers,
      month: EXAMPLE_DEFAULT_MONTH,
      outputId: EXAMPLE_OUTPUT_ID,
      mode: "explain",
    });

    // The smoke test's exact dataset shape.
    expect(request.dataset.inputs).toHaveLength(2);
    expect(request.queries[0].period).toEqual({
      period_kind: "month",
      ...monthInterval(EXAMPLE_DEFAULT_MONTH),
    });

    const response = JSON.parse(
      engine.execute(artifactJson, JSON.stringify(request)),
    ) as ExecutionResponse;
    expect(response.metadata.requested_mode).toBe("explain");
    expect(response.metadata.actual_mode).toBe("explain");

    const output = response.results[0].outputs[EXAMPLE_OUTPUT_ID];
    if (output.kind !== "scalar") throw new Error("expected a scalar output");
    expect(output.value).toEqual({ kind: "decimal", value: EXAMPLE_EXPECTED_ALLOTMENT });
  });
});

describe("the chain of citation the page renders", () => {
  const { artifactJson, artifact } = compileExample();
  const inputs = discoverInputs(artifact);
  const answers = Object.fromEntries(
    inputs.map((input) => [input.ref, EXAMPLE_DEFAULT_ANSWERS[input.name]]),
  );
  const request = buildRequest({
    inputs,
    answers,
    month: EXAMPLE_DEFAULT_MONTH,
    outputId: EXAMPLE_OUTPUT_ID,
  });
  const response = JSON.parse(
    engine.execute(artifactJson, JSON.stringify(request)),
  ) as ExecutionResponse;
  const tree = buildDisplayTree({
    outputId: EXAMPLE_OUTPUT_ID,
    result: response.results[0],
    artifact,
    dataset: request.dataset,
  });

  it("roots the tree at the queried output with its durable id", () => {
    expect(tree).not.toBeNull();
    expect(tree?.refId).toBe(EXAMPLE_OUTPUT_ID);
    expect(tree?.origin).toBe("derived");
    expect(tree?.valueText).toBe("$268");
  });

  it("substitutes every operand's concrete value into the formula", () => {
    expect(tree?.formula).toBe(
      "floor(snap_maximum_allotment − net_income × snap_household_food_contribution_rate)",
    );
    expect(tree?.substituted).toBe("floor($298 − 100 × 0.3)");
  });

  it("cites the federal maximum-allotment rule as a derived child", () => {
    const fed = tree?.children.find((child) => child.label === "snap_maximum_allotment");
    expect(fed?.origin).toBe("derived");
    expect(fed?.refId).toBe(`${FEDERAL_TARGET}#snap_maximum_allotment`);
    expect(fed?.valueText).toBe("$298");
    expect(fed?.formula).toBe("snap_maximum_allotment_table[household_size]");
  });

  it("cites the allotment table entry, period-resolved, as a statute leaf", () => {
    const fed = tree?.children.find((child) => child.label === "snap_maximum_allotment");
    const table = fed?.children.find((child) => child.label === "snap_maximum_allotment_table");
    expect(table?.origin).toBe("parameter");
    expect(table?.refId).toBe(`${FEDERAL_TARGET}#snap_maximum_allotment_table`);
    expect(table?.valueText).toBe("$298");
    expect(table?.note).toContain("entry for household_size = 1");
    expect(table?.note).toContain("effective from 2025-10-01");
  });

  it("marks the visitor's answers as inputs that never left the page", () => {
    const income = tree?.children.find((child) => child.label === "net_income");
    expect(income?.origin).toBe("input");
    expect(income?.refId).toBe(`${STATE_TARGET}#input.net_income`);
    expect(income?.valueText).toBe("100");

    const fed = tree?.children.find((child) => child.label === "snap_maximum_allotment");
    const size = fed?.children.find((child) => child.label === "household_size");
    expect(size?.origin).toBe("input");
    expect(size?.refId).toBe(`${FEDERAL_TARGET}#input.household_size`);
    expect(size?.valueText).toBe("1");
  });

  it("cites the contribution-rate parameter with its durable id", () => {
    const rate = tree?.children.find(
      (child) => child.label === "snap_household_food_contribution_rate",
    );
    expect(rate?.origin).toBe("parameter");
    expect(rate?.refId).toBe(`${STATE_TARGET}#snap_household_food_contribution_rate`);
    expect(rate?.valueText).toBe("0.3");
  });
});

describe("error reporting across the boundary", () => {
  it("reports a missing root module", () => {
    expect(() => engine.compile("{}", "us:policies/never-written")).toThrow(/never-written/);
  });

  it("reports malformed request JSON", () => {
    const { artifactJson } = compileExample();
    expect(() => engine.execute(artifactJson, "not json")).toThrow(/CompiledExecutionRequest/);
  });
});
