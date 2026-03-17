import type { Metadata } from "next";
import { site } from "@/data/site";

export const metadata: Metadata = {
  title: "Resume",
  description: `Resume of ${site.name} — Virtualization engineer.`,
};

const experience = [
  {
    company: "SmartX",
    companyHref: "https://www.smartx.com",
    role: "Virtualization R&D Engineer",
    period: "Jul 2024 – Sep 2025",
    location: "Chengdu, China",
    bullets: [
      "VM migration optimization: improved migration workflow (orchestration, data transfer, iterative/incremental); refactored incremental stage with multi-threading to increase throughput and reduce downtime.",
      "Virtio injection compatibility: designed VMware→KVM Virtio auto-injection for MBR/UEFI guests; improved initramfs dependency handling and rollback for legacy kernels (e.g., RHEL5 2.6.18), including a safe IDE fallback path.",
      "Cross-cluster live migration: developed key features in SMTX OS VM services (live migration, monitoring, alerting); implemented post-migration validation.",
      "QGA syscall-trace instrumentation: extended QGA tooling with Windows command invocation and ordered syscall tracing; exported structured logs for faster triage.",
      "Kernel debugging: isolated a Linux virtio-serial/console issue where payload >4KB could stall the second poll; produced a minimal reproducer and workaround (chunking) for escalation.",
      "Incident troubleshooting: resolved 100+ customer cases; standardized SOP for a UOS kernel-related issue; received formal customer appreciation.",
    ],
  },
  {
    company: "SmartX",
    companyHref: "https://www.smartx.com",
    role: "Virtualization R&D Intern",
    period: "Oct 2022 – Jul 2024",
    location: "Chengdu, China",
    bullets: [
      "Guest tooling (VMTools / QGA): extended VMTools based on QEMU Guest Agent — stats collection, script distribution, fsfreeze orchestration.",
      "VM migration tool: implemented a tool to convert VMware VMs into SmartX platform VMs.",
    ],
  },
  {
    company: "ByteDance (Feishu)",
    companyHref: "https://www.bytedance.com",
    role: "Systems Integration Development Intern",
    period: "Jun 2022 – Sep 2022",
    location: "Chengdu, China",
    bullets: [
      "Built Go + Gin services for recruiting/HR integration and data synchronization with external OA systems.",
      "Used MongoDB for sync metadata and retry states; improved APIs with authentication, rate limiting, pagination, documentation, and regression tests.",
    ],
  },
];

const projects = [
  {
    name: "Windows-MCP",
    href: "https://github.com/ziyangliu-666/Windows-MCP",
    description:
      "Research fork of CursorTouch/Windows-MCP. Agent uses the MCP server, patches it, hot-reloads it, and verifies whether real desktop behavior improved. Focused on AI-driven Windows automation reliability.",
    tags: ["Python", "MCP", "Agent Research"],
  },
  {
    name: "PawMemo",
    href: "https://github.com/ziyangliu-666/PawMemo",
    description:
      "Local-first vocabulary CLI for word learning. Anki-style cards, FSRS-style spaced repetition scheduler, LLM-powered teaching, and swappable AI companion packs. State stored in SQLite.",
    tags: ["TypeScript", "SQLite", "CLI", "LLM"],
  },
  {
    name: "EasyTrainer",
    href: "https://github.com/comethx/EasyTrainer",
    description:
      "PyTorch training toolkit, open-sourced from a garbage sorting WeChat Mini Program. Served model inference via Flask; built GitHub Actions CI for Docker image builds.",
    tags: ["Python", "PyTorch", "Flask", "Docker"],
  },
  {
    name: "jerkie_man",
    href: "https://github.com/ziyangliu-666/jerkie_man",
    description:
      "2D pixel-style multiplayer loot-shoot-extract game (搜打撤). TypeScript monorepo: Vite + Canvas 2D client and Node.js + WebSocket server with shared Zod protocol validation, MessagePack encoding, 20Hz server tick, and 120ms client interpolation.",
    tags: ["TypeScript", "Canvas 2D", "WebSocket", "Node.js"],
  },
];

const skills = [
  { category: "Languages", items: ["Python", "Go", "C", "Shell"] },
  { category: "Virtualization", items: ["QEMU/KVM", "libvirt", "Virtio", "QGA"] },
  { category: "Debugging", items: ["gdb", "perf", "strace"] },
  { category: "DevOps", items: ["Docker", "Jenkins", "Git", "Jira", "RPM/DEB packaging"] },
  { category: "Databases", items: ["MySQL", "MongoDB", "Redis"] },
  { category: "AI Tools", items: ["Claude Code", "Cursor", "ChatGPT"] },
];

