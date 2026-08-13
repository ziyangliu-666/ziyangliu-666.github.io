/* The Edge runtime exposes `process.env` but is not Node, so we declare just that much
 * rather than pulling in @types/node and its whole surface. */
declare const process: { env: Record<string, string | undefined> };
