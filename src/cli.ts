#!/usr/bin/env node
import { resolve } from "node:path";
import { Command, Option } from "commander";

import { LocalAdapter } from "./adapters/local.js";
import { runAnalyzeCommand } from "./commands/analyze.js";
import { formatHuman } from "./format/human.js";
import { formatJson } from "./format/json.js";

interface AnalyzeOptions {
  readonly local?: boolean;
  readonly repo: string;
  readonly diff: string;
  readonly format: "json" | "human";
  readonly pretty?: boolean;
  readonly maxCommits?: string;
}

const program = new Command();

program
  .name("prcompass")
  .description(
    "PR Compass CLI — deterministic OSS analysis of a git diff against the repo's history.",
  )
  .version("0.0.0");

program
  .command("analyze")
  .description(
    "Analyse a git diff. Outputs JSON to stdout by default; pass --format human for a terminal-friendly summary.",
  )
  .requiredOption("--repo <path>", "path to a local git repository", process.cwd())
  .requiredOption(
    "--diff <range>",
    'git diff range (e.g. "HEAD~1..HEAD", "main..feature", or a single ref interpreted as "<ref>..HEAD")',
  )
  .option("--local", "use the LocalAdapter (default and currently only mode)", true)
  .addOption(
    new Option("--format <kind>", "output format")
      .choices(["json", "human"])
      .default("json"),
  )
  .option("--pretty", "pretty-print JSON output (no effect with --format human)")
  .option("--max-commits <n>", "cap commit history walk", "5000")
  .action(async (rawOpts: AnalyzeOptions) => {
    const repo = resolve(rawOpts.repo);
    const adapter = new LocalAdapter({
      repoDir: repo,
      diff: rawOpts.diff,
      maxCommits: Number(rawOpts.maxCommits ?? "5000"),
    });
    const output = await runAnalyzeCommand(adapter);
    if (rawOpts.format === "human") {
      process.stdout.write(formatHuman(output));
      process.stdout.write("\n");
    } else {
      process.stdout.write(formatJson(output, { pretty: rawOpts.pretty === true }));
      process.stdout.write("\n");
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`prcompass: ${msg}\n`);
  process.exitCode = 1;
});
