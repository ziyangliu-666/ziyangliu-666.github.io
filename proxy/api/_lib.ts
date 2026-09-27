/* Shared guards for the three endpoints.
 *
 * This proxy exists for one reason: a GitHub Pages bundle is public, so the DeepSeek key
 * cannot live in it. Everything here is about making sure that key can only be spent on
 * this site's own traffic — an origin allowlist, a rate limit, and a strict body schema so
 * the endpoint is not a free DeepSeek relay for whoever finds the URL.
 */

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function allowedOrigins(): string[] {
  const configured = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return [...configured, ...DEFAULT_ORIGINS];
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const list = allowedOrigins();
  const ok = origin && list.includes(origin.replace(/\/+$/, ""));
  return {
    "access-control-allow-origin": ok ? origin! : list[0] ?? "null",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    /* Without this a browser hides both headers from the page, however correctly the server
       sets them: CORS exposes only a short safelist by default, and neither of these is on it. */
    "access-control-expose-headers": "x-ratelimit-remaining, retry-after",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export function json(
  data: unknown,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin) },
  });
}

export function fail(
  message: string,
  status: number,
  origin: string | null,
): Response {
  return json({ error: { message } }, status, origin);
}

/** OPTIONS preflight, method check, and origin allowlist in one place. */
export function guard(req: Request): { origin: string | null } | Response {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return fail("POST only", 405, origin);
  }

  // A browser always sends Origin on a cross-origin POST. A missing or foreign one means
  // the call did not come from this site, which is the only traffic the key is for.
  const list = allowedOrigins();
  if (!origin || !list.includes(origin.replace(/\/+$/, ""))) {
    return fail(
      "This endpoint only serves ziy.bio. It is the key holder for that site's agent, not a public API.",
      403,
      origin,
    );
  }

  return { origin };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/* ------------------------------------------------------------------ rate limit
 *
 * Two tiers, because the thing a visitor experiences and the thing an abuser does are not the
 * same shape.
 *
 * Tier one counts QUESTIONS. One question is one unit, however hard the agent worked on it.
 * A question costs three to four calls to this endpoint on a normal day and up to twenty-one
 * when the loop spends all eight tool rounds and spawns sub-agents, so counting raw calls
 * charged a curious visitor five times over for asking something that needed research. Worse,
 * the limit then landed in the middle of an answer: round five of eight got a 429 and the
 * visitor was left with half a paragraph and an error. Only the opening call of a question is
 * counted and only it can be refused, so an answer that starts always finishes.
 *
 * Tier two counts every request, per IP, as the backstop tier one cannot be. "Not an opening
 * call" is a shape an attacker can forge, so continuation calls are exempt from the question
 * limits and still bounded here. The ceiling is set where no human reaches it: 150 questions a
 * day at four calls each is 600 requests, well under 900.
 *
 * Above both sits the global daily ceiling, which is the actual spend limit. It counts every
 * request from everyone, including continuations, because every request costs money and because
 * a ceiling that trusted the opening-call test would be a ceiling an attacker walks around.
 *
 * Below both sits a Vercel WAF rate limit on /api, enforced before this function runs and not
 * billed for what it blocks.
 */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

