/* The tool set.
 *
 * Each tool returns two strings: `result` goes to the model, `display` goes on the
 * activity row the visitor can expand. They differ on purpose — the model needs the
 * retrieved text, the reader needs to know what happened in one line.
 */

import type { Corpus, Kind } from "../rag/corpus";
import type { Source } from "./events";
import { DENY_REPOS, GITHUB_USER, LIMITS, PROXY_URL } from "./config";
import type { ToolSpec } from "./provider";

export interface ToolOutcome {
  /** Handed back to the model as the tool result. */
  result: string;
  /** One line for the activity row. Falls back to a truncated result. */
  display?: string;
  sources?: Source[];
}

export interface ToolContext {
  corpus: Corpus;
  signal: AbortSignal;
  /** The model's tool_call id — also the activity row's id, so events can address it. */
  callId: string;
  /** Nested agent runner, injected by the loop to avoid a circular import. */
  runSubagent: (name: string, task: string, callId: string) => Promise<string>;
  subagentsUsed: () => number;
}

export interface ToolDef {
  spec: ToolSpec;
  /** Which activity row the loop draws for this tool: a tool call, or a sub-agent. */
  activity?: "tool" | "subagent";
  /** Short argument summary for the activity row, e.g. `index:resume "throughput"`. */
  display(args: Record<string, unknown>): string;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome>;
}

const KIND_GROUPS: Record<string, Kind[]> = {
  all: ["resume", "paper", "writing", "repo", "profile", "project"],
  resume: ["resume"],
  papers: ["paper"],
  writing: ["writing"],
  repos: ["repo"],
  profile: ["profile", "project"],
};

function clamp(text: string, max = LIMITS.toolResultChars): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated at ${max} characters]`;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Shorten for the activity row without leaving a stray space before the ellipsis. */
function brief(v: unknown, max: number): string {
  const s = str(v).replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max).trimEnd()}…`;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/* ------------------------------------------------------------------- retrieve */

const retrieve: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "retrieve",
      description:
        "Search Ziyang's indexed material with keyword search (BM25). Returns ranked passages, each with a chunk id you can quote and a document id you can pass to read_document. This is lexical, not semantic: use the words that would actually appear in the text, and if a search comes back thin, search again with different wording rather than giving up. Works in English and Chinese.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keywords. Not a question — the terms you expect in the text.",
          },
          index: {
            type: "string",
            enum: Object.keys(KIND_GROUPS),
            description:
              "Narrow to one part of the corpus. 'resume' for roles and dates, 'papers' for the arXiv preprints, 'writing' for blog posts, 'repos' for GitHub, 'profile' for the biography and the Exfer project. Omit to search everything.",
          },
          limit: {
            type: "integer",
            description: "Passages to return, 1-10. Default 6.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  display: (args) => {
    const index = str(args.index, "all");
    return `index:${index} "${brief(args.query, 60)}"`;
  },
  async run(args, ctx) {
    const query = str(args.query).trim();
    if (!query) return { result: "retrieve needs a query.", display: "empty query" };

    const group = KIND_GROUPS[str(args.index, "all")] ?? KIND_GROUPS.all;
    const limit = Math.min(10, Math.max(1, num(args.limit, 6)));
    const hits = ctx.corpus.search(query, { kinds: group, limit });

    if (!hits.length) {
      return {
        result: `No passage in the index matched "${query}". Try different keywords, or a different index.`,
        display: "no chunk above threshold",
      };
    }

    const body = hits
      .map(
        (h) =>
          `[${h.id}] ${h.docTitle} › ${h.heading}\n${h.text}`,
      )
      .join("\n\n---\n\n");

    const sources: Source[] = [];
    for (const h of hits) {
      if (!sources.some((s) => s.label === h.docTitle)) {
        sources.push({ label: h.docTitle, url: h.url });
      }
    }

    return {
      result: clamp(
        `${hits.length} passages for "${query}":\n\n${body}`,
      ),
      display: `${hits.length} passages · top ${hits
        .slice(0, 3)
        .map((h) => h.id)
        .join(", ")}`,
      sources,
    };
  },
};

