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

// How much of what a user owns one synced value may hold
// (spec/sync-protocol.md). Far past what one person keeps, so they only
// bound a value; an edit past them is corrected by the server.
export const syncLimits = {
  // Coworkers one person notes.
  coworkers: 500,
  // Characters in an id the apps make (patterns, coworkers, devices) and
  // in an icon's name; ids hold no spaces, which separate a day's people.
  idLength: 64,
  // Repeating orders in one timeline: a change of rotation or job each.
  orders: 200,
  // Shift patterns one person keeps; ポチポチ入力 shows ten to a page.
  patterns: 200,
  // People noted on one day.
  peopleADay: 50,
  // Shifts in one repeating order: a rotation a year long.
  sequence: 366,
} as const;
