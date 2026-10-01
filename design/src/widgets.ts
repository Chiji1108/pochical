// The widgets' numbers every platform holds to (spec/widgets.md), in one
// place: apps/web imports them, and `mise run gen` writes them out for the
// native apps (Widgets.swift, Widgets.kt) and as JSON
// (spec/design-tokens.json).
export const widgetRules = {
  // The lines a memo is cut at in the medium widget.
  memoLinesMedium: 3,
  // The lines a memo is cut at where there is room (Android's taller
  // medium).
  memoLinesRoomy: 5,
  // The lines a memo is cut at in the small 今日.
  memoLinesSmall: 1,
  // 次の休み shows up to this many days off.
  nextOffs: 3,
  // How many days ahead of today 次の休み looks, and no further than what
  // is entered.
  offLookaheadDays: 62,
} as const;
