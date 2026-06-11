import type { ReactNode } from "react";

export function PanelHeading({
  section,
  title,
  aside,
}: {
  section: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="double-rule flex flex-wrap items-baseline gap-x-4 gap-y-1 pb-3 pt-4">
      <h2 className="flex items-baseline gap-3 whitespace-nowrap">
        <span className="font-display text-xl text-brass" aria-hidden="true">
          § {section}
        </span>
        <span className="smallcaps text-parchment-dim">{title}</span>
      </h2>
      {aside ? (
        <div className="smallcaps ml-auto text-right text-[0.62rem] normal-nums text-faint">
          {aside}
        </div>
      ) : null}
    </div>
  );
}
