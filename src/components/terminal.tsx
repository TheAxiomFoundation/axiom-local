import type { ReactNode } from "react";

import { CopyButton } from "./CopyButton";

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
    <div className="record relative">
      {caption ? (
        <div className="record-caption">
          <span>{caption}</span>
          <span className="flex items-center gap-3">
            {aside ? <span>{aside}</span> : null}
            <CopyButton />
          </span>
        </div>
      ) : (
        <div className="absolute right-3 top-2 z-10">
          <CopyButton />
        </div>
      )}
      <div className="record-body">{children}</div>
    </div>
  );
}

/** One numbered line of the record. */
export function L({ children }: { children?: ReactNode }) {
  return <div className="rec-line">{children ?? " "}</div>;
}

/** A command line: muted prompt, bright command. Marked data-cmd so the
 * copy button can copy commands without the surrounding output lines. */
export function Cmd({ children }: { children: ReactNode }) {
  return (
    <div className="rec-line" data-cmd="">
      <span className="select-none text-code-comment">$ </span>
      {children}
    </div>
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
