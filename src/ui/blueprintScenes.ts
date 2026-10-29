/* The drawings behind the cards, one per card. See blueprint.ts for the language they share.
 *
 * Each one is the logic of a GIF from his interview deck, redrawn:
 *
 *   FastMM     fm_arch: prices in on three accounts, one engine, a journal on disk
 *   Binance    fm_sweep: quotes on both sides of a recorded price, and the fills
 *   bndesk     no GIF; its own README: a read-only stream into one desk
 *   vox        no GIF; its own README: hold a key, speak, the text appears
 *   V2V OS     v2v_migration: a full copy, two CBT rounds, a cutover
 *   VMTools    vmtools: a report up the virtio-serial channel, then freeze and thaw
 *   papers     copy_grid: copy-as-decode against a normal model, pass by pass
 *   maths      the Schatten-limits preprint: p goes to infinity, Yp converges, and the limit
 *              is not the strict approximant
 *   blog       his student blog, as a memory: who he was then, every post surfacing on a line
 *              from 2021 to 2022, and the line going on to now
 *
 * Numbers that are facts come from the corpus notes, the résumé and the GIFs. Values that only
 * fill a field (an IP address, a fill time) are labelled illustrative, as the GIFs label them.
 *
 * Coordinates are in the 1000 × 560 design box. `t` is seconds since the drawing opened and
 * drives the build; `L` is seconds into the current loop and drives the story. */

import type { Art } from "./cardArt";
import {
  BUILD,
  DIM,
  LINE,
  LIT,
  TXT,
  type P,
  Pen,
  type Scene,
  clamp01,
  ez,
  held,
  lift,
  pulse,
  win,
} from "./blueprintKit";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Build progress of a part that starts drawing at `a` seconds after the card opens. */
const grow = (t: number, a: number, d = 0.5) => ez(win(t, a, d));

/** A deterministic hash in [0, 1), so every visit draws the same market. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/* --------------------------------------------------------------------------- shared parts */

/** An exchange: a pediment on four columns, the glyph the GIFs use, in hairline. */
function exchange(pen: Pen, x: number, y: number, p: number, name: string): void {
  pen.ink(LINE);
  pen.poly(
    [
      [x - 26, y - 12],
      [x, y - 28],
      [x + 26, y - 12],
      [x - 26, y - 12],
    ],
    p,
  );
  for (const dx of [-17, -6, 6, 17]) pen.line(x + dx, y - 6, x + dx, y + 16, p);
  pen.line(x - 28, y + 21, x + 28, y + 21, p);
  pen.ink(TXT);
  pen.text(name, x, y + 38, { align: "center", p, size: 12 });
}

/** A thread pinned to its own core: a box with a header rule, its name and its core. */
function thread(
  pen: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  name: string,
  core: string,
  p: number,
  lit: number,
): void {
  pen.ink(lift(LINE, LIT, lit));
  pen.rect(x, y, w, h, p);
  pen.line(x, y + 22, x + w, y + 22, p);
  pen.ink(lift(TXT, LIT, lit));
  pen.text(name, x + 10, y + 11.5, { size: 11, p });
  // The core sits in the body, bottom right: in the header it ran into the name.
  pen.ink(lift(DIM + 0.1, LIT, lit)).text(core, x + w - 10, y + h - 12, { size: 10, align: "right", p });
}

/** A queue: a slotted bar with an arrow at its out end. `filled` slots fill from that end. */
function queue(
  pen: Pen,
  x: number,
  y: number,
  w: number,
  slots: number,
  filled: number,
  dir: 1 | -1,
  p: number,
  lit = 0,
): void {
  const h = 14;
  pen.ink(lift(LINE, LIT, lit));
  pen.rect(x, y - h / 2, w, h, p);
  const cell = w / slots;
  for (let k = 1; k < slots; k++) pen.line(x + k * cell, y - h / 2, x + k * cell, y + h / 2, p);
  const tip = dir === 1 ? x + w : x;
  pen.poly(
    [
      [tip, y - 4],
      [tip + dir * 6, y],
      [tip, y + 4],
    ],
    p,
  );
  pen.ink(LIT);
  for (let k = 0; k < Math.min(filled, slots); k++) {
    const slot = dir === 1 ? slots - 1 - k : k;
    pen.fill(x + slot * cell + 3, y - h / 2 + 3, cell - 6, h - 6);
  }
}

/** A disk: a cylinder in outline, with one rule per record already written. */
function disk(pen: Pen, cx: number, top: number, rx: number, h: number, p: number, records: number) {
  const ry = rx * 0.22;
  if (p <= 0) return;
  pen.ink(LINE);
  pen.ellipse(cx, top, rx, ry, 0, Math.PI * 2 * p);
  pen.line(cx - rx, top, cx - rx, top + h, p);
  pen.line(cx + rx, top, cx + rx, top + h, p);
  pen.ellipse(cx, top + h, rx, ry, 0, Math.PI * p);
  pen.ink(lift(DIM, LINE, 0.6));
  for (let k = 0; k < records; k++) {
    const y = top + h - 8 - k * 7;
    pen.ellipse(cx, y, rx, ry, 0, Math.PI);
  }
}

/** A box whose label is set on a filled ground when `on`, as a state that is switched on. */
function stateBox(pen: Pen, x: number, y: number, w: number, h: number, label: string, on: number, p: number) {
  pen.ink(lift(LINE, LIT, on));
  pen.rect(x, y, w, h, p);
  if (on > 0) {
    pen.ink(LIT * on);
    pen.fill(x, y, w, h);
    pen.paper(on);
  } else {
    pen.ink(TXT);
  }
  pen.text(label, x + w / 2, y + h / 2, { align: "center", size: 12, p });
}

/* ---------------------------------------------------------------------------------- FastMM */

const ACCOUNTS = [120, 280, 440];

const fastmm: Scene = {
  title: "FastMM",
  subtitle: "One event through four threads",
  period: 8,
  steps: [
    [0, "Prices arrive on each account"],
    [2, "Each network thread queues them"],
    [3.8, "The engine decides and sends an order"],
    [6.1, "Every event also goes to disk"],
  ],
  draw(pen, t, L, cycle) {
    exchange(pen, 64, 280, grow(t, 0), "BINANCE");

    // Two prices per account per loop: when each leaves the exchange.
    const leave = (i: number, k: number) => 0.15 + i * 0.3 + k * 0.6;
    const drain = (i: number) => 3.2 + i * 0.12;

    ACCOUNTS.forEach((y, i) => {
      const fan: P[] = [
        [94, 280],
        [140, y],
        [210, y],
      ];
      const g = grow(t, 0.2 + i * 0.1);
      pen.ink(LINE).poly(fan, g);
      pen.ink(TXT).text(`ACCOUNT ${i + 1}`, 150, y - 10, { size: 10, p: g });

      const hit = Math.max(pulse(L, leave(i, 0) + 0.6, 0.6), pulse(L, leave(i, 1) + 0.6, 0.6));
      const answer = i === 1 ? pulse(L, 5.9, 0.6) : 0;
      thread(pen, 210, y - 34, 160, 68, "NETWORK THREAD", `CORE ${i + 2}`, grow(t, 0.4 + i * 0.1), Math.max(hit, answer));

      // Queued: a price fills a slot once it is through the thread, and drains to the engine.
      let filled = 0;
      for (const k of [0, 1]) {
        const a = leave(i, k);
        pen.ink(LIT).packet(fan, win(L, a, 0.65));
        pen.packet([[290, y], [392, y - 13]], win(L, a + 0.75, 0.35));
        if (L > a + 1.1 && L < drain(i)) filled++;
      }
      pen.packet([[498, y - 13], [525, 165]], win(L, drain(i), 0.45));
      const q = grow(t, 0.7 + i * 0.1);
      queue(pen, 392, y - 13, 100, 4, filled, 1, q, pulse(L, drain(i) - 0.1, 0.5));
      queue(pen, 392, y + 13, 100, 4, i === 1 && L > 5.55 && L < 5.95 ? 1 : 0, -1, q);
      if (i === 0) {
        pen.ink(TXT);
        pen.text("PRICES", 442, y - 32, { size: 10, align: "center", p: q });
        pen.text("ORDERS", 442, y + 33, { size: 10, align: "center", p: q });
      }
    });

    // The engine: one thread, four stages, lit in turn.
    const eng = held(L, 3.7, 6.2, 0.3);
    thread(pen, 525, 86, 190, 388, "ENGINE THREAD", "CORE 1", grow(t, 0.8, 0.6), eng);
    ["ORDER BOOK", "STRATEGY", "RISK CHECK", "ORDERS"].forEach((name, k) => {
      const on = pulse(L, 3.85 + k * 0.42, 0.7);
      const g = grow(t, 1.0 + k * 0.1);
      pen.ink(lift(DIM, LIT, on)).rect(545, 132 + k * 82, 150, 52, g);
      pen.ink(lift(TXT, LIT, on)).text(name, 620, 158 + k * 82, { size: 12, align: "center", p: g });
    });

    // The order goes back out on account 2.
    pen.ink(LIT);
    pen.packet(
      [
        [545, 404],
        [515, 404],
        [505, 293],
        [392, 293],
      ],
      win(L, 5.4, 0.55),
    );
    pen.packet(
      [
        [370, 280],
        [210, 280],
        [140, 280],
        [94, 280],
      ],
      win(L, 6.0, 0.5),
    );

    // The journal: every event to its own thread, then to the file.
    const jg = grow(t, 1.1);
    queue(pen, 735, 240, 80, 3, L > 6.6 && L < 6.95 ? 1 : 0, 1, jg, pulse(L, 6.4, 0.5));
    pen.ink(LIT).packet([[715, 240], [735, 240]], win(L, 6.2, 0.3));
    thread(pen, 835, 206, 140, 68, "JOURNAL THREAD", "CORE 0", grow(t, 1.2), pulse(L, 6.85, 0.9));
    pen.ink(LINE).line(905, 274, 905, 340, grow(t, 1.4));
    pen.ink(LIT).packet([[905, 280], [905, 352]], win(L, 7.2, 0.4));
    const records = (cycle % 6) + (L > 7.6 ? 1 : 0);
    disk(pen, 905, 352, 42, 70, grow(t, 1.3, 0.6), Math.min(records, 6));
    pen.ink(TXT).text("JOURNAL FILE", 905, 452, { size: 11, align: "center", p: grow(t, 1.5) });

    // The figure on the card, as a dimension across the engine.
    const d = grow(t, 1.5);
    const dl = lift(LINE, LIT, held(L, 3.8, 6.1, 0.4));
    pen.ink(dl).line(525, 500, 715, 500, d);
    pen.line(525, 494, 525, 506, d);
    pen.line(715, 494, 715, 506, d);
    pen.ink(lift(TXT, LIT, held(L, 3.8, 6.1, 0.4)));
    pen.text("111 NS  P50  MARKET DATA TO ORDER", 620, 520, { size: 11, align: "center", p: d });
  },
};

