/**
 * Loading the vendored wasm engine in the browser.
 *
 * The ES-module glue and the .wasm binary live under /public/engine (built
 * by `bun run engine:setup`, checked in). They are imported at runtime with
 * a plain dynamic import — deliberately outside the bundler — so the build
 * needs no wasm toolchain and the page makes exactly two engine requests,
 * both at load time. The binary is fetched once, hashed for the provenance
 * footer, and instantiated from those same bytes.
 */

import type { EngineBindings } from "./engine/types";

export interface LoadedEngine extends EngineBindings {
  engineVersion: string;
  artifactFormatVersion: number;
  wasmSha256: string;
  wasmByteLength: number;
}

interface EngineModule extends EngineBindings {
  default(options: { module_or_path: ArrayBuffer }): Promise<unknown>;
}

const ENGINE_JS_URL = "/engine/axiom_rules_engine_wasm.js";
const ENGINE_WASM_URL = "/engine/axiom_rules_engine_wasm_bg.wasm";

let enginePromise: Promise<LoadedEngine> | null = null;

export function loadEngine(): Promise<LoadedEngine> {
  enginePromise ??= load();
  return enginePromise;
}

async function load(): Promise<LoadedEngine> {
  // A non-literal specifier plus webpackIgnore keeps every bundler's hands
  // off this import: the browser resolves it against the deployed origin.
  const specifier = ENGINE_JS_URL;
  const module = (await import(/* webpackIgnore: true */ specifier)) as EngineModule;

  const response = await fetch(ENGINE_WASM_URL);
  if (!response.ok) {
    throw new Error(`Fetching the engine binary failed: HTTP ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const wasmSha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  await module.default({ module_or_path: bytes });

  return {
    compile: module.compile,
    execute: module.execute,
    engine_version: module.engine_version,
    artifact_format_version: module.artifact_format_version,
    engineVersion: module.engine_version(),
    artifactFormatVersion: module.artifact_format_version(),
    wasmSha256,
    wasmByteLength: bytes.byteLength,
  };
}
