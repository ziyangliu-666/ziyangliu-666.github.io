/* Offline transport. Same signature and event sequence as the real one.
 *
 * Used when no proxy URL is configured (a fresh clone, a preview build, or the proxy
 * being down), so the page is never dead. The event choreography — reasoning streamed
 * clause by clause, tools, sub-agents, then the answer — is copied from the design's
 * `mockTransport`.
 *
 * The canned answers are NOT copied. The design shipped placeholder text about a
 * fictional engineer ("a distributed job runner", "seven years across infrastructure"),
 * and this site carries Ziyang's name: a fallback that invents a career for him is worse
 * than one that fails honestly. Every claim below is from his résumé. When you edit the
 * corpus, edit these too, or the fallback slowly drifts into fiction.
 */

import type { AgentEvent, Transport } from "./events";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Run {
  k: string[];
  reasoning?: string;
  steps: (
    | { name: string; args: string; result: string }
    | { subagents: { name: string; task: string; result: string }[] }
  )[];
  text: string;
  sources: { label: string; url?: string }[];
  suggestions: string[];
  usage: { model: string; inputTokens: number; outputTokens: number };
}

const RUNS: Run[] = [
  {
    k: ["built", "build", "projects", "shipped", "ship", "做过", "项目"],
    reasoning:
      "The question is broad, so breadth first: rank by what actually shipped and what it was trusted with, then read the résumé and the project note in parallel rather than guessing from titles.",
    steps: [
      { name: "retrieve", args: "index:resume + project", result: "27 chunks · re-ranked to top 5" },
      {
        subagents: [
          { name: "resume-reader", task: "SmartX V2V OS scope", result: "3 years, 2 role levels" },
          { name: "project-reader", task: "Exfer chain and agent", result: "chain, wallets, MCP server" },
        ],
      },
    ],
    text:
      "Three things carry the most weight:\n\n— V2V OS at SmartX. He led the design of the product that moves guests off VMware onto SMTX OS, and between SMTX OS clusters. It is now on 10,000+ production VMs, including core financial workloads.\n— Exfer. A proof-of-work chain for machine-to-machine payments, built with one other developer: 90+ days live, 550+ nodes in 28 countries. He also built the in-wallet agent and published the wallet's tools as an MCP server, about 40 tools across 14 modules.\n— Three single-author preprints on LLM systems, on decoding, agent memory, and proving a hosted model is the one you paid for.\n\nAsk about any one and I will pull the detail.",
    sources: [
      { label: "resume.pdf", url: "/resume.pdf" },
      { label: "exfer.info", url: "https://exfer.info" },
      { label: "github.com/ziyangliu-666", url: "https://github.com/ziyangliu-666" },
    ],
    suggestions: [
      "How did the V2V OS transfer actually work?",
      "What does the in-wallet agent do?",
    ],
    usage: { model: "offline demo", inputTokens: 8420, outputTokens: 214 },
  },
  {
    k: ["working on now", "now", "currently", "these days", "next", "现在", "最近"],
    reasoning:
      "The index goes stale on this one. Check live repository activity first, then reconcile it against the résumé timeline so nothing here is older than the last push.",
    steps: [
      { name: "github_activity", args: "user:ziyangliu-666", result: "own repos · sorted by push date" },
      { name: "retrieve", args: "index:profile", result: "timeline, 7 entries" },
    ],
    text:
      "As of August 2026 he has just started an M.Tech. in Software Engineering at the National University of Singapore.\n\nImmediately before that, two things ran in parallel: a year at HKUST (Guangzhou) on LLM systems — agent memory, decoding, interpretability — which produced three arXiv preprints, and Exfer, where he spent the summer on the chain internals and the in-wallet agent.",
    sources: [
      { label: "Who Ziyang Liu is", url: "/resume.pdf" },
      { label: "arXiv:2604.12376", url: "https://arxiv.org/pdf/2604.12376" },
    ],
    suggestions: ["What were the preprints about?", "Why the move from virtualization to LLM systems?"],
    usage: { model: "offline demo", inputTokens: 11380, outputTokens: 168 },
  },
  {
    k: ["systems", "infrastructure", "infra", "backend", "scale", "distributed", "系统"],
    reasoning:
      "Claims about systems work need numbers and dates attached, otherwise they read as inflation. Split the reading by era and keep one citation per claim.",
    steps: [
      { name: "retrieve", args: "index:resume", result: "16 chunks · re-ranked to top 6" },
      {
        subagents: [
          { name: "throughput", task: "transfer path rewrite", result: "70 → 290 MB/s" },
          { name: "correctness", task: "snapshots, data check", result: "2 claims" },
        ],
      },
    ],
    text:
      "Three years of production virtualization at SmartX, which is where the systems work lives.\n\nThroughput: he replaced a serial read-then-write transfer path with async chunked reads and writes across a shared queue, 8 threads per side. Sustained throughput went from 70 MB/s to 290 MB/s.\n\nCorrectness: filesystem-consistent snapshots rather than only crash-consistent, by running fsfreeze in the guest through VMTools before the snapshot. And for cross-cluster live migration he wrote the check that fires on landing — it snapshots both disks, then hashes and compares them block by block, without ever blocking switchover.\n\nIsolation: migration tasks moved from threads in one process to a process each, one VDDK build per process, which opened up far more vSphere releases.",
    sources: [{ label: "resume.pdf", url: "/resume.pdf" }],
    suggestions: ["What broke in production?", "What is VMTools and why rebuild it?"],
    usage: { model: "offline demo", inputTokens: 9640, outputTokens: 152 },
  },
  {
    k: ["different", "background", "unique", "unusual", "stand out", "why him", "特别"],
    reasoning:
      '"Different" invites flattery. Anchor it to something checkable — the same instinct showing up in two unrelated fields — rather than adjectives.',
    steps: [
      { name: "retrieve", args: "index:profile + paper", result: "11 chunks · top 3 kept" },
    ],
    text:
      "He came to LLM systems from three years of production virtualization, where a silent data corruption ends a company rather than a sprint. The habit that leaves is a preference for guarantees over demos.\n\nIt shows up in the research: a hosted provider's \"you are talking to the model you paid for\" becomes a commitment opened against a Merkle root; an editing model's \"most of this file is unchanged\" becomes a grammar where copying is a token and the copy is valid by construction. Same move as hashing both disks block by block instead of trusting that the transfer reported OK.",
    sources: [
      { label: "arXiv:2604.18179", url: "https://arxiv.org/pdf/2604.18179" },
      { label: "resume.pdf", url: "/resume.pdf" },
    ],
    suggestions: ["Explain the committed SAE-feature traces paper.", "What does he want to work on next?"],
    usage: { model: "offline demo", inputTokens: 7210, outputTokens: 143 },
  },
  {
    k: ["resume", "cv", "experience", "worked", "career", "history", "简历", "经历"],
    reasoning: "Straight lookup — short answer, dates preserved.",
    steps: [{ name: "retrieve", args: "index:resume", result: "full document · 4 roles parsed" }],
    text:
      "Three years at SmartX on virtualization, first as an intern from October 2022 and then as an R&D engineer to September 2025, owning V2V OS. A summer at ByteDance (Feishu) in 2022 on workflow integration in Go. A year of LLM systems research at HKUST (Guangzhou) to August 2026, and a summer on Exfer.\n\nB.Eng. from UESTC, M.Tech. in progress at NUS. The full résumé is linked top right.",
    sources: [{ label: "resume.pdf", url: "/resume.pdf" }],
    suggestions: ["What did he do at ByteDance?", "What is he looking for next?"],
    usage: { model: "offline demo", inputTokens: 3120, outputTokens: 96 },
  },
  {
    k: ["contact", "hire", "email", "reach", "available", "联系"],
    steps: [{ name: "retrieve", args: "index:profile", result: "1 document" }],
    text:
      "Email is the fastest path: ziyang.liu.r@outlook.com. He replies to most things within a day. GitHub and LinkedIn are linked top right, and the résumé PDF is there too.",
    sources: [{ label: "Contact and links" }],
    suggestions: ["What roles is he open to?"],
    usage: { model: "offline demo", inputTokens: 1840, outputTokens: 48 },
  },
];

