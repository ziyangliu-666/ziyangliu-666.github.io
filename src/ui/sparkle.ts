/* Picks the words that get painted.
 *
 * One or two words per answer come out in moving colour, and clicking five of them reveals the
 * game. The choice is made here rather than by the model. Asking the model to mark a word meant
 * teaching it a syntax it had never seen, and on the live site it simply did not do it: a real
 * question came back with zero marks. A rule the model ignores is worse than no rule, because
 * the mechanic silently does not exist.
 *
 * Chosen at random, and deliberately not chosen well. A rule like "pick the word that carries
 * the sentence" needs judgement this code does not have, and the visitor is looking for
 * something clickable, not for apt emphasis.
 *
 * The pick has to be stable. An answer re-renders on every token while it streams and on every
 * unrelated state change afterwards, so a fresh random choice each time would make the colour
 * crawl around the paragraph. Two things pin it: the caller passes a seed fixed for the life of
 * the message, and the generator below is deterministic given that seed.
 */

/* Deterministic PRNG. Same seed, same words, every render.
 *
 * splitmix32, not xorshift32. The first version was xorshift and it was not random at all: from
 * a small seed the first output is tiny, so the first pick was index 0 every time. Across 120
 * seeds, "He is reachable at ..." marked "reachable" 120 times. In production the seed is a
 * millisecond timestamp, large enough that xorshift would have looked fine, which is exactly
 * how that would have shipped unnoticed. splitmix32 mixes the seed before the first output, so
 * seed 1 and seed 2 land in different places. */
function rng(seed: number): () => number {
  let s = (seed | 0) + 0x9e3779b9;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = z ^ (z >>> 15);
    return (z >>> 0) / 0x100000000;
  };
}

/* Lines that are not prose:
 *
 *   #        a heading
 *   |        a table row
 *   >        a quote, which is someone else's words
 *
 * Fences are handled separately, by tracking state down the text. Matching the fence line alone
 * was not enough and the fuzz caught it: `290 MB/s | sustained transfer` inside a ```metrics
 * block starts with a digit, so it looked like prose and took a mark, which turned a drawn block
 * into a code block with braces in it. */
const SKIP_LINE = /^\s*(?:#|\||>)/;
const FENCE = /^\s*```/;

/* Where a mark must not go, even in a prose line. Ranges are found and excluded rather than the
 * whole line being skipped, because a paragraph that names three papers is mostly prose and
 * still deserves a mark.
 *
 *   `code`               the braces would be shown as text, not rendered
 *   [label](url)         a mark in a label or a target breaks the link
 *   ![alt](src)          the same, for an image
 *   bare URLs            the mark lands inside the href
 *   **bold** *italic*    a mark inside emphasis renders, but nesting is a maze; leave it alone
 *   {{already}}          nothing is marked twice
 *   a@b.com              an address is one token; colouring "outlook" inside it looks broken
 *   owner/repo, a/b.ts   a slug or a path is one token for the same reason
 *
 * The last two are not markdown, so nothing catches them structurally. Both appear as bare text
 * in real answers: his address, and slugs like ahuman-exfer/exfer. The fuzz marked "outlook" and
 * "ziyang" inside the address until they were added here.
 */
const PROTECTED = new RegExp(
  [
    "`[^`\n]*`", // inline code
    "!?\\[[^\\]\n]*\\]\\((?:[^()\\s]|\\([^()\\s]*\\))*\\)", // link or image
    "<?https?://[^\\s<>()\\[\\]]+>?", // bare URL
    "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}", // email address
    "[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)+", // owner/repo, or a path
    "\\*{1,3}[^*\n]+\\*{1,3}", // bold or italic
    "__[^_\n]+__",
    "~~[^~\n]+~~",
    "\\{\\{[^{}\n]*\\}\\}", // already marked
  ].join("|"),
  "g",
);

/* A word worth painting. Letters only, so no numbers, no units, no identifiers with an
 * underscore, and nothing hyphenated across the boundary. Five characters minimum: "the" in
 * colour looks like a rendering fault, and a longer word reads as deliberate. Sixteen maximum,
 * because a very long token here is usually something technical the sentence needs intact. */
const WORD = /\b[A-Za-z][a-z]{4,15}\b/g;

interface Slot {
  line: number;
  start: number;
  end: number;
}

/** Every position in the text where a mark could legally go. */
function slots(lines: string[]): Slot[] {
  const out: Slot[] = [];

  let inFence = false;

  lines.forEach((line, i) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence || SKIP_LINE.test(line)) return;

    // Blank out the protected ranges so WORD cannot match inside one, keeping offsets aligned.
    const masked = line.replace(PROTECTED, (m) => " ".repeat(m.length));

    for (const m of masked.matchAll(WORD)) {
      out.push({ line: i, start: m.index, end: m.index + m[0].length });
    }
  });

  return out;
}

/**
 * Wraps one or two words in `{{ }}`, which the inline renderer turns into a clickable mark.
 *
 * `seed` must be constant for the life of the message. Returns the text unchanged when there is
 * nowhere safe to put a mark, which is the right answer for a one-line reply or a block of code:
 * an answer with no mark costs the visitor one round of collecting, and a mark forced into a
 * table costs them a broken table.
 */
export function sparkle(text: string, seed: number): string {
  if (!text.trim()) return text;

  const lines = text.split("\n");
  const found = slots(lines);
  if (!found.length) return text;

  const next = rng(seed);
  // Two marks in a long answer, one in a short one. Two in three sentences is noise.
  const want = found.length >= 24 ? 2 : 1;

  /* Chosen by index, then applied right to left within each line so that inserting four
   * characters cannot move a slot that has not been used yet. */
  const picked: Slot[] = [];
  const seen = new Set<number>();
  for (let guard = 0; picked.length < want && guard < 40; guard++) {
    const at = Math.floor(next() * found.length);
    if (seen.has(at)) continue;
    seen.add(at);
    const slot = found[at]!;
    // Never two marks in one line: side by side they read as a highlighted phrase.
    if (picked.some((p) => p.line === slot.line)) continue;
    picked.push(slot);
  }

  for (const slot of picked.sort((a, b) => b.start - a.start)) {
    const line = lines[slot.line]!;
    lines[slot.line] =
      `${line.slice(0, slot.start)}{{${line.slice(slot.start, slot.end)}}}${line.slice(slot.end)}`;
  }

  return lines.join("\n");
}
