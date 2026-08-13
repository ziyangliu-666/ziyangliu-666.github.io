/* Cases the markdown stripper must keep passing. `npx tsx scripts/plainify.test.mjs`
 * The arithmetic case is the one that matters: a conservative italics rule is the
 * difference between "2 * 3 * 4" and "2  3  4". */
const cases = [
  ["**What it measures.** The paper is explicit", "What it measures. The paper is explicit"],
  ["- **Kernel speedup (§4.1)** — what one copy splice buys", "— Kernel speedup (§4.1) — what one copy splice buys"],
  ["a `<copy lines=\"i-j\"/>` references an input line", 'a <copy lines="i-j"/> references an input line'],
  ["## Results\ntext", "Results\ntext"],
  ["* first\n* second", "— first\n— second"],
  ["see [the paper](https://arxiv.org/abs/2604.18170) for detail", "see the paper (https://arxiv.org/abs/2604.18170) for detail"],
  ["throughput was 2 * 3 * 4 times", "throughput was 2 * 3 * 4 times"],
  ["an *emphasised* word", "an emphasised word"],
  ["> quoted line", "quoted line"],
  ["---", ""],
  ["```python\ncode()\n```", "code()\n"],
  ["__bold__ and normal", "bold and normal"],
];
const src = await import("../src/ui/plainify.ts");
let fail = 0;
for (const [input, want] of cases) {
  const got = src.plainify(input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${JSON.stringify(input).slice(0,52)}`);
  if (!ok) console.log(`        want ${JSON.stringify(want)}\n        got  ${JSON.stringify(got)}`);
}
console.log(fail ? `\n${fail} failing` : `\nall ${cases.length} pass`);
