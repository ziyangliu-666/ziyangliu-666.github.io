/* Corpus builder.
 *
 * Reads the source material, chunks it, builds a BM25 index, and writes everything
 * the browser needs into public/corpus/.
 *
 * This runs LOCALLY, not in CI: the résumé and paper PDFs live outside the repository
 * (~/Projects/resume, ~/Downloads) and are deliberately not committed. The build output
 * IS committed, so `vite build` in CI needs nothing but the repo.
 *
 *   npm run corpus
 *
 * Anonymity rule, enforced here rather than left to discipline:
 *   - The three under-review submissions contribute NO body text. Their titles live in
 *     corpus/src/research.md, hand-written, and their PDFs are never read.
 *   - Repositories that are anonymised artifacts of those submissions are on DENY_REPOS.
 *     Linking them from a site in his name would defeat the anonymous review they are in.
 * `npm run corpus` fails if either rule is violated.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import MiniSearch from "minisearch";
import { processTerm, tokenize } from "../src/rag/tokenize";

// ---------------------------------------------------------------- configuration

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "corpus");
const HOME = os.homedir();

const RESUME_DIR = path.join(HOME, "Projects", "resume");
const DOWNLOADS = path.join(HOME, "Downloads");

/** Anonymised artifacts of papers still in anonymous review. Never index or link. */
const DENY_REPOS = new Set(["sae-feature-traces", "vidtide-anon"]);

/** Titles that must never appear in indexed body text (only in the hand-written note). */
const UNDER_REVIEW_MARKERS = [
  "Anonymous ACL submission",
  "Anonymous Author(s)",
];

/* Ziyang works under two GitHub accounts. `exfer-stack` is his own second account, the one
 * the Exfer work was published from — the corpus has to say so, or the agent reports his
 * own repositories as somebody else's. */
const GITHUB_ACCOUNTS = ["ziyangliu-666", "exfer-stack"] as const;
const GITHUB_USER = "ziyangliu-666";

/* Pull requests carry the engineering detail that a repo description cannot: what was
 * broken, what the fix was, what was verified. These are the accounts whose PRs are his. */
const PR_SEARCH = "org:exfer-stack type:pr";

/* exfer.info is the project's own documentation, 223k characters of it. Only the chapters
 * that explain what the system is and why it is shaped that way are indexed — a visitor
 * asks this agent what Ziyang built, not how to back up a node. */
const EXFER_DOC_PAGES = [
  { path: "", title: "Exfer documentation — introduction" },
  { path: "concepts/why-machines.html", title: "Exfer — why a chain for machines" },
  { path: "mining/how-it-works.html", title: "Exfer — how mining works" },
  { path: "nodes.html", title: "Exfer — nodes" },
  { path: "rpc/index.html", title: "Exfer — RPC surface" },
  { path: "use/vault.html", title: "Exfer — vault" },
] as const;

type Kind = "resume" | "paper" | "writing" | "repo" | "profile" | "project";

interface Section {
  heading: string;
  text: string;
}

interface Doc {
  id: string;
  title: string;
  kind: Kind;
  lang: "en" | "zh";
  url?: string;
  date?: string;
  sections: Section[];
}

interface Chunk {
  id: string;
  docId: string;
  docTitle: string;
  heading: string;
  kind: Kind;
  lang: "en" | "zh";
  url?: string;
  date?: string;
  text: string;
}

const PAPERS = [
  {
    id: "paper-copy-as-decode",
    file: "2604.18170v1.pdf",
    title: "Copy-as-Decode: Grammar-Constrained Parallel Prefill for LLM Editing",
    url: "https://arxiv.org/abs/2604.18170",
    date: "2026-04-20",
  },
  {
    id: "paper-memory-paging",
    file: "2604.12376v1.pdf",
    title:
      "Cooperative Memory Paging with Keyword Bookmarks for Long-Horizon LLM Conversations",
    url: "https://arxiv.org/abs/2604.12376",
    date: "2026-04-14",
  },
  {
    id: "paper-sae-traces",
    file: "2604.18179v1.pdf",
    title:
      "Committed SAE-Feature Traces for Audited-Session Substitution Detection in Hosted LLMs",
    url: "https://arxiv.org/abs/2604.18179",
    date: "2026-04-20",
  },
] as const;

