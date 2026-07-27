/**
 * The certified-node serving gate: only nodes with a durable legal id that a
 * verifier-issued certification ledger vouches for are ever served — not
 * their content, not their formulas, not even their legal ids. There is no
 * bypass flag and no grace period; a missing or invalid ledger serves
 * NOTHING (axiom-api docs/certified-serving.md).
 *
 * The ledger (`axiom-certified-ledger/1`) is a committed artifact, synced
 * from axiom-api: data/certified-nodes.json is the vendor-time source, and
 * scripts/build-corpus.mjs copies it to public/corpus/ledger.json — the one
 * spelling every serving surface (Runner, CorpusExplorer, determine.mjs)
 * checks against. Programs vendored by scripts/build-packages.mjs carry a
 * `certified` provenance stamp bound to the ledger identity; a package
 * whose stamp is missing or does not match the served ledger refuses to
 * load.
 *
 * Two contexts, two disclosure rules: build tooling and the corpus
 * explorer are dev surfaces and MAY name uncertified ids in refusals (you
 * need the list to fix the ledger); the program loader is a serving
 * surface and reports counts only.
 */

import type { CompiledProgramArtifact } from "./engine/types";

export const LEDGER_FORMAT = "axiom-certified-ledger/1";

export interface CertifiedEntry {
  legal_id: string;
  certificate_id: string;
  claim: "computed" | "attested";
  evidence_sha256: string;
}

export interface CertifiedLedger {
  format: string;
  ledger_id: string;
  issued_at: string;
  fixture: boolean;
  vintage: { encoding_release: string; engine_release: string; corpus_release: string };
  entries: CertifiedEntry[];
}

/** A validated ledger plus the lookups the gates need. */
export interface CertifiedIndex {
  ledger: CertifiedLedger;
  byId: Map<string, CertifiedEntry>;
  setVersion: string;
}

/** The provenance stamp a vendored package carries (and the loader checks). */
export interface CertifiedProvenance {
  ledger_id: string;
  certified_set_version: string;
  /** Output name → certificate id, for the provenance line. */
  certificates: Record<string, string>;
}

/** WebCrypto sha-256 — the one digest available in browsers, Node, and Bun. */
async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Identity of a certified set: sha-256 (hex, first 24) over the sorted
 * `legal_id\ncertificate_id\nevidence_sha256\n` lines. Ledger rotation
 * changes it, which is exactly what invalidates every vendored stamp.
 */
export async function certifiedSetVersion(entries: CertifiedEntry[]): Promise<string> {
  const lines = entries.map(
    (entry) => `${entry.legal_id}\n${entry.certificate_id}\n${entry.evidence_sha256}\n`,
  );
  return (await sha256Hex(lines.sort().join(""))).slice(0, 24);
}

const EVIDENCE_SHA256 = /^[0-9a-f]{64}$/;

/**
 * Wholesale, fail-closed ledger validation: any defect invalidates the
 * whole ledger — the caller must then serve nothing, not "the good rows".
 * Synthetic `axiom:` ids are uncertifiable by construction, so a ledger
 * that names one is not a ledger.
 */
export async function validateLedger(raw: unknown): Promise<CertifiedIndex> {
  const refuse = (reason: string): never => {
    throw new Error(`certified ledger invalid: ${reason}`);
  };
  if (!raw || typeof raw !== "object") refuse("not an object");
  const ledger = raw as CertifiedLedger;
  if (ledger.format !== LEDGER_FORMAT) refuse(`format is not ${LEDGER_FORMAT}`);
  if (typeof ledger.ledger_id !== "string" || ledger.ledger_id === "") refuse("missing ledger_id");
  if (!Array.isArray(ledger.entries)) refuse("entries is not an array");
  const byId = new Map<string, CertifiedEntry>();
  for (const entry of ledger.entries) {
    if (!entry || typeof entry.legal_id !== "string" || entry.legal_id === "") {
      refuse("entry without a legal_id");
    }
    if (entry.legal_id.startsWith("axiom:")) {
      refuse(`synthetic id in ledger: ${entry.legal_id}`);
    }
    if (byId.has(entry.legal_id)) refuse(`duplicate legal_id: ${entry.legal_id}`);
    if (typeof entry.certificate_id !== "string" || entry.certificate_id === "") {
      refuse(`entry ${entry.legal_id} without a certificate_id`);
    }
    if (typeof entry.evidence_sha256 !== "string" || !EVIDENCE_SHA256.test(entry.evidence_sha256)) {
      refuse(`entry ${entry.legal_id} evidence_sha256 is not 64 hex chars`);
    }
    byId.set(entry.legal_id, entry);
  }
  return { ledger, byId, setVersion: await certifiedSetVersion(ledger.entries) };
}

