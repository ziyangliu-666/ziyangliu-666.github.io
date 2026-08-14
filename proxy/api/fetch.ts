/* POST /api/fetch — read one public web page as text.
 *
 * A fetch endpoint that takes a URL from a caller is a server-side request forgery tool
 * unless it is fenced. The fence here: http(s) only, a denylist of loopback / link-local /
 * private / cloud-metadata hosts, redirects followed manually and re-checked at every hop,
 * a hard timeout, and a byte cap.
 *
 * Residual risk, stated rather than hidden: the Edge runtime cannot resolve DNS, so a
 * public hostname that resolves to a private address (DNS rebinding) is not caught by a
 * hostname check. The runtime has no VPC attachment and no credentials of its own beyond
 * the two API keys, so the reachable blast radius is "the public internet, which the
 * caller's own browser can already reach".
 */

import { fail, guard, json, overBudget, readJson } from "./_lib";

export const config = { runtime: "edge" };

const MAX_BYTES = 500_000;
const MAX_TEXT = 40_000;
const MAX_HOPS = 3;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    return true;
  }

  // IPv6 loopback and unique-local / link-local.
  if (host === "::1" || host === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;

  // IPv4 literals, including the ranges that reach a cloud provider's own metadata.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true; // link-local, AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
  }

  return false;
}

function checkUrl(raw: string): { url: URL } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "not a valid URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "only http and https URLs can be fetched" };
  }
  if (isPrivateHost(url.hostname)) {
    return { error: "that host is not reachable from here" };
  }
  return { url };
}

/** Follow redirects ourselves so every hop gets the same host check. */
async function fetchChecked(start: URL): Promise<Response> {
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const res = await fetch(url.toString(), {
      redirect: "manual",
      headers: {
        // Identify the caller honestly. A site that does not want an agent reading it
        // should be able to see who is asking.
        "user-agent":
          "ZiyangAgent/1.0 (+https://ziy.bio) reader on behalf of a visitor",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      const next = checkUrl(new URL(location, url).toString());
      if ("error" in next) throw new Error(`redirect blocked: ${next.error}`);
      url = next.url;
      continue;
    }
    return res;
  }
  throw new Error("too many redirects");
}

function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]{0,300}?)<\/title>/i.exec(html);
  const title = titleMatch ? decode(titleMatch[1]!).trim() : "";

  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();

  return { title, text: text.slice(0, MAX_TEXT) };
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

export default async function handler(req: Request): Promise<Response> {
  const gate = guard(req);
  if (gate instanceof Response) return gate;
  const { origin } = gate;

  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "invalid JSON", 400, origin);
  }

  const checked = checkUrl(typeof body.url === "string" ? body.url : "");
  if ("error" in checked) return fail(checked.error, 400, origin);

  const limited = await overBudget("fetch", req, origin, {
    perMinute: 12,
    perDay: 80,
    globalPerDay: Number(process.env.FETCH_GLOBAL_DAILY ?? 600),
  });
  if (limited) return limited;

  let res: Response;
  try {
    res = await fetchChecked(checked.url);
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "could not fetch that page",
      502,
      origin,
    );
  }

  if (!res.ok) {
    return fail(`that page returned ${res.status}`, res.status >= 500 ? 502 : 400, origin);
  }

  const type = res.headers.get("content-type") ?? "";
  if (!/text\/|json|xml/i.test(type)) {
    return fail(`that URL is ${type || "not text"}, so there is nothing to read`, 415, origin);
  }

  const raw = await readCapped(res);
  const { title, text } = /html/i.test(type)
    ? htmlToText(raw)
    : { title: "", text: raw.slice(0, MAX_TEXT) };

  return json(
    { url: checked.url.toString(), title, text, truncated: raw.length >= MAX_BYTES },
    200,
    origin,
  );
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (bytes >= MAX_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return out;
}
