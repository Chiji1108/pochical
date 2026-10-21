import { phrasesOf } from "@pochical/jsx/phrases";
import { defineMiddleware } from "astro:middleware";
import { Parser } from "htmlparser2";

// The .astro pages' Japanese, broken between phrases as @pochical/jsx's
// runtime breaks the React parts': a <wbr> between BudouX's phrases in
// each text node. Runs as each page renders, at build time for the
// prerendered ones. React's own output (islands, and the React parts
// rendered without one) already has its <wbr> and is left alone.
const UNBROKEN = new Set(["script", "style", "title", "textarea", "template"]);
const WBR = /^<wbr\b/i;

export function phraseHtml(html: string): string {
  const edits: { start: number; end: number; text: string }[] = [];
  let unbroken = 0;
  let island = 0;
  let inBody = false;
  let afterWbr = false;
  const parser = new Parser(
    {
      onclosetag(name) {
        if (name === "body") inBody = false;
        else if (name === "astro-island") island -= 1;
        else if (UNBROKEN.has(name)) unbroken -= 1;
        afterWbr = name === "wbr";
      },
      onopentag(name) {
        if (name === "body") inBody = true;
        else if (name === "astro-island") island += 1;
        else if (UNBROKEN.has(name)) unbroken += 1;
        afterWbr = name === "wbr";
      },
      ontext() {
        const start = parser.startIndex;
        const end = parser.endIndex + 1;
        const raw = html.slice(start, end);
        const skip =
          !inBody ||
          island > 0 ||
          unbroken > 0 ||
          afterWbr ||
          raw.includes("&") ||
          WBR.test(html.slice(end, end + 5));
        afterWbr = false;
        if (skip) return;
        // BudouX reads surrounding whitespace as part of the text, which
        // moves its breaks; JSX trims it before the runtime sees a string.
        const [, lead = "", text = "", trail = ""] =
          /^(\s*)([\s\S]*?)(\s*)$/.exec(raw) ?? [];
        const phrases = phrasesOf(text);
        if (phrases.length > 1) {
          edits.push({ end, start, text: `${lead}${phrases.join("<wbr>")}${trail}` });
        }
      },
    },
    { decodeEntities: true }
  );
  parser.end(html);
  let out = "";
  let at = 0;
  for (const edit of edits) {
    out += html.slice(at, edit.start) + edit.text;
    at = edit.end;
  }
  return out + html.slice(at);
}

export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  if (!response.headers.get("content-type")?.includes("text/html")) {
    return response;
  }
  const html = await response.text();
  return new Response(phraseHtml(html), {
    headers: response.headers,
    status: response.status,
  });
});