/* -------------------------------------------------------------- read_document */

const readDocument: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "read_document",
      description:
        "Read a whole indexed document, or one of its sections. Use it after retrieve, when a passage is clearly the right document but you need the surrounding context. Pass the document id (the part of a chunk id before the '#').",
      parameters: {
        type: "object",
        properties: {
          doc_id: {
            type: "string",
            description: "Document id, e.g. resume-en, paper-memory-paging, about-exfer.",
          },
          section: {
            type: "string",
            description:
              "Optional. Case-insensitive substring of a section heading; only matching sections are returned.",
          },
        },
        required: ["doc_id"],
        additionalProperties: false,
      },
    },
  },
  display: (args) =>
    `${str(args.doc_id)}${args.section ? ` § ${str(args.section)}` : ""}`,
  async run(args, ctx) {
    const docId = str(args.doc_id).trim().replace(/#\d+$/, "");
    const doc = await ctx.corpus.doc(docId);
    if (!doc) {
      const known = ctx.corpus.docs.map((d) => d.id).join(", ");
      return {
        result: `No document "${docId}". Available: ${known}`,
        display: "not found",
      };
    }

    const needle = str(args.section).toLowerCase();
    const sections = needle
      ? doc.sections.filter((s) => s.heading.toLowerCase().includes(needle))
      : doc.sections;

    if (!sections.length) {
      return {
        result: `"${docId}" has no section matching "${needle}". Sections: ${doc.sections
          .map((s) => s.heading)
          .join(" | ")}`,
        display: "no matching section",
      };
    }

    const body = sections
      .map((s) => `## ${s.heading}\n${s.text}`)
      .join("\n\n");

    return {
      result: clamp(`${doc.title}\n\n${body}`),
      display: `${sections.length} of ${doc.sections.length} sections · ${body.length} chars`,
      sources: [{ label: doc.title, url: doc.url }],
    };
  },
};

/* ------------------------------------------------------------------ web tools */

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

const webSearch: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the live web. Use it for things the index cannot know: current events, whether something shipped, context about a company or a paper he did not write. Do not use it to look up facts about Ziyang himself — the index is authoritative there and the web is not.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  display: (args) => `"${brief(args.query, 60)}"`,
  async run(args, ctx) {
    if (!PROXY_URL) {
      return {
        result:
          "Web search is unavailable in this build (no proxy configured). Answer from the index, and say that you could not check the live web.",
        display: "unavailable",
      };
    }
    const query = str(args.query).trim();
    const res = await fetch(`${PROXY_URL}/api/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
      signal: ctx.signal,
    });
    if (!res.ok) {
      return {
        result: `Web search failed (${res.status}). Continue without it and say so.`,
        display: `failed ${res.status}`,
      };
    }
    const data = (await res.json()) as { results?: SearchResult[] };
    const results = data.results ?? [];
    if (!results.length) {
      return { result: `No web results for "${query}".`, display: "0 results" };
    }

    return {
      result: clamp(
        results
          .map(
            (r, i) =>
              `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content.replace(/\s+/g, " ").slice(0, 600)}`,
          )
          .join("\n\n"),
      ),
      display: `${results.length} results`,
      sources: results.slice(0, 4).map((r) => ({
        label: hostOf(r.url),
        url: r.url,
      })),
    };
  },
};

const fetchUrl: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "fetch_url",
      description:
        "Fetch one web page and return its readable text. Use it after web_search when a result looks worth reading in full.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute http(s) URL." },
        },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  display: (args) => hostOf(str(args.url)),
  async run(args, ctx) {
    if (!PROXY_URL) {
      return {
        result: "Fetching pages is unavailable in this build (no proxy configured).",
        display: "unavailable",
      };
    }
    const url = str(args.url).trim();
    const res = await fetch(`${PROXY_URL}/api/fetch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
      signal: ctx.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        result: `Could not fetch ${url} (${res.status}${detail ? `: ${detail.slice(0, 120)}` : ""}).`,
        display: `failed ${res.status}`,
      };
    }
    const data = (await res.json()) as { title?: string; text?: string };
    return {
      result: clamp(`${data.title ?? url}\n\n${data.text ?? ""}`),
      display: `${(data.text ?? "").length} chars`,
      sources: [{ label: data.title || hostOf(url), url }],
    };
  },
};