// ---------------------------------------------------------------------- helpers

const sourceHashes: Record<string, string> = {};

function readSource(file: string): Buffer {
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing source: ${file}\n` +
        `The corpus is built from files outside the repo. Fix the path in scripts/build-corpus.ts ` +
        `or restore the file, then re-run \`npm run corpus\`.`,
    );
  }
  const buf = fs.readFileSync(file);
  sourceHashes[path.relative(HOME, file)] = createHash("sha256")
    .update(buf)
    .digest("hex")
    .slice(0, 16);
  return buf;
}

function pdfToText(file: string, opts: { layout?: boolean } = {}): string {
  readSource(file); // presence + hash
  const args = ["-nopgbrk", "-enc", "UTF-8"];
  if (opts.layout) args.push("-layout");
  args.push(file, "-");
  try {
    return execFileSync("pdftotext", args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(
      `pdftotext failed on ${file}. Install poppler (\`brew install poppler\`).\n${String(err)}`,
    );
  }
}

/** pdftotext leaves justification hyphens at line ends; rejoin those words. */
function dehyphenate(text: string): string {
  return text.replace(/(\p{Ll})[-‑]\n\s*(\p{Ll})/gu, "$1$2");
}

function normalizeLines(text: string): string[] {
  return dehyphenate(text)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim());
}

/** Group paragraphs into chunks of roughly `target` characters, never splitting one. */
function packParagraphs(paragraphs: string[], target: number): string[] {
  const out: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    if (!p) continue;
    if (buf && buf.length + p.length + 2 > target) {
      out.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** A paragraph longer than `limit` is split on sentence boundaries. */
function splitLongParagraph(p: string, limit: number): string[] {
  if (p.length <= limit) return [p];
  const sentences = p.split(/(?<=[.!?。！？])\s+/);
  return packParagraphs(sentences, limit);
}

// ------------------------------------------------------------- résumé extraction

const EN_SECTIONS = [
  "EDUCATION",
  "EXPERIENCE",
  "PROJECT",
  "PROJECTS",
  "RESEARCH",
  "SKILLS",
  "HONOURS",
  "HONORS",
];
const ZH_SECTIONS = [
  "教育经历",
  "工作经历",
  "项目经历",
  "项目",
  "研究经历",
  "研究",
  "技能",
  "荣誉",
  "荣誉奖项",
];

/** `Jul 2024 – Sep 2025` or `2024.07 – 2025.09` or `May 2026 – Aug 2026` */
const DATE_RANGE =
  /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|\d{4}\.\d{2})\s*[–—-]\s*(Present|至今|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}|\d{4}\.\d{2})/;

/* A bullet in this résumé opens with a short label and a colon —
 * "Transfer throughput:", "VDDK version isolation:", "・VMTools：" in the Chinese one.
 * Wrapped continuation lines have neither. Detecting the opening lets each bullet stay
 * whole through chunking, so a retrieved chunk never starts halfway through a claim. */
const BULLET_START =
  /^(?:[・•]\s*)?(?:[A-Z][A-Za-z0-9 ()./+&-]{1,48}:|[\p{Script=Han}][^：]{1,24}：|[・•])/u;

