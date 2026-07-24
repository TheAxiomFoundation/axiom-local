/**
 * The guided tour's step machine — pure data and pure functions, so the
 * whole flow is unit-testable without a DOM. The Tour component renders
 * whatever this module says the current step is.
 *
 * Deep links: ?tour=<id> restores any step; ?tour=off suppresses the tour
 * for the visit. The sandbox underneath is never disabled — a visitor can
 * wander off-script at any step and the page still works.
 */

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** DOM id the step points at (scrolled into view when the step opens). */
  anchor: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: "landed",
    title: "This already happened",
    body:
      "The page you are on just ran a real SNAP determination for a Colorado household of two — " +
      "$1,200 monthly earned income, $900 shelter costs — through the full compiled program: " +
      "319 rules composed from 7 USC 2011–2036, 7 CFR 273, and 10 CCR 2506-1. " +
      "The verdict panel shows the monthly allotment. No server was involved.",
    anchor: "determination-panel",
  },
  {
    id: "touch",
    title: "Change an answer",
    body:
      "Amend the household's earned income and run again. The determination re-executes in this " +
      "tab — watch the network counter in the strip above stay exactly where it is. " +
      "Your answers are facts in this page's memory, nowhere else.",
    anchor: "household-panel",
  },
  {
    id: "trace",
    title: "Open the chain of citation",
    body:
      "Every value in the verdict unfolds. Expand the trace: each derived figure, statutory " +
      "parameter, and answer you gave carries the durable legal id it came from — down to the " +
      "USDA allotment table entry and its effective date. This is not a calculator that cites " +
      "law; it is law, executing.",
    anchor: "determination-panel",
  },
  {
    id: "law",
    title: "Change the law",
    body:
      "The program is data. Amend a statutory parameter — say the earned-income deduction rate " +
      "from 20% to 30% — and the same household's allotment moves. The amendment happens to the " +
      "compiled artifact in this tab; current law is one click away, untouched.",
    anchor: "program-panel",
  },
  {
    id: "exit",
    title: "Take it with you",
    body:
      "Everything you just did is available where you work: every rule readable beside its " +
      "source law in the Axiom app, the same artifact built to run on your own machine, and " +
      "the same tests to challenge if you find the law encoded wrong.",
    anchor: "take-it-with-you",
  },
];

export type TourState = { kind: "off" } | { kind: "at"; index: number };

export function parseTourParam(search: string): TourState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const raw = params.get("tour");
  if (raw === "off") return { kind: "off" };
  if (raw === null || raw === "") return { kind: "at", index: 0 };
  const index = TOUR_STEPS.findIndex((step) => step.id === raw);
  return index === -1 ? { kind: "at", index: 0 } : { kind: "at", index };
}

export function tourHref(state: TourState): string {
  if (state.kind === "off") return "?tour=off";
  return `?tour=${TOUR_STEPS[state.index].id}`;
}

export function nextStep(state: TourState): TourState {
  if (state.kind === "off") return state;
  if (state.index >= TOUR_STEPS.length - 1) return { kind: "off" };
  return { kind: "at", index: state.index + 1 };
}

export function prevStep(state: TourState): TourState {
  if (state.kind === "off") return state;
  return { kind: "at", index: Math.max(0, state.index - 1) };
}
