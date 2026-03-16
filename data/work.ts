export interface Project {
  name: string;
  description: string;
  detail: string;
  tags: string[];
  href: string;
}

export interface CompanyProduct {
  name: string;
  href: string;
}

export interface Company {
  name: string;
  role: string;
  period: string;
  location: string;
  href: string;
  products: CompanyProduct[];
  bullets: string[];
}

export const companies: Company[] = [
  {
    name: "SmartX",
    role: "Virtualization R&D Engineer → Intern, Virtualization Team",
    period: "Oct 2022 – Sep 2025",
    location: "Chengdu",
    href: "https://www.smartx.com",
    products: [
      { name: "SMTX OS", href: "https://www.smartx.com/hk-mo/smtx-os/" },
      { name: "Migration Tool", href: "https://www.smartx.com/hk-mo/migration-tool/" },
    ],
    bullets: [
      "VM migration: improved migration workflow (orchestration, data transfer, iterative/incremental); refactored incremental stage with multi-threading to reduce downtime.",
      "Virtio injection compatibility: designed VMware→KVM Virtio auto-injection for MBR/UEFI guests; handled initramfs dependency and rollback for legacy kernels (e.g., RHEL5 2.6.18).",
      "Cross-cluster live migration: built features in SMTX OS VM services (live migration, monitoring, alerting); implemented post-migration validation.",
      "QGA tooling: extended QEMU Guest Agent with Windows command invocation and ordered syscall tracing; exported structured logs for faster triage.",
      "Kernel debugging: isolated a Linux virtio-serial/console bug where payload >4KB stalled the second poll; produced a minimal reproducer and workaround.",
      "Incident work: resolved 100+ customer cases; standardized SOP for a UOS kernel-related issue.",
    ],
  },
  {
    name: "ByteDance (Feishu)",
    role: "Systems Integration Development Intern",
    period: "Jun 2022 – Sep 2022",
    location: "Chengdu",
    href: "https://www.bytedance.com",
    products: [
      { name: "Lark Suite", href: "https://www.larksuite.com/en_sg/?from_site=feishu" },
    ],
    bullets: [
      "Built Go + Gin services for recruiting/HR integration and data sync with external OA systems.",
      "Used MongoDB for sync metadata and retry states; improved APIs with auth, rate limiting, pagination, and regression tests.",
    ],
  },
];

export const projects: Project[] = [
  {
    name: "Windows-MCP",
    description: "MCP server for AI-driven Windows desktop automation.",
    detail:
      "Research fork of CursorTouch/Windows-MCP. The focus is reliability: an agent uses the MCP server, patches it, hot-reloads it, reruns the same workflow, and checks whether the real desktop behavior improved. Inspired by karpathy/autoresearch.",
    tags: ["Python", "MCP", "Windows", "Agent Research"],
    href: "https://github.com/ziyangliu-666/Windows-MCP",
  },
  {
    name: "PawMemo",
    description: "Local-first vocabulary CLI with spaced repetition and AI companion.",
    detail:
      "Terminal app for word learning. Stores cards and review state in SQLite with an FSRS-style scheduler. Uses an LLM for character-style teaching and explanation. Supports swappable companion packs.",
    tags: ["TypeScript", "SQLite", "CLI", "LLM"],
    href: "https://github.com/ziyangliu-666/PawMemo",
  },
  {
    name: "EasyTrainer",
    description: "PyTorch training toolkit, open-sourced from a garbage sorting project.",
    detail:
      "Trained a PyTorch model and served inference via Flask for a WeChat Mini Program. Built a GitHub Actions CI pipeline to build and publish Docker images.",
    tags: ["Python", "PyTorch", "Flask", "Docker"],
    href: "https://github.com/comethx/EasyTrainer",
  },
  {
    name: "jerkie_man",
    description: "2D pixel-style multiplayer loot-shoot-extract game.",
    detail:
      "Browser-based multiplayer game (搜打撤). TypeScript monorepo with Vite + Canvas 2D client and Node.js + WebSocket server. Shared Zod protocol validation, MessagePack binary encoding, 20Hz server tick, and 120ms client interpolation.",
    tags: ["TypeScript", "Canvas 2D", "WebSocket", "Node.js"],
    href: "https://github.com/ziyangliu-666/jerkie_man",
  },
];
