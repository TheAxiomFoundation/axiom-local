"use client";

import type { ReactNode } from "react";

/**
 * A small, honest YAML tinter for read-only statute display. It does not
 * parse YAML — it typesets it: keys in brass, figures in sienna, comments
 * in a librarian's pencil. Courier Prime does the rest.
 */

const NUMBERISH = /^-?\d+(\.\d+)?$/;
const DATEISH = /^\d{4}-\d{2}-\d{2}$/;

function renderValue(value: string, key: number): ReactNode {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (NUMBERISH.test(trimmed) || DATEISH.test(trimmed)) {
    return (
      <span key={key} className="text-sienna">
        {value}
      </span>
    );
  }
  if (/^["'].*["']$/.test(trimmed)) {
    return (
      <span key={key} className="text-sienna">
        {value}
      </span>
    );
  }
  return (
    <span key={key} className="text-parchment">
      {value}
    </span>
  );
}

function renderLine(line: string): ReactNode {
  if (line.trimStart().startsWith("#")) {
    return <span className="italic text-faint">{line}</span>;
  }

  const keyed = /^(\s*)(- )?([A-Za-z0-9_.-]+):(.*)$/.exec(line);
  if (keyed) {
    const [, indent, dash, key, rest] = keyed;
    return (
      <>
        <span>{indent}</span>
        {dash ? <span className="text-brass-deep">{dash}</span> : null}
        <span className="text-brass">{key}</span>
        <span className="text-faint">:</span>
        {renderValue(rest, 0)}
      </>
    );
  }

  const listed = /^(\s*)- (.*)$/.exec(line);
  if (listed) {
    const [, indent, rest] = listed;
    return (
      <>
        <span>{indent}</span>
        <span className="text-brass-deep">- </span>
        {renderValue(rest, 0)}
      </>
    );
  }

  return <span className="text-parchment">{line}</span>;
}

export function YamlView({ yaml }: { yaml: string }) {
  const lines = yaml.replace(/^\n+/, "").replace(/\s+$/, "").split("\n");
  return (
    <pre className="overflow-x-auto px-4 py-4 font-mono text-[0.82rem] leading-[1.55]">
      <code>
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span className="w-7 shrink-0 select-none pr-3 text-right text-[0.7rem] leading-[1.8] text-faint/60">
              {index + 1}
            </span>
            <span className="whitespace-pre">{renderLine(line)}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}
