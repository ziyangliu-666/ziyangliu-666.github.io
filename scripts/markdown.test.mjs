/* Cases the answer renderer must keep passing. `npx tsx scripts/markdown.test.mjs`
 *
 * The parser produces React elements, so these assert on the element tree rather than on
 * HTML. Two cases are load-bearing rather than illustrative:
 *
 *   - `javascript:` must never reach an href, and must not leave bracket debris behind
 *     when it is rejected. That is the one place model output becomes a DOM attribute.
 *   - `2 * 3 * 4` must survive. An italics rule loose enough to pair those asterisks
 *     silently deletes arithmetic out of an answer about throughput.
 */

import { Markdown } from "../src/ui/markdown.tsx";
import { sparkle } from "../src/ui/sparkle.ts";

/** Walk the element tree the way a renderer would, collecting what we assert on. */
function walk(node, acc) {
  if (node == null || typeof node === "boolean") return acc;
  if (typeof node === "string" || typeof node === "number") {
    acc.text += String(node);
    return acc;
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, acc);
    return acc;
  }
  const type = node.type;
  const props = node.props ?? {};
  if (typeof type === "string") {
    acc.tags.push(type);
    if (type === "a") acc.hrefs.push(props.href ?? null);
    if (props.className) acc.classes.push(props.className);
  }
  if (props.children !== undefined) walk(props.children, acc);
  return acc;
}

function render(md) {
  return walk(Markdown({ text: md }), {
    text: "",
    tags: [],
    hrefs: [],
    classes: [],
  });
}

/* The word picker. It edits the model's text before the renderer sees it, so a mark landing in
 * the wrong place does not degrade, it corrupts: a mark inside a drawn block turns the block into
 * a code block, and one inside a link breaks the link. Every case here is one the fuzz caught. */
const SPARKLE_SAMPLE = [
  "Ziyang worked on three areas at [HKUST](https://hkust-gz.edu.cn/) between them.",
  "",
  "- **[Copy-as-Decode](https://arxiv.org/pdf/2604.18170v1)** names the input lines to copy.",
  "- It keeps a long chat usable with a `recall()` tool that measures recall properly.",
  "",
  "```metrics",
  "290 MB/s | sustained transfer, up from 70",
  "```",
  "",
  "| When | What |",
  "|---|---|",
  "| Aug 2026 | started at NUS |",
  "",
  "He is reachable at ziyang.liu.r@outlook.com, and his work landed in ahuman-exfer/exfer.",
].join("\n");

