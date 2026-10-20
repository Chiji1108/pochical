// A line of a user's chat with Pochical's people as the admin pages and
// Slack read it, from its Group DO (support-place.ts).

/**
 * The Group DO a user's chat with Pochical's people is kept in, its one
 * chat being GROUP_THREAD. Group ids are random, so none is named so.
 */
export const supportPlace = (userId: string): string => `support:${userId}`;

/**
 * How a line of `count` photos reads in a line of words (a quote, the
 * list), as the apps say it.
 */
export const photoWords = (count: number): string =>
  count === 1 ? "📷 写真" : `📷 写真${count}枚`;

/** An emoji on a line, and who put it there. */
export type SupportReaction = {
  emoji: string;
  mine: boolean;
  support: boolean;
};

/** A line of a user's chat, as the admin pages and Slack read it. */
export type SupportLine = {
  userId: string;
  seq: number;
  /** Written by Pochical's people, not the user. */
  fromPochical: boolean;
  /** Empty once taken back. */
  text: string;
  /** The app's version and the device a user's line came from. */
  device: string | null;
  /** Its photos, as the line instead of words; none once taken back. */
  photos: { id: string; width: number; height: number }[];
  /** Its text, or its photos as photoWords says them: a quote, the list. */
  words: string;
  /** The line it answers, by seq. */
  replyTo: number | null;
  unsent: boolean;
  sentAtMs: number;
  reactions: SupportReaction[];
  /** The page of its words' first link. */
  preview: { site: string; title: string; url: string } | null;
};
