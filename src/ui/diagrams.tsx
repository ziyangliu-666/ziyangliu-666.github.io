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
 */

import type { ReactNode } from "react";

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

function timeline(spans: Span[], key: number): ReactNode {
  return (
    <ol className="dg dg-timeline" key={key}>
      {spans.map((s, i) => (
        <li className="dg-span" key={i}>
          <span className="dg-when">{s.when}</span>
          <span className="dg-what">{s.what}</span>
          {s.detail && <span className="dg-detail">{s.detail}</span>}
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
            <span className="dg-box">{step}</span>
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

/** `Daemon: exfer-walletd` — the colon separates the layer from what sits in it. */
export function parseStack(lines: string[]): Layer[] {
  const out: Layer[] = [];
  for (const line of rows(lines)) {
    const at = line.indexOf(":");
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    const items = line
      .slice(at + 1)
      .split(/\s*,\s*/)
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
          <dt className="dg-layer-name">{l.name}</dt>
          <dd className="dg-layer-items">
            {l.items.map((item, n) => (
              <span className="dg-pill" key={n}>
                {item}
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
          <dd className="dg-label">{m.label}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------- dispatch */

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
      return spans.length ? timeline(spans, key) : null;
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
