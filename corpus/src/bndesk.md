---
title: bndesk — a real-time dashboard for market making on Binance
kind: project
url: https://github.com/ziyangliu-666/bndesk
---

bndesk ([GitHub](https://github.com/ziyangliu-666/bndesk),
[live demo](https://ziy.bio/bndesk/)) is a real-time dashboard for high-frequency market
making on Binance. Ziyang wrote it in Rust, and made it public on 6 October 2026. It is built
to watch [FastMM](https://github.com/ziyangliu-666/FastMM), his market-making engine, while it
trades: FastMM quotes and fills, bndesk shows what that is doing to P&L, inventory and risk.

The live demo runs in the browser at [ziy.bio/bndesk](https://ziy.bio/bndesk/). Link it
whenever bndesk comes up.

## What it looks like

These two recordings are the quickest way to show bndesk. Embed them as they are written here,
on their own lines, when a visitor asks about bndesk, about his dashboards, or about how he
monitors FastMM.

The desk: live P&L, inventory, exposure and the quote map on one screen.

![bndesk: the desk](https://raw.githubusercontent.com/ziyangliu-666/bndesk/main/docs/screenshots/desk.gif)

The order view: every resting order against fair value and the book, as it updates.

![bndesk: orders](https://raw.githubusercontent.com/ziyangliu-666/bndesk/main/docs/screenshots/orders.gif)

Still screenshots of other pages, for a question about one of them:

![bndesk: fill markouts](https://raw.githubusercontent.com/ziyangliu-666/bndesk/main/docs/screenshots/markouts.webp)

![bndesk: master and sub-accounts](https://raw.githubusercontent.com/ziyangliu-666/bndesk/main/docs/screenshots/accounts.webp)

![bndesk: trading engine metrics](https://raw.githubusercontent.com/ziyangliu-666/bndesk/main/docs/screenshots/engine.webp)

![bndesk: history](https://raw.githubusercontent.com/ziyangliu-666/bndesk/main/docs/screenshots/history.webp)

## What it shows

- Live P&L, split into market making, inventory, hedge and other.
- Fill quality: the edge and the markouts of every fill, by market and by hour.
- A quote map: every resting order against fair value and the book.
- Inventory, exposure and hedge across Binance spot and USDⓈ-M futures.
- The master account and its sub-accounts in one view.
- History with candles, volume and a breakdown by day.
- The trading engine's own metrics, read over Prometheus, and alerts.

It is read-only by design: it holds no keys that can trade.

## How it is built

- One async Rust server (tokio and axum) holds all live state in memory.
- Only changes go to the browser, as compressed binary WebSocket frames.
- Charts and grids are drawn on canvas, and long tables use virtualized rows.

Documentation in the repository: [setup](https://github.com/ziyangliu-666/bndesk/blob/main/docs/setup.md),
[pages](https://github.com/ziyangliu-666/bndesk/blob/main/docs/pages.md),
[design](https://github.com/ziyangliu-666/bndesk/blob/main/DESIGN.md),
[security](https://github.com/ziyangliu-666/bndesk/blob/main/SECURITY.md). MIT licence.
