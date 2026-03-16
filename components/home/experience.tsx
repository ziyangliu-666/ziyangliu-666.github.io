import { ExternalIcon } from "@/components/ui/icons";

const entries = [
  {
    company: "SmartX",
    companyHref: "https://www.smartx.com",
    role: "Virtualization R&D Engineer / Intern",
    period: "Oct 2022 – Sep 2025",
    location: "Chengdu",
    products: [
      { name: "SMTX OS", href: "https://www.smartx.com/hk-mo/smtx-os/" },
      { name: "Migration Tool", href: "https://www.smartx.com/hk-mo/migration-tool/" },
    ],
    bullets: [
      "VM migration: multi-threaded incremental migration, orchestration, and data transfer improvements.",
      "Virtio injection: VMware→KVM auto-injection for MBR/UEFI guests; rollback handling for legacy kernels.",
      "Cross-cluster live migration and post-migration validation in SMTX OS VM services.",
      "QGA tooling: extended QEMU Guest Agent with syscall tracing and structured log export.",
      "Kernel debugging: isolated virtio-serial/console bug (payload >4KB stalls poll); produced reproducer.",
      "Resolved 100+ customer incidents; standardized SOP for a UOS kernel issue.",
    ],
  },
  {
    company: "ByteDance (Feishu)",
    companyHref: "https://www.bytedance.com",
    role: "Systems Integration Development Intern",
    period: "Jun 2022 – Sep 2022",
    location: "Chengdu",
    products: [
      { name: "Lark Suite", href: "https://www.larksuite.com/en_sg/?from_site=feishu" },
    ],
    bullets: [
      "Go + Gin services for recruiting/HR integration and data sync with external OA systems.",
      "MongoDB for sync metadata and retry states; added auth, rate limiting, pagination, and regression tests.",
    ],
  },
];

export function Experience() {
  return (
    <section className="border-y border-line bg-surface" aria-label="Work experience">
      <div className="mx-auto max-w-5xl px-6 lg:px-10 py-16">
        <h2 className="font-mono text-xs text-jade tracking-widest uppercase mb-10">
          experience
        </h2>

        <div className="space-y-10">
          {entries.map((company, i) => (
            <div
              key={`${company.company}-${i}`}
              className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${
                i < entries.length - 1 ? "pb-10 border-b border-line" : ""
              }`}
            >
              {/* Left: company identity */}
              <div className="lg:col-span-1">
                <a
                  href={company.companyHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-ink hover:text-jade transition-colors text-base leading-tight"
                >
                  {company.company}
                </a>
                <p className="text-sm text-ink-muted mt-0.5 mb-1">{company.role}</p>
                <p className="font-mono text-xs text-ink-dim mb-4">
                  {company.period} · {company.location}
                </p>

                {company.products.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="font-mono text-xs text-ink-dim mb-0.5">products</p>
                    {company.products.map((product) => (
                      <a
                        key={product.name}
                        href={product.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted hover:text-jade transition-colors group"
                      >
                        <ExternalIcon className="w-3 h-3 text-ink-dim group-hover:text-jade transition-colors" />
                        {product.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: bullets */}
              <div className="lg:col-span-2">
                <ul className="space-y-2.5">
                  {company.bullets.map((bullet, j) => (
                    <li key={j} className="flex gap-3 text-sm text-ink-muted leading-relaxed">
                      <span className="text-jade mt-1.5 flex-shrink-0 text-xs">▸</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
