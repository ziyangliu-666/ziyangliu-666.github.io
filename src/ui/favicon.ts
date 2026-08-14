/* A tab icon that shows whether the agent is working.
 *
 * The tab strip is the one part of this page a visitor can see while they are somewhere else.
 * A static icon wastes that: if you ask a question and switch tabs, nothing tells you the
 * answer has started arriving. So the icon spins while a turn is in flight and breathes
 * slowly when idle, the way a CLI spinner does.
 *
 * The dots are drawn as rectangles, not typed as braille characters. A glyph like ⠹ depends on
 * a font that has the Braille Patterns block, which is not a safe assumption across platforms,
 * and a fallback box in the tab strip would be worse than no animation. Eight rectangles on a
 * 2×4 grid are the same eight dots, crisp at 32 px, on every machine.
 *
 * Cost: one 32×32 canvas and a PNG data URL, at 12 frames a second while busy. Browsers
 * throttle timers in a background tab, which slows the spin down but does not stop it.
 */

const SIZE = 32;
/** 12 fps. Fast enough to read as motion, slow enough to stay cheap. */
const FRAME_MS = 83;

export type AgentActivity = "idle" | "busy";

interface Dot {
  x: number;
  y: number;
}

/** Two columns of four, the braille cell. Indices run down the left column, then the right. */
function grid(): Dot[] {
  const dots: Dot[] = [];
  const colX = [10, 22];
  const rowY = [5, 13, 21, 29];
  for (let c = 0; c < 2; c++) {
    for (let r = 0; r < 4; r++) {
      dots.push({ x: colX[c]!, y: rowY[r]! });
    }
  }
  return dots;
}

/* Index into `grid()` for each step of the loop: down the left column, then back up the
 * right, so the lit dot travels the outline of the cell instead of jumping across it. */
const RING_ORDER = [0, 1, 2, 3, 7, 6, 5, 4];
const STEPS = RING_ORDER.length;

export function startFavicon(getActivity: () => AgentActivity): () => void {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  const link =
    document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
    document.head.appendChild(Object.assign(document.createElement("link"), { rel: "icon" }));

  // No canvas means no animation. The static icon in index.html stays, which is fine.
  if (!ctx) return () => {};

  const dots = grid();
  const original = link.href;
  let frame = 0;
  let timer = 0;

  const draw = () => {
    ctx.clearRect(0, 0, SIZE, SIZE);

    const busy = getActivity() === "busy";
    // Idle breathes on a slow cycle; busy runs the ring. Both are the same eight dots.
    const phase = busy ? frame % STEPS : 0;
    const breath = busy ? 1 : 0.45 + 0.3 * Math.sin((frame / 26) * Math.PI * 2);

    dots.forEach((dot, i) => {
      let alpha: number;
      if (busy) {
        /* Distance behind the leading dot, so the ring reads as a comet with a tail rather
         * than as one dot teleporting around the cell. */
        const pos = RING_ORDER.indexOf(i);
        const behind = (phase - pos + STEPS) % STEPS;
        alpha = behind === 0 ? 1 : behind === 1 ? 0.62 : behind === 2 ? 0.34 : 0.16;
      } else {
        alpha = breath;
      }

      ctx.fillStyle = `rgba(244, 244, 246, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      // Round dots: a square reads as a pixel artifact at this size, a circle reads as ink.
      ctx.arc(dot.x, dot.y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    });

    try {
      link.href = canvas.toDataURL("image/png");
    } catch {
      /* A tainted canvas cannot happen here — nothing external is drawn — but a failed
         export must not take the page down with it. */
    }
    frame++;
  };

  draw();
  timer = window.setInterval(draw, FRAME_MS);

  return () => {
    window.clearInterval(timer);
    link.href = original;
  };
}