/* ----------------------------------------------------------------------- Binance liquidity */

/** The recorded price at x, in design units. A sum of slow and fast waves. */
const price = (x: number) =>
  250 +
  48 * Math.sin(x / 61) +
  26 * Math.sin(x / 23 + 1.3) +
  12 * Math.sin(x / 9.1 + 0.4) +
  0.06 * (x - 400);

const CHART = { x0: 70, x1: 740, top: 90, bottom: 420 };
const QUOTE_STEP = 16;
const SPREAD = 13;

interface Fill {
  x: number;
  y: number;
  buy: boolean;
}

/* Where the quotes are hit. A quote placed at one step lives until the next. A sell quote above
   the price fills when the price rises to it, a buy quote below fills when it falls to it. On
   the page, up is a higher price, so "above" is a smaller y. */
const FILLS: Fill[] = (() => {
  const out: Fill[] = [];
  for (let x = CHART.x0; x < CHART.x1 - QUOTE_STEP; x += QUOTE_STEP) {
    const mid = price(x);
    const ask = mid - SPREAD;
    const bid = mid + SPREAD;
    let soldAt = -1;
    let boughtAt = -1;
    for (let u = x; u < x + QUOTE_STEP; u += 0.5) {
      const y = price(u);
      if (soldAt < 0 && y <= ask) soldAt = u;
      if (boughtAt < 0 && y >= bid) boughtAt = u;
    }
    if (soldAt >= 0) out.push({ x: soldAt, y: ask, buy: false });
    if (boughtAt >= 0) out.push({ x: boughtAt, y: bid, buy: true });
  }
  return out;
})();

const binance: Scene = {
  title: "Binance liquidity provider",
  subtitle: "Quotes on both sides, all day",
  period: 10,
  steps: [
    [0, "Quote both sides around the price"],
    [3.2, "A fill when the price reaches a quote"],
    [6.6, "77 stocks, one engine: top 5 on 24"],
  ],
  draw(pen, t, L) {
    const { x0, x1, top, bottom } = CHART;
    const g = grow(t, 0, 0.8);

    // Axes, and the day the replay runs over. Illustrative: no real prices or times.
    pen.ink(LINE);
    pen.line(x0, bottom, x1, bottom, g);
    pen.line(x0, top, x0, bottom, g);
    ["00:00", "06:00", "12:00", "18:00", "24:00"].forEach((label, k) => {
      const x = x0 + ((x1 - x0) * k) / 4;
      pen.ink(LINE).line(x, bottom, x, bottom + 6, g);
      pen.ink(TXT).text(label, x, bottom + 20, { size: 10, align: "center", p: g });
    });

    // The whole day, faint, then the part already played, bright.
    const ghost: P[] = [];
    for (let x = x0; x <= x1; x += 3) ghost.push([x, price(x)]);
    pen.ink(DIM).poly(ghost, grow(t, 0.3, 1.2));

    const sweep = 8.2;
    const head = x0 + (x1 - x0) * clamp01(L / sweep);
    const played = ghost.filter(([x]) => x <= head);
    if (played.length > 1) pen.ink(LIT).poly([...played, [head, price(head)]]);

    // The quotes left behind: a short rule above and below the price at every step.
    pen.ink(LINE);
    for (let x = x0; x < head; x += QUOTE_STEP) {
      const mid = price(x);
      const w = Math.min(QUOTE_STEP - 3, head - x);
      pen.line(x, mid - SPREAD, x + w, mid - SPREAD);
      pen.line(x, mid + SPREAD, x + w, mid + SPREAD);
    }
    // The live quotes, at the head, a step wider: a ladder of three on each side.
    if (head > x0 + 1) {
      const mid = price(head);
      for (let k = 0; k < 3; k++) {
        pen.ink(lift(LIT, LINE, k / 2));
        pen.line(head - 2, mid - SPREAD - k * 9, head + 26, mid - SPREAD - k * 9);
        pen.line(head - 2, mid + SPREAD + k * 9, head + 26, mid + SPREAD + k * 9);
      }
      pen.ink(LINE).line(head, top, head, bottom);
    }

    // Fills: a full dot for a buy, a ring for a sell.
    let fills = 0;
    for (const f of FILLS) {
      if (f.x > head) break;
      fills++;
      const fresh = clamp01(1 - (head - f.x) / 40);
      pen.ink(lift(LINE + 0.2, LIT, fresh));
      if (f.buy) pen.disc(f.x, f.y, 3);
      else pen.circle(f.x, f.y, 3.2);
    }

    // The legend.
    const lg = grow(t, 0.8);
    pen.ink(DIM).text("WEEK OF 12–18 OCT 2026", 980, 452, { size: 10, align: "right", p: lg });
    pen.ink(LIT).line(x0, 478, x0 + 22, 478, lg);
    pen.ink(TXT).text("PRICE", x0 + 30, 478, { size: 10, p: lg });
    pen.ink(LINE).line(x0 + 100, 478, x0 + 122, 478, lg);
    pen.ink(TXT).text("QUOTE", x0 + 130, 478, { size: 10, p: lg });
    pen.ink(LIT).disc(x0 + 206, 478, 3);
    pen.ink(TXT).text("BUY FILL", x0 + 216, 478, { size: 10, p: lg });
    pen.ink(LIT).circle(x0 + 300, 478, 3.2, lg);
    pen.ink(TXT).text("SELL FILL", x0 + 310, 478, { size: 10, p: lg });
    pen.ink(DIM).text("ILLUSTRATIVE PRICES", x1, 478, { size: 10, align: "right", p: lg });

    /* The book he quotes: 77 tokenized US stocks. Shown are five of his best ranks by maker
       volume in the week of 12–18 Oct 2026, from the program's weekly report. The first lane is
       the chart; the others fill at their own pace. */
    const five = held(L, 6.6, 9.8, 0.4);
    const px = 790;
    pen.ink(lift(TXT, LIT, five));
    pen.text("77 TOKENIZED STOCKS", px, 96, { size: 11, p: grow(t, 0.9) });
    pen.text("TOP 5 ON 24 OF THEM", px, 114, { size: 11, p: grow(t, 1.0) });
    const lanes: [string, string][] = [
      ["ASTS", "#1"],
      ["PYPL", "#1"],
      ["ARM", "#2"],
      ["ASML", "#2"],
      ["CRDO", "#2"],
    ];
    lanes.forEach(([sym, rank], k) => {
      const y = 160 + k * 56;
      const gk = grow(t, 1.0 + k * 0.1);
      pen.ink(lift(LINE, LIT, k === 0 ? 0.6 : five)).rect(px, y - 18, 190, 40, gk);
      pen.ink(TXT).text(sym, px + 10, y - 6, { size: 10, p: gk });
      pen.ink(lift(TXT, LIT, five)).text(rank, px + 180, y - 6, { size: 10, align: "right", p: gk });
      const n = k === 0 ? fills : Math.floor((fills * (0.55 + hash(k) * 0.6)) | 0);
      for (let d = 0; d < Math.min(n, 28); d++) {
        const dx = px + 12 + d * 6.2;
        pen.ink(lift(LINE, LIT, k === 0 || five ? 0.8 : 0.3));
        pen.fill(dx, y + 7, 3, 3);
      }
    });
  },
};

