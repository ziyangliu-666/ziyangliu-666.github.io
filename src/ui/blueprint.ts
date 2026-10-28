/* The blueprint behind an open card. When a visitor points at a highlight card, the scene
 * behind the page dims, the centre column steps back, and a drawing of how that work operates
 * draws itself across the page and then runs: packets cross threads, disk blocks migrate,
 * tokens are copied instead of decoded.
 *
 * The drawings come from the GIFs of his interview deck, and each one keeps the logic of its
 * GIF. They do not keep its look. The GIFs are slides: grey panels, red and blue accents, bold
 * titles. Over this page that is a pasted picture. Here every drawing is the scene's own
 * material: one hairline weight, no colour, a lot of black. Brightness is the only accent. A
 * part is dim while it waits and full white while it works, so the eye follows the work.
 *
 * lumen is the one exception. Its card shows its own front page, live: the halftone sphere,
 * ported from lumen-next. That page is the work, so a diagram of it would be a lesser copy.
 *
 * One canvas, fixed over the scene and under the content. Nothing here touches React: a card
 * calls showBlueprint() and hideBlueprint(), and one rAF loop runs only while something is on
 * screen.
 *
 * Every drawing works in one design box, 1000 × 560 units, scaled into the space between the
 * two card bands. A drawing is a function of time, not a sequence of tweens, so a frame can be
 * drawn for any moment, and the still mode is one frame of the same function. */

import type { Art } from "./cardArt";
import { BOX_H, BOX_W, BUILD, Pen, type Scene, ez, win } from "./blueprintKit";
import { type Drawn, SCENES } from "./blueprintScenes";
import { drawSession } from "./lumenSession";
import { SHOT, createLumen, type Lumen } from "./lumenSpace";
import { calmMotion } from "./motion";

interface Layer {
  art: Art;
  /** Seconds since it opened. */
  t: number;
  alpha: number;
  want: number;
}

interface Engine {
  show(art: Art, anchor: Element): void;
  hide(): void;
}

let engine: Engine | null = null;

/** Opens the drawing for `art`. `anchor` is the card, which the leader line points back to. */
export function showBlueprint(art: Art, anchor: Element): void {
  engine?.show(art, anchor);
}

export function hideBlueprint(): void {
  engine?.hide();
}

/** A pointer that only crosses a card on its way somewhere else should not start a drawing. */
const SETTLE_MS = 140;

