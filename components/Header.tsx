import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "#architecture", label: "Architecture" },
  { href: "#demo", label: "Live Demo" },
  { href: "#review", label: "PR Review" },
  { href: "#prompts", label: "Prompts" },
  { href: "#flowchart", label: "Flowchart" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-6 sm:px-10">
        <Link href="#top" className="flex items-baseline gap-1.5">
          <span className="font-heading text-xl tracking-tight text-foreground">
            NodeForge
          </span>
          <span className="text-sm text-muted-foreground">.ai</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-full px-4 py-2 transition-colors hover:bg-secondary hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground lg:inline">
            Track 2 · ML Prompt Engineering
          </span>
          <ThemeToggle />
          <Button asChild size="lg">
            <a href="#demo">Run the demo</a>
          </Button>
        </div>
      </div>
    </header>
  );
}