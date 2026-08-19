/* Markdown → React elements.
 *
 * The model writes markdown and answers should render as rich text, with links a reader
 * can click through to the repository or paper being discussed.
 *
 * This parses to React nodes and never touches innerHTML. That is the whole security
 * argument: the text being rendered is model output, and the model has just been reading
 * arbitrary web pages through fetch_url, so it is untrusted by construction. With no HTML
 * pass-through there is no injection surface to sanitise — the only attacker-influenced
 * value that reaches the DOM as anything but text is a link target, and safeHref gates
 * that to http, https and mailto.
 *
 * Scope is deliberately the subset a chat model actually emits. Streaming is handled by
 * being re-run on the accumulated text each frame: an unterminated `**` renders as literal
 * asterisks for a moment and then resolves itself, which is cheaper than buffering.
 */

import type { ReactNode } from "react";

import { diagram } from "./diagrams";
import { inline, safeSrc } from "./inline";

/* ----------------------------------------------------------------------- block */

interface Block {
  kind: "p" | "h" | "ul" | "ol" | "quote" | "pre" | "hr" | "table";
  level?: number;
  lines: string[];
  lang?: string;
  /** Fenced blocks only: false while the closing fence has not arrived yet. */
  closed?: boolean;
}

function blocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;

  const last = () => out[out.length - 1];

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code. An unclosed fence (mid-stream) still renders what has arrived.
    const fence = /^ {0,3}```+ *([\w+-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^ {0,3}```+/.test(lines[i]!)) body.push(lines[i++]!);
      const closed = i < lines.length;
      if (closed) i++; // closing fence
      out.push({ kind: "pre", lines: body, lang: fence[1] || undefined, closed });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = /^ {0,3}(#{1,6}) +(.*)$/.exec(line);
    if (heading) {
      out.push({
        kind: "h",
        level: heading[1]!.length,
        lines: [heading[2]!.trim()],
      });
      i++;
      continue;
    }

    if (/^ {0,3}([-*_])(?: *\1){2,} *$/.test(line)) {
      out.push({ kind: "hr", lines: [] });
      i++;
      continue;
    }

    // Table: a header row of pipes followed by a |---|---| separator.
    if (
      /^ {0,3}\|.*\|/.test(line) &&
      i + 1 < lines.length &&
      /^ {0,3}\|[ :|-]+\|/.test(lines[i + 1]!)
    ) {
      const rows: string[] = [line];
      i += 2; // skip the separator
      while (i < lines.length && /^ {0,3}\|/.test(lines[i]!)) rows.push(lines[i++]!);
      out.push({ kind: "table", lines: rows });
      continue;
    }

    const bullet = /^ {0,3}[-*+] +(.*)$/.exec(line);
    if (bullet) {
      if (last()?.kind === "ul") last()!.lines.push(bullet[1]!);
      else out.push({ kind: "ul", lines: [bullet[1]!] });
      i++;
      continue;
    }

    const ordered = /^ {0,3}\d+[.)] +(.*)$/.exec(line);
    if (ordered) {
      if (last()?.kind === "ol") last()!.lines.push(ordered[1]!);
      else out.push({ kind: "ol", lines: [ordered[1]!] });
      i++;
      continue;
    }

    const quote = /^ {0,3}> ?(.*)$/.exec(line);
    if (quote) {
      if (last()?.kind === "quote") last()!.lines.push(quote[1]!);
      else out.push({ kind: "quote", lines: [quote[1]!] });
      i++;
      continue;
    }

    // Paragraph: consecutive plain lines. A single newline inside one stays a line break,
    // because the model uses them for em-dash lists it wrote as prose.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^ {0,3}(#{1,6} |[-*+] |\d+[.)] |> |```|\|)/.test(lines[i]!) &&
      !/^ {0,3}([-*_])(?: *\1){2,} *$/.test(lines[i]!)
    ) {
      para.push(lines[i++]!);
    }
    out.push({ kind: "p", lines: para });
  }

  return out;
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

function withBreaks(lines: string[], key: number): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, n) => {
    if (n) out.push(<br key={`br-${key}-${n}`} />);
    out.push(...inline(line, key * 1000 + n * 10));
  });
  return out;
}

export function Markdown({
  text,
  caret,
}: {
  text: string;
  /** Streaming cursor. Appended inside the last block so it trails the final word,
   * the way it did when answers were one pre-wrap text node. */
  caret?: boolean;
}): ReactNode {
  const parsed = blocks(text);
  const lastIndex = parsed.length - 1;
  const cursor = caret ? <span className="caret" key="caret" /> : null;

  return parsed.map((b, i) => {
    const trailing = i === lastIndex ? cursor : null;
    switch (b.kind) {
      case "h":
        return (
          <div className={`md-h md-h${Math.min(3, b.level ?? 3)}`} key={i}>
            {inline(b.lines[0]!, i * 1000)}
            {trailing}
          </div>
        );
      case "ul":
        return (
          <ul className="md-list" key={i}>
            {b.lines.map((li, n) => (
              <li key={n}>
                {inline(li, i * 1000 + n * 10)}
                {n === b.lines.length - 1 ? trailing : null}
              </li>
            ))}
          </ul>
        );
      case "ol":
        return (
          <ol className="md-list" key={i}>
            {b.lines.map((li, n) => (
              <li key={n}>
                {inline(li, i * 1000 + n * 10)}
                {n === b.lines.length - 1 ? trailing : null}
              </li>
            ))}
          </ol>
        );
      case "quote":
        return (
          <blockquote className="md-quote" key={i}>
            {withBreaks(b.lines, i)}
            {trailing}
          </blockquote>
        );
      case "pre": {
        /* Only draw once the closing fence has arrived. Mid-stream a six-step flow would
         * otherwise appear one step at a time, each arrival reflowing the ones before it.
         * Until then it stays a code block, which is honest about what is happening. */
        const drawn = b.closed ? diagram(b.lang, b.lines, i) : null;
        if (drawn) return drawn;
        return (
          <pre className="md-pre" key={i}>
            <code>{b.lines.join("\n")}</code>
            {trailing}
          </pre>
        );
      }
      case "hr":
        return <div className="md-hr" key={i} />;
      case "table": {
        const [head, ...body] = b.lines;
        return (
          <div className="md-table-wrap" key={i}>
            <table className="md-table">
              <thead>
                <tr>
                  {cells(head!).map((c, n) => (
                    <th key={n}>{inline(c, i * 1000 + n)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, r) => (
                  <tr key={r}>
                    {cells(row).map((c, n) => (
                      <td key={n}>{inline(c, i * 10000 + r * 100 + n)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      default: {
        const lone = b.lines.length === 1 ? /^!\[([^\]\n]*)\]\(([^)\s]+)\)$/.exec(b.lines[0]!) : null;
        const loneSrc = lone ? safeSrc(lone[2]!) : null;
        if (lone && loneSrc) {
          return (
            <figure className="md-figure" key={i}>
              <img
                className="md-img"
                src={loneSrc}
                alt={lone[1]!}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              {lone[1] && <figcaption className="md-caption">{lone[1]}</figcaption>}
              {trailing}
            </figure>
          );
        }
        return (
          <p className="md-p" key={i}>
            {withBreaks(b.lines, i)}
            {trailing}
          </p>
        );
      }
    }
  });
}
