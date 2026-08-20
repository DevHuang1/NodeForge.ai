"use client";

import { useState } from "react";

type JsonPrimitive = string | number | boolean | null;

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === "object" && v !== null;
}

function Primitive({ value }: { value: JsonPrimitive }) {
  if (value === null) return <span className="text-muted-foreground">null</span>;
  if (typeof value === "boolean")
    return <span className="text-purple-600">{"true"}</span>;
  if (typeof value === "number")
    return <span className="text-orange-600">{value}</span>;
  return (
    <span className="text-blue-700">
      &ldquo;{value}&rdquo;
    </span>
  );
}

function Container({
  label,
  count,
  open,
  onToggle,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const unit = label === "Array" ? `items` : `keys`;
  return (
    <div className="leading-relaxed">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 text-left text-foreground/90 hover:text-foreground"
      >
        <span
          className={`text-[10px] transition-transform ${
            open ? "rotate-90" : ""
          }`}
        >
          ▶
        </span>
        <span className="text-amber-700">{label}</span>
        <span className="text-xs text-muted-foreground">
          [{count} {unit}]
        </span>
      </button>
      {open && <div className="ml-4 border-l border-border pl-3">{children}</div>}
    </div>
  );
}

function JsonNode({
  name,
  value,
  depth,
}: {
  name?: string;
  value: unknown;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const namePrefix = name !== undefined ? (
    <span className="text-purple-700">&ldquo;{name}&rdquo;</span>
  ) : null;

  if (!isContainer(value)) {
    return (
      <div className="flex gap-2">
        {namePrefix}
        <Primitive value={value as JsonPrimitive} />
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div>
        {namePrefix && (
          <span className="mr-2 text-purple-700">&ldquo;{name}&rdquo;</span>
        )}
        <Container
          label="Array"
          count={value.length}
          open={open}
          onToggle={() => setOpen((o) => !o)}
        >
          {value.map((item, i) => (
            <JsonNode key={i} value={item} depth={depth + 1} />
          ))}
        </Container>
      </div>
    );
  }

  const entries = Object.entries(value);
  return (
    <div>
      {namePrefix && <span className="mr-2 text-purple-700">&ldquo;{name}&rdquo;</span>}
      <Container
        label="Object"
        count={entries.length}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      >
        {entries.map(([key, val]) => (
          <JsonNode key={key} name={key} value={val} depth={depth + 1} />
        ))}
      </Container>
    </div>
  );
}

export function JsonView({ data }: { data: unknown }) {
  return (
    <div className="overflow-auto rounded-lg border border-border bg-background p-5 font-mono text-xs text-foreground">
      <JsonNode value={data} depth={0} />
    </div>
  );
}