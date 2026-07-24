/** The tour step machine: deep links, ordering, and termination. */

import { describe, expect, it } from "vitest";
import { TOUR_STEPS, nextStep, parseTourParam, prevStep, tourHref } from "@/lib/tour";

describe("tour deep links", () => {
  it("starts at the first step with no parameter", () => {
    expect(parseTourParam("")).toEqual({ kind: "at", index: 0 });
    expect(parseTourParam("?other=1")).toEqual({ kind: "at", index: 0 });
  });

  it("restores any step by id", () => {
    for (const [index, step] of TOUR_STEPS.entries()) {
      expect(parseTourParam(`?tour=${step.id}`)).toEqual({ kind: "at", index });
    }
  });

  it("honours ?tour=off and unknown ids fall back to the start", () => {
    expect(parseTourParam("?tour=off")).toEqual({ kind: "off" });
    expect(parseTourParam("?tour=never-a-step")).toEqual({ kind: "at", index: 0 });
  });

  it("round-trips through tourHref", () => {
    for (const [index] of TOUR_STEPS.entries()) {
      const state = { kind: "at", index } as const;
      expect(parseTourParam(tourHref(state))).toEqual(state);
    }
    expect(parseTourParam(tourHref({ kind: "off" }))).toEqual({ kind: "off" });
  });
});

describe("tour ordering", () => {
  it("advances through every step then ends", () => {
    let state = parseTourParam("");
    const seen: string[] = [];
    while (state.kind === "at") {
      seen.push(TOUR_STEPS[state.index].id);
      state = nextStep(state);
    }
    expect(seen).toEqual(TOUR_STEPS.map((step) => step.id));
  });

  it("backs up but never past the start", () => {
    let state = parseTourParam("?tour=touch");
    state = prevStep(state);
    expect(state).toEqual({ kind: "at", index: 0 });
    state = prevStep(state);
    expect(state).toEqual({ kind: "at", index: 0 });
  });

  it("every anchor is a stable id and every step has copy", () => {
    for (const step of TOUR_STEPS) {
      expect(step.anchor).toMatch(/^[a-z-]+$/);
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(40);
    }
  });
});
