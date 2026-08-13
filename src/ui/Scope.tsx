/* One line under the landing composer saying what the index actually holds.
 *
 * This is the only thing added to a page the design deliberately left spare, and it is
 * information rather than decoration: every number comes from the corpus build, so it
 * cannot drift into a marketing claim. It also answers the question a visitor has before
 * they type anything — what is it reasonable to ask? — which four generic suggestion chips
 * do not.
 *
 * It fetches a few hundred bytes, not the 800KB index. If that fetch fails the line simply
 * does not appear; a page whose whole point is answering questions should not lead with an
 * error about its own metadata.
 */

import { useEffect, useState } from "react";

interface Summary {
  builtAt: string;
  documents: number;
  chunks: number;
  counts: {
    resume: number;
    paper: number;
    repo: number;
    pullRequest: number;
    writing: number;
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function Scope() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/corpus/summary.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Summary | null) => {
        if (live) setSummary(s);
      })
      .catch(() => {
        /* the page works without it */
      });
    return () => {
      live = false;
    };
  }, []);

  if (!summary) return null;

  const { counts } = summary;
  const parts = [
    counts.resume ? `${plural(counts.resume, "résumé", "résumés")} in English and 中文` : "",
    counts.paper ? plural(counts.paper, "preprint") : "",
    counts.repo ? plural(counts.repo, "repository", "repositories") : "",
    counts.pullRequest ? plural(counts.pullRequest, "pull request") : "",
    counts.writing ? plural(counts.writing, "post") : "",
  ].filter(Boolean);

  return (
    <p className="scope">
      Indexed: {parts.join(" · ")}. It reads the repositories live, and searches the web when
      the answer is not his to give.
    </p>
  );
}
