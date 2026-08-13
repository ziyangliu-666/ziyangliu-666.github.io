---
title: Who Ziyang Liu is
kind: profile
---

## The short version

Ziyang Liu (刘子阳) is a software engineer who spent three years on production
virtualization at SmartX, then moved into LLM systems research. He is based in
Singapore, where he started an M.Tech. in Software Engineering at the National
University of Singapore in August 2026. Before that he took a B.Eng. in Software
Engineering at the University of Electronic Science and Technology of China,
in Chengdu, graduating June 2024.

He is reachable at ziyang.liu.r@outlook.com, on GitHub as
[ziyangliu-666](https://github.com/ziyangliu-666), and on
[LinkedIn](https://www.linkedin.com/in/ziyangliu666).

He publishes from two GitHub accounts, both his own:
[ziyangliu-666](https://github.com/ziyangliu-666) for personal work, and
[exfer-stack](https://github.com/exfer-stack) for the Exfer project — the chain, the
wallets, the daemon, the MCP server, the indexer.

## The through-line

Systems work under a correctness constraint. At SmartX he owned V2V OS, the product
that moves virtual machines off VMware onto SMTX OS — 10,000+ production VMs migrated,
including core financial workloads, which is the kind of deployment where a silent data
corruption is a company-ending event rather than a bug report. The work that follows
from that constraint is unglamorous and specific: idempotent transfer, block-by-block
verification that never blocks switchover, process isolation so one library version
cannot take down a migration, and root-causing guest kernel defects with strace when
the guest is the thing that is broken.

The research he moved into carries the same shape. Cooperative memory paging asks what
an LLM actually does when information is missing from its context, and answers it with a
measurement rather than an assumption (it does not reliably signal the gap, and it answers
more confidently without the missing fact). Committed SAE-feature traces make a hosted
model provider prove it served the model it advertised. Copy-as-decode makes an editing
model reference input lines instead of re-emitting them, with a grammar that guarantees
the reference is valid. In each case the interesting part is the guarantee, not the demo.

## Timeline

| When | What |
|---|---|
| Aug 2026 – present | M.Tech. in Software Engineering, National University of Singapore |
| May 2026 – Aug 2026 | Exfer — full-stack engineer, proof-of-work chain and in-wallet agent |
| Sep 2025 – Aug 2026 | HKUST (Guangzhou) — researcher, LLM systems: agent memory, decoding, interpretability |
| Jul 2024 – Sep 2025 | SmartX — Virtualization R&D Engineer, Chengdu |
| Oct 2022 – Jul 2024 | SmartX — Virtualization R&D Intern, Chengdu |
| Sep 2020 – Jun 2024 | B.Eng. Software Engineering, UESTC, Chengdu |
| Jun 2022 – Sep 2022 | ByteDance (Feishu) — Systems Integration Development Intern, Chengdu |

## Languages he writes

Python, Rust, Go, C, TypeScript, Shell. Chinese and English.
