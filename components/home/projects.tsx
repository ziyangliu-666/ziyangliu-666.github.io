import { projects } from "@/data/work";
import { ExternalIcon } from "@/components/ui/icons";

export function Projects() {
  const featured = projects.slice(0, 2);
  const secondary = projects.slice(2);

  return (
    <section className="mx-auto max-w-5xl px-6 lg:px-10 py-20">
      <p className="font-mono text-xs text-jade tracking-widest uppercase mb-10">
        projects
      </p>

      {/* Featured 2-col grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {featured.map((project) => (
          <a
            key={project.name}
            href={project.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col p-6 bg-surface border border-line rounded-lg hover:border-jade/40 transition-colors"
            aria-label={`${project.name} on GitHub`}
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <h3 className="font-semibold text-ink group-hover:text-jade transition-colors">
                {project.name}
              </h3>
              <ExternalIcon className="w-3.5 h-3.5 text-ink-dim group-hover:text-jade transition-colors flex-shrink-0 mt-0.5" />
            </div>
            <p className="text-sm text-ink-muted leading-relaxed mb-5 flex-1">
              {project.detail}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  className="font-mono text-xs text-ink-dim border border-line px-2 py-0.5 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>

      {/* Secondary projects — compact rows */}
      <div className="flex flex-col gap-2 mt-4">
        {secondary.map((proj) => (
          <a
            key={proj.name}
            href={proj.href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between p-4 bg-surface border border-line rounded-lg hover:border-jade/40 transition-colors"
            aria-label={`${proj.name} on GitHub`}
          >
            <div className="flex items-center gap-4 min-w-0">
              <h3 className="font-medium text-ink-muted group-hover:text-ink transition-colors text-sm whitespace-nowrap">
                {proj.name}
              </h3>
              <span className="text-ink-dim text-xs hidden sm:block">·</span>
              <p className="text-xs text-ink-dim truncate hidden sm:block">
                {proj.description}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 ml-4">
              <div className="flex gap-1.5">
                {proj.tags.map((tag) => (
                  <span key={tag} className="font-mono text-xs text-ink-dim hidden lg:inline">
                    {tag}
                  </span>
                ))}
              </div>
              <ExternalIcon className="w-3.5 h-3.5 text-ink-dim group-hover:text-jade transition-colors" />
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
