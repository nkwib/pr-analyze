import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAnalyzeCommand } from "../src/commands/analyze.js";
import { resolveAdapter } from "../src/commands/resolve-adapter.js";
import { createFetchGitHubClient } from "../src/lib/github-client.js";

/**
 * Exercises the real `resolveAdapter` -> `GitHubAdapter` -> real `git` ->
 * `runAnalyzeCommand` path against a throwaway local repo, with only the
 * PR-metadata `fetch` call replaced by a fake (so no real network call
 * happens, but the fetch-based `GitHubClientLike` implementation itself
 * is under test, not a stand-in).
 */
describe("--github end to end (real git, fake fetch)", () => {
  let repoDir: string;
  let baseSha: string;
  let headSha: string;

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), "pr-analyze-github-e2e-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: repoDir, encoding: "utf8" });

    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");

    writeFileSync(join(repoDir, "widget.ts"), "export const widget = 1;\n");
    git("add", "widget.ts");
    git("commit", "-q", "-m", "feat: add widget");
    baseSha = git("rev-parse", "HEAD").trim();

    writeFileSync(join(repoDir, "widget.ts"), "export const widget = 2;\n");
    git("add", "widget.ts");
    git("commit", "-q", "-m", "fix: correct widget value");
    headSha = git("rev-parse", "HEAD").trim();
  });

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true });
  });

  it("produces a full CliAnalysisOutput with real PR metadata and exactly one fetch call", async () => {
    let fetchCalls = 0;
    const adapter = resolveAdapter(
      { repoDir, github: "nkwib/pr-analyze#42" },
      {
        resolveToken: () => "test-token",
        createClient: (token) =>
          createFetchGitHubClient({
            token,
            fetchImpl: (async () => {
              fetchCalls += 1;
              return new Response(
                JSON.stringify({
                  title: "feat: add widget",
                  body: null,
                  number: 42,
                  user: { login: "alice" },
                  base: { sha: baseSha },
                  head: { sha: headSha },
                }),
                { status: 200 },
              );
            }) as typeof fetch,
          }),
      },
    );

    const output = await runAnalyzeCommand(adapter);

    expect(fetchCalls).toBe(1);
    expect(output.adapter.name).toBe("github");
    expect(output.pr).toEqual({
      title: "feat: add widget",
      body: null,
      number: 42,
      authorLogin: "alice",
    });
    expect(output.head).toEqual({ sha: headSha, baseSha });
    expect(output.diff.fileCount).toBe(1);
  });
});
