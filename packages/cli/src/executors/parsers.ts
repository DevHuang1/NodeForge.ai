/**
 * Runner output parsers: convert runner-specific text into common counts.
 *
 * A parser never invents results it cannot see. When nothing recognizable is
 * found the parser reports zero discovered tests and the executor treats a
 * zero exit code conservatively (see test-runner.ts).
 */

export interface ParsedCounts {
  discovered: number;
  passed: number;
  failed: number;
  skipped: number;
}

export const EMPTY_COUNTS: ParsedCounts = { discovered: 0, passed: 0, failed: 0, skipped: 0 };

export function countsAreCoherent(c: ParsedCounts): boolean {
  return c.discovered > 0 || c.passed > 0 || c.failed > 0 || c.skipped > 0;
}

function firstNumber(text: string, re: RegExp): number | null {
  const m = re.exec(text);
  return m ? Number(m[1]) : null;
}

/** Jest and Vitest summary blocks. */
export function parseJestLike(output: string): ParsedCounts {
  // Jest:
  //   Tests:       1 failed, 5 passed, 2 skipped, 8 total
  // Vitest:
  //   Tests  1 failed | 5 passed | 2 skipped (8)
  const passed =
    firstNumber(output, /(\d+)\s+passed/) ??
    firstNumber(output, /(\d+)\s+pass(?:ed|ing)\b/);
  const failed =
    firstNumber(output, /(\d+)\s+failed/) ?? firstNumber(output, /(\d+)\s+fail(?:ed|ures?)\b/);
  const skipped =
    firstNumber(output, /(\d+)\s+skipped/i) ??
    firstNumber(output, /(\d+)\s+(?:todo|pending)\b/i);
  const total =
    firstNumber(output, /(\d+)\s+total\b/) ??
    firstNumber(output, /\((\d+)\)/);

  if (passed === null && failed === null && total === null) {
    return { ...EMPTY_COUNTS };
  }
  const p = passed ?? 0;
  const f = failed ?? 0;
  const s = skipped ?? 0;
  const discovered = total !== null && total >= p + f + s ? total : p + f + s;
  return { discovered, passed: p, failed: f, skipped: s };
}

/** pytest verbose or short summaries. */
export function parsePytest(output: string): ParsedCounts {
  const passed = firstNumber(output, /(\d+) passed/);
  const failed =
    firstNumber(output, /(\d+) failed/) ?? firstNumber(output, /(\d+) error/);
  const skipped =
    firstNumber(output, /(\d+) skipped/) ?? firstNumber(output, /(\d+) xfailed/);
  const collected = firstNumber(output, /collected (\d+) items?/);

  if (passed === null && failed === null && collected === null) {
    // Verbose per-test lines as a fallback.
    const passedNames = [...output.matchAll(/::[A-Za-z0-9_]+\s+(PASSED|XPASS)/g)].length;
    const failedNames = [...output.matchAll(/(FAILED|ERROR)\s+\S+/g)].length;
    if (passedNames + failedNames === 0) return { ...EMPTY_COUNTS };
    return { discovered: passedNames + failedNames, passed: passedNames, failed: failedNames, skipped: 0 };
  }

  const p = passed ?? 0;
  const f = failed ?? 0;
  const s = skipped ?? 0;
  const discovered = collected !== null && collected >= p + f + s ? collected : p + f + s;
  return { discovered, passed: p, failed: f, skipped: s };
}

/** go test verbose-ish output. */
export function parseGoTest(output: string): ParsedCounts {
  const okPackages = [...output.matchAll(/^ok\s+\S+/gm)].length;
  const failPackages = [...output.matchAll(/^FAIL/gm)].length;
  const passTests = [...output.matchAll(/^\s*--- PASS:\s+/gm)].length;
  const failTests = [...output.matchAll(/^\s*--- FAIL:\s+/gm)].length;
  const skipTests = [...output.matchAll(/^\s*--- SKIP:\s+/gm)].length;
  const passed = passTests > 0 || okPackages > 0 ? Math.max(passTests, okPackages) : 0;
  const failed = Math.max(failTests, failPackages);
  if (passed === 0 && failed === 0 && skipTests === 0) return { ...EMPTY_COUNTS };
  return { discovered: passed + failed + skipTests, passed, failed, skipped: skipTests };
}

/**
 * Node.js built-in test runner (`node --test`) summary, in either of its
 * two renderings:
 *
 * spec:            TAP 14:
 *   ℹ tests 1        # tests 1
 *   ℹ pass 1         # pass 1
 *   ℹ fail 0         # fail 0
 */
export function parseNodeTest(output: string): ParsedCounts {
  const grab = (label: string): number | null =>
    firstNumber(output, new RegExp(`^[^\\w"#]*#?\\s*${label}\\s+(\\d+)\\s*$`, "m"));
  const tests = grab("tests");
  const passed = grab("pass");
  const failed = grab("fail");
  const skipped = grab("skipped") ?? grab("todo");
  if (tests === null && passed === null && failed === null) {
    return { ...EMPTY_COUNTS };
  }
  const p = passed ?? 0;
  const f = failed ?? 0;
  const s = skipped ?? 0;
  const discovered = tests !== null && tests >= p + f + s ? tests : p + f + s;
  return { discovered, passed: p, failed: f, skipped: s };
}

/**
 * Parse output for a runner id. Unknown runners fall back to Jest-like
 * parsing (npm test usually wraps jest), then to empty counts.
 */
export function parseRunnerOutput(runnerId: string | null, output: string): ParsedCounts {
  switch (runnerId) {
    case "pytest":
      return parsePytest(output);
    case "go-test":
      return parseGoTest(output);
    case "vitest":
    case "jest":
      return parseJestLike(output);
    case "npm-test":
    case "pnpm-test":
    case "yarn-test": {
      const jestish = parseJestLike(output);
      if (countsAreCoherent(jestish)) return jestish;
      const pytestish = parsePytest(output);
      if (countsAreCoherent(pytestish)) return pytestish;
      const nodeTestish = parseNodeTest(output);
      if (countsAreCoherent(nodeTestish)) return nodeTestish;
      return { ...EMPTY_COUNTS };
    }
    default: {
      const jestish = parseJestLike(output);
      if (countsAreCoherent(jestish)) return jestish;
      const pytestish = parsePytest(output);
      if (countsAreCoherent(pytestish)) return pytestish;
      const nodeTestish = parseNodeTest(output);
      if (countsAreCoherent(nodeTestish)) return nodeTestish;
      return { ...EMPTY_COUNTS };
    }
  }
}
