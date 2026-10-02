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
} as const;
