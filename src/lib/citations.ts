/**
 * Citation and rule-name humanization, ported from the Axiom app's
 * graph-viewer (citations.ts) and trimmed to what this repo renders:
 * legal IDs must read the same way wherever a user encounters them —
 * "us:regulations/7-cfr/273/10" is "7 CFR § 273.10" here and in the app.
 */

const JURISDICTION_LABELS: Record<string, string> = {
  us: "Federal",
  "us-al": "Alabama", "us-ak": "Alaska", "us-az": "Arizona", "us-ar": "Arkansas",
  "us-ca": "California", "us-co": "Colorado", "us-ct": "Connecticut",
  "us-de": "Delaware", "us-dc": "D.C.", "us-fl": "Florida", "us-ga": "Georgia",
  "us-hi": "Hawaii", "us-id": "Idaho", "us-il": "Illinois", "us-in": "Indiana",
  "us-ia": "Iowa", "us-ks": "Kansas", "us-ky": "Kentucky", "us-la": "Louisiana",
  "us-me": "Maine", "us-md": "Maryland", "us-ma": "Massachusetts",
  "us-mi": "Michigan", "us-mn": "Minnesota", "us-ms": "Mississippi",
  "us-mo": "Missouri", "us-mt": "Montana", "us-ne": "Nebraska",
  "us-nv": "Nevada", "us-nh": "New Hampshire", "us-nj": "New Jersey",
  "us-nm": "New Mexico", "us-ny": "New York", "us-nc": "North Carolina",
  "us-nd": "North Dakota", "us-oh": "Ohio", "us-ok": "Oklahoma",
  "us-or": "Oregon", "us-pa": "Pennsylvania", "us-ri": "Rhode Island",
  "us-sc": "South Carolina", "us-sd": "South Dakota", "us-tn": "Tennessee",
  "us-tx": "Texas", "us-ut": "Utah", "us-vt": "Vermont", "us-va": "Virginia",
  "us-wa": "Washington", "us-wv": "West Virginia", "us-wi": "Wisconsin",
  "us-wy": "Wyoming",
};

/** Encoding-only leaves ("block-1") that never exist as corpus nodes. */
const ENCODING_LEAF = /^block-\d+$/i;

export function humanizeCitation(fileLegalId: string): string {
  if (!fileLegalId.includes(":")) return fileLegalId;
  const colon = fileLegalId.indexOf(":");
  const jurisdiction = fileLegalId.slice(0, colon);
  const body = fileLegalId.slice(colon + 1);
  const parts = body.split("/").filter(Boolean);
  if (parts.length === 0) return fileLegalId;
  const [kind, ...rest] = parts;

  if (kind === "statutes" && rest.length >= 1) {
    const title = rest[0]!;
    const section = rest[1];
    const subs = rest.slice(2);
    const suffix = subs.map((s) => `(${s})`).join("");
    // Only the federal code is the USC.
    if (jurisdiction === "us" && section) {
      return `${title} USC § ${section}${suffix}`;
    }
    const state = JURISDICTION_LABELS[jurisdiction] ?? jurisdiction;
    if (!section) return `${state} Code § ${title}`;
    if (/^[a-z]/i.test(title) && /^\d/.test(section)) {
      // Named codes ("nyc/11-1701") cite by their own name.
      return `${title.toUpperCase()} § ${section}${suffix} (${state})`;
    }
    // Sections that repeat their title ("48/48-7A-3") don't double it;
    // others read dotted ("422/12C" → 422.12C), matching the corpus.
    const joined =
      section.startsWith(`${title}-`) || section.startsWith(`${title}.`)
        ? section
        : `${title}.${section}`;
    return `${state} Code § ${joined}${suffix}`;
  }

  if (kind === "regulations" && rest.length >= 2) {
    const slug = rest[0]!;
    // Legal convention: part.section, then parenthetical subsections —
    // "387.12(f)(3)(v)(a)", never "387.12.f.3.v.a".
    const segments = rest.slice(1);
    const path =
      segments.slice(0, 2).join(".") +
      segments
        .slice(2)
        .map((segment) => `(${segment})`)
        .join("");
    if (slug.toLowerCase() === "7-cfr") return `7 CFR § ${path}`;
    const readable = slug.replace(/-/g, " ").toUpperCase();
    const suffix = jurisdiction === "us-co" ? " (Colorado)" : "";
    return `${readable} § ${path}${suffix}`;
  }

  if ((kind === "policies" || kind === "guidance") && rest.length >= 1) {
    // "us-fl:policies/dcf/ess-…-manual/appendix-a-1-…/page-1" →
    // "Florida · DCF · Appendix A 1 …": jurisdiction, agency acronym,
    // then the deepest meaningful segment humanized. Encoding leaves
    // (page-N/block-N) and bare date segments never title a document.
    const meaningful = rest.filter(
      (s) => !ENCODING_LEAF.test(s) && !/^page-\d+$/i.test(s) && !/^\d{4}(-\d{2})?$/.test(s),
    );
    const leaf = meaningful[meaningful.length - 1];
    const agency = meaningful.length > 1 && meaningful[0] ? meaningful[0].toUpperCase() : null;
    const label = JURISDICTION_LABELS[jurisdiction] ?? jurisdiction;
    const titled = [label, agency, leaf ? humanizeRuleName(leaf) : null];
    return titled.filter(Boolean).join(" · ");
  }

  if (kind === "manual" && rest.length >= 1) {
    // "manual/dss/snap/1115-000-00/…/1115-035-25/block-1" →
    // "MO DSS SNAP Manual 1115.035.25": agency/program segments lead,
    // the deepest numeric section reads dotted, encoding leaves drop.
    const agency = rest
      .filter((s) => /[a-z]/i.test(s) && !ENCODING_LEAF.test(s))
      .map((s) => s.toUpperCase())
      .join(" ");
    const section = [...rest].reverse().find((s) => /^\d[\d-]*$/.test(s));
    const state = jurisdiction.split("-")[1]?.toUpperCase() ?? jurisdiction.toUpperCase();
    const titled = [state, agency, "Manual", section?.replace(/-/g, ".")];
    return titled.filter(Boolean).join(" ");
  }

  return `${JURISDICTION_LABELS[jurisdiction] ?? jurisdiction} · ${body}`;
}

/** Acronyms that must stay upper-case when a snake_case rule name is
 *  humanized ("cdcc" → "CDCC", "snap_agi_limit" → "SNAP AGI Limit"). */
const RULE_NAME_ACRONYMS = new Set([
  "cdcc", "snap", "tanf", "wic", "ssi", "eitc", "ctc", "agi", "magi",
  "cola", "usda", "irs", "fpl", "abawd", "uc", "dcf", "dss", "hhs",
  "dor", "dpa", "apa", "ess",
]);

/** Humanize a snake_case rule name or dash-slug document segment:
 *  title-case words, acronyms upper-cased. Catalog titles, doors, and
 *  policy-document fallbacks lead with this. */
export function humanizeRuleName(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) =>
      RULE_NAME_ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
