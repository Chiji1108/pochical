import { chatRules } from "@pochical/design/chat";

// Which of a chat's photos a reader sees, and the page of them a
// ChatPhotosRequest asks for (spec/sync-protocol.md, Chat), as
// spec/vectors/chat-photos.json pins them down.

/** A line, as far as whether its photo is among the chat's for a reader. */
type PhotoLine = {
  // It is a photo.
  photo: boolean;
  // Taken back by its writer.
  unsent: boolean;
  // Sent in a one-to-one chat while the reader had blocked its writer.
  hidden: boolean;
  // It is in the place's own chat (thread "group"), not a one-to-one one.
  ownChat: boolean;
  // The reader has blocked its writer.
  writerBlocked: boolean;
};

/**
 * Whether the reader sees the line's photo among the chat's: not once
 * taken back, nor hidden from them, nor in the place's own chat when
 * they have blocked its writer, whose lines fold away there.
 */
export const seenPhoto = (line: PhotoLine): boolean =>
  line.photo &&
  !line.unsent &&
  !line.hidden &&
  !(line.ownChat && line.writerBlocked);

/**
 * The page of a chat's photos, by the seqs of their lines in order, that
 * a request for those before `seq` (or after it) asks for: up to `size`
 * nearest it, as the slice from `from` to `to`. `seq` 0 asks for the
 * latest (after, from the first).
 */
export const photoPage = (
  seqs: readonly number[],
  seq: number,
  after: boolean,
  size: number = chatRules.photoPageSize
): { from: number; to: number } => {
  if (after) {
    const from = seqs.filter((each) => each <= seq).length;
    return { from, to: Math.min(seqs.length, from + size) };
  }
  const to = seq === 0 ? seqs.length : seqs.filter((each) => each < seq).length;
  return { from: Math.max(0, to - size), to };
};
