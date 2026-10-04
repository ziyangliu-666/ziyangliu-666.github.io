/* Prints the questions visitors have asked, newest first, from the list the proxy keeps in
 * Redis (see logAsk in api/_lib.ts).
 *
 *   npm run env:pull        once, to fetch the production Redis credentials into .env.local
 *   npm run asks            the latest 50
 *   npm run asks -- 500     the latest 500
 *   npm run asks -- all     everything kept (up to 10,000)
 *   npm run asks -- 50 --json   raw JSON lines, for piping
 *
 * .env.local is git-ignored. It holds production secrets, so it stays on this machine.
 */

// The Marketplace names (KV_*) or the hand-made ones (UPSTASH_REDIS_*), as in api/_lib.ts.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
// Reading needs no write access, so the read-only token is preferred when it is there.
const token =
  process.env.KV_REST_API_READ_ONLY_TOKEN ??
  process.env.UPSTASH_REDIS_REST_TOKEN ??
  process.env.KV_REST_API_TOKEN;
if (!url || !token) {
  console.error("No Redis credentials. Run `npm run env:pull` in proxy/ first.");
  process.exit(1);
}

const args = process.argv.slice(2);
const json = args.includes("--json");
const countArg = args.find((a) => a !== "--json") ?? "50";
const stop = countArg === "all" ? -1 : Math.max(1, Number(countArg) || 50) - 1;

const res = await fetch(`${url}/lrange/log:asks/0/${stop}`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`Redis returned ${res.status}: ${await res.text()}`);
  process.exit(1);
}
const { result } = await res.json();
const rows = (result ?? []).map((line) => {
  try {
    return JSON.parse(line);
  } catch {
    return { q: line };
  }
});

if (json) {
  for (const r of rows) console.log(JSON.stringify(r));
} else {
  for (const r of rows) {
    const at = (r.at ?? "").replace("T", " ").slice(0, 16);
    const who = `${r.visitor ?? "?"} ${r.country ?? "--"}`;
    const turn = r.turn > 1 ? ` (follow-up ${r.turn})` : "";
    console.log(`${at}  ${who}  ${r.q ?? ""}${turn}`);
  }
  const people = new Set(rows.map((r) => r.visitor)).size;
  console.log(`\n${rows.length} questions from ${people} visitors.`);
}