/* ------------------------------------------------------------ github_activity */

interface GhRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  fork: boolean;
}

const githubActivity: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "github_activity",
      description:
        "List Ziyang's own public repositories, most recently pushed first, straight from the GitHub API. Use this when the question is about what he is working on right now — the index is a snapshot and this is live.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  display: () => `user:${GITHUB_USER}`,
  async run(_args, ctx) {
    const res = await fetch(
      `https://api.github.com/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`,
      { headers: { accept: "application/vnd.github+json" }, signal: ctx.signal },
    );
    if (!res.ok) {
      return {
        result: `GitHub API returned ${res.status}. Fall back to the index.`,
        display: `failed ${res.status}`,
      };
    }
    const repos = (await res.json()) as GhRepo[];
    // Same denylist as the corpus builder: anonymised artifacts of papers in review.
    const own = repos
      .filter((r) => !r.fork && !DENY_REPOS.has(r.name))
      .slice(0, 12);

    if (!own.length) {
      return { result: "No public non-fork repositories found.", display: "0 repos" };
    }

    return {
      result: own
        .map(
          (r) =>
            `${r.name} — ${r.description ?? "no description"} (${r.language ?? "n/a"}, ${r.stargazers_count}★, last push ${r.pushed_at.slice(0, 10)})\n${r.html_url}`,
        )
        .join("\n\n"),
      display: `${own.length} own repos · latest ${own[0]!.pushed_at.slice(0, 10)}`,
      sources: [
        {
          label: `github.com/${GITHUB_USER}`,
          url: `https://github.com/${GITHUB_USER}`,
        },
      ],
    };
  },
};

/* ------------------------------------------------------------- spawn_subagent */

const spawnSubagent: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "spawn_subagent",
      description:
        "Hand a self-contained reading task to a sub-agent, which searches the index on its own and reports back a short summary. Worth it when a question has two or three independent parts that each need their own searching — the sub-agent's reading stays out of your context and you get the conclusion. Not worth it for a single lookup you could do yourself with retrieve. The sub-agent sees only the task you write, so include everything it needs.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Short kebab-case label shown to the visitor, e.g. resume-reader, paper-reader.",
          },
          task: {
            type: "string",
            description:
              "The self-contained instruction: what to find, and what to report back.",
          },
        },
        required: ["name", "task"],
        additionalProperties: false,
      },
    },
  },
  activity: "subagent",
  display: (args) => brief(args.task, 70),
  async run(args, ctx) {
    if (ctx.subagentsUsed() >= LIMITS.maxSubagents) {
      return {
        result: `Sub-agent budget for this turn is spent (${LIMITS.maxSubagents}). Use retrieve directly.`,
        display: "budget spent",
      };
    }
    const name = str(args.name, "sub-agent").slice(0, 40);
    const task = str(args.task).trim();
    if (!task) return { result: "spawn_subagent needs a task.", display: "empty task" };
    const summary = await ctx.runSubagent(name, task, ctx.callId);
    return { result: summary, display: summary.replace(/\s+/g, " ").slice(0, 140) };
  },
};

/* -------------------------------------------------------------------- registry */

export const TOOLS: Record<string, ToolDef> = {
  retrieve,
  read_document: readDocument,
  web_search: webSearch,
  fetch_url: fetchUrl,
  github_activity: githubActivity,
  spawn_subagent: spawnSubagent,
};

/** Tools a sub-agent gets: read the index, report back. No web, no further spawning. */
export const SUBAGENT_TOOLS: Record<string, ToolDef> = {
  retrieve,
  read_document: readDocument,
};

export function specsFor(tools: Record<string, ToolDef>): ToolSpec[] {
  return Object.values(tools).map((t) => t.spec);
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}
