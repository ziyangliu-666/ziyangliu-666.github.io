/* Retrieval debugger. Runs the same code path the browser runs.
 *
 *   npx tsx scripts/query-corpus.ts "transfer throughput"
 *   npx tsx scripts/query-corpus.ts --kind resume "迁移 吞吐"
 *   npx tsx scripts/query-corpus.ts --self-test
 *
 * When an answer on the live site is wrong, check here first: if the chunk the answer
 * needed is not in this output, the bug is retrieval, not the model.
 */

import fs from "node:fs";
import path from "node:path";
import { Corpus, type Kind } from "../src/rag/corpus";

const ROOT = path.resolve(import.meta.dirname, "..");
const bundlePath = path.join(ROOT, "public", "corpus", "index.json");

if (!fs.existsSync(bundlePath)) {
  console.error("No corpus yet. Run `npm run corpus` first.");
  process.exit(1);
}

const corpus = Corpus.fromBundle(
  JSON.parse(fs.readFileSync(bundlePath, "utf8")),
);

const argv = process.argv.slice(2);
const selfTest = argv.includes("--self-test");
const kindIdx = argv.indexOf("--kind");
const kinds =
  kindIdx >= 0 ? ([argv[kindIdx + 1]] as Kind[]) : undefined;
const query = argv
  .filter((a, i) => a !== "--self-test" && i !== kindIdx && i !== kindIdx + 1)
  .join(" ")
  .trim();

function show(q: string, kinds?: Kind[]) {
  const hits = corpus.search(q, { kinds, limit: 6 });
  console.log(`\n"${q}"${kinds ? ` [${kinds.join(",")}]` : ""} → ${hits.length} hits`);
  for (const h of hits) {
    console.log(
      `  ${h.score.toFixed(1).padStart(6)}  ${h.id.padEnd(24)} ${h.heading.slice(0, 60)}`,
    );
    console.log(`          ${h.text.replace(/\s+/g, " ").slice(0, 150)}…`);
  }
}

/* Cases that must keep working. Each one is a real failure this corpus has to survive:
 * bilingual retrieval, a number buried in a bullet, a paper's contribution, and the
 * anonymity rule. */
const SELF_TEST: { query: string; mustHit: RegExp; note: string }[] = [
  {
    query: "transfer throughput MB/s",
    mustHit: /^resume-en#/,
    note: "English résumé, a number inside a bullet",
  },
  {
    query: "迁移 吞吐 提升",
    mustHit: /^resume-zh#/,
    note: "Chinese résumé — fails outright if the CJK tokenizer regresses",
  },
  {
    query: "keyword bookmarks recall tool",
    mustHit: /^paper-memory-paging#/,
    note: "arXiv preprint body text",
  },
  {
    query: "atomic swap HTLC preimage",
    mustHit: /^about-exfer#/,
    note: "hand-written project note",
  },
  {
    query: "VidTide living benchmark",
    mustHit: /^(about-research|resume)/,
    note: "under review — title only, must not reach a paper chunk",
  },
];

if (selfTest) {
  let failed = 0;
  for (const t of SELF_TEST) {
    const hits = corpus.search(t.query, { limit: 6 });
    const ok = hits.some((h) => t.mustHit.test(h.id));
    console.log(
      `${ok ? "ok  " : "FAIL"}  ${t.query.padEnd(34)} ${t.note}${
        ok ? "" : `\n        got: ${hits.map((h) => h.id).join(", ") || "(nothing)"}`
      }`,
    );
    if (!ok) failed++;
  }

  // The under-review papers must have no body text anywhere in the index.
  const leaks = Object.entries(
    (JSON.parse(fs.readFileSync(bundlePath, "utf8")) as { chunks: Record<string, string> })
      .chunks,
  ).filter(
    ([id, text]) =>
      /FOVEA|VidTide/i.test(text) &&
      !/^(about-research|resume-en|resume-zh)/.test(id),
  );
  if (leaks.length) {
    console.log(`FAIL  under-review text leaked into: ${leaks.map(([id]) => id).join(", ")}`);
    failed++;
  } else {
    console.log("ok    under-review papers appear only as titles");
  }

  console.log(
    `\n${SELF_TEST.length + 1 - failed}/${SELF_TEST.length + 1} passed, corpus built ${corpus.builtAt}`,
  );
  process.exit(failed ? 1 : 0);
}

if (!query) {
  console.log(corpus.outline());
  console.log("\nPass a query, or --self-test.");
  process.exit(0);
}

show(query, kinds);
