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
