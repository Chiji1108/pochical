// Links in a chat message, as spec/chat-links.md has them: an address
// starting http:// or https://, running over the characters a URL is
// written in. Anything else ends it, so Japanese written right after
// one (https://example.jp/ここどう？) stays out of it.
const LINK = /https?:\/\/[\w\-.~:/?#[\]@!$&'()*+,;=%]+/giu;

// Closes a sentence rather than the address when it comes last.
const TRAILING = /[.,!?:;'*]+$/u;

export type TextPart = { text: string; url?: string };

// The address without what closes the sentence around it: a full stop,
// a comma, or a bracket opened before the address.
function trimLink(found: string) {
  let link = found.replace(TRAILING, "");
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
  ] as const) {
    while (
      link.endsWith(close) &&
      link.split(close).length > link.split(open).length
    ) {
      link = link.slice(0, -1).replace(TRAILING, "");
    }
  }
  return link;
}

// The message cut into its words and its links, in order.
export function textParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const match of text.matchAll(LINK)) {
    const url = trimLink(match[0]);
    // Only a scheme: nothing to open.
    if (!URL.canParse(url) || new URL(url).hostname === "") {
      continue;
    }
    if (match.index > at) {
      parts.push({ text: text.slice(at, match.index) });
    }
    parts.push({ text: url, url });
    at = match.index + url.length;
  }
  if (at < text.length) {
    parts.push({ text: text.slice(at) });
  }
  return parts;
}

// The link a message's preview is for: its first.
export function firstLink(text: string) {
  return textParts(text).find((part) => part.url)?.url;
}

// The site's name as a preview without one shows it: its host, without
// a leading www.
export function siteOf(url: string) {
  return new URL(url).hostname.replace(/^www\./u, "");
}
