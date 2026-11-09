---
title: FastMM — a market-making engine in C++20
kind: project
url: https://github.com/ziyangliu-666/FastMM
---

FastMM ([GitHub](https://github.com/ziyangliu-666/FastMM),
[documentation](https://ziy.bio/FastMM/)) is a low-latency market-making engine in C++20.
Ziyang is its author. It is his current project, next to the M.Tech. at NUS.

Backtests, replay and live trading run the same strategy code. Strategies are written in
C++ or in Python. Every session is recorded, and a replay of a recording sends the same
orders again, byte for byte. Orders pass pre-trade risk checks before they leave, and the
loss limit trips a kill switch that pulls every quote.

## Version

The current version, the latest release, is 0.13.0, released on 9 November 2026. This note
was checked against that release and its documentation site.

## Features

The features, as the README names them:

- Low latency: in simulation, the engine turns a book update into an order in 143 ns at p50.
- High-performance backtesting: a sweep runs all its points in one pass over the data.
- Cross-exchange market making.
- One strategy for backtest, replay and live, in C++ or in Python. Python hooks marked
  `@fastmm.hot` compile to machine code with Numba.
- Multi-account trading: a pool of sub-accounts trades behind one venue, and one
  `fastmm-gateway` holds the exchange connections for several strategy processes.
- Live A/B tests of strategy parameters.

## Exchanges

FastMM trades on Binance (spot and USDⓈ-M futures), OKX, Bybit, Gate, Hyperliquid, Lighter,
Deribit, Gemini and Coinbase (Advanced Trade and Exchange). US stocks trade through Alpaca. Nasdaq
TotalView-ITCH market data and OUCH 5.0 order entry are in the code too, and the engine's
end-to-end benchmark runs on them.

His dashboard for watching FastMM trade is a separate project,
[bndesk](https://github.com/ziyangliu-666/bndesk). FastMM's README points Binance users to it.

## How fast it is

Two kinds of number exist. Do not mix them up.

**The engine alone, in simulation.** A book update becomes an order in 143 ns at p50, 191 ns at
p99 and 319 ns at p99.9. The timed region is book update, strategy, quote diff, risk checks,
order state, and encoding of the orders. The network, TLS and the venue are outside it. Measured
on 2026-10-27, on one pinned core of an Intel Xeon Platinum 8488C. Version 0.10.0 brought the
figure down from 159 ns.

**A live production session.** The documentation's
[How fast it is](https://ziy.bio/FastMM/explanation/how-fast/) page gives one `fastmm-live`
session on Binance: five accounts, 45 hours 39 minutes without a restart, on 2 physical cores.

- Tick to trade, from the market-data frame read to the order handed to the network thread:
  6.7 µs at p50, 81.9 µs at p99, 4.06 ms at p99.9.
- To the signed, TLS-encrypted order written to the socket: 23.9 to 24.7 µs at p50, by account.
- Load: 1.03 billion market-data messages, about 6,300 a second, none dropped; 952,762 orders
  placed and 949,953 cancelled; no order refused for a venue rate limit; 3 reconnects; no kill
  switch trip.

A live session is slower than the engine alone because it decodes real packets and signs and
encrypts real orders.

Other measured costs, from the benchmarks page (p50, 2026-10-27):

| Operation | p50 |
|---|---|
| Pre-trade risk check, an order that passes | 7.1 ns |
| Strategy: two quotes (`basic_mm`) | 11.7 ns |
| OMS: submit an order | 30.4 ns |
| Journal: record a 128-byte event | 5.9 ns |
| Binance book ticker, JSON decode | 121.7 ns |
| Binance 20-level depth: JSON decode, against SBE binary decode | 702.4 ns, against 49.6 ns |
| Binance `order.place`: HMAC-signed, against an Ed25519 session logon | 749.3 ns, against 282.4 ns |
| OUCH 5.0 Enter Order encode | 18.4 ns |

End to end over a veth pair (2026-09-29): the ITCH simulator sends market data to `fastmm-live`
in another network namespace, and the engine answers with OUCH orders over TCP. Wire to wire
is 11.3 to 11.8 µs at p50, and the engine's part of it is 2.6 to 2.7 µs.

## Releases: what changed since 0.4.0

- 0.13.0 (9 November): a pool of accounts keeps each spot position on its home account by
  itself. The engine moves the pieces there by internal transfer, held, budgeted and confirmed
  like orders.
- 0.12.0 (9 November): a pool's home account can hand the orders it cannot take now to another
  account. `fastmm-sim-exchange` serves a whole pool of sub-accounts with internal transfers.
- 0.11.0 (7 November): a strategy's learnt state lives in versioned checkpoints. Parameters and
  A/B arms can be set per instrument. A pool can keep each position on one home account and fund
  each account by what its instruments need. `[capacity]` prices every order against the
  account's order limits. Shadow sweeps run variants of a strategy beside a live session.
  `HedgeExecutor` can hedge with post-only orders at the touch.
- 0.10.0 (28 October): sweeps, walk-forwards and A/B branches run all their points in one pass
  over the data. Backtests run order by order on a day of Nasdaq TotalView-ITCH
  (`fill_model = "l3_queue"`). The `alpaca` connector trades US stocks. Tick to order went from
  159 ns to 143 ns.
- 0.9.0 (24 October): a live session can be replayed from any checkpoint, and a backtest can
  compare two configurations from the same moment. `[engine] stall_ms` cancels every order when
  the engine thread stops.
- 0.8.0 (22 October): A/B tests of strategy parameters, live and in backtests, split by
  instrument, by time block or both. `fastmm-data ab` compares the arms with resampled
  intervals.
- 0.7.0 (16 October): a live session with real keys refuses to start without position and loss
  limits, and refuses a store or position it cannot trust.
- 0.6.0 (13 October): connectors for Hyperliquid and Lighter. Every refused order is stored with
  the limit that refused it.
- 0.5.0 (7 October): `fastmm-live --dry-run` quotes on paper, and the release tarball runs on
  any Linux with glibc 2.28 or later.

It installs without a build:

- Python: `pip install "fastmm-engine[hot]"` from [PyPI](https://pypi.org/project/fastmm-engine/).
  It needs CPython 3.10 or later, on Linux x86-64.
- The C++ programs: a release tarball on GitHub, and the container image
  `ghcr.io/ziyangliu-666/fastmm`.

Sixteen design records (ADRs) in `docs/adr/` give the reason for each large decision.

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

Hot-path rules:

- The trading thread allocates no memory after warm-up. Tests link a global `operator new`
  that counts calls, and fail on any allocation.
- Hot functions return a result type and throw no exceptions (ADR-0002).
- Prices and quantities are `int64` fixed point at a 1e-8 scale. Products go through
  `__int128`. There is no `double` in price arithmetic (ADR-0001).
- Every message between threads is trivially copyable.

Two threading modes:

- `split`, the default: one network thread per venue and one pinned, busy-spinning engine
  thread, joined by single-producer single-consumer rings.
- `single`: one venue's network loop, the engine and the order send all run on one thread.

## Networking

He wrote the network stack himself (ADR-0007): an event loop, TLS through OpenSSL memory
BIOs, an RFC 6455 WebSocket client and an HTTP/1.1 client. The event loop has two backends,
epoll and io_uring. The io_uring backend uses the raw system calls, not liburing.

Nasdaq TotalView-ITCH arrives over UDP multicast (ADR-0015): MoldUDP64 with A/B line
arbitration, gap re-requests, a GLIMPSE snapshot to join mid-stream, and an L3 order book per
symbol. He wrote the ITCH and OUCH 5.0 simulator, `fastmm-sim-itch`, that the engine is
measured against.

Datagrams arrive through one of three receive backends:

- `kernel`: batched `recvmmsg`, busy polling, and software and hardware receive timestamps.
- `af_xdp`: kernel bypass through AF_XDP, written on raw `bpf` system calls with no libbpf and
  no BPF compiler. The XDP program is BPF bytecode, assembled in C++. Its tests load the
  program through the kernel verifier and run it with `BPF_PROG_TEST_RUN`.
- `dpdk`: optional, off by default.

## Determinism and the journal

The engine journals every event it consumes, with the engine clock. The journal format,
`.fmj`, is versioned. It holds the instruments, the effective config with the API keys
removed, and the strategy's parameters, then the events in blocks. Each block carries a
CRC32C. Since 0.9.0 the journal records every outside input, checkpoints included, so a live
session can be replayed from any point.

`fastmm-replay --verify` replays a journal and compares the SHA-256 of the recorded outbound
stream with the replayed one. It prints `replay MATCH`, or exits at the first difference.
Operator commands are journaled too, so a session that an operator changed by hand still
replays to the same hash.

## Risk

Twenty-five pre-trade checks run in a fixed order on every new order and every replace. The
first check that fails refuses the order. Among them:

- a price collar and a fat-finger check;
- maximum order size, order notional and position;
- portfolio limits on gross and net exposure, kept as running totals;
- self-trade prevention, and a token-bucket rate limit.

The checks are integer compares on state the engine already keeps. An order that passes all of
them takes 7.1 ns. Cancels skip the checks, also after the kill switch trips, so the engine can
always reduce what is in the market.

The kill switch is one atomic word: one bit for the whole engine and one per venue. A
`kill_file` makes the loss limit a budget for the whole deployment, not for one process: a
restart after a trip refuses to trade until an operator clears it.

## Running it

- **Recovery:** a store records every fill, order, position and kill event. Every connector
  with order entry replays the account's executions before each open-orders snapshot and once
  a minute, and books what the private stream missed at the venue's price and fee.
- **Operator control:** `fastmm-ctl` talks to a running session over a Unix socket. It can
  pull quotes, change a parameter, switch to reduce-only, kill, or flatten.
- **Hand-over:** a running session can hand over to a new process, and a warm standby can take
  over with one message.
- **Monitoring:** `fastmm-top` shows a live session and serves a Prometheus `/metrics`
  endpoint. A finished run produces one self-contained HTML report.

## Backtests and research

Backtests can read Binance's public market data, with the SHA-256 of each file checked. A
backtest reports markouts, fill quality and a PnL decomposition: spread captured, mid drift
after fills, fees and rebates.

A sweep runs all its points in passes shared over the data. A point of a sweep costs 4 to 37
times less than the same backtest run alone.

He ran the shipped `basic_mm` strategy on one day of Binance BTCUSDT (2024-03-27). It lost
499.05 USDT on 12,529 fills, and fees were 351.13 USDT of that. His documentation states the
conclusion plainly: the shipped strategies (`basic_mm`, `avellaneda_stoikov`, `options_mm` and
`xmm`) are reference implementations of published quoting rules, written to show the engine's
API. They are not a trading edge.

A research module measures a signal before a strategy is written around it. On the same day,
book imbalance predicted the next mid move with an information coefficient of 0.580 at
100 ms, falling to 0.060 at one minute.

## Earlier performance work

These results are from September 2026. Later releases changed the code, so the numbers are
history, not the current figures above.

- The tick-to-order figure once read "about 1 microsecond". He found that the benchmark was
  measuring itself: about 600 ns was Google Benchmark's pause and resume timing, and 170 to
  180 ns was a SHA-256 checksum that only the simulator computes. He moved the timing to
  `rdtsc` around the timed region only.
- Running PnL totals replaced a loop over 256 positions in the loss check on every event. The
  engine step went from 9.2 µs to 2.9 µs.
- He measured io_uring for the send. `IORING_OP_SEND` cost the same as `write`, and SQPOLL only
  moved the send to another core, so the prototype was not kept.
- He also reports the results that did not help: profile-guided optimisation gave nothing
  measurable end to end, BOLT added nothing on top of it, and clang 18 was 45% slower than gcc
  on the engine step.

## How the work is checked

- CI on every push: lint, the gcc build and its tests, the benchmark budgets on an LTO build,
  the Autobahn WebSocket test suite, and the Python wheel.
- Every week: clang-tidy, the sanitizer builds, a clang build, the optional codecs and a Docker
  smoke test.
- `bench/README.md` says for each benchmark what is inside the timed region, which machine
  ran it, and how it was run.
