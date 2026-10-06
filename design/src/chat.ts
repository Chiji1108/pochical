// The chat's numbers every platform shows alike (spec/chat.md), in one
// place: apps/web imports them, and `mise run gen` writes them out for the
// native apps (Chat.swift, Chat.kt) and as JSON (spec/design-tokens.json).
export const chatRules = {
  // A card of shared days shows this many days (or people) across, all
  // that fit in a bubble on the narrowest phone; past it the card turns
  // to a row per person.
  dayCardColumns: 6,
  // A card of shared days in rows shows this many, a week, and ほか{n}日
  // under them.
  dayCardRows: 7,
  // A message's words past this many lines end in … and 続きを読む.
  foldLines: 10,
  // A message of nothing but 1 to this many emoji shows them large,
  // without a bubble, as iMessage does.
  largeEmojiMax: 3,
  // The size such emoji are drawn at, in points (sp on Android) at the
  // reader's default text size, growing with it as body does.
  largeEmojiSize: 48,
  // The width over height a link preview's picture is cropped to, the
  // size pages give their og:image.
  linkPreviewAspect: 1.91,
  // How long, in milliseconds, a link written in the composer must stay
  // the same before its preview is asked for, so one typed by hand is not
  // read at every letter.
  linkPreviewSettleMs: 400,
  // The most lines pinned at once, as LINE keeps five announcements; a
  // new one takes the place of the oldest.
  maxPins: 5,
  // How many lines a page of a chat holds: the latest when it opens, and
  // each earlier page as it scrolls back. A device catching up gets at
  // most this many new lines of each chat; the rest come as pages.
  pageSize: 50,
  // How often, in milliseconds, a client sends a typing frame while
  // someone is writing.
  typingSendMs: 3000,
  // How long, in milliseconds, receivers show someone typing unless it is
  // refreshed, so a lost stop frame cannot leave it stuck.
  typingShowMs: 5000,
} as const;
