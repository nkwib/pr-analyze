import { describe, expect, it } from "vitest";
import { GitHubAdapter, type GitHubClientLike } from "../src/adapters/github.js";
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

function fakeRunner(responses: ReadonlyMap<string, string>): GitRunner {
  return async (args) => {
    const key = args.join(" ");
    if (responses.has(key)) return responses.get(key)!;
    if (args[0] === "diff") return "";
    throw new Error(`unexpected git invocation: ${key}`);
  };
}

function fakeClient(pr: {
  title: string;
  body: string | null;
  number: number;
  authorLogin: string | null;
  baseSha: string;
  headSha: string;
}): GitHubClientLike {
  return {
    rest: {
      pulls: {
        get: async () => ({
          data: {
            title: pr.title,
            body: pr.body,
            number: pr.number,
            user: pr.authorLogin === null ? null : { login: pr.authorLogin },
            base: { sha: pr.baseSha },
            head: { sha: pr.headSha },
          },
        }),
      },
    },
  };
}

describe("GitHubAdapter — collect()", () => {
  it("attaches PR metadata and delegates diff/commits to LocalAdapter", async () => {
    const responses = new Map<string, string>([
      ["rev-parse base-sha", "base-sha"],
      ["rev-parse head-sha", "head-sha"],
      [
        "log --max-count=5000 --format=%x1e%H%x1f%P%x1f%aN%x1f%aI%x1f%B",
        metaRecord({
          sha: "c1",
          parents: "p1",
          author: "alice",
          authoredAt: "2026-04-01T00:00:00Z",
          message: "feat: x",
        }),
      ],
      [
        "log --max-count=5000 --name-only --format=\x1eCOMMIT %H",
        "\x1eCOMMIT c1\nsrc/x.ts\n",
      ],
      ["diff --name-status -z base-sha..head-sha", "M\x00src/x.ts\x00"],
      ["diff --numstat -z base-sha..head-sha", "1\t0\tsrc/x.ts\x00"],
      ["diff base-sha..head-sha", ""],
    ]);

    const adapter = new GitHubAdapter({
      repoDir: "/fake",
      owner: "acme",
      repo: "widgets",
      prNumber: 42,
      client: fakeClient({
        title: "feat: add widget",
        body: "Some description",
        number: 42,
        authorLogin: "alice",
        baseSha: "base-sha",
        headSha: "head-sha",
      }),
      gitRunner: fakeRunner(responses),
    });

    const ctx = await adapter.collect();
    expect(adapter.name).toBe("github");
    expect(ctx.pr).toEqual({
      title: "feat: add widget",
      body: "Some description",
      number: 42,
      authorLogin: "alice",
    });
    expect(ctx.diff.baseSha).toBe("base-sha");
    expect(ctx.diff.headSha).toBe("head-sha");
    expect(ctx.commits[0]?.sha).toBe("c1");
  });

  it("handles a PR with no author", async () => {
    const responses = new Map<string, string>([
      ["rev-parse B", "B"],
      ["rev-parse H", "H"],
      ["log --max-count=5000 --format=%x1e%H%x1f%P%x1f%aN%x1f%aI%x1f%B", ""],
      ["log --max-count=5000 --name-only --format=\x1eCOMMIT %H", ""],
      ["diff --name-status -z B..H", ""],
      ["diff --numstat -z B..H", ""],
      ["diff B..H", ""],
    ]);
    const adapter = new GitHubAdapter({
      repoDir: "/fake",
      owner: "x",
      repo: "y",
      prNumber: 1,
      client: fakeClient({
        title: "anon",
        body: null,
        number: 1,
        authorLogin: null,
        baseSha: "B",
        headSha: "H",
      }),
      gitRunner: fakeRunner(responses),
    });
    const ctx = await adapter.collect();
    expect(ctx.pr?.authorLogin).toBeNull();
    expect(ctx.pr?.body).toBeNull();
  });
});
