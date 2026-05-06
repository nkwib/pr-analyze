import { describe, expect, it } from "vitest";
import { analyzeCollectedContext, runAnalyzeCommand } from "../src/commands/analyze.js";
import { formatHuman } from "../src/format/human.js";
import { formatJson } from "../src/format/json.js";
import type {
  AnalyzeContext,
  CommitRecord,
  ProviderAdapter,
} from "../src/vendor/core/index.js";

function commit(o: Partial<CommitRecord>): CommitRecord {
  return {
    sha: "abc",
    parentSha: null,
    message: "feat: x",
    authorLogin: "alice",
    authoredAt: "2026-04-01T00:00:00Z",
    filesTouched: [],
    ...o,
  };
}

function ctx(o: Partial<AnalyzeContext> = {}): AnalyzeContext {
  return {
    commits: [],
    diff: { baseSha: "B", headSha: "H", files: [] },
    pr: null,
    ...o,
  };
}

class StubAdapter implements ProviderAdapter {
  readonly name = "stub";
  constructor(private readonly context: AnalyzeContext) {}
  async collect(): Promise<AnalyzeContext> {
    return this.context;
  }
}

describe("analyzeCollectedContext", () => {
  it("attaches the adapter name to the output", () => {
    const out = analyzeCollectedContext(ctx(), "test-adapter");
    expect(out.adapter.name).toBe("test-adapter");
  });

  it("runs Tier 1 triage on the diff files", () => {
    const out = analyzeCollectedContext(
      ctx({
        diff: {
          baseSha: "B",
          headSha: "H",
          files: [
            {
              path: "package-lock.json",
              previousPath: null,
              status: "modified",
              additions: 100,
              deletions: 50,
              patch: null,
            },
            {
              path: "src/auth.ts",
              previousPath: null,
              status: "modified",
              additions: 20,
              deletions: 5,
              patch: null,
            },
          ],
        },
      }),
      "stub",
    );
    expect(out.triage.verdicts).toHaveLength(2);
    const lockfile = out.triage.verdicts.find((v) => v.path === "package-lock.json");
    expect(lockfile?.verdict).toBe("skip");
    const auth = out.triage.verdicts.find((v) => v.path === "src/auth.ts");
    expect(auth?.verdict).toBe("review-candidate");
  });

  it("produces a JSON-clean output that round-trips", () => {
    const out = analyzeCollectedContext(
      ctx({
        commits: [
          commit({
            sha: "1",
            message: "fix: x",
            filesTouched: ["a.ts"],
          }),
        ],
      }),
      "stub",
    );
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  it("preserves no-fabrication: zero bug-fix history → null risk scores in CLI output too", () => {
    const out = analyzeCollectedContext(
      ctx({
        commits: [commit({ sha: "1", message: "feat: a", filesTouched: ["a.ts"] })],
      }),
      "stub",
    );
    expect(out.risk.byFile["a.ts"]?.score).toBeNull();
  });
});

describe("runAnalyzeCommand", () => {
  it("collects from the adapter and runs the pipeline", async () => {
    const adapter = new StubAdapter(
      ctx({
        commits: [commit({ sha: "1", message: "fix: x", filesTouched: ["a.ts"] })],
      }),
    );
    const out = await runAnalyzeCommand(adapter);
    expect(out.adapter.name).toBe("stub");
    expect(out.mining.bugFixCommits).toBe(1);
  });
});

describe("formatJson + formatHuman", () => {
  it("formatJson is deterministic for identical input across 5 runs", () => {
    const out = analyzeCollectedContext(
      ctx({
        commits: [
          commit({ sha: "1", message: "fix: 1", filesTouched: ["a", "b"] }),
          commit({ sha: "2", message: "feat: 2", filesTouched: ["b"] }),
        ],
      }),
      "stub",
    );
    const first = formatJson(out);
    for (let i = 0; i < 4; i += 1) {
      expect(formatJson(out)).toBe(first);
    }
  });

  it("formatJson --pretty produces a multi-line string", () => {
    const out = analyzeCollectedContext(ctx(), "stub");
    expect(formatJson(out, { pretty: true })).toContain("\n");
    expect(formatJson(out)).not.toContain("\n");
  });

  it("formatHuman includes the adapter name and the triage breakdown", () => {
    const out = analyzeCollectedContext(
      ctx({
        diff: {
          baseSha: "B",
          headSha: "H",
          files: [
            {
              path: "src/a.ts",
              previousPath: null,
              status: "modified",
              additions: 10,
              deletions: 5,
              patch: null,
            },
          ],
        },
      }),
      "local",
    );
    const text = formatHuman(out);
    expect(text).toContain("local");
    expect(text).toContain("Triage:");
    expect(text).toContain("review-candidate");
  });

  it("formatHuman calls out the no-fabrication state", () => {
    const out = analyzeCollectedContext(
      ctx({
        commits: [commit({ sha: "1", message: "feat: x", filesTouched: ["a.ts"] })],
      }),
      "stub",
    );
    expect(formatHuman(out)).toContain("no bug-fix history");
  });
});
