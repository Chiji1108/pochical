import { inviteRules } from "@pochical/design/invite";

// A chat message's links as spec/chat.md has them, for the page the
// server adds to a line sent before its preview came (apps/web's
// chat-text.ts and PochicalKit's, pinned by spec/vectors/chat-text.json).
//
// A link starts http:// or https:// and runs over the characters a URL is
// written in. Anything else ends it, so Japanese written right after one
// (https://example.jp/ここどう？) stays out of it.
const LINK = /https?:\/\/[\w\-.~:/?#[\]@!$&'()*+,;=%]+/giu;

// A mention as a message keeps it: the member's id.
export const MENTION = /<@(?<id>[\w-]+)>/gu;

/** How a message's words keep a mention of `userId`. */
export const mentionOf = (userId: string): string => `<@${userId}>`;

const LINK_OR_MENTION = new RegExp(
  `${MENTION.source}|${LINK.source}`,
  LINK.flags
);

// Closes a sentence rather than the address when it comes last.
const TRAILING = /[.,!?:;'*]+$/u;

type TextPart = { text: string; url?: string; mention?: string };

// The address without what closes the sentence around it: a full stop,
// a comma, or a bracket opened before the address.
const trimLink = (found: string): string => {
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
};

/** The message cut into its words, links and mentions, in order. */
export const textParts = (text: string): TextPart[] => {
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
};

/**
 * Whether the message mentions `userId`, as the apps read it
 * (spec/vectors/unread.json).
 */
export const mentions = (text: string, userId: string): boolean =>
  textParts(text).some((part) => part.mention === userId);

const INVITE_PATH = new RegExp(
  `^/invite/(?<code>[${inviteRules.codeAlphabet}]{${inviteRules.codeLength}})/?$`,
  "u"
);

/** The invite code a link carries, if it is one of Pochical's. */
export const inviteCodeOf = (url: string): string | undefined => {
  const link = URL.parse(url);
  if (link?.protocol !== "https:" || link.hostname !== "pochical.app") {
    return undefined;
  }
  return INVITE_PATH.exec(link.pathname)?.groups?.code;
};

/**
 * The link a line's page is for: its words' first, unless it is one of
 * Pochical's invitations, which has a card of its own.
 */
export const previewLinkOf = (text: string): string | undefined => {
  const link = textParts(text).find((part) => part.url !== undefined)?.url;
  return link === undefined || inviteCodeOf(link) !== undefined
    ? undefined
    : link;
};
