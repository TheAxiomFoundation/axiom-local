import { SiteNav } from "./SiteNav";

/** Compact shared masthead: eyebrow, name, thesis, nav. */
export function Masthead({
  page,
  thesis,
}: {
  page: "start" | "example" | "docs";
  thesis: string;
}) {
  return (
    <header className="rise pt-12 text-center sm:pt-16">
      <p className="smallcaps text-accent">The Axiom Foundation · executable law</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Axiom playground
      </h1>
      <p className="mx-auto mt-3 max-w-2xl font-body text-[1.05rem] font-light italic text-ink-secondary">
        {thesis}
      </p>
      <SiteNav current={page} />
      <div className="double-rule mx-auto mt-7 w-40" aria-hidden="true" />
    </header>
  );
}
