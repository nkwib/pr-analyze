import { describe, expect, it } from "vitest";
import {
  createFetchGitHubClient,
  GitHubApiError,
  resolveGitHubToken,
} from "../src/lib/github-client.js";

function jsonResponse(body: unknown, init: ResponseInit & { headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("resolveGitHubToken", () => {
  it("reads GITHUB_TOKEN", () => {
    expect(resolveGitHubToken({ GITHUB_TOKEN: "abc" })).toBe("abc");
  });

  it("falls back to GH_TOKEN", () => {
    expect(resolveGitHubToken({ GH_TOKEN: "xyz" })).toBe("xyz");
  });

  it("prefers GITHUB_TOKEN over GH_TOKEN", () => {
    expect(resolveGitHubToken({ GITHUB_TOKEN: "abc", GH_TOKEN: "xyz" })).toBe("abc");
  });

  it("throws naming GITHUB_TOKEN when neither is set", () => {
    expect(() => resolveGitHubToken({})).toThrow(/GITHUB_TOKEN/);
  });

  it("throws when the token is an empty string", () => {
    expect(() => resolveGitHubToken({ GITHUB_TOKEN: "" })).toThrow(/GITHUB_TOKEN/);
  });
});

describe("createFetchGitHubClient", () => {
  it("fetches PR metadata and never logs or leaks the token in the request path", async () => {
    let capturedUrl: string | undefined;
    let capturedAuth: string | undefined;
    const client = createFetchGitHubClient({
      token: "secret-token",
      fetchImpl: (async (url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedAuth = (init?.headers as Record<string, string>).Authorization;
        return jsonResponse({
          title: "feat: add widget",
          body: "desc",
          number: 42,
          user: { login: "alice" },
          base: { sha: "base-sha" },
          head: { sha: "head-sha" },
        });
      }) as typeof fetch,
    });

    const result = await client.rest.pulls.get({
      owner: "nkwib",
      repo: "pr-analyze",
      pull_number: 42,
    });

    expect(capturedUrl).toBe("https://api.github.com/repos/nkwib/pr-analyze/pulls/42");
    expect(capturedAuth).toBe("Bearer secret-token");
    expect(result.data.title).toBe("feat: add widget");
    expect(result.data.base.sha).toBe("base-sha");
  });

  it("raises a clear error on 401", async () => {
    const client = createFetchGitHubClient({
      token: "bad",
      fetchImpl: (async () => new Response("", { status: 401 })) as typeof fetch,
    });
    await expect(
      client.rest.pulls.get({ owner: "o", repo: "r", pull_number: 1 }),
    ).rejects.toThrow(/401/);
  });

  it("raises a clear error on 404", async () => {
    const client = createFetchGitHubClient({
      token: "t",
      fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch,
    });
    await expect(
      client.rest.pulls.get({ owner: "o", repo: "r", pull_number: 999 }),
    ).rejects.toThrow(/not found/);
  });

  it("raises a rate-limit-specific error on 403 with x-ratelimit-remaining: 0", async () => {
    const client = createFetchGitHubClient({
      token: "t",
      fetchImpl: (async () =>
        new Response("", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" },
        })) as typeof fetch,
    });
    await expect(
      client.rest.pulls.get({ owner: "o", repo: "r", pull_number: 1 }),
    ).rejects.toThrow(/rate limit/);
  });

  it("distinguishes a plain 403 (no auth to the repo) from rate limiting", async () => {
    const client = createFetchGitHubClient({
      token: "t",
      fetchImpl: (async () =>
        new Response("", {
          status: 403,
          headers: { "x-ratelimit-remaining": "42" },
        })) as typeof fetch,
    });
    const error = await client.rest.pulls
      .get({ owner: "o", repo: "r", pull_number: 1 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).message).not.toMatch(/rate limit/);
    expect((error as GitHubApiError).status).toBe(403);
  });

  it("raises a generic error with a status code on other failures", async () => {
    const client = createFetchGitHubClient({
      token: "t",
      fetchImpl: (async () => new Response("server exploded", { status: 500 })) as typeof fetch,
    });
    await expect(
      client.rest.pulls.get({ owner: "o", repo: "r", pull_number: 1 }),
    ).rejects.toThrow(/500/);
  });
});