/* ----------------------------------------------------------------------------------- bndesk */

const bndesk: Scene = {
  title: "bndesk",
  subtitle: "A desk that can watch and cannot trade",
  period: 9,
  steps: [
    [0, "Market data and account events stream in"],
    [3, "P&L, inventory, the book and every fill, live"],
    [6, "It holds no key that can trade"],
  ],
  draw(pen, t, L) {
    exchange(pen, 64, 280, grow(t, 0), "BINANCE");

    // The stream in: packets that never stop.
    const g = grow(t, 0.2);
    pen.ink(LINE).line(96, 262, 268, 262, g);
    pen.ink(TXT).text("READ-ONLY", 182, 244, { size: 10, align: "center", p: g });
    pen.ink(LIT);
    for (let k = 0; k < 5; k++) {
      pen.packet([[96, 262], [268, 262]], ((L * 0.9 + k / 5) % 1) * clamp01(t - BUILD + 0.5), 6);
    }

    // The way back, which does not exist: a dashed path, cut.
    const no = held(L, 6, 8.8, 0.35);
    pen.ink(lift(DIM, LIT, no)).dashed(268, 302, 104, 302, g);
    pen.poly(
      [
        [112, 297],
        [104, 302],
        [112, 307],
      ],
      g,
    );
    const xg = grow(t, 0.6);
    pen.ink(lift(LINE, LIT, no));
    pen.circle(186, 302, 11, xg);
    pen.line(179, 295, 193, 309, xg);
    pen.line(193, 295, 179, 309, xg);
    pen.ink(lift(TXT, LIT, no)).text("NO ORDER PATH", 186, 330, { size: 10, align: "center", p: xg });

    // The desk.
    const dg = grow(t, 0.4, 0.7);
    pen.ink(LINE).rect(280, 60, 700, 440, dg);
    pen.line(280, 86, 980, 86, dg);
    pen.ink(TXT).text("BNDESK", 294, 73, { size: 11, p: dg });
    pen.text("LIVE", 950, 73, { size: 11, align: "right", p: dg });
    pen.ink(LIT * (0.5 + 0.5 * Math.round((Math.sin(t * 5) + 1) / 2))).disc(964, 73, 3);

    const live = held(L, 3, 6, 0.35);
    const panel = (x: number, y: number, w: number, h: number, name: string, d: number) => {
      const p = grow(t, d);
      pen.ink(lift(DIM, LINE, 0.5 + live * 0.5)).rect(x, y, w, h, p);
      pen.ink(lift(TXT, LIT, live)).text(name, x + 10, y + 13, { size: 10, p });
      return p;
    };

    // P&L: a line that scrolls left as time passes.
    const pp = panel(296, 100, 400, 190, "P&L", 0.6);
    const pnl: P[] = [];
    for (let k = 0; k <= 60; k++) {
      const u = t * 4 + k;
      const v = 0.6 * u + 12 * Math.sin(u / 5) + 6 * Math.sin(u / 1.7);
      pnl.push([306 + k * 6.3, v]);
    }
    const vs = pnl.map(([, v]) => v);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    pen.ink(lift(LINE, LIT, 0.7)).poly(
      pnl.map(([x, v]) => [x, 270 - ((v - lo) / (hi - lo || 1)) * 140] as P),
      pp,
    );

    // The book: asks above, bids below, sizes that change every tick.
    const bp = panel(712, 100, 252, 190, "BOOK", 0.7);
    const tick = Math.floor(t * 6);
    for (let k = 0; k < 6; k++) {
      const wa = 30 + hash(k * 13 + tick * 0.37) * 150;
      const wb = 30 + hash(k * 29 + tick * 0.53 + 7) * 150;
      pen.ink(lift(LINE, LIT, live * 0.6));
      pen.rect(950 - wa * bp, 126 + k * 11, wa * bp, 6);
      pen.rect(950 - wb * bp, 204 + k * 11, wb * bp, 6);
    }
    pen.ink(DIM).dashed(724, 196, 950, 196, bp);

    // Inventory per pair, a bar either side of zero.
    const ip = panel(296, 304, 400, 180, "INVENTORY", 0.8);
    pen.ink(DIM).line(496, 330, 496, 470, ip);
    for (let k = 0; k < 5; k++) {
      const v = Math.sin(t * 0.7 + k * 1.9) * 120 * (0.4 + hash(k) * 0.6);
      pen.ink(lift(LINE, LIT, live * 0.7));
      pen.rect(Math.min(496, 496 + v * ip), 338 + k * 26, Math.abs(v * ip), 12);
      pen.ink(TXT).text(`PAIR ${k + 1}`, 306, 344 + k * 26, { size: 9, p: ip });
    }

    // Fills, newest on top, one every 0.8 s.
    const fp = panel(712, 304, 252, 180, "FILLS", 0.9);
    const n = Math.floor(t / 0.8);
    for (let r = 0; r < 7; r++) {
      const id = n - r;
      if (id < 0) break;
      const fresh = r === 0 ? clamp01(((t / 0.8) % 1) * 4) : 1;
      const s = 9 + ((id * 7) % 50);
      const ms = String((id * 137) % 1000).padStart(3, "0");
      const side = hash(id) > 0.5 ? "BUY " : "SELL";
      pen.ink(lift(TXT, LIT, r === 0 ? 1 - ((t / 0.8) % 1) : 0) * (1 - r / 9) * fresh);
      pen.text(`12:04:${String(s).padStart(2, "0")}.${ms}  ${side}  PAIR ${(id % 5) + 1}`, 722, 334 + r * 20, {
        size: 10,
        p: fp,
      });
    }
    pen.ink(DIM).text("ILLUSTRATIVE VALUES", 966, 516, { size: 10, align: "right", p: grow(t, 1.2) });
  },
};

/* -------------------------------------------------------------------------------------- vox */

const SPOKEN = "Ship the release notes after lunch.";

