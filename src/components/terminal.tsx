import type { ReactNode } from "react";

/**
 * The record: terminal output set like a court transcript — numbered lines
 * in a gutter, a thin caption bar. Shared by all three pages; the visual
 * signature of the site.
 */

export function Record({
  caption,
  aside,
  children,
}: {
  caption?: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <div className="record">
      {caption ? (
        <div className="record-caption">
          <span>{caption}</span>
          {aside ? <span>{aside}</span> : null}
        </div>
      ) : null}
      <div className="record-body">{children}</div>
    </div>
  );
}

/** One numbered line of the record. */
export function L({ children }: { children?: ReactNode }) {
  return <div className="rec-line">{children ?? " "}</div>;
}

/** A command line: muted prompt, bright command. */
export function Cmd({ children }: { children: ReactNode }) {
  return (
    <L>
      <span className="select-none text-code-comment">$ </span>
      {children}
    </L>
  );
}

export const num = (value: string) => <span className="text-code-number">{value}</span>;
export const ok = (value: string) => <span className="text-code-function">{value}</span>;
export const no = (value: string) => <span className="text-code-string">{value}</span>;
export const id = (value: string) => <span className="text-code-attribute">{value}</span>;
export const dim = (value: string) => <span className="text-code-comment">{value}</span>;
export const kw = (value: string) => <span className="text-code-keyword">{value}</span>;
export const pin = (value: string) => (
  <span className="border-b-2 border-code-keyword text-code-keyword">{value}</span>
);