/**
 * Every node id an artifact's closure can surface: derived rules,
 * parameters, relations, plus the input refs the descriptor addresses the
 * dataset with. A node WITHOUT a durable id contributes its bare name —
 * which no ledger can certify, so id-less nodes fail the gate by
 * construction rather than slipping past it.
 */
export function collectClosureIds(
  artifact: CompiledProgramArtifact,
  inputRefs: Iterable<string>,
): string[] {
  const ids = new Set<string>();
  for (const rule of artifact.program.derived) ids.add(rule.id ?? rule.name);
  for (const parameter of artifact.program.parameters) ids.add(parameter.id ?? parameter.name);
  const relations = (artifact.program as { relations?: { id?: string; name: string }[] }).relations;
  for (const relation of relations ?? []) ids.add(relation.id ?? relation.name);
  for (const ref of inputRefs) ids.add(ref);
  return [...ids];
}

/** The ids in `ids` the ledger does not certify, sorted for stable output. */
export function findUncertified(ids: Iterable<string>, index: CertifiedIndex): string[] {
  return [...ids].filter((id) => !index.byId.has(id)).sort();
}

/**
 * The slicing/vendoring gate: refuse any artifact whose node closure is not
 * fully certified, naming the missing ids — dev-tooling context only
 * (build stderr, the corpus explorer); the program loader never calls this
 * with content it would render.
 */
export function assertArtifactCertified(
  artifact: CompiledProgramArtifact,
  inputRefs: Iterable<string>,
  index: CertifiedIndex,
): void {
  const missing = findUncertified(collectClosureIds(artifact, inputRefs), index);
  if (missing.length > 0) {
    throw new Error(
      `closure not certified under ledger ${index.ledger.ledger_id} — ` +
        `${missing.length} uncertified node id(s):\n  ${missing.join("\n  ")}`,
    );
  }
}

/**
 * The provenance stamp for a fully-gated package: ledger identity plus one
 * certificate per output. Only callable after assertArtifactCertified — a
 * missing certificate here means the gate was bypassed, and that is a
 * build error, not a servable state.
 */
export function certifiedStamp(
  index: CertifiedIndex,
  outputs: Record<string, string>,
): CertifiedProvenance {
  const certificates: Record<string, string> = {};
  for (const [name, id] of Object.entries(outputs)) {
    const entry = index.byId.get(id);
    if (!entry) throw new Error(`certifiedStamp without a certified output: ${id}`);
    certificates[name] = entry.certificate_id;
  }
  return {
    ledger_id: index.ledger.ledger_id,
    certified_set_version: index.setVersion,
    certificates,
  };
}

/**
 * The load-time gate on a vendored package: its stamp must exist, be
 * well-formed, and match the SERVED ledger's identity exactly. Serving
 * surface — refusal reasons never name node ids.
 */
export function assertPackageCertified(
  pkg: { program_id?: string; certified?: CertifiedProvenance },
  index: CertifiedIndex,
): void {
  const stamp = pkg.certified;
  if (!stamp || typeof stamp !== "object") {
    throw new Error("refused: package carries no certificate provenance");
  }
  if (
    typeof stamp.ledger_id !== "string" ||
    typeof stamp.certified_set_version !== "string" ||
    !stamp.certificates ||
    typeof stamp.certificates !== "object"
  ) {
    throw new Error("refused: package certificate provenance is malformed");
  }
  if (stamp.ledger_id !== index.ledger.ledger_id) {
    throw new Error("refused: package was certified under a different ledger");
  }
  if (stamp.certified_set_version !== index.setVersion) {
    throw new Error("refused: package certificate provenance is stale for the served ledger");
  }
}
