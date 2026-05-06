import {
  analyze as runAnalysis,
  type AnalysisOutput,
  type AnalyzeContext,
  type ProviderAdapter,
} from "../vendor/core/index.js";
import {
  classifyPrFiles,
  type ClassifyResult,
} from "../vendor/pr-triage-filter/index.js";

/**
 * Full CLI analysis output: the deterministic core analysis plus the
 * Tier 1 file triage from `@prcompass/pr-triage-filter`. Both are
 * deterministic and fully grounded in the input.
 *
 * @public
 */
export interface CliAnalysisOutput extends AnalysisOutput {
  readonly triage: ClassifyResult;
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
  const core = runAnalysis(ctx);
  const triage = classifyPrFiles({
    files: ctx.diff.files.map((f) => {
      // Map core's DiffStatus → tier1-filter's ChangeType. The two
      // taxonomies diverge slightly (core has `copied`, tier1-filter
      // has `deleted` instead of `removed`).
      const changeType =
        f.status === "removed"
          ? "deleted"
          : f.status === "copied"
            ? "renamed"
            : f.status;
      return {
        path: f.path,
        ...(f.previousPath !== null ? { previousPath: f.previousPath } : {}),
        changeType,
        additions: f.additions,
        deletions: f.deletions,
        ...(f.patch !== null ? { patch: f.patch } : {}),
      };
    }),
  });
  return {
    ...core,
    triage,
    adapter: { name: adapterName },
  };
}
