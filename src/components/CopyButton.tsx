"use client";

import { useRef, useState } from "react";

/**
 * Text-only copy affordance for a record. When the record contains command
 * lines ([data-cmd]), only those are copied — pasting a record into a shell
 * must never execute its output lines. Pure-output records copy whole.
 */
export function CopyButton() {
  const ref = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const body = ref.current?.closest(".record")?.querySelector(".record-body");
    if (!body) return;
    const commands = body.querySelectorAll(".rec-line[data-cmd]");
    const lines = commands.length > 0 ? commands : body.querySelectorAll(".rec-line");
    const text = Array.from(lines)
      .map((line) => {
        const raw = (line as HTMLElement).innerText.replace(/\n/g, "");
        return raw.startsWith("$ ") ? raw.slice(2) : raw;
      })
      .join("\n")
      .replace(/\s+$/, "");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={copy}
      aria-label="Copy to clipboard"
      className="cursor-pointer select-none font-mono text-[0.62rem] uppercase tracking-wider text-code-comment transition-colors hover:text-code-text"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}
