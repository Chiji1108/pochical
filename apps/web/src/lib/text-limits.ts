// How fields hold to the text limits (design/src/limits.ts), as
// spec/text-limits.md sets it for every platform. Counted as a reader sees
// characters, so an emoji or a letter with its accent counts as one.
import { textFields } from "@pochical/design/limits";

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function characterCount(text: string) {
  return [...graphemes.segment(text)].length;
}

export function limitText(text: string, limit: number) {
  const kept = [...graphemes.segment(text)].slice(0, limit);
  return kept.map(({ segment }) => segment).join("");
}

// One emoji, as the pickers and the system keyboards give one: a single
// character that starts as a pictograph or a flag, or a keycap (1️⃣, #️⃣),
// which starts with the plain digit or sign under its combining keycap.
const EMOJI =
  /^\p{Extended_Pictographic}|^\p{Regional_Indicator}|^[#*0-9]\uFE0F?\u20E3/u;

export function isEmoji(text: string) {
  return characterCount(text) === 1 && EMOJI.test(text);
}

// A name's first character, as a mark's letter or a face without a photo
// shows it, whole even when it is an emoji joined of several.
export function firstCharacter(name: string) {
  return limitText(name.trim(), 1);
}

// A day shows a shift's name up to textFields.dayNameLength characters,
// else its first ones and …, the same on every platform, rather than
// however many a width happens to fit.

export function dayName(
  name: string,
  length: number = textFields.dayNameLength
) {
  if (characterCount(name) <= length) {
    return name;
  }
  return `${limitText(name, length - 1)}…`;
}

// Whether the count shows while the field is in use: all the while for
// a short one, like a name, and near the end for a long one.
export function countShown(count: number, limit: number) {
  return (
    limit <= textFields.countAlwaysUpTo ||
    limit - count <= textFields.countWhenLeft
  );
}

// Whether a key is confirming a Japanese conversion rather than meant as
// itself: Enter then chooses the word, and must not also add or send.
// Safari reports it only by the key code IMEs use.
const IME_KEY_CODE = 229;

export function composing(event: {
  keyCode: number;
  nativeEvent: { isComposing: boolean };
}) {
  return event.nativeEvent.isComposing || event.keyCode === IME_KEY_CODE;
}
