// How text is held to the limits in limits.ts, as spec/text-limits.md has
// it for every platform: counted in characters as a reader sees them
// (grapheme clusters, as Swift's String.count), and bounded in size too.
// The server, the web prototype and the admin site share it.

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

/**
 * What the server takes for a field limited to `limit` characters: 1 to
 * `limit`, not only spaces (spec/vectors/text.json, fitsText).
 */
export const fitsText = (text: string, limit: number): boolean =>
  text.trim() !== "" && withinLimit(text, limit);

// One emoji, as the picker and the system keyboards give: a single
// character that starts as a pictograph or a flag, or a keycap (1️⃣, #️⃣),
// which starts with the plain digit or sign under its combining keycap.
const EMOJI = /^\p{Extended_Pictographic}|^\p{Regional_Indicator}|^[#*0-9]️?⃣/u;

/**
 * Whether the text is exactly one character that is an emoji
 * (spec/vectors/text.json, isEmoji).
 */
export const isEmoji = (text: string): boolean =>
  withinLimit(text, 1) && characterCount(text) === 1 && EMOJI.test(text);
