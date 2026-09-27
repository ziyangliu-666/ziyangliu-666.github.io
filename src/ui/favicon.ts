/* A tab icon that shows whether the agent is working.
 *
 * The tab strip is the one part of this page a visitor can see while they are somewhere else.
 * A static icon wastes that: if you ask a question and switch tabs, nothing tells you the
 * answer has started arriving. So the icon animates while a turn is in flight and rests when
 * idle, the way the Claude CLI spinner does.
 *
 * The shape is that spinner's: the asterisk family · ✢ ✳ ∗ ✻ ✽, which grows from a dot to a
 * heavy many-pointed star and back down, turning slowly as it goes.
 *
 * It is drawn as strokes from the centre rather than typed as those characters. Two reasons.
 * A glyph depends on a font having the Dingbats block at that weight, and a fallback box in the
 * tab strip is worse than no animation at all. And an arm count that is a number, not a
 * character, can be interpolated: the progression from four arms to eight is what makes this
 * read as one shape breathing instead of six different symbols flickering.
 *
 * Cost: one 32×32 canvas and a PNG data URL, at 12 frames a second. Browsers throttle timers
 * in a background tab, which slows the turn down but does not stop it.
 */

const SIZE = 32;
const MID = SIZE / 2;
/** 12 fps. Fast enough to read as motion, slow enough to stay cheap. */
const FRAME_MS = 83;

export type AgentActivity = "idle" | "busy";

interface Star {
  /** Radiating arms. Four reads as a cross, six as an asterisk, eight as a full star. */
  arms: number;
  /** Arm length in pixels, from the centre. */
  len: number;
  /** Stroke width. */
  weight: number;
}

/* One cycle of the CLI spinner, up and back down. The turn is applied on top, so the shape
 * never repeats exactly on consecutive passes. */
const CYCLE: Star[] = [
  { arms: 4, len: 4.5, weight: 1.7 }, // ·
  { arms: 4, len: 8.0, weight: 1.9 }, // ✢
  { arms: 6, len: 11.0, weight: 2.2 }, // ✳
  { arms: 6, len: 12.5, weight: 2.6 }, // ∗
  { arms: 6, len: 13.5, weight: 3.0 }, // ✻
  { arms: 8, len: 13.0, weight: 2.8 }, // ✽
  { arms: 6, len: 11.0, weight: 2.4 },
  { arms: 4, len: 7.5, weight: 2.0 },
];

/** Degrees added per frame, so the star turns while it breathes. */
const TURN = 7.5;

/** At rest: a small four-armed mark. Present, but not asking for attention. */
const RESTING: Star = { arms: 4, len: 6.5, weight: 1.8 };

function paint(ctx: CanvasRenderingContext2D, star: Star, spin: number, alpha: number) {
  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = `rgba(244, 244, 246, ${alpha.toFixed(3)})`;
  ctx.lineWidth = star.weight;
  ctx.lineCap = "round";

  /* Arms are drawn as full diameters where they pair up, so opposite arms are one stroke and
   * meet cleanly at the centre. An odd arm count would need spokes instead, and none of the
   * spinner's shapes has one. */
  const step = Math.PI / (star.arms / 2);
  for (let i = 0; i < star.arms / 2; i++) {
    const a = (spin * Math.PI) / 180 + i * step;
    const dx = Math.cos(a) * star.len;
    const dy = Math.sin(a) * star.len;
    ctx.beginPath();
    ctx.moveTo(MID - dx, MID - dy);
    ctx.lineTo(MID + dx, MID + dy);
    ctx.stroke();
  }
}

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

  const original = link.href;
  let frame = 0;
  let spin = 0;

  const draw = () => {
    const busy = getActivity() === "busy";

    if (busy) {
      spin += TURN;
      paint(ctx, CYCLE[frame % CYCLE.length]!, spin, 1);
    } else {
      // A slow breath at rest, on a much longer period than the busy cycle.
      const breath = 0.5 + 0.22 * Math.sin((frame / 30) * Math.PI * 2);
      paint(ctx, RESTING, spin, breath);
    }

    try {
      link.href = canvas.toDataURL("image/png");
    } catch {
      /* A tainted canvas cannot happen here, since nothing external is drawn, but a failed
         export must not take the page down with it. */
    }
    frame++;
  };

  draw();
  const timer = window.setInterval(draw, FRAME_MS);

  return () => {
    window.clearInterval(timer);
    link.href = original;
  };
}
