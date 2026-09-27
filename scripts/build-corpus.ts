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

/* Working drafts, kept out for an ordinary reason: they are not work he wants shown. Public on
 * GitHub, so nothing here is secret. Separate from DENY_REPOS because the two fail differently:
 * breaking the anonymity list harms a real submission and stops this build, while breaking this
 * one shows a visitor a scratch repository. Must match UNLISTED_REPOS in src/agent/config.ts,
 * which the live GitHub tools read. */
const UNLISTED_REPOS = new Set(["lumen-specs"]);

/** Titles that must never appear in indexed body text (only in the hand-written note). */
const UNDER_REVIEW_MARKERS = [
  "Anonymous ACL submission",
  "Anonymous Author(s)",
];

const GITHUB_ACCOUNTS = ["ziyangliu-666"] as const;
const GITHUB_USER = "ziyangliu-666";

/* FastMM's own documentation. The README reaches the index through repoDocs, cut at 4,000
 * characters, which leaves out how the engine is built and how its numbers were measured.
 * These pages carry that. Pages that disagree with the code are left out on purpose: the
 * economics page and the production guide still describe the engine before the recovery work
 * of 2026-09-23, and corpus/src/fastmm.md is the checked account of it. */
const FASTMM_REPO = "ziyangliu-666/FastMM";
const FASTMM_DOC_PAGES = [
  {
    path: "docs/explanation/architecture.md",
    title: "FastMM: architecture (threads, rings, the network reactor, clocks)",
  },
  {
    path: "docs/explanation/event-flow.md",
    title: "FastMM: event flow, from a venue message to an order on the wire",
  },
  {
    path: "docs/explanation/determinism.md",
    title: "FastMM: determinism, why replays match",
  },
  {
    path: "bench/README.md",
    title: "FastMM: benchmarks, and what each number contains",
  },
] as const;

type Kind = "resume" | "paper" | "repo" | "profile" | "project";

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
    url: "https://arxiv.org/pdf/2604.18170v1",
    date: "2026-04-20",
  },
  {
    id: "paper-memory-paging",
    file: "2604.12376v1.pdf",
    title:
      "Cooperative Memory Paging with Keyword Bookmarks for Long-Horizon LLM Conversations",
    url: "https://arxiv.org/pdf/2604.12376v1",
    date: "2026-04-14",
  },
  {
    id: "paper-sae-traces",
    file: "2604.18179v1.pdf",
    title:
      "Committed SAE-Feature Traces for Audited-Session Substitution Detection in Hosted LLMs",
    url: "https://arxiv.org/pdf/2604.18179v1",
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

/* Hyperlinks in a PDF are annotations, and `pdftotext` throws them away, so the résumé's
 * links to the product pages and the papers were all silently lost. `pdftohtml` keeps them.
 * Anchor text arrives messy: it can start mid-token from the line before, or carry trailing
 * punctuation. It is cleaned down to the word the reader would recognise. */
interface PdfLink {
  anchor: string;
  url: string;
}

function pdfLinks(file: string): PdfLink[] {
  let html: string;
  try {
    html = execFileSync(
      "pdftohtml",
      ["-stdout", "-i", "-noframes", "-s", "-q", file, "-"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
  } catch {
    console.warn(`  ! pdftohtml unavailable — links in ${path.basename(file)} skipped`);
    return [];
  }

  const out: PdfLink[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
    const url = m[1]!;
    // Internal PDF bookmarks (resume.html#2) are the outline, not content.
    if (!/^(https?:|mailto:)/i.test(url)) continue;

    const anchor = m[2]!
      .replace(/<[^>]+>/g, "")
      .replace(/&#160;|&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      // Keep the trailing word: the anchor often starts mid-token from the line before.
      // U+2011 is in the class because the résumé sets "ziyangliu‑666" with a
      // non-breaking hyphen, and excluding it truncated the anchor to "666".
      .replace(
        /^[\s\S]*?([\p{L}\p{N}][\p{L}\p{N}._/\u2011-]*)[)\]:：,，。、;；\s]*$/u,
        "$1",
      )
      .replace(/[)\]:：,，。、;；]+$/u, "")
      .trim();

    if (seen.has(url)) continue;
    seen.add(url);
    // A mailto's anchor is the address itself; anything else needs a word to attach to.
    const label = url.startsWith("mailto:") ? url.slice(7) : anchor;
    if (label.length < 3) continue;
    out.push({ anchor: label, url });
  }
  return out;
}

