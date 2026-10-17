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
  // How long, in milliseconds, the day floating over the lines stays once
  // the chat stops scrolling, as LINE shows it while scrolling back.
  floatingDayMs: 1500,
  // A message's words past this many lines end in … and 続きを読む.
  foldLines: 10,
  // A message of nothing but 1 to this many emoji shows them large,
  // without a bubble, as iMessage does.
  largeEmojiMax: 3,
  // The size such emoji are drawn at, in points (sp on Android) at the
  // reader's default text size, growing with it as body does.
  largeEmojiSize: 48,
  // The room between one writer's lines in a run, in points: close, so a
  // run reads as one turn, as iMessage and LINE draw them.
  lineGap: 4,
  // The width over height a link preview's picture is cropped to, the
  // size pages give their og:image.
  linkPreviewAspect: 1.91,
  // How long, in milliseconds, a link written in the composer must stay
  // the same before its preview is asked for, so one typed by hand is not
  // read at every letter.
  linkPreviewSettleMs: 400,
  // How long, in milliseconds, a press on a line is held before it opens
  // the line's reactions and menu, with its haptic: quick, as iMessage's
  // haptic comes, yet past a slow tap. Counted from the finger going
  // down: SwiftUI's long press in the chat's scroll view came far later.
  longPressMs: 250,
  // The most lines pinned at once, as LINE keeps five announcements; a
  // new one takes the place of the oldest.
  maxPins: 5,
  // The most lines a chat lays out as it opens: its latest page, back to
  // the reader's first unread line when that is earlier, at most this
  // many. Earlier lines come a page at a time as it scrolls back.
  openMax: 200,
  // How many lines a page of a chat holds: the latest when it opens, and
  // each earlier page as it scrolls back. A device catching up gets at
  // most this many new lines of each chat; the rest come as pages.
  pageSize: 50,
  // How long, in milliseconds, a photo takes to come in over its blur.
  photoFadeMs: 200,
  // The most bytes one photo may be once shrunk to send; the server
  // refuses a larger one.
  photoMaxBytes: 4_000_000,
  // A photo is shrunk to send until its longer side is at most this many
  // pixels, as chat apps send them; shrinking it again as JPEG also leaves
  // its location behind.
  photoMaxEdge: 2048,
  // A photo is also sent shrunk until its longer side is at most this many
  // pixels, for the chat's lines and quotes to fetch instead of the whole
  // photo: enough for its 220×260pt box at 3x, a panorama cropped too.
  photoSmallEdge: 960,
  // The most bytes a photo's ThumbHash takes, as the format makes one at
  // most (an opaque photo's take 24 at most); the server refuses a longer
  // one.
  photoThumbHashMaxBytes: 25,
  // The most photos sent at once, each as its own line.
  photosPerSend: 4,
  // A face or a group's photo mark is shrunk further, as it only ever
  // shows small: past three times its largest place on screen (88pt).
  pictureMaxEdge: 640,
  // How many screens' height before the top of a chat's lines its next
  // earlier page is laid out, so the reader scrolling back never comes to
  // the top waiting: Signal asks three screens ahead, Telegram five lines.
  prefetchScreens: 2,
  // The room before a run's first line, a day's title and ここから新着,
  // in points: where the writer changes, the lines part more.
  runGap: 12,
  // How often, in milliseconds, a client sends a typing frame while
  // someone is writing.
  typingSendMs: 3000,
  // How long, in milliseconds, receivers show someone typing unless it is
  // refreshed, so a lost stop frame cannot leave it stuck.
  typingShowMs: 5000,
  // How long, in milliseconds, a line may wait on the device for the
  // group to take it before it is marked 送れませんでした and stops going
  // by itself, for the person to send again or delete: past brief gaps
  // (a tunnel, a lift), yet before words written offline go out long
  // after they were meant, as Signal gives up rather than send a day late.
  unsentAfterMs: 600_000,
} as const;
