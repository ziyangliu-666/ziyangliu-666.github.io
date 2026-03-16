import { site } from "@/data/site";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-5xl px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <p className="font-mono text-xs text-ink-dim">
          {site.name} · {site.location}
        </p>
        <a
          href={`mailto:${site.email}`}
          className="font-mono text-xs text-ink-dim hover:text-jade transition-colors"
        >
          {site.email}
        </a>
      </div>
    </footer>
  );
}