/** Turn the first mention of each anchor into a markdown link the model can pass through. */
function linkify(text: string, links: PdfLink[]): string {
  let out = text;
  for (const { anchor, url } of links) {
    // Contact lines already read as links; only body mentions need rewriting.
    if (/^(mailto:)/i.test(url)) continue;
    const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(?<!\\[)\\b${escaped}\\b(?!\\]\\()`, "u");
    if (pattern.test(out)) out = out.replace(pattern, `[${anchor}](${url})`);
  }
  return out;
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

const PROJECT_SECTIONS = ["PROJECT", "项目"];

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

  /* The résumé's Project section stays out of the index, on his request (2026-09-24). His
   * current project, FastMM, has its own note in corpus/src/fastmm.md. */
  const withoutProject = sections.filter(
    (s) => !PROJECT_SECTIONS.some((h) => s.heading.toUpperCase().startsWith(h)),
  );
  sections.length = 0;
  sections.push(...withoutProject);

  // Only links whose anchor is still in the text: the Project section's links go with it.
  const kept = sections.map((s) => s.text).join("\n");
  const links = pdfLinks(file).filter(
    (l) => l.url.startsWith("mailto:") || kept.includes(l.anchor),
  );
  const linked = sections
    .filter((s) => s.text.trim())
    .map((s) => ({ heading: s.heading, text: linkify(s.text, links) }));

  // Also listed plainly, so a question like "where is the V2V OS page" can be answered
  // from a retrieved passage without the anchor happening to fall in the same chunk.
  if (links.length) {
    linked.push({
      heading: "Links in the résumé",
      text: links
        .map(({ anchor, url }) => `${anchor}: ${url}`)
        .join("\n"),
    });
  }

  const title =
    lang === "en" ? "Résumé (English)" : "Résumé (Chinese) / 中文简历";
  return {
    id: lang === "en" ? "resume-en" : "resume-zh",
    title,
    kind: "resume",
    lang,
    url: lang === "en" ? "/resume.pdf" : "/resume-zh.pdf",
    sections: linked,
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

  const figures = paperFigures(spec);

  /* Put each figure beside the prose that discusses it. A separate "Figures" section is
   * retrievable, but only if the model thinks to search for figures — and it will not, when
   * the question is about speculative decoding. Injected at the caption, any retrieval that
   * surfaces the discussion surfaces the image path with it. */
  for (const fig of figures) {
    const label = /^((?:Figure|Table)\s+\d+)/.exec(fig.caption)?.[1];
    if (!label) continue;
    const target = sections.find(
      (sec) => sec.text.includes(`${label}:`) && !sec.text.includes("/corpus/figures/"),
    );
    if (!target) continue;
    const embed = `![${fig.caption.slice(0, 160)}](/corpus/figures/${fig.file})`;
    target.text = target.text.replace(`${label}:`, `${embed}\n${label}:`);
  }

  if (figures.length) {
    sections.push({
      heading: "Figures",
      text: [
        "Figures from this paper, extracted from the PDF. To show one in an answer, embed it",
        "as a markdown image using the path exactly as written here.",
        "",
        ...figures.map(
          (f) => `![${f.caption.slice(0, 160)}](/corpus/figures/${f.file})\n${f.caption} (page ${f.page})`,
        ),
      ].join("\n"),
    });
  }

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

// --------------------------------------------------------------------- markdown

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

  const own = repos.filter(
    (r) => !r.fork && !DENY_REPOS.has(r.name) && !UNLISTED_REPOS.has(r.name),
  );
  for (const r of repos.filter((r) => !r.fork && DENY_REPOS.has(r.name))) {
    console.log(`  · skipped ${r.name} (anonymity denylist)`);
  }
  for (const r of repos.filter((r) => !r.fork && UNLISTED_REPOS.has(r.name))) {
    console.log(`  · skipped ${r.name} (unlisted: a working draft)`);
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

/* ------------------------------------------------------------------- paper figures
 *
 * The papers' diagrams carry things prose cannot — the three-way decoding comparison in
 * Copy-as-Decode is worth more than a paragraph describing it — so they are extracted at
 * build time and the agent can embed them in an answer.
 *
 * Pairing is by page: `pdfimages -p` names each file with the page it came from, and the
 * caption for a figure is on that same page. Small images are dropped, because a paper's
 * embedded raster set also contains colour bars and one-pixel-wide gradient strips that
 * would otherwise be offered to a reader as "Figure 4". */

interface Figure {
  file: string;
  caption: string;
  page: number;
}

/* `pdfimages -png` re-encodes the PDF's own JPEGs losslessly, which turned 8 diagrams into
 * 3.8MB of repository. Recompressed to JPEG at a width no display needs to exceed, they come
 * to a fraction of that. `sips` ships with macOS and the corpus build is local-only; if it
 * is missing the PNG is kept as-is rather than failing the build. */
function shrink(full: string, file: string): string {
  const jpg = full.replace(/\.png$/, ".jpg");
  try {
    execFileSync(
      "sips",
      [
        "-s", "format", "jpeg",
        "-s", "formatOptions", "72",
        "-Z", "1400",
        full,
        "--out", jpg,
      ],
      { stdio: "ignore" },
    );
  } catch {
    console.warn(`  ! sips unavailable — ${file} stays a PNG`);
    return file;
  }
  const before = fs.statSync(full).size;
  const after = fs.statSync(jpg).size;
  if (after >= before) {
    fs.rmSync(jpg);
    return file;
  }
  fs.rmSync(full);
  return path.basename(jpg);
}

function paperFigures(spec: (typeof PAPERS)[number]): Figure[] {
  const pdf = path.join(DOWNLOADS, spec.file);
  const outDir = path.join(OUT_DIR, "figures");
  fs.mkdirSync(outDir, { recursive: true });

  const prefix = spec.id.replace(/^paper-/, "");
  try {
    execFileSync("pdfimages", ["-png", "-p", pdf, path.join(outDir, prefix)], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    console.warn(`  ! pdfimages failed on ${spec.file} — no figures`);
    return [];
  }

  const produced = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith(".png"));

  const captionCache = new Map<number, string[]>();
  const captionsOn = (page: number): string[] => {
    if (!captionCache.has(page)) {
      let text = "";
      try {
        text = execFileSync(
          "pdftotext",
          ["-f", String(page), "-l", String(page), "-nopgbrk", pdf, "-"],
          { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
        );
      } catch {
        /* an unreadable page just yields no caption */
      }
      const found = [...dehyphenate(text).matchAll(/(Figure|Table)\s+\d+[.:]\s*([\s\S]{0,320})/g)]
        .map((m) => `${m[0].split(/\n\s*\n/)[0]!.replace(/\s+/g, " ").trim()}`);
      captionCache.set(page, found);
    }
    return captionCache.get(page)!;
  };

  const figures: Figure[] = [];
  const used = new Map<number, number>();

  for (const file of produced.sort()) {
    const full = path.join(outDir, file);
    const { size } = fs.statSync(full);
    const page = Number(/-(\d{3})-\d+\.png$/.exec(file)?.[1] ?? 0);

    // Colour bars and gradient strips: present in the PDF, meaningless to a reader.
    if (size < 20_000) {
      fs.rmSync(full);
      continue;
    }

    const onPage = captionsOn(page);
    const nth = used.get(page) ?? 0;
    used.set(page, nth + 1);
    const caption = onPage[nth] ?? onPage[0] ?? "";

    if (!caption) {
      // A figure nobody can label is a figure the agent cannot introduce honestly.
      fs.rmSync(full);
      continue;
    }
    figures.push({ file: shrink(full, file), caption, page });
  }

  return figures;
}

/* ------------------------------------------------------------- FastMM documentation
 *
 * Read through the GitHub API at one commit, and that commit is recorded in corpus.lock.json,
 * so a rebuild can say which version of the docs the agent was answering from. */

function fastmmDocs(): Doc[] {
  const head = gh(`repos/${FASTMM_REPO}/commits/main`) as { sha?: string } | null;
  if (!head?.sha) {
    console.warn(`  ! could not resolve ${FASTMM_REPO}@main — skipped`);
    return [];
  }
  sourceHashes[`github:${FASTMM_REPO}`] = head.sha.slice(0, 16);

  const out: Doc[] = [];
  for (const page of FASTMM_DOC_PAGES) {
    const file = gh(`repos/${FASTMM_REPO}/contents/${page.path}?ref=${head.sha}`) as {
      content?: string;
      encoding?: string;
    } | null;
    if (!file?.content || file.encoding !== "base64") {
      console.warn(`  ! ${page.path} unreadable — skipped`);
      continue;
    }
    const body = Buffer.from(file.content, "base64")
      .toString("utf8")
      .replace(/<!--[\s\S]*?-->/g, "");
    const sections = splitMarkdownSections(body).map((sec) => ({
      heading: sec.heading ? `${page.title}: ${sec.heading}` : page.title,
      text: sec.text,
    }));
    out.push({
      id: `fastmm-${page.path.replace(/\.md$/, "").replace(/[/.]/g, "-").toLowerCase()}`,
      title: page.title,
      kind: "project",
      lang: "en",
      url: `https://github.com/${FASTMM_REPO}/blob/main/${page.path}`,
      date: new Date().toISOString().slice(0, 10),
      sections,
    });
  }
  return out;
}

