/* Structured answer blocks: timeline, flow, stack, metrics.
 *
 * An answer about his career is a chronology. The V2V transfer path is a pipeline. Exfer is a
 * layered system. The throughput work is a set of numbers. Prose flattens all four into the
 * same grey paragraph, so the model can draw them instead.
 *
 * Three decisions worth stating, because each one was the alternative not taken.
 *
 * No mermaid. `mermaid.min.js` is 982 KB gzipped against this app's 90 KB, which is eleven
 * times the page to draw boxes. It renders its SVG through `innerHTML`, and the whole security
 * argument in markdown.tsx is that nothing here touches `innerHTML`, because the model has
 * often been reading arbitrary web pages seconds earlier. And mermaid output looks like
 * mermaid, not like this page.
 *
 * No arbitrary graphs. Every layout below is deterministic: a list, a chain, or a grid. A
 * fixed layout that always looks right beats a general one that sometimes does, and an LLM
 * drawing a free-form graph is exactly where diagrams turn to mush.
 *
 * These are plain functions returning host elements, not React components. The renderer's
 * test walker (scripts/markdown.test.mjs) collects host elements and cannot see inside a
 * function component, so a component here would be invisible to every test.
 *
 * Fields carry inline markdown, through the same inline() the prose uses. A row that names V2V
 * OS or HKUST links it, because the reader who wants to open the thing is looking at the
 * drawing, not at the paragraph above it. Two fields stay plain text on purpose:
 *
 *   - a timeline's `when`, because parseWhen reads it before anything renders it. A link there
 *     fails to parse as a date and costs the whole block its shared time axis.
 *   - a metric's `value`, because it renders at 26px. An underline on a number that size reads
 *     as a button, and the label beside it is the better place for the link anyway.
 */

import type { ReactNode } from "react";

import { inline } from "./inline";

/* The field separator is `|` everywhere. An arrow is a separator in `flow` only, and nowhere
 * else, because a timeline writes its range as "2022-10 → 2024-07": splitting that on the
 * arrow tears one date into two fields and shifts every column right. The first version did
 * exactly that, and the timeline test caught it. */
const PIPE = /\s*\|\s*/;
const PIPE_OR_ARROW = /\s*(?:\||→|->|—>|>)\s*/;

function fields(line: string, arrowsToo = false): string[] {
  return line
    .split(arrowsToo ? PIPE_OR_ARROW : PIPE)
    .map((f) => f.trim())
    .filter(Boolean);
}

function rows(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter(Boolean);
}

/* ------------------------------------------------------------------- timeline */

export interface Span {
  when: string;
  what: string;
  detail?: string;
}

/** `2022-10 → 2024-07 | Virtualization R&D Engineer, SmartX | led the product design` */
export function parseTimeline(lines: string[]): Span[] {
  const out: Span[] = [];
  for (const line of rows(lines)) {
    const [when, what, ...rest] = fields(line);
    // A date and nothing else is not an event. Two fields minimum, or the row is dropped.
    if (!when || !what) continue;
    out.push({ when, what, detail: rest.join(" · ") || undefined });
  }
  return out;
}

/* Dates, so overlapping spans can be drawn as overlapping.
 *
 * His internship at SmartX ran inside his degree at UESTC, and Exfer ran inside the research
 * year at HKUST. A rail that stacks rows in order draws all of those as a sequence, which is a
 * plain misstatement of what happened. With dates parsed, each span becomes a bar on a shared
 * axis, and two things that happened at once sit above each other.
 *
 * Every span has to parse for that to be honest. If one row cannot be read, the whole block
 * falls back to the plain rail: a mixed diagram, where most bars are placed by date and one is
 * guessed, would be worse than the simple version. */

const MONTH_NAMES = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

/** Months since year 0, so arithmetic on spans is subtraction. */
function months(text: string, now: number): number | null {
  const s = text.trim().toLowerCase();
  if (!s || /^(now|present|today|current|ongoing|现在|至今)$/.test(s)) return now;

  // 2024-07, 2024/07, 2024.07
  const numeric = /^(\d{4})\s*[-/.]\s*(\d{1,2})$/.exec(s);
  if (numeric) {
    const m = Number(numeric[2]);
    if (m < 1 || m > 12) return null;
    return Number(numeric[1]) * 12 + (m - 1);
  }

  // Jul 2024, July 2024, 2024 Jul
  const named = /^(?:([a-z]{3,9})\.?\s+(\d{4})|(\d{4})\s+([a-z]{3,9})\.?)$/.exec(s);
  if (named) {
    const word = (named[1] ?? named[4])!.slice(0, 3);
    const year = Number(named[2] ?? named[3]);
    const m = MONTH_NAMES.indexOf(word);
    if (m >= 0) return year * 12 + m;
  }

  // A bare year starts in January.
  const year = /^(\d{4})$/.exec(s);
  if (year) return Number(year[1]) * 12;

  return null;
}

