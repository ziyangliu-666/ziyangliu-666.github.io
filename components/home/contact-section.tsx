import { site } from "@/data/site";
import { GitHubIcon, LinkedInIcon, EmailIcon, FileIcon } from "@/components/ui/icons";

const links = [
  {
    label: "Email",
    value: site.email,
    href: `mailto:${site.email}`,
    icon: EmailIcon,
    external: false,
  },
  {
    label: "GitHub",
    value: "ziyangliu-666",
    href: site.github,
    icon: GitHubIcon,
    external: true,
  },
  {
    label: "LinkedIn",
    value: "ziyang-liu",
    href: site.linkedin,
    icon: LinkedInIcon,
    external: true,
  },
  {
    label: "Resume",
    value: "view online",
    href: "/resume",
    icon: FileIcon,
    external: false,
  },
];

export function ContactSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 lg:px-10 py-20">
      <p className="font-mono text-xs text-jade tracking-widest uppercase mb-2">
        contact
      </p>
      <p className="text-ink-muted text-sm mb-10 max-w-md">
        Available for backend, infrastructure, and AI tooling roles.
        Reach out by email or connect on LinkedIn.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {links.map(({ label, value, href, icon: Icon, external }) => (
          <a
            key={label}
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className="group flex flex-col items-start p-4 bg-surface border border-line rounded-lg hover:border-jade/40 transition-colors"
          >
            <Icon className="w-4 h-4 text-ink-dim group-hover:text-jade transition-colors mb-3" />
            <p className="font-mono text-xs text-ink-dim mb-0.5">{label.toLowerCase()}</p>
            <p className="text-sm text-ink-muted group-hover:text-ink transition-colors truncate w-full">
              {value}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}
