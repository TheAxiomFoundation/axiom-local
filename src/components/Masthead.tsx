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
  page: "start" | "example" | "docs" | "run";
  thesis: string;
}) {
  return (
    <header className="rise mx-auto max-w-4xl pt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href="https://axiom-foundation.org"
            aria-label="Axiom Foundation"
            className="inline-flex w-[100px] shrink-0 no-underline"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/axiom-foundation.svg"
              alt="Axiom Foundation"
              width={100}
              className="block h-auto w-full"
            />
          </a>
          <span className="flex min-w-0 items-center self-stretch border-l border-rule pl-3">
            <span className="font-serif text-[16px] font-normal leading-tight text-ink">Local</span>
          </span>
        </div>
        <SiteNav current={page} />
      </div>
      <h1 className="mt-10 max-w-3xl font-display text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
        {thesis}
      </h1>
    </header>
  );
}
