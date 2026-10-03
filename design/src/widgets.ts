// The widgets' numbers every platform holds to (spec/widgets.md), in one
// place: apps/web imports them, and `mise run gen` writes them out for the
// native apps (Widgets.swift, Widgets.kt) and as JSON
// (spec/design-tokens.json).
export const widgetRules = {
  // How many days ahead of today 次の休み looks, and no further than what
  // is entered.
  offLookaheadDays: 62,
} as const;