const rgbOf = (css: string, fallback: string) => {
  const m = css.match(/^#([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

export function mountBlueprint(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;
  const still = calmMotion();
  const root = document.documentElement;

  let W = 0;
  let H = 0;
  let dpr = 1;
  let layers: Layer[] = [];
  let veil = 0;
  let veilWant = 0;
  let anchor: Element | null = null;
  /** Where the open card stood when it opened. The drawing keeps clear of it. */
  let held: DOMRect | null = null;
  let pending = 0;
  let raf = 0;
  let last = 0;
  let lumen: Lumen | null = null;
  const pointer = { x: 0, y: 0, on: false };

  let ink = "242,242,244";
  let bg = "0,0,0";
  let mono = "ui-monospace, Menlo, monospace";
  let sans = "ui-sans-serif, system-ui, sans-serif";
  let light = false;

  const readTheme = () => {
    const css = getComputedStyle(root);
    light = root.dataset.theme === "light";
    ink = rgbOf(css.getPropertyValue("--ink").trim(), light ? "17,17,20" : "242,242,244");
    bg = light ? "255,255,255" : "0,0,0";
    mono = css.getPropertyValue("--mono").trim() || mono;
    // The page sets its face on .app, not on <body>, which falls back to a serif.
    const app = document.querySelector(".app");
    if (app) sans = getComputedStyle(app).fontFamily || sans;
  };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (still && layers.length) draw();
  };

  /* The space between the card bands. The drawing may run a little under the bands: the cards
     that are not open step far back while a drawing shows, and a narrower drawing made every
     label too small to read at 1280 px. It never runs under the open card, which is opaque:
     on that side it starts past the card. The card's place is taken once, when it opens, so the
     drawing does not swim with the pointer parallax. */
  const stage = () => {
    const side = Math.min(0.03 * W + 168, W * 0.2);
    let left = side;
    let right = W - side;
    if (held) {
      if (held.left + held.width / 2 < W / 2) left = Math.max(left, held.right + 40);
      else right = Math.min(right, held.left - 40);
    }
    const top = 78;
    const bottom = 62;
    const w = right - left;
    const h = H - top - bottom;
    const s = Math.min(w / BOX_W, h / BOX_H);
    return { s, ox: left + (w - BOX_W * s) / 2, oy: top + (h - BOX_H * s) / 2 };
  };

  /* lumen's session window: between the open card and the sphere, in the place of the text
     column on lumen's landing. It may overlap the sphere's edge; its panel is near opaque. */
  const sessionBox = () => {
    const left = held && held.left + held.width / 2 < W / 2 ? held.right + 40 : W * 0.06;
    const sphereLeft = SHOT.ax * W - SHOT.size * H * 0.75;
    const w = Math.max(470, Math.min(660, sphereLeft - left));
    const y = 84;
    return { x: left, y, w, h: Math.max(380, H - y - 54) };
  };

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (veil > 0.002) {
      ctx.fillStyle = `rgba(${bg},${(veil * 0.8).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    for (const layer of layers) {
      if (layer.alpha < 0.002) continue;
      if (layer.art === "lumen") {
        lumen ??= createLumen();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lumen.draw(ctx, W, H, layer.t, layer.alpha, { ink, bg, dark: !light }, pointer, still);
        drawSession(ctx, sessionBox(), still ? 30 : layer.t, layer.alpha, { ink, bg, sans, mono });
      } else {
        drawScene(SCENES[layer.art as Drawn], layer);
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
  };

  const drawScene = (scene: Scene, layer: Layer) => {
    const { s, ox, oy } = stage();
    const t = still ? BUILD + scene.period * 0.62 : layer.t;
    const run = Math.max(0, t - BUILD);
    const L = run % scene.period;
    const cycle = Math.floor(run / scene.period);

    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    const pen = new Pen(ctx, s, layer.alpha, ink, bg, mono);
    scene.draw(pen, t, L, cycle);
    let step = 0;
    scene.steps.forEach(([at], k) => {
      if (L >= at) step = k;
    });

    // The frame, in screen pixels: corner marks, the leader to the card, the captions.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const chrome = new Pen(ctx, 1, layer.alpha, ink, bg, mono);
    const x0 = ox - 18;
    const y0 = oy - 18;
    const x1 = ox + BOX_W * s + 18;
    const y1 = oy + BOX_H * s + 18;
    const g = ez(t / 0.6);
    const arm = 10 * g;
    chrome.ink(0.5);
    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ] as const) {
      chrome.poly([[cx + dx * arm, cy], [cx, cy], [cx, cy + dy * arm]]);
    }

    if (anchor && layer === layers[layers.length - 1]) {
      const r = anchor.getBoundingClientRect();
      const left = r.left + r.width / 2 < W / 2;
      const ax = left ? r.right : r.left;
      const ay = Math.min(Math.max(r.top + r.height / 2, y0 + 12), y1 - 12);
      const bx = left ? x0 : x1;
      chrome.ink(0.42);
      chrome.line(ax, ay, bx, ay, ez((t - 0.1) / 0.5));
      chrome.disc(ax, ay, 2);
      chrome.line(bx, ay - 4, bx, ay + 4, win(t, 0.5, 0.1));
    }

    const size = 10.5;
    const by = y1 + 20;
    chrome.ink(0.5);
    chrome.text(`${scene.title.toUpperCase()}  ·  ${scene.subtitle.toUpperCase()}`, x0, by, {
      size,
      p: win(t, 0.3, 0.7),
    });
    if (t >= BUILD - 0.2 || still) {
      const [stepStart, caption] = scene.steps[step]!;
      const typed = still ? 1 : win(L, stepStart, 0.5);
      const n = scene.steps.length;
      chrome.ink(0.9);
      chrome.text(caption.toUpperCase(), x1, by, { size, align: "right", p: typed });
      // One tick per step, the current one bright.
      for (let k = 0; k < n; k++) {
        chrome.ink(k === step ? 0.9 : 0.25);
        chrome.fill(x1 - (n - k) * 14 + 4, by + 13, 10, 1);
      }
    }
  };

  const frame = (now: number) => {
    const dt = last ? Math.min((now - last) / 1000, 0.064) : 0.016;
    last = now;
    const kIn = 1 - Math.exp(-dt / 0.22);
    const kOut = 1 - Math.exp(-dt / 0.14);
    veil += (veilWant - veil) * (veilWant > veil ? kIn : kOut);
    for (const layer of layers) {
      layer.t += dt;
      layer.alpha += (layer.want - layer.alpha) * (layer.want > layer.alpha ? kIn : kOut);
    }
    layers = layers.filter((l) => l.want > 0 || l.alpha > 0.01);
    draw();
    if (layers.length || veil > 0.003) {
      raf = requestAnimationFrame(frame);
    } else {
      raf = 0;
      last = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const kick = () => {
    if (still) {
      for (const l of layers) l.alpha = l.want;
      layers = layers.filter((l) => l.want > 0);
      veil = veilWant;
      draw();
      return;
    }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const open = (art: Art, el: Element) => {
    // A card with nothing to draw leaves the page as it is.
    if (art !== "lumen" && !(art in SCENES)) return engine?.hide();
    readTheme();
    anchor = el;
    held = el.getBoundingClientRect();
    root.classList.add("bp-on");
    // lumen's window is a page of its own: the centre column goes completely behind it.
    root.classList.toggle("bp-solid", art === "lumen");
    veilWant = 1;
    const top = layers[layers.length - 1];
    if (top && top.art === art && top.want === 1) return kick();
    for (const l of layers) l.want = 0;
    layers.push({ art, t: 0, alpha: 0, want: 1 });
    kick();
  };

  engine = {
    show(art, el) {
      window.clearTimeout(pending);
      // Moving from one card straight to the next: no wait, the page is already dimmed.
      if (veilWant === 1) return open(art, el);
      pending = window.setTimeout(() => open(art, el), SETTLE_MS);
    },
    hide() {
      window.clearTimeout(pending);
      root.classList.remove("bp-on", "bp-solid");
      veilWant = 0;
      for (const l of layers) l.want = 0;
      kick();
    },
  };

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.on = true;
  };
  const onTheme = new MutationObserver(() => {
    readTheme();
    if (still && layers.length) draw();
  });

  readTheme();
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", onPointer, { passive: true });
  onTheme.observe(root, { attributes: true, attributeFilter: ["data-theme"] });

  return () => {
    engine = null;
    window.clearTimeout(pending);
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    window.removeEventListener("pointermove", onPointer);
    onTheme.disconnect();
    root.classList.remove("bp-on", "bp-solid");
  };
}
