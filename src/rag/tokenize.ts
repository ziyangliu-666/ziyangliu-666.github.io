/* Tokenizer shared by the corpus builder and the browser query path.
 *
 * The two MUST agree: MiniSearch stores the tokens produced at build time, so a
 * query tokenized differently simply misses. Any edit here requires `npm run corpus`.
 *
 * The corpus is bilingual — the résumé exists in English and Chinese — and Chinese
 * has no spaces to split on. A whitespace tokenizer would index the Chinese résumé
 * as a handful of enormous tokens and make it unretrievable. So CJK runs emit both
 * unigrams (recall: a one-character query still hits) and bigrams (precision: 迁移
 * as a unit outranks documents that merely contain 迁 and 移 apart).
 */

const CJK =
  /[㐀-䶿一-鿿豈-﫿぀-ゟ゠-ヿ가-힯]/;

const WORD = /[\p{L}\p{N}]/u;

function isCJK(ch: string): boolean {
  return CJK.test(ch);
}

export function tokenize(input: string): string[] {
  const s = input.toLowerCase();
  const out: string[] = [];
  let buf = "";

  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (isCJK(ch)) {
      flush();
      out.push(ch);
      const next = s[i + 1];
      if (next && isCJK(next)) out.push(ch + next);
    } else if (WORD.test(ch)) {
      buf += ch;
    } else {
      flush();
    }
  }
  flush();
  return out;
}

/** MiniSearch's `processTerm` runs per token; we only drop noise here. */
export function processTerm(term: string): string | null {
  if (term.length === 1 && !isCJK(term)) return null; // single Latin letters carry nothing
  return term;
}
