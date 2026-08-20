interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  accent?: string;
  centered?: boolean;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  accent = "#2f5bd0",
  centered = false,
}: SectionHeaderProps) {
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-3xl"}>
      <p
        className="text-xs font-semibold uppercase tracking-[0.18em]"
        style={{ color: accent }}
      >
        {eyebrow}
      </p>
      <h2 className="mt-5 font-heading text-3xl tracking-tight text-foreground sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}