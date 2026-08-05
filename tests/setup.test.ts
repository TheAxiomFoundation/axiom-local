/**
 * The pinned-corpus setup machinery (src/lib/setup.ts, behind
 * `bun run setup` and the CI/deploy corpus steps).
 *
 * Everything here is self-contained — checkout behavior is exercised
 * against throwaway local git repos, so nothing in this file ever skips:
 * the whole point of the setup contract is that skipped tests are a
 * failure state, and the tests of that contract must not skip themselves.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  checkoutDirFor,
  ensurePinnedCheckout,
  parseCorpusLock,
  parseVitestJson,
  sourceCloneUrl,
  verdict,
  type CorpusSource,
} from "@/lib/setup";

const cleanups: string[] = [];
afterAll(() => {
  for (const dir of cleanups) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  ).trim();
}

/**
 * A local "remote": two commits, arbitrary-sha fetches allowed. Every
 * fixture shares the leaf name `fixture-repo`, so two distinct remotes
 * map to the same managed checkout dir — the collision the remote-match
 * check exists for.
 */
function makeFixtureRemote(): { url: string; first: string; second: string } {
  const dir = join(tmp("axiom-setup-remote-"), "fixture-repo");
  mkdirSync(dir);
  git(dir, "init", "-q");
  git(dir, "config", "uploadpack.allowAnySHA1InWant", "true");
  writeFileSync(join(dir, "module.yaml"), "format: rulespec/v1\nversion: first\n");
  writeFileSync(join(dir, ".gitignore"), "*.local.yaml\n");
  git(dir, "add", "module.yaml", ".gitignore");
  git(dir, "commit", "-qm", "first");
  const first = git(dir, "rev-parse", "HEAD");
  writeFileSync(join(dir, "module.yaml"), "format: rulespec/v1\nversion: second\n");
  git(dir, "commit", "-aqm", "second");
  const second = git(dir, "rev-parse", "HEAD");
  return { url: `file://${dir}`, first, second };
}

describe("parseCorpusLock", () => {
  const valid = JSON.stringify({
    sources: [{ repo: "TheAxiomFoundation/rulespec-us", commit: "5cc39ed6ebc1e1ea774db6d04aaa553407c3aea6" }],
    ledger: { ledger_id: "fixture-us-ny-snap", certified_set_version: "38f528641fae55b7d795edd9" },
  });

  it("round-trips a valid lock", () => {
    const lock = parseCorpusLock(valid);
    expect(lock.sources).toHaveLength(1);
    expect(lock.sources[0].repo).toBe("TheAxiomFoundation/rulespec-us");
    expect(lock.ledger.ledger_id).toBe("fixture-us-ny-snap");
  });

  it("rejects non-JSON", () => {
    expect(() => parseCorpusLock("not json")).toThrow(/not valid JSON/);
  });

  it("rejects a lock with no sources", () => {
    expect(() => parseCorpusLock(JSON.stringify({ sources: [], ledger: {} }))).toThrow(/at least one source/);
  });

  it("rejects a short or missing commit", () => {
    const bad = JSON.parse(valid);
    bad.sources[0].commit = "5cc39ed";
    expect(() => parseCorpusLock(JSON.stringify(bad))).toThrow(/40-hex commit/);
    delete bad.sources[0].commit;
    expect(() => parseCorpusLock(JSON.stringify(bad))).toThrow(/40-hex commit/);
  });

  it("rejects a missing ledger identity", () => {
    const bad = JSON.parse(valid);
    delete bad.ledger;
    expect(() => parseCorpusLock(JSON.stringify(bad))).toThrow(/ledger_id/);
  });
});

