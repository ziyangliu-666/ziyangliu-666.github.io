/* Inline markdown → React nodes. Shared by the prose renderer and the diagram blocks.
 *
 * Split out of markdown.tsx so a diagram field and a paragraph resolve a link the same way.
 * A timeline row naming V2V OS should link it exactly as a sentence naming V2V OS does, and
 * two implementations of that would mean two sets of URL rules to keep safe.
 *
 * Never touches innerHTML. The text is model output, and the model has often been reading
 * arbitrary web pages seconds earlier, so it is untrusted by construction. The only
 * attacker-influenced value that reaches the DOM as anything but text is a link target, and
 * safeHref gates that to http, https and mailto.
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
/* Image sources: this site's own paths, and https elsewhere — a screenshot in a README or a
 * figure on a project page is often the best answer available, so remote images are allowed
 * deliberately.
 *
 * The cost, stated rather than hidden: loading a remote image tells that host the visitor's
 * IP, and the model chooses these URLs after reading pages that could try to talk it into
 * embedding a tracking pixel. `referrer-policy: no-referrer` on the tag keeps this page's URL
 * out of the request, which is the part we can control. http and data: are refused outright:
 * one is a downgrade, the other is a way to smuggle content past every check above. */
export function safeSrc(raw: string): string | null {
  const src = raw.trim();
  if (src.startsWith("/") && !src.startsWith("//")) return src;
  return /^https:\/\//i.test(src) ? src : null;
}

/* Emphasis recurses. `**[label](url)**` is the shape the model reaches for when it wants a
 * prominent link, and the bold branch used to render its contents as plain text, so a bulleted
 * list of papers came out as literal `[Copy-as-Decode](https://arxiv.org/pdf/...)`. Seen on the
 * live site. Only the link branch recursed; now every emphasis branch does.
 *
 * Nesting emphasis inside emphasis still does not work, and cannot with these patterns: `[^*\n]+`
 * stops at the first inner asterisk. That is a limit, not a bug to chase, because the model does
 * not write bold inside bold. A link inside bold it writes constantly. */

/* `{{word}}` is a marked word: one per answer, rendered in moving colour, clickable, and worth
 * one step toward the game. It sits after the code branch in this alternation on purpose, so
 * braces inside `inline code` stay code and are never turned into a button. */
const INLINE =
  /(!\[[^\]\n]*\]\([^)\s]+\))|(`[^`\n]+`)|(\{\{[^{}\n]{1,40}\}\})|(\*\*\*[^*\n]+\*\*\*)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^\s*][^*\n]*?\*)|(\[[^\]\n]*\]\((?:[^()\s]|\([^()\s]*\))+\))|(<?https?:\/\/[^\s<>()[\]]+>?)/g;

/** Strips the braces without rendering a mark. For anywhere a mark must not be interactive. */
export function unmark(text: string): string {
  return text.replace(/\{\{([^{}\n]{1,40})\}\}/g, "$1");
}

/* The game gets its own link treatment, because it is the only link on the page that leads to
 * something to do rather than something to read. When the agent hands a visitor that URL, the
 * link should look like a reward. Everything else stays the quiet white underline. */
const GAME_HREF = /^https?:\/\/game\.ziy\.bio(\/|$)/i;

function link(href: string, label: ReactNode, key: number): ReactNode {
  const safe = safeHref(href);
  if (!safe) return <span key={key}>{label}</span>;
  const external = /^https?:/i.test(safe);
  return (
    <a
      key={key}
      className={GAME_HREF.test(safe) ? "md-a md-a--game" : "md-a"}
      href={safe}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer noopener" : undefined}
    >
      {label}
    </a>
  );
}

export function inline(text: string, keyBase = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = keyBase;

  for (const m of text.matchAll(INLINE)) {
    const token = m[0];
    const at = m.index;
    if (at > last) out.push(text.slice(last, at));
    last = at + token.length;

    if (token.startsWith("![")) {
      const split = token.indexOf("](");
      const alt = token.slice(2, split);
      const src = safeSrc(token.slice(split + 2, -1));
      out.push(
        src ? (
          <img
            className="md-img"
            key={key++}
            src={src}
            alt={alt}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          // Off-site image: keep the caption the model wrote, drop the request.
          <span key={key++}>{alt}</span>
        ),
      );
    } else if (token.startsWith("{{")) {
      /* A button, not a span. It is clickable, so it has to be reachable by keyboard and
       * announced as something you can activate. The count is kept by a delegated listener on
       * the app root, which is why this carries a data attribute and no handler of its own:
       * inline() is a plain function shared by the prose and the diagram blocks, with no access
       * to component state. */
      out.push(
        <button className="md-spark" type="button" data-spark="1" key={key++}>
          {token.slice(2, -2)}
        </button>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code className="md-code" key={key++}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("***")) {
      out.push(
        <strong className="md-strong" key={key}>
          <em>{inline(token.slice(3, -3), key++ * 100)}</em>
        </strong>,
      );
    } else if (token.startsWith("**") || token.startsWith("__")) {
      out.push(
        <strong className="md-strong" key={key}>
          {inline(token.slice(2, -2), key++ * 100)}
        </strong>,
      );
    } else if (token.startsWith("~~")) {
      out.push(<s key={key}>{inline(token.slice(2, -2), key++ * 100)}</s>);
    } else if (token.startsWith("*")) {
      out.push(<em key={key}>{inline(token.slice(1, -1), key++ * 100)}</em>);
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