const vox: Scene = {
  title: "vox",
  subtitle: "Push to talk, in any app",
  period: 8,
  steps: [
    [0, "Hold the key and speak"],
    [4.2, "Let go: your ChatGPT account transcribes it"],
    [5.0, "The text appears where the cursor is"],
  ],
  draw(pen, t, L) {
    const hold = held(L, 0.3, 4.2, 0.12);

    // The key, pressed while held.
    const kg = grow(t, 0);
    const press = hold * 4;
    pen.ink(lift(LINE, LIT, hold)).rect(70, 226, 96, 96, kg);
    pen.rect(80, 232 + press, 76, 76, kg);
    pen.ink(lift(TXT, LIT, hold)).text("⌥", 118, 270 + press, { size: 30, align: "center", p: kg });
    pen.ink(TXT).text("HOLD", 118, 344, { size: 11, align: "center", p: kg });

    // The voice: bars that enter on the right while the key is held and scroll left.
    const wg = grow(t, 0.3, 0.8);
    pen.ink(DIM).line(206, 274, 560, 274, wg);
    const n = 50;
    for (let k = 0; k < n; k++) {
      const x = 206 + k * 7.2;
      // The sample under this bar was spoken (n - k) frames of 0.06 s ago.
      const at = L - (n - k) * 0.06 + 0.6;
      const loud = held(at, 0.3, 4.2, 0.12);
      const amp = loud * (6 + 50 * Math.abs(Math.sin(at * 9.1) * Math.sin(at * 2.3 + k * 0.2)));
      if (amp < 0.5) continue;
      pen.ink(lift(LINE, LIT, loud * 0.9)).line(x, 274 - amp * wg, x, 274 + amp * wg);
    }
    pen.ink(TXT).text("SPEECH", 206, 192, { size: 11, p: wg });

    // The account, and the trip there and back.
    const ag = grow(t, 0.6);
    const away = pulse(L, 4.2, 0.9);
    pen.ink(lift(LINE, LIT, away)).rect(596, 244, 132, 60, ag);
    pen.ink(lift(TXT, LIT, away)).text("CHATGPT", 662, 266, { size: 11, align: "center", p: ag });
    pen.text("ACCOUNT", 662, 282, { size: 11, align: "center", p: ag });
    pen.ink(TXT).text("NO API KEY", 662, 322, { size: 10, align: "center", p: ag });
    pen.ink(LINE).line(560, 274, 596, 274, ag);
    pen.line(728, 274, 760, 274, ag);
    pen.ink(LIT).packet([[560, 274], [596, 274]], win(L, 4.2, 0.3));
    pen.packet([[728, 274], [760, 274]], win(L, 4.75, 0.25));

    // Any app: a window with a field, and the words typed into it.
    const og = grow(t, 0.8, 0.7);
    pen.ink(LINE).rect(760, 170, 220, 210, og);
    pen.line(760, 194, 980, 194, og);
    for (const k of [0, 1, 2]) pen.circle(774 + k * 12, 182, 3.2, og);
    pen.ink(TXT).text("ANY APP", 870, 400, { size: 11, align: "center", p: og });
    const typed = win(L, 5.0, 1.6);
    const out = held(L, 5.0, 7.7, 0.3);
    pen.ink(lift(DIM, LIT, out)).rect(776, 214, 188, 70, og);
    const words = SPOKEN.slice(0, Math.round(SPOKEN.length * typed));
    pen.ink(LIT * out);
    // Two lines, broken at a space, so the sentence fits the field.
    const cut = SPOKEN.indexOf(" ", 16);
    pen.text(words.slice(0, cut), 786, 236, { size: 13 });
    if (words.length > cut) pen.text(words.slice(cut + 1), 786, 256, { size: 13 });
    // The caret blinks after the last letter.
    const lineText = words.length > cut ? words.slice(cut + 1) : words;
    const cx = 786 + pen.measure(lineText, 13) + 2;
    const cy = words.length > cut ? 256 : 236;
    if (Math.sin(t * 7) > 0) pen.ink(LIT * og).line(cx, cy - 8, cx, cy + 8);
  },
};

/* ------------------------------------------------------------------------------------ V2V OS */

const COLS = 6;
const ROWS = 4;
const BLOCKS = COLS * ROWS;
/** The rounds: when each starts, which blocks it moves, and how bright a block it leaves. The
 *  GIF tells rounds apart by colour; here a later round leaves a denser block. */
const ROUNDS = [
  { at: 0.2, gap: 0.17, blocks: range(BLOCKS), ink: 0.22 },
  { at: 5.0, gap: 0.42, blocks: [3, 9, 14, 20, 22], ink: 0.48 },
  { at: 8.0, gap: 0.5, blocks: [9, 17], ink: 0.72 },
  { at: 10.2, gap: 0.5, blocks: [12], ink: 1 },
];
const TRIP = 0.9;

const cellAt = (x0: number, b: number): P => [x0 + (b % COLS) * 36, 196 + Math.floor(b / COLS) * 36];

const v2v: Scene = {
  title: "V2V OS",
  subtitle: "Moving a running VM off VMware",
  period: 12.5,
  steps: [
    [0, "Snapshot, then a full copy"],
    [4.9, "CBT round 1: copy only the changed blocks"],
    [7.9, "CBT round 2: the VM keeps running"],
    [10.0, "Cutover: stop the source, copy the last block"],
  ],
  draw(pen, t, L) {
    const columns: [number, number, string][] = [
      [20, 250, "VMWARE ESXI"],
      [290, 420, "V2V APPLIANCE"],
      [730, 250, "SMTX OS"],
    ];
    columns.forEach(([x, w, name], k) => {
      const g = grow(t, k * 0.15, 0.6);
      pen.ink(DIM).rect(x, 50, w, 400, g);
      pen.ink(TXT).text(name, x + 12, 66, { size: 11, p: g });
    });

    // The state of every block: which round last moved it, and whether it changed since.
    const src: number[] = Array(BLOCKS).fill(-1);
    const dst: number[] = Array(BLOCKS).fill(-1);
    const dirty: boolean[] = Array(BLOCKS).fill(false);
    let left = BLOCKS;
    const inFlight: { b: number; p: number; r: number }[] = [];
    ROUNDS.forEach((round, r) => {
      if (L < round.at - 0.3) return;
      if (r > 0) for (const b of round.blocks) dirty[b] = true;
      round.blocks.forEach((b, k) => {
        const go = round.at + k * round.gap;
        if (L >= go) {
          src[b] = r;
          dirty[b] = false;
        }
        const p = (L - go) / TRIP;
        if (p > 0 && p < 1) inFlight.push({ b, p, r });
        if (p >= 1) dst[b] = r;
      });
      left = round.blocks.filter((_, k) => L < round.at + k * round.gap + TRIP).length;
    });

    const vmStopped = L > 10.0;
    const g0 = grow(t, 0.3);
    stateBox(pen, 40, 92, 210, 40, vmStopped ? "SOURCE VM  STOPPED" : "SOURCE VM  RUNNING", 0, g0);
    stateBox(pen, 310, 92, 380, 40, "CONTROL PLANE", 0.92, grow(t, 0.4));
    const targetUp = L > 11.5;
    stateBox(pen, 750, 92, 210, 40, targetUp ? "TARGET VM  RUNNING" : "TARGET VM", targetUp ? 0.92 : 0, grow(t, 0.5));

    const grid = (x0: number, state: number[], d: number, isSrc: boolean) => {
      for (let b = 0; b < BLOCKS; b++) {
        const [x, y] = cellAt(x0, b);
        const g = grow(t, d + b * 0.02, 0.3);
        pen.ink(LINE).rect(x, y, 28, 28, g);
        const r = state[b]!;
        if (r >= 0) {
          pen.ink(ROUNDS[r]!.ink);
          pen.fill(x, y, 28, 28);
        }
        if (isSrc && dirty[b]) {
          // Changed since its last copy: the block is marked, not filled.
          pen.ink(LIT).rect(x - 3, y - 3, 34, 34);
          pen.ink(LIT).fill(x + 11, y + 11, 6, 6);
        }
      }
    };
    pen.ink(TXT).text("VMDK DISK BLOCKS", 40, 172, { size: 10, p: grow(t, 0.5) });
    pen.text("ZBS DISK BLOCKS", 750, 172, { size: 10, p: grow(t, 0.6) });
    grid(40, src, 0.5, true);
    grid(750, dst, 0.7, false);

    // The data path: 8 readers, one shared queue, 8 writers.
    const dp = grow(t, 0.8);
    const busy = inFlight.length > 0 ? 1 : 0;
    pen.ink(TXT).text("DATA PATH", 310, 172, { size: 10, p: dp });
    for (let k = 0; k < 8; k++) {
      const y = 196 + k * 17.5;
      const rk = inFlight.some((f) => f.b % 8 === k && f.p < 0.4);
      const wk = inFlight.some((f) => f.b % 8 === k && f.p > 0.6);
      pen.ink(lift(LINE, LIT, rk ? 1 : 0)).rect(310, y, 70, 12, dp);
      pen.ink(lift(LINE, LIT, wk ? 1 : 0)).rect(620, y, 70, 12, dp);
    }
    pen.ink(lift(LINE, LIT, busy * 0.6)).rect(410, 196, 180, 136, dp);
    pen.ink(TXT);
    pen.text("8 READERS", 345, 350, { size: 10, align: "center", p: dp });
    pen.text("SHARED QUEUE", 500, 350, { size: 10, align: "center", p: dp });
    pen.text("8 WRITERS", 655, 350, { size: 10, align: "center", p: dp });
    pen.ink(LINE);
    pen.line(260, 264, 304, 264, dp);
    pen.line(696, 264, 744, 264, dp);

    // Blocks in flight: out of the source cell, through a reader, the queue, a writer, home.
    pen.ink(LIT);
    for (const f of inFlight) {
      const [sx, sy] = cellAt(40, f.b);
      const [tx, ty] = cellAt(750, f.b);
      const lane = 202 + (f.b % 8) * 17.5;
      const qy = 214 + ((f.b * 5) % 6) * 20;
      pen.packet(
        [
          [sx + 14, sy + 14],
          [304, lane],
          [380, lane],
          [430 + ((f.b * 37) % 140), qy],
          [620, lane],
          [690, lane],
          [tx + 14, ty + 14],
        ],
        f.p,
        8,
      );
    }

    // The counter, and the figure on the card.
    const cg = grow(t, 1.0);
    pen.ink(lift(TXT, LIT, L > 4.9 ? 1 : 0));
    pen.text(L > 4.9 ? `BLOCKS STILL TO MOVE: ${left}` : "FULL COPY", 40, 368, { size: 11, p: cg });
    pen.ink(TXT).text("290 MB/S, WAS 70 MB/S", 310, 380, { size: 11, p: cg });
    pen.text("10,000+ PRODUCTION VMS MOVED", 310, 398, { size: 11, p: cg });

    // The legend: one density per round.
    const lg = grow(t, 1.2);
    ["FULL COPY", "CBT 1", "CBT 2", "CUTOVER"].forEach((name, r) => {
      const x = 40 + r * 110;
      pen.ink(LINE).rect(x, 476, 12, 12, lg);
      pen.ink(ROUNDS[r]!.ink * lg).fill(x, 476, 12, 12);
      pen.ink(TXT).text(name, x + 20, 482, { size: 10, p: lg });
    });
  },
};

