/**
 * Building the CompiledExecutionRequest. This module is shared verbatim by
 * the page (running against the browser/web wasm build) and the test suite
 * (running against the vendored nodejs build), so the exact JSON the UI
 * sends is the JSON the tests assert on.
 */

import type {
  CompiledExecutionRequest,
  Dataset,
  ExecutionMode,
  InputRecord,
  Interval,
  ScalarValue,
} from "./engine/types";
import type { DiscoveredInput } from "./program";

/** "2026-01" → { start: "2026-01-01", end: "2026-01-31" } (UTC-safe). */
export function monthInterval(ym: string): Interval {
  const match = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!match) throw new Error(`Not a calendar month: "${ym}" (expected YYYY-MM)`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Not a calendar month: "${ym}"`);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/**
 * Parse what the visitor typed into the engine's scalar value. Integers go
 * across as integers (table indexes require it); everything else crosses as
 * a decimal *string*, so the engine's exact decimal arithmetic — not
 * JavaScript floats — does the math.
 */
export function parseAnswer(text: string, input: DiscoveredInput): ScalarValue {
  const cleaned = text.replace(/[$£€,\s]/g, "");
  if (cleaned === "") throw new Error(`"${input.name}" needs an answer`);
  if (input.flavor === "integer") {
    if (!/^-?\d+$/.test(cleaned)) {
      throw new Error(`"${input.name}" must be a whole number, got "${text}"`);
    }
    return { kind: "integer", value: Number.parseInt(cleaned, 10) };
  }
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`"${input.name}" must be a number, got "${text}"`);
  }
  return { kind: "decimal", value: cleaned };
}

export function entityIdFor(entity: string): string {
  return `${entity.toLowerCase()}-1`;
}

/**
 * One input record per discovered input, named by its durable reference.
 * The app models a single household (one entity id per entity kind,
 * no relations) — datasets with related entities are a CLI affair for now.
 */
export function buildDataset(
  inputs: DiscoveredInput[],
  answers: Record<string, string>,
  interval: Interval,
): Dataset {
  const records: InputRecord[] = inputs.map((input) => ({
    name: input.ref,
    entity: input.entity,
    entity_id: entityIdFor(input.entity),
    interval,
    value: parseAnswer(answers[input.ref] ?? "", input),
  }));
  return { inputs: records, relations: [] };
}

export interface BuildRequestOptions {
  inputs: DiscoveredInput[];
  answers: Record<string, string>;
  /** Calendar month the determination covers, e.g. "2026-01". */
  month: string;
  /** Durable id of the output to determine. */
  outputId: string;
  /** Entity the output is computed for (defaults to Household). */
  entity?: string;
  mode?: ExecutionMode;
}

export function buildRequest(options: BuildRequestOptions): CompiledExecutionRequest {
  const interval = monthInterval(options.month);
  return {
    mode: options.mode ?? "explain",
    dataset: buildDataset(options.inputs, options.answers, interval),
    queries: [
      {
        entity_id: entityIdFor(options.entity ?? "Household"),
        period: { period_kind: "month", ...interval },
        outputs: [options.outputId],
      },
    ],
  };
}
