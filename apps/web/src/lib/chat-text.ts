// A chat message's words as spec/chat-text.md has them: its links, and
// the members it mentions.
//
// A link starts http:// or https:// and runs over the characters a URL is
// written in. Anything else ends it, so Japanese written right after one
// (https://example.jp/ここどう？) stays out of it.
const LINK = /https?:\/\/[\w\-.~:/?#[\]@!$&'()*+,;=%]+/giu;

// A mention as a message keeps it: the member's id, so it shows their name
// in the group as it is when read, even after they change it.
const MENTION = /<@(?<id>[\w-]+)>/gu;

const LINK_OR_MENTION = new RegExp(
  `${MENTION.source}|${LINK.source}`,
  LINK.flags
);

// Closes a sentence rather than the address when it comes last.
const TRAILING = /[.,!?:;'*]+$/u;

export type TextPart = { text: string; url?: string; mention?: string };

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

// The message cut into its words, links and mentions, in order. A
// mention's text is its token; `plainText` and the chat show the name.
export function textParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  const add = (index: number, part: TextPart) => {
    if (index > at) {
      parts.push({ text: text.slice(at, index) });
    }
    parts.push(part);
    at = index + part.text.length;
  };
  for (const match of text.matchAll(LINK_OR_MENTION)) {
    const [found] = match;
    const mention = match.groups?.id;
    if (mention !== undefined) {
      add(match.index, { mention, text: found });
      continue;
    }
    const url = trimLink(found);
    // Only a scheme: nothing to open.
    if (URL.canParse(url) && new URL(url).hostname !== "") {
      add(match.index, { text: url, url });
    }
  }
  if (at < text.length) {
    parts.push({ text: text.slice(at) });
  }
  return parts;
}

// The message as words alone, each mention as @ and the member's name:
// for コピー, a chat's last line in the list, a quote and a notification.
export function plainText(text: string, nameOf: (id: string) => string) {
  return text.replace(MENTION, (_, id: string) => `@${nameOf(id)}`);
}

// The members a message mentions.
export function mentionsOf(text: string) {
  return [...text.matchAll(MENTION)].flatMap((match) => match.groups?.id ?? []);
}

const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;

// A message as sent: each member picked while writing, whose @name is
// still in it, kept as their mention. Picking writes @name and a space,
// and only that counts: Japanese runs on without spaces, so @あや in
// @あやか is not あや.
export function withMentions(
  text: string,
  picked: { id: string; name: string }[]
) {
  let sent = text;
  for (const { id, name } of picked) {
    const written = new RegExp(
      `@${name.replace(REGEX_SPECIAL, "\\$&")}(?=\\s|$)`,
      "gu"
    );
    sent = sent.replace(written, `<@${id}>`);
  }
  return sent;
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

// Pochical's own invitation links, https://pochical.app/invite/{code}:
// the chat opens them in the app, on the group's join screen, rather than
// in the browser.
const INVITE_PATH = /^\/invite\/(?<code>[A-HJ-NP-Za-km-z2-9]{8})\/?$/u;

// The invite code a link carries, if it is one of Pochical's.
export function inviteCodeOf(url: string) {
  if (!URL.canParse(url)) {
    return;
  }
  const { protocol, hostname, pathname } = new URL(url);
  if (protocol !== "https:" || hostname !== "pochical.app") {
    return;
  }
  return INVITE_PATH.exec(pathname)?.groups?.code;
}
