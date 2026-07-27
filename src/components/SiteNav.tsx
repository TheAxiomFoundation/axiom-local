import Link from "next/link";

/** The three streams, always one click apart. */
export function SiteNav({ current }: { current: "start" | "example" | "docs" | "run" }) {
  const link = (href: string, label: string, key: string) =>
    current === key ? (
      <span className="border-b border-accent pb-0.5 text-accent">{label}</span>
    ) : (
      <Link
        href={href}
        style={{ textDecoration: "none" }}
        className="text-ink-secondary hover:text-accent"
      >
        {label}
      </Link>
    );
  return (
    <nav
      className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[0.75rem] tracking-wide"
      aria-label="Pages"
    >
      {link("/", "Run", "start")}
      {link("/run/", "Explore the graph", "run")}
      {link("/example/", "Example", "example")}
      {link("/docs/", "References", "docs")}
      <a
        href="https://github.com/TheAxiomFoundation/axiom-local"
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none" }}
        className="text-ink-secondary hover:text-accent"
      >
        GitHub ↗
      </a>
    </nav>
  );
}
