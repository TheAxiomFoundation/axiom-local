/**
 * What the page is running: either RuleSpec modules compiled in the tab
 * (the teaching pair, or whatever the visitor pasted), or a vendored
 * runtime package — a composed compiled artifact plus the descriptor that
 * makes it answerable with a handful of headline questions.
 *
 * The package is fetched at startup, alongside the engine, before the
 * network sentinel arms — the zero-requests claim covers determinations,
 * and determinations never fetch.
 */

import type { GoldenPackage } from "./goldenPath";

export type ProgramSource =
  | { kind: "modules"; modules: Record<string, string>; rootTarget: string; isExample: boolean }
  | { kind: "package"; pkg: GoldenPackage; artifactJson: string };

export interface LoadedPackage {
  pkg: GoldenPackage;
  artifactJson: string;
  /** sha-256 of the fetched artifact bytes, to compare against the descriptor's pin. */
  fetchedSha256: string;
}

let packagePromise: Promise<LoadedPackage> | null = null;

export function loadGoldenPackage(programId: string): Promise<LoadedPackage> {
  packagePromise ??= load(programId);
  return packagePromise;
}

async function load(programId: string): Promise<LoadedPackage> {
  const base = `/programs/${programId}`;
  const [pkgResponse, artifactResponse] = await Promise.all([
    fetch(`${base}/package.json`),
    fetch(`${base}/artifact.json`),
  ]);
  if (!pkgResponse.ok) {
    throw new Error(`Fetching the package descriptor failed: HTTP ${pkgResponse.status}`);
  }
  if (!artifactResponse.ok) {
    throw new Error(`Fetching the compiled artifact failed: HTTP ${artifactResponse.status}`);
  }
  const pkg = (await pkgResponse.json()) as GoldenPackage;
  const artifactBytes = await artifactResponse.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", artifactBytes);
  const fetchedSha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const artifactJson = new TextDecoder().decode(artifactBytes);
  return { pkg, artifactJson, fetchedSha256 };
}