describe("sourceCloneUrl", () => {
  it("maps owner/name to the GitHub clone URL", () => {
    expect(sourceCloneUrl("TheAxiomFoundation/rulespec-us")).toBe(
      "https://github.com/TheAxiomFoundation/rulespec-us.git",
    );
  });

  it("passes full URLs through unchanged", () => {
    expect(sourceCloneUrl("file:///somewhere/fixture")).toBe("file:///somewhere/fixture");
    expect(sourceCloneUrl("https://example.com/org/repo")).toBe("https://example.com/org/repo");
  });

  it("rejects shapes it cannot derive a URL from", () => {
    expect(() => sourceCloneUrl("just-a-name")).toThrow(/cannot derive/);
    expect(() => sourceCloneUrl("/etc/passwd")).toThrow(/cannot derive/);
  });
});

describe("checkoutDirFor", () => {
  it("keys the managed dir by the repo basename, .git stripped", () => {
    expect(checkoutDirFor("/app", { repo: "owner/name", commit: "x" })).toBe("/app/.corpus-src/name");
    expect(checkoutDirFor("/app", { repo: "owner/name.git", commit: "x" })).toBe("/app/.corpus-src/name");
    expect(checkoutDirFor("/app", { repo: "file:///tmp/fixture-repo", commit: "x" })).toBe(
      "/app/.corpus-src/fixture-repo",
    );
  });

  it("refuses unsafe names", () => {
    expect(() => checkoutDirFor("/app", { repo: "owner/..", commit: "x" })).toThrow(/unsafe/);
  });
});

describe("verdict", () => {
  const stats = { total: 94, passed: 94, failed: 0, skipped: 0, todo: 0 };

  it("accepts a fully-run, fully-green suite", () => {
    expect(verdict(stats, 0)).toEqual({ ok: true, problems: [] });
  });

  it("fails on skips, and says why skips matter", () => {
    const result = verdict({ ...stats, passed: 43, skipped: 51 }, 0);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/51 tests skipped/);
    expect(result.problems.join(" ")).toMatch(/corpus/);
  });

  it("fails on failures, todo tests, an empty run, and a bad exit", () => {
    expect(verdict({ ...stats, passed: 93, failed: 1 }, 1).ok).toBe(false);
    expect(verdict({ ...stats, todo: 2 }, 0).ok).toBe(false);
    expect(verdict({ total: 0, passed: 0, failed: 0, skipped: 0, todo: 0 }, 0).ok).toBe(false);
    expect(verdict(stats, 1).problems.join(" ")).toMatch(/vitest exited 1/);
  });
});

describe("parseVitestJson", () => {
  it("maps the jest-compatible counters", () => {
    const raw = JSON.stringify({
      numTotalTests: 94,
      numPassedTests: 43,
      numFailedTests: 0,
      numPendingTests: 51,
      numTodoTests: 0,
    });
    expect(parseVitestJson(raw)).toEqual({ total: 94, passed: 43, failed: 0, skipped: 51, todo: 0 });
  });

  it("rejects reports missing a counter", () => {
    expect(() => parseVitestJson(JSON.stringify({ numTotalTests: 1 }))).toThrow(/numPassedTests/);
  });
});

