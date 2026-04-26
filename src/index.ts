/**
 * `@prcompass/cli` — programmatic API.
 *
 * Most users want the binary entry (`npx prcompass analyze ...`); this
 * module is for callers who want to integrate the CLI's pipeline into
 * their own Node code.
 *
 * @packageDocumentation
 */

export {
  GitHubAdapter,
  LocalAdapter,
  type GitHubAdapterOpts,
  type GitHubClientLike,
  type LocalAdapterOpts,
} from "./adapters/index.js";

export {
  analyzeCollectedContext,
  runAnalyzeCommand,
  type CliAnalysisOutput,
} from "./commands/analyze.js";

export { formatHuman, formatJson, type JsonFormatOpts } from "./format/index.js";
