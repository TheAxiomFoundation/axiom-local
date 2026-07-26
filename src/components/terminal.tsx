import type { ReactNode } from "react";

/** Shared terminal-transcript primitives for all three pages. */

export function Term({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap bg-code-bg px-4 py-3.5 font-mono text-[0.78rem] leading-[1.7] text-code-text [overflow-wrap:anywhere]">
      {children}
    </pre>
  );
}

/** A command line: muted prompt, bright command. */
export function Cmd({ children }: { children: ReactNode }) {
  return (
    <>
      <span className="select-none text-code-comment">$ </span>
      <span>{children}</span>
      {"\n"}
    </>
  );
}

export const num = (value: string) => <span className="text-code-number">{value}</span>;
export const ok = (value: string) => <span className="text-code-function">{value}</span>;
export const id = (value: string) => <span className="text-code-attribute">{value}</span>;
export const dim = (value: string) => <span className="text-code-comment">{value}</span>;
export const kw = (value: string) => <span className="text-code-keyword">{value}</span>;