describe("ensurePinnedCheckout", () => {
  it("clones at the pin, reuses silently, and follows a moved pin", () => {
    const remote = makeFixtureRemote();
    const root = tmp("axiom-setup-app-");
    const pinFirst: CorpusSource = { repo: remote.url, commit: remote.first };
    const dir = checkoutDirFor(root, pinFirst);

    // Fresh dir: the deploy recipe — init, fetch the one commit, check out.
    expect(ensurePinnedCheckout(root, pinFirst)).toBe("cloned");
    expect(git(dir, "rev-parse", "HEAD")).toBe(remote.first);
    expect(readFileSync(join(dir, "module.yaml"), "utf8")).toContain("version: first");

    // Same pin again: nothing to do.
    expect(ensurePinnedCheckout(root, pinFirst)).toBe("reused");
    expect(git(dir, "rev-parse", "HEAD")).toBe(remote.first);

    // The lock moves: fetch the new commit and re-pin the same dir.
    const pinSecond: CorpusSource = { repo: remote.url, commit: remote.second };
    expect(ensurePinnedCheckout(root, pinSecond)).toBe("updated");
    expect(git(dir, "rev-parse", "HEAD")).toBe(remote.second);
    expect(readFileSync(join(dir, "module.yaml"), "utf8")).toContain("version: second");
  });

  it("hard-resets drift so the corpus build only sees the pinned tree", () => {
    const remote = makeFixtureRemote();
    const root = tmp("axiom-setup-app-");
    const pin: CorpusSource = { repo: remote.url, commit: remote.first };
    const dir = checkoutDirFor(root, pin);
    ensurePinnedCheckout(root, pin);

    // A stray yaml here would be scanned into the corpus; edits would ship.
    writeFileSync(join(dir, "stray.yaml"), "format: rulespec/v1\n");
    writeFileSync(join(dir, "module.yaml"), "tampered\n");

    expect(ensurePinnedCheckout(root, pin)).toBe("updated");
    expect(existsSync(join(dir, "stray.yaml"))).toBe(false);
    expect(readFileSync(join(dir, "module.yaml"), "utf8")).toContain("version: first");
  });

  it("heals drift plain porcelain misses: ignored files and nested repos", () => {
    const remote = makeFixtureRemote();
    const root = tmp("axiom-setup-app-");
    const pin: CorpusSource = { repo: remote.url, commit: remote.first };
    const dir = checkoutDirFor(root, pin);
    ensurePinnedCheckout(root, pin);

    // Gitignored yaml: invisible to `status --porcelain`, visible to the
    // corpus scan. Nested repo: `clean -fdx` (single -f) leaves it behind.
    writeFileSync(join(dir, "scratch.local.yaml"), "format: rulespec/v1\n");
    const nested = join(dir, "vendored");
    mkdirSync(nested);
    git(nested, "init", "-q");
    writeFileSync(join(nested, "smuggled.yaml"), "format: rulespec/v1\n");

    expect(ensurePinnedCheckout(root, pin)).toBe("updated");
    expect(existsSync(join(dir, "scratch.local.yaml"))).toBe(false);
    expect(existsSync(nested)).toBe(false);
  });

  it("refuses a symlinked managed dir instead of deleting through it", () => {
    const remote = makeFixtureRemote();
    const victim = tmp("axiom-setup-victim-");
    writeFileSync(join(victim, "canary.txt"), "still here\n");

    // .corpus-src itself is a link: lexical containment would pass while
    // every recursive operation landed inside the victim directory.
    const root = tmp("axiom-setup-app-");
    symlinkSync(victim, join(root, ".corpus-src"));

    const pin: CorpusSource = { repo: remote.url, commit: remote.first };
    expect(() => ensurePinnedCheckout(root, pin)).toThrow(/symlink/);
    expect(readFileSync(join(victim, "canary.txt"), "utf8")).toBe("still here\n");
  });

  it("rebuilds from scratch when the remote no longer matches the lock", () => {
    const remoteA = makeFixtureRemote();
    const remoteB = makeFixtureRemote();
    const root = tmp("axiom-setup-app-");
    ensurePinnedCheckout(root, { repo: remoteA.url, commit: remoteA.first });

    // Same basename, different remote — the managed dir must be replaced,
    // never fetched-into, or module histories would interleave.
    const dirA = checkoutDirFor(root, { repo: remoteA.url, commit: remoteA.first });
    const dirB = checkoutDirFor(root, { repo: remoteB.url, commit: remoteB.second });
    expect(dirA).toBe(dirB);
    expect(ensurePinnedCheckout(root, { repo: remoteB.url, commit: remoteB.second })).toBe("cloned");
    expect(git(dirB, "rev-parse", "HEAD")).toBe(remoteB.second);
    expect(git(dirB, "remote", "get-url", "origin")).toBe(remoteB.url);
  });
});
