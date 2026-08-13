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
console.log(failed ? `\n${failed} of ${checks.length} failing` : `\nall ${checks.length} pass`);
process.exit(failed ? 1 : 0);
