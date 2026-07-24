"use client";

import { IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { TOUR_STEPS, nextStep, parseTourParam, prevStep, tourHref, type TourState } from "@/lib/tour";

/**
 * The guided overlay. State lives in the URL (?tour=<step>) so any step is a
 * deep link; the sandbox underneath is never disabled. Rendered as a fixed
 * card — bottom sheet on small screens, bottom-right card on large.
 */
export function Tour() {
  const [state, setState] = useState<TourState | null>(null);

  useEffect(() => {
    setState(parseTourParam(window.location.search));
  }, []);

  const go = useCallback((next: TourState) => {
    setState(next);
    const url = new URL(window.location.href);
    if (next.kind === "off") {
      url.searchParams.set("tour", "off");
    } else {
      url.searchParams.set("tour", TOUR_STEPS[next.index].id);
    }
    window.history.replaceState(null, "", url);
    if (next.kind === "at") {
      const anchor = document.getElementById(TOUR_STEPS[next.index].anchor);
      anchor?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  if (!state || state.kind === "off") return null;

  const step = TOUR_STEPS[state.index];
  const last = state.index === TOUR_STEPS.length - 1;

  return (
    <aside
      className="fixed inset-x-0 bottom-0 z-40 border-t border-brass/40 bg-ink-well/95 p-4 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-96 sm:border sm:p-5"
      role="complementary"
      aria-label={`Guided tour, step ${state.index + 1} of ${TOUR_STEPS.length}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="smallcaps text-[0.62rem] text-brass">
          the guided path · {state.index + 1} of {TOUR_STEPS.length}
        </p>
        <button
          type="button"
          className="text-faint transition-colors hover:text-parchment"
          aria-label="Dismiss the tour"
          onClick={() => go({ kind: "off" })}
        >
          <IconX size={16} aria-hidden="true" />
        </button>
      </div>
      <h2 className="mt-2 font-display text-xl font-semibold text-parchment">{step.title}</h2>
      <p className="mt-2 text-[0.88rem] font-light text-parchment-dim">{step.body}</p>
      <div className="mt-4 flex items-center gap-3">
        {state.index > 0 ? (
          <button
            type="button"
            className="btn-quiet px-3 py-1.5 font-mono text-[0.72rem] tracking-wide"
            onClick={() => go(prevStep(state))}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          className="btn-wax px-4 py-1.5 font-mono text-[0.72rem] tracking-wide"
          onClick={() => go(nextStep(state))}
        >
          {last ? "Finish" : "Next"}
        </button>
        <a className="ml-auto font-mono text-[0.65rem] text-faint hover:text-parchment" href={tourHref({ kind: "off" })}>
          skip the tour
        </a>
      </div>
    </aside>
  );
}
