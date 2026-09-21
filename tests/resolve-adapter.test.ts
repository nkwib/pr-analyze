import { describe, expect, it } from "vitest";
import { GitHubAdapter, type GitHubClientLike } from "../src/adapters/github.js";
import { LocalAdapter } from "../src/adapters/local.js";
import { resolveAdapter } from "../src/commands/resolve-adapter.js";

function stubClient(): GitHubClientLike {
  return {
    rest: {
      pulls: {
        get: async () => {
          throw new Error("should not be called by resolveAdapter itself");
        },
      },
    },
  };
}

function deps(overrides: Partial<Parameters<typeof resolveAdapter>[1]> = {}) {
  return {
    resolveToken: () => "token",
    createClient: () => stubClient(),
    ...overrides,
  };
}

describe("resolveAdapter", () => {
  it("builds a LocalAdapter for --diff without touching GitHub deps", () => {
    let tokenCalls = 0;
    let clientCalls = 0;
    const adapter = resolveAdapter(
      { repoDir: "/repo", diff: "HEAD~1" },
      deps({
        resolveToken: () => {
          tokenCalls += 1;
          return "unused";
        },
        createClient: () => {
          clientCalls += 1;
          return stubClient();
        },
      }),
    );
    expect(adapter).toBeInstanceOf(LocalAdapter);
    expect(tokenCalls).toBe(0);
    expect(clientCalls).toBe(0);
  });

  it("builds a GitHubAdapter for --github, parsing the target and resolving a token", () => {
    const adapter = resolveAdapter(
      { repoDir: "/repo", github: "nkwib/pr-analyze#42" },
      deps(),
    );
    expect(adapter).toBeInstanceOf(GitHubAdapter);
  });

  it("rejects when both --diff and --github are given", () => {
    expect(() =>
      resolveAdapter({ repoDir: "/repo", diff: "HEAD~1", github: "nkwib/pr-analyze#42" }, deps()),
    ).toThrow(/mutually exclusive/);
  });

  it("rejects when neither --diff nor --github is given", () => {
    expect(() => resolveAdapter({ repoDir: "/repo" }, deps())).toThrow(/one of --diff or --github/);
  });

  it("propagates a missing-token error before building a client", () => {
    let clientCalls = 0;
    expect(() =>
      resolveAdapter(
        { repoDir: "/repo", github: "nkwib/pr-analyze#42" },
        deps({
          resolveToken: () => {
            throw new Error("--github requires a GitHub token: set GITHUB_TOKEN");
          },
          createClient: () => {
            clientCalls += 1;
            return stubClient();
          },
        }),
      ),
    ).toThrow(/GITHUB_TOKEN/);
    expect(clientCalls).toBe(0);
  });

  it("propagates an invalid --github target error", () => {
    expect(() => resolveAdapter({ repoDir: "/repo", github: "not-a-target" }, deps())).toThrow(
      /must look like/,
    );
  });
});
