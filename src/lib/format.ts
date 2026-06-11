import type { JudgmentOutcome, ScalarValue } from "./engine/types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
};

/** "1234.5" → "1,234.50"; "298" → "298"; trims to at most 2 decimals for money. */
function formatMoneyNumber(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const hasFraction = Math.abs(n % 1) > 1e-9;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Render a scalar value for display. Money units get their symbol; everything
 * else is shown exactly as the engine reported it — the playground never
 * rounds a value the statute didn't.
 */
export function formatScalarValue(value: ScalarValue, unit?: string | null): string {
  switch (value.kind) {
    case "bool":
      return value.value ? "true" : "false";
    case "integer":
    case "decimal": {
      const raw = String(value.value);
      if (unit && CURRENCY_SYMBOLS[unit]) {
        const negative = raw.trim().startsWith("-");
        const magnitude = formatMoneyNumber(negative ? raw.trim().slice(1) : raw);
        return `${negative ? "−" : ""}${CURRENCY_SYMBOLS[unit]}${magnitude}`;
      }
      if (unit) return `${raw} ${unit}`;
      return raw;
    }
    case "text":
      return value.value;
    case "date":
      return value.value;
  }
}

export function formatOutcome(outcome: JudgmentOutcome): string {
  switch (outcome) {
    case "holds":
      return "holds";
    case "not_holds":
      return "does not hold";
    case "undetermined":
      return "undetermined";
  }
}

/** "snap_regular_month_allotment" → "Snap regular month allotment". */
export function prettifyName(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "2026-01" → "January 2026" (UTC-safe, no Date parsing ambiguity). */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map((part) => Number.parseInt(part, 10));
  if (!y || !m || m < 1 || m > 12) return ym;
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${names[m - 1]} ${y}`;
}
