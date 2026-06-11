"use client";

import { IconChevronRight, IconCopy } from "@tabler/icons-react";
import { useState } from "react";
import type { DisplayNode } from "@/lib/trace";

const ORIGIN_LABELS: Record<DisplayNode["origin"], string> = {
  derived: "derived",
  parameter: "statute",
  input: "answer",
};

const ORIGIN_CLASSES: Record<DisplayNode["origin"], string> = {
  derived: "text-brass border-brass-deep/60",
  parameter: "text-sienna border-sienna/50",
  input: "text-lamp border-lamp-deep/70",
};

function DurableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="group/id flex max-w-full items-center gap-1.5 text-left font-mono text-[0.68rem] text-faint transition-colors hover:text-brass"
      title={`${id} — click to copy`}
      onClick={() => {
        void navigator.clipboard?.writeText(id).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <span className="truncate">{id}</span>
      <IconCopy
        size={11}
        aria-hidden="true"
        className="shrink-0 opacity-0 transition-opacity group-hover/id:opacity-70"
      />
      {copied ? <span className="shrink-0 text-lamp">copied</span> : null}
    </button>
  );
}

function TraceRow({ node, depth }: { node: DisplayNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const expandable = node.children.length > 0;

  return (
    <div className={depth > 0 ? "border-l border-rule pl-4 sm:pl-5" : ""}>
      <div className="group py-2">
        <div className="flex items-baseline">
          {expandable ? (
            <button
              type="button"
              className="mr-1 -ml-1 self-center text-faint transition-transform hover:text-brass"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
            >
              <IconChevronRight size={14} aria-hidden="true" />
            </button>
          ) : (
            <span className="mr-1 w-[14px] shrink-0" aria-hidden="true" />
          )}
          <span
            className={`mr-2.5 shrink-0 border px-1.5 py-px font-mono text-[0.55rem] uppercase tracking-[0.18em] ${ORIGIN_CLASSES[node.origin]}`}
          >
            {ORIGIN_LABELS[node.origin]}
          </span>
          <span className="font-mono text-[0.85rem] text-parchment">{node.label}</span>
          <span className="leader" aria-hidden="true" />
          <span className="shrink-0 font-mono text-[0.95rem] font-bold text-parchment">
            {node.valueText ?? "—"}
          </span>
        </div>

        <div className="ml-[14px] mt-0.5 space-y-0.5 pl-[3.2rem] sm:pl-[3.4rem]">
          <DurableId id={node.refId} />
          {node.note ? (
            <p className="font-mono text-[0.68rem] italic text-faint">{node.note}</p>
          ) : null}
          {node.formula ? (
            <p className="font-mono text-[0.72rem] text-parchment-dim">
              <span className="text-faint">= </span>
              {node.formula}
            </p>
          ) : null}
          {node.substituted && node.substituted !== node.formula ? (
            <p className="font-mono text-[0.72rem] text-sienna">
              <span className="text-faint">= </span>
              {node.substituted}
            </p>
          ) : null}
          {node.source || node.sourceUrl ? (
            <p className="font-mono text-[0.68rem] text-faint">
              {node.sourceUrl ? (
                <a href={node.sourceUrl} target="_blank" rel="noreferrer">
                  {node.source ?? node.sourceUrl}
                </a>
              ) : (
                node.source
              )}
            </p>
          ) : null}
        </div>
      </div>

      {expandable ? (
        <div className={`tree-children ${open ? "open" : ""}`}>
          <div>
            <div className="ml-[14px]">
              {node.children.map((child) => (
                <TraceRow key={child.key} node={child} depth={depth + 1} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TraceTree({ root }: { root: DisplayNode }) {
  return (
    <div className="well px-4 py-3 sm:px-5">
      <TraceRow node={root} depth={0} />
    </div>
  );
}
