// When the apps ask the store for its review prompt (spec/review.md), in
// one place: `mise run gen` writes it out for the native apps
// (Review.swift, Review.kt) and as JSON (spec/design-tokens.json).
export const reviewRules = {
  // Days from the last time the apps asked, whether or not the store
  // showed its prompt then.
  minDaysBetweenAsks: 120,
  // Days from the first time the app was opened.
  minDaysSinceFirstOpen: 21,
  // Separate days the app was opened, today among them.
  minOpenDays: 7,
  // The months those days fall in, so a few busy days in one week and a
  // return weeks later do not count as using it all along.
  minOpenMonths: 2,
} as const;
