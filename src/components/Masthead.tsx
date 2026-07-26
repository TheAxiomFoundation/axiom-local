import { SiteNav } from "./SiteNav";

/**
 * Editorial masthead: a quiet top bar (wordmark left, streams right), then
 * the page's thesis as the display headline — left-aligned, like a filing's
 * caption, not a centered marketing block.
 */
export function Masthead({
  page,
  thesis,
}: {
  page: "start" | "example" | "docs";
  thesis: string;
}) {
  return (
    <header className="rise mx-auto max-w-4xl pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule pb-4">
        <div>
          <p className="smallcaps text-[0.6rem] text-accent">The Axiom Foundation</p>
          <p className="font-display text-xl font-semibold tracking-tight text-ink">
            Axiom playground
          </p>
        </div>
        <SiteNav current={page} />
      </div>
      <h1 className="mt-10 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
        {thesis}
      </h1>
    </header>
  );
}
