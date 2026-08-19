---
title: Exfer — proof-of-work chain and in-wallet agent
kind: project
url: https://exfer.info
---

Exfer (May 2026 – August 2026, full-stack engineer, [exfer.info](https://exfer.info))
is a proof-of-work chain for machine-to-machine payments, built with one other developer,
plus the wallets and the in-wallet agent on top of it.

**The code is on GitHub under [exfer-stack](https://github.com/exfer-stack), which is
Ziyang's own second account** — not a third party, not a dependency he happened to use.
Everything under that account is his work on this project: `exfer-walletd` (the Rust signing
daemon), `exfer-walletd-desktop` and `exfer-walletd-mobile` (the apps), `exfer-mcp` (the MCP
server the agent spends through), `exfer-py` (the typed client), `exfer-indexer` (query an
address without running a node), `exfer-honor` (release goods against a signed quote),
`exfer-agent-miner`, and `get` (the installer). The chain itself is `exfer`, where the
upstream pull requests landed. The documentation at exfer.info is the project's own. The transaction fee is fixed in
the protocol rather than set by a fee market, because the payer is a machine that needs a
predictable price. It has been live 90+ days with 550+ nodes across 28 countries, 180+
miners, and 1.36 MH/s of hash rate.

## Agent harness

The in-wallet agent is built as a headless core: **one loop** driving desktop, mobile and
CI alike, tested against a scripted model so the harness can be tested without spending
tokens on a real one.

The wallet's own tools are published as an MCP server on PyPI — about 40 tools across
14 modules. Every call is classified as **silent**, **consent-gated**, or **background**,
and the gate lives in the harness rather than inside each tool. That placement is the
point: a tool cannot forget to ask, and adding a tool cannot accidentally add an
unguarded spend path.

There is a spawn tool for read-only research sub-agents. Third-party MCP servers are kept
read-only, and payment requests coming from them are handed to the native gated transfer
rather than executed — an untrusted server can ask for money and never move it.

## Chain internals

26 pull requests landed upstream, in Rust, across consensus, storage and P2P. He opened 30 in
total: 26 merged, 2 still drafts, 2 closed without merging.

- Persisted the UTXO set to redb and added a reverse-spend index.
- Fixed a double-open in the atomic reorg commit.
- Cleared 8 bugs behind an inflated orphan rate.
- Cut cold-start bootstrap from about 37 minutes to about 1 minute.

## Atomic swap

SHA-256 HTLCs on both chains rather than keccak, one preimage covering both legs, with
the locks ordered user-first on the long timeout so the counterparty can never strand the
user's funds. 938 swaps have settled on mainnet.

## Wallets

Desktop and mobile apps, both embedding the signing daemon. Signing is split into its own
service behind them, and the indexer is reorg-aware across every address and HTLC —
a reorg that rewrites history must not leave the wallet showing money that no longer exists.
