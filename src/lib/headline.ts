/**
 * The headline rule of a RuleSpec module: the derived rule the module
 * culminates in, used to title catalog entries ("SNAP Monthly Allotment"
 * over "us:regulations/7-cfr/273/10").
 *
 * Heuristic: for every derived rule, count how many of the module's own
 * rules its formulas reach transitively (its in-module dependency
 * closure); the deepest — the rule most of the module exists to feed —
 * wins, ties to the last-defined. Parameter-only modules have no
 * headline. Text-level parsing on purpose: this runs at corpus-vendor
 * time in scripts/build-corpus.mjs, which never compiles modules.
 */

interface RuleEntry {
  name: string;
  text: string;
  derived: boolean;
}

const NAME_LINE = /^\s*-\s+name:\s+([A-Za-z0-9_.]+)\s*$/gm;

function parseRuleEntries(yaml: string): RuleEntry[] {
  const found: { name: string; start: number }[] = [];
  for (const match of yaml.matchAll(NAME_LINE)) {
    found.push({ name: match[1], start: match.index ?? 0 });
  }
  return found.map((entry, index) => {
    const text = yaml.slice(entry.start, found[index + 1]?.start ?? yaml.length);
    return { name: entry.name, text, derived: /^\s*kind:\s*derived\b/m.test(text) };
  });
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The name of the module's headline derived rule, or null when the module
 * defines none (parameter/citation shells).
 */
export function headlineRuleName(yaml: string): string | null {
  const entries = parseRuleEntries(yaml);
  const derived = entries.filter((entry) => entry.derived);
  if (derived.length === 0) return null;

  // Direct in-module dependencies: names a rule's formula lines mention.
  const names = entries.map((entry) => entry.name);
  const dependencies = new Map<string, Set<string>>();
  for (const entry of entries) {
    const formulas = entry.text.match(/^\s*formula:.*$/gm) ?? [];
    const text = formulas.join("\n");
    const reached = new Set<string>();
    for (const name of names) {
      if (name === entry.name) continue;
      if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text)) reached.add(name);
    }
    dependencies.set(entry.name, reached);
  }

  // Transitive closure size = how much of the module feeds this rule.
  const closureSize = (root: string): number => {
    const seen = new Set<string>();
    const queue = [...(dependencies.get(root) ?? [])];
    while (queue.length > 0) {
      const name = queue.pop()!;
      if (seen.has(name)) continue;
      seen.add(name);
      for (const dep of dependencies.get(name) ?? []) if (!seen.has(dep)) queue.push(dep);
    }
    return seen.size;
  };

  let best = derived[0].name;
  let bestScore = -1;
  for (const rule of derived) {
    const score = closureSize(rule.name);
    // >= : ties go to the last-defined rule — modules read bottom-up
    // toward their conclusion.
    if (score >= bestScore) {
      best = rule.name;
      bestScore = score;
    }
  }
  return best;
}
