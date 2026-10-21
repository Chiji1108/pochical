import { Code, ConnectError } from "@connectrpc/connect";
import { characterCount, withinLimit } from "@pochical/design/text";

// How the server holds text to the limits in design/src/limits.ts, as
// spec/text-limits.md has it; the counting is design/src/text.ts's.

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