function resumeDoc(file: string, lang: "en" | "zh"): Doc {
  const headings = lang === "en" ? EN_SECTIONS : ZH_SECTIONS;
  const lines = normalizeLines(pdfToText(file, { layout: true }));

  const sections: Section[] = [];
  const header: string[] = [];
  let current: { heading: string; blocks: { sub: string; bullets: string[] }[] } | null =
    null;

  const pushBlock = (sub: string) => {
    if (!current) return;
    current.blocks.push({ sub, bullets: [] });
  };

  for (const line of lines) {
    if (!line) continue;
    const isHeading = headings.some(
      (h) => line === h || line.toUpperCase() === h.toUpperCase(),
    );
    if (isHeading) {
      if (current) sections.push(...flattenResumeSection(current));
      current = { heading: line, blocks: [] };
      pushBlock("");
      continue;
    }
    if (!current) {
      header.push(line); // name and contact line, before the first section
      continue;
    }
    // A line carrying a date range starts a new block and titles it.
    if (DATE_RANGE.test(line)) {
      pushBlock(line);
      continue;
    }
    const block = current.blocks[current.blocks.length - 1]!;
    if (BULLET_START.test(line) || block.bullets.length === 0) {
      block.bullets.push(line);
    } else {
      // Wrapped continuation of the bullet above.
      block.bullets[block.bullets.length - 1] += ` ${line}`;
    }
  }
  if (current) sections.push(...flattenResumeSection(current));
  if (header.length) sections.unshift({ heading: "Header", text: header.join("\n") });

  const title =
    lang === "en" ? "Résumé (English)" : "Résumé (Chinese) / 中文简历";
  return {
    id: lang === "en" ? "resume-en" : "resume-zh",
    title,
    kind: "resume",
    lang,
    url: lang === "en" ? "/resume.pdf" : "/resume-zh.pdf",
    sections: sections.filter((s) => s.text.trim()),
  };
}

function flattenResumeSection(section: {
  heading: string;
  blocks: { sub: string; bullets: string[] }[];
}): Section[] {
  const blocks = section.blocks
    .map((b) => ({
      sub: b.sub,
      body: b.bullets.join("\n\n").trim(),
    }))
    .filter((b) => b.body || b.sub);
  if (!blocks.length) return [];

  const total = blocks.reduce((n, b) => n + b.sub.length + b.body.length, 0);

  // Short sections — Education, Skills, Honours — read as one unit. Splitting them
  // per date-range line would leave chunks of a dozen characters, which BM25 scores
  // as suspiciously relevant to any query that happens to touch them.
  if (total < 900) {
    return [
      {
        heading: section.heading,
        text: blocks
          .map((b) => [b.sub, b.body].filter(Boolean).join("\n"))
          .join("\n\n"),
      },
    ];
  }

  return blocks.map((b) => ({
    heading: b.sub ? `${section.heading} — ${b.sub}` : section.heading,
    text: [b.sub, b.body].filter(Boolean).join("\n"),
  }));
}

// -------------------------------------------------------------- paper extraction

const PAPER_HEADING =
  /^(?:\d+(?:\.\d+)*\.?\s+)?(Abstract|Introduction|Related Work|Background|Method(?:s|ology)?|Approach|Preliminaries|Experiments?|Evaluation|Results?|Analysis|Ablations?|Discussion|Limitations?|Conclusions?|Threat Model|Protocol|Implementation|Setup)\b.{0,60}$/i;

function paperDoc(spec: (typeof PAPERS)[number]): Doc {
  const raw = pdfToText(path.join(DOWNLOADS, spec.file));

  for (const marker of UNDER_REVIEW_MARKERS) {
    if (raw.includes(marker)) {
      throw new Error(
        `${spec.file} looks like an anonymous submission ("${marker}"). ` +
          `Under-review papers must not be indexed — see the anonymity rule at the top of this file.`,
      );
    }
  }

  // Everything from the bibliography on is citations; it adds noise, not answers.
  const cut = raw.search(/\n\s*(References|REFERENCES|Bibliography)\s*\n/);
  const body = cut > 0 ? raw.slice(0, cut) : raw;

  const lines = normalizeLines(body).filter(
    (l) => !/^arXiv:\d{4}\.\d{4,5}v\d+\s+\[/.test(l),
  );

  const sections: Section[] = [];
  let heading = "Abstract";
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) sections.push({ heading, text });
    buf = [];
  };
  for (const line of lines) {
    if (PAPER_HEADING.test(line) && line.length < 80) {
      flush();
      heading = line.replace(/^\d+(?:\.\d+)*\.?\s+/, "");
      continue;
    }
    buf.push(line);
  }
  flush();

  return {
    id: spec.id,
    title: spec.title,
    kind: "paper",
    lang: "en",
    url: spec.url,
    date: spec.date,
    sections,
  };
}

