/**
 * Slicing the served corpus: resolve a root target's import closure from the
 * manifest, compile it (caller supplies the engine — web wasm in the page,
 * nodejs wasm in tests), and synthesize the descriptor that makes the slice
 * runnable — the same screening-presumption shape the vendored packages
 * carry, derived instead of curated:
 *
 *   - dtypes from the artifact's own comparison literals (bool/text
 *     evidence, text inputs collect their enum options), else discovery
 *     flavor — the exact heuristic scripts/build-packages.mjs uses
 *   - one instance per entity kind, no relations
 *   - entity attribution corrected by engine probes to a fixpoint, bare-name
 *     inputs admitted by probing each module's namespace
 *
 * A slice compiled here is VALID (well-formed, cited, from the pinned
 * corpus) but not parity-PINNED like the cataloged programs — callers must
 * keep that distinction visible (docs/artifact-distribution.md).
 *
 * CERTIFIED-NODE GATE: a slice is servable only if its full node closure
 * is certified by the vendored ledger (public/corpus/ledger.json). The
 * gate runs post-compile — assertArtifactCertified(artifact, defaults
 * keys, ledger) in src/lib/certified.ts — because the manifest's rule
 * names include provenance shells (`restates_*`, relation declarations)
 * that never compile into nodes, so a name-level check here would refuse
 * valid roots. Every slicing caller (the explorer, the vendor script, the
 * tests) must apply it before rendering or executing anything; refusals
 * list the uncertified ids, which is acceptable in this dev-tooling
 * context and nowhere else.
 */

import type { CompiledProgramArtifact } from "./engine/types";
import {
  buildPackageRequest,
  type GoldenAnswers,
  type GoldenPackage,
  type PackageDefault,
} from "./goldenPath";
import { discoverInputs } from "./program";

export interface CorpusManifest {
  format: string;
  sources: { repo: string; commit: string }[];
  modules: CorpusModuleEntry[];
}

export interface CorpusModuleEntry {
  target: string;
  jurisdiction: string;
  imports: string[];
  rules: string[];
  /**
   * The module's headline derived rule (src/lib/headline.ts), precomputed
   * by scripts/build-corpus.mjs — catalog entries lead with its humanized
   * name. Absent for parameter/citation shells.
   */
  headline?: string;
}

/**
 * Axiom-authored assembly is never served as law: state-plan composition
 * bridges, fy-2026 benefit-calculation compositions, `composition` policy
 * buckets, and — bucket-agnostic — the mis-kinded `pilot_*_oracle_pipeline`
 * family that lives even inside statute/regulation buckets. Mirrors
 * `isCompositionPath` in axiom-api-runtime-sync/src/corpus-subtrees.ts.
 * Accepts both corpus targets (`us-ny:policies/...`) and citation-shaped
 * paths (`us-ny/policies/...`); only the first colon is a target separator
 * (statute paths can contain colons, e.g. `us-la:statutes/47:294`).
 *
 * These paths stay in the vendored manifest — the flagship's import
 * closure needs them to compile — but they are excluded from every corpus
 * listing UI and refused as slice roots (assertSliceableRoot below).
 */
