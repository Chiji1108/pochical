import { chatRules } from "@pochical/design/chat";

import { firstLink, mentionsOf, plainText } from "./chat-text";
import type {
  ChatDraft,
  DraftTarget,
  LinkPreview,
  Message,
} from "./design-group-data";
import type { Photo } from "./design-sample-photos";

// What a chat's lines become as people use them (spec/chat.md): pins,
// polls, reactions, edits and lines taken back. Each takes the lines and
// gives the new ones, so a screen only says what was done.

// Pinned lines, the latest first.
export function pinsOf(messages: Message[]) {
  return messages
    .filter(
      (message) =>
        message.pinned !== undefined && message.content.kind !== "unsent"
    )
    .toSorted((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0));
}

// Pins a line as the latest, or takes its pin off. At most
// chatRules.maxPins stay pinned, as LINE keeps its announcements: one more
// takes the place of the oldest, which `dropped` names for the app to say
// so. A line already pinned only moves up.
export function pinMessage(
  messages: Message[],
  id: string,
  pinned: boolean
): { messages: Message[]; dropped?: string } {
  const pins = pinsOf(messages);
  const order = Math.max(0, ...pins.map((line) => line.pinned ?? 0)) + 1;
  const adds = pinned && !pins.some((line) => line.id === id);
  const dropped =
    adds && pins.length >= chatRules.maxPins ? pins.at(-1)?.id : undefined;
  return {
    dropped,
    messages: messages.map((message) => {
      if (message.id === id) {
        return { ...message, pinned: pinned ? order : undefined };
      }
      if (message.id === dropped) {
        return { ...message, pinned: undefined };
      }
      return message;
    }),
  };
}

// Your 行ける on a day of a poll, or taking it back.
export function votePoll(messages: Message[], id: string, key: string) {
  return messages.map((message) => {
    const { content } = message;
    if (message.id !== id || content.kind !== "poll") {
      return message;
    }
    const voters = content.votes[key] ?? [];
    const next = voters.includes("me")
      ? voters.filter((voter) => voter !== "me")
      : [...voters, "me"];
    return {
      ...message,
      content: { ...content, votes: { ...content.votes, [key]: next } },
    };
  });
}

// Settles a poll on a day: the voting ends and the poll is pinned, as any
// line is, so the day stays found.
export function decidePoll(messages: Message[], id: string, key: string) {
  const pinned = pinMessage(messages, id, true);
  return {
    dropped: pinned.dropped,
    messages: pinned.messages.map((message) =>
      message.id === id && message.content.kind === "poll"
        ? { ...message, content: { ...message.content, decided: key } }
        : message
    ),
  };
}

// Adds your reaction, or takes it back if it was already yours.
function toggleReaction(message: Message, emoji: string): Message {
  const reactions = message.reactions ?? [];
  const existing = reactions.find((reaction) => reaction.emoji === emoji);
  if (!existing) {
    return { ...message, reactions: [...reactions, { by: ["me"], emoji }] };
  }
  const mine = existing.by.includes("me");
  const by = mine
    ? existing.by.filter((voter) => voter !== "me")
    : [...existing.by, "me"];
  return {
    ...message,
    reactions: reactions
      .map((reaction) => (reaction.emoji === emoji ? { by, emoji } : reaction))
      .filter((reaction) => reaction.by.length > 0),
  };
}

export function reactTo(messages: Message[], id: string, emoji: string) {
  return messages.map((message) =>
    message.id === id ? toggleReaction(message, emoji) : message
  );
}

// New words for your line, marked 編集済み. Its link's page stays while
// the first link does; otherwise it takes `link`, the new words' page.
export function editMessage(
  messages: Message[],
  id: string,
  text: string,
  link: LinkPreview | undefined
) {
  return messages.map((message): Message => {
    const { content } = message;
    if (message.id !== id || content.kind !== "words") {
      return message;
    }
    const sameLink =
      content.link !== undefined && firstLink(text) === firstLink(content.text);
    return {
      ...message,
      content: {
        edited: true,
        kind: "words",
        link: sameLink ? content.link : link,
        text,
      },
    };
  });
}

// A line taken back: only who wrote it and when stay, so the chat says it
// was taken back, a reply still quotes something, and its pin is gone.
export function unsendMessage(messages: Message[], id: string) {
  return messages.map((message): Message =>
    message.id === id
      ? {
          content: { kind: "unsent" },
          from: message.from,
          id: message.id,
          time: message.time,
          when: message.when,
        }
      : message
  );
}

// The first of the last `unread` lines from the others, which a chat opens
// on under ここから新着. The app's own lines are not counted.
export function firstUnreadOf(messages: Message[], unread: number) {
  let left = unread;
  for (const message of messages.toReversed()) {
    if (
      left > 0 &&
      message.from !== "me" &&
      message.content.kind !== "notice"
    ) {
      left -= 1;
      if (left === 0) {
        return message.id;
      }
    }
  }
  return undefined;
}

// The last line sharing days or putting them to the vote.
export function lastSharedOf(messages: Message[]) {
  return messages.findLast(
    (message) =>
      message.content.kind === "days" || message.content.kind === "poll"
  )?.id;
}

