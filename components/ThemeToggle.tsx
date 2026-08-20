"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "nodeforge-theme";

function applyStoredTheme() {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  const prefersDark =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const dark = stored === "dark" || (stored !== "light" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

function toggle() {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  } catch {
    /* ignore */
  }
}

export function ThemeToggle() {
  useEffect(() => {
    applyStoredTheme();
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
    >
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="h-4 w-4 dark:hidden" />
    </button>
  );
}