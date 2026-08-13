/* Strip markdown syntax from an answer before it is rendered.
 *
 * The design renders answers as plain text (`white-space: pre-wrap`) and defines no styles
 * for bold, headings or code — so `**Kernel speedup**` arrives as literal asterisks the
 * reader has to look past. The system prompt asks for plain prose, and that works for
 * ordinary answers, but a model writing dense technical material reaches for markdown
 * anyway. A prompt cannot be relied on for a rendering invariant, so this makes it
 * deterministic: whatever the model does, the reader gets prose.
 *
 * Applied at render time, on the accumulated text rather than per delta. A `**` that has
 * only half arrived shows a single asterisk for one frame and then corrects itself, which
 * is cheaper than buffering the stream to avoid it.
 */

export function plainify(text: string): string {
  return (
    text
      // Fenced blocks: drop the fence, keep the code as text.
      .replace(/^ *```+[\w-]*\n?/gm, "")
      // Inline code — the design has one monospace treatment and it is not for prose.
      .replace(/`([^`\n]+)`/g, "$1")
      // Bold, then bold-italic leftovers.
      .replace(/\*\*\*([^*\n]+)\*\*\*/g, "$1")
      .replace(/\*\*([^*\n]+)\*\*/g, "$1")
      .replace(/__([^_\n]+)__/g, "$1")
      // Single-asterisk italics, only when clearly a pair hugging the words. The
      // no-whitespace-either-side rule is what keeps `2 * 3 * 4` intact — without it the
      // asterisks in an arithmetic expression pair up and the operators vanish.
      .replace(
        /(^|[\s([{"'])\*([^\s*][^*\n]{0,118}[^\s*]|[^\s*])\*(?=[\s.,;:!?)\]}"']|$)/g,
        "$1$2",
      )
      // ATX headings become their own line of prose.
      .replace(/^ {0,3}#{1,6} +/gm, "")
      // Bullets become the em dash the design uses for list items.
      .replace(/^ {0,3}[-*+] +/gm, "— ")
      // Links: keep the text, keep the URL, lose the brackets.
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)")
      // Horizontal rules have no meaning in a chat answer.
      .replace(/^ {0,3}([-*_])(?: *\1){2,} *$/gm, "")
      // Blockquote markers.
      .replace(/^ {0,3}> ?/gm, "")
  );
}
