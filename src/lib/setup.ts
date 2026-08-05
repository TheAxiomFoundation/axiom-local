/**
 * The pinned-corpus setup machinery behind `bun run setup`
 * (scripts/setup.mjs) and the CI/deploy corpus steps.
 *
 * corpus.lock.json is the contract: deploys regenerate the corpus from
 * exactly the commits it records, so what production serves is what was
 * reviewed. This module makes the same guarantee available locally —
 * materialize each locked source at its pinned commit under .corpus-src/
 * (gitignored, fully managed by this code), rebuild public/corpus/, and
 * prove the rebuild reproduced the lock byte-for-byte. Building from a
 * floating checkout (`bun scripts/build-corpus.mjs ../rulespec-us`) is the
 * *update* path — it rewrites the lock to that checkout's HEAD, which you
 * then review and commit. Setup is the *reproduce* path and must never
 * move the pin.
 *
 * Verification is the other half: vitest skips every corpus-slicing suite
 * when public/corpus/ is missing, so a green run proves nothing about the
 * install. `runVerify` + `verdict` treat skipped tests as failures — the
 * suite either runs whole or the setup fails loudly.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

export interface CorpusSource {
  repo: string;
  commit: string;
}

export interface CorpusLock {
  sources: CorpusSource[];
  ledger: { ledger_id: string; certified_set_version: string };
}

/** Where managed source checkouts live, relative to the repo root. */
export const CORPUS_SRC = ".corpus-src";

interface RunOptions {
  cwd?: string;
  /** Stream output to the caller's terminal instead of capturing it. */
  inherit?: boolean;
}

