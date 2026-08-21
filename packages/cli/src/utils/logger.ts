/**
 * Terminal logger with honest TTY handling.
 *
 * Color is enabled only when stdout is a TTY and neither --no-color nor
 * NO_COLOR is set. FORCE_COLOR=1 forces color for snapshot tests.
 */

export type ColorFn = (text: string) => string;

export interface LoggerOptions {
  verbose?: boolean;
  quiet?: boolean;
  color?: boolean;
  stream?: NodeJS.WritableStream;
  errorStream?: NodeJS.WritableStream;
}

const ENABLED = true;

function detectColor(explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "1" || process.env.FORCE_COLOR === "true") return true;
  return Boolean(process.stdout.isTTY);
}

function makeColor(code: string, enabled: boolean): ColorFn {
  return enabled ? (text: string) => `\u001B[${code}m${text}\u001B[0m` : (text: string) => text;
}

export class Logger {
  private readonly out: NodeJS.WritableStream;
  private readonly err: NodeJS.WritableStream;
  private readonly verboseMode: boolean;
  private readonly quietMode: boolean;

  readonly colorEnabled: boolean;
  readonly green: ColorFn;
  readonly red: ColorFn;
  readonly yellow: ColorFn;
  readonly cyan: ColorFn;
  readonly dim: ColorFn;
  readonly bold: ColorFn;

  constructor(options: LoggerOptions = {}) {
    this.out = options.stream ?? process.stdout;
    this.err = options.errorStream ?? process.stderr;
    this.verboseMode = Boolean(options.verbose);
    this.quietMode = Boolean(options.quiet);
    this.colorEnabled =
      options.color !== undefined ? options.color && ENABLED : detectColor(undefined);
    this.green = makeColor("32", this.colorEnabled);
    this.red = makeColor("31", this.colorEnabled);
    this.yellow = makeColor("33", this.colorEnabled);
    this.cyan = makeColor("36", this.colorEnabled);
    this.dim = makeColor("2", this.colorEnabled);
    this.bold = makeColor("1", this.colorEnabled);
  }

  /** Normal progress output; suppressed by --quiet. */
  info(message: string): void {
    if (!this.quietMode) this.write(this.out, message);
  }

  /** Success highlight. */
  success(message: string): void {
    if (!this.quietMode) this.write(this.out, this.green(message));
  }

  warn(message: string): void {
    if (!this.quietMode) this.write(this.err, this.yellow(message));
  }

  error(message: string): void {
    this.write(this.err, this.red(message));
  }

  debug(message: string): void {
    if (this.verboseMode) this.write(this.out, this.dim(`[debug] ${message}`));
  }

  /** Machine-readable output (--json etc.) bypasses quiet mode on stdout. */
  raw(text: string): void {
    this.write(this.out, text);
  }

  private write(stream: NodeJS.WritableStream, message: string): void {
    stream.write(`${message}\n`);
  }
}
