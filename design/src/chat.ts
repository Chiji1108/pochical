// The chat's numbers every platform shows alike (spec/chat.md), in one
// place: apps/web imports them, and `mise run gen` writes them out for the
// native apps (Chat.swift, Chat.kt) and as JSON (spec/design-tokens.json).
export const chatRules = {
  // How long, in milliseconds, others' lines coming in while a chat is
  // open wait to be said by the screen reader, so a run of them is said
  // once, as how many and the latest, rather than one over the other.
  announceSettleMs: 1000,
  // How much larger than at the default text size a card of shared days
  // or a poll draws its small type, faces and table as the reader's text
  // grows, so a week of days or six people still fit across a line on the
  // narrowest phone.
  cardsMostScale: 1.3,
  // How much larger than at the default text size the chat's round
  // controls (the composer's tools and send, ↓) grow at most as the
  // reader's text grows, so at the accessibility sizes the field and the
  // lines keep the room, as Messages keeps its own controls.
  controlsMostScale: 1.5,
  // A card of shared days shows this many days (or people) across, all
  // that fit in a bubble on the narrowest phone; past it the card turns
  // to a row per person.
  dayCardColumns: 6,
  // A card of shared days in rows shows this many, a week, and ほか{n}日
  // under them.
  dayCardRows: 7,
  // How long, in milliseconds, the writing in a composer must pause before
  // it is kept as the chat's draft, so a draft is not written at every
  // letter (an emptied composer is kept at once).
  draftSettleMs: 500,
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
  // How long, in milliseconds, the lines take to move as one comes in at
  // the foot or changes height (a reaction, an edit, a link's page come
  // later, 続きを読む): a spring without bounce settling in that time, the
  // system's own for a list's changes (UIKit's collection view settles its
  // updates in 0.5 s), so the lines move alike whatever changed them.
  lineMoveMs: 500,
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
  // The most bytes of photos fetched for the chat a phone keeps on its
  // disk, the least lately read let go first past it, as an image cache
  // keeps a ceiling: a few thousand photos' small versions. The member's
  // own photos and faces are kept apart, outside it.
  photoDiskBytes: 200_000_000,
  // How long, in milliseconds, a photo takes to come in over its blur.
  photoFadeMs: 200,
  // The most bytes one photo may be once shrunk to send; the server
  // refuses a larger one.
  photoMaxBytes: 4_000_000,
  // A photo is shrunk to send until its longer side is at most this many
  // pixels, as chat apps send them; shrinking it again as JPEG also leaves
  // its location behind.
  photoMaxEdge: 2048,
  // The most bytes of photos drawn at their size a phone holds in memory
  // while the app runs, so a line scrolled back into sight draws at once;
  // the system lets them go sooner when memory runs short.
  photoMemoryBytes: 48_000_000,
  // How near the end of the photos it holds the photo opened large may be
  // swiped, in photos, before it asks for the next page, so a swipe never
  // waits for one.
  photoPageAhead: 10,
  // How many photos a page of a chat's photos holds (ChatPhotosRequest),
  // each only its id, size and ThumbHash, as the photo opened large pages
  // through them past the lines laid out.
  photoPageSize: 100,
  // How many screens' height above and below the lines in sight their
  // photos are fetched ahead, so a reader scrolling finds them there, and
  // let go of again past it: a screen, as Signal and Telegram fetch the
  // lines about to come into sight.
  photoPrefetchScreens: 1,
  // A photo is also sent shrunk until its longer side is at most this many
  // pixels, for the chat's lines and quotes to fetch instead of the whole
  // photo: enough for its 220×260pt box at 3x, a panorama cropped too.
  photoSmallEdge: 960,
  // The most bytes a photo's ThumbHash takes, as the format makes one at
  // most (an opaque photo's take 24 at most); the server refuses a longer
  // one.
  photoThumbHashMaxBytes: 25,
  // The most photos sent at once, one line holding them all, drawn as
  // one album (spec/chat.md, Albums), as Telegram's and Signal's hold ten.
  photosPerSend: 10,
  // A face or a group's photo mark is shrunk further, as it only ever
  // shows small: past three times its largest place on screen (88pt).
  pictureMaxEdge: 640,
  // The room, in points (dp on Android), the pinned lines' card keeps
  // from the screen's sides and from the header over it, alike, so it
  // floats evenly under the header rather than hanging from it.
  pinMargin: 8,
  // The member id Pochical's people write under in the chat with them
  // (spec/chat.md, The chat with Pochical's people): no account's, as
  // better-auth's ids are random, so their lines and reactions are told
  // apart by it, and the apps draw it as the app's name and icon.
  pochicalMember: "pochical",
  // How many screens' height before the top of a chat's lines its next
  // earlier page is laid out, so the reader scrolling back never comes to
  // the top waiting: Signal asks three screens ahead, Telegram five lines.
  prefetchScreens: 2,
  // How far, in points (dp on Android), a line is dragged sideways toward
  // the middle before letting go starts a reply to it, the reply arrow then
  // full and a haptic marking it: Signal's 55, between Telegram's 45 and
  // 60. Past it the line follows the finger less, as a rubber band.
  replySwipe: 56,
  // Past chatRules.replySwipe a dragged line follows the finger this much
  // of the way it goes on.
  replySwipeRubber: 0.3,
  // The room before a run's first line, a day's title and ここから新着,
  // in points: where the writer changes, the lines part more.
  runGap: 12,
  // The place id the chat with Pochical's people is kept by, on the
  // devices and in the User DO's counts, mutes and notifications, as a
  // group's chats are kept by the group's id: group ids are random, so
  // none is named so. The server keeps it in the Group DO support:{userId}.
  supportPlace: "support",
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

// What a chat can do, by where it is kept (spec/chat.md, Where a chat is
// kept): a group's chats, or the chat with Pochical's people, which is
// kept the same way and differs only by these. The server refuses what
// its place does not take, and the apps leave it out of their menus and
// tools. Within a group, a one-to-one chat's own differences (no polls,
// no mentions) are the thread's, not the place's.
export type ChatPlaceRules = {
  // Lines share days (日にちを共有).
  readonly days: boolean;
  // Any two members have a one-to-one chat beside the place's own; without
  // it the place's only chat is its own (thread "group").
  readonly directChats: boolean;
  // A line's words are changed after it is sent (編集).
  readonly edit: boolean;
  // Words mention a member (<@id>).
  readonly mentions: boolean;
  // Lines are pinned for everyone.
  readonly pins: boolean;
  // Days are put to the vote.
  readonly polls: boolean;
  // Lines and members are reported (通報), and members blocked.
  readonly reports: boolean;
  // Each line goes with the app's version and the device it is sent
  // from, kept for whoever reads the chat (the chat's head says so).
  readonly sendsDevice: boolean;
};

export const chatPlaces = {
  group: {
    days: true,
    directChats: true,
    edit: true,
    mentions: true,
    pins: true,
    polls: true,
    reports: true,
    sendsDevice: false,
  },
  // A chat of two with Pochical's people, who may already be answering
  // the words as they were: no 編集, and nothing a group's chat is for.
  support: {
    days: false,
    directChats: false,
    edit: false,
    mentions: false,
    pins: false,
    polls: false,
    reports: false,
    sendsDevice: true,
  },
} as const satisfies Record<string, ChatPlaceRules>;

export type ChatPlaceKind = keyof typeof chatPlaces;
