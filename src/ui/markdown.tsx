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

/* ---------------------------------------------------------------------- inline */

/** Only schemes that cannot execute. `javascript:` and `data:` never reach an href. */
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) return url; // our own assets
  return null;
}

/* One level of nested parentheses is allowed inside a link target. Without it
 * `[x](javascript:alert(1))` matches only as far as the first `)`, and the leftover
 * bracket is rendered as text next to the label — visible debris from a link the
 * renderer was right to reject. Real URLs need it too: Wikipedia is full of them. */
const INLINE =
  /(`[^`\n]+`)|(\*\*\*[^*\n]+\*\*\*)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^\s*][^*\n]*?\*)|(\[[^\]\n]*\]\((?:[^()\s]|\([^()\s]*\))+\))|(<?https?:\/\/[^\s<>()[\]]+>?)/g;

function link(href: string, label: ReactNode, key: number): ReactNode {
  const safe = safeHref(href);
  if (!safe) return <span key={key}>{label}</span>;
  const external = /^https?:/i.test(safe);
  return (
    <a
      key={key}
      className="md-a"
      href={safe}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
    >
      {label}
    </a>
  );
}

function inline(text: string, keyBase = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = keyBase;

  for (const m of text.matchAll(INLINE)) {
    const token = m[0];
    const at = m.index;
    if (at > last) out.push(text.slice(last, at));
    last = at + token.length;

    if (token.startsWith("`")) {
      out.push(
        <code className="md-code" key={key++}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("***")) {
      out.push(
        <strong className="md-strong" key={key++}>
          <em>{token.slice(3, -3)}</em>
        </strong>,
      );
    } else if (token.startsWith("**")) {
      out.push(
        <strong className="md-strong" key={key++}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("__")) {
      out.push(
        <strong className="md-strong" key={key++}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("~~")) {
      out.push(<s key={key++}>{token.slice(2, -2)}</s>);
    } else if (token.startsWith("*")) {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);
      out.push(link(href, inline(label, key * 100), key++));
    } else {
      // Bare URL, optionally in angle brackets.
      const url = token.replace(/^<|>$/g, "");
      out.push(link(url, prettyUrl(url), key++));
    }
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A bare URL in prose reads better as host + path than as a 90-character string. */
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const shown = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
    return shown.length > 48 ? `${shown.slice(0, 47)}…` : shown;
  } catch {
    return url;
  }
}

/* ----------------------------------------------------------------------- block */

interface Block {
  kind: "p" | "h" | "ul" | "ol" | "quote" | "pre" | "hr" | "table";
  level?: number;
  lines: string[];
  lang?: string;
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
      if (i < lines.length) i++; // closing fence
      out.push({ kind: "pre", lines: body, lang: fence[1] || undefined });
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
      case "pre":
        return (
          <pre className="md-pre" key={i}>
            <code>{b.lines.join("\n")}</code>
            {trailing}
          </pre>
        );
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
      default:
        return (
          <p className="md-p" key={i}>
            {withBreaks(b.lines, i)}
            {trailing}
          </p>
        );
    }
  });
}