/* --------------------------------------------------------------- landing keywords
 *
 * The résumé's SKILLS section is already a curated keyword list — the terms he chose to be
 * known for — so the landing page's scattered tags are read from it rather than invented
 * here. Written into the bundle as a generated module instead of a JSON file the page
 * fetches: they are on screen before the first paint, with no flash and no request. */

/* The categories are read from the page, not listed here.
 *
 * This used to split the section on a hard-coded list of his category names. He rewrote the
 * SKILLS section, and the list went stale in the one way that is visible to a visitor: the
 * labels he had added were not recognised, so each one glued itself to the value beside it and
 * the landing page grew tags reading "Shell Networking TCP/UDP", "& agents agent routing" and
 * "systems CAP/PACELC".
 *
 * The section is two columns in the PDF, a label and a comma-separated list. `pdftotext
 * -layout` keeps that alignment, so the gap between the columns is the separator, and any
 * category he invents next is handled without touching this file. The Doc cannot be used for
 * this: its text has been through normalizeLines, which collapses the gap that carries the
 * structure. */
function skillRows(resumeFile: string): string[] {
  const lines = dehyphenate(pdfToText(resumeFile, { layout: true })).split("\n");
  const rows: string[] = [];
  let inSkills = false;

  for (const line of lines) {
    const flat = line.trim();
    if (/^SKILLS$/i.test(flat)) {
      inSkills = true;
      continue;
    }
    if (!inSkills) continue;
    // The next all-capitals heading ends the section.
    if (/^[A-Z][A-Z ]{2,}$/.test(flat)) break;
    if (!flat) continue;

    // Two spaces or more is the column gap. Everything after it is the values.
    const split = line.match(/^\s*\S.*?\s{2,}(\S.*)$/);
    if (split?.[1]) rows.push(split[1].trim());
  }

  return rows;
}

