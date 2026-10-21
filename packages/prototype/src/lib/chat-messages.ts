import { chatRules } from "@pochical/design/chat";

import { firstLink } from "./chat-text";
import type { ChatDraft, LinkPreview, Message } from "./design-group-data";

// What a chat's lines become as people use them (spec/chat.md): pins,
// polls, reactions, edits and lines taken back. Each takes the lines and
// gives the new ones, so a screen only says what was done.

// Pinned lines, the latest first.
export function pinsOf(messages: Message[]) {
  return messages
    .filter((message) => message.pinned !== undefined && !message.unsent)
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
    if (message.id !== id || !message.poll) {
      return message;
    }
    const voters = message.poll.votes[key] ?? [];
    const next = voters.includes("me")
      ? voters.filter((voter) => voter !== "me")
      : [...voters, "me"];
    return {
      ...message,
      poll: { ...message.poll, votes: { ...message.poll.votes, [key]: next } },
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
      message.id === id && message.poll
        ? { ...message, poll: { ...message.poll, decided: key } }
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
  return messages.map((message) => {
    if (message.id !== id) {
      return message;
    }
    const sameLink =
      message.link !== undefined &&
      firstLink(text) === firstLink(message.text ?? "");
    return {
      ...message,
      edited: true,
      link: sameLink ? message.link : link,
      text,
    };
  });
}

// A line taken back: only who wrote it and when stay, so the chat says it
// was taken back, a reply still quotes something, and its pin is gone.
export function unsendMessage(messages: Message[], id: string) {
  return messages.map((message) =>
    message.id === id
      ? {
          from: message.from,
          id: message.id,
          time: message.time,
          unsent: true,
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
    if (left > 0 && message.from !== "me" && !message.notice) {
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
  return messages.findLast((message) => message.days || message.poll)?.id;
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
  const lineOf = (id: string) => messages.find((message) => message.id === id);
  if (draft.editing !== undefined) {
    const line = lineOf(draft.editing);
    if (!line || line.unsent || (line.text ?? "") === draft.text) {
      return undefined;
    }
    return { editing: draft.editing, text: draft.text };
  }
  if (draft.replyTo !== undefined && lineOf(draft.replyTo)?.unsent) {
    return { text: draft.text };
  }
  return draft;
}

// The albums a chat draws (spec/chat.md, Albums), each as its lines' ids:
// one writer's photos one after another sent at once, any other line
// between them, or one of them taken back, ending it. A photo left alone
// is drawn as a photo is, so only those of two or more.
export function albumsOf(messages: Message[]): string[][] {
  const albums: string[][] = [];
  let run: Message[] = [];
  const end = () => {
    if (run.length > 1) {
      albums.push(run.map(({ id }) => id));
    }
    run = [];
  };
  for (const message of messages) {
    const [first] = run;
    const inAlbum =
      message.album !== undefined &&
      message.photo !== undefined &&
      !message.unsent;
    if (
      first &&
      !(inAlbum && message.album === first.album && message.from === first.from)
    ) {
      end();
    }
    if (inAlbum) {
      run.push(message);
    }
  }
  end();
  return albums;
}

// How many of an album's photos go in each of its rows, top first: three
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
