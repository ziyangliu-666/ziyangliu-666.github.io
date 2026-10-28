/* The faint drawing behind each highlight card. One per topic: an order book for FastMM,
 * candles for the Binance results, a waveform for vox, and so on.
 *
 * They are line art in one stroke weight and no fill, in `currentColor`, so they read as more
 * of the scene behind the page and not as pictures pasted onto it. Screenshots were the other
 * option, and they came in four palettes: a beige hand drawing, a lavender gradient, a coloured
 * dashboard, and a white diagram. On a black and white page that is noise.
 *
 * Every drawing uses the same 240 × 160 box with its weight on the right, because the card
 * fades the drawing out towards the left, where the text is. The shapes are computed from
 * fixed formulas, not random numbers, so a card looks the same on every visit. */

import type React from "react";

export type Art =
  | "book"
  | "candles"
  | "desk"
  | "wave"
  | "migrate"
  | "guest"
  | "copy"
  | "matrix"
  | "lumen"
  | "notes";

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/* FastMM: an order book. Asks above the spread, bids below, each level a bar whose length is
   its size. */
function Book() {
  return (
    <>
      {range(10).map((i) => {
        const y = 8 + i * 15 + (i >= 5 ? 6 : 0);
        const w = 24 + ((i * 37) % 70);
        return <rect key={i} x={226 - w} y={y} width={w} height={8} rx={1.5} />;
      })}
      <line x1={110} y1={84} x2={236} y2={84} strokeDasharray="3 4" />
    </>
  );
}

/* Binance: a row of candles, drifting up. */
function Candles() {
  return (
    <>
      {range(9).map((i) => {
        const x = 50 + i * 21;
        const mid = 110 - i * 7 + ((i * 29) % 23) - 11;
        const body = 10 + ((i * 17) % 22);
        return (
          <g key={i}>
            <line x1={x + 5} y1={mid - body / 2 - 9} x2={x + 5} y2={mid + body / 2 + 9} />
            <rect x={x} y={mid - body / 2} width={10} height={body} rx={1} />
          </g>
        );
      })}
    </>
  );
}

/* bndesk: dashboard panels, one with a P&L line, one with bars. */
function Desk() {
  const pnl = range(12)
    .map((i) => `${116 + i * 10},${58 - i * 2.6 + ((i * 41) % 17) - 8}`)
    .join(" ");
  return (
    <>
      <rect x={108} y={14} width={124} height={62} rx={5} />
      <polyline points={pnl} />
      <rect x={108} y={86} width={58} height={60} rx={5} />
      {range(5).map((i) => (
        <line key={i} x1={118 + i * 10} y1={136} x2={118 + i * 10} y2={136 - 10 - ((i * 23) % 30)} />
      ))}
      <rect x={174} y={86} width={58} height={60} rx={5} />
      {range(4).map((i) => (
        <line key={i} x1={184} y1={100 + i * 11} x2={222 - ((i * 13) % 20)} y2={100 + i * 11} />
      ))}
    </>
  );
}

/* vox: a voice waveform, loudest in the middle. */
function Wave() {
  return (
    <>
      {range(24).map((i) => {
        const h = 6 + Math.abs(Math.sin(i * 0.7)) * 40 * Math.sin((Math.PI * (i + 1)) / 25);
        const x = 66 + i * 7;
        return <line key={i} x1={x} y1={80 - h} x2={x} y2={80 + h} />;
      })}
    </>
  );
}

/* V2V OS: blocks copied from one disk to another, the destination still filling. */
function Migrate() {
  const cell = (x: number, y: number, k: string) => (
    <rect key={k} x={x} y={y} width={12} height={12} rx={1.5} />
  );
  return (
    <>
      {range(4).flatMap((c) => range(7).map((r) => cell(84 + c * 16, 24 + r * 16, `s${c}${r}`)))}
      {range(4).flatMap((c) =>
        range(7)
          .filter((r) => r * 4 + c < 19)
          .map((r) => cell(174 + c * 16, 24 + r * 16, `d${c}${r}`)),
      )}
      {[52, 84, 116].map((y) => (
        <line key={y} x1={150} y1={y} x2={168} y2={y} strokeDasharray="2 3" />
      ))}
    </>
  );
}

/* VMTools: a guest inside its host, with the agent's channel running through the wall and
   a heartbeat inside. */
