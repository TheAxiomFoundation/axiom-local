/**
 * One-command install-and-verify: `bun run setup`.
 *
 * Does, in order:
 *   1. deps    — `bun install` if node_modules/ is missing
 *   2. corpus  — materialize every corpus.lock.json source at its pinned
 *                commit under .corpus-src/ (gitignored, managed), rebuild
 *                public/corpus/, and prove the rebuild reproduced the lock
 *                byte-for-byte
 *   3. verify  — the full vitest suite, where *skipped tests are failures*:
 *                vitest skips the corpus suites when public/corpus/ is
 *                missing and still reports green, which is exactly the
 *                silent state this step exists to catch
 *
 * This is the *reproduce* path — it never moves the pin. To update the pin,
 * build from your own checkout (`bun scripts/build-corpus.mjs ../rulespec-us`),
 * review the rewritten corpus.lock.json, and commit it.
 *
 * Flags (used by CI/deploy, fine to use locally):
 *   --corpus-only       steps 1–2, no vitest run
 *   --verify-only       steps 1 and 3, no corpus rebuild
 *   --allow-dirty-lock  build even when corpus.lock.json differs from the
 *                       committed pin (setup stops otherwise, because that
 *                       usually means an unpinned build rewrote it)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCorpusFromLock, runVerify, verdict } from "../src/lib/setup.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = new Set(process.argv.slice(2));
const corpusOnly = args.delete("--corpus-only");
const verifyOnly = args.delete("--verify-only");
const allowDirtyLock = args.delete("--allow-dirty-lock");
if (args.size > 0) {
  console.error(`unknown flag(s): ${[...args].join(" ")}`);
  console.error("usage: bun scripts/setup.mjs [--corpus-only | --verify-only] [--allow-dirty-lock]");
  process.exit(2);
}
if (corpusOnly && verifyOnly) {
  console.error("--corpus-only and --verify-only are mutually exclusive");
  process.exit(2);
}

const fail = (message) => {
  console.error(`\nsetup failed: ${message}`);
  process.exit(1);
};

// 1. deps — the verify step needs vitest; a fresh clone has no node_modules.
if (!existsSync(join(root, "node_modules"))) {
  console.log("installing dependencies (bun install)…");
  const res = spawnSync(process.execPath, ["install"], { cwd: root, stdio: "inherit" });
  if (res.status !== 0) fail(`bun install exited ${res.status ?? "abnormally"}`);
}

// 2. corpus, pinned.
if (!verifyOnly) {
  try {
    buildCorpusFromLock(root, { allowDirtyLock, log: (line) => console.log(line) });
  } catch (err) {
    fail(err.message);
  }
}

// 3. the full suite, with skips treated as failures.
if (!corpusOnly) {
  let result;
  try {
    result = runVerify(root);
  } catch (err) {
    fail(err.message);
  }
  const { ok, problems } = verdict(result.stats, result.exitCode);
  if (!ok) fail(problems.join("\n  "));
  console.log(`\n✓ install verified — ${result.stats.passed} passed, 0 skipped, 0 failed`);
  console.log("\nnext:");
  console.log("  bun run dev                              # http://localhost:3000/local/ — the root 404s by design");
  console.log("  bun scripts/determine.mjs --roots snap   # the same determination from your terminal");
}
