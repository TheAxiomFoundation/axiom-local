// Product analytics (PostHog). Loaded by Next.js as the client
// instrumentation entry — runs in the browser only, once per page load.
import posthog from "posthog-js";

declare global {
  interface Window {
    __posthogInitialized?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__posthogInitialized) {
  window.__posthogInitialized = true;
  posthog.init("phc_mrEaBroaYTRUrdkfhJYBGMpafKXWEdUyw5VPQnheh37m", {
    api_host: "https://us.i.posthog.com",
    defaults: "2026-01-30",
    person_profiles: "identified_only",
    respect_dnt: true,
    capture_pageview: "history_change",
  });
}
