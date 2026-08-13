/* The tool set.
 *
 * Each tool returns two strings: `result` goes to the model, `display` goes on the
 * activity row the visitor can expand. They differ on purpose — the model needs the
 * retrieved text, the reader needs to know what happened in one line.
 */

import type { Corpus, Kind } from "../rag/corpus";
import type { Source } from "./events";
import {
  DENY_REPOS,
  GITHUB_ACCOUNTS,
  GITHUB_USER,
  LIMITS,
  PROXY_URL,
} from "./config";
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

function clamp(text: string, max: number = LIMITS.toolResultChars): string {
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

/* ------------------------------------------------------- reading the repositories
 *
 * The indexed snapshot holds each repository's README and each pull request's body. These
 * three tools go further and read the live repository, so a question like "show me how the
 * consent gate is actually implemented" can be answered from the code rather than from the
 * description of the code. */

interface GhContentEntry {
  name: string;
  path: string;
  type: "file" | "dir" | string;
  size: number;
}

/** Resolve "exfer-mcp" or "exfer-stack/exfer-mcp" to an owner/name pair we are allowed to read. */
async function resolveRepo(
  input: string,
  signal: AbortSignal,
): Promise<{ owner: string; name: string } | { error: string }> {
  const raw = str(input).trim().replace(/^https?:\/\/github\.com\//, "");
  const parts = raw.split("/").filter(Boolean);

  if (parts.length >= 2) {
    const [owner, name] = parts as [string, string];
    if (!GITHUB_ACCOUNTS.includes(owner as (typeof GITHUB_ACCOUNTS)[number])) {
      return {
        error: `This tool only reads Ziyang's own accounts (${GITHUB_ACCOUNTS.join(", ")}). "${owner}" is not one of them.`,
      };
    }
    if (DENY_REPOS.has(name)) return { error: repoDenied(name) };
    return { owner, name };
  }

  const name = parts[0] ?? "";
  if (!name) return { error: "Which repository? Pass a name like exfer-mcp." };
  if (DENY_REPOS.has(name)) return { error: repoDenied(name) };

  // Bare name: try each account rather than making the model guess the owner.
  for (const owner of GITHUB_ACCOUNTS) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${name}`, {
      headers: { accept: "application/vnd.github+json" },
      signal,
    });
    if (res.ok) return { owner, name };
  }
  return {
    error: `No repository "${name}" under ${GITHUB_ACCOUNTS.join(" or ")}. Use github_activity to list what exists.`,
  };
}

function repoDenied(name: string): string {
  return `"${name}" is the anonymised artifact of a paper under review and is deliberately out of reach. Say the paper is under review and stop there.`;
}

const repoTree: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "github_repo_tree",
      description:
        "List what is in one of Ziyang's repositories: files and directories at a path. Use it to find the file worth reading before calling github_read_file — guessing a path wastes a call.",
      parameters: {
        type: "object",
        properties: {
          repo: {
            type: "string",
            description:
              "Repository name, e.g. exfer-mcp, or owner/name for exactness.",
          },
          path: {
            type: "string",
            description: "Directory inside the repository. Omit for the root.",
          },
        },
        required: ["repo"],
        additionalProperties: false,
      },
    },
  },
  display: (args) =>
    `${str(args.repo)}${args.path ? `/${str(args.path)}` : ""}`,
  async run(args, ctx) {
    const resolved = await resolveRepo(str(args.repo), ctx.signal);
    if ("error" in resolved) return { result: resolved.error, display: "refused" };

    const dir = str(args.path).replace(/^\/+|\/+$/g, "");
    const res = await fetch(
      `https://api.github.com/repos/${resolved.owner}/${resolved.name}/contents/${dir}`,
      { headers: { accept: "application/vnd.github+json" }, signal: ctx.signal },
    );
    if (!res.ok) {
      return {
        result: githubFailure(res.status, `${resolved.name}/${dir || "(root)"}`),
        display: `failed ${res.status}`,
      };
    }

    const body = (await res.json()) as GhContentEntry[] | GhContentEntry;
    const entries = Array.isArray(body) ? body : [body];
    const listing = entries
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1))
      .map((e) => (e.type === "dir" ? `${e.path}/` : `${e.path}  (${e.size} bytes)`))
      .join("\n");

    return {
      result: `${resolved.owner}/${resolved.name}${dir ? `/${dir}` : ""}\n\n${clamp(listing, 3000)}`,
      display: `${entries.length} entries`,
      sources: [
        {
          label: `${resolved.owner}/${resolved.name}`,
          url: `https://github.com/${resolved.owner}/${resolved.name}`,
        },
      ],
    };
  },
};