// ------------------------------------------------------------ markdown / writing

function splitMarkdownSections(body: string): Section[] {
  const out: Section[] = [];
  let heading = "";
  let buf: string[] = [];
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) out.push({ heading, text });
    buf = [];
  };
  for (const line of body.split("\n")) {
    const m = /^#{2,3}\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = m[1]!.trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return out;
}

function writingDocs(): Doc[] {
  const dir = path.join(ROOT, "content", "blog");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((file) => {
      const slug = file.replace(/\.mdx$/, "");
      const raw = readSource(path.join(dir, file)).toString("utf8");
      const { data, content } = matter(raw);
      const summary = typeof data.summary === "string" ? data.summary : "";
      const sections = splitMarkdownSections(content);
      if (summary) sections.unshift({ heading: "Summary", text: summary });
      return {
        id: `writing-${slug}`,
        title: (data.title as string) ?? slug,
        kind: "writing" as const,
        lang: "en" as const,
        date: data.date as string | undefined,
        sections,
      };
    });
}

function handwrittenDocs(): Doc[] {
  const dir = path.join(ROOT, "corpus", "src");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const raw = readSource(path.join(dir, file)).toString("utf8");
      const { data, content } = matter(raw);
      return {
        id: `about-${file.replace(/\.md$/, "")}`,
        title: (data.title as string) ?? file,
        kind: ((data.kind as Kind) ?? "profile") as Kind,
        lang: "en" as const,
        url: data.url as string | undefined,
        sections: splitMarkdownSections(content),
      };
    });
}

// ------------------------------------------------------------------ GitHub repos

interface GhRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  fork: boolean;
  archived: boolean;
  topics?: string[];
}

