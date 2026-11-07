---
title: FastMM live on Binance — the Spot Liquidity Provider Program, with the weekly reports
kind: project
url: https://www.linkedin.com/feed/update/urn:li:activity:7515643540148797440/
---

FastMM trades live as a market maker in Binance's Spot Liquidity Provider Program, on bStock
pairs: tokenized US stocks quoted in USDT, such as ASTSBUSDT and PYPLBUSDT. The strategy runs
on FastMM, his C++20 engine. He wrote about the program on
[LinkedIn](https://www.linkedin.com/feed/update/urn:li:activity:7515643540148797440/).

Binance sends each liquidity provider a weekly report. These are his first three, with the
account ID removed. Each report is dated the Monday after the week it covers.

| Week | Report date | bStock maker volume | Share of all bStock maker volume | Tier | #1 | Top 5 | Top 10 |
|---|---|---|---|---|---|---|---|
| 5–11 Oct 2026 | 2026-10-12 | 2,908,262 USDT | 0.19% | 2 | 0 of 77 pairs | 7 of 77 | 30 of 77 |
| 12–18 Oct 2026 | 2026-10-19 | 7,532,109 USDT | 0.49% | 2 | 2 of 77 pairs | 24 of 77 | 38 of 77 |
| 19–25 Oct 2026 | 2026-10-26 | 6,718,402 USDT | 0.38% | 4 | not on this site | not on this site | not on this site |

For the week of 19–25 October, this site has only the summary page of the report. The pair
ranks are on the second page, so do not state or guess them for that week.

In the week of 12–18 October he was the largest maker by volume on ASTSBUSDT (24.8% of that
pair's maker volume) and PYPLBUSDT (31.9%), and second on ARMBUSDT, ASMLBUSDT, CRDOBUSDT and
HPEBUSDT.

Every tier so far pays a maker rebate: the maker fee rate is negative, so the exchange pays him
on every maker fill. Tier 2 paid -0.004%. In the week of 19–25 October he reached Tier 4, the
program's top tier, which pays -0.008%, twice the Tier 2 rebate. His fee page on 7 November
2026 still shows the -0.008% maker rate, so he held Tier 4 then. Say it this way: he is a
top-tier (Tier 4) spot market maker on Binance. The report gives the tier, not the rule behind it, so do
not explain why the tier went up while the weekly volume went down.

## Volume over 30 days

His Binance account page showed, on 7 November 2026, a 30-day spot volume of 25,775,789 USD,
for the days from 8 October to 6 November (UTC). This figure counts all his spot fills, maker
and taker. The daily volume was under 500,000 USD in the first ten days, then mostly between
1 and 2 million USD on active days, with its high, close to 2 million, on 4 November. The same
page shows his fee rates at that time: -0.008% maker and 0.075% taker, with the BNB fee
discount on.

He does not publish the capital behind these numbers. Do not state it, estimate it, or
derive it.

## The reports, as evidence

When a visitor asks how FastMM does live, whether the trading record is real, or where it can
be checked, embed the summary of the latest report on its own line:

![Binance Spot Liquidity Provider weekly report, 19–25 Oct 2026, summary: Tier 4](/media/binance/lp-2026-10-26-summary.webp)

When the visitor asks about volume over time, also embed the 30-day chart:

![Binance spot volume by day, 8 Oct to 6 Nov 2026: 25,775,789 USD in 30 days](/media/binance/spot-30d-volume-2026-11-07.webp)

Full reports, both pages, with every pair's volume share and rank, exist for the first two
weeks: [week of 12–18 Oct](/media/binance/lp-2026-10-19-report.webp) and
[week of 5–11 Oct](/media/binance/lp-2026-10-12-report.webp). Link them when the visitor asks
about ranks on single pairs.

These are live results on the exchange, not a simulation and not a backtest. FastMM's
latency figures are a different thing: they come from its benchmarks and from a recorded
production session, and its documentation says which is which.