function sparkleChecks() {
  const results = [];
  const marks = (out) => [...out.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]);
  const words = new Set();
  let leak = null;
  let count = null;

  for (let seed = 1; seed <= 300; seed++) {
    const out = sparkle(SPARKLE_SAMPLE, seed);
    for (const w of marks(out)) words.add(w);

    const n = marks(out).length;
    if (n < 1 || n > 2) count ??= `seed ${seed} produced ${n} marks`;

    const forbidden = [
      [/```[\s\S]*?\{\{[\s\S]*?```/, "inside a fence"],
      [/^\s*\|.*\{\{/m, "in a table row"],
      [/\]\([^)]*\{\{|\{\{[^}]*\}\}\]\(/, "in a link"],
      [/`[^`\n]*\{\{[^`\n]*`/, "in inline code"],
      [/[^\s]*@[^\s]*\{\{|\{\{[^}]*\}\}[^\s]*@/, "in an email address"],
      [/\{\{[^}]*\}\}[^\s]*\/|\/[^\s]*\{\{/, "in a slug or path"],
    ];
    for (const [re, where] of forbidden) {
      if (re.test(out)) leak ??= `seed ${seed}: mark ${where}`;
    }
  }

  results.push({
    name: "the word picker never marks anything but prose",
    pass: leak === null,
    detail: leak,
  });
  results.push({
    name: "the word picker always places one or two marks",
    pass: count === null,
    detail: count,
  });
  results.push({
    name: "the word picker is actually random across seeds",
    pass: words.size >= 8,
    detail: `${words.size} distinct words over 300 seeds`,
  });
  results.push({
    name: "the same seed picks the same words",
    pass: sparkle(SPARKLE_SAMPLE, 42) === sparkle(SPARKLE_SAMPLE, 42),
    detail: null,
  });
  results.push({
    name: "text with nowhere safe to mark is returned untouched",
    pass: sparkle("```js\nconst x = 1;\n```", 3) === "```js\nconst x = 1;\n```",
    detail: null,
  });
  return results;
}

const checks = [
  {
    name: "bold, italic and inline code",
    md: "A **bold** and *slanted* and `coded` line.",
    want: (r) =>
      r.tags.includes("strong") && r.tags.includes("em") && r.tags.includes("code"),
  },
  {
    name: "markdown link becomes an anchor",
    md: "see [the preprint](https://arxiv.org/abs/2604.18170) for detail",
    want: (r) => r.hrefs.includes("https://arxiv.org/abs/2604.18170"),
  },
  {
    name: "bare URL becomes an anchor, shown as host and path",
    md: "the repo is at https://github.com/exfer-stack/exfer-mcp today",
    want: (r) =>
      r.hrefs.includes("https://github.com/exfer-stack/exfer-mcp") &&
      r.text.includes("github.com/exfer-stack/exfer-mcp"),
  },
  {
    name: "javascript: URI never becomes an href",
    md: "[click me](javascript:alert(1)) trailing",
    want: (r) => r.hrefs.length === 0 && r.text.includes("click me"),
  },
  {
    name: "rejected link leaves no bracket debris",
    md: "[click me](javascript:alert(1)) trailing",
    want: (r) => !r.text.includes(")") && r.text.includes("trailing"),
  },
  {
    name: "arithmetic is not read as italics",
    md: "throughput was 2 * 3 * 4 times",
    want: (r) => r.text.includes("2 * 3 * 4") && !r.tags.includes("em"),
  },
  {
    name: "bulleted list",
    md: "- first\n- second",
    want: (r) => r.tags.includes("ul") && r.tags.filter((t) => t === "li").length === 2,
  },
  {
    name: "numbered list",
    md: "1. first\n2. second",
    want: (r) => r.tags.includes("ol") && r.tags.filter((t) => t === "li").length === 2,
  },
  {
    name: "fenced code block",
    md: "```python\nresolver.expand(x)\n```",
    want: (r) => r.tags.includes("pre") && r.text.includes("resolver.expand(x)"),
  },
  {
    name: "table with header and rows",
    md: "| Corpus | Bound |\n|---|---|\n| ProbeEdit | 29.0x |",
    want: (r) =>
      r.tags.includes("table") &&
      r.tags.includes("th") &&
      r.tags.filter((t) => t === "td").length === 2,
  },
  {
    name: "heading",
    md: "## Copy-as-Decode\ntext after",
    want: (r) => r.classes.some((c) => String(c).includes("md-h")),
  },
  {
    name: "blockquote",
    md: "> an upper bound, not a production number",
    want: (r) => r.tags.includes("blockquote"),
  },
  {
    name: "paragraphs keep their single line breaks",
    md: "line one\nline two",
    want: (r) => r.tags.includes("br"),
  },
  {
    name: "unterminated bold mid-stream stays literal",
    md: "the **partially arrived",
    want: (r) => !r.tags.includes("strong") && r.text.includes("**partially"),
  },
  {
    name: "caret rides inside the last block",
    md: "an answer",
    want: () => {
      const r = walk(Markdown({ text: "an answer", caret: true }), {
        text: "",
        tags: [],
        hrefs: [],
        classes: [],
      });
      return r.classes.includes("caret");
    },
  },
  /* --- structured blocks ------------------------------------------------ */
  {
    name: "timeline draws every field: date, event and detail",
    md: "```timeline\n2022-10 → 2024-07 | R&D Intern, SmartX | V2V OS 1.2.0 to 1.6.0\n2024-07 → 2025-09 | R&D Engineer, SmartX\n```",
    want: (r) =>
      // Both rows carry dates, so this is the dated view rather than the plain rail.
      r.classes.filter((c) => c === "dg-bar-label").length === 2 &&
      r.classes.includes("dg-bar-when") &&
      r.classes.includes("dg-bar-detail") &&
      r.text.includes("2022-10 → 2024-07") &&
      r.text.includes("R&D Intern, SmartX") &&
      r.text.includes("V2V OS 1.2.0 to 1.6.0") &&
      !r.tags.includes("pre"),
  },
  {
    name: "undated rows still draw as the plain rail",
    md: "```timeline\nEarly on | Wrote the migration service\nLater | Led the product design\n```",
    want: (r) =>
      r.classes.includes("dg dg-timeline") &&
      r.classes.filter((c) => c === "dg-span").length === 2 &&
      r.classes.includes("dg-when"),
  },
  {
    name: "dated spans become bars on a shared axis, so overlaps overlap",
    md: "```timeline\n2020-09 → 2024-06 | B.Eng., UESTC\n2022-10 → 2024-07 | R&D Intern, SmartX\n2024-07 → 2025-09 | R&D Engineer, SmartX\n```",
    want: (r) =>
      r.classes.includes("dg dg-gantt") &&
      r.classes.filter((c) => c === "dg-bar").length === 3 &&
      // The axis spans 2020-09 to 2025-09, so it carries a tick for every year in between.
      r.classes.filter((c) => c === "dg-tick").length >= 4 &&
      !r.classes.includes("dg dg-timeline"),
  },
  {
    name: "one unreadable date drops the whole block back to the plain rail",
    md: "```timeline\n2020-09 → 2024-06 | B.Eng., UESTC\nsometime later | Something else\n```",
    want: (r) => r.classes.includes("dg dg-timeline") && !r.classes.includes("dg dg-gantt"),
  },
  {
    name: "month names and open-ended spans parse too",
    md: "```timeline\nSep 2025 → Aug 2026 | Research, HKUST\nAug 2026 → now | M.Tech., NUS\n```",
    want: (r) => r.classes.includes("dg dg-gantt") && r.classes.filter((c) => c === "dg-bar").length === 2,
  },
  {
    name: "a single dated span stays a rail, since one bar has nothing to overlap",
    md: "```timeline\n2024-07 → 2025-09 | R&D Engineer, SmartX\n```",
    want: (r) => r.classes.includes("dg dg-timeline") && !r.classes.includes("dg dg-gantt"),
  },
  {
    name: "a backwards range is not a span",
    md: "```timeline\n2025-09 → 2024-07 | Backwards\n2024-07 → 2025-09 | Forwards\n```",
    want: (r) => r.classes.includes("dg dg-timeline") && !r.classes.includes("dg dg-gantt"),
  },
  {
    name: "timeline row with no event is dropped, not drawn empty",
    md: "```timeline\n2022-10\n2024-07 → 2025-09 | R&D Engineer\n```",
    want: (r) => r.classes.filter((c) => c === "dg-span").length === 1,
  },
  {
    name: "flow accepts one line of pipes",
    md: "```flow\nsnapshot | CBT scan | async read | volume\n```",
    want: (r) =>
      r.classes.includes("dg-flow") &&
      r.classes.filter((c) => c === "dg-step").length === 4 &&
      // Three arrows for four boxes: the first step has nothing to point from.
      r.classes.filter((c) => c === "dg-arrow").length === 3,
  },
  {
    name: "flow accepts arrows and one step per line",
    md: "```flow\nsnapshot -> CBT scan\nasync read\nvolume\n```",
    want: (r) => r.classes.filter((c) => c === "dg-step").length === 4,
  },
  {
    name: "flow of one step is a sentence, so it stays a code block",
    md: "```flow\njust the one\n```",
    want: (r) => r.tags.includes("pre") && !r.classes.includes("dg-flow"),
  },
  {
    name: "stack splits layers on the colon and items on commas",
    md: "```stack\nWallets: desktop, mobile\nDaemon: exfer-walletd\n```",
    want: (r) =>
      r.classes.includes("dg dg-stack") &&
      r.classes.filter((c) => c === "dg-layer").length === 2 &&
      r.classes.filter((c) => c === "dg-pill").length === 3 &&
      r.text.includes("Wallets"),
  },
  {
    name: "metrics keeps value and label apart",
    md: "```metrics\n290 MB/s | sustained transfer\n10,000+ | VMs migrated\n```",
    want: (r) =>
      r.classes.includes("dg dg-metrics") &&
      r.classes.filter((c) => c === "dg-value").length === 2 &&
      r.text.includes("290 MB/s") &&
      r.text.includes("VMs migrated"),
  },
  {
    name: "a bare number with no label is not a metric",
    md: "```metrics\n290\n```",
    want: (r) => r.tags.includes("pre") && !r.classes.includes("dg dg-metrics"),
  },
  {
    name: "an unknown fence language is still a code block",
    md: "```mermaid\ngraph TD; A-->B;\n```",
    want: (r) => r.tags.includes("pre") && r.text.includes("graph TD"),
  },
  {
    name: "an empty block body degrades instead of drawing nothing",
    md: "```timeline\n\n```",
    want: (r) => r.tags.includes("pre") && !r.classes.includes("dg dg-timeline"),
  },
  {
    name: "an unclosed fence mid-stream never draws half a diagram",
    md: "```timeline\n2022-10 → 2024-07 | R&D Intern, SmartX",
    want: (r) => r.tags.includes("pre") && !r.classes.includes("dg dg-timeline"),
  },
  {
    name: "real code blocks are untouched by any of this",
    md: "```python\nprint('hi')\n```",
    want: (r) => r.tags.includes("pre") && r.text.includes("print('hi')"),
  },

  /* Links inside a drawn block. Every field except a timeline date and a metric value runs
   * through the same inline() the prose uses, so a name in a box is clickable. */
  {
    name: "a gantt row links the product it names",
    md: "```timeline\n2022-10 → 2024-07 | R&D Intern, [SmartX](https://www.smartx.com/) | shipped [V2V OS](https://www.smartx.com/hk-mo/migration-tool/)\n2024-07 → 2025-09 | R&D Engineer, [SmartX](https://www.smartx.com/)\n```",
    want: (r) =>
      r.classes.includes("dg dg-gantt") &&
      r.hrefs.includes("https://www.smartx.com/") &&
      r.hrefs.includes("https://www.smartx.com/hk-mo/migration-tool/"),
  },
  {
    name: "the plain rail links too, not only the dated view",
    md: "```timeline\nEarly on | Wrote it at [SmartX](https://www.smartx.com/)\nLater | Led the design\n```",
    want: (r) =>
      r.classes.includes("dg dg-timeline") && r.hrefs.includes("https://www.smartx.com/"),
  },
  {
    name: "a flow step links",
    md: "```flow\nVMware snapshot | CBT scan | [SMTX OS](https://www.smartx.com/) volume\n```",
    want: (r) =>
      r.classes.includes("dg-flow") && r.hrefs.includes("https://www.smartx.com/"),
  },
  {
    name: "a stack links both the layer name and its items",
    md: "```stack\n[Daemon](https://exfer.info/): [exfer-walletd](https://github.com/exfer-stack/exfer-walletd)\n```",
    want: (r) =>
      r.hrefs.includes("https://exfer.info/") &&
      r.hrefs.includes("https://github.com/exfer-stack/exfer-walletd"),
  },
  {
    name: "a metric label links, and the big number stays bare",
    md: "```metrics\n28 | pull requests into [exfer](https://github.com/ahuman-exfer/exfer)\n```",
    want: (r) =>
      r.hrefs.includes("https://github.com/ahuman-exfer/exfer") &&
      r.text.includes("28"),
  },
  {
    name: "a link in a timeline date keeps its label, and the axis survives",
    md: "```timeline\n[2022-10](https://x.test/) → 2024-07 | R&D Intern, SmartX\n2024-07 → 2025-09 | R&D Engineer, SmartX\n```",
    want: (r) =>
      r.classes.includes("dg dg-gantt") &&
      r.text.includes("2022-10") &&
      !r.text.includes("](http") &&
      !r.hrefs.includes("https://x.test/"),
  },
  {
    name: "a link in a metric value keeps its label and never prints raw syntax",
    md: "```metrics\n[290 MB/s](https://x.test/) | sustained transfer\n```",
    want: (r) =>
      r.text.includes("290 MB/s") &&
      !r.text.includes("](http") &&
      !r.hrefs.includes("https://x.test/"),
  },
  {
    name: "a stack with a plain colon still parses, and commas still split items",
    md: "```stack\nWallets: desktop, mobile\nDaemon: exfer-walletd\n```",
    want: (r) =>
      r.classes.includes("dg dg-stack") &&
      r.classes.filter((c) => c === "dg-pill").length === 3 &&
      r.text.includes("Wallets"),
  },
  {
    name: "a comma inside a link URL does not split one item into two",
    md: "```stack\nDocs: [guide](https://exfer.info/a,b), [api](https://exfer.info/c)\n```",
    want: (r) =>
      r.classes.filter((c) => c === "dg-pill").length === 2 &&
      r.hrefs.includes("https://exfer.info/a,b"),
  },
  /* Emphasis wrapping a link. `**[name](url)**` is what the model writes for a prominent link,
   * and it used to render as literal markdown because only the link branch recursed. */
  {
    name: "a link inside bold still becomes an anchor",
    md: "- **[Copy-as-Decode](https://arxiv.org/pdf/2604.18170v1)** (decoding): text",
    want: (r) =>
      r.hrefs.includes("https://arxiv.org/pdf/2604.18170v1") &&
      r.tags.includes("strong") &&
      !r.text.includes("]("),
  },
  {
    name: "a link inside italics still becomes an anchor",
    md: "*[label](https://x.test/)* after",
    want: (r) =>
      r.hrefs.includes("https://x.test/") && r.tags.includes("em") && !r.text.includes("]("),
  },
  {
    name: "inline code inside bold stays code",
    md: "**the `recall()` tool** matters",
    want: (r) => r.tags.includes("strong") && r.tags.includes("code") && !r.text.includes("`"),
  },
  {
    name: "a rejected link inside bold leaves no debris",
    md: "**[click](javascript:alert(1))** trailing",
    want: (r) => r.hrefs.length === 0 && r.text.includes("click") && !r.text.includes(")"),
  },
  {
    name: "a marked word becomes a clickable button",
    md: "The transfer path was {{stubborn}} about ordering.",
    want: (r) =>
      r.tags.includes("button") &&
      r.classes.includes("md-spark") &&
      r.text.includes("stubborn") &&
      !r.text.includes("{{"),
  },
  {
    name: "braces inside inline code stay code, not a button",
    md: "the template is `{{name}}` in the config",
    want: (r) =>
      r.tags.includes("code") &&
      !r.classes.includes("md-spark") &&
      r.text.includes("{{name}}"),
  },
  {
    name: "an unclosed brace pair is left as text",
    md: "he wrote {{ and then stopped",
    want: (r) => r.text.includes("{{") && !r.classes.includes("md-spark"),
  },
  {
    name: "a mark spanning a newline is not a mark",
    md: "opening {{one\ntwo}} closing",
    want: (r) => !r.classes.includes("md-spark"),
  },
  {
    name: "an over-long mark is refused, so a whole paragraph cannot be painted",
    md: `before {{${"x".repeat(41)}}} after`,
    want: (r) => !r.classes.includes("md-spark"),
  },
  {
    name: "javascript: in a block field never becomes an href either",
    md: "```metrics\n290 MB/s | [transfer](javascript:alert(1)) rate\n```",
    want: (r) => r.hrefs.length === 0 && r.text.includes("transfer"),
  },
];

let failed = 0;
for (const c of checks) {
  let ok = false;
  try {
    ok = Boolean(c.want(render(c.md)));
  } catch (err) {
    ok = false;
    console.log(`      threw: ${err.message}`);
  }
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}`);
}
/* The picker's checks run their own loops rather than rendering one string, so they report a
 * verdict instead of going through render(). */
let total = checks.length;
for (const c of sparkleChecks()) {
  total++;
  if (!c.pass) failed++;
  console.log(`${c.pass ? "ok  " : "FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
}

console.log(failed ? `\n${failed} of ${total} failing` : `\nall ${total} pass`);
process.exit(failed ? 1 : 0);
