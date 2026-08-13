/* POST /api/search — web search, so the browser never holds the search key either.
 *
 * Tavily by default. The adapter shape is deliberately small: swapping in Brave means
 * writing one more function and changing one line.
 */

import { fail, guard, json, overBudget, readJson } from "./_lib";

export const config = { runtime: "edge" };

interface Normalised {
  title: string;
  url: string;
  content: string;
}

async function tavily(query: string, key: string): Promise<Normalised[]> {
  const payload = {
    query,
    max_results: 5,
    search_depth: "basic",
    include_answer: false,
    include_raw_content: false,
  };

  // Tavily accepts the key as a bearer token; older accounts still take it in the body.
  // Try the documented form, fall back once rather than failing a visitor's question.
  let res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401 || res.status === 403) {
    res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, api_key: key }),
    });
  }

  if (!res.ok) {
    throw new Error(`search provider returned ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title ?? r.url!,
      url: r.url!,
      content: (r.content ?? "").slice(0, 1200),
    }));
}

export default async function handler(req: Request): Promise<Response> {
  const gate = guard(req);
  if (gate instanceof Response) return gate;
  const { origin } = gate;

  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    // Not an error: the site is built to work without search, and the tool tells the
    // model to answer from the index and say it could not check the live web.
    return json({ results: [], disabled: true }, 200, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "invalid JSON", 400, origin);
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return fail("query is required", 400, origin);
  if (query.length > 300) return fail("query must be under 300 characters", 400, origin);

  const limited = await overBudget("search", req, origin, {
    perMinute: 12,
    perDay: 80,
    globalPerDay: Number(process.env.SEARCH_GLOBAL_DAILY ?? 600),
  });
  if (limited) return limited;

  try {
    return json({ results: await tavily(query, key) }, 200, origin);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "search failed", 502, origin);
  }
}