/* An en dash, an em dash, an arrow, the word "to", or a hyphen with space around it. A bare
 * hyphen is not a separator: it is the one inside "2024-07". */
const RANGE = /\s*(?:→|->|–|—|\bto\b|\s-\s)\s*/;

export interface Bar {
  from: number;
  to: number;
}

export function parseWhen(when: string, now: number): Bar | null {
  const parts = when.split(RANGE).map((s) => s.trim()).filter(Boolean);
  if (!parts.length || parts.length > 2) return null;

  const from = months(parts[0]!, now);
  if (from == null) return null;
  if (parts.length === 1) return { from, to: from };

  const to = months(parts[1]!, now);
  if (to == null || to < from) return null;
  return { from, to };
}

function axisYears(from: number, to: number): number[] {
  const first = Math.ceil(from / 12);
  const last = Math.floor(to / 12);
  const out: number[] = [];
  // At most one label per year, and never so many that they collide in a 500px track.
  const step = Math.max(1, Math.ceil((last - first + 1) / 7));
  for (let y = first; y <= last; y += step) out.push(y);
  return out;
}

function gantt(spans: Span[], bars: Bar[], key: number): ReactNode {
  const from = Math.min(...bars.map((b) => b.from));
  const to = Math.max(...bars.map((b) => b.to));
  // A degenerate span of one month would divide by zero; give it a year of width.
  const width = Math.max(to - from, 12);
  const at = (m: number) => ((m - from) / width) * 100;

  return (
    <div className="dg dg-gantt" key={key}>
      <div className="dg-axis" aria-hidden="true">
        {axisYears(from, to).map((y) => (
          <span className="dg-tick" key={y} style={{ left: `${at(y * 12)}%` }}>
            {y}
          </span>
        ))}
      </div>
      <ol className="dg-bars">
        {spans.map((s, i) => {
          const b = bars[i]!;
          // A point event still has to be visible, so it gets a minimum width, and a span that
          // ends at the right edge has to be pulled back inside it rather than overhanging.
          const span = Math.max(at(b.to) - at(b.from), 1.5);
          const left = Math.min(at(b.from), 100 - span);
          return (
            <li className="dg-bar-row" key={i}>
              <span className="dg-bar-label">{inline(s.what, i * 300)}</span>
              <span className="dg-track">
                <span className="dg-bar" style={{ left: `${left}%`, width: `${span}%` }} />
              </span>
              <span className="dg-bar-when">{s.when}</span>
              {s.detail && (
                <span className="dg-bar-detail">{inline(s.detail, i * 300 + 100)}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function timeline(spans: Span[], key: number): ReactNode {
  return (
    <ol className="dg dg-timeline" key={key}>
      {spans.map((s, i) => (
        <li className="dg-span" key={i}>
          <span className="dg-when">{s.when}</span>
          <span className="dg-what">{inline(s.what, i * 300)}</span>
          {s.detail && <span className="dg-detail">{inline(s.detail, i * 300 + 100)}</span>}
        </li>
      ))}
    </ol>
  );
}

/* ----------------------------------------------------------------------- flow */

/** One line of `a | b | c`, or one step per line. Both shapes flatten to the same chain. */
export function parseFlow(lines: string[]): string[] {
  return rows(lines).flatMap((l) => fields(l, true));
}

function flow(steps: string[], key: number): ReactNode {
  return (
    // A long chain scrolls inside its own box rather than widening the 720px answer column.
    <div className="dg dg-flow-wrap" key={key}>
      <ol className="dg-flow">
        {steps.map((step, i) => (
          <li className="dg-step" key={i}>
            {i > 0 && (
              <span className="dg-arrow" aria-hidden="true">
                →
              </span>
            )}
            <span className="dg-box">{inline(step, i * 300)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------------------------------------------------------------------- stack */

export interface Layer {
  name: string;
  items: string[];
}

/* Positions of a separator character that is not inside a markdown link.
 *
 * A stack line separates the layer from its items with a colon, and separates items with
 * commas. Both characters also occur inside a link: `[Daemon](https://exfer.info/): x` has a
 * colon in `https:` five characters before the one that matters, and a URL may carry a comma
 * in its path. Splitting on the first raw colon put the layer name at `[Daemon](https` and
 * threw the rest away. Counting bracket depth is what tells the two apart. */
function topLevel(line: string, sep: string): number[] {
  const out: number[] = [];
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth = Math.max(0, depth - 1);
    else if (c === sep && depth === 0) out.push(i);
  }
  return out;
}

/** `Daemon: exfer-walletd` — the colon separates the layer from what sits in it. */
export function parseStack(lines: string[]): Layer[] {
  const out: Layer[] = [];
  for (const line of rows(lines)) {
    const at = topLevel(line, ":")[0];
    if (at == null || at <= 0) continue;
    const name = line.slice(0, at).trim();
    const body = line.slice(at + 1);
    const cuts = topLevel(body, ",");
    const items = [0, ...cuts.map((n) => n + 1)]
      .map((from, n) => body.slice(from, cuts[n] ?? body.length))
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name || !items.length) continue;
    out.push({ name, items });
  }
  return out;
}

function stack(layers: Layer[], key: number): ReactNode {
  return (
    <dl className="dg dg-stack" key={key}>
      {layers.map((l, i) => (
        <div className="dg-layer" key={i}>
          <dt className="dg-layer-name">{inline(l.name, i * 900)}</dt>
          <dd className="dg-layer-items">
            {l.items.map((item, n) => (
              <span className="dg-pill" key={n}>
                {inline(item, i * 900 + n * 30 + 1)}
              </span>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* -------------------------------------------------------------------- metrics */

export interface Metric {
  value: string;
  label: string;
}

/** `290 MB/s | sustained transfer, up from 70` */
export function parseMetrics(lines: string[]): Metric[] {
  const out: Metric[] = [];
  for (const line of rows(lines)) {
    const [value, ...rest] = fields(line);
    const label = rest.join(" · ");
    // A number with no label is a number with no meaning.
    if (!value || !label) continue;
    out.push({ value, label });
  }
  return out;
}

function metrics(items: Metric[], key: number): ReactNode {
  return (
    <dl className="dg dg-metrics" key={key}>
      {items.map((m, i) => (
        <div className="dg-metric" key={i}>
          <dt className="dg-value">{m.value}</dt>
          <dd className="dg-label">{inline(m.label, i * 300)}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------- dispatch */

/** Today, in months since year 0. Takes a date so a test can pin it. */
export function nowMonths(d: Date = new Date()): number {
  return d.getFullYear() * 12 + d.getMonth();
}

/** Languages that draw. Anything else is a code block, which is what it was already. */
const KINDS = new Set(["timeline", "flow", "stack", "metrics"]);

export function isDiagram(lang?: string): boolean {
  return Boolean(lang && KINDS.has(lang.toLowerCase()));
}

/**
 * A block to draw, or `null` to leave it as a code block.
 *
 * Returning `null` rather than throwing is the whole error strategy. Every path out of a bad
 * block ends at a `<pre>` holding exactly what the model wrote: an unknown language, an empty
 * body, a body whose lines all fail to parse. A visitor sees slightly raw text, never a
 * renderer error where an answer should be.
 */
export function diagram(lang: string | undefined, lines: string[], key: number): ReactNode | null {
  if (!isDiagram(lang)) return null;

  switch (lang!.toLowerCase()) {
    case "timeline": {
      const spans = parseTimeline(lines);
      if (!spans.length) return null;
      const now = nowMonths();
      const bars = spans.map((s) => parseWhen(s.when, now));
      if (spans.length > 1 && bars.every((b): b is Bar => b !== null)) {
        return gantt(spans, bars as Bar[], key);
      }
      return timeline(spans, key);
    }
    case "flow": {
      const steps = parseFlow(lines);
      // One box with an arrow to nothing is not a flow.
      return steps.length >= 2 ? flow(steps, key) : null;
    }
    case "stack": {
      const layers = parseStack(lines);
      return layers.length ? stack(layers, key) : null;
    }
    case "metrics": {
      const items = parseMetrics(lines);
      return items.length ? metrics(items, key) : null;
    }
    default:
      return null;
  }
}
