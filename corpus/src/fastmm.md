---
title: FastMM — a market-making engine in C++20
kind: project
url: https://github.com/ziyangliu-666/FastMM
---

FastMM ([GitHub](https://github.com/ziyangliu-666/FastMM),
[documentation](https://ziy.bio/FastMM/)) is a market-making engine in C++20. Ziyang is its
author. It is his current project, next to the M.Tech. at NUS.

Backtests, replay and live trading run the same strategy code. Strategies are written in
C++ or in Python. Every session is recorded, and a replay of a recording sends the same
orders again, byte for byte. Orders pass pre-trade risk checks before they leave, and the
loss limit trips a kill switch that pulls every quote.

Version 0.2.0 was released on 23 September 2026. It installs without a build:

- Python: `pip install "fastmm-engine[hot]"` from [PyPI](https://pypi.org/project/fastmm-engine/), wheels for CPython 3.9 to 3.14 on Linux x86-64. The Numba hot hooks need CPython 3.10 or later.
- The C++ programs: a release tarball on GitHub, and the container image `ghcr.io/ziyangliu-666/fastmm`.

Size, counted on 2026-09-24: about 93,000 lines of C++ in `src/` and `include/`, and about
49,000 lines of tests. On 2026-09-23 the default build ran 887 tests, and 955 with every optional codec on. Sixteen design records (ADRs) in
`docs/adr/` give the reason for each large decision.

## The engine

The engine is one template, `Engine<Strategy, Clock, Transport, Feed>`. A live session, a
backtest and a replay use the same engine with different parts:

| Mode | Clock | Feed | Transport |
|---|---|---|---|
| Live | `TscClock` (rdtsc anchored to wall time) | SPSC rings from the network threads | `LiveTransport` |
| Backtest | `SimClock` (virtual time) | in-process events | `SimTransport`: a matching engine and a seeded latency model |
| Replay | `SimClock` | a recorded journal | `ReplayTransport` |

The strategy is a template parameter too. Strategies use CRTP, so the trading thread makes no
virtual calls (ADR-0009).

Hot-path rules, and how each one is enforced:

- The trading thread allocates no memory after warm-up. Thirteen test files link a global
  `operator new` that counts calls, and fail on any allocation.
- Hot functions return a result type and throw no exceptions (ADR-0002).
- Prices and quantities are `int64` fixed point at a 1e-8 scale. Products go through
  `__int128`. There is no `double` in price arithmetic (ADR-0001).
- Every message between threads is trivially copyable.

Two threading modes:

- `split`, the default: one network thread per venue and one pinned, busy-spinning engine
  thread, joined by single-producer single-consumer rings.
- `single`: one venue's network loop, the engine and the order send all run on one thread.
  No event crosses a core between the packet read and the order write.

## Latency

All numbers below are p50 unless marked. None of them was measured on exchange hardware: the
machines were a WSL2 desktop and two cloud VMs.

| What | p50 | Where |
|---|---|---|
| Tick to order, the engine alone in simulation | 111 to 123 ns (p99 151 to 167 ns) | one pinned core, WSL2 desktop |
| Engine tick to trade, with real network I/O | 2.4 to 2.6 µs | two processes over a veth pair, WSL2 |
| Wire to wire: simulator sends market data, engine's order arrives back | 23.6 to 25.6 µs | same veth setup |
| Wire to wire between two hosts | 278.5 to 344.1 µs, depending on the backend | two Vultr VMs in one cloud VPC |

The tick-to-order figure covers one market-data update in: book update, strategy, quote
diff, risk checks, order state and serialisation of the outbound orders. It leaves out the
network, TLS, JSON and the venue. `bench/README.md` states this next to the number.

That figure used to read "about 1 microsecond". He found that the benchmark was measuring
itself: about 600 ns of the old figure was Google Benchmark's pause and resume timing, and
170 to 180 ns was a SHA-256 checksum that only the simulator computes. He moved the timing to
`rdtsc` around the timed region only, and took the checksum out of it. Real engine work
came first: running PnL totals replaced a loop over 256 positions in the loss check on every
event, and the engine step went from 9.2 µs to 2.9 µs.

The send path on the veth setup, wire to wire p50:

- 47.1 to 55.3 µs before: two `write` calls per order, one order after another, and an
  eventfd wake for each.
- 32.8 to 34.8 µs: one `write` for all orders of one drain of the outbound ring, and no
  eventfd wake when the network thread busy-polls.
- 23.6 to 25.6 µs after the OUCH encoder was fixed. OUCH encode went from 4.40 µs to about
  0.1 µs.

He also measured io_uring for the send. `IORING_OP_SEND` cost the same as `write`. SQPOLL
only moved the send to another core and did not shorten wire to wire, so the prototype was
not kept.

## Networking

He wrote the network stack himself (ADR-0007): an event loop, TLS through OpenSSL memory
BIOs, an RFC 6455 WebSocket client and an HTTP/1.1 client. The event loop has two backends,
epoll and io_uring. The io_uring backend uses the raw system calls, not liburing. On a
loopback TCP echo the two backends measured the same, about 12.8 µs round trip.

Market data for US equities arrives as Nasdaq TotalView-ITCH over UDP multicast
(ADR-0015):

- MoldUDP64 with A/B line arbitration, a reorder buffer, gap re-requests, and a GLIMPSE
  snapshot to join a feed mid-stream.
- An L3 order book per symbol, which feeds an L2 view to the strategies.
- He wrote the ITCH and OUCH 5.0 simulator, `fastmm-sim-itch`, that the engine is measured
  against.

Three receive backends deliver datagrams through one interface:

- `kernel`: batched `recvmmsg`, busy polling, and software and hardware receive timestamps.
  The hardware timestamp path is implemented but was never tested on a NIC that supports it.
- `af_xdp`: kernel bypass through AF_XDP, written on raw `bpf` system calls with no libbpf and
  no BPF compiler. The XDP program is BPF bytecode, assembled in C++. It parses Ethernet,
  VLAN, IPv4 and UDP and redirects only the feed's groups to the socket. Attach falls back
  from native zero-copy to native copy to generic mode. Its tests load the program through
  the kernel verifier and run it with `BPF_PROG_TEST_RUN`. The cloud VMs had no zero-copy
  support, so zero-copy mode was never measured.
- `dpdk`: optional, off by default, DPDK 25.11 built statically.

Orders to the Nasdaq simulator can also go out through `user_tcp`, an experimental TCP client
in user space, over AF_XDP or DPDK. It covers the RFC 9293 state machine, retransmission per
RFC 6298, fast retransmit and out-of-order reassembly. It has no SACK and no window scaling.
On the two cloud VMs it cut the host's send cost to a half or a third. The wire-to-wire
differences were inside the VPC's noise, and his own write-up says so.

## Determinism and the journal

The engine journals every event it consumes, with the engine clock. The journal format,
`.fmj`, is versioned. It holds the instruments, the effective config with the API keys
removed, and the strategy's parameters, then the events in blocks of at most 1 MiB. Each
block carries a CRC32C.

`fastmm-replay --verify` replays a journal and compares the SHA-256 of the recorded outbound
stream with the replayed one. It prints `replay MATCH`, or exits at the first difference.
Operator commands are journaled too, so a session that an operator changed by hand still
replays to the same hash.

## Risk

Seventeen pre-trade checks run on every new order and every replace. Among them:

- a price collar and a fat-finger check;
- maximum order size, order notional and position;
- portfolio limits on gross and net exposure, kept as running totals, so the check is two
  comparisons;
- self-trade prevention, and a token-bucket rate limit.

Cancels skip the checks. The checks measured 6.5 ns per order, before the two portfolio
checks were added.

The kill switch is one atomic word: one bit for the whole engine and one per venue. It trips
on the loss limit, on a full outbound or journal ring, and when every venue is down. A
`kill_file` makes the loss limit a budget for the whole deployment, not for one process: a
restart after a trip refuses to trade until an operator clears it.

## Running it

- **Recovery:** a store records every fill, order, position and kill event. The engine
  hands them to a separate thread through an allocation-free ring. SQLite is the first
  backend. After an outage of the private stream, the engine fetches the fills it missed and
  drops duplicates by execution id. On a restart it restores its position from the store, then
  replays the venue's fills since the last one it recorded. Both need a venue that can return
  past fills, and today only the Binance Spot connector can. Other venues start flat, with a
  warning.
- **Soak test:** a test breaks a live session in five ways, again and again: it drops order
  connections, answers with an HTTP 418 ban, and hides partial and complete fills. Then it
  checks that the position has not drifted.
- **Operator control:** `fastmm-ctl` talks to a running session over a Unix socket. It can
  pull quotes, change a parameter, kill, or flatten. To flatten, the engine sends
  reduce-only IOC orders on a journaled timer.
- **Venue-side safety:** cancel-on-disconnect is armed on Deribit and Binance USDⓈ-M, and is
  available on Bybit.
- **Monitoring:** `fastmm-top` shows a live session and serves a Prometheus `/metrics`
  endpoint. A finished run produces one self-contained HTML report.

## Venues and protocols

- Crypto: Binance Spot, Binance USDⓈ-M perpetuals, Bybit and Deribit, over the hand-written
  WebSocket and HTTP stack. The Binance connector can log on once with Ed25519, so each order
  skips its signature. It can also read SBE binary market data: a 20-level depth update
  decodes in 47.6 ns, against 623.5 ns for JSON.
- Equities: Nasdaq ITCH 5.0 market data and OUCH 4.2 and 5.0 order entry.
- Also in the code, behind build options: FIX 4.4, and CME MDP 3.0 generated from CME's SBE
  schema.

## Strategies in Python

A Python strategy marks its quoting hooks with `@fastmm.hot`. Numba compiles each hook to a
C function, and the engine thread calls it through a C ABI, without the GIL. Before a hook
is accepted, its LLVM IR is checked against an allowlist that rejects allocation and calls
into the Python runtime (ADR-0013).

Cost per `on_book` call, measured on one core:

| Hook | ns per call |
|---|---|
| The C++ reference strategy | 31.7 |
| The same strategy as a Python hot hook | 36.8 |

Slower model code runs as plain Python on another thread, and publishes parameter updates to
the hooks. `fastmm init my-mm` writes a starter project.

## Backtests and research

Backtests can read Binance's public market data, with the SHA-256 of each file checked. A
backtest reports markouts, fill quality and a PnL decomposition: spread captured, mid drift
after fills, fees and rebates.

He ran the shipped reference strategy on one day of Binance BTCUSDT perpetual (2024-03-27) at
the venue's standard fees. It lost 499.05 USDT on 12,529 fills: the markout was about −0.85
bps at 10 s, and fees were 351.13 USDT. His documentation states the conclusion plainly: the
shipped strategies are reference implementations of published quoting rules, not a trading
edge.

A research module measures a signal before a strategy is written around it. On the same day,
book imbalance predicted the next mid move with an information coefficient of 0.580 at
100 ms, falling to 0.060 at one minute.

Shipped strategies: a basic market maker, Avellaneda–Stoikov, and an options market maker
priced with Black-76.

## Performance work with measured results

| Change | Before | After |
|---|---|---|
| Binance order encode: precomputed HMAC key, bulk JSON appends | 1,440 ns | 522 ns |
| OUCH EnterOrder encode | 19.5 ns | 9.7 ns |
| Engine step: running PnL totals | 9.2 µs | 2.9 µs |
| Profile-guided optimisation, tick to order (with the simulator's checksum, as measured then) | 247 ns | 215 ns |

He also reports the results that did not help. PGO gave nothing measurable end to end, and
BOLT added nothing on top of it. clang 18 was 45% slower than gcc on the engine step.

## How the work is checked

- CI on every push: lint, clang-tidy, build and test, a Docker build, and the Python package.
- On a schedule: AddressSanitizer with UndefinedBehaviorSanitizer, ThreadSanitizer, and a
  clang build.
- A nightly benchmark run compares against CI budgets.
- `bench/README.md` says for each benchmark what is inside the timed region, which machine
  ran it, and what could not be controlled on that machine.
