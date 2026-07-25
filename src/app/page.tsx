import { GetStarted } from "@/components/GetStarted";
import { ProvenanceFooter } from "@/components/ProvenanceFooter";
import { TakeItWithYou } from "@/components/TakeItWithYou";

export default function Home() {
  return (
    <div className="relative mx-auto max-w-6xl px-5 pb-16 sm:px-8">
      <div className="lamplight" aria-hidden="true" />

      <header className="rise pt-14 text-center sm:pt-20">
        <p className="smallcaps text-accent">The Axiom Foundation · executable law</p>
        <h1 className="mt-5 font-display text-6xl font-semibold tracking-tight text-ink sm:text-7xl">
          Axiom playground
        </h1>
        <p className="mx-auto mt-5 max-w-2xl font-body text-lg font-light italic text-ink-secondary">
          Statutes compiled to WebAssembly, determinations rendered on your machine — the law
          never needs a server.
        </p>
        <div className="double-rule mx-auto mt-9 w-40" aria-hidden="true" />
      </header>

      <GetStarted />
      <TakeItWithYou />
      <ProvenanceFooter />
    </div>
  );
}
