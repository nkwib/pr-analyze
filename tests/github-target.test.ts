import { describe, expect, it } from "vitest";
import { parseGitHubTarget } from "../src/lib/github-target.js";

describe("parseGitHubTarget", () => {
  it("parses owner/repo#number", () => {
    expect(parseGitHubTarget("nkwib/pr-analyze#42")).toEqual({
      owner: "nkwib",
      repo: "pr-analyze",
      prNumber: 42,
    });
  });

  it("trims surrounding whitespace", () => {
    expect(parseGitHubTarget("  nkwib/pr-analyze#42  ")).toEqual({
      owner: "nkwib",
      repo: "pr-analyze",
      prNumber: 42,
    });
  });

  it("rejects a missing PR number", () => {
    expect(() => parseGitHubTarget("nkwib/pr-analyze")).toThrow(/must look like/);
  });

  it("rejects a URL-shaped input", () => {
    expect(() => parseGitHubTarget("https://github.com/nkwib/pr-analyze/pull/42")).toThrow(
      /must look like/,
    );
  });

  it("rejects a zero or negative PR number", () => {
    expect(() => parseGitHubTarget("nkwib/pr-analyze#0")).toThrow(/positive integer/);
  });
});
