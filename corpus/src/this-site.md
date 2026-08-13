---
title: How this site works
kind: profile
---

Visitors ask this, and the honest answer is a fair sample of how Ziyang builds things,
so it is worth answering precisely.

The agent you are talking to runs **in your browser**. Not the UI around a server-side
agent — the harness itself: the tool-calling loop, the retrieval, the sub-agent spawning,
and the event stream this interface renders all execute in your tab. The page is a static
bundle on GitHub Pages; there is no application server.

One thing cannot live in your browser: the model API key. A public bundle is readable by
anyone, so a key inside it would be extracted and drained. A single edge function holds
the key and does three things — forward a chat completion to DeepSeek, run a web search,
and fetch a URL — while validating that the request is one this site could plausibly have
made. It is a keyholder, not the agent.

**Retrieval.** The corpus is built ahead of time from his résumé (English and Chinese),
his arXiv preprints, and his own GitHub repositories and pull requests, chunked and indexed
into BM25. The index ships as a JSON file the page fetches on the first question. There
is no vector database and no embedding call at query time: on a corpus this size, lexical
retrieval with the model reformulating its own queries is both cheaper and easier to
debug than a similarity score nobody can read. The tokenizer emits Chinese unigrams and
bigrams, so the Chinese résumé is retrievable rather than one enormous token.

**Tools.** `retrieve` (BM25 over the corpus), `read_document` (a whole section),
`web_search` and `fetch_url` (through the edge function), `github_activity` (the public
GitHub API, straight from the browser, no key), and `spawn_subagent` — a nested loop with
retrieval-only tools for reading in parallel without filling the main context window.

**What you can see.** Every reasoning step, tool call, argument and result is in the
collapsed activity line above each answer. Open it. The interface reports what the agent
did rather than asserting that it worked, which is the same reason the migration checker
in V2V OS compares disks block by block instead of trusting that the transfer said OK.

The design of this interface came from Claude's design tool; the harness behind it was
written for this site.
