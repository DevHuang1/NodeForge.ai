/**
 * Graceful shutdown: SIGINT/SIGTERM produce a cancelled run (exit 130), never
 * an orphaned child process or a half-written run directory.
 */

export interface ShutdownHook {
  (): Promise<void> | void;
}

export interface ShutdownController {
  /** AbortSignal fired on first signal; second signal forces exit 130. */
  signal: AbortSignal;
  registerCleanup(hook: ShutdownHook): void;
  dispose(): void;
  /** True when a shutdown was requested. */
  readonly requested: boolean;
}

export function setupShutdown(signals: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"]): ShutdownController {
  const internal = new AbortController();
  let cleanups: ShutdownHook[] = [];
  let requested = false;
  let forceExitTimer: NodeJS.Timeout | null = null;

  const handler = (signal: NodeJS.Signals): void => {
    requested = true;
    if (!internal.signal.aborted) {
      internal.abort(signal);
    }
    // Second Ctrl+C (or any signal after abort) forces immediate exit.
    if (forceExitTimer === null) {
      forceExitTimer = setTimeout(() => {
        process.stderr.write(`nodeforge: received ${signal} again; forcing exit\n`);
        process.exit(130);
      }, 500);
      forceExitTimer.unref?.();
    }
  };

  for (const s of signals) process.on(s, handler);

  return {
    signal: internal.signal,
    get requested() {
      return requested;
    },
    registerCleanup(hook: ShutdownHook) {
      cleanups.push(hook);
    },
    async dispose() {
      for (const s of signals) process.off(s, handler);
      if (forceExitTimer !== null) clearTimeout(forceExitTimer);
      const hooks = cleanups;
      cleanups = [];
      for (const hook of hooks.reverse()) {
        try {
          await hook();
        } catch {
          // best effort during shutdown
        }
      }
    },
  };
}
