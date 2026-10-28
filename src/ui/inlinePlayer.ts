/* One blueprint, played inside a card, for screens too narrow for the side bands.
 *
 * On a wide screen the drawing of a card takes the whole page behind it (blueprint.ts). On a
 * phone there is no hover and no room around the centre column, so the cards become a deck
 * that swipes, and the card in the middle plays its drawing in its own small screen. The
 * drawing is the same function of time, scaled to fit, so a phone sees the same work move.
 *
 * Its own canvas, inside the card, and not the page's blueprint canvas: a canvas that moves
 * with the card has nothing to lag behind while the deck scrolls.
 *
 * The labels in a drawing are too small to read at this scale. They stay, as texture: the card
 * says in words what the drawing shows, and the current step runs under it as a subtitle. */

import { BOX_H, BOX_W, BUILD, Pen } from "./blueprintKit";
import type { Art } from "./cardArt";
import { type Drawn, SCENES } from "./blueprintScenes";
import { createLumen } from "./lumenSpace";
import { calmMotion } from "./motion";

const rgbOf = (css: string, fallback: string) => {
  const m = css.match(/^#([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};

/** Plays `art` on `canvas` until the returned function is called. `onStep` hears each caption. */
export function playInline(
  canvas: HTMLCanvasElement,
  art: Art,
  onStep: (caption: string) => void,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;
  const still = calmMotion();
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const light = root.dataset.theme === "light";
  const ink = rgbOf(css.getPropertyValue("--ink").trim(), light ? "17,17,20" : "242,242,244");
  const bg = light ? "255,255,255" : "0,0,0";
  const mono = css.getPropertyValue("--mono").trim() || "ui-monospace, Menlo, monospace";
  const lumen = art === "lumen" ? createLumen() : null;
  const scene = art === "lumen" ? null : SCENES[art as Drawn];

  let w = 0;
  let h = 0;
  let dpr = 1;
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(canvas);

  let t = still ? BUILD + 6 : 0;
  let last = 0;
  let raf = 0;
  let caption = "";

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const alpha = still ? 1 : Math.min(1, t / 0.4);
    if (lumen) {
      lumen.draw(ctx, w, h, t, alpha, { ink, bg, dark: !light }, { x: 0, y: 0, on: false }, still, {
        ax: 0.5,
        ay: 0.5,
        size: 0.34,
      });
      return;
    }
    if (!scene) return;
    const s = Math.min(w / BOX_W, h / BOX_H);
    const ox = (w - BOX_W * s) / 2;
    const oy = (h - BOX_H * s) / 2;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    const run = Math.max(0, t - BUILD);
    const L = run % scene.period;
    scene.draw(new Pen(ctx, s, alpha, ink, bg, mono), t, L, Math.floor(run / scene.period));
    let step = 0;
    scene.steps.forEach(([at], k) => {
      if (L >= at) step = k;
    });
    const next = t >= BUILD - 0.2 ? scene.steps[step]![1] : "";
    if (next !== caption) {
      caption = next;
      onStep(caption);
    }
  };

  const frame = (now: number) => {
    t += last ? Math.min((now - last) / 1000, 0.064) : 0.016;
    last = now;
    draw();
    raf = requestAnimationFrame(frame);
  };

  // A hidden tab plays nothing, and starts again where it stopped.
  const onVisibility = () => {
    cancelAnimationFrame(raf);
    last = 0;
    if (!document.hidden && !still) raf = requestAnimationFrame(frame);
  };

  if (still) draw();
  else raf = requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    onStep("");
  };
}
