import type { ReactNode } from "react";

export function PanelHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="double-rule flex flex-wrap items-baseline gap-x-4 gap-y-1 pb-3 pt-4">
      <h2 className="whitespace-nowrap">
        <span className="smallcaps text-ink-secondary">{title}</span>
      </h2>
      {aside ? (
        <div className="smallcaps ml-auto text-right text-[0.62rem] normal-nums text-ink-muted">
          {aside}
        </div>
      ) : null}
    </div>
  );
}