export function hasSharedStore(): boolean {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

/* Per-isolate fallback, and the reason a shared store is not optional.
 *
 * An edge function runs in many isolates at once, one or more per region, each with its own
 * heap. Measured against the deployed proxy: a sequential loop was refused at request 13 of a
 * 12-per-minute limit, and then 39 of 40 requests fired in parallel from the same IP came back
 * 200 while that same IP was still being refused sequentially. Concurrency is what an abuser
 * uses, so without a shared store the limit only throttles the one caller who is being polite.
 * This Map is kept because a limit that works on one isolate beats no limit at all when Redis
 * is unreachable, not because it is sufficient.
 */
const local = new Map<string, { n: number; resetAt: number }>();

interface Counter {
  key: string;
  ttl: number;
}

/** Increment every counter in one round trip, and return the new values in the same order. */
async function bumpAll(counters: Counter[]): Promise<number[]> {
  if (hasSharedStore()) {
    try {
      const res = await fetch(`${UPSTASH_URL}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${UPSTASH_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          counters.flatMap((c) => [
            ["INCR", c.key],
            ["EXPIRE", c.key, String(c.ttl), "NX"],
          ]),
        ),
      });
      if (res.ok) {
        const out = (await res.json()) as { result: unknown }[];
        // INCR and EXPIRE alternate, so the counts are at the even indices.
        const values = counters.map((_, i) => Number(out[i * 2]?.result ?? 0));
        if (values.every((n) => Number.isFinite(n) && n > 0)) return values;
      }
    } catch {
      /* Fall through. A store that is down must not take the site down with it. */
    }
  }

  const now = Date.now();
  return counters.map((c) => {
    const entry = local.get(c.key);
    if (!entry || entry.resetAt < now) {
      local.set(c.key, { n: 1, resetAt: now + c.ttl * 1000 });
      return 1;
    }
    entry.n++;
    return entry.n;
  });
}

export interface Budget {
  /** Questions per IP per minute. Only an opening call counts. */
  questionsPerMinute: number;
  /** Questions per IP per hour. */
  questionsPerHour: number;
  /** Questions per IP per day. */
  questionsPerDay: number;
  /** Every request from this IP, per minute. The backstop, not the visitor-facing limit. */
  requestsPerMinute: number;
  /** Every request from this IP, per day. */
  requestsPerDay: number;
  /** Requests across all visitors per day. The actual spend ceiling.
   *
   * Counted in requests, not questions, for two reasons. Every request to this endpoint costs
   * money whether or not it opens a question, and "not an opening call" is a shape an attacker
   * can forge, so a ceiling that skipped continuations would be a ceiling with a door in it.
   * It is also the unit CHAT_GLOBAL_DAILY, SEARCH_GLOBAL_DAILY and FETCH_GLOBAL_DAILY were
   * already set in, and silently redefining a configured number is its own kind of bug. */
  globalPerDay: number;
}

/* A 429 the client can act on. Retry-After lets the UI say when rather than guess, and the
 * remaining count lets it warn a visitor before the wall instead of at it. */
function limited(
  message: string,
  retryAfterSeconds: number,
  origin: string | null,
): Response {
  const res = fail(message, 429, origin);
  res.headers.set("retry-after", String(retryAfterSeconds));
  res.headers.set("x-ratelimit-remaining", "0");
  return res;
}

/** Seconds until the current minute, hour or day rolls over. */
function secondsLeft(now: number, period: "minute" | "hour" | "day"): number {
  const size = period === "minute" ? 60_000 : period === "hour" ? 3_600_000 : 86_400_000;
  return Math.max(1, Math.ceil((size - (now % size)) / 1000));
}

export interface Allowed {
  /** Questions this visitor has left today, for the client to warn on. */
  questionsLeftToday: number;
}

/**
 * Returns the response to send when over budget, or an `Allowed` when the request may proceed.
 *
 * `isQuestion` must be true only for the opening call of a visitor's question. Pass false for
 * every tool round, sub-agent call and follow-up: those are work inside a question that was
 * already paid for, and refusing one of them breaks an answer that is already on screen.
 */
export async function overBudget(
  scope: string,
  req: Request,
  origin: string | null,
  budget: Budget,
  isQuestion: boolean,
): Promise<Response | Allowed> {
  const ip = clientIp(req);
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const hour = Math.floor(now / 3_600_000);
  const day = new Date(now).toISOString().slice(0, 10);

  /* Every request pays the backstop. Only a question pays the question counters, and the two
   * are incremented in one round trip so a request costs the store one call either way. */
  const counters: Counter[] = [
    { key: `rl:${scope}:rm:${minute}:${ip}`, ttl: 120 },
    { key: `rl:${scope}:rd:${day}:${ip}`, ttl: 90_000 },
    { key: `rl:${scope}:g:${day}`, ttl: 90_000 },
  ];
  if (isQuestion) {
    counters.push(
      { key: `rl:${scope}:qm:${minute}:${ip}`, ttl: 120 },
      { key: `rl:${scope}:qh:${hour}:${ip}`, ttl: 7_200 },
      { key: `rl:${scope}:qd:${day}:${ip}`, ttl: 90_000 },
    );
  }

  const n = await bumpAll(counters);
  const [reqMinute, reqDay, global, qMinute, qHour, qDay] = n;

  // The backstop first: it applies to every request, including the ones a question depends on.
  if (reqMinute! > budget.requestsPerMinute) {
    return limited(
      "Slow down a moment — this site limits how fast one visitor can ask.",
      secondsLeft(now, "minute"),
      origin,
    );
  }
  if (reqDay! > budget.requestsPerDay) {
    return limited(
      "You have reached today's limit for this site. It comes back tomorrow; the résumé link is always there.",
      secondsLeft(now, "day"),
      origin,
    );
  }
  if (global! > budget.globalPerDay) {
    return limited(
      "The site has spent today's budget for the agent. Try tomorrow, or read the résumé linked in the header.",
      secondsLeft(now, "day"),
      origin,
    );
  }

  if (!isQuestion) {
    // Work inside a question that was already allowed. Never refused past the backstop.
    return { questionsLeftToday: budget.questionsPerDay };
  }

  if (qMinute! > budget.questionsPerMinute) {
    return limited(
      "Slow down a moment — this site limits how fast one visitor can ask.",
      secondsLeft(now, "minute"),
      origin,
    );
  }
  if (qHour! > budget.questionsPerHour) {
    return limited(
      "You have asked a lot in the last hour, which the site caps. It opens up again shortly; the résumé link is always there.",
      secondsLeft(now, "hour"),
      origin,
    );
  }
  if (qDay! > budget.questionsPerDay) {
    return limited(
      "You have reached today's question limit for this site. It comes back tomorrow; the résumé link is always there.",
      secondsLeft(now, "day"),
      origin,
    );
  }
  return { questionsLeftToday: Math.max(0, budget.questionsPerDay - qDay!) };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 400_000) throw new Error("request body too large");
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/* ------------------------------------------------------------------ request log
 *
 * One JSON line per question, to stdout, which Vercel keeps as runtime logs. `npm run logs`
 * in this directory tails them. No database, no dashboard, no extra service to keep alive: a
 * greppable line is enough to see what people actually ask, and what people actually ask is
 * the only interesting thing here.
 *
 * The visitor is a hash, never an address. Salted with the DeepSeek key, which is already a
 * secret on this project and never leaves the server, so the digest cannot be reversed by
 * anyone holding the logs. Eight hex characters is enough to tell "one person asked five
 * questions" from "five people asked one", and too few to single anyone out.
 *
 * Vercel's own geo headers give a country without any lookup of our own.
 */
export async function logAsk(
  req: Request,
  fields: Record<string, unknown>,
): Promise<void> {
  try {
    const salt = process.env.DEEPSEEK_API_KEY ?? "unsalted";
    const raw = new TextEncoder().encode(`${clientIp(req)}|${salt}`);
    const digest = await crypto.subtle.digest("SHA-256", raw);
    const visitor = Array.from(new Uint8Array(digest).slice(0, 4))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    console.log(
      JSON.stringify({
        tag: "ask",
        at: new Date().toISOString(),
        visitor,
        country: req.headers.get("x-vercel-ip-country") ?? null,
        ...fields,
      }),
    );
  } catch {
    /* A log line must never be the reason an answer fails. */
  }
}
