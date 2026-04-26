import type { CliAnalysisOutput } from "../commands/analyze.js";

export interface JsonFormatOpts {
  /** Pretty-print with 2-space indent. Default `false` (compact, NDJSON-friendly). */
  readonly pretty?: boolean;
}

/**
 * Stable JSON serialisation. Uses `JSON.stringify` with no replacer so
 * the output is deterministic given a deterministic input. The
 * core analysis output is engineered to be JSON-clean (no Maps, no
 * Dates, no functions); the CLI output inherits that.
 */
export function formatJson(
  output: CliAnalysisOutput,
  opts: JsonFormatOpts = {},
): string {
  return JSON.stringify(output, null, opts.pretty ? 2 : 0);
}
