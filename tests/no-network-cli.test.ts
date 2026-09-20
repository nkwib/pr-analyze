import { describe, expect, it } from "vitest";
import { runAnalyzeCommand } from "../src/commands/analyze.js";
import { resolveAdapter } from "../src/commands/resolve-adapter.js";
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

/**
 * Sibling to `no-network.test.ts`, exercised through the CLI's own
 * `resolveAdapter` selection instead of `LocalAdapter` directly: proves
 * the `--diff` code path a real CLI invocation takes never touches
 * `fetch` or the GitHub deps, even though the same command now supports
 * `--github`.
 */
describe("resolveAdapter — local mode no-network invariant", () => {
  it("--diff never calls fetch and never touches the GitHub deps", async () => {
    const fetchAttempts: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((..._args: unknown[]) => {
      fetchAttempts.push("fetch");
      throw new Error("unexpected fetch() call from local --diff mode");
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

      let tokenCalls = 0;
      let clientCalls = 0;
      const adapter = resolveAdapter(
        { repoDir: "/fake", diff: "HEAD~1", gitRunner: fakeRunner(responses) },
        {
          resolveToken: () => {
            tokenCalls += 1;
            return "unused";
          },
          createClient: () => {
            clientCalls += 1;
            throw new Error("should not be called for --diff");
          },
        },
      );

      const output = await runAnalyzeCommand(adapter);

      expect(output.diff.fileCount).toBe(1);
      expect(output.adapter.name).toBe("local");
      expect(tokenCalls).toBe(0);
      expect(clientCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchAttempts).toEqual([]);
  });
});