const readFile: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "github_read_file",
      description:
        "Read one file from one of Ziyang's repositories. Quote the parts that answer the question rather than pasting the whole file, and name the path so the reader can follow the link.",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository name or owner/name." },
          path: {
            type: "string",
            description: "Path inside the repository, e.g. src/server.py.",
          },
        },
        required: ["repo", "path"],
        additionalProperties: false,
      },
    },
  },
  display: (args) => `${str(args.repo)}/${str(args.path)}`,
  async run(args, ctx) {
    const resolved = await resolveRepo(str(args.repo), ctx.signal);
    if ("error" in resolved) return { result: resolved.error, display: "refused" };

    const filePath = str(args.path).replace(/^\/+/, "");
    if (!filePath) return { result: "Which file? Pass a path.", display: "no path" };

    const res = await fetch(
      `https://api.github.com/repos/${resolved.owner}/${resolved.name}/contents/${filePath}`,
      { headers: { accept: "application/vnd.github+json" }, signal: ctx.signal },
    );
    if (!res.ok) {
      return {
        result: githubFailure(res.status, `${resolved.name}/${filePath}`),
        display: `failed ${res.status}`,
      };
    }

    const body = (await res.json()) as {
      content?: string;
      encoding?: string;
      size?: number;
      type?: string;
      html_url?: string;
    };
    if (body.type === "dir") {
      return {
        result: `${filePath} is a directory. Use github_repo_tree to list it.`,
        display: "is a directory",
      };
    }
    if (body.encoding !== "base64" || !body.content) {
      return {
        result: `${filePath} is not readable as text (probably binary, ${body.size ?? "?"} bytes).`,
        display: "not text",
      };
    }

    // atob yields Latin-1; the bytes have to go through TextDecoder or every
    // non-ASCII character in a source file arrives mangled.
    const bytes = Uint8Array.from(atob(body.content.replace(/\n/g, "")), (c) =>
      c.charCodeAt(0),
    );
    const text = new TextDecoder().decode(bytes);

    return {
      result: clamp(
        `${resolved.owner}/${resolved.name}/${filePath}\n\n${text}`,
        8000,
      ),
      display: `${text.split("\n").length} lines`,
      sources: [
        {
          label: `${resolved.name}/${filePath}`,
          url:
            body.html_url ??
            `https://github.com/${resolved.owner}/${resolved.name}/blob/HEAD/${filePath}`,
        },
      ],
    };
  },
};