/* ----------------------------------------------------------------------------------- VMTools */

const vmtools: Scene = {
  title: "VMTools",
  subtitle: "The agent inside every guest",
  period: 10,
  steps: [
    [0, "Report: VMTools collects data inside the guest"],
    [3, "Command: freeze the filesystem for a clean snapshot"],
    [6, "Then the control plane asks VMTools to thaw it"],
  ],
  draw(pen, t, L) {
    const hg = grow(t, 0, 0.7);
    pen.ink(DIM).rect(10, 40, 980, 470, hg);
    pen.ink(TXT).text("SMTX OS HOST", 24, 56, { size: 11, p: hg });

    // The control plane and what it knows.
    const cg = grow(t, 0.2, 0.6);
    pen.ink(LINE).rect(40, 86, 270, 320, cg);
    pen.ink(lift(TXT, LIT, 0.6)).text("CONTROL PLANE", 56, 106, { size: 12, p: cg });
    const known = L > 2.2;
    const fields: [string, string][] = [
      ["IP ADDRESS", "10.0.3.25"],
      ["HOSTNAME", "db-01"],
      ["DISK AND MEMORY", "disk 62%  mem 48%"],
    ];
    fields.forEach(([name, value], k) => {
      const y = 140 + k * 76;
      const g = grow(t, 0.4 + k * 0.1);
      const fresh = pulse(L, 2.2 + k * 0.12, 0.8);
      pen.ink(TXT).text(name, 56, y, { size: 10, p: g });
      pen.ink(lift(LINE, LIT, fresh)).rect(56, y + 12, 238, 34, g);
      pen.ink(known ? lift(TXT, LIT, 0.5 + fresh) : DIM);
      pen.text(known ? value : "unknown", 175, y + 29, {
        size: 12,
        align: "center",
        p: known ? win(L, 2.2 + k * 0.12, 0.35) : g,
      });
    });
    // The snapshot, taken while the filesystem is frozen.
    const shot = held(L, 5.4, 9.6, 0.3);
    if (shot > 0) {
      pen.ink(LIT * shot).rect(56, 362, 30, 24);
      pen.rect(61, 357, 30, 24);
      pen.text("SNAPSHOT", 100, 372, { size: 11 });
    }

    // The VM, the guest and the agent.
    const vg = grow(t, 0.4, 0.7);
    pen.ink(DIM).rect(400, 76, 570, 410, vg);
    pen.ink(TXT).text("QEMU VM", 414, 92, { size: 11, p: vg });
    pen.ink(DIM).rect(430, 112, 520, 350, grow(t, 0.6, 0.7));
    pen.ink(TXT).text("GUEST OS", 444, 128, { size: 11, p: grow(t, 0.6) });
    const ag = grow(t, 0.8);
    stateBox(pen, 510, 246, 150, 56, "VMTOOLS", 0.92, ag);

    // The channel through the wall of the VM.
    pen.ink(LINE).line(310, 274, 510, 274, grow(t, 0.7));
    pen.ink(TXT).text("VIRTIO-SERIAL", 360, 294, { size: 10, p: grow(t, 0.9) });
    const fast = held(L, 0, 2.6, 0.3);
    pen.ink(lift(LINE, LIT, fast)).line(320, 236, 500, 236, grow(t, 1.0));
    pen.line(320, 231, 320, 241, grow(t, 1.0));
    pen.line(500, 231, 500, 241, grow(t, 1.0));
    pen.ink(lift(TXT, LIT, fast)).text("RESPONSE 3 S TO 50 MS", 410, 222, { size: 10, align: "center", p: grow(t, 1.1) });

    // Inside the guest: what the agent reads and controls.
    const frozen = held(L, 4.2, 7.2, 0.15);
    const inner: [number, string, string][] = [
      [168, "NETWORK", "10.0.3.25"],
      [270, "FILESYSTEM", frozen > 0.5 ? "FROZEN" : "ACTIVE"],
      [372, "DISK, MEMORY", "62%  48%"],
    ];
    inner.forEach(([y, name, value], k) => {
      const g = grow(t, 1.0 + k * 0.1);
      pen.ink(DIM).line(660, 274, 760, y, g);
      pen.ink(TXT).text(name, 760, y - 26, { size: 10, p: g });
      stateBox(pen, 760, y - 16, 170, 32, value, k === 1 ? frozen : 0, g);
      pen.ink(LIT).packet([[760, y], [660, 274]], win(L, 0.3 + k * 0.15, 0.55));
    });

    // Messages on the channel, each with its words beside it.
    const msg = (from: number, to: number, a: number, label: string) => {
      const p = win(L, a, 0.9);
      if (p <= 0 || p >= 1) return;
      const x = from + (to - from) * ez(p);
      pen.ink(LIT).fill(x - 6, 268, 12, 12);
      pen.text(label, x, 256, { size: 11, align: "center" });
    };
    msg(510, 310, 1.1, "IP · HOSTNAME · USAGE");
    msg(310, 510, 3.1, "SNAPSHOT: SYNC AND FREEZE");
    msg(510, 310, 4.4, "FROZEN");
    msg(310, 510, 6.1, "THAW");

    pen.ink(DIM).text("ILLUSTRATIVE VALUES", 966, 500, { size: 10, align: "right", p: grow(t, 1.3) });
  },
};

/* ------------------------------------------------------------------------------ LLM papers */

const SOURCE = ["def total(prices):", "    s = 0", "    for p in prices:", "    s += p", "    return s"];
const TOKENS = [
  ["def", "total", "(", "prices", "):"],
  ["s", "=", "0"],
  ["for", "p", "in", "prices", ":"],
  ["s", "+=", "p", "*", "1.1"],
  ["return", "s"],
];
const PASS = 0.4;

/** When each token of the copy-as-decode output lands, in passes. Copying lines 1 to 3 is two
 *  instructions, writing line 4 is one plus a pass per token, copying line 5 is two more: ten
 *  passes, as in the GIF, where each instruction counts as one pass. */
const COPY_PASS = [
  [2, 2, 2, 2, 2],
  [2, 2, 2],
  [2, 2, 2, 2, 2],
  [4, 5, 6, 7, 8],
  [10, 10],
];

