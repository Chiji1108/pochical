import { chatRules } from "@pochical/design/chat";

import type { LinkPreview, Message } from "../components/design-group-data";
import { firstLink } from "./chat-text";

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
export function toggleReaction(message: Message, emoji: string): Message {
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
