---
title: Animated explainers — the three arXiv papers
kind: profile
---

Ziyang made a set of short animated diagrams for his interview presentation. Each one explains
one piece of his research in under half a minute, with illustrative values. They live on this site,
so they can be embedded in an answer exactly as written below, on their own line.

Use them. When an answer explains one of these topics, the matching animation explains it
better than a paragraph does. Embed one, or two at most, and keep the prose short around it.

## Committed SAE-feature traces: the problem

From outside a hosted API you cannot tell which model answered. A provider that sells the big
model can route some requests to a cheap one, and every answer still looks right.

![The problem: same answers, different model](/demos/sae-problem.gif)

## Committed SAE-feature traces: what an SAE is

A sparse autoencoder turns a model's dense hidden state into a very wide, almost all-zero vector
of features, where one feature can mean one concept: the same "capital city" feature lights up
for Tokyo and for Paris.

![An SAE turns a hidden state into sparse features](/demos/sae-features.gif)

The model's weights stay frozen; the SAE is trained separately on its hidden states. Published
SAEs exist, such as Gemma Scope from Google DeepMind. The protocol uses only the encoder.

![How an SAE is trained](/demos/sae-training.gif)

## Committed SAE-feature traces: the protocol, in three steps

Step 1, the provider fingerprints every answer: at each position it runs the public SAE encoder
on the hidden state, keeps the top features, hashes them, and commits to a Merkle root that goes
back with the answer. Changing any stored feature later changes the root.

![Step 1: the provider fingerprints every answer](/demos/sae-step1-fingerprint.gif)

Step 2, the verifier prepares a reference by running the real model on the same input.

![Step 2: the verifier prepares the reference](/demos/sae-step2-reference.gif)

Step 3, the audit compares the provider's features with the reference. Small gaps are noise. A
cheaper model gives gaps far over the limit, and is rejected.

![Step 3: same features or not](/demos/sae-step3-audit.gif)

## Copy-as-Decode: how an LLM reads and writes

Prefill reads the whole prompt in one forward pass; decode writes one token per pass, so a long
answer is slow. Every token adds its keys and values to the KV cache.

![Prefill: many tokens in one pass; decode: one token per pass](/demos/cad-read-write.gif)

## Copy-as-Decode: speculative decoding and copying

Speculative decoding guesses tokens with a small model and lets the big model accept or reject
them. Copy-as-Decode guesses from the input file instead: the model names a line range to copy,
and those tokens go into the KV cache in one parallel pass, accepted by construction.

![Speculative decoding beside copy-as-decode](/demos/cad-speculative.gif)

## Copy-as-Decode: an edited file

Editing a five-line file to add a 10% tax: a normal model writes every token, 20 passes;
copy-as-decode copies lines 1 to 3 and line 5 and writes only line 4, 10 passes. In real edits
74 to 98% of the text is copied.

![Same edited file: 10 passes instead of 20](/demos/cad-edit-example.gif)

## Cooperative memory paging: pages, bookmarks and recall

A long conversation is split into pages. Old pages leave the context window and are replaced by
short keyword bookmarks, while the full pages stay in an external store.

![Pages, bookmarks and an external store](/demos/paging-method.gif)

When a new question needs an old page, the model sees its bookmark and recalls the page: here,
"book dinner tonight" brings back "allergic to peanuts", so the answer is safe.

![The model recalls a page and answers safely](/demos/paging-recall.gif)
