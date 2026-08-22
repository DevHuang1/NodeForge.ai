#!/usr/bin/env node
import { main } from "../dist/cli.js";

main(process.argv.slice(2)).catch((error) => {
  // Last-resort handler: never leak stack traces or secrets in non-verbose mode.
  const verbose = process.argv.includes("--verbose");
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`nodeforge: ${message}\n`);
  if (verbose && error instanceof Error && error.stack) {
    process.stderr.write(`${error.stack}\n`);
  }
  process.exit(4);
});
