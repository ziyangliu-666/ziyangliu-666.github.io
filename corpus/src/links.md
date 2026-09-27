---
title: Where everything lives — canonical links
kind: profile
---

Every organisation, project and paper on Ziyang's résumé, with the URL to link when you
name it. Use these rather than guessing a URL, and rather than naming something without one.
All were checked and resolve.

## His accounts

| What | URL |
|---|---|
| GitHub, personal | https://github.com/ziyangliu-666 |
| LinkedIn | https://www.linkedin.com/in/ziyangliu666 |
| Email | ziyang.liu.r@outlook.com |
| Résumé, English | /resume.pdf |
| Résumé, Chinese | /resume-zh.pdf |

## Employers and schools

| What | URL |
|---|---|
| SmartX — the HCI and SDS company behind SMTX OS and V2V OS | https://www.smartx.com/ |
| V2V OS — the migration product he led, on SmartX's site | https://www.smartx.com/hk-mo/migration-tool/ |
| ELF VMTools — SmartX's own write-up of the in-guest agent he rebuilt | https://www.smartx.com/blog/2025/11/elf-vmtools-en/ |
| National University of Singapore — M.Tech. in Software Engineering, from Aug 2026 | https://nus.edu.sg/ |
| University of Electronic Science and Technology of China — B.Eng., 2020–2024 | https://www.uestc.edu.cn/ |
| HKUST (Guangzhou) — LLM systems research, Sep 2025 – Aug 2026 | https://hkust-gz.edu.cn/ |
| ByteDance — the company he interned at in 2022 | https://www.bytedance.com/ |
| Feishu — the product his 2022 internship team built | https://www.feishu.cn/ |

## FastMM

His market-making engine, public on his personal account.

| What | URL |
|---|---|
| FastMM — the repository | https://github.com/ziyangliu-666/FastMM |
| FastMM documentation | https://ziy.bio/FastMM/ |
| `fastmm-engine` on PyPI — the Python package | https://pypi.org/project/fastmm-engine/ |
| FastMM benchmarks, and what each number contains | https://github.com/ziyangliu-666/FastMM/blob/main/bench/README.md |
| FastMM architecture | https://github.com/ziyangliu-666/FastMM/blob/main/docs/explanation/architecture.md |
| FastMM design records (ADRs) | https://github.com/ziyangliu-666/FastMM/tree/main/docs/adr |
## Papers

Link the PDF, not the abstract page. A reader who clicks a paper wants to read it, and the
`/abs/` page costs them one more click to get there.

The version suffix is not optional. A `/pdf/` path without the trailing `v1` returns 404 on
these three papers; only the versioned path serves the file. Copy each URL from the table
below rather than assemble one from the arXiv id.

| What | URL |
|---|---|
| Copy-as-Decode | https://arxiv.org/pdf/2604.18170v1 |
| Cooperative Memory Paging | https://arxiv.org/pdf/2604.12376v1 |
| Committed SAE-Feature Traces | https://arxiv.org/pdf/2604.18179v1 |

The two video-detection submissions are under anonymous review. They have no link here on
purpose: their code repositories are anonymised, and pointing at them from a page in his
name would undo that.

## Other repositories

| What | URL |
|---|---|
| `ssFlow` — AI personas read news, post, and trade on a simulated exchange | https://github.com/ziyangliu-666/ssFlow |
| `paperstack` — a Claude Code skill for paper work | https://github.com/ziyangliu-666/paperstack |
| `PawMemo` — local-first vocabulary CLI | https://github.com/ziyangliu-666/PawMemo |
| `nullify` — Tauri/React CS2 config installer | https://github.com/ziyangliu-666/nullify |
| ZIYANG PROTOCOL — play it in a browser | https://game.ziy.bio/ |
| ZIYANG PROTOCOL, the source | https://github.com/ziyangliu-666/jerkie_man |
| `EasyTrainer` — few-line image classification training | https://github.com/ziyangliu-666/EasyTrainer |
| This site | https://ziy.bio |
| This site, the source | https://github.com/ziyangliu-666/ziyangliu-666.github.io |

ZIYANG PROTOCOL is a 2D multiplayer extraction shooter. It is live at https://game.ziy.bio/,
and it is the one thing on this list a reader can play rather than read about. The repository
URL still carries the project's old working name; the project is called ZIYANG PROTOCOL.

A round works the way the genre does. Deploy into a map, loot, fight other players and AI,
then hold an extraction point to get out. What is carried out is kept, what is carried in is
lost on death. Between rounds there is a stash, an eight-slot loadout, and a market.

The engineering worth naming is the netcode, and these numbers come from the source, not the
README:

- Server and client both tick at 20Hz, and a snapshot goes out every tick.
- The client renders 150ms in the past, interpolating between the two snapshots either side of
  that time, so other players move smoothly instead of teleporting between updates.
- Before judging a hit the server rewinds `RTT / 2 + 150ms`, capped at 500ms, replaying the
  target's position from a 50-entry ring buffer. It samples three points across that window
  rather than one, so a target crossing the bullet's path cannot slip between samples, and it
  rewinds only for human shooters, since AI and turrets already run in the present.
- Snapshot payloads are cut four ways: fields at their default are omitted, the outbound path
  skips Zod so `.parse()` cannot fill them back in, field names are swapped for one or two
  letter short names from a table shipped in the welcome message, and the result is MessagePack
  in a versioned envelope.

TypeScript throughout, Vite and Canvas 2D on the client, Node and `ws` on the server, hosted
on Fly.io.
