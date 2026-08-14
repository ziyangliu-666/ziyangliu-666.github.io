/* POST /api/chat — the key holder.
 *
 * Adds the DeepSeek key to a request the browser built, and streams the response back
 * untouched. It does not run the agent loop, does not see the corpus, and keeps no state.
 *
 * The body schema is validated field by field, and unknown fields are rejected. That
 * strictness is the security boundary: without it, anyone who found this URL would have a
 * free DeepSeek endpoint with an unbounded prompt and an unbounded model choice.
 */

import { corsHeaders, fail, guard, logAsk, overBudget, readJson } from "./_lib";

export const config = { runtime: "edge" };

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const ALLOWED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);

/** Must match src/agent/tools.ts. A tool the site does not ship is a tool nobody may ask for. */
const ALLOWED_TOOLS = new Set([
  "retrieve",
  "read_document",
  "web_search",
  "fetch_url",
  "github_activity",
  "github_repo_tree",
  "github_grep",
  "github_read_file",
  "github_pull",
  "spawn_subagent",
]);

const ALLOWED_ROLES = new Set(["system", "user", "assistant", "tool"]);
const ALLOWED_TOP_LEVEL = new Set([
  "model",
  "messages",
  "tools",
  "tool_choice",
  "stream",
  "stream_options",
  "max_tokens",
  "thinking",
  "reasoning_effort",
]);

const MAX_MESSAGES = 48;
/* The ceiling that stops this endpoint becoming a cheap DeepSeek relay. It has to sit above
 * LIMITS.maxTokens in src/agent/config.ts, or the app's own requests are rejected here. On
 * DeepSeek this budget covers reasoning_content as well as the answer, which is why 2000 was
 * not enough once the prompt gave the model a real decision to think about. */
const MAX_TOKENS = 8000;
const MAX_TOTAL_CHARS = 220_000;

function validate(body: Record<string, unknown>): string | null {
  for (const key of Object.keys(body)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) return `unexpected field "${key}"`;
  }

  if (typeof body.model !== "string" || !ALLOWED_MODELS.has(body.model)) {
    return `model must be one of: ${[...ALLOWED_MODELS].join(", ")}`;
  }

  if (body.stream !== true) return "stream must be true";

  const maxTokens = body.max_tokens;
  if (typeof maxTokens !== "number" || maxTokens < 1 || maxTokens > MAX_TOKENS) {
    return `max_tokens must be a number between 1 and ${MAX_TOKENS}`;
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return "messages must be a non-empty array";
  }
  if (body.messages.length > MAX_MESSAGES) {
    return `messages must hold at most ${MAX_MESSAGES} entries`;
  }

  let totalChars = 0;
  for (const raw of body.messages) {
    if (typeof raw !== "object" || raw === null) return "each message must be an object";
    const m = raw as Record<string, unknown>;
    if (typeof m.role !== "string" || !ALLOWED_ROLES.has(m.role)) {
      return `message role must be one of: ${[...ALLOWED_ROLES].join(", ")}`;
    }
    if (m.content != null && typeof m.content !== "string") {
      return "message content must be a string or null";
    }
    totalChars += typeof m.content === "string" ? m.content.length : 0;

    if (m.tool_calls != null) {
      if (!Array.isArray(m.tool_calls)) return "tool_calls must be an array";
      for (const call of m.tool_calls) {
        const c = call as Record<string, unknown>;
        const fn = c?.function as Record<string, unknown> | undefined;
        if (typeof fn?.name !== "string" || !ALLOWED_TOOLS.has(fn.name)) {
          return `tool_calls may only name: ${[...ALLOWED_TOOLS].join(", ")}`;
        }
        totalChars += typeof fn.arguments === "string" ? fn.arguments.length : 0;
      }
    }
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    return `total message content must stay under ${MAX_TOTAL_CHARS} characters`;
  }

  if (body.tools != null) {
    if (!Array.isArray(body.tools)) return "tools must be an array";
    for (const raw of body.tools) {
      const t = raw as Record<string, unknown>;
      const fn = t?.function as Record<string, unknown> | undefined;
      if (t?.type !== "function" || typeof fn?.name !== "string") {
        return "each tool must be a function definition";
      }
      if (!ALLOWED_TOOLS.has(fn.name)) {
        return `unknown tool "${fn.name}"`;
      }
    }
  }

  if (body.tool_choice != null && body.tool_choice !== "auto") {
    return 'tool_choice may only be "auto"';
  }

  if (body.thinking != null) {
    const t = body.thinking as Record<string, unknown>;
    if (t.type !== "enabled" && t.type !== "disabled") {
      return 'thinking.type must be "enabled" or "disabled"';
    }
  }

  if (
    body.reasoning_effort != null &&
    !["low", "medium", "high"].includes(String(body.reasoning_effort))
  ) {
    return "reasoning_effort must be low, medium or high";
  }

  if (body.stream_options != null) {
    const s = body.stream_options as Record<string, unknown>;
    for (const key of Object.keys(s)) {
      if (key !== "include_usage") return `unexpected stream_options.${key}`;
    }
  }

  return null;
}

export default async function handler(req: Request): Promise<Response> {
  const gate = guard(req);
  if (gate instanceof Response) return gate;
  const { origin } = gate;

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return fail("the proxy has no DEEPSEEK_API_KEY configured", 503, origin);

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "invalid JSON", 400, origin);
  }

  const problem = validate(body);
  if (problem) return fail(problem, 400, origin);

  const limited = await overBudget("chat", req, origin, {
    perMinute: 24,
    perDay: 240,
    globalPerDay: Number(process.env.CHAT_GLOBAL_DAILY ?? 3000),
  });
  if (limited) return limited;

  /* Logged after the rate limiter, so a flood shows up as 429s rather than as thousands of
   * lines, and before the upstream call, so a question that fails to answer is still visible.
   *
   * Only the opening call of a turn is logged, and it takes two conditions to find it.
   *
   * The last message must be the visitor's. The agent loop calls this endpoint once per tool
   * round and every round repeats the same question, so without this one question wrote five
   * to twelve lines; on a later round the last message is a tool result.
   *
   * The request must also carry tools. The follow-up generator passes the whole exchange as a
   * user message, so it satisfies the first condition and logged a 300-character "Question:
   * ... Answer: ..." blob after every real question. Only the main loop sends tools. */
  const messages = body.messages as { role?: string; content?: unknown }[];
  const last = messages[messages.length - 1];
  const isOpeningCall = last?.role === "user" && Array.isArray(body.tools) && body.tools.length > 0;
  if (isOpeningCall) {
    void logAsk(req, {
      q: typeof last.content === "string" ? last.content.slice(0, 300) : null,
      turn: messages.filter((m) => m.role === "user").length,
      model: body.model,
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return fail(
      `could not reach the model provider (${err instanceof Error ? err.message : "network error"})`,
      502,
      origin,
    );
  }

  if (!upstream.ok || !upstream.body) {
    // Pass the provider's own message through — it is usually the useful one — but never
    // any header that could carry account detail.
    const detail = await upstream.text().catch(() => "");
    return fail(
      `model provider returned ${upstream.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      upstream.status === 429 ? 429 : 502,
      origin,
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      ...corsHeaders(origin),
    },
  });
}