const FALLBACK: Run = {
  k: [],
  reasoning:
    "Nothing in the index clears the relevance threshold, and this build has no model configured. Saying so beats guessing.",
  steps: [{ name: "retrieve", args: "index:all", result: "no chunk above threshold" }],
  text:
    "This build is running without a model — you are seeing the offline fallback, which only knows a handful of canned answers. I can speak to what Ziyang has built, what he is working on now, his systems and infrastructure work, how his background shapes the way he designs things, his résumé, and how to reach him.\n\nFor anything else, the résumé link top right is the real thing.",
  sources: [],
  suggestions: ["What has Ziyang built?", "Tell me about his systems experience."],
  usage: { model: "offline demo", inputTokens: 2400, outputTokens: 62 },
};

function pick(message: string): Run {
  const s = (message || "").toLowerCase();
  return RUNS.find((r) => r.k.some((k) => s.includes(k))) ?? FALLBACK;
}

export const mockTransport: Transport = async ({ message, onEvent, isCancelled }) => {
  const run = pick(message);
  const t0 = Date.now();
  const stop = () => isCancelled();
  const emit = (ev: AgentEvent) => onEvent(ev);

  if (run.reasoning) {
    emit({ type: "status", text: "Thinking" });
    for (const part of run.reasoning.split(/(?<=[.,]) /)) {
      if (stop()) return;
      await wait(90);
      emit({ type: "reasoning_delta", text: `${part} ` });
    }
    emit({ type: "reasoning_end" });
  }

  let n = 0;
  for (const step of run.steps) {
    if (stop()) return;
    if ("subagents" in step) {
      for (const sub of step.subagents) {
        const id = `s${n++}`;
        emit({ type: "subagent_start", id, name: sub.name, task: sub.task });
        await wait(420);
        if (stop()) return;
        emit({ type: "subagent_end", id, status: "ok", result: sub.result });
      }
    } else {
      const id = `t${n++}`;
      emit({ type: "tool_start", id, name: step.name, args: step.args });
      await wait(560);
      if (stop()) return;
      emit({ type: "tool_end", id, status: "ok", result: step.result });
    }
  }

  for (const chunk of run.text.split(/(?<=\n\n)/)) {
    if (stop()) return;
    await wait(220);
    emit({ type: "text_delta", text: chunk });
  }

  if (run.sources.length) emit({ type: "sources", items: run.sources });
  emit({ type: "suggestions", items: run.suggestions });
  emit({ type: "usage", ...run.usage, ms: Date.now() - t0 });
  emit({ type: "done" });
};

export default mockTransport;