// The draft to keep, or to open again, with the chat's lines as they are
// now; undefined for none. Words make a draft; an edit whose words are
// still the line's own is none, and one of a line taken back or not there
// goes with its words; a reply to a line taken back keeps its words
// without the quote (spec/vectors/chat.json, draft).
export function keptDraft(
  draft: ChatDraft,
  messages: Message[]
): ChatDraft | undefined {
  if (draft.text.trim() === "") {
    return undefined;
  }
  const { target } = draft;
  const line = target && messages.find((message) => message.id === target.id);
  if (target?.kind === "edit") {
    return line?.content.kind === "words" && line.content.text !== draft.text
      ? draft
      : undefined;
  }
  if (line?.content.kind === "unsent") {
    return { text: draft.text };
  }
  return draft;
}

// What the composer holds: the words as written, mentions as @name; the
// members picked from the @ list, made mentions as it is sent; the line
// it answers or changes; the days brought to share and the photos picked,
// sent before the words; and the link whose page × took off. `message` is
// the one being written, a new one each time the composer starts afresh,
// for photos still being read to go to the one they were picked for.
export type Writing = {
  message: symbol;
  words: string;
  picked: { id: string; name: string }[];
  target?: DraftTarget;
  days?: Date[];
  photos: Photo[];
  withoutPreview?: string;
};

// Words as sent (<@id>) put back in the composer, their mentions as @name
// again, still picked.
export function writingOf(
  text: string,
  mentionName: (id: string) => string,
  target?: DraftTarget
): Writing {
  return {
    message: Symbol("message"),
    photos: [],
    picked: mentionsOf(text).map((id) => ({ id, name: mentionName(id) })),
    target,
    words: plainText(text, mentionName),
  };
}

const nothing = () => "";

// A composer emptied for a new message.
export const emptyWriting = (target?: DraftTarget) =>
  writingOf("", nothing, target);

// Answering a line in place of changing one lets the edit go, and its
// words with it, which were that line's; else what was written stays,
// and what goes with it (spec/vectors/chat.json, composer).
export function answering(writing: Writing, id: string): Writing {
  const target = { id, kind: "reply" } as const;
  return writing.target?.kind === "edit"
    ? emptyWriting(target)
    : { ...writing, target };
}

// Changing your line puts its words alone in the composer, in place of
// all that was written there.
export function changing(
  message: Message,
  mentionName: (id: string) => string
): Writing {
  const text = message.content.kind === "words" ? message.content.text : "";
  return writingOf(text, mentionName, { id: message.id, kind: "edit" });
}

// × on the bar: an edit goes with its words; a reply's words stay, and
// what goes with them.
export function stopping(writing: Writing): Writing {
  return writing.target?.kind === "edit"
    ? emptyWriting()
    : { ...writing, target: undefined };
}

// Days brought to share start a message, as answering a line does: an
// edit goes with its words, as it takes only words.
export function sharing(writing: Writing, days: Date[]): Writing {
  return {
    ...(writing.target?.kind === "edit" ? emptyWriting() : writing),
    days,
  };
}

// Photos read into the tray of the message they were picked for, as
// many as it has room for; those whose message the composer no longer
// holds (an edit began, or ended, meanwhile) have nowhere to go.
export function picking(
  writing: Writing,
  message: symbol,
  photos: Photo[]
): Writing {
  return writing.message === message
    ? {
        ...writing,
        photos: [...writing.photos, ...photos].slice(
          0,
          chatRules.photosPerSend
        ),
      }
    : writing;
}

// How many of a line's photos go in each of its rows, top first: three
// as one over two, else rows of two and three, the fewest there can be,
// the twos first, as Telegram lays out an album.
export function albumRows(count: number): number[] {
  if (count === 3) {
    return [1, 2];
  }
  const rows = Math.ceil(count / 3);
  const twos = rows * 3 - count;
  return Array.from({ length: rows }, (_, row) => (row < twos ? 2 : 3));
}

// A line placed by its time: one the group holds, by when it took it, or
// one of yours still waiting, by when it was written, and whether it is
// not sent.
export type TimedLine<Id> = { id: Id; at: number; failed?: boolean };

// The chat's lines in the order shown (spec/chat.md, Lines on their way):
// the group's in the order it took them, each of yours not sent where it
// was written, before the first of the group's whose time is later, and
// yours still being sent last, as the newest; each kind of yours in the
// order written (spec/vectors/chat.json, order). The chat list's latest
// line is the last of them.
export function chatOrder<Id>(
  sent: TimedLine<Id>[],
  waiting: TimedLine<Id>[]
): Id[] {
  const failed = waiting.filter((line) => line.failed);
  const order: Id[] = [];
  for (const line of sent) {
    const later = failed.findIndex((one) => one.at >= line.at);
    const before = failed.splice(0, later === -1 ? failed.length : later);
    order.push(...before.map(({ id }) => id), line.id);
  }
  order.push(
    ...failed.map(({ id }) => id),
    ...waiting.filter((line) => !line.failed).map(({ id }) => id)
  );
  return order;
}