const copy: Scene = {
  title: "Copy-as-decode",
  subtitle: "Edit by copying, not by regenerating",
  period: 11,
  steps: [
    [0, "Copied lines go in one pass, like prefill"],
    [1.2, "Only the changed line is decoded, a token a pass"],
    [3.6, "The same edit: 10 passes instead of 20"],
  ],
  draw(pen, t, L) {
    // The file and the request.
    const fg = grow(t, 0, 0.6);
    pen.ink(DIM).rect(10, 60, 290, 420, fg);
    pen.ink(TXT).text("TOTAL.PY", 26, 80, { size: 11, p: fg });
    SOURCE.forEach((line, k) => {
      const y = 104 + k * 50;
      const g = grow(t, 0.2 + k * 0.08);
      const copying = (k < 3 && held(L, 0, 0.8, 0.15)) || (k === 4 && held(L, 3.6, 4.0, 0.12));
      const changed = k === 3 ? held(L, 1.2, 3.3, 0.2) : 0;
      pen.ink(lift(LINE, LIT, Math.max(Number(copying), changed))).rect(26, y, 258, 36, g);
      if (changed > 0) {
        pen.ink(LIT * changed).fill(26, y, 258, 36);
        pen.paper(changed);
      } else {
        pen.ink(lift(TXT, LIT, Number(copying)));
      }
      pen.text(`${k + 1}  ${line}`, 38, y + 18, { size: 12, p: g });
    });
    pen.ink(TXT).text("REQUEST: ADD 10% TAX", 26, 382, { size: 11, p: grow(t, 0.7) });
    pen.text("LINE 4 BECOMES", 26, 404, { size: 11, p: grow(t, 0.8) });
    pen.ink(LIT).text("s += p * 1.1", 140, 404, { size: 12, p: grow(t, 0.9) });

    const lane = (y0: number, name: string, at: (r: number, k: number) => number, passes: number, done: boolean, d: number) => {
      const g = grow(t, d, 0.6);
      pen.ink(DIM).rect(330, y0, 660, 200, g);
      pen.ink(lift(TXT, LIT, 0.4)).text(name, 346, y0 + 18, { size: 12, p: g });
      pen.ink(TXT).text("PASSES", 974, y0 + 18, { size: 10, align: "right", p: g });
      pen.ink(done ? LIT : lift(TXT, LIT, 0.5)).text(String(passes), 974, y0 + 52, { size: 28, align: "right", p: g });
      TOKENS.forEach((row, r) => {
        const y = y0 + 44 + r * 30;
        pen.ink(DIM).text(String(r + 1), 470, y + 10, { size: 10, align: "right", p: g });
        let x = 484;
        row.forEach((tok, k) => {
          const w = pen.measure(tok, 12) + 14;
          const landAt = at(r, k) * PASS;
          if (L >= landAt) {
            const fresh = clamp01(1 - (L - landAt) / 0.5);
            const copied = name !== "NORMAL MODEL" && r !== 3;
            if (copied) {
              pen.ink(lift(0.55, LIT, fresh)).fill(x, y, w, 20);
              pen.paper(1);
            } else {
              pen.ink(lift(LINE + 0.15, LIT, fresh)).rect(x, y, w, 20);
              pen.ink(lift(TXT + 0.2, LIT, fresh));
            }
            pen.text(tok, x + w / 2, y + 10, { size: 12, align: "center" });
          }
          x += w + 5;
        });
      });
    };

    const normalAt = (r: number, k: number) => {
      let before = 0;
      for (let q = 0; q < r; q++) before += TOKENS[q]!.length;
      return before + k + 1;
    };
    const n = Math.min(20, Math.floor(L / PASS));
    lane(60, "NORMAL MODEL", normalAt, n, n >= 20, 0.4);
    const cp = Math.min(10, Math.floor(L / PASS));
    lane(280, "COPY-AS-DECODE", (r, k) => COPY_PASS[r]![k]!, cp, cp >= 10, 0.6);

    // The instructions the copying model writes, each on the row it produces.
    const ops: [number, number, string][] = [
      [1, 0, "COPY LINES 1-3"],
      [3, 3, "WRITE LINE 4"],
      [9, 4, "COPY LINE 5"],
    ];
    for (const [at, row, label] of ops) {
      if (L < at * PASS) continue;
      const y = 280 + 44 + row * 30;
      const on = clamp01(1 - (L - at * PASS) / 0.8);
      pen.ink(lift(LINE + 0.15, LIT, on)).rect(346, y, 112, 20);
      pen.ink(lift(TXT, LIT, on)).text(label, 402, y + 10, { size: 10, align: "center" });
    }
    if (cp >= 10) {
      pen.ink(LIT * win(L, 4.0, 0.4)).text("DONE AFTER 10 PASSES", 974, 452, { size: 11, align: "right" });
    }
    pen.ink(DIM).text("EACH INSTRUCTION COUNTED AS ONE PASS. REAL FILES COPY FAR MORE.", 330, 500, {
      size: 10,
      p: grow(t, 1.2),
    });
    pen.ink(TXT).text("UP TO 13X FASTER, BY THE PAPER'S BOUND", 990, 500, { size: 10, align: "right", p: grow(t, 1.3) });
  },
};

/* ----------------------------------------------------------------------------- mathematics */

/** p as the loop runs: from 2 toward infinity, by a doubling clock. */
const pOf = (L: number) => 2 * Math.pow(2, clamp01(L / 6) * 5.4);

/** The unit ball of the lp norm in the plane, as a closed path. */
function ball(cx: number, cy: number, r: number, p: number): P[] {
  const pts: P[] = [];
  for (let k = 0; k <= 160; k++) {
    const a = (k / 160) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const n = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p);
    pts.push([cx + (r * c) / n, cy - (r * s) / n]);
  }
  return pts;
}

/* The path of Yp, drawn as a spiral that tightens into its limit. It is a picture of
   convergence, not a computed path: the preprint proves the limit exists. */
const pathAt = (p: number): P => {
  const k = Math.log2(p / 2);
  const r = 120 * Math.pow(0.62, k);
  const a = k * 1.15 + 0.4;
  return [510 + r * Math.cos(a), 270 + r * Math.sin(a) * 0.8];
};

const maths: Scene = {
  title: "Limits of Schatten best approximants",
  subtitle: "The 3x3 counterexample",
  period: 11,
  steps: [
    [0, "Minimise the lp norm of the residual singular values"],
    [3.5, "As p goes to infinity, Yp always converges"],
    [7, "The limit need not be the strict approximant"],
  ],
  draw(pen, t, L) {
    const p = pOf(L);
    const pShown = p > 60 ? "∞" : p.toFixed(p < 10 ? 2 : 1);

    // The norm: unit balls, faint for the ones already passed, bright for the current one.
    const cx = 160;
    const cy = 270;
    const r = 110;
    const g = grow(t, 0, 0.7);
    pen.ink(LINE);
    pen.line(cx - r - 30, cy, cx + r + 30, cy, g);
    pen.line(cx, cy + r + 30, cx, cy - r - 30, g);
    pen.ink(TXT);
    pen.text("σ1", cx + r + 36, cy, { size: 12, p: g });
    pen.text("σ2", cx, cy - r - 42, { size: 12, align: "center", p: g });
    for (const q of [2, 4, 8, 32]) {
      if (q < p) pen.ink(DIM).poly(ball(cx, cy, r, q), g);
    }
    pen.ink(LIT).poly(ball(cx, cy, r, p), grow(t, 0.3, 1));
    pen.ink(lift(TXT, LIT, held(L, 0, 3.5))).text(`p = ${pShown}`, cx, cy + r + 56, {
      size: 16,
      align: "center",
      p: g,
    });
    pen.ink(TXT).text("UNIT BALL OF THE SCHATTEN-p NORM", cx, cy - r - 70, {
      size: 10,
      align: "center",
      p: grow(t, 0.4),
    });

    // The path of Yp, closing on its limit.
    const pg = grow(t, 0.5, 0.7);
    const lit = held(L, 3.5, 7, 0.4);
    pen.ink(TXT).text("Yp = argmin ‖A − Y‖Sp", 510, 100, { size: 12, align: "center", p: pg });
    const dots: P[] = [];
    for (let q = 2; q <= p; q *= 1.18) dots.push(pathAt(q));
    if (dots.length > 1) pen.ink(lift(LINE, LIT, lit * 0.6)).poly(dots);
    dots.forEach(([x, y], k) => {
      pen.ink(lift(LINE, LIT, k === dots.length - 1 ? 1 : lit * 0.5)).disc(x, y, 2.4);
    });
    const [lx, ly] = pathAt(1e9);
    pen.ink(lift(LINE, LIT, lit)).circle(lx, ly, 13, pg);
    pen.ink(DIM).dashed(lx, ly + 16, lx, 410, pg);
    pen.ink(lift(TXT, LIT, lit)).text("Y∞ = lim Yp EXISTS", lx, 426, { size: 12, align: "center", p: pg });
    pen.ink(TXT).text("A SPECTRAL-NORM BEST APPROXIMANT", lx, 446, { size: 10, align: "center", p: pg });

    // The counterexample: the residual singular values of the limit and of the strict one.
    const bg = grow(t, 0.8, 0.7);
    const bars = held(L, 7, 10.7, 0.4);
    const base = 400;
    const group = (x: number, name: string, vals: number[], d: number) => {
      const gp = grow(t, d);
      pen.ink(LINE).line(x - 10, base, x + 120, base, gp);
      vals.forEach((v, k) => {
        const h = v * 200 * ez(bars * 1.2 + 0.25);
        const bx = x + k * 40;
        pen.ink(lift(LINE, LIT, k === 2 ? bars : 0.4)).rect(bx, base - h, 22, h, gp);
        pen.ink(TXT).text(`σ${k + 1}`, bx + 11, base + 16, { size: 11, align: "center", p: gp });
      });
      pen.ink(lift(TXT, LIT, bars)).text(name, x + 50, base + 44, { size: 11, align: "center", p: gp });
    };
    group(700, "LIMIT Y∞", [1, 0.72, 0.18], 0.9);
    group(850, "STRICT", [1, 0.72, 0], 1.0);
    pen.ink(LIT * bars);
    // σ3 is the third bar of each group: 80 units in, 11 to its centre.
    pen.circle(791, base - 0.18 * 200 * ez(bars * 1.2 + 0.25), 16);
    pen.text("σ3 > 0", 791, 140, { size: 13, align: "center" });
    pen.text("σ3 = 0", 941, 140, { size: 13, align: "center" });
    pen.ink(TXT).text("THIRD RESIDUAL SINGULAR VALUE", 840, 100, { size: 10, align: "center", p: bg });
    pen.ink(DIM).text("A 3X3 CASE DISPROVES ZIĘTAK'S 2017 CONJECTURE. BARS ILLUSTRATIVE.", 990, 500, {
      size: 10,
      align: "right",
      p: grow(t, 1.3),
    });
  },
};