const readPull: ToolDef = {
  spec: {
    type: "function",
    function: {
      name: "github_pull",
      description:
        "Read a pull request from one of Ziyang's repositories: its description, the review discussion, and which files it touched. The index already holds the descriptions — reach for this when the discussion or the diff matters.",
      parameters: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository name or owner/name." },
          number: { type: "integer", description: "Pull request number." },
        },
        required: ["repo", "number"],
        additionalProperties: false,
      },
    },
  },
  display: (args) => `${str(args.repo)} #${num(args.number, 0)}`,
  async run(args, ctx) {
    const resolved = await resolveRepo(str(args.repo), ctx.signal);
    if ("error" in resolved) return { result: resolved.error, display: "refused" };

    const number = num(args.number, 0);
    if (!number) return { result: "Which pull request? Pass a number.", display: "no number" };

    const base = `https://api.github.com/repos/${resolved.owner}/${resolved.name}`;
    const headers = { accept: "application/vnd.github+json" };

    const [prRes, filesRes, commentsRes, reviewsRes] = await Promise.all([
      fetch(`${base}/pulls/${number}`, { headers, signal: ctx.signal }),
      fetch(`${base}/pulls/${number}/files?per_page=100`, { headers, signal: ctx.signal }),
      fetch(`${base}/issues/${number}/comments?per_page=50`, { headers, signal: ctx.signal }),
      fetch(`${base}/pulls/${number}/comments?per_page=50`, { headers, signal: ctx.signal }),
    ]);

    if (!prRes.ok) {
      return {
        result: githubFailure(prRes.status, `${resolved.name}#${number}`),
        display: `failed ${prRes.status}`,
      };
    }

    const pr = (await prRes.json()) as {
      title: string;
      body: string | null;
      state: string;
      merged: boolean;
      html_url: string;
      additions: number;
      deletions: number;
      changed_files: number;
      created_at: string;
    };

    const files = filesRes.ok
      ? ((await filesRes.json()) as { filename: string; additions: number; deletions: number }[])
      : [];
    const comments = commentsRes.ok
      ? ((await commentsRes.json()) as { user: { login: string }; body: string }[])
      : [];
    const reviews = reviewsRes.ok
      ? ((await reviewsRes.json()) as {
          user: { login: string };
          path?: string;
          body: string;
        }[])
      : [];

    const parts = [
      `${resolved.owner}/${resolved.name} #${number}: ${pr.title}`,
      `${pr.state}${pr.merged ? ", merged" : ""} · +${pr.additions}/-${pr.deletions} across ${pr.changed_files} files · opened ${pr.created_at.slice(0, 10)}`,
      "",
      (pr.body ?? "(no description)").replace(
        /🤖 Generated with \[Claude Code\][\s\S]*$/,
        "",
      ),
    ];

    if (files.length) {
      parts.push(
        "",
        "Files changed:",
        files
          .slice(0, 40)
          .map((f) => `  ${f.filename}  +${f.additions}/-${f.deletions}`)
          .join("\n"),
      );
    }

    const discussion = [
      ...comments.map((c) => `${c.user.login}: ${c.body}`),
      ...reviews.map(
        (c) => `${c.user.login}${c.path ? ` on ${c.path}` : ""}: ${c.body}`,
      ),
    ].filter((line) => line.trim().length > 10);

    if (discussion.length) {
      parts.push("", "Discussion:", discussion.join("\n\n"));
    }

    return {
      result: clamp(parts.join("\n")),
      display: `+${pr.additions}/-${pr.deletions}, ${pr.changed_files} files, ${discussion.length} comments`,
      sources: [
        { label: `${resolved.name} #${number}`, url: pr.html_url },
      ],
    };
  },
};

function githubFailure(status: number, what: string): string {
  if (status === 404) {
    return `GitHub has no ${what}. Check the path with github_repo_tree, or the repository name with github_activity.`;
  }
  if (status === 403) {
    return "GitHub is rate-limiting this visitor (60 unauthenticated requests an hour). Answer from the index and say the live read was not available.";
  }
  return `GitHub returned ${status} for ${what}.`;
}

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
  github_repo_tree: repoTree,
  github_read_file: readFile,
  github_pull: readPull,
  spawn_subagent: spawnSubagent,
};


/* A sub-agent reads the index and the repositories, and reports back. No web, no further
 * spawning — its job is to compress reading, not to start its own investigation. */
export const SUBAGENT_TOOLS: Record<string, ToolDef> = {
  retrieve,
  read_document: readDocument,
  github_repo_tree: repoTree,
  github_read_file: readFile,
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
