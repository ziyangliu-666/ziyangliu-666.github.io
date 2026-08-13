# Ziyang Agent proxy

Three edge functions. They hold the API keys and nothing else — no agent loop, no corpus,
no state. The agent runs in the visitor's browser; this exists because a GitHub Pages
bundle is public and a key inside it would be extracted and drained.

| Route | Does | Needs |
|---|---|---|
| `POST /api/chat` | Validates the request, adds the DeepSeek key, streams SSE back | `DEEPSEEK_API_KEY` |
| `POST /api/search` | Web search via Tavily, normalised to `{results:[{title,url,content}]}` | `TAVILY_API_KEY` (optional) |
| `POST /api/fetch` | One page as readable text | — |

## Guards

- **Origin allowlist.** A browser always sends `Origin` on a cross-origin POST; a missing
  or foreign one is a 403. Set `ALLOWED_ORIGINS`; `localhost:5173` is always allowed.
- **Strict body schema on `/api/chat`.** Model must be one of two DeepSeek ids, tools must
  be the six the site ships, `max_tokens` ≤ 2000, ≤ 48 messages, ≤ 220k characters total,
  unknown top-level fields rejected. This is what stops the endpoint being a free DeepSeek
  relay for whoever finds the URL.
- **Rate limits.** Per-IP per-minute and per-day, plus a daily ceiling across all visitors
  — that last one is the spend cap. Backed by Upstash Redis when configured, otherwise a
  per-isolate counter (weaker: it resets with each new isolate).
- **SSRF fence on `/api/fetch`.** http(s) only; loopback, link-local, private and
  cloud-metadata hosts refused; redirects followed manually and re-checked at each hop;
  10s timeout; 500KB cap. The residual gap is DNS rebinding, which an edge runtime cannot
  check — see the comment at the top of `api/fetch.ts`.

## Deploy

```sh
npm i -g vercel
cd proxy
vercel login
vercel link                 # create a new project, root directory = this folder
vercel env add DEEPSEEK_API_KEY production
vercel env add ALLOWED_ORIGINS production      # https://ziyangliu-666.github.io
vercel env add TAVILY_API_KEY production       # optional
vercel deploy --prod
```

Then put the deployment URL into the site build as `VITE_AGENT_PROXY_URL` (a repository
variable in GitHub Actions, and `.env.local` for local development). The URL is public by
design; the keys it holds are not.

## Local

```sh
cp .env.example .env.local   # fill in DEEPSEEK_API_KEY
vercel dev                   # serves on :3000
```

With `VITE_AGENT_PROXY_URL=http://localhost:3000` in the site's `.env.local`, the site
talks to the local proxy.

## Checking it

```sh
P=https://your-proxy.vercel.app

# 403 — no Origin header
curl -s -o /dev/null -w '%{http_code}\n' -X POST $P/api/chat -d '{}'

# 400 — model not on the allowlist
curl -s -X POST $P/api/chat -H 'content-type: application/json' \
  -H 'origin: https://ziyangliu-666.github.io' \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"hi"}],"stream":true,"max_tokens":10}'

# 400 — SSRF attempt
curl -s -X POST $P/api/fetch -H 'content-type: application/json' \
  -H 'origin: https://ziyangliu-666.github.io' \
  -d '{"url":"http://169.254.169.254/latest/meta-data/"}'
```