export default function ResumePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      {/* Header */}
      <header className="mb-12 pb-8 border-b border-line">
        <h1 className="text-3xl font-semibold tracking-tight text-ink mb-1">
          {site.name}
        </h1>
        <p className="font-mono text-sm text-jade mb-4">{site.title}</p>
        <div className="flex flex-wrap gap-4 font-mono text-xs text-ink-muted">
          <a href={`mailto:${site.email}`} className="hover:text-jade transition-colors">
            {site.email}
          </a>
          <a href={site.github} target="_blank" rel="noopener noreferrer" className="hover:text-jade transition-colors">
            github.com/ziyangliu-666
          </a>
          <a href={site.linkedin} target="_blank" rel="noopener noreferrer" className="hover:text-jade transition-colors">
            linkedin
          </a>
          <span>{site.location}</span>
        </div>
      </header>

      {/* Experience */}
      <section className="mb-14">
        <p className="font-mono text-xs text-jade tracking-widest uppercase mb-8">
          experience
        </p>
        <div className="space-y-10">
          {experience.map((job, i) => (
            <div key={i}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 mb-3">
                <div>
                  <a
                    href={job.companyHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-ink hover:text-jade transition-colors"
                  >
                    {job.company}
                  </a>
                  <p className="text-sm text-ink-muted">{job.role}</p>
                </div>
                <div className="sm:text-right">
                  <p className="font-mono text-xs text-ink-dim">{job.period}</p>
                  <p className="font-mono text-xs text-ink-dim">{job.location}</p>
                </div>
              </div>
              <ul className="space-y-2">
                {job.bullets.map((bullet, j) => (
                  <li key={j} className="flex gap-3 text-sm text-ink-muted leading-relaxed">
                    <span className="text-jade mt-1 flex-shrink-0 text-xs">—</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="mb-14">
        <p className="font-mono text-xs text-jade tracking-widest uppercase mb-8">
          education
        </p>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
          <div>
            <p className="font-semibold text-ink">University of Electronic Science and Technology of China (UESTC)</p>
            <p className="text-sm text-ink-muted">B.Eng. in Software Engineering</p>
            <p className="text-sm text-ink-muted mt-1">GPA: 3.58 / 4.00</p>
          </div>
          <div className="sm:text-right">
            <p className="font-mono text-xs text-ink-dim">Sep 2020 – Jun 2024</p>
            <p className="font-mono text-xs text-ink-dim">Chengdu, China</p>
          </div>
        </div>
      </section>

      {/* Projects */}
      <section className="mb-14">
        <p className="font-mono text-xs text-jade tracking-widest uppercase mb-8">
          projects
        </p>
        <div className="space-y-5">
          {projects.map((p) => (
            <div key={p.name}>
              <div className="flex items-start gap-3 mb-1">
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink hover:text-jade transition-colors"
                >
                  {p.name} ↗
                </a>
                <div className="flex flex-wrap gap-1.5 mt-0.5">
                  {p.tags.map((tag) => (
                    <span key={tag} className="font-mono text-xs text-ink-dim border border-line px-1.5 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      <section className="mb-14">
        <h2 className="font-mono text-xs text-jade tracking-widest uppercase mb-8">
          skills
        </h2>
        <div className="space-y-3">
          {skills.map((group) => (
            <div key={group.category} className="flex flex-col sm:flex-row sm:gap-6">
              <span className="font-mono text-xs text-ink-dim w-28 flex-shrink-0 pt-0.5">
                {group.category}
              </span>
              <div className="flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <span key={item} className="font-mono text-xs text-ink-muted border border-line px-2 py-0.5 rounded">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Honors */}
      <section>
        <h2 className="font-mono text-xs text-jade tracking-widest uppercase mb-8">
          honors
        </h2>
        <ul className="space-y-2">
          {[
            "University Scholarship (2020–2021)",
            "National Third Prize, China Collegiate Computer Design Competition (2022)",
            "Innovation Workshop Vice Chair — organized peer teaching sessions and competition participation",
          ].map((item) => (
            <li key={item} className="flex gap-3 text-sm text-ink-muted">
              <span className="text-jade flex-shrink-0">—</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
