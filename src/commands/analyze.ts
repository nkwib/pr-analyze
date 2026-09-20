import {
  ANALYSIS_SCHEMA_VERSION,
  analyze as runCoreAnalysis,
  type AnalysisOutput,
  type AnalyzeContext,
  type AnalyzeContextPR,
  type ProviderAdapter,
} from "@prcompass/core";
import { classifyPrFiles, type ChangeType } from "@prcompass/pr-triage-filter";

export { ANALYSIS_SCHEMA_VERSION };

export interface HotspotEntry {
  readonly file: string;
  readonly density: number;
  readonly bugFixCommits: number;
}

export interface FileChurnReport {
  readonly file: string;
  readonly commits: number;
  readonly bugFixCommits: number;
  readonly firstTouchedAt: string | null;
  readonly lastTouchedAt: string | null;
}

export interface CoChangeEdge {
  readonly a: string;
  readonly b: string;
  readonly count: number;
  readonly jaccard: number;
}

export interface DefectDensity {
  readonly value: number | null;
  readonly groundedIn: readonly string[];
}

export interface FileRiskReport {
  readonly file: string;
  readonly score: number | null;
  readonly defectDensity: DefectDensity;
  readonly caveats: readonly string[];
}

export type Verdict = "skip" | "skim" | "review-candidate";

export interface FileVerdict {
  readonly path: string;
  readonly verdict: Verdict;
  readonly reason: string;
}

/**
 * Full CLI analysis output: the mapped `@prcompass/core` analysis plus
 * the Tier 1 file triage from `@prcompass/pr-triage-filter`. This shape
 * is the CLI's documented JSON contract (see `docs-site/.../output-schema`);
 * it is intentionally flatter than the published `@prcompass/core`
 * `AnalysisOutput` (no `hotspot`/`couplingDegree`/`recencyDays` risk
 * components, no `ruleId` on triage verdicts), so every field is mapped
 * explicitly below rather than spread from the core output.
 *
 * @public
 */
export interface CliAnalysisOutput {
  readonly version: string;
  readonly head: { readonly sha: string; readonly baseSha: string };
  readonly diff: { readonly fileCount: number };
  readonly pr: AnalyzeContextPR | null;
  readonly mining: { readonly totalCommits: number; readonly bugFixCommits: number };
  readonly hotspots: readonly HotspotEntry[];
  readonly churn: {
    readonly files: readonly string[];
    readonly byFile: { readonly [path: string]: FileChurnReport };
  };
  readonly cochange: { readonly edges: readonly CoChangeEdge[] };
  readonly risk: {
    readonly files: readonly string[];
    readonly byFile: { readonly [path: string]: FileRiskReport };
  };
  readonly triage: { readonly verdicts: readonly FileVerdict[] };
  readonly adapter: { readonly name: string };
}

/**
 * Run the full analysis pipeline against an adapter's collected context.
 *
 * @public
 */
export async function runAnalyzeCommand(
  adapter: ProviderAdapter,
): Promise<CliAnalysisOutput> {
  const ctx = await adapter.collect();
  return analyzeCollectedContext(ctx, adapter.name);
}

/**
 * Pure (no I/O) variant: takes an already-collected context. Useful for
 * tests and for callers who collected the context themselves.
 *
 * @public
 */
export function analyzeCollectedContext(
  ctx: AnalyzeContext,
  adapterName: string,
): CliAnalysisOutput {
  const core = runCoreAnalysis(ctx);
  const triage = classifyPrFiles({
    files: ctx.diff.files.map((f) => ({
      path: f.path,
      ...(f.previousPath !== null ? { previousPath: f.previousPath } : {}),
      changeType: toTriageChangeType(f.status),
      additions: f.additions,
      deletions: f.deletions,
      ...(f.patch !== null ? { patch: f.patch } : {}),
    })),
  });
  return {
    version: core.version,
    head: core.head,
    diff: { fileCount: core.diff.fileCount },
    pr: core.pr,
    mining: { totalCommits: core.mining.totalCommits, bugFixCommits: core.mining.bugFixCommits },
    hotspots: mapHotspots(core.hotspots),
    churn: mapChurn(core.churn),
    cochange: mapCochange(core.cochange),
    risk: mapRisk(core.risk),
    triage: {
      verdicts: triage.verdicts.map((v) => ({ path: v.path, verdict: v.verdict, reason: v.reason })),
    },
    adapter: { name: adapterName },
  };
}

/**
 * `@prcompass/pr-triage-filter`'s `ChangeType` has no `copied` member.
 * The closest fit is `renamed`: both describe a file whose content
 * arrived from another path. This CLI mapped `copied` to `renamed` the
 * same way before this change, and the classifier's rules never branch
 * on `changeType` for path-based verdicts anyway.
 */
function toTriageChangeType(status: AnalysisOutput["diff"]["files"][number]["status"]): ChangeType {
  switch (status) {
    case "removed":
      return "deleted";
    case "copied":
      return "renamed";
    default:
      return status;
  }
}

function mapHotspots(hotspots: AnalysisOutput["hotspots"]): readonly HotspotEntry[] {
  const entries: HotspotEntry[] = [];
  for (const file of hotspots.files) {
    const h = hotspots.byFile[file];
    if (h === undefined) continue;
    entries.push({ file, density: h.score, bugFixCommits: h.bugFixCommits });
  }
  entries.sort((a, b) => {
    if (b.density !== a.density) return b.density - a.density;
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });
  return entries;
}

function mapChurn(churn: AnalysisOutput["churn"]): CliAnalysisOutput["churn"] {
  const files = [...churn.files].sort();
  const byFile: Record<string, FileChurnReport> = {};
  for (const file of files) {
    const c = churn.byFile[file];
    if (c === undefined) continue;
    byFile[file] = {
      file,
      commits: c.commitCount,
      bugFixCommits: c.bugFixCount,
      firstTouchedAt: c.firstTouchedAt,
      lastTouchedAt: c.lastTouchedAt,
    };
  }
  return { files, byFile };
}

function mapCochange(cochange: AnalysisOutput["cochange"]): CliAnalysisOutput["cochange"] {
  const edges: CoChangeEdge[] = [];
  for (const file of cochange.files) {
    const node = cochange.nodes[file];
    if (node === undefined) continue;
    for (const neighbor of node.neighbors) {
      if (file >= neighbor.file) continue;
      edges.push({
        a: file,
        b: neighbor.file,
        count: neighbor.cochangeCount,
        jaccard: neighbor.jaccard,
      });
    }
  }
  edges.sort((x, y) => {
    if (y.count !== x.count) return y.count - x.count;
    if (x.a !== y.a) return x.a < y.a ? -1 : 1;
    return x.b < y.b ? -1 : 1;
  });
  return { edges };
}

function mapRisk(risk: AnalysisOutput["risk"]): CliAnalysisOutput["risk"] {
  const files = [...risk.files].sort();
  const byFile: Record<string, FileRiskReport> = {};
  for (const file of files) {
    const r = risk.byFile[file];
    if (r === undefined) continue;
    byFile[file] = {
      file,
      score: r.score,
      defectDensity: { value: r.defectDensity.value, groundedIn: r.defectDensity.groundedIn },
      caveats: r.caveats,
    };
  }
  return { files, byFile };
}
