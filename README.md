# ziyangliu-666.github.io

An agent that answers questions about Ziyang Liu. The harness runs in the visitor's
browser: the tool-calling loop, the retrieval, the sub-agents and the event stream all
execute in the tab. The page is a static bundle on GitHub Pages — there is no application
server.

One thing cannot run in the browser: the model API key. A public bundle is readable, so a
key inside it would be extracted. `proxy/` is three edge functions that hold the keys and
nothing else.

The previous Next.js site for this domain is preserved on the `archive/nextjs-site` branch
and tagged `v0-nextjs`.

## Layout

```
src/ui/          The interface, ported from the Claude Design project. Renders events.
src/agent/       The harness: provider, loop, tools, prompts, event contract.
src/rag/         BM25 retrieval over the prebuilt corpus, and its tokenizer.
scripts/         Corpus builder and a retrieval debugger.
corpus/src/      Hand-written profile notes that go into the corpus.
content/blog/    Ziyang's posts. No pages any more; they are corpus material.
public/corpus/   Build output: the index and one JSON per document. Committed.
proxy/           Vercel edge functions holding the DeepSeek and Tavily keys.
```

The seam between the interface and everything else is `src/agent/events.ts`: fourteen
event types, defined by the design. The UI renders that stream and owns no timing. Swap
the transport and the UI does not change — which is how the offline fallback and the live
harness share one component.

## Develop

```sh
npm install
npm run dev            # http://localhost:5173
```

With no model configured the site uses the offline transport: a handful of canned answers,
labelled as such. To talk to a real model, either point at a proxy —

```sh
echo 'VITE_AGENT_PROXY_URL=https://your-proxy.vercel.app' > .env.local
```

— or paste a DeepSeek key once in the browser console, which stores it in localStorage on
your machine only:

```js
ziyangAgentKey("sk-…")
```

## The corpus

Built locally, committed, never built in CI — its sources are the résumé and paper PDFs,
which live outside the repository.

```sh
npm run corpus                                    # rebuild the index
npx tsx scripts/query-corpus.ts --self-test       # retrieval assertions
npx tsx scripts/query-corpus.ts "transfer throughput"
```

Sources, and the rule for each, are declared at the top of `scripts/build-corpus.ts`. Two
of them are load-bearing rather than incidental:

- The **three arXiv preprints** are indexed in full. They are public.
- The **two under-review submissions** contribute a title and one line each, hand-written
  in `corpus/src/research.md`. Their PDFs are never read, and the two GitHub repositories
  holding their anonymised artifacts are on a denylist in both the builder and the runtime
  `github_activity` tool. Naming the author of an anonymous submission is a real harm to a
  real submission. `npm run corpus` fails if either rule is violated.

## Deploy

The site deploys on push to `main` (`.github/workflows/deploy.yml`). The proxy is a
separate Vercel project — see `proxy/README.md`. Its URL goes into the repository variable
`AGENT_PROXY_URL`; without it the deployed site falls back to the offline transport rather
than erroring.

## Design source

The interface came from a Claude Design project, `Ziyang Agent.dc.html`. `src/ui/agent.css`
carries its values; if the design changes, change them there rather than by eye.
