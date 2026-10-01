import { Code, ConnectError } from "@connectrpc/connect";

// spec/text-limits.md: how long typed text may be, counted in characters
// as a reader sees them (grapheme clusters, as Swift's String.count).
export const TEXT_LIMITS = {
  groupName: 30,
  personName: 20,
} as const;

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** The number of characters a reader sees in the text. */
export const characterCount = (text: string): number =>
  [...graphemes.segment(text)].length;

/**
 * The text, when it has 1 to `limit` characters and is not only spaces;
 * INVALID_ARGUMENT otherwise. The server never cuts text itself.
 */
export const requireText = (
  text: string,
  limit: number,
  field: string
): string => {
  if (text.trim() === "") {
    throw new ConnectError(`${field} is empty`, Code.InvalidArgument);
  }
  if (characterCount(text) > limit) {
    throw new ConnectError(
      `${field} is over ${limit} characters`,
      Code.InvalidArgument
    );
  }
  return text;
};

// One emoji, as the picker gives: a single character outside letters,
// digits and punctuation.
const EMOJI = /^\p{Extended_Pictographic}|^\p{Regional_Indicator}/u;

/** A group's emoji mark: exactly one character that is an emoji. */
export const requireEmoji = (text: string): string => {
  if (characterCount(text) !== 1 || !EMOJI.test(text)) {
    throw new ConnectError("emoji must be one emoji", Code.InvalidArgument);
  }
  return text;
};
