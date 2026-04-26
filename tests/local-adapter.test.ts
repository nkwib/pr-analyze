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

/**
 * Build a fake `runGit` that responds based on the args. Lets us
 * exercise LocalAdapter end-to-end without spawning a real git
 * subprocess.
 */
function fakeRunner(responses: ReadonlyMap<string, string>): GitRunner {
  return async (args) => {
    const key = args.join(" ");
    if (responses.has(key)) return responses.get(key)!;
    // Fallback: any `git diff <range> -- <path>` returns "" (empty patch).
    if (args[0] === "diff") return "";
    throw new Error(`unexpected git invocation: ${key}`);
  };
}

describe("LocalAdapter — collect()", () => {
  it("emits a coherent AnalyzeContext from fake git output", async () => {
    const responses = new Map<string, string>([
      ["rev-parse HEAD~1", "base-sha\n"],
      ["rev-parse HEAD", "head-sha\n"],
      [
        "log --max-count=5000 --format=%x1e%H%x1f%P%x1f%aN%x1f%aI%x1f%B",
        metaRecord({
          sha: "c1",
          parents: "p1",
          author: "alice",
          authoredAt: "2026-04-01T00:00:00Z",
          message: "fix: bug",
        }) +
          metaRecord({
            sha: "c2",
            parents: "c1",
            author: "bob",
            authoredAt: "2026-04-02T00:00:00Z",
            message: "feat: thing",
          }),
      ],
      [
        "log --max-count=5000 --name-only --format=\x1eCOMMIT %H",
        "\x1eCOMMIT c1\nsrc/a.ts\n\x1eCOMMIT c2\nsrc/b.ts\nsrc/a.ts\n",
      ],
      ["diff --name-status base-sha..head-sha", "M\tsrc/a.ts\nA\tsrc/b.ts\n"],
      ["diff --numstat base-sha..head-sha", "5\t2\tsrc/a.ts\n10\t0\tsrc/b.ts\n"],
    ]);

    const adapter = new LocalAdapter({
      repoDir: "/fake",
      diff: "HEAD~1",
      gitRunner: fakeRunner(responses),
    });
    const ctx = await adapter.collect();

    expect(adapter.name).toBe("local");
    expect(ctx.diff.baseSha).toBe("base-sha");
    expect(ctx.diff.headSha).toBe("head-sha");
    expect(ctx.diff.files).toHaveLength(2);
    expect(ctx.diff.files[0]).toMatchObject({
      path: "src/a.ts",
      status: "modified",
      additions: 5,
      deletions: 2,
      previousPath: null,
    });
    expect(ctx.diff.files[1]).toMatchObject({
      path: "src/b.ts",
      status: "added",
      additions: 10,
      deletions: 0,
    });
    expect(ctx.commits).toHaveLength(2);
    expect(ctx.commits[0]?.sha).toBe("c1");
    expect(ctx.commits[0]?.filesTouched).toEqual(["src/a.ts"]);
    expect(ctx.pr).toBeNull();
  });

  it("expands a single ref into <ref>..HEAD", async () => {
    const responses = new Map<string, string>([
      ["rev-parse HEAD~3", "base"],
      ["rev-parse HEAD", "head"],
      ["log --max-count=5000 --format=%x1e%H%x1f%P%x1f%aN%x1f%aI%x1f%B", ""],
      ["log --max-count=5000 --name-only --format=\x1eCOMMIT %H", ""],
      ["diff --name-status base..head", ""],
      ["diff --numstat base..head", ""],
    ]);
    const adapter = new LocalAdapter({
      repoDir: "/fake",
      diff: "HEAD~3",
      gitRunner: fakeRunner(responses),
    });
    const ctx = await adapter.collect();
    expect(ctx.diff.baseSha).toBe("base");
    expect(ctx.diff.headSha).toBe("head");
  });

  it("handles renames in --name-status output", async () => {
    const responses = new Map<string, string>([
      ["rev-parse main", "B"],
      ["rev-parse feature", "H"],
      ["log --max-count=5000 --format=%x1e%H%x1f%P%x1f%aN%x1f%aI%x1f%B", ""],
      ["log --max-count=5000 --name-only --format=\x1eCOMMIT %H", ""],
      ["diff --name-status B..H", "R100\told.ts\tnew.ts\n"],
      ["diff --numstat B..H", "0\t0\tnew.ts\n"],
    ]);
    const adapter = new LocalAdapter({
      repoDir: "/fake",
      diff: "main..feature",
      gitRunner: fakeRunner(responses),
    });
    const ctx = await adapter.collect();
    expect(ctx.diff.files[0]).toMatchObject({
      path: "new.ts",
      previousPath: "old.ts",
      status: "renamed",
    });
  });

  it("rejects malformed diff ranges", async () => {
    const adapter = new LocalAdapter({
      repoDir: "/fake",
      diff: "not..valid..range",
      gitRunner: fakeRunner(new Map()),
    });
    await expect(adapter.collect()).rejects.toThrow(/Invalid diff range/);
  });
});
