"use client";

import { useState } from "react";
import type { BaselineResult, UsageInfo } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

export function BaselinePanel({
  result,
  usage,
  running,
  onRun,
  disabled,
}: {
  result: BaselineResult | undefined;
  usage?: UsageInfo;
  running: boolean;
  onRun: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card className="[--card-spacing:--spacing(7)]">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">
              A — Single-prompt baseline
              {result && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({result.model})
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              Same raw request, one carefully written prompt, no intermediate
              artifacts.
              {usage && (
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {usage.input_tokens}→{usage.output_tokens} tok
                </span>
              )}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {result && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen((o) => !o)}
              >
                {open ? (
                  <>
                    <ChevronDown />
                    Collapse
                  </>
                ) : (
                  <>
                    <ChevronRight />
                    Expand
                  </>
                )}
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={onRun}
              disabled={running || disabled}
            >
              {running ? (
                <>
                  <Loader2 className="animate-spin" />
                  Running…
                </>
              ) : result ? (
                "Re-run"
              ) : (
                "Run baseline"
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!result && (
          <p className="text-sm text-muted-foreground">
            Press <span className="font-medium text-foreground">Run baseline</span>{" "}
            to compare the four-node pipeline against a single-prompt attempt at
            the same request.
          </p>
        )}
        {result && open && (
          <pre className="mt-2 whitespace-pre-wrap rounded-2xl border border-border bg-background p-6 font-mono text-xs leading-relaxed text-foreground">
            {result.raw_response}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}