function Guest() {
  return (
    <>
      <rect x={92} y={18} width={140} height={124} rx={9} />
      <rect x={116} y={42} width={96} height={76} rx={6} />
      <line x1={60} y1={80} x2={116} y2={80} strokeDasharray="3 4" />
      <polyline points="124,84 146,84 154,64 164,104 172,76 178,84 204,84" />
    </>
  );
}

/* Copy-as-Decode and its siblings: an input line of tokens, an output line, and arcs where
   the output copies a span of the input instead of writing it again. */
function Copy() {
  const tokens = (y: number, k: string) =>
    range(9).map((i) => (
      <rect key={`${k}${i}`} x={92 + i * 15} y={y} width={11} height={9} rx={1.5} />
    ));
  return (
    <>
      {tokens(30, "in")}
      {tokens(122, "out")}
      <path d="M 100 39 C 100 80, 115 80, 115 122" />
      <path d="M 145 39 C 145 85, 160 85, 160 122" />
      <path d="M 205 39 C 205 85, 220 85, 220 122" />
    </>
  );
}

/* The mathematics: a 3 × 3 matrix in brackets, one entry ringed. */
function Matrix() {
  return (
    <>
      <path d="M 124 22 L 112 22 L 112 138 L 124 138" />
      <path d="M 212 22 L 224 22 L 224 138 L 212 138" />
      {range(3).flatMap((r) =>
        range(3).map((c) => <circle key={`${r}${c}`} cx={136 + c * 32} cy={42 + r * 38} r={5} />),
      )}
      <circle cx={168} cy={80} r={13} strokeDasharray="3 3" />
    </>
  );
}

/* lumen: its halftone sphere. Dots on a fixed grid, larger where the sun falls, the one
   drawing here that is filled, because a halftone is made of filled dots. */
function Sphere() {
  const dots: React.ReactNode[] = [];
  const cx = 176;
  const cy = 80;
  const r = 58;
  for (let y = cy - r; y <= cy + r; y += 8) {
    for (let x = cx - r; x <= cx + r; x += 8) {
      const nx = (x - cx) / r;
      const ny = (y - cy) / r;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const lit = Math.max(0, 0.75 * nx - 0.45 * ny + 0.5 * Math.sqrt(1 - q));
      const rad = 3.4 * Math.sqrt(Math.min(1, lit));
      if (rad > 0.5) dots.push(<circle key={`${x},${y}`} cx={x} cy={y} r={rad} fill="currentColor" stroke="none" />);
    }
  }
  return (
    <>
      {dots}
      <ellipse cx={cx} cy={cy} rx={88} ry={16} strokeDasharray="1 5" transform={`rotate(-12 ${cx} ${cy})`} />
    </>
  );
}

/* The student blog: a stack of note pages, the top one written on. */
function Notes() {
  return (
    <>
      <rect x={140} y={30} width={74} height={100} rx={3} />
      <rect x={132} y={24} width={74} height={100} rx={3} />
      <rect x={124} y={18} width={74} height={100} rx={3} />
      {range(7).map((i) => (
        <line key={i} x1={134} y1={34 + i * 11} x2={188 - ((i * 17) % 26)} y2={34 + i * 11} />
      ))}
    </>
  );
}

const DRAWINGS: Record<Art, () => React.ReactNode> = {
  book: Book,
  candles: Candles,
  desk: Desk,
  wave: Wave,
  migrate: Migrate,
  guest: Guest,
  copy: Copy,
  matrix: Matrix,
  lumen: Sphere,
  notes: Notes,
};

/** `align` "center" is for the deck on a phone, where the emblem fills a screen of its own. */
export function CardArt({ art, align = "right" }: { art: Art; align?: "right" | "center" }) {
  const Drawing = DRAWINGS[art];
  return (
    <svg
      className="card-art"
      viewBox="0 0 240 160"
      /* Pinned to the right and scaled whole, never cropped. On a closed card it is a small
         emblem at the right end; as the preview unfolds, it grows to fill the card. Cropping
         to fill showed a closed card only a middle strip of the drawing, which named nothing. */
      preserveAspectRatio={align === "center" ? "xMidYMid meet" : "xMaxYMid meet"}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
    >
      <Drawing />
    </svg>
  );
}
