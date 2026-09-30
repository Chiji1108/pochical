// How long free text may be, by what it is, as spec/text-limits.md sets it
// for every platform. Counted as a reader sees characters, so an emoji or
// a letter with its accent counts as one.
export const textLimits = {
  chatMessage: 1000,
  dayNote: 100,
  groupName: 30,
  personName: 20,
  shiftName: 8,
} as const;

export type TextKind = keyof typeof textLimits;

// Past this many, a count is shown only once the rest left is small, so
// a note or a message does not carry one all the while it is written.
const SHORT_LIMIT = 30;
const COUNT_WHEN_LEFT = 20;

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function characterCount(text: string) {
  return [...graphemes.segment(text)].length;
}

export function limitText(text: string, limit: number) {
  const kept = [...graphemes.segment(text)].slice(0, limit);
  return kept.map(({ segment }) => segment).join("");
}

// Whether the count shows while the field is in use: all the while for
// a short one, like a name, and near the end for a long one.
export function countShown(count: number, limit: number) {
  return limit <= SHORT_LIMIT || limit - count <= COUNT_WHEN_LEFT;
}