/** Run a command; throw with the command line on any failure. */
function run(cmd: string, args: string[], opts: RunOptions = {}): string {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    encoding: "utf8",
    stdio: opts.inherit ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
  const line = `${cmd} ${args.join(" ")}`;
  if (res.error) {
    const code = (res.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new Error(`${cmd} not found in PATH (needed for: ${line})`);
    throw new Error(`${line}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const stderr = typeof res.stderr === "string" && res.stderr.trim() ? `\n${res.stderr.trim()}` : "";
    throw new Error(`${line} exited ${res.status}${stderr}`);
  }
  return typeof res.stdout === "string" ? res.stdout.trim() : "";
}

/** Run a probe command; null instead of throwing when it fails. */
function tryRun(cmd: string, args: string[], opts: RunOptions = {}): string | null {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
}

/** The bun executable: the current runtime when it *is* bun, else PATH lookup. */
function bunExe(): string {
  return (globalThis as { Bun?: unknown }).Bun ? process.execPath : "bun";
}

/** Parse and validate corpus.lock.json content. */
export function parseCorpusLock(raw: string): CorpusLock {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`corpus.lock.json is not valid JSON: ${(err as Error).message}`);
  }
  const lock = parsed as Partial<CorpusLock>;
  if (!Array.isArray(lock.sources) || lock.sources.length === 0) {
    throw new Error("corpus.lock.json must list at least one source ({ sources: [{ repo, commit }] })");
  }
  for (const source of lock.sources) {
    if (typeof source?.repo !== "string" || source.repo.length === 0) {
      throw new Error("corpus.lock.json: every source needs a non-empty string `repo`");
    }
    if (typeof source?.commit !== "string" || !/^[0-9a-f]{40}$/.test(source.commit)) {
      throw new Error(
        `corpus.lock.json: source ${source.repo} needs a full 40-hex commit ` +
          `(got ${JSON.stringify(source?.commit)})`,
      );
    }
  }
  const ledger = lock.ledger as Partial<CorpusLock["ledger"]> | undefined;
  if (typeof ledger?.ledger_id !== "string" || typeof ledger?.certified_set_version !== "string") {
    throw new Error("corpus.lock.json must record { ledger: { ledger_id, certified_set_version } }");
  }
  return lock as CorpusLock;
}

/**
 * Clone URL for a locked source. build-corpus records GitHub remotes as
 * `owner/name`; anything else (a file:// fixture, a non-GitHub remote)
 * stays a full URL and passes through unchanged.
 */
export function sourceCloneUrl(repo: string): string {
  if (repo.includes("://")) return repo;
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
    throw new Error(`corpus.lock.json: cannot derive a clone URL from repo ${JSON.stringify(repo)}`);
  }
  return `https://github.com/${repo}.git`;
}

/** Managed checkout directory for a locked source: <root>/.corpus-src/<name>. */
export function checkoutDirFor(root: string, source: CorpusSource): string {
  const name = basename(source.repo).replace(/\.git$/, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name === "..") {
    throw new Error(`corpus.lock.json: unsafe checkout name derived from repo ${JSON.stringify(source.repo)}`);
  }
  return join(root, CORPUS_SRC, name);
}

/** The only directories this module may delete or rewrite. */
function assertManagedDir(root: string, dir: string): void {
  const managedRoot = resolve(root, CORPUS_SRC);
  if (!resolve(dir).startsWith(managedRoot + sep)) {
    throw new Error(`refusing to manage ${dir}: outside ${managedRoot}`);
  }
}

function isRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}

function hasCommit(dir: string, commit: string): boolean {
  return tryRun("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: dir }) !== null;
}

/**
 * Materialize one locked source at its pinned commit under .corpus-src/.
 * Fresh dirs get the deploy workflow's recipe (init, fetch the single
 * commit at depth 1, check it out); existing ones are reused, fetching
 * and re-pinning only when needed. The dir is managed: a wrong remote
 * rebuilds it, and any local drift is hard-reset so the corpus build
 * only ever sees the pinned tree.
 */
export function ensurePinnedCheckout(root: string, source: CorpusSource): "cloned" | "updated" | "reused" {
  const dir = checkoutDirFor(root, source);
  const url = sourceCloneUrl(source.repo);
  assertManagedDir(root, dir);

  const fresh = (): "cloned" => {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    run("git", ["init", "-q"], { cwd: dir });
    run("git", ["remote", "add", "origin", url], { cwd: dir });
    run("git", ["fetch", "-q", "--depth", "1", "origin", source.commit], { cwd: dir });
    run("git", ["checkout", "-q", "FETCH_HEAD"], { cwd: dir });
    return "cloned";
  };

  if (!isRepo(dir)) return fresh();
  if (tryRun("git", ["remote", "get-url", "origin"], { cwd: dir }) !== url) return fresh();

  let touched = false;
  if (!hasCommit(dir, source.commit)) {
    run("git", ["fetch", "-q", "--depth", "1", "origin", source.commit], { cwd: dir });
    touched = true;
  }
  if (tryRun("git", ["rev-parse", "HEAD"], { cwd: dir }) !== source.commit) {
    run("git", ["checkout", "-q", "--force", "--detach", source.commit], { cwd: dir });
    touched = true;
  }
  if (run("git", ["status", "--porcelain"], { cwd: dir }) !== "") {
    run("git", ["reset", "-q", "--hard", source.commit], { cwd: dir });
    run("git", ["clean", "-qfdx"], { cwd: dir });
    touched = true;
  }
  return touched ? "updated" : "reused";
}

export interface BuildFromLockOptions {
  /** Proceed even when the working-tree lock differs from the committed one. */
  allowDirtyLock?: boolean;
  log?: (line: string) => void;
}

/**
 * Rebuild public/corpus/ from exactly the commits corpus.lock.json pins,
 * then prove the build reproduced the lock byte-for-byte. A reproduction
 * failure restores the original lock before throwing, so the tree is
 * never left re-pinned by accident.
 */
export function buildCorpusFromLock(root: string, opts: BuildFromLockOptions = {}): CorpusLock {
  const log = opts.log ?? (() => {});
  const lockPath = join(root, "corpus.lock.json");
  const lockRaw = readFileSync(lockPath, "utf8");
  const lock = parseCorpusLock(lockRaw);

  // A lock that differs from the committed one usually means a previous
  // `build-corpus.mjs <checkout>` run re-pinned it to that checkout's HEAD.
  // Building from it would faithfully reproduce the *wrong* pin, so stop
  // and make the person choose.
  const committed = tryRun("git", ["show", "HEAD:corpus.lock.json"], { cwd: root });
  if (committed !== null && committed !== lockRaw.trimEnd() && committed.trimEnd() !== lockRaw.trimEnd()) {
    if (!opts.allowDirtyLock) {
      throw new Error(
        "corpus.lock.json differs from the committed pin — likely rewritten by a " +
          "build against an unpinned checkout.\n" +
          "  restore the reviewed pin:  git checkout -- corpus.lock.json  (then re-run)\n" +
          "  or keep the new pin:       re-run with --allow-dirty-lock, review, and commit the lock",
      );
    }
    log("warning: building from a corpus.lock.json that differs from the committed pin");
  }

  const checkouts: string[] = [];
  for (const source of lock.sources) {
    const action = ensurePinnedCheckout(root, source);
    const dir = checkoutDirFor(root, source);
    log(`${action} ${source.repo}@${source.commit.slice(0, 7)} → ${dir.slice(root.length + 1)}`);
    checkouts.push(dir);
  }

  run(bunExe(), [join(root, "scripts", "build-corpus.mjs"), ...checkouts], { cwd: root, inherit: true });

  const manifestPath = join(root, "public", "corpus", "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("corpus build finished but public/corpus/manifest.json is missing");
  }
  if (!readFileSync(manifestPath, "utf8").includes('"format":"axiom-local.corpus.v1"')) {
    throw new Error("public/corpus/manifest.json is not an axiom-local.corpus.v1 manifest");
  }

  const rebuiltRaw = readFileSync(lockPath, "utf8");
  if (rebuiltRaw !== lockRaw) {
    writeFileSync(lockPath, lockRaw);
    throw new Error(
      "rebuilding at the pinned commits did not reproduce corpus.lock.json — " +
        "the lock has been restored.\n" +
        `  expected: ${summarizeSources(parseCorpusLock(lockRaw).sources)}\n` +
        `  rebuilt:  ${summarizeSources(parseCorpusLock(rebuiltRaw).sources)}`,
    );
  }
  return lock;
}

function summarizeSources(sources: CorpusSource[]): string {
  return sources.map((s) => `${s.repo}@${s.commit.slice(0, 7)}`).join(", ");
}

export interface VerifyStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
}

/** Map vitest's jest-compatible JSON report onto the counts we assert on. */
export function parseVitestJson(raw: string): VerifyStats {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`vitest JSON report is not valid JSON: ${(err as Error).message}`);
  }
  const report = parsed as Record<string, unknown>;
  const count = (key: string): number => {
    const value = report[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      throw new Error(`vitest JSON report is missing ${key}`);
    }
    return value;
  };
  return {
    total: count("numTotalTests"),
    passed: count("numPassedTests"),
    failed: count("numFailedTests"),
    skipped: count("numPendingTests"),
    todo: count("numTodoTests"),
  };
}

