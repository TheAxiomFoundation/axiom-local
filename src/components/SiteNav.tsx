import Link from "next/link";

/** The three streams, always one click apart. */
export function SiteNav({ current }: { current: "start" | "example" | "docs" }) {
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
      {link("/", "Get started", "start")}
      {link("/docs/", "References", "docs")}
      {link("/example/", "Example", "example")}
      <a
        href="https://github.com/TheAxiomFoundation/axiom-playground"
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
