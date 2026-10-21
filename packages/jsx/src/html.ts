import { Parser } from "htmlparser2";

import { phrasesOf, UNBROKEN } from "./phrases";

// HTML that no JSX made, as an Astro page's: its Japanese broken between
// phrases as the JSX runtime breaks JSX's (phrased.ts), a <wbr> between
// each text node's phrases. The parts a JSX runtime drew already have
// theirs: an Astro island (<astro-island>) is left alone, and so is the
// page's <head>, whose text is never laid out.

const SKIPPED = new Set(
  [...UNBROKEN, "astro-island", "head"].map((name) => name.toLowerCase())
);

// The whitespace JSX drops around a line's text before the runtime sees
// it: a run at either end that holds a line break. Spaces within a line
// stay, as the runtime reads them.
const LINE_ENDS = /^(?<lead>\s*\n\s*)?(?<body>[\s\S]*?)(?<trail>\s*\n\s*)?$/u;

const escape = (text: string): string =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

// A text node: where it sits in the HTML, and its text decoded.
type TextNode = { start: number; end: number; text: string };

const phrased = ({ text }: TextNode): string | undefined => {
  const {
    lead = "",
    body = "",
    trail = "",
  } = LINE_ENDS.exec(text)?.groups ?? {};
  const phrases = phrasesOf(body);
  if (phrases.length === 1) {
    return undefined;
  }
  return `${lead}${phrases.map(escape).join("<wbr>")}${trail}`;
};

export function phraseHtml(html: string): string {
  const nodes: TextNode[] = [];
  let pending: TextNode | undefined;
  let skipped = 0;
  const flush = () => {
    if (pending !== undefined) {
      nodes.push(pending);
      pending = undefined;
    }
  };
  // The parser hands a text node over in pieces, one for each character
  // reference (&amp;) and one for the text between them.
  const parser = new Parser(
    {
      onclosetag(name) {
        flush();
        if (SKIPPED.has(name.toLowerCase())) {
          skipped -= 1;
        }
      },
      oncomment: flush,
      onend: flush,
      onopentag(name) {
        flush();
        if (SKIPPED.has(name.toLowerCase())) {
          skipped += 1;
        }
      },
      ontext(text) {
        if (skipped > 0) {
          return;
        }
        const { startIndex: start, endIndex } = parser;
        if (pending?.end === start) {
          pending = {
            ...pending,
            end: endIndex + 1,
            text: pending.text + text,
          };
          return;
        }
        flush();
        pending = { end: endIndex + 1, start, text };
      },
    },
    { decodeEntities: true }
  );
  parser.end(html);
  let result = "";
  let at = 0;
  for (const node of nodes) {
    const next = phrased(node);
    if (next !== undefined) {
      result += html.slice(at, node.start) + next;
      at = node.end;
    }
  }
  return result + html.slice(at);
}
