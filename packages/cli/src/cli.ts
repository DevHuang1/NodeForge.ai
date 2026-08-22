/**
 * nodeforge CLI entry point.
 *
 * main(argv) never throws: every failure path maps to an honest exit code.
 * SIGINT/SIGTERM abort the engine and produce a cancelled run (exit 130).
 */

import { readFileSync } from "fs";
import { Command, CommanderError } from "commander";
import { exitCodeForThrown } from "./core/errors.js";
import { EXIT_CODES } from "./core/exit-codes.js";
import { redactString } from "./evidence/redaction.js";
import { Logger } from "./utils/logger.js";
import { setupShutdown, type ShutdownController } from "./utils/signals.js";
import { reviewAction } from "./commands/review.js";
import { scanAction } from "./commands/scan.js";
import { testAction } from "./commands/test.js";
import { reportAction } from "./commands/report.js";
import { auditAction } from "./commands/audit.js";
import { doctorAction } from "./commands/doctor.js";
import { initAction } from "./commands/init.js";
import type { GlobalOptions } from "./commands/common.js";

function readVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function makeLogger(opts: GlobalOptions): Logger {
  return new Logger({
    verbose: Boolean(opts.verbose),
    quiet: Boolean(opts.quiet),
    color: typeof opts.color === "boolean" ? opts.color : undefined,
  });
}

export function buildProgram(
  shutdown: ShutdownController,
  version: string,
): Command {
  const program = new Command();
  // Never process.exit from commander; every failure maps to process.exitCode
  // so the CLI is safely embeddable (tests, worker threads) and shutdown runs.
  program.exitOverride();
  program
    .name("nodeforge")
    .description(
      "Evidence-first verification: deterministic security scanning, guarded test execution, honest statuses.",
    )
    .version(version)
    .option("-v, --verbose", "verbose progress output", false)
    .option(
      "-q, --quiet",
      "suppress progress output (machine output still prints)",
      false,
    )
    .option("--no-color", "disable colored output")
    .option("--json", "shorthand for machine-readable JSON output", false)
    .option("--markdown", "render reports as markdown", false)
    .option("--sarif", "emit SARIF 2.1.0 (review/scan/report)", false)
    .option("--timeout <ms>", "override tests.timeoutMs")
    .option(
      "--provider <name>",
      "analysis provider override: openrouter | openai | featherless | none",
    )
    .option("--dry-run", "run read-only stages only; persist nothing", false);

  program
    .command("review")
    .description(
      "Full verification workflow: context, capabilities, scan, tests, analysis.",
    )
    .argument("[target]", "local repository path or GitHub pull request URL", ".")
    .action(async (target: string) => {
      const opts = program.opts<GlobalOptions>();
      await reviewAction(
        target,
        opts,
        makeLogger(opts),
        version,
        shutdown.signal,
      );
    });

  program
    .command("scan")
    .description(
      "Deterministic security scan of a local directory (no execution).",
    )
    .argument("[path]", "path to the project root", ".")
    .action(async (targetPath: string) => {
      const opts = program.opts<GlobalOptions>();
      await scanAction(
        targetPath,
        opts,
        makeLogger(opts),
        version,
        shutdown.signal,
      );
    });

  program
    .command("test")
    .description(
      "Discover and execute the project's test suite under sandbox policy.",
    )
    .argument("[path]", "path to the project root", ".")
    .action(async (targetPath: string) => {
      const opts = program.opts<GlobalOptions>();
      await testAction(
        targetPath,
        opts,
        makeLogger(opts),
        version,
        shutdown.signal,
      );
    });

  program
    .command("report")
    .description("Render a previously stored verification run.")
    .argument("<run-id>", 'run id or "latest"')
    .option(
      "--format <format>",
      "output format: terminal | json | markdown | sarif",
    )
    .action(async (runId: string, cmdOpts: { format?: string }) => {
      const opts = { ...program.opts<GlobalOptions>(), ...cmdOpts };
      await reportAction(runId, opts, makeLogger(opts));
    });

  program
    .command("audit")
    .description("Show the timestamped audit trail for a run.")
    .argument("<run-id>", 'run id or "latest"')
    .option("--limit <n>", "maximum number of events to show", "200")
    .action(async (runId: string, cmdOpts: { limit?: string }) => {
      const opts = { ...program.opts<GlobalOptions>(), ...cmdOpts };
      await auditAction(runId, opts, makeLogger(opts));
    });

  program
    .command("doctor")
    .description(
      "Check environment, configuration, runners, and credentials (presence only).",
    )
    .option(
      "--connectivity",
      "probe the analysis provider endpoint (never sends secrets)",
      false,
    )
    .action(async (cmdOpts: { connectivity?: boolean }) => {
      const opts = { ...program.opts<GlobalOptions>(), ...cmdOpts };
      await doctorAction(opts, makeLogger(opts), version);
    });

  program
    .command("init")
    .description(
      "Scaffold .nodeforge/config.json and config.schema.json in the current directory.",
    )
    .option("--force", "overwrite existing config", false)
    .action(async (cmdOpts: { force?: boolean }) => {
      await initAction(cmdOpts, makeLogger(program.opts<GlobalOptions>()));
    });

  return program;
}

/**
 * Program entry point. Accepts user arguments (everything after the program
 * name); defaults to process.argv minus node and script. Resolves after the
 * command completes; the process exit code is communicated via process.exitCode.
 */
export async function main(
  args: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const shutdown = setupShutdown();
  try {
    const program = buildProgram(shutdown, readVersion());
    await program.parseAsync([...args], { from: "user" });
  } catch (error) {
    const log = new Logger();
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) {
        // Informational exits (--version, --help): commander already printed
        // the output before throwing; nothing to report, exit clean.
        process.exitCode = EXIT_CODES.ok;
        return;
      }
      log.error(redactString(error.message).text);
      process.exitCode = 2;
    } else {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`nodeforge: ${redactString(message).text}`);
      process.exitCode = exitCodeForThrown(error);
    }
  } finally {
    await shutdown.dispose();
  }
}
