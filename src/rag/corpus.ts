/* Retrieval over the prebuilt corpus.
 *
 * The index is built by scripts/build-corpus.ts and shipped as a static JSON file.
 * There is no vector store and no embedding call at query time: on a corpus of a few
 * hundred chunks, BM25 with the model reformulating its own queries retrieves as well
 * as similarity search and is far easier to debug — a bad result is a visible term
 * mismatch rather than an opaque distance.
 */

import MiniSearch from "minisearch";
import { processTerm, tokenize } from "./tokenize";

export type Kind =
  | "resume"
  | "paper"
  | "repo"
  | "profile"
  | "project";

export interface DocMeta {
  id: string;
  title: string;
  kind: Kind;
  lang: "en" | "zh";
  url?: string;
  date?: string;
  sections: string[];
  chunks: number;
}

export interface Section {
  heading: string;
  text: string;
}

export interface Doc extends Omit<DocMeta, "sections" | "chunks"> {
  sections: Section[];
}

export interface Hit {
  id: string;
  docId: string;
  docTitle: string;
  heading: string;
  kind: Kind;
  lang: "en" | "zh";
  url?: string;
  date?: string;
  text: string;
  score: number;
}

interface Bundle {
  version: number;
  builtAt: string;
  docs: DocMeta[];
  chunks: Record<string, string>;
  index: unknown;
}

const SEARCH_OPTIONS = {
  idField: "id",
  fields: ["text", "heading", "docTitle"],
  storeFields: ["docId", "docTitle", "heading", "kind", "lang", "url", "date"],
  tokenize,
  processTerm,
} as const;

export class Corpus {
  readonly builtAt: string;
  readonly docs: DocMeta[];
  private readonly mini: MiniSearch;
  private readonly chunks: Record<string, string>;
  private readonly baseUrl: string;
  private readonly docCache = new Map<string, Doc>();

  private constructor(bundle: Bundle, baseUrl: string) {
    this.builtAt = bundle.builtAt;
    this.docs = bundle.docs;
    this.chunks = bundle.chunks;
    this.baseUrl = baseUrl;
    this.mini = MiniSearch.loadJS(bundle.index as never, SEARCH_OPTIONS as never);
  }

  static fromBundle(bundle: unknown, baseUrl = "/corpus"): Corpus {
    return new Corpus(bundle as Bundle, baseUrl);
  }

  static async load(baseUrl = "/corpus"): Promise<Corpus> {
    const res = await fetch(`${baseUrl}/index.json`);
    if (!res.ok) throw new Error(`corpus: ${res.status} loading index.json`);
    return new Corpus((await res.json()) as Bundle, baseUrl);
  }

  /** Ranked chunks. `kinds` narrows to one part of the corpus (the tool's `index` arg). */
  search(query: string, opts: { kinds?: Kind[]; limit?: number } = {}): Hit[] {
    const limit = opts.limit ?? 6;
    const raw = this.mini.search(query, {
      // Prefix matching earns its keep on a small corpus: "migrat" should find
      // "migration". Fuzziness stays low — typo tolerance, not semantic drift.
      prefix: (term) => term.length > 3,
      fuzzy: (term) => (term.length > 5 ? 0.2 : false),
      boost: { docTitle: 2, heading: 1.6 },
      combineWith: "OR",
      filter: opts.kinds
        ? (r) => opts.kinds!.includes(r.kind as Kind)
        : undefined,
    });

    return raw.slice(0, limit).map((r) => ({
      id: r.id as string,
      docId: r.docId as string,
      docTitle: r.docTitle as string,
      heading: r.heading as string,
      kind: r.kind as Kind,
      lang: r.lang as "en" | "zh",
      url: r.url as string | undefined,
      date: r.date as string | undefined,
      text: this.chunks[r.id as string] ?? "",
      score: r.score,
    }));
  }

  chunk(id: string): string | undefined {
    return this.chunks[id];
  }

  meta(docId: string): DocMeta | undefined {
    return this.docs.find((d) => d.id === docId);
  }

  /** Full document, fetched on demand — `read_document` needs whole sections. */
  async doc(docId: string): Promise<Doc | undefined> {
    const cached = this.docCache.get(docId);
    if (cached) return cached;
    if (!this.meta(docId)) return undefined;
    const res = await fetch(`${this.baseUrl}/docs/${docId}.json`);
    if (!res.ok) return undefined;
    const doc = (await res.json()) as Doc;
    this.docCache.set(docId, doc);
    return doc;
  }

  /** One-line inventory for the system prompt, so the model knows what it can ask for. */
  outline(): string {
    const byKind = new Map<Kind, DocMeta[]>();
    for (const d of this.docs) {
      const list = byKind.get(d.kind) ?? [];
      list.push(d);
      byKind.set(d.kind, list);
    }
    const lines: string[] = [];
    for (const [kind, list] of byKind) {
      lines.push(
        `${kind}: ${list.map((d) => `${d.title} [${d.id}]`).join("; ")}`,
      );
    }
    return lines.join("\n");
  }
}
