// A line of a user's chat with Pochical's people as the admin pages and
// Slack read it, from its Group DO (support-place.ts).

/** How a photo reads in a line of words: the list, a notification. */
const PHOTO_WORDS = "📷 写真";

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
  /** Its photo, as the line instead of words; none once taken back. */
  photo: { id: string; width: number; height: number } | null;
  /** The line it answers, by seq. */
  replyTo: number | null;
  unsent: boolean;
  sentAtMs: number;
  reactions: SupportReaction[];
  /** The page of its words' first link. */
  preview: { site: string; title: string; url: string } | null;
};

/** A line's words, or what a photo is called. */
export const wordsOf = (line: SupportLine): string =>
  line.photo === null ? line.text : PHOTO_WORDS;
