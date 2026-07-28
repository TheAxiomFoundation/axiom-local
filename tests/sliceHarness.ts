/**
 * Shared subtree-slicing harness for the test suite: the explorer's and the
 * CLI's exact machinery — resolve a root's import closure from the vendored
 * corpus, compile it in the nodejs wasm build, synthesize the runnable
 * descriptor, probe entity attribution to a fixpoint. Tests skip when
 * public/corpus/ has not been generated (it is gitignored; CI regenerates
 * it from corpus.lock.json).
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CompiledProgramArtifact, EngineBindings } from "@/lib/engine/types";
import {
  moduleUrl,
  probeFixpoint,
  resolveClosure,
  synthesizePackage,
  type CorpusManifest,
} from "@/lib/corpus";
import type { GoldenPackage } from "@/lib/goldenPath";

const require = createRequire(import.meta.url);
export const engine = require(
  "../engine/pkg-node/axiom_rules_engine_wasm.js",
) as EngineBindings;

export const corpusDir = join(__dirname, "..", "public", "corpus");
export const haveCorpus = existsSync(join(corpusDir, "manifest.json"));

/** The suite's worked example: pure 7 CFR 273.10 — the SNAP benefit computation. */
export const GOLDEN_ROOT = "us:regulations/7-cfr/273/10";

export function loadManifest(): CorpusManifest {
  return JSON.parse(readFileSync(join(corpusDir, "manifest.json"), "utf8")) as CorpusManifest;
}

export interface CompiledSlice {
  closure: string[];
  artifactJson: string;
  artifact: CompiledProgramArtifact;
}

/** Resolve + compile a root's closure — no descriptor synthesis. */
export function compileAt(manifest: CorpusManifest, root: string): CompiledSlice {
  const closure = resolveClosure(manifest, root);
  const modules = Object.fromEntries(
    closure.map((target) => [
      target,
      readFileSync(join(corpusDir, moduleUrl(target).replace("/corpus/", "")), "utf8"),
    ]),
  );
  const artifactJson = engine.compile(JSON.stringify(modules), root);
  return { closure, artifactJson, artifact: JSON.parse(artifactJson) as CompiledProgramArtifact };
}

export interface RunnableSlice extends CompiledSlice {
  pkg: GoldenPackage;
}

/** The full slice path: compile, synthesize the descriptor, probe to a fixpoint. */
export function sliceAt(manifest: CorpusManifest, root: string): RunnableSlice {
  const compiled = compileAt(manifest, root);
  const { pkg } = synthesizePackage(
    compiled.artifact,
    root,
    manifest.sources[0]?.commit ?? "unknown",
  );
  probeFixpoint(engine, compiled.artifactJson, compiled.artifact, pkg);
  return { ...compiled, pkg };
}
