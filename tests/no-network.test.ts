import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LocalAdapter } from "../src/adapters/local.js";
import type { GitRunner } from "../src/lib/git.js";

const RS = "\x1e";
const US = "\x1f";

function metaRecord(p: {
  sha: string;
  parents: string;
  author: string;
  authoredAt: string;
  message: string;
}): string {
  return `${RS}${p.sha}${US}${p.parents}${US}${p.author}${US}${p.authoredAt}${US}${p.message}`;
}

function fakeRunner(map: ReadonlyMap<string, string>): GitRunner {
  return async (args) => {
    const k = args.join(" ");
    if (map.has(k)) return map.get(k)!;
    if (args[0] === "diff") return "";
    throw new Error(`unexpected: ${k}`);
  };
}

describe("LocalAdapter — no-network invariant", () => {
  it("collect() does not invoke globalThis.fetch", async () => {
    const fetchAttempts: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((..._args: unknown[]) => {
      fetchAttempts.push("fetch");
      throw new Error("unexpected fetch() call from LocalAdapter");
    }) as typeof fetch;

    try {
      const responses = new Map<string, string>([
        ["rev-parse HEAD~1", "B"],
        ["rev-parse HEAD", "H"],
        [
          "log --max-count=5000 --format=%x1e%H%x1f%P%x1f%aN%x1f%aI%x1f%B",
          metaRecord({
            sha: "c1",
            parents: "p",
            author: "alice",
            authoredAt: "2026-04-01T00:00:00Z",
            message: "fix: x",
          }),
        ],
        [
          "log --max-count=5000 --name-only --format=\x1eCOMMIT %H",
          "\x1eCOMMIT c1\nsrc/a.ts\n",
        ],
        ["diff --name-status -z B..H", "M\x00src/a.ts\x00"],
        ["diff --numstat -z B..H", "1\t0\tsrc/a.ts\x00"],
        ["diff B..H", ""],
      ]);

      const adapter = new LocalAdapter({
        repoDir: "/fake",
        diff: "HEAD~1",
        gitRunner: fakeRunner(responses),
      });
      const ctx = await adapter.collect();
      expect(ctx.diff.baseSha).toBe("B");
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchAttempts).toEqual([]);
  });

  it("LocalAdapter source does not import any network module", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sourcePath = resolve(here, "..", "src", "adapters", "local.ts");
    const source = readFileSync(sourcePath, "utf-8");

    const forbiddenImports = [
      "node:http",
      "node:https",
      "node:net",
      "node:tls",
      "node:dgram",
      "octokit",
      "@octokit/",
      "axios",
      "node-fetch",
      "undici",
    ];
    const offenders: string[] = [];
    for (const lib of forbiddenImports) {
      // Match `from "<lib>"` or `from "<lib>/foo"`.
      const re = new RegExp(`from\\s+["']${escapeForRegex(lib)}`);
      if (re.test(source)) offenders.push(lib);
    }
    expect(offenders).toEqual([]);
  });
});

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