function gh(endpoint: string): unknown {
  try {
    const out = execFileSync("gh", ["api", endpoint], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function repoDocs(account: string): Doc[] {
  const repos = gh(
    `users/${account}/repos?per_page=100&sort=pushed`,
  ) as GhRepo[] | null;
  if (!repos) {
    console.warn(
      `! gh api failed for ${account} — skipping its repos. Run \`gh auth login\` for a complete corpus.`,
    );
    return [];
  }

  const own = repos.filter((r) => !r.fork && !DENY_REPOS.has(r.name));
  const skipped = repos.filter((r) => !r.fork && DENY_REPOS.has(r.name));
  for (const r of skipped) {
    console.log(`  · skipped ${r.name} (anonymity denylist)`);
  }

  return own.map((r) => {
    const sections: Section[] = [
      {
        heading: "Repository",
        text: [
          `${r.name} — ${r.description ?? "no description"}`,
          `Language: ${r.language ?? "n/a"}. Stars: ${r.stargazers_count}. Last push: ${r.pushed_at.slice(0, 10)}.`,
          r.topics?.length ? `Topics: ${r.topics.join(", ")}.` : "",
          r.archived ? "This repository is archived." : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ];

    const readme = gh(`repos/${account}/${r.name}/readme`) as {
      content?: string;
      encoding?: string;
    } | null;
    if (readme?.content && readme.encoding === "base64") {
      const text = Buffer.from(readme.content, "base64")
        .toString("utf8")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .trim()
        .slice(0, 4000);
      if (text) sections.push({ heading: "README", text });
    }

    return {
      id: `repo-${r.name.toLowerCase()}`,
      title: `GitHub: ${account}/${r.name}`,
      kind: "repo" as const,
      lang: "en" as const,
      url: r.html_url,
      date: r.pushed_at.slice(0, 10),
      sections,
    };
  });
}

/* ------------------------------------------------------------- pull requests
 *
 * A PR body is the most detailed thing he writes about his own engineering: the failure,
 * the contract that replaced it, and what was verified. One document per PR keeps
 * retrieval precise — a question about the MCP handshake should land on that PR, not on a
 * repository page that happens to mention MCP. */

interface GhSearchItem {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  closed_at: string | null;
  created_at: string;
  repository_url: string;
  user: { login: string };
}

function pullRequestDocs(): Doc[] {
  const found = gh(
    `search/issues?q=${encodeURIComponent(PR_SEARCH)}&per_page=100`,
  ) as { items?: GhSearchItem[] } | null;
  if (!found?.items?.length) {
    console.warn("! no pull requests found — skipping");
    return [];
  }

  return found.items
    .filter((pr) => pr.body && pr.body.trim().length > 120)
    .map((pr) => {
      const repo = pr.repository_url.split("/").pop() ?? "repo";
      const body = (pr.body ?? "")
        // The Claude Code trailer is on most of them and says nothing about the change.
        .replace(/🤖 Generated with \[Claude Code\][\s\S]*$/, "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .trim();

      return {
        id: `pr-${repo}-${pr.number}`.toLowerCase(),
        title: `${repo} #${pr.number}: ${pr.title}`,
        kind: "repo" as const,
        lang: "en" as const,
        url: pr.html_url,
        date: (pr.closed_at ?? pr.created_at).slice(0, 10),
        sections: [
          {
            heading: `Pull request — ${repo} #${pr.number} (${pr.state})`,
            text: `${pr.title}\n\n${body}`,
          },
        ],
      };
    });
}

/* -------------------------------------------------------------- exfer.info docs */

async function exferDocs(): Promise<Doc[]> {
  const out: Doc[] = [];

  for (const page of EXFER_DOC_PAGES) {
    const url = `https://exfer.info/${page.path}`;
    let html: string;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "ziyang-agent-corpus-builder" },
      });
      if (!res.ok) {
        console.warn(`  ! ${url} returned ${res.status} — skipped`);
        continue;
      }
      html = await res.text();
    } catch (err) {
      console.warn(`  ! ${url} unreachable (${String(err)}) — skipped`);
      continue;
    }

    // mdBook wraps the chapter in <main>; taking only that drops the nav, the theme
    // picker and the keyboard-shortcut help, which would otherwise be indexed on
    // every single page and outrank the actual prose on short queries.
    const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
    const body = main?.[1] ?? html;

    const text = body
      .replace(/<(script|style|nav|svg)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|pre|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");

    if (text.length < 300) {
      console.warn(`  ! ${url} extracted only ${text.length} chars — skipped`);
      continue;
    }

    out.push({
      id: `exfer-${page.path.replace(/[/.]/g, "-") || "index"}`,
      title: page.title,
      kind: "project",
      lang: "en",
      url,
      sections: [{ heading: page.title, text }],
    });
  }

  return out;
}

// ------------------------------------------------------------------------- build

function chunkDoc(doc: Doc): Chunk[] {
  // Papers are dense and argue across paragraphs, so they get bigger chunks;
  // résumé bullets are self-contained and read better small.
  const target = doc.kind === "paper" ? 1300 : 750;
  const chunks: Chunk[] = [];
  let n = 0;

  for (const section of doc.sections) {
    const paragraphs = section.text
      .split(/\n{2,}/)
      .flatMap((p) => splitLongParagraph(p.trim(), target * 2))
      .filter(Boolean);

    for (const text of packParagraphs(paragraphs, target)) {
      chunks.push({
        id: `${doc.id}#${n++}`,
        docId: doc.id,
        docTitle: doc.title,
        heading: section.heading,
        kind: doc.kind,
        lang: doc.lang,
        url: doc.url,
        date: doc.date,
        text,
      });
    }
  }
  return chunks;
}

async function main() {
  console.log("Building corpus…");

  const docs: Doc[] = [];

  console.log("· résumé");
  docs.push(resumeDoc(path.join(RESUME_DIR, "resume.pdf"), "en"));
  docs.push(resumeDoc(path.join(RESUME_DIR, "resume-zh.pdf"), "zh"));

  console.log("· preprints");
  for (const spec of PAPERS) docs.push(paperDoc(spec));

  console.log("· writing");
  docs.push(...writingDocs());

  console.log("· profile notes");
  docs.push(...handwrittenDocs());

  console.log("· github repos");
  for (const account of GITHUB_ACCOUNTS) docs.push(...repoDocs(account));

  console.log("· pull requests");
  docs.push(...pullRequestDocs());

  console.log("· exfer documentation");
  docs.push(...(await exferDocs()));

  const chunks = docs.flatMap(chunkDoc);

  // Anonymity assertion: nothing under review may have leaked into a chunk.
  const denied = [...DENY_REPOS];
  for (const chunk of chunks) {
    for (const name of denied) {
      if (chunk.text.includes(name) && chunk.kind !== "profile") {
        throw new Error(
          `Chunk ${chunk.id} mentions denylisted repo "${name}". Remove it before shipping.`,
        );
      }
    }
  }

  const mini = new MiniSearch<Chunk>({
    idField: "id",
    fields: ["text", "heading", "docTitle"],
    storeFields: ["docId", "docTitle", "heading", "kind", "lang", "url", "date"],
    tokenize,
    processTerm,
  });
  mini.addAll(chunks);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT_DIR, "docs"), { recursive: true });

  const manifest = docs.map((d) => ({
    id: d.id,
    title: d.title,
    kind: d.kind,
    lang: d.lang,
    url: d.url,
    date: d.date,
    sections: d.sections.map((s) => s.heading),
    chunks: chunks.filter((c) => c.docId === d.id).length,
  }));

  const bundle = {
    version: 1,
    builtAt: new Date().toISOString().slice(0, 10),
    docs: manifest,
    chunks: Object.fromEntries(chunks.map((c) => [c.id, c.text])),
    index: mini.toJSON(),
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "index.json"),
    JSON.stringify(bundle),
    "utf8",
  );

  /* A few hundred bytes the landing page can fetch on load to say what it actually holds.
   * The full index is 800KB and loads on the first question; this exists so that one line
   * of honest scope does not cost a visitor who never asks anything. */
  const prCount = docs.filter((d) => d.id.startsWith("pr-")).length;
  fs.writeFileSync(
    path.join(OUT_DIR, "summary.json"),
    JSON.stringify({
      builtAt: bundle.builtAt,
      documents: docs.length,
      chunks: chunks.length,
      counts: {
        resume: docs.filter((d) => d.kind === "resume").length,
        paper: docs.filter((d) => d.kind === "paper").length,
        repo: docs.filter((d) => d.kind === "repo" && !d.id.startsWith("pr-")).length,
        pullRequest: prCount,
        writing: docs.filter((d) => d.kind === "writing").length,
      },
    }),
    "utf8",
  );

  for (const doc of docs) {
    fs.writeFileSync(
      path.join(OUT_DIR, "docs", `${doc.id}.json`),
      JSON.stringify(doc),
      "utf8",
    );
  }

  // The header's Résumé link needs the PDF served from the site.
  fs.copyFileSync(
    path.join(RESUME_DIR, "resume.pdf"),
    path.join(ROOT, "public", "resume.pdf"),
  );
  fs.copyFileSync(
    path.join(RESUME_DIR, "resume-zh.pdf"),
    path.join(ROOT, "public", "resume-zh.pdf"),
  );

  fs.writeFileSync(
    path.join(ROOT, "corpus.lock.json"),
    JSON.stringify({ builtAt: bundle.builtAt, sources: sourceHashes }, null, 2),
    "utf8",
  );

  const bytes = fs.statSync(path.join(OUT_DIR, "index.json")).size;
  console.log(
    `\n${docs.length} documents, ${chunks.length} chunks, index.json ${(bytes / 1024).toFixed(0)} KB`,
  );
  for (const d of manifest) {
    console.log(`  ${d.chunks.toString().padStart(3)}  ${d.kind.padEnd(8)} ${d.title}`);
  }
}

await main();