/* ---------------------------------------------------------------------------- student blog */

/* The student blog as a memory: a stick figure walks the years he wrote it, and at each stop it
   tries something and thinks. It reads (deep learning, blockchain), builds (Java, Spring),
   looks further (Redis, the JVM, distributed systems), stands at a signpost and scratches its
   head, and walks on to now. One arm of the signpost points back to the old blog. The words
   in its thought bubbles are the subjects of his posts. Everything is in English, as the rest
   of the page is, though the blog itself is in Chinese. The date in the corner walks with it,
   from the first post to the last. */

interface Pose {
  /** Torso lean from upright, forward positive. */
  lean: number;
  /** Head tilt on top of the lean. */
  head: number;
  /** Thighs from straight down, forward positive: [near, far]. */
  th: [number, number];
  /** Knee bend: the shin swings back by this much. */
  kn: [number, number];
  /** Upper arms from straight down, forward positive. */
  ua: [number, number];
  /** Elbow bend: the forearm swings forward by this much. */
  el: [number, number];
  /** How far the hip sits above the ground. */
  hip: number;
}

const STAND_HIP = 68;
const THIGH = 34;
const SHIN = 34;
const TORSO = 54;
const UPPER = 26;
const FORE = 24;

const pose = (p: Partial<Pose>): Pose => ({
  lean: 0,
  head: 0,
  th: [0.06, -0.06],
  kn: [0, 0],
  ua: [0.12, -0.12],
  el: [0.15, 0.15],
  hip: STAND_HIP,
  ...p,
});

const STAND = pose({});
const THINK = pose({ lean: 0.04, head: 0.2, ua: [0.55, 0.25], el: [2.45, 1.45] });
const SIT = pose({ lean: -0.05, head: 0.12, th: [1.45, 1.35], kn: [1.45, 1.3], ua: [0.6, 0.45], el: [1.2, 1.35], hip: 40 });
const BEND = pose({ lean: 0.95, head: 0.3, th: [0.12, -0.04], kn: [0.25, 0.2], ua: [1.15, 1.0], el: [0.1, 0.1], hip: 64 });
const LIFT = pose({ head: -0.2, ua: [2.75, 2.6], el: [0.15, 0.2] });
const PLACE = pose({ lean: 0.12, head: 0.1, ua: [1.55, 1.45], el: [0.25, 0.25] });
const LOOK = pose({ lean: 0.12, head: -0.3, th: [0.08, -0.1], ua: [1.75, 1.45], el: [0.9, 1.15] });
const SCRATCH = pose({ lean: 0.02, head: 0.24, ua: [2.55, 0.2], el: [1.9, 0.25] });

function walkPose(phase: number): Pose {
  const s = Math.sin(phase);
  return pose({
    lean: 0.07,
    th: [0.42 * s, -0.42 * s],
    kn: [0.15 + 0.5 * Math.max(0, -s), 0.15 + 0.5 * Math.max(0, s)],
    ua: [-0.35 * s, 0.35 * s],
    el: [0.35, 0.35],
    hip: STAND_HIP - 2.5 * Math.abs(Math.sin(phase * 2) * 0.5),
  });
}

const mix = (a: Pose, b: Pose, k: number): Pose => {
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    lean: m(a.lean, b.lean),
    head: m(a.head, b.head),
    th: [m(a.th[0], b.th[0]), m(a.th[1], b.th[1])],
    kn: [m(a.kn[0], b.kn[0]), m(a.kn[1], b.kn[1])],
    ua: [m(a.ua[0], b.ua[0]), m(a.ua[1], b.ua[1])],
    el: [m(a.el[0], b.el[0]), m(a.el[1], b.el[1])],
    hip: m(a.hip, b.hip),
  };
};

/** Draws the figure standing on `ground` at `x`, facing right. Returns where its head and
 *  hands are, for the props it holds. */
function figure(pen: Pen, x: number, ground: number, p: Pose) {
  const hip: P = [x, ground - p.hip];
  const neck: P = [hip[0] + TORSO * Math.sin(p.lean), hip[1] - TORSO * Math.cos(p.lean)];
  const tilt = p.lean + p.head;
  const head: P = [neck[0] + 15 * Math.sin(tilt), neck[1] - 15 * Math.cos(tilt)];
  const shoulder: P = [neck[0] - 5 * Math.sin(p.lean), neck[1] + 5 * Math.cos(p.lean)];
  pen.line(hip[0], hip[1], neck[0], neck[1]);
  pen.circle(head[0], head[1], 11);
  const hands: P[] = [];
  for (const i of [0, 1] as const) {
    const knee: P = [hip[0] + THIGH * Math.sin(p.th[i]), hip[1] + THIGH * Math.cos(p.th[i])];
    const shin = p.th[i] - p.kn[i];
    const foot: P = [knee[0] + SHIN * Math.sin(shin), knee[1] + SHIN * Math.cos(shin)];
    pen.poly([hip, knee, foot]);
    const elbow: P = [shoulder[0] + UPPER * Math.sin(p.ua[i]), shoulder[1] + UPPER * Math.cos(p.ua[i])];
    const fore = p.ua[i] + p.el[i];
    const hand: P = [elbow[0] + FORE * Math.sin(fore), elbow[1] + FORE * Math.cos(fore)];
    pen.poly([shoulder, elbow, hand]);
    hands.push(hand);
  }
  return { head, hands: hands as [P, P] };
}

/** A thought: three rising dots and a bubble with words in it. */
function thought(pen: Pen, head: P, words: string, a: number) {
  if (a <= 0) return;
  pen.ink(LINE * a);
  pen.circle(head[0] + 14, head[1] - 16, 2);
  pen.circle(head[0] + 22, head[1] - 27, 3);
  pen.circle(head[0] + 32, head[1] - 40, 4);
  const w = Math.max(30, pen.measure(words, 14) + 22);
  const bx = Math.min(head[0] + 26, 980 - w);
  const by = head[1] - 78;
  const r = 13;
  pen.ctx.beginPath();
  pen.ctx.roundRect(bx, by, w, 28, r);
  pen.ctx.stroke();
  pen.ink(LIT * a).text(words, bx + w / 2, by + 14, { size: 14, align: "center" });
}

const GROUND = 440;

/** The walk: where it stops, for how long, and what it does there. */
const STOPS = [
  { x: 130, from: 0.4, to: 2.6, act: "think", words: "?" },
  { x: 300, from: 4.1, to: 6.8, act: "read", words: "CNN · GAN · blockchain" },
  { x: 500, from: 8.3, to: 11.0, act: "build", words: "Java · Spring" },
  { x: 680, from: 12.5, to: 15.0, act: "look", words: "Redis · JVM · distributed" },
  { x: 840, from: 16.4, to: 19.0, act: "wonder", words: "Which way?" },
] as const;
const EXIT_AT = 19.0;
const WALK_SPEED = 120;

