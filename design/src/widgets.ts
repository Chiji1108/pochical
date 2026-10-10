// The widgets' numbers every platform holds to (spec/widgets.md), in one
// place: apps/web imports them, and `mise run gen` writes them out for the
// native apps (Widgets.swift, Widgets.kt) and as JSON
// (spec/design-tokens.json).
export const widgetRules = {
  // Within this many hours of it, いまのシフト counts down to the next
  // shift's start, as the system's clock keeps the words; further off, it
  // says the day (明日, 3日後).
  countdownHours: 24,
  // How many days ahead of today 次の休み looks, and no further than what
  // is entered.
  offLookaheadDays: 62,
  // How many days ahead of today いまのシフト looks for the next shift
  // with hours.
  shiftLookaheadDays: 62,
} as const;
