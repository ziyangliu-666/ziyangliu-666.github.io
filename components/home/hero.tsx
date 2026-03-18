import Link from "next/link";
import { site } from "@/data/site";
import { EmailIcon } from "@/components/ui/icons";

const stack = [
  { label: "lang", items: "Python · Go · C · Shell" },
  { label: "virt", items: "QEMU/KVM · libvirt · Virtio" },
  { label: "debug", items: "gdb · perf · strace" },
];

export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 lg:px-10 pt-16 pb-16">
      <div className="flex flex-col lg:flex-row lg:items-start gap-12 lg:gap-16">

        {/* Left: identity + headline + CTAs */}
        <div className="flex-1 min-w-0">
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight text-ink mb-2 leading-none">
            Ziyang Liu
          </h1>
          <p className="font-mono text-sm text-ink-dim mb-8">刘子阳</p>

          <p className="text-xl text-ink-muted leading-relaxed mb-3 max-w-xl">
            Software engineer. Worked on{" "}
            <span className="text-ink">VM migration</span>,{" "}
            <span className="text-ink">guest tooling</span>, and{" "}
            <span className="text-ink">kernel debugging</span> at SmartX.
          </p>
          <p className="text-base text-ink-muted leading-relaxed mb-10 max-w-xl">
            Now spending time on AI tooling and agent reliability — starting
            with Windows desktop automation.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-jade text-canvas font-mono text-sm font-medium rounded hover:bg-jade/90 transition-colors"
            >
              read writing
            </Link>
            <Link
              href="/resume"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-line text-ink-muted font-mono text-sm hover:border-jade/50 hover:text-ink transition-colors rounded"
            >
              view resume
            </Link>
            <a
              href={`mailto:${site.email}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-line text-ink-muted font-mono text-sm hover:border-jade/50 hover:text-ink transition-colors rounded"
            >
              <EmailIcon className="w-4 h-4" />
              get in touch
            </a>
          </div>
        </div>

        {/* Right: quick facts panel */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <div className="bg-surface border border-line rounded-lg divide-y divide-line">

            <div className="px-4 py-4">
              <p className="font-mono text-xs text-ink-dim mb-2">education</p>
              <p className="text-sm text-ink">UESTC</p>
              <p className="text-xs text-ink-muted">B.Eng. Software Engineering</p>
              <p className="font-mono text-xs text-ink-dim mt-0.5">2020 – 2024</p>
            </div>

            <div className="px-4 py-4">
              <p className="font-mono text-xs text-ink-dim mb-3">stack</p>
              <div className="space-y-2">
                {stack.map((row) => (
                  <div key={row.label} className="flex gap-2 items-baseline">
                    <span className="font-mono text-xs text-ink-dim w-10 flex-shrink-0">
                      {row.label}
                    </span>
                    <span className="font-mono text-xs text-ink-muted leading-snug">
                      {row.items}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
