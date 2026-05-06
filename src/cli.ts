#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command, Option } from "commander";

import { LocalAdapter } from "./adapters/local.js";
import { runAnalyzeCommand } from "./commands/analyze.js";
import { formatHuman } from "./format/human.js";
import { formatJson } from "./format/json.js";

interface AnalyzeOptions {
  readonly local?: boolean;
  readonly repo?: string;
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
  .version("0.1.0");

program
  .command("analyze")
  .description(
    "Analyse a git diff. Outputs JSON to stdout by default; pass --format human for a terminal-friendly summary.",
  )
  .option("--repo <path>", "path to a local git repository", process.cwd())
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
    const repo = resolve(rawOpts.repo ?? process.cwd());
    assertGitRepo(repo);
    const maxCommits = parseMaxCommits(rawOpts.maxCommits);
    const adapter = new LocalAdapter({
      repoDir: repo,
      diff: rawOpts.diff,
      maxCommits,
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

function assertGitRepo(path: string): void {
  if (!existsSync(path)) {
    throw new Error(`--repo path does not exist: ${path}`);
  }
  let stat;
  try {
    stat = statSync(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`--repo path is not accessible (${msg}): ${path}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`--repo path is not a directory: ${path}`);
  }
  // A git working tree has a `.git` directory; a bare repo / submodule
  // can have a `.git` file pointing elsewhere. Accept either.
  const dotGit = join(path, ".git");
  if (!existsSync(dotGit)) {
    throw new Error(
      `--repo path is not a git repository (no .git/ directory): ${path}`,
    );
  }
}

function parseMaxCommits(raw: string | undefined): number {
  const input = raw ?? "5000";
  if (!/^\d+$/.test(input)) {
    throw new Error(
      `--max-commits must be a non-negative integer, got: ${input}`,
    );
  }
  const n = Number(input);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new Error(
      `--max-commits must be a positive integer, got: ${input}`,
    );
  }
  return n;
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`prcompass: ${msg}\n`);
  process.exitCode = 1;
});
