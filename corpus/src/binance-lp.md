---
title: FastMM live on Binance — the Spot Liquidity Provider Program, with the weekly reports
kind: project
url: https://www.linkedin.com/feed/update/urn:li:activity:7515643540148797440/
---

FastMM trades live as a market maker in Binance's Spot Liquidity Provider Program, on bStock
pairs: tokenized US stocks quoted in USDT, such as ASTSBUSDT and PYPLBUSDT. The strategy runs
on FastMM, his C++20 engine. He wrote about the program on
[LinkedIn](https://www.linkedin.com/feed/update/urn:li:activity:7515643540148797440/).

Binance sends each liquidity provider a weekly report. These are his first two, with the
account ID removed. Each report is dated the Monday after the week it covers.

| Week | Report date | bStock maker volume | Share of all bStock maker volume | Tier | #1 | Top 5 | Top 10 |
|---|---|---|---|---|---|---|---|
| 5–11 Oct 2026 | 2026-10-12 | 2,908,262 USDT | 0.19% | 2 | 0 of 77 pairs | 7 of 77 | 30 of 77 |
| 12–18 Oct 2026 | 2026-10-19 | 7,532,109 USDT | 0.49% | 2 | 2 of 77 pairs | 24 of 77 | 38 of 77 |

In the week of 12–18 October he was the largest maker by volume on ASTSBUSDT (24.8% of that
pair's maker volume) and PYPLBUSDT (31.9%), and second on ARMBUSDT, ASMLBUSDT, CRDOBUSDT and
HPEBUSDT. Tier 2 pays a maker rebate: the fee rate is -0.004%, so the exchange pays him on
every maker fill.

He does not publish the capital behind these numbers. Do not state it, estimate it, or
derive it.

## The reports, as evidence

When a visitor asks how FastMM does live, whether the trading record is real, or where it can
be checked, embed the summary of the latest report on its own line, and link the full report:

![Binance Spot Liquidity Provider weekly report, 12–18 Oct 2026, summary](/media/binance/lp-2026-10-19-summary.webp)

Full reports, both pages, with every pair's volume share and rank:
[week of 12–18 Oct](/media/binance/lp-2026-10-19-report.webp) and
[week of 5–11 Oct](/media/binance/lp-2026-10-12-report.webp).

These are live results on the exchange, not a simulation and not a backtest. FastMM's
latency figures are a different thing: they come from its benchmarks and from a recorded
production session, and its documentation says which is which.
