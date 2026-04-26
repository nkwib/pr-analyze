import type { CliAnalysisOutput } from "../commands/analyze.js";
import type { FileRiskReport } from "@prcompass/core";

const TOP_RISK_LIMIT = 10;

/**
 * Render a CLI analysis as a terminal-friendly text block.
 *
 * Designed for asciinema demos and quick reads. JSON remains the
 * canonical format — anything machine-readable should pipe `--format
 * json` instead of parsing this output.
 */
export function formatHuman(output: CliAnalysisOutput): string {
  const lines: string[] = [];

  lines.push("PR Compass — analysis");
  lines.push("=====================");
  lines.push("");
  lines.push(
    `Adapter:    ${output.adapter.name}` +
      (output.pr?.number !== null && output.pr?.number !== undefined
        ? ` (PR #${output.pr.number})`
        : ""),
  );
  lines.push(`Range:      ${output.head.baseSha} .. ${output.head.sha}`);
  lines.push(`Files:      ${output.diff.fileCount} changed`);
  lines.push(
    `Commits:    ${output.mining.totalCommits} total, ${output.mining.bugFixCommits} bug-fix`,
  );
  lines.push("");

  // Triage summary.
  const triageCounts = new Map<string, number>();
  for (const v of output.triage.verdicts) {
    triageCounts.set(v.verdict, (triageCounts.get(v.verdict) ?? 0) + 1);
  }
  lines.push("Triage:");
  const order = ["review-candidate", "skim", "skip"] as const;
  for (const verdict of order) {
    const count = triageCounts.get(verdict) ?? 0;
    lines.push(`  ${pad(verdict, 18)} ${count}`);
  }
  lines.push("");

  // Top-risk files.
  const ranked = rankRisk(output);
  if (ranked.length === 0) {
    if (output.mining.bugFixCommits === 0) {
      lines.push("Risk:       no bug-fix history in repo — no risk claims made");
    } else {
      lines.push("Risk:       no files in scope");
    }
  } else {
    lines.push(`Top-risk files (top ${Math.min(TOP_RISK_LIMIT, ranked.length)}):`);
    for (const r of ranked.slice(0, TOP_RISK_LIMIT)) {
      const score = (r.score ?? 0).toFixed(2);
      const fixes = r.defectDensity.groundedIn.length;
      const caveats = r.caveats.length > 0 ? `  [${r.caveats.join(", ")}]` : "";
      lines.push(
        `  ${pad(r.file, 50)} score=${score}  (${fixes} bug-fix touches)${caveats}`,
      );
    }
  }
  lines.push("");
  lines.push("(use --format json for machine-readable output)");
  return lines.join("\n");
}

function rankRisk(output: CliAnalysisOutput): readonly FileRiskReport[] {
  const reports: FileRiskReport[] = [];
  for (const file of output.risk.files) {
    const r = output.risk.byFile[file];
    if (r === undefined) continue;
    reports.push(r);
  }
  return reports
    .filter((r) => r.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function pad(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}
