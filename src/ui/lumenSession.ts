/* The agent in front of lumen's sphere: one session window that unfolds and runs.
 *
 * The sphere alone said "a beautiful page". lumen is an agent, so its card also shows the agent
 * at work, as lumen's own session page shows it: the question, the lead thinking, two readers
 * delegated in parallel, findings coming in, the call tree with what each step costs, and the
 * answer streaming. Halfway through, the person steers it with a message while it runs. That
 * is the feature lumen is built around, so it is in the script.
 *
 * The task and the numbers are the ones in lumen's own recording (docs/media/session.gif):
 * count Schröder paths for n = 0..8 and match them on the OEIS. The steer extends it to n = 9.
 * The large Schröder numbers are 1, 2, 6, 22, 90, 394, 1806, 8558, 41586, 206098 (A006318).
 * The costs are illustrative, in the range the recording shows.
 *
 * Drawn on the blueprint canvas, in CSS pixels, as a function of time since the card opened. */

const TAU = Math.PI * 2;

const ASK =
  "Use two readers in parallel: count Schröder paths for n = 0..8 in Python, and search the OEIS for 1, 2, 6, 22, 90, 394. Then compare.";
const THINK = "I'll run the two readers in parallel and check the OEIS myself at the same time.";
const READER_1 =
  "Count Schröder paths in Python for n = 0..8: lattice paths from (0,0) to (2n,0) with steps U, D and H that never go below the x-axis.";
const READER_2 = "Search the OEIS for the integer sequence 1, 2, 6, 22, 90, 394. Report the first hits.";
const STEER = "Also check n = 9.";
const ANSWER =
  "The Schröder path counts for n = 0..9 are 1, 2, 6, 22, 90, 394, 1806, 8558, 41586, 206098. They match OEIS A006318, the large Schröder numbers, term for term.";

/** The script, in seconds since the card opened. */
const AT = {
  unfold: 0.7,
  ask: 1.5,
  think: 2.2,
  delegate: 3.6,
  reader2Done: 6.6,
  steerType: 7.2,
  steerSend: 8.4,
  reader1Done: 11.2,
  searched: 11.8,
  answer: 12.8,
  done: 17.5,
};

export interface SessionTheme {
  ink: string;
  bg: string;
  sans: string;
  mono: string;
}

/* How far the conversation has scrolled. It follows the content: once the conversation is
   taller than its column, it scrolls so the newest line stays just above the composer. Kept
   between frames, because the height is only known after a frame is laid out. */
let scrolled = 0;
let contentH = 0;

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ez = (x: number) => 1 - (1 - clamp01(x)) ** 3;
const after = (t: number, a: number, d = 0.35) => ez((t - a) / d);

/* Wrapping is measured once per string, width and font, not on every frame. */
const wrapped = new Map<string, string[]>();

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const key = `${ctx.font}|${width}|${text}`;
  const hit = wrapped.get(key);
  if (hit) return hit;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  wrapped.set(key, lines);
  return lines;
}

