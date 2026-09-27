---
title: Who Ziyang Liu is
kind: profile
---

## The short version

Ziyang Liu (刘子阳) is a software engineer who spent three years on production
virtualization at SmartX, then moved into LLM systems research. He is based in
Singapore, where he started a one-year M.Tech. in Software Engineering at the National
University of Singapore in August 2026. Since September 2026 he has also been building
[FastMM](https://github.com/ziyangliu-666/FastMM), a market-making engine in C++20. He
expects to finish the degree around late August or September 2027. Before that he took a B.Eng. in Software Engineering at the University of
Electronic Science and Technology of China, in Chengdu, graduating June 2024.

He is reachable at ziyang.liu.r@outlook.com, on GitHub as
[ziyangliu-666](https://github.com/ziyangliu-666), and on
[LinkedIn](https://www.linkedin.com/in/ziyangliu666).

His own work, FastMM included, is on GitHub under
[ziyangliu-666](https://github.com/ziyangliu-666).

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

FastMM, the trading engine he builds now, has the same shape. A replay of a recorded session
must send byte-identical orders, and a SHA-256 of both outbound streams checks it. Each
benchmark says what is inside its timed region and what machine ran it. When he found that his
headline latency figure was mostly the benchmark measuring itself, he fixed the benchmark and
published the smaller, honest number.

## Timeline

| When | What |
|---|---|
| Aug 2026 – Aug 2027 | M.Tech. in Software Engineering, National University of Singapore |
| Mar 2027 – Jul 2027 | NUS internship placement, 20 weeks — the degree's capstone |
| Sep 2026 – now | FastMM — author, market-making engine in C++20 |
| Sep 2025 – Aug 2026 | HKUST (Guangzhou) — researcher, LLM systems: agent memory, decoding, interpretability |
| Jul 2024 – Sep 2025 | SmartX — Virtualization R&D Engineer, Chengdu |
| Oct 2022 – Jul 2024 | SmartX — Virtualization R&D Intern, Chengdu |
| Sep 2020 – Jun 2024 | B.Eng. Software Engineering, UESTC, Chengdu |
| Jun 2022 – Sep 2022 | ByteDance (Feishu) — Systems Integration Development Intern, Chengdu |

## When he is available

The M.Tech. is full-time and one year long. Classes run on weekdays, and the degree has a
placement built into it.

| What | When |
|---|---|
| First day of class | 17 August 2026 |
| Coursework, first block | August to November 2026 |
| Coursework, second block | January to March 2027 |
| **Internship placement, 20 weeks** | **March to July or August 2027** |
| Finishes | about late August or September 2027 |

The internship is the capstone of the degree, not an optional extra. NUS-ISS collects
project proposals from industry between September 2026 and January 2027, and students are
encouraged to bring their own. Both an NUS-ISS supervisor and a supervisor at the host
company grade it, and he cannot graduate without passing it.

So he is looking for a placement that starts in March 2027 and runs 20 weeks, and the
proposal for it has to be agreed by January 2027. Before March he is in coursework: the
University expects at least 40 hours of study a week during those blocks and discourages
outside employment, so March 2027 is the first date he can start.

His résumé gives the end date as August 2027, marked expected. It is expected rather than
fixed because NUS publishes no graduation date for the cohort and the capstone can be extended
by three to six months.

Degree structure, 50 to 51 units: two compulsory Graduate Certificates, two chosen from
five, and the capstone.

| Part | Certificate |
|---|---|
| Compulsory | Designing Modern Software Systems (SWE5006) |
| Compulsory | Architecting Scalable Systems (SWE5001) |
| Choose one | Designing and Managing Products and Platforms, Securing Ubiquitous Systems, or Architecting AI Systems |
| Choose one | Engineering Big Data, or Architecting AI Systems |
| Compulsory | Capstone Project in Software Engineering (SWE5007) |

The courses that sit closest to what he already does: Architecting Agentic AI Solutions,
Integrating and Deploying AI Solutions, Explainable and Responsible AI, Platform
Engineering, Cloud Native Solution Design, DevSecOps Engineering and Automation, and
Architecting Systems for Real-Time Data Processing.

## Languages he writes

His résumé lists C, Python, Rust, Go and Shell. FastMM adds C++20: the engine is written in
it, with Python for strategies and tooling. The résumé also leaves out TypeScript, which he
writes too: this site, ZIYANG PROTOCOL, PawMemo and nullify are all TypeScript. Chinese and English.

## What else the résumé lists under skills

Beyond the languages, in his own grouping:

| Area | What |
|---|---|
| Networking | TCP/UDP, epoll, DNS, iSCSI/NFS, tcpdump |
| Linux and UNIX | process model, memory management, boot and initramfs, syscall debugging, strace, perf, gdb |
| LLM and agents | agent routing, memory tiering, retrieval and reranking, ReAct, MCP, KV cache |
| Distributed systems | CAP and PACELC, Raft, quorum, replication and erasure coding, consistency models, idempotency |
| Virtualisation | QEMU/KVM, libvirt, Virtio, QGA, VDDK, live migration |
| CI and CD | GitHub Actions, Jenkins, Docker, RPM and DEB packaging, Packer |
| Databases | MySQL, Redis, MongoDB, SQLite, redb |
