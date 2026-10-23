// What a day's values mean, for every platform (spec/sync-protocol.md,
// Repeating orders). `mise run gen` writes it out for the native apps
// (Days.swift, Days.kt) and as JSON (spec/design-tokens.json).
export const dayRules = {
  // The pattern of a day cleared on purpose: it shows no shift, whatever
  // its repeating order. Not the same as no pattern at all, which follows
  // the order, so keep the two apart everywhere: an optional that is nil
  // or null follows the order, and this value, the empty string, is no
  // shift. Never collapse them (Swift's `?? ""`, Kotlin's
  // isNullOrEmpty, SQLite's NULL and '').
  noShift: "",
  // シフトの期間 (spec/calendar.md, The shift period): the day picked first
  // when asked for the day a period starts on, and the latest it may
  // start on, so every month has it (1 is the month itself).
  periodFirstPick: 15,
  periodLastStart: 28,
} as const;