export function drawSession(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  t: number,
  alpha: number,
  theme: SessionTheme,
): void {
  const open = after(t, AT.unfold, 0.7);
  if (open <= 0) return;

  const ink = (a: number) => `rgba(${theme.ink},${(a * alpha).toFixed(3)})`;
  const font = (size: number, weight = 400, mono = false) => {
    ctx.font = `${weight} ${size}px ${mono ? theme.mono : theme.sans}`;
  };
  const text = (s: string, x: number, y: number, a: number, align: CanvasTextAlign = "left") => {
    ctx.fillStyle = ink(a);
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  };
  /** A paragraph that streams in from `at` at `cps` characters a second. Returns the height
   *  of the lines shown so far, so what follows sits under the writing, not under the end. */
  const para = (s: string, x: number, y: number, w: number, a: number, at: number, cps = 0, lh = 16) => {
    const lines = wrap(ctx, s, w);
    let budget = cps > 0 ? Math.floor((t - at) * cps) : Infinity;
    if (t < at) return 0;
    let drawn = 0;
    lines.forEach((line, k) => {
      if (budget <= 0) return;
      const shown = budget >= line.length ? line : line.slice(0, budget);
      budget -= line.length + 1;
      text(shown, x, y + k * lh, a);
      drawn++;
    });
    return drawn * lh;
  };
  const spinner = (x: number, y: number, a: number) => {
    ctx.strokeStyle = ink(a);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 4, t * 7, t * 7 + TAU * 0.72);
    ctx.stroke();
  };
  const dot = (x: number, y: number, a: number) => {
    ctx.fillStyle = ink(a);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, TAU);
    ctx.fill();
  };
  const status = (x: number, y: number, done: boolean, label: string, a = 0.7) => {
    if (done) dot(x, y - 4, a);
    else spinner(x, y - 4, a);
    font(11);
    text(label, x + 9, y, a);
  };
  const rule = (x1: number, y1: number, x2: number, y2: number, a: number) => {
    ctx.strokeStyle = ink(a);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const { x, y, w } = box;
  const h = box.h * open;
  const finished = t >= AT.done;

  // The window: a near-opaque panel, so the sphere's dots never run through the words.
  ctx.save();
  ctx.fillStyle = `rgba(${theme.bg},${(0.9 * alpha).toFixed(3)})`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = ink(0.32);
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.textBaseline = "alphabetic";

  // The bar: where we are, whether it runs, what it has cost.
  const elapsed = Math.max(0, Math.min(t, AT.done) - AT.ask);
  const spent = 0.0002 + elapsed * 0.00034;
  font(12, 600);
  text("lumen", x + 14, y + 22, 0.95);
  font(12);
  text("/  Schröder paths", x + 58, y + 22, 0.55);
  status(x + w - 200, y + 22, finished, finished ? "Finished" : "Running", 0.75);
  font(11, 400, true);
  text(`$${spent.toFixed(4)}  ·  ${Math.floor(elapsed)} s`, x + w - 14, y + 22, 0.55, "right");
  rule(x, y + 34, x + w, y + 34, 0.18);

  // Two columns: the conversation, and the side panel.
  const side = Math.max(150, Math.round(w * 0.32));
  const cx = x + 16;
  const cw = w - side - 32;
  const sx = x + w - side + 12;
  const sw = side - 24;
  rule(x + w - side, y + 34, x + w - side, y + box.h, 0.14);

  // The composer sits at the foot, as in lumen; the conversation scrolls above it.
  const footH = 52;
  const foot = y + box.h - footH - 12;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + 35, w - side, foot - y - 43);
  ctx.clip();

  const top = y + 58;
  const room = foot - 30 - top;
  if (t < AT.ask) scrolled = 0;
  scrolled += (Math.max(0, contentH - room) - scrolled) * 0.08;
  let cy = top - scrolled;

  // The question.
  if (t >= AT.ask) {
    font(12);
    const a = after(t, AT.ask);
    const lines = wrap(ctx, ASK, cw - 24);
    ctx.fillStyle = ink(0.08 * a);
    ctx.fillRect(cx + 24, cy - 14, cw - 24, lines.length * 16 + 12);
    para(ASK, cx + 34, cy + 2, cw - 44, 0.9 * a, AT.ask);
    cy += lines.length * 16 + 22;
  }

  // The lead thinks, then delegates.
  if (t >= AT.think) {
    const waiting = t < AT.reader1Done ? `Waiting for ${t < AT.reader2Done ? 2 : 1} reader${t < AT.reader2Done ? "s" : ""}` : t < AT.answer ? "Thinking" : finished ? "Done" : "Writing";
    status(cx + 4, cy, finished, t < AT.delegate ? "Thinking" : waiting, 0.6);
    cy += 20;
    font(11, 600);
    text("Thinking", cx, cy, 0.8 * after(t, AT.think));
    cy += 16;
    font(11.5);
    cy += para(THINK, cx, cy, cw, 0.6, AT.think + 0.3, 70, 15) + 6;
  }

  if (t >= AT.delegate) {
    font(11, 600);
    text("Delegated", cx, cy, 0.8 * after(t, AT.delegate));
    font(11);
    text("2 in parallel", cx + 64, cy, 0.5 * after(t, AT.delegate));
    cy += 18;
    const readers: [string, string, number, number][] = [
      ["reader 1", READER_1, AT.delegate + 0.2, AT.reader1Done],
      ["reader 2", READER_2, AT.delegate + 0.4, AT.reader2Done],
    ];
    for (const [name, task, from, done] of readers) {
      if (t < from) continue;
      const a = after(t, from);
      font(11);
      text(name, cx, cy, 0.55 * a);
      font(11.5);
      const lines = wrap(ctx, task, cw - 140).slice(0, 2);
      lines.forEach((line, k) => text(k === 1 ? `${line.slice(0, -1)}…` : line, cx + 62, cy + k * 15, 0.85 * a));
      status(cx + cw - 64, cy, t >= done, t >= done ? "Finished" : "Running", 0.7 * a);
      cy += lines.length * 15;
      // What the reader is doing now, under its task.
      font(10.5);
      const now =
        name === "reader 1"
          ? t < AT.steerSend + 0.6
            ? t < 6
              ? "Starting"
              : "Ran a command, reading its output"
            : t < done
              ? "Steered: extending to n = 9"
              : "Counted n = 0..9"
          : t < done
            ? "Writing"
            : "Found A006318";
      text(now, cx + 62, cy + 2, 0.45 * a);
      cy += 22;
    }
  }

  // The steer: the person's message arrives while everything runs.
  if (t >= AT.steerSend) {
    const a = after(t, AT.steerSend);
    font(12);
    const w2 = ctx.measureText(STEER).width + 20;
    ctx.fillStyle = ink(0.08 * a);
    ctx.fillRect(cx + cw - w2, cy - 14, w2, 24);
    text(STEER, cx + cw - 10, cy + 2, 0.9 * a, "right");
    font(10.5);
    text("Steered while running", cx + cw - w2 - 8, cy + 2, 0.45 * a, "right");
    cy += 30;
  }

  // The lead's own search, and the answer streaming in.
  if (t >= AT.searched) {
    const a = after(t, AT.searched);
    font(11);
    text("Searched OEIS for 1, 2, 6, 22, 90, 394", cx, cy, 0.6 * a);
    cy += 10;
    font(10.5, 400, true);
    const chip = "A006318  Large Schröder numbers";
    const cwid = ctx.measureText(chip).width + 16;
    ctx.strokeStyle = ink(0.3 * a);
    ctx.strokeRect(cx + 0.5, cy + 0.5, cwid, 20);
    text(chip, cx + 8, cy + 14, 0.8 * a);
    text("+3 more", cx + cwid + 10, cy + 14, 0.4 * a);
    cy += 40;
  }
  if (t >= AT.answer) {
    font(12.5, 600);
    text("Result", cx, cy, 0.95);
    font(12.5);
    const answerH = para(ANSWER, cx + 46, cy, cw - 46, 0.95, AT.answer, 42, 18);
    // The caret, while it writes.
    if (!finished && Math.sin(t * 9) > 0) {
      const lines = wrap(ctx, ANSWER, cw - 46);
      // The same budget as para(): find the line the last letter is on, and how far into it.
      let budget = Math.floor((t - AT.answer) * 42);
      let k = 0;
      while (k < lines.length - 1 && budget > lines[k]!.length) {
        budget -= lines[k]!.length + 1;
        k++;
      }
      const part = lines[k]!.slice(0, Math.max(0, budget));
      const caretX = cx + 46 + ctx.measureText(part).width + 2;
      rule(caretX, cy + k * 18 - 11, caretX, cy + k * 18 + 3, 0.9);
    }
    cy += answerH;
  }
  contentH = cy + scrolled - top;
  ctx.restore();

  // The composer.
  ctx.strokeStyle = ink(0.3);
  ctx.strokeRect(cx + 0.5, foot + 0.5, cw - 1, footH);
  const typing = t >= AT.steerType && t < AT.steerSend;
  font(12);
  if (typing) {
    const typed = STEER.slice(0, Math.ceil(((t - AT.steerType) / (AT.steerSend - AT.steerType - 0.2)) * STEER.length));
    text(typed, cx + 10, foot + 20, 0.95);
    if (Math.sin(t * 9) > 0) rule(cx + 12 + ctx.measureText(typed).width, foot + 9, cx + 12 + ctx.measureText(typed).width, foot + 24, 0.9);
  } else {
    text("Steer lumen…", cx + 10, foot + 20, 0.4);
  }
  font(10.5);
  text("Attach", cx + 10, foot + 42, 0.4);
  // The button stops a running task; it is a square while lumen works.
  ctx.fillStyle = ink(0.85);
  if (!finished) ctx.fillRect(cx + cw - 26, foot + 30, 10, 10);
  else {
    ctx.strokeStyle = ink(0.6);
    ctx.strokeRect(cx + cw - 27.5, foot + 28.5, 13, 13);
  }

  // The side panel: findings, then the call tree with costs.
  let sy = y + 58;
  const findings = (t >= AT.reader2Done ? 1 : 0) + (t >= AT.reader1Done ? 1 : 0);
  font(11.5, 600);
  text("Findings", sx, sy, 0.85);
  font(11.5);
  text(String(findings), sx + 58, sy, 0.5);
  sy += 20;
  const finding = (title: string, body: string, by: string, at: number) => {
    if (t < at) return;
    const a = after(t, at);
    font(11.5, 600);
    sy += para(title, sx, sy, sw, 0.9 * a, at, 0, 15);
    font(10.5);
    sy += para(body, sx, sy, sw, 0.5 * a, at, 0, 13) + 2;
    text(`Recorded by ${by}`, sx, sy, 0.4 * a);
    sy += 22;
  };
  finding("A006318 is the large Schröder match", "The OEIS returns A006318 as the first hit.", "reader 2", AT.reader2Done);
  finding("Schröder path counts n = 0..9", "1, 2, 6, 22, 90, 394, 1806, 8558, 41586, 206098.", "reader 1", AT.reader1Done);

  sy += 6;
  rule(sx, sy - 12, sx + sw, sy - 12, 0.14);
  font(11.5, 600);
  text("Call tree", sx, sy + 4, 0.85);
  sy += 26;
  const node = (name: string, depth: number, cost: number, done: boolean, from: number) => {
    if (t < from) return;
    const a = after(t, from);
    if (depth > 0) rule(sx + 4, sy - 16, sx + 4, sy - 2, 0.25 * a);
    font(11);
    text(name, sx + depth * 14, sy, 0.85 * a);
    font(10.5, 400, true);
    text(`$${cost.toFixed(4)}`, sx + sw - 16, sy, 0.5 * a, "right");
    if (done) dot(sx + sw - 4, sy - 4, 0.6 * a);
    else spinner(sx + sw - 4, sy - 4, 0.6 * a);
    sy += 20;
  };
  const run = (from: number, to: number, rate: number) => Math.max(0, Math.min(t, to) - from) * rate;
  node("lumen", 0, spent, finished, AT.ask);
  node("reader 1", 1, 0.0001 + run(AT.delegate, AT.reader1Done, 0.00038), t >= AT.reader1Done, AT.delegate + 0.2);
  node("reader 2", 1, 0.0001 + run(AT.delegate, AT.reader2Done, 0.00055), t >= AT.reader2Done, AT.delegate + 0.4);

  ctx.restore();
}