const DAY = 86400000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;
/** 2021.03.25: the date as an old camera stamps it. */
const stamp = (d: number) => new Date(d * DAY).toISOString().slice(0, 10).replaceAll("-", ".");

const BLOG_FIRST = day("2021-03-25");
const BLOG_LAST = day("2022-05-26");

const notes: Scene = {
  title: "His old blog",
  subtitle: "From his student days, 2021 to 2022",
  period: 22,
  steps: [
    [0, "A student, mostly backend, thinking"],
    [4.1, "Reading: deep learning, blockchain"],
    [8.3, "Building: Java, the web, Spring"],
    [12.5, "Looking further: Redis, the JVM, distributed systems"],
    [16.4, "Finding the way"],
    [EXIT_AT, "And on, to now"],
  ],
  draw(pen, t, L) {
    /* Who he was then. In the past tense and dated: the blog's own front page says "I am a
       student", and quoted as it stands, a visitor read it as who he is now. */
    const who = grow(t, 0, 0.6);
    pen.ink(LIT * 0.9).text("His old blog", 40, 64, { size: 22, p: who });
    pen.ink(TXT).text("2021 to 2022, from his student days: mostly backend, some machine learning", 40, 96, {
      size: 14,
      p: who,
    });

    // The ground, the stops along it, and now at its end.
    const g = grow(t, 0.2, 0.9);
    pen.ink(LINE).line(20, GROUND, 980, GROUND, g);
    pen.ink(DIM).dashed(950, GROUND - 160, 950, GROUND, g);
    pen.ink(TXT).text("2026", 950, GROUND - 172, { size: 11, align: "center", p: g });

    // Where it is and what it is doing.
    let x: number = STOPS[0].x;
    let p: Pose = STAND;
    let stop = -1;
    let k = 0;
    let walked = 0;
    for (let i = 0; i < STOPS.length; i++) {
      const st = STOPS[i]!;
      const prev = STOPS[i - 1];
      const leave = prev ? prev.to : 0;
      if (L >= leave && L < st.from && prev) {
        const u = clamp01((L - leave) / (st.from - leave));
        x = prev.x + (st.x - prev.x) * u;
        walked = x;
        p = walkPose(walked * 0.075);
        stop = -1;
        break;
      }
      if (L >= st.from && L < st.to) {
        x = st.x;
        stop = i;
        k = L - st.from;
        break;
      }
      if (i === STOPS.length - 1 && L >= st.to) {
        x = st.x + (L - st.to) * WALK_SPEED;
        p = walkPose(x * 0.075);
        stop = -2;
      }
    }

    // The props, drawn before the figure so it stands in front of them.
    const books = grow(t, 0.4);
    pen.ink(LINE);
    pen.rect(268, GROUND - 13, 66, 13, books);
    pen.rect(272, GROUND - 26, 58, 13, books);
    pen.rect(266, GROUND - 39, 62, 13, books);

    const placed = stop === 2 ? (k > 1.9 ? 3 : 2) : L >= STOPS[2].to ? 3 : 2;
    for (let b = 0; b < placed; b++) pen.ink(LINE).rect(540, GROUND - 22 - b * 22, 22, 22, grow(t, 0.5));
    // The block it will pick up waits on the ground, until it is picked up.
    if (L < STOPS[2].from + 0.5) pen.ink(LINE).rect(512, GROUND - 22, 22, 22, grow(t, 0.55));

    // The telescope on its tripod, and the sky it points at.
    const tg = grow(t, 0.6);
    pen.ink(LINE);
    pen.line(712, GROUND - 92, 760, GROUND - 128, tg);
    pen.line(700, GROUND - 83, 712, GROUND - 92, tg);
    pen.line(730, GROUND - 106, 716, GROUND, tg);
    pen.line(730, GROUND - 106, 744, GROUND, tg);
    pen.line(730, GROUND - 106, 730, GROUND, tg);
    const looking = stop === 3 ? held(k, 0.3, 2.3, 0.3) : 0;
    [[790, 170], [840, 140], [880, 200], [810, 230], [905, 160], [760, 190]].forEach(([sx, sy], n) => {
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + n * 1.7);
      pen.ink(lift(DIM, LIT, looking * tw)).disc(sx!, sy!, 1.6 + looking * tw);
    });
    if (looking > 0) {
      const sh = clamp01((k - 1.0) / 0.6);
      if (sh > 0 && sh < 1) pen.ink(LIT * (1 - sh)).line(860 + sh * 80, 120 + sh * 40, 860 + sh * 80 - 40, 120 + sh * 40 - 20);
    }

    // The signpost at the fork.
    const sg = grow(t, 0.7);
    const wondering = stop === 4 ? 1 : 0;
    pen.ink(lift(LINE, LIT, wondering * 0.6));
    pen.line(880, GROUND, 880, GROUND - 120, sg);
    pen.poly([[880, GROUND - 112], [930, GROUND - 112], [940, GROUND - 102], [930, GROUND - 92], [880, GROUND - 92]], sg);
    pen.poly([[880, GROUND - 84], [806, GROUND - 84], [796, GROUND - 74], [806, GROUND - 64], [880, GROUND - 64]], sg);
    // One arm points on, to now. The other points back, to the old blog.
    pen.ink(lift(TXT, LIT, wondering)).text("NOW", 906, GROUND - 102, { size: 11, align: "center", p: sg });
    pen.text("MY OLD BLOG", 843, GROUND - 74, { size: 10, align: "center", p: sg });

    // What it does at each stop.
    if (stop >= 0) {
      const st = STOPS[stop]!;
      const span = st.to - st.from;
      const into = Math.min(1, k / 0.35);
      const outOf = Math.min(1, (span - k) / 0.35);
      const blend = Math.min(into, outOf);
      const walkIn = walkPose(x * 0.075);
      let target: Pose = STAND;
      if (st.act === "think") target = THINK;
      if (st.act === "read") target = SIT;
      if (st.act === "look") target = LOOK;
      if (st.act === "wonder") {
        target = { ...SCRATCH, el: [SCRATCH.el[0] + (k < 1.6 ? 0.25 * Math.sin(t * 16) : 0), SCRATCH.el[1]] };
        if (k > 1.6) target = THINK;
      }
      if (st.act === "build") {
        target = k < 0.8 ? BEND : k < 1.5 ? LIFT : k < 2.1 ? PLACE : THINK;
      }
      p = mix(walkIn, target, ez(blend));
    }

    pen.ink(LIT * grow(t, 0.3));
    const fig = figure(pen, x, GROUND, p);

    // What it holds.
    if (stop === 1) {
      // A book, open, its page turning now and then.
      const [hx, hy] = fig.hands[0];
      pen.ink(LIT * held(k, 0.4, 2.4, 0.2));
      pen.rect(hx - 4, hy - 14, 26, 18);
      const flip = (k * 1.2) % 1;
      pen.line(hx + 9, hy - 14, hx + 9 + 12 * Math.cos(flip * Math.PI), hy - 14 - 4 * Math.sin(flip * Math.PI));
    }
    if (stop === 2 && k > 0.5 && k < 1.95) {
      const [hx, hy] = fig.hands[0];
      pen.ink(LIT).rect(hx - 11, hy - 22, 22, 22);
    }

    // What it thinks.
    if (stop >= 0) {
      const st = STOPS[stop]!;
      const a = held(k, 0.5, st.to - st.from - 0.2, 0.3);
      const words = st.act === "wonder" && k > 1.6 ? "!" : st.words;
      thought(pen, fig.head, words, a);
    }

    // The date, stamped in the corner as an old camera stamps it, walking with the figure.
    const u = clamp01(L / EXIT_AT);
    const date = L >= EXIT_AT + 1.2 ? "2026" : stamp(BLOG_FIRST + (BLOG_LAST - BLOG_FIRST) * u);
    pen.ink(lift(LINE, LIT, 0.75)).text(date, 960, 64, { size: 20, align: "right", p: grow(t, 0.3) });
    pen.ink(DIM).text("48 POSTS, IN CHINESE", 40, 520, { size: 10, p: grow(t, 1.2) });
  },
};

/** The cards that have a drawing. lumen shows its own page instead. */
export type Drawn = Exclude<Art, "lumen">;

export const SCENES: Record<Drawn, Scene> = {
  book: fastmm,
  candles: binance,
  desk: bndesk,
  wave: vox,
  migrate: v2v,
  guest: vmtools,
  copy,
  matrix: maths,
  notes,
};