export function isCompositionPath(target: string): boolean {
  const path = target.replace(":", "/");
  if (path.endsWith("_pipeline")) return true;
  if (!/\/(policy|policies)\//.test(`/${path}/`)) return false;
  return (
    path.includes("state-plan-composition") ||
    path.includes("fy-2026-benefit-calculation") ||
    path.endsWith("composition") ||
    path.includes("/composition")
  );
}

/**
 * The slice-root gate for the corpus explorer: composition/pipeline
 * assembly is not law and is not sliceable. The refusal is honest about
 * why, and points at what IS browsable.
 */
export function assertSliceableRoot(root: string): void {
  if (isCompositionPath(root)) {
    throw new Error(
      `${root} is Axiom-authored composition/pipeline assembly, not law — it is excluded ` +
        `from the corpus explorer and cannot be sliced. Slice the statute, regulation, or ` +
        `policy modules it composes instead.`,
    );
  }
}

/**
 * The subtree catalog — everything offerable. The corpus subtree is THE
 * unit this app serves (there is no vendored program registry): every
 * module in the vendored corpus is a root you can slice at, minus
 * axiom-authored composition/pipeline assembly (not law) and minus
 * rule-less modules (parameter/citation shells with nothing to run).
 */
export function subtreeCatalog(manifest: CorpusManifest): CorpusModuleEntry[] {
  return manifest.modules.filter(
    (entry) => entry.rules.length > 0 && !isCompositionPath(entry.target),
  );
}

/**
 * `us-co:regulations/10-ccr-2506-1/4.311.3` → `/corpus/modules/us-co/regulations/10-ccr-2506-1/4.311.3.yaml`.
 * Split on the FIRST colon only — statute paths can themselves contain
 * colons (e.g. `us-la:statutes/47:294`), and those are part of the path.
 */
export function moduleUrl(target: string): string {
  const colon = target.indexOf(":");
  return `/corpus/modules/${target.slice(0, colon)}/${target.slice(colon + 1)}.yaml`;
}

/** Transitive import closure of `root`, resolved against the manifest. */
export function resolveClosure(manifest: CorpusManifest, root: string): string[] {
  const byTarget = new Map(manifest.modules.map((entry) => [entry.target, entry]));
  const closure: string[] = [];
  const seen = new Set<string>();
  const queue = [root];
  while (queue.length > 0) {
    const target = queue.pop()!;
    if (seen.has(target)) continue;
    seen.add(target);
    const entry = byTarget.get(target);
    if (!entry) throw new Error(`Corpus manifest has no module "${target}"`);
    closure.push(target);
    for (const dep of entry.imports) if (!seen.has(dep)) queue.push(dep);
  }
  return closure;
}

interface EngineLike {
  execute(artifact_json: string, request_json: string): string;
  engine_version?(): string;
}

/**
 * Type evidence from the artifact's own comparisons: an input compared to a
 * bool/text literal is that type; text literals are collected as the input's
 * option domain. Generic JSON walk, exactly like scripts/build-packages.mjs.
 */
function collectLiteralEvidence(artifact: CompiledProgramArtifact): {
  evidence: Map<string, string>;
  options: Map<string, Set<string>>;
} {
  const evidence = new Map<string, string>();
  const options = new Map<string, Set<string>>();
  function walkNode(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walkNode(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const left = record.left as Record<string, unknown> | undefined;
    const right = record.right as Record<string, unknown> | undefined;
    if (record.op && left?.kind === "input" && right?.kind === "literal") {
      const literal = right.value as { kind?: string; value?: unknown } | undefined;
      if (literal && typeof literal.kind === "string") {
        const name = String(left.name);
        evidence.set(name, literal.kind);
        if (literal.kind === "text") {
          if (!options.has(name)) options.set(name, new Set());
          options.get(name)!.add(String(literal.value));
        }
      }
    }
    for (const value of Object.values(record)) walkNode(value);
  }
  for (const derived of artifact.program.derived) walkNode(derived.expr);
  return { evidence, options };
}

/**
 * Structural type demands the expressions make on inputs: names that must
 * not presume 0 — `div` denominators (anywhere in the denominator subtree,
 * including one level through a derived rule) and rate/wage-style inputs
 * multiplied inside a comparison (`earnings >= wage * 30` with wage 0 makes
 * the test vacuously true) — and names used where the engine requires a
 * date (`days_between` ends, `date_add_days`).
 */
export function collectStructuralDemands(artifact: CompiledProgramArtifact): {
  denominators: Set<string>;
  /** Rate/wage-style inputs multiplied inside comparisons: a 0 presumption
   * makes the test vacuous. Kept separate from denominators because curated
   * descriptors may deliberately rely on the vacuous pass. */
  rates: Set<string>;
  dates: Set<string>;
} {
  const denominators = new Set<string>();
  const rates = new Set<string>();
  const dates = new Set<string>();
  const derivedByName = new Map(artifact.program.derived.map((rule) => [rule.name, rule]));
  const inputName = (value: unknown): string | null => {
    const node = value as Record<string, unknown> | undefined;
    return node?.kind === "input" || node?.kind === "input_or_else" ? String(node.name) : null;
  };

  /** Every input name in a subtree; derived references resolved one level. */
  function collectInputsDeep(node: unknown, into: Set<string>, depth: number): void {
    if (Array.isArray(node)) {
      for (const item of node) collectInputsDeep(item, into, depth);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const name = inputName(record);
    if (name) into.add(name);
    if (record.kind === "derived" && depth > 0) {
      const rule = derivedByName.get(String(record.name));
      if (rule) collectInputsDeep(rule.expr, into, depth - 1);
    }
    for (const value of Object.values(record)) collectInputsDeep(value, into, depth);
  }

  function walkNode(node: unknown, inComparison: boolean): void {
    if (Array.isArray(node)) {
      for (const item of node) walkNode(item, inComparison);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.kind === "div") {
      collectInputsDeep(record.right, denominators, 1);
    }
    if (record.kind === "mul" && inComparison) {
      collectInputsDeep(record, rates, 0);
    }
    if (record.kind === "days_between") {
      for (const side of [record.from, record.to]) {
        const name = inputName(side);
        if (name) dates.add(name);
      }
    }
    if (record.kind === "date_add_days") {
      const name = inputName(record.date);
      if (name) dates.add(name);
    }
    const nowInComparison = inComparison || record.kind === "comparison";
    for (const value of Object.values(record)) walkNode(value, nowInComparison);
  }
  for (const derived of artifact.program.derived) walkNode(derived.expr, false);

  // A rule the compiler typed as a date computes from date inputs: mark
  // every input it reads as a date candidate. Bool/text literal evidence
  // takes precedence in the caller, so condition flags stay booleans.
  function markInputs(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) markInputs(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const name = inputName(record);
    if (name) dates.add(name);
    for (const value of Object.values(record)) markInputs(value);
  }
  for (const derived of artifact.program.derived) {
    if (/date/i.test(String(derived.dtype ?? ""))) markInputs(derived.expr);
  }
  return { denominators, rates, dates };
}

export interface SlicePackage {
  pkg: GoldenPackage;
  /** Output rule ids that belong to the root module itself. */
  rootOutputs: string[];
}

/**
 * Derive a runnable descriptor for an arbitrary slice: every discovered
 * input gets a screening presumption, every entity kind one instance, and
 * the root module's own rules become the queried outputs.
 */
export function synthesizePackage(
  artifact: CompiledProgramArtifact,
  root: string,
  corpusCommit: string,
): SlicePackage {
  const discovered = discoverInputs(artifact);
  const { evidence, options } = collectLiteralEvidence(artifact);
  const { denominators, rates, dates } = collectStructuralDemands(artifact);

  const defaults: Record<string, PackageDefault> = {};
  for (const input of discovered) {
    const seen = evidence.get(input.name);
    const dtype =
      seen === "bool"
        ? "bool"
        : seen === "text"
          ? "text"
          : seen === "date" || dates.has(input.name)
            ? "date"
            : input.flavor === "integer"
              ? "integer"
              : "decimal";
    // Counts and division denominators presume 1, not 0: a zero-member
    // household is never a sensible screening presumption, and a 0 in a
    // denominator traps the whole slice.
    const presumeOne =
      /(^|_)(size|count|number|members|persons)(_|$)/.test(input.name) ||
      denominators.has(input.name) ||
      rates.has(input.name);
    let value: unknown =
      dtype === "bool"
        ? false
        : dtype === "text"
          ? "none"
          : dtype === "date"
            ? "2026-01-01"
            : presumeOne
              ? "1"
              : "0";
    if (dtype === "text" && input.name.includes("frequency")) value = "monthly";
    const entry: PackageDefault = { name: input.name, entity: input.entity, dtype, value };
    const textOptions = options.get(input.name);
    if (dtype === "text" && textOptions?.size) entry.options = [...textOptions].sort();
    // A table-index input is only meaningful on the table's own keys: bound
    // the control to them and presume the smallest.
    if (input.tableKeys?.length && dtype !== "bool" && dtype !== "text") {
      entry.options = input.tableKeys;
      if (!input.tableKeys.includes(String(entry.value))) entry.value = input.tableKeys[0];
    }
    // Key by the ROOT-prefix spelling `<root>#input.<name>`, not the
    // per-module spelling discovery produces: the certification ledger
    // vouches for the package-prefix spelling (mirroring axiom-api's
    // input_legal_id_prefix), and the engine resolves bare-name reads
    // against it from any module. The same bare name read from several
    // modules collapses to ONE certified ref; the probe fixpoint
    // re-corrects entity attribution where readers disagreed.
    const ref = `${root}#input.${input.name}`;
    if (!defaults[ref]) defaults[ref] = entry;
  }

  const kinds = [...new Set(Object.values(defaults).map((slot) => slot.entity))];
  const entities = kinds.map((kind) => ({
    entity: kind,
    id_template: `${kind.toLowerCase()}:1`,
    count: 1,
  }));

  // The slice's outputs: the rules the root module itself defines.
  const rootRules = artifact.program.derived.filter((rule) => rule.id?.startsWith(`${root}#`));
  const outputRules = rootRules.length > 0 ? rootRules : artifact.program.derived.filter((r) => r.id);
  const outputs: Record<string, string> = {};
  for (const rule of outputRules) outputs[rule.name] = rule.id ?? rule.name;

  const queryEntity = outputRules[0]?.entity ?? kinds[0] ?? "Household";
  if (!kinds.includes(queryEntity)) {
    entities.push({ entity: queryEntity, id_template: `${queryEntity.toLowerCase()}:1`, count: 1 });
  }

  // The period every parameter is live for: each parameter needs its
  // earliest version; the slice needs the latest of those. A hard-coded
  // month strands modules whose schedules start later.
  let period = "2026-01";
  for (const parameter of artifact.program.parameters) {
    const earliest = parameter.versions.reduce(
      (min, version) => (version.effective_from < min ? version.effective_from : min),
      parameter.versions[0]?.effective_from ?? "",
    );
    const month = earliest.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(month) && month > period) period = month;
  }

  const pkg: GoldenPackage = {
    program_id: root,
    jurisdiction: root.split(":")[0],
    title: root,
    source: {
      repo: "corpus",
      artifact_path: root,
      artifact_sha256: corpusCommit,
      engine_version: artifact.engine_version ?? null,
      artifact_format_version: artifact.artifact_format_version ?? null,
    },
    query: { entity_id: `${queryEntity.toLowerCase()}:1` },
    entities,
    headline: [],
    outputs,
    default_period: period,
    example: { household: {}, people: {} },
    defaults,
  };
  return { pkg, rootOutputs: Object.values(outputs) };
}

const MISSING_INPUT = /missing input `([^`]+)` for entity `([^`]+)`/;

/**
 * Engine-guided fixpoint, ported from scripts/build-packages.mjs: execute
 * with the presumed answers; on "missing input for entity", either flip the
 * slot's entity attribution or admit an input discovery could not see by
 * probing `<module>#input.<name>` across the slice's modules. Mutates
 * `pkg.defaults` in place; returns counters for the provenance line.
 */
export function probeFixpoint(
  engine: EngineLike,
  artifactJson: string,
  artifact: CompiledProgramArtifact,
  pkg: GoldenPackage,
): { corrected: number; admitted: number } {
  const answers: GoldenAnswers = { household: {}, people: {}, refOverrides: {} };
  const { evidence } = collectLiteralEvidence(artifact);
  const { dates } = collectStructuralDemands(artifact);
  let corrected = 0;
  let admitted = 0;

  for (let round = 0; round < 500; round += 1) {
    const request = buildPackageRequest({ pkg, answers });
    try {
      engine.execute(artifactJson, JSON.stringify(request));
      return { corrected, admitted };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const missing = MISSING_INPUT.exec(message);
      if (!missing) throw new Error(`slice probe failed: ${message}`);
      const [, name, entityId] = missing;
      const wantKind = pkg.entities.find((entity) =>
        entityId.startsWith(entity.id_template.split(":")[0]),
      )?.entity;
      if (!wantKind) throw new Error(`slice probe: unknown entity id ${entityId}`);
      let progressed = false;
      for (const slot of Object.values(pkg.defaults)) {
        if (slot.name === name && slot.entity !== wantKind) {
          slot.entity = wantKind;
          progressed = true;
          corrected += 1;
        }
      }
      if (!progressed) {
        // Referenced by bare name from an id-less rule: probe every module
        // namespace in the slice until the engine accepts one.
        const seen = evidence.get(name);
        const dtype =
          seen === "bool"
            ? "bool"
            : seen === "text"
              ? "text"
              : dates.has(name)
                ? "date"
                : "decimal";
        const entry: PackageDefault = {
          name,
          entity: wantKind,
          dtype,
          value:
            dtype === "bool" ? false : dtype === "text" ? "none" : dtype === "date" ? "2026-01-01" : "0",
        };
        const modules = new Set<string>();
        for (const rule of [...artifact.program.derived, ...artifact.program.parameters]) {
          if (rule.id?.includes("#")) modules.add(rule.id.split("#")[0]);
        }
        for (const module of modules) {
          const candidate = `${module}#input.${name}`;
          pkg.defaults[candidate] = entry;
          try {
            engine.execute(
              artifactJson,
              JSON.stringify(buildPackageRequest({ pkg, answers })),
            );
            progressed = true;
          } catch (probeError) {
            const probeMessage = String(probeError);
            if (probeMessage.includes(`\`${name}\``)) {
              delete pkg.defaults[candidate];
              continue;
            }
            // A different failure means this candidate resolved — keep it.
            progressed = true;
          }
          break;
        }
        if (!progressed) throw new Error(`slice probe: no module resolves input "${name}"`);
        admitted += 1;
      }
    }
  }
  throw new Error("slice probe: no fixpoint after 500 rounds");
}
