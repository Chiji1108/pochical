// The numbers every platform holds to, in one place: apps/web and
// apps/server import them, and `mise run gen` writes them out for the
// native apps (Limits.swift, Limits.kt) and as JSON (spec/design-tokens.json).
// How they are applied (counting, fields, showing long text) is in
// spec/text-limits.md.

// How long free text may be, in characters as a reader sees them
// (grapheme clusters), by what it is.
export const textLimits = {
  // A message in a group chat or a one-to-one chat.
  chatMessage: 1000,
  // A day's memo.
  dayNote: 100,
  // A group's letters, when its mark is letters.
  groupMark: 2,
  // A group's name, when creating or editing it.
  groupName: 30,
  // Every name of a person, wherever it is typed: the profile's name, a
  // group's name for you (joining, creating or in its settings), and a
  // coworker's name (in the list, or added from a day), so a name that fits
  // in one place fits in all.
  personName: 20,
  // A shift pattern's letter, for the letter look.
  shiftMark: 1,
  // A shift pattern's name.
  shiftName: 8,
} as const;

export type TextKind = keyof typeof textLimits;

// How a field shows its count, `{used}/{limit}`, and how a shift's name
// shortens in a day (spec/text-limits.md).
export const textFields = {
  // A limit this long or shorter shows its count all the while the field
  // is in use…
  countAlwaysUpTo: 30,
  // …a longer one only once this few characters are left, so a memo or a
  // message does not carry a count all the while it is written.
  countWhenLeft: 20,
  // A day of the calendar shows a shift's name up to this many characters,
  // else its first two and …: four would fit, but run to the edges of a
  // day off's tint and the frame round today.
  dayNameLength: 3,
} as const;

// The most days one chat message shares, with everyone's shifts or as a
// poll's choices: a month's worth.
export const SHARED_DAYS_MAX = 31;

// The most people in one group. Far past a family's or friends' group, so
// it only caps what a leaked invitation link can let in.
export const GROUP_MAX_MEMBERS = 100;

// The most people one person keeps in 一緒に働く人. Room for a whole
// ward or shop, so it only caps what one account stores and syncs.
export const COWORKERS_MAX = 100;
