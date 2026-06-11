/**
 * The ink stamp pressed beside every determination. Pure SVG, circular
 * text on a path, sealing-wax red — the closest a div gets to a notary.
 */
export function Seal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      aria-hidden="true"
      style={{ transform: "rotate(-8deg)" }}
    >
      <defs>
        <path id="seal-circle" d="M 60,60 m -44,0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0" />
      </defs>
      <circle
        cx="60"
        cy="60"
        r="56"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.85"
      />
      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="0.75" />
      <circle cx="60" cy="60" r="33" fill="none" stroke="currentColor" strokeWidth="0.75" />
      <text
        fontSize="9.2"
        letterSpacing="2.1"
        fill="currentColor"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <textPath href="#seal-circle" startOffset="0">
          COMPUTED LOCALLY · NOTHING TRANSMITTED ·
        </textPath>
      </text>
      <text
        x="60"
        y="72"
        textAnchor="middle"
        fontSize="34"
        fill="currentColor"
        style={{ fontFamily: "var(--font-display)" }}
      >
        §
      </text>
    </svg>
  );
}