/**
 * The install-verification contract: every test ran and passed. Skips are
 * failures here — vitest skips the corpus suites when public/corpus/ is
 * missing and still reports green, which is exactly the silent state this
 * exists to catch.
 */
export function verdict(stats: VerifyStats, exitCode: number): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  if (stats.failed > 0) problems.push(`${stats.failed} test${stats.failed === 1 ? "" : "s"} failed`);
  if (stats.skipped > 0) {
    problems.push(
      `${stats.skipped} tests skipped — skips mean the corpus the tests expect is missing or partial`,
    );
  }
  if (stats.todo > 0) problems.push(`${stats.todo} tests marked todo`);
  if (stats.passed === 0) problems.push("no tests ran");
  if (problems.length === 0 && exitCode !== 0) problems.push(`vitest exited ${exitCode}`);
  return { ok: problems.length === 0, problems };
}

/** Run the vitest suite with a JSON report alongside normal output. */
export function runVerify(root: string): { stats: VerifyStats; exitCode: number } {
  const outFile = join(tmpdir(), `axiom-local-vitest-${process.pid}-${Date.now()}.json`);
  const res = spawnSync(
    bunExe(),
    ["x", "vitest", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${outFile}`],
    { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (res.error) throw new Error(`could not run vitest: ${res.error.message}`);
  const exitCode = res.status ?? 1;
  if (!existsSync(outFile)) {
    throw new Error(`vitest produced no JSON report (exit ${exitCode})`);
  }
  const raw = readFileSync(outFile, "utf8");
  unlinkSync(outFile);
  return { stats: parseVitestJson(raw), exitCode };
}
