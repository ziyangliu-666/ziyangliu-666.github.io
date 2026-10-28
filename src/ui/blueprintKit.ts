/* The drawing kit for the blueprints: the design box, the ink levels, the timing helpers and
 * the pen. See blueprint.ts for what the drawings are and why they look the way they do. */

export type P = readonly [number, number];

/** A drawing of one project. */
export interface Scene {
  title: string;
  subtitle: string;
  /** The steps of the loop: when each starts, in seconds into the loop, and its caption. */
  steps: readonly (readonly [number, string])[];
  /** Seconds per loop, after the drawing has built. */
  period: number;
  /** `t` runs from the moment the drawing opened, `L` from the start of this loop. */
  draw(pen: Pen, t: number, L: number, cycle: number): void;
}

/** The design box every drawing works in. */
export const BOX_W = 1000;
export const BOX_H = 560;

/** Seconds the drawing takes to build before its loop starts. */
export const BUILD = 1.8;

/** Three levels of ink, and no others: waiting, structure, working. Text has its own. */
export const DIM = 0.16;
export const LINE = 0.36;
export const LIT = 0.95;
export const TXT = 0.55;

const TAU = Math.PI * 2;

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Ease out: fast start, soft landing. Every build and every move uses it. */
export const ez = (x: number) => 1 - (1 - clamp01(x)) ** 3;
/** 0 before `a`, 1 after `a + d`, linear between. */
export const win = (L: number, a: number, d: number) => clamp01((L - a) / d);
/** A bump from 0 to 1 and back over `d` seconds from `a`. */
export const pulse = (L: number, a: number, d: number) => {
  const k = win(L, a, d);
  return k > 0 && k < 1 ? Math.sin(Math.PI * k) : 0;
};
/** 1 between `a` and `b`, with short fades at both ends. */
export const held = (L: number, a: number, b: number, fade = 0.25) =>
  Math.min(win(L, a, fade), 1 - win(L, b, fade));

/** Mixes two ink levels: `k` = 0 is `lo`, 1 is `hi`. */
export const lift = (lo: number, hi: number, k: number) => lo + (hi - lo) * clamp01(k);

/**
 * The drawing kit. Every mark takes a progress `p` from 0 to 1, so a line draws itself on, a
 * box draws its outline round from the top-left corner, and text types itself out. One stroke
 * weight: one CSS pixel at any scale.
 */
export class Pen {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    /** CSS pixels per design unit. */
    readonly s: number,
    /** The opacity of the whole drawing, for fades. */
    readonly a: number,
    private readonly rgb: string,
    private readonly bgRgb: string,
    private readonly mono: string,
  ) {
    ctx.lineWidth = 1 / s;
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
  }

  /** Sets the ink for the marks that follow. */
  ink(alpha: number): this {
    const c = `rgba(${this.rgb},${(alpha * this.a).toFixed(3)})`;
    this.ctx.strokeStyle = c;
    this.ctx.fillStyle = c;
    return this;
  }

  /** The page colour, for text on a filled box. */
  paper(alpha = 1): this {
    this.ctx.fillStyle = `rgba(${this.bgRgb},${(alpha * this.a).toFixed(3)})`;
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, p = 1): void {
    this.poly([[x1, y1], [x2, y2]], p);
  }

  dashed(x1: number, y1: number, x2: number, y2: number, p = 1): void {
    this.ctx.setLineDash([3 / this.s, 4 / this.s]);
    this.line(x1, y1, x2, y2, p);
    this.ctx.setLineDash([]);
  }

  poly(pts: readonly P[], p = 1): void {
    if (p <= 0 || pts.length < 2) return;
    const c = this.ctx;
    c.beginPath();
    c.moveTo(pts[0]![0], pts[0]![1]);
    if (p >= 1) {
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1]);
    } else {
      const [x, y] = along(pts, p, true);
      for (let i = 1; i < pts.length; i++) {
        if (i > walked) break;
        c.lineTo(pts[i]![0], pts[i]![1]);
      }
      c.lineTo(x, y);
    }
    c.stroke();
  }

  /** An outline, drawn round from the top-left corner. */
  rect(x: number, y: number, w: number, h: number, p = 1): void {
    this.poly(
      [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
        [x, y],
      ],
      p,
    );
  }

  fill(x: number, y: number, w: number, h: number): void {
    this.ctx.fillRect(x, y, w, h);
  }

  circle(x: number, y: number, r: number, p = 1): void {
    if (p <= 0) return;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(p));
    this.ctx.stroke();
  }

  disc(x: number, y: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, TAU);
    this.ctx.fill();
  }

  ellipse(x: number, y: number, rx: number, ry: number, from = 0, to = TAU): void {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, rx, ry, 0, from, to);
    this.ctx.stroke();
  }

  /** The width of `str` in mono at `size`, in design units. */
  measure(str: string, size = 11): number {
    this.ctx.font = `${size}px ${this.mono}`;
    return this.ctx.measureText(str).width;
  }

  /** Mono text, centred on `y`. `p` types it out from the left. */
  text(
    str: string,
    x: number,
    y: number,
    o: { size?: number; align?: CanvasTextAlign; p?: number } = {},
  ): void {
    const p = o.p ?? 1;
    if (p <= 0) return;
    const c = this.ctx;
    c.font = `${o.size ?? 11}px ${this.mono}`;
    c.textAlign = o.align ?? "left";
    c.textBaseline = "middle";
    c.fillText(p >= 1 ? str : str.slice(0, Math.ceil(str.length * p)), x, y);
  }

  /** A packet: a small filled square at `p` of the way along a path. Off the path, nothing. */
  packet(pts: readonly P[], p: number, size = 7): void {
    if (p <= 0 || p >= 1) return;
    const [x, y] = along(pts, p);
    this.fill(x - size / 2, y - size / 2, size, size);
  }
}

/* along() reports how many corners it passed, for poly() to draw them before the cut. One
   module variable instead of a tuple, because poly() is called thousands of times a second. */
let walked = 0;

/** The point at `p` of the way along a path, by length. */
export function along(pts: readonly P[], p: number, count = false): P {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  }
  let left = clamp01(p) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len || i === pts.length - 1) {
      if (count) walked = i - 1;
      const k = len ? Math.min(1, left / len) : 1;
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    left -= len;
  }
  return pts[pts.length - 1]!;
}
