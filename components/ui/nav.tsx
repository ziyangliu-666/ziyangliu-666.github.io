import Link from "next/link";
import { site } from "@/data/site";
import { navLinks } from "@/data/links";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/90 backdrop-blur-sm">
      <nav
        className="mx-auto flex max-w-5xl items-center justify-between px-6 lg:px-10 py-4"
        aria-label="Main navigation"
      >
        <Link
          href="/"
          className="font-mono text-sm text-ink hover:text-jade transition-colors"
          aria-label="Home"
        >
          {site.name.toLowerCase().replace(" ", ".")}
        </Link>

        <ul className="flex items-center gap-6" role="list">
          {navLinks.map((link) => (
            <li key={link.label}>
              {link.external ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm text-ink-muted hover:text-ink transition-colors py-3"
                >
                  {link.label.toLowerCase()}
                </a>
              ) : (
                <Link
                  href={link.href}
                  className="font-mono text-sm text-ink-muted hover:text-ink transition-colors py-3"
                >
                  {link.label.toLowerCase()}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
