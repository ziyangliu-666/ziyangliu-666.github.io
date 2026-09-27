/* Transport selection: the seam between the UI and everything behind it.
 *
 * With a model configured, this is the real harness. Without one, it is the offline
 * transport — a fresh clone and a preview build both still work, they just answer from
 * canned text and say so.
 */

import { Corpus } from "../rag/corpus";
import { hasModel } from "./config";
import type { Transport } from "./events";
import { runAgent } from "./loop";
import { mockTransport } from "./mock";

let corpusPromise: Promise<Corpus> | null = null;

/** Loaded once per page, on the first question rather than on page load. */
function loadCorpus(): Promise<Corpus> {
  corpusPromise ??= Corpus.load().catch((err) => {
    corpusPromise = null; // let the next question retry
    throw err;
  });
  return corpusPromise;
}

export const liveTransport: Transport = async (req) => {
  let corpus: Corpus;
  try {
    corpus = await loadCorpus();
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    req.onEvent({
      type: "error",
      message: `The index did not load (${detail}), so there is nothing to search. Reload the page, or read the résumé linked top right.`,
    });
    return;
  }

  if (req.isCancelled()) return;

  await runAgent({
    question: req.message,
    history: req.history,
    corpus,
    emit: req.onEvent,
    isCancelled: req.isCancelled,
  });
};

export function createTransport(): Transport {
  return hasModel() ? liveTransport : mockTransport;
}
