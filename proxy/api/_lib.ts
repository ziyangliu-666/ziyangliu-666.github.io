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

/* ------------------------------------------------------------------ rate limit */

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";

/** Per-isolate fallback. Weaker than Redis — an isolate per region resets the count —
 * but it still stops the trivial case of one script hammering one endpoint. */
const local = new Map<string, { n: number; resetAt: number }>();

async function bump(key: string, ttlSeconds: number): Promise<number> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${UPSTASH_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(ttlSeconds), "NX"],
      ]),
    });
    if (res.ok) {
      const out = (await res.json()) as { result: unknown }[];
      const n = Number(out[0]?.result ?? 0);
      if (Number.isFinite(n) && n > 0) return n;
    }
    // Redis unreachable: fall through to the local counter rather than failing open.
  }

  const now = Date.now();
  const entry = local.get(key);
  if (!entry || entry.resetAt < now) {
    local.set(key, { n: 1, resetAt: now + ttlSeconds * 1000 });
    return 1;
  }
  entry.n++;
  return entry.n;
}

export interface Budget {
  /** Requests per IP per minute. */
  perMinute: number;
  /** Requests per IP per day. */
  perDay: number;
  /** Requests across all visitors per day — the actual spend ceiling. */
  globalPerDay: number;
}

/** Returns null when allowed, or the response to send when over budget. */
export async function overBudget(
  scope: string,
  req: Request,
  origin: string | null,
  budget: Budget,
): Promise<Response | null> {
  const ip = clientIp(req);
  const now = Date.now();
  const minute = Math.floor(now / 60_000);
  const day = new Date(now).toISOString().slice(0, 10);

  const [perMinute, perDay, global] = await Promise.all([
    bump(`rl:${scope}:m:${minute}:${ip}`, 120),
    bump(`rl:${scope}:d:${day}:${ip}`, 90_000),
    bump(`rl:${scope}:g:${day}`, 90_000),
  ]);

  if (perMinute > budget.perMinute) {
    return fail(
      "Slow down a moment — this site limits how fast one visitor can ask.",
      429,
      origin,
    );
  }
  if (perDay > budget.perDay) {
    return fail(
      "You have reached today's question limit for this site. It comes back tomorrow; the résumé link is always there.",
      429,
      origin,
    );
  }
  if (global > budget.globalPerDay) {
    return fail(
      "The site has spent today's budget for the agent. Try tomorrow, or read the résumé linked in the header.",
      429,
      origin,
    );
  }
  return null;
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
