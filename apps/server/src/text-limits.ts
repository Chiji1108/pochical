import { Code, ConnectError } from "@connectrpc/connect";

// How the server holds text to the limits in design/src/limits.ts, as
// spec/text-limits.md has it: counted in characters as a reader sees them
// (grapheme clusters, as Swift's String.count).

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

/** The number of characters a reader sees in the text. */
export const characterCount = (text: string): number =>
  [...graphemes.segment(text)].length;

/**
 * The most UTF-16 code units one character may take on average: more than
 * any emoji sequence or accented letter (Unicode's stream-safe text keeps
 * a run of combining marks to 30), so text counted within its limit is
 * bounded in size too, and one character stacked with thousands of marks
 * is not.
 */
const UNITS_PER_CHARACTER_MOST = 32;

/** Whether the text is no larger than `limit` characters can be. */
const withinSize = (text: string, limit: number): boolean =>
  text.length <= limit * UNITS_PER_CHARACTER_MOST;

/**
 * Whether the text has at most `limit` characters and is no larger than
 * that many characters can be: the limit every limited text is held to.
 */
export const withinLimit = (text: string, limit: number): boolean =>
  withinSize(text, limit) && characterCount(text) <= limit;

/** Whether the text is within `limit` and not empty or only spaces. */
export const fitsText = (text: string, limit: number): boolean =>
  text.trim() !== "" && withinLimit(text, limit);

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
  if (!withinLimit(text, limit)) {
    throw new ConnectError(
      `${field} is over ${limit} characters`,
      Code.InvalidArgument
    );
  }
  return text;
};

// One emoji, as the picker and the system keyboards give: a single
// character that starts as a pictograph or a flag, or a keycap (1️⃣, #️⃣),
// which starts with the plain digit or sign under its combining keycap.
const EMOJI =
  /^\p{Extended_Pictographic}|^\p{Regional_Indicator}|^[#*0-9]\uFE0F?\u20E3/u;

/** Whether the text is exactly one character that is an emoji. */
export const isEmoji = (text: string): boolean =>
  withinLimit(text, 1) && characterCount(text) === 1 && EMOJI.test(text);