function writeKeywords(resume: Doc, resumeFile: string): void {
  const skills = resume.sections.find((s) => /SKILLS/i.test(s.heading));
  if (!skills) {
    console.warn("! no SKILLS section — landing keywords not regenerated");
    return;
  }

  const rows = skillRows(resumeFile);
  if (!rows.length) {
    console.warn("! SKILLS section has no two-column rows — landing keywords not regenerated");
    return;
  }

  const keywords: string[] = [];
  for (const row of rows) {
    for (const raw of row.split(",")) {
      const term = raw.trim().replace(/\s+/g, " ");
      // Long phrases read as sentences on a small tilted tag, not as keywords.
      // A single letter reads as a rendering fault on a tilted tag, not as a keyword,
      // and anything past ~28 characters reads as a sentence.
      if (term.length >= 2 && term.length <= 28 && !keywords.includes(term)) {
        keywords.push(term);
      }
    }
  }

  const file = path.join(ROOT, "src", "ui", "keywords.generated.ts");
  fs.writeFileSync(
    file,
    [
      "/* Generated by scripts/build-corpus.ts from the SKILLS section of the résumé.",
      " * Do not edit: run `npm run corpus`. */",
      "",
      "export const RESUME_KEYWORDS = [",
      ...keywords.map((k) => `  ${JSON.stringify(k)},`),
      "] as const;",
      "",
    ].join("\n"),
    "utf8",
  );
  console.log(`  · ${keywords.length} landing keywords from SKILLS`);
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
  // Wiped up front, not before writing: paperDoc() extracts figures into OUT_DIR while the
  // documents are still being built, and clearing it later would delete them.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  const docs: Doc[] = [];

  console.log("· résumé");
  const resumeEn = resumeDoc(path.join(RESUME_DIR, "resume.pdf"), "en");
  docs.push(resumeEn);
  writeKeywords(resumeEn, path.join(RESUME_DIR, "resume.pdf"));
  docs.push(resumeDoc(path.join(RESUME_DIR, "resume-zh.pdf"), "zh"));

  console.log("· preprints");
  for (const spec of PAPERS) docs.push(paperDoc(spec));

  console.log("· profile notes");
  docs.push(...handwrittenDocs());

  console.log("· github repos");
  for (const account of GITHUB_ACCOUNTS) docs.push(...repoDocs(account));


  console.log("· fastmm documentation");
  docs.push(...fastmmDocs());

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
