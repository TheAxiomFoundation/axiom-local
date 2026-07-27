/**
 * Browser-side loader for the vendored web-target wasm engine. The glue is
 * served from /engine/ and deliberately not bundled, so the page runs the
 * exact bytes the repo pins. Shared by the Runner (execute over vendored
 * artifacts) and the CorpusExplorer (compile + execute over corpus slices).
 */

export interface EngineModule {
  compile(modules_json: string, root_target: string): string;
  execute(artifact_json: string, request_json: string): string;
  engine_version(): string;
  artifact_format_version(): number;
}

let enginePromise: Promise<EngineModule> | null = null;

export function loadEngine(): Promise<EngineModule> {
  enginePromise ??= (async () => {
    const glue = (await import(
      /* webpackIgnore: true */
      // @ts-expect-error — runtime URL import of the vendored web wasm glue
      "/engine/axiom_rules_engine_wasm.js"
    )) as { default: (path: { module_or_path: string }) => Promise<unknown> } & EngineModule;
    await glue.default({ module_or_path: "/engine/axiom_rules_engine_wasm_bg.wasm" });
    return glue;
  })();
  return enginePromise;
}
