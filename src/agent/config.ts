/* Where the model comes from.
 *
 * Two backends, in priority order:
 *
 *   1. The proxy — an edge function that holds the DeepSeek key. Its URL is baked in at
 *      build time and is public by design; the key it holds is not. This is the path
 *      every visitor takes.
 *   2. A key the visitor pasted, kept in localStorage. For local development, and as an
 *      escape hatch if the proxy's daily budget is spent. Never shipped, never logged.
 *
 * With neither, the app falls back to the offline transport rather than showing an error,
 * so a fresh clone still runs.
 */

const RAW_PROXY = import.meta.env.VITE_AGENT_PROXY_URL ?? "";

export const PROXY_URL = RAW_PROXY.replace(/\/+$/, "");

const KEY_STORAGE = "ziyang-agent.key";

export function byokKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null; // private mode, or storage disabled
  }
}

export function setByokKey(key: string | null): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

/** True when a model can actually be reached. */
export function hasModel(): boolean {
  return Boolean(PROXY_URL || byokKey());
}

/** True when the proxy is unavailable and we are calling DeepSeek directly. */
export function isDirect(): boolean {
  return !PROXY_URL && Boolean(byokKey());
}

export const DEEPSEEK_DIRECT_URL = "https://api.deepseek.com/chat/completions";

export const MODELS = {
  /** Main loop. Thinking on. Cheap enough to leave running. */
  main: "deepseek-v4-flash",
  /** Sub-agents and the follow-up generator: read, summarise, return. */
  fast: "deepseek-v4-flash",
} as const;

/* Repositories that are anonymised artifacts of papers still in anonymous review.
 * The corpus builder excludes them at build time; `github_activity` hits the live GitHub
 * API, so it needs the same list at runtime. Surfacing either one next to Ziyang's name
 * would undo the anonymity the submissions are relying on. */
export const DENY_REPOS = new Set(["sae-feature-traces", "vidtide-anon"]);

export const GITHUB_USER = "ziyangliu-666";

/* The accounts the repo-reading tools may open. Two are his — `ziyangliu-666` and
 * `exfer-stack` — and the third is the upstream chain he contributed to. A bare repository
 * name resolves against these and nothing else: the agent reads his work, not GitHub.
 *
 * These calls go straight from the browser to api.github.com rather than through the
 * proxy, and that is deliberate: unauthenticated GitHub allows 60 requests an hour per IP,
 * so each visitor spends their own budget. Routed through the proxy, every visitor would
 * share one 60/hour bucket and the first curious reader each hour would exhaust it. */
export const GITHUB_ACCOUNTS = [
  "ziyangliu-666",
  "exfer-stack",
  /* Not his account: the Exfer chain itself, where his upstream pull requests landed.
   * Readable so the agent can show the code a change touched, but the prompt has to say
   * whose project it is — thirty PRs into someone else's repository is a contribution, and
   * describing it as his repository would be a lie in the other direction. */
  "ahuman-exfer",
] as const;

export const LIMITS = {
  /** Tool-calling rounds in the main loop before we stop and answer with what we have. */
  maxIterations: 8,
  /** Rounds inside a sub-agent. Deliberately small — a sub-agent reads, it does not plan. */
  maxSubagentIterations: 4,
  /** Concurrent sub-agents per turn. */
  maxSubagents: 3,
  maxTokens: 2000,
  subagentMaxTokens: 900,
  /** Turns of prior conversation replayed to the model. */
  historyTurns: 8,
  /** Characters of a single tool result handed back to the model. */
  toolResultChars: 6000,
} as const;
