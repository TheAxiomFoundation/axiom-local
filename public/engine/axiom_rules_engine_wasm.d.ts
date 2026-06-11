/* tslint:disable */
/* eslint-disable */

/**
 * The artifact format version this engine writes and the newest it accepts
 * (re-exported from the core), for provenance display in UIs.
 */
export function artifact_format_version(): number;

/**
 * Compile the RuleSpec module graph rooted at `root_target`.
 *
 * `modules_json` is a JSON object mapping canonical targets (for example
 * `"us:policies/usda/snap/fy-2026-cola/maximum-allotments"`) to RuleSpec
 * YAML text. Every module the root (transitively) imports must be present
 * under its canonical target; relative imports are resolved against the
 * importer's canonical target, exactly as on a filesystem checkout, so
 * durable ids are identical across hosts.
 *
 * Returns the `CompiledProgramArtifact` serialized as JSON — the same
 * artifact format the CLI's `compile` subcommand writes, suitable for
 * caching and for [`execute`].
 */
export function compile(modules_json: string, root_target: string): string;

/**
 * Version of the core `axiom-rules-engine` crate compiled into this binary,
 * for provenance display in UIs. Matches the `engine_version` stamped into
 * artifacts returned by [`compile`].
 */
export function engine_version(): string;

/**
 * Execute a `CompiledExecutionRequest` against a compiled artifact.
 *
 * `artifact_json` is the JSON produced by [`compile`] (or by the CLI's
 * `compile` subcommand — the formats are identical); `request_json` is a
 * `CompiledExecutionRequest` (`mode`, `dataset`, `queries`). Returns the
 * `ExecutionResponse` as JSON, byte-compatible with the CLI's `execute`
 * subcommand output.
 *
 * Artifacts newer than this engine's supported format version are rejected,
 * mirroring the core's load-time check.
 */
export function execute(artifact_json: string, request_json: string): string;

export function init(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly artifact_format_version: () => number;
    readonly compile: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly engine_version: () => [number, number];
    readonly execute: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly init: () => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
