import { css, cva } from "@pochical/styled-system/css";

// The look of the chats: the list of them in a group, and a chat's own
// screen, which the support chat (design-support-chat.tsx) shares.

// A chat in the hub's list: its name and last line, with the time and
// what is unread at the end.
export const chatRow = {
  // 下書き： before a chat's draft, in the danger color, as Telegram
  // marks one.
  draft: css({ color: "danger.default" }),
  // The red ! of a latest line not sent, as the line itself has it.
  failed: css({
    color: "danger.default",
    display: "inline",
    marginRight: "3px",
    verticalAlign: "-2px",
  }),
  meta: css({
    alignItems: "flex-end",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "4px",
  }),
  name: css({
    alignItems: "center",
    display: "flex",
    gap: "4px",
    textStyle: "body",
  }),
  preview: css({
    color: "text.quaternary",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "caption",
    whiteSpace: "nowrap",
  }),
  text: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  }),
  time: css({ color: "text.quaternary", textStyle: "caption2" }),
  badges: css({ display: "flex", gap: "4px" }),
  // The unread count's shape, in the accent: a mention is for you, not
  // a warning.
  mention: css({
    bg: "accent.fill",
    borderRadius: "full",
    color: "accent.onFill",
    display: "inline-grid",
    fontSize: "11px",
    fontWeight: 700,
    height: "18px",
    placeItems: "center",
    width: "18px",
  }),
};

// A chat as the messaging apps draw one: others' bubbles on the left with
// their avatar and name at the start of a run, yours on the right in the
// accent; the day between runs, the time by the bubble, reactions under
// it, and the composer floating over their foot.
export const chatStyle = {
  avatar: css({ flexShrink: 0, width: "32px" }),
  body: cva({
    base: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      maxWidth: "84%",
      minWidth: 0,
      // Room for the tail of a run's first bubble by the face; every line
      // keeps it, so a run's lines line up (bubblePath). By the screen's
      // edge the tail reaches into the margin, as LINE's and Messages' do.
      paddingLeft: "10px",
    },
    variants: {
      mine: { true: { alignItems: "flex-end", paddingLeft: 0 } },
    },
  }),
  // What a bubble holds, clipped to its outline (BubbleOutline), which is
  // filled behind it: round all over, but the first of a run with a tail
  // at its top corner by the writer, as LINE draws one.
  bubble: cva({
    base: {
      color: "text.primary",
      display: "flex",
      flex: 1,
      flexDirection: "column",
      minWidth: 0,
      position: "relative",
    },
    variants: {
      mine: { true: { color: "accent.onFill" } },
    },
  }),
  // The bubble's place in the line, its tail reaching out of it.
  bubbleFrame: css({ display: "flex", minWidth: 0, position: "relative" }),
  bubbleFill: cva({
    base: {
      fill: "fill.tertiary",
      inset: 0,
      overflow: "visible",
      pointerEvents: "none",
      position: "absolute",
    },
    variants: { mine: { true: { fill: "accent.fill" } } },
  }),
  // A bubble jumped to rings along its outline for a moment (flash).
  bubbleRing: css({
    fill: "none",
    inset: 0,
    opacity: 0,
    overflow: "visible",
    pointerEvents: "none",
    position: "absolute",
    stroke: "accent.border",
    // Half of it outside the outline, as a 3px ring.
    strokeWidth: 6,
  }),
  // A reply's quote inside the bubble (BubbleQuote).
  bubbleQuote: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    font: "inherit",
    gap: "2px",
    padding: "8px 12px 0",
    textAlign: "left",
  }),
  bubbleQuoteLine: css({ alignItems: "center", display: "flex", gap: "8px" }),
  bubbleQuoteWords: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  }),
  bubbleQuoteName: css({
    fontWeight: 600,
    opacity: 0.85,
    textStyle: "caption",
  }),
  bubbleQuoteText: css({
    lineClamp: 1,
    lineHeight: 1.45,
    opacity: 0.8,
    textStyle: "footnote",
  }),
  // The avatar sits at the top by the name, the time by the bubble, so
  // the reactions under it push neither down.
  bubbleRow: cva({
    base: { alignItems: "flex-end", display: "flex", gap: "8px" },
    variants: { mine: { true: { flexDirection: "row-reverse" } } },
  }),
  bubbleRule: css({
    bg: "currentcolor",
    height: "1px",
    margin: "8px -12px 0",
    opacity: 0.25,
  }),
  // A message keeps the lines it was written in.
  // A long message's words, cut at chatRules.foldLines with an ellipsis.
  // The number reaches the style as a variable FoldedText sets: Panda
  // reads styles before the code runs, so it cannot follow chatRules.
  folded: css({ lineClamp: "var(--fold-lines)" }),
  // Under a folded message, in the color its links take.
  unfold: cva({
    base: {
      bg: "transparent",
      border: 0,
      color: "accent.default",
      fontWeight: 600,
      padding: "0 12px 8px",
      textAlign: "start",
      textStyle: "footnote",
    },
    variants: { mine: { true: { color: "accent.onFill" } } },
  }),
  bubbleText: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "block",
    font: "inherit",
    lineHeight: 1.5,
    maxWidth: "100%",
    overflowWrap: "anywhere",
    padding: "8px 12px",
    textAlign: "left",
    textStyle: "body",
    whiteSpace: "pre-wrap",
  }),
  // A message of nothing but a few emoji (LargeEmoji), large and without
  // a bubble, at the size LargeEmoji sets. Rounded for the ring a jump
  // gives it.
  largeEmoji: css({
    borderRadius: "lg",
    display: "flex",
    fontSize: "var(--large-emoji-size)",
    lineHeight: 1.15,
    minWidth: 0,
    whiteSpace: "nowrap",
  }),
  // A link in a message, underlined as the chat apps mark one; in
  // others' bubbles in the accent, in yours in the bubble's own color.
  bubbleLink: cva({
    base: { textDecoration: "underline", textUnderlineOffset: "2px" },
    variants: { mine: { false: { color: "accent.default" }, true: {} } },
  }),
  // A member mentioned, in the weight of a name and, in others' bubbles,
  // the accent. One of you looks the same: the chat list's @ is what
  // finds it.
  mention: cva({
    base: { fontWeight: 600 },
    variants: { mine: { false: { color: "accent.default" }, true: {} } },
  }),
  // The others to mention, a card of glass floating over the composer, a
  // few in sight and the rest a scroll away.
  mentionList: css({
    borderRadius: "2xl",
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    margin: 0,
    maxHeight: "180px",
    overflowY: "auto",
    padding: "4px",
  }),
  mentionPick: css({
    _active: { bg: "fill.secondary" },
    _hover: { bg: "fill.secondary" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "xl",
    color: "text.primary",
    display: "flex",
    gap: "12px",
    height: "44px",
    padding: "0 8px",
    textAlign: "left",
    textStyle: "body",
    width: "100%",
  }),
  // A bubble with a link's page under its words is wide enough for the
  // page's picture, as LINE draws one: 240px where the row has room, and
  // narrower where it does not, so the time beside it stays in the row.
  linked: css({ flex: "1 1 240px" }),
  // What floats over the lines' foot, as iOS 26's Messages has no bar
  // there: the composer, or who left in its place. The lines run on
  // under it, fading into the ground at the very foot as iOS 26's scroll
  // edge does; ChatEdge gives them the room to end clear of it.
  foot: css({
    // Over the fade, which is drawn first. Not by isolating the foot,
    // which would leave its glass nothing under it to blur.
    "& > *": { pointerEvents: "auto", position: "relative" },
    "&::before": {
      bg: "linear-gradient(to bottom, transparent, token(colors.background.base))",
      bottom: 0,
      content: '""',
      height: "32px",
      left: "calc(-1 * var(--screen-left))",
      position: "absolute",
      right: "calc(-1 * var(--screen-right))",
    },
    bottom: 0,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    left: 0,
    paddingBottom: "4px",
    paddingTop: "8px",
    // The lines in the gaps around its glass stay to be pressed.
    pointerEvents: "none",
    position: "absolute",
    right: 0,
  }),
  // What floats over the lines' top: the pins, the lines running on
  // under their glass; ChatEdge gives them the room to start clear of it.
  head: css({
    "& > *": { pointerEvents: "auto" },
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  }),
  // The round button and the capsule beside it, both kept at the foot as
  // the message grows, as in Messages.
  composer: css({ alignItems: "flex-end", display: "flex", gap: "8px" }),
  // What the next message carries and its words, in one piece of glass:
  // a capsule with one line (xl, past half its height), and a rectangle
  // with the capsule's corners as it grows.
  capsule: css({
    borderRadius: "xl",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minWidth: 0,
  }),
  // The field and send at its end; the count, near the limit, under the
  // field's end.
  fieldRow: css({
    "& > span[aria-hidden]": {
      gridArea: "count",
      justifySelf: "end",
      paddingBottom: "6px",
      paddingRight: "4px",
    },
    alignItems: "end",
    display: "grid",
    gridTemplateAreas: '"field send" "count ."',
    gridTemplateColumns: "minmax(0, 1fr) auto",
  }),
  // In place of the composer, in a one-to-one chat with someone who left:
  // quiet words in a capsule of glass.
  gone: css({
    alignSelf: "center",
    borderRadius: "full",
    color: "text.tertiary",
    margin: 0,
    padding: "8px 16px",
    textStyle: "footnote",
  }),
  // ＋ before the capsule, a round of glass the field's height.
  attach: css({
    border: 0,
    borderRadius: "circle",
    color: "text.primary",
    display: "grid",
    flexShrink: 0,
    height: "38px",
    placeItems: "center",
    width: "38px",
  }),
  // ＋'s menu over it, its first item nearest the button. Shut, it stays
  // hidden.
  attachMenu: css({
    "&:not([hidden])": { display: "flex" },
    flexDirection: "column-reverse",
  }),
  // Send at the field's end, bottom-aligned with its last line. Lights up
  // softly once there is something to send, and dims back the same way.
  send: css({
    _disabled: { bg: "fill.primary" },
    bg: "accent.fill",
    border: 0,
    borderRadius: "circle",
    color: "accent.onFill",
    display: "grid",
    gridArea: "send",
    height: "30px",
    margin: "4px",
    placeItems: "center",
    transition: "background-color 0.15s ease-out, color 0.15s ease-out",
    width: "30px",
  }),
  // One line to start with, filling the capsule's height; it grows with
  // the lines written, up to five, and then scrolls.
  composerInput: css({
    "--lines": "5",
    "--pad-x": "14px",
    "--pad-y": "8px",
    color: "text.primary",
    gridArea: "field",
    lineHeight: "22px",
    minWidth: 0,
    textStyle: "body",
  }),
  dayOpen: cva({
    base: {
      alignSelf: "flex-start",
      bg: "transparent",
      border: 0,
      color: "accent.default",
      padding: "0 4px",
      textDecoration: "underline",
      textStyle: "caption",
    },
    variants: { mine: { true: { alignSelf: "flex-end" } } },
  }),
  empty: css({
    color: "text.quaternary",
    margin: "auto",
    textStyle: "footnote",
  }),
  header: css({
    alignItems: "center",
    borderBottom: "1px solid token(colors.separator)",
    display: "grid",
    // The sides as wide as each other, so the title stays centered and a
    // long one is cut short between them.
    gridTemplateColumns: "1fr minmax(0, auto) 1fr",
    // Room between the title and the buttons, so a long name is cut
    // short before it touches them.
    columnGap: "8px",
    // Out to the screen's edges, so its line runs from edge to edge as a
    // bar's does on iOS and Android (a list's lines stay inset); its
    // contents stay where they were.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    paddingBottom: "8px",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: "4px",
  }),
  // A message jumped to rings its bubble or shared days for a moment.
  item: cva({
    base: { display: "flex", flexDirection: "column", gap: "8px" },
    variants: {
      // A run's first line, a day's title and whatever else stands apart:
      // more room before it than between one writer's lines.
      runStart: {
        true: {
          "&:not(:first-child)": {
            marginTop: "calc(var(--run-gap) - var(--line-gap))",
          },
        },
      },
      flash: {
        true: {
          "& :is([data-part=bubble], [data-part=day-card]):not(:has(> [data-part=bubble-ring]))":
            {
              _motionReduce: { animation: "none" },
              animation: "flash 1.2s ease-out",
            },
          "& [data-part=bubble-ring]": {
            _motionReduce: { animation: "none" },
            animation: "ringFlash 1.2s ease-out",
          },
        },
      },
    },
  }),
  message: cva({
    base: { alignItems: "flex-start", display: "flex", gap: "8px" },
    variants: { mine: { true: { flexDirection: "row-reverse" } } },
  }),
  // The lines and, over their foot, the ↓ to the latest.
  lines: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minHeight: 0,
    position: "relative",
  }),
  // The day of the lines at the top, over them while scrolling: the day's
  // title lifted off the lines, on the chat's own ground and ringed so it
  // reads over the bubbles (glass on iOS, as the ↓ is).
  floatingDay: cva({
    base: {
      bg: "background.base",
      borderColor: "border.default",
      borderRadius: "sm",
      borderWidth: "1px",
      boxShadow: "md",
      color: "text.tertiary",
      left: "50%",
      padding: "2px 12px",
      pointerEvents: "none",
      position: "absolute",
      textStyle: "caption2",
      top: "calc(var(--head-height, 0px) + 8px)",
      transform: "translateX(-50%)",
      transition: "opacity 0.2s",
    },
    variants: {
      shown: { false: { opacity: 0 }, true: { opacity: 1 } },
    },
  }),
  // Over the foot's glass, which takes --foot-height of the lines.
  latest: css({
    bottom: "calc(var(--foot-height, 0px) + 12px)",
    position: "absolute",
    right: "4px",
  }),
  // The count of new lines below, on the ↓'s corner as a chat's unread.
  latestCount: css({ position: "absolute", right: "-4px", top: "-4px" }),
  // ここから新着: a rule either side of the words, in the accent, as LINE
  // marks where the unread lines start.
  unread: css({
    "&::before, &::after": {
      bg: "accent.border",
      content: '""',
      flex: 1,
      height: "1px",
    },
    alignItems: "center",
    color: "accent.default",
    display: "flex",
    gap: "12px",
    // A run's room either side, as the line after it starts one.
    margin: "calc(var(--run-gap) - var(--line-gap)) 0",
    textStyle: "caption",
  }),
  // Three dots in a bubble of the others' kind (a run's first, by their
  // face), rising in turn.
  typing: css({
    "& > span": {
      _motionReduce: { animation: "none" },
      animation: "typingDot 1.2s ease-in-out infinite",
      bg: "text.tertiary",
      borderRadius: "circle",
      height: "6px",
      width: "6px",
    },
    "& > span:nth-child(2)": { animationDelay: "0.15s" },
    "& > span:nth-child(3)": { animationDelay: "0.3s" },
    alignItems: "center",
    display: "flex",
    gap: "4px",
    height: "36px",
    padding: "0 16px",
  }),
  // Chat apps scroll without a bar over the bubbles.
  messages: css({
    "&::-webkit-scrollbar": { display: "none" },
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "var(--line-gap)",
    listStyle: "none",
    margin: 0,
    minHeight: 0,
    overflowY: "auto",
    // The latest line ends clear of what floats over the foot.
    padding:
      "calc(var(--head-height, 0px) + 12px) 2px calc(var(--foot-height, 0px) + 12px)",
    scrollbarWidth: "none",
  }),
  name: css({
    color: "text.tertiary",
    paddingLeft: "4px",
    textStyle: "caption2",
  }),
  notice: css({
    alignSelf: "center",
    color: "text.tertiary",
    lineHeight: 1.5,
    margin: "8px auto",
    maxWidth: "85%",
    textAlign: "center",
    textStyle: "caption",
  }),
  // The message being answered, marked by the accent line at its start.
  quote: css({
    bg: "transparent",
    border: 0,
    borderColor: "accent.default",
    borderLeft: "3px solid token(colors.accent.default)",
    borderRadius: "2xs",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "1px",
    marginBottom: "-2px",
    maxWidth: "100%",
    minWidth: 0,
    padding: "4px 12px",
    textAlign: "left",
  }),
  quoteName: css({
    color: "text.tertiary",
    fontWeight: 600,
    textStyle: "caption2",
  }),
  quoteText: css({
    color: "text.quaternary",
    lineClamp: 1,
    textStyle: "caption",
  }),
  // A quoted photo, small beside the quote's words.
  quoteThumb: css({
    borderRadius: "xs",
    flexShrink: 0,
    height: "32px",
    objectFit: "cover",
    width: "32px",
  }),
  // A photo line on its own; the photo is rounded like the shared days'
  // card.
  photo: css({ display: "flex", maxWidth: "100%" }),
  photoButton: cva({
    base: {
      bg: "transparent",
      border: 0,
      position: "relative",
      // The focus ring follows the photo's corners.
      borderRadius: "lg",
      display: "block",
      padding: 0,
      // A long press opens the actions, not the phone's own callout.
      userSelect: "none",
      WebkitTouchCallout: "none",
    },
    // In an album, its cell's whole, the grid rounding the corners.
    variants: {
      cell: { true: { borderRadius: 0, height: "100%", width: "100%" } },
    },
  }),
  // Where a photo is: its blur (ThumbHash) or grey while it comes. A
  // pale photo, like a paper roster, keeps its edge on the ground, and
  // inside a reply's bubble the same, so it reads as the photo it is.
  photoPlace: cva({
    base: {
      backgroundSize: "cover",
      bgColor: "fill.tertiary",
      borderRadius: "lg",
      display: "block",
      maxWidth: "100%",
      outline: "1px solid token(colors.border.default)",
      outlineOffset: "-1px",
      overflow: "hidden",
    },
    // In an album the grid has the edge.
    variants: {
      cell: {
        true: {
          borderRadius: 0,
          height: "100%",
          outline: "none",
          width: "100%",
        },
      },
    },
  }),
  photoImage: css({
    display: "block",
    height: "100%",
    objectFit: "cover",
    width: "100%",
  }),
  // A photo still coming, its grey breathing so it reads as on its way,
  // not as a photo that is grey.
  photoLoading: css({
    _motionReduce: { animation: "none" },
    animation: "photoLoading 1.6s ease-in-out infinite",
  }),
  // In a reply's bubble, under the quote, a little in from its edge, as
  // WhatsApp sets one.
  photoInBubble: css({ margin: "8px 4px 4px" }),
  // A photo with what lies over it: ↻, or the ring of one going up.
  photoFrame: cva({
    base: { borderRadius: "lg", display: "block", position: "relative" },
    variants: {
      cell: { true: { borderRadius: 0, height: "100%", width: "100%" } },
    },
  }),
  // A photo that could not be fetched: the whole of it a button fetching
  // it again, ↻ in its middle, as Signal and Telegram mark one.
  photoRetry: cva({
    base: {
      _focusVisible: { outline: "2px solid", outlineColor: "accent.default" },
      alignItems: "center",
      bg: "transparent",
      border: 0,
      borderRadius: "lg",
      cursor: "pointer",
      display: "flex",
      inset: 0,
      justifyContent: "center",
      padding: 0,
      position: "absolute",
    },
    variants: { cell: { true: { borderRadius: 0 } } },
  }),
  // ↻, or the ring going up with × in it, on the photo's shade.
  photoMark: css({
    alignItems: "center",
    bg: "media.shade",
    borderRadius: "full",
    color: "media.text",
    display: "flex",
    height: "48px",
    justifyContent: "center",
    position: "relative",
    width: "48px",
  }),
  // × in the ring, stopping the photo going up: its line is not sent.
  uploadStop: css({
    _focusVisible: { outline: "2px solid", outlineColor: "media.text" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "full",
    color: "media.text",
    cursor: "pointer",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    padding: 0,
    position: "absolute",
  }),
  // A photo going up: dimmed, with a ring filling as it goes, as LINE
  // draws one.
  uploading: cva({
    base: {
      alignItems: "center",
      bg: "media.dim",
      borderRadius: "lg",
      display: "flex",
      inset: 0,
      justifyContent: "center",
      position: "absolute",
    },
    variants: { cell: { true: { borderRadius: 0 } } },
  }),
  // A line of several photos, as one grid with no bubble (spec/chat.md,
  // Albums): rows 2 apart, its photos 2 apart in them, the whole rounded
  // with a hairline edge as a photo is.
  album: css({
    borderRadius: "lg",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    gap: "2px",
    maxWidth: "100%",
    outline: "1px solid token(colors.border.default)",
    outlineOffset: "-1px",
    overflow: "hidden",
  }),
  albumRow: css({ display: "flex", gap: "2px" }),
  albumCell: css({
    display: "block",
    flex: 1,
    minWidth: 0,
    position: "relative",
  }),
  uploadRing: css({
    "& circle": {
      fill: "none",
      stroke: "media.text",
      strokeWidth: 3,
    },
    "& circle:first-of-type": { opacity: 0.35 },
    "& circle:last-of-type": {
      animation: "uploadRing linear forwards",
      strokeDasharray: 100,
      strokeDashoffset: 100,
      strokeLinecap: "round",
    },
    height: "40px",
    transform: "rotate(-90deg)",
    width: "40px",
  }),
  // A photo that could not be sent: a red ! where its time would be, and
  // a note under it, as Messages marks one.
  failed: css({
    bg: "transparent",
    border: 0,
    color: "danger.default",
    display: "grid",
    flexShrink: 0,
    height: "32px",
    padding: 0,
    placeItems: "center",
    width: "32px",
  }),
  failedNote: css({
    alignSelf: "flex-end",
    color: "danger.default",
    paddingRight: "40px",
    textStyle: "caption2",
  }),
  // Photos chosen to send, in a row in the capsule over the words, each
  // with its ×.
  tray: cva({
    base: {
      display: "flex",
      gap: "8px",
      listStyle: "none",
      margin: 0,
      // Ten photos are wider than the capsule: they scroll across, the
      // room around them keeping each × in sight.
      overflowX: "auto",
      padding: "12px 12px 4px",
      scrollbarWidth: "none",
    },
    // Under a strip, nearer to it.
    variants: { below: { true: { paddingTop: "8px" } } },
  }),
  trayImage: css({
    borderRadius: "md",
    display: "block",
    height: "64px",
    objectFit: "cover",
    outline: "1px solid token(colors.border.default)",
    outlineOffset: "-1px",
    width: "64px",
  }),
  trayItem: css({ flexShrink: 0, position: "relative" }),
  trayRemove: css({
    alignItems: "center",
    bg: "media.shade",
    border: "2px solid token(colors.background.base)",
    borderRadius: "circle",
    color: "media.text",
    display: "flex",
    height: "24px",
    justifyContent: "center",
    padding: 0,
    position: "absolute",
    right: "-6px",
    top: "-6px",
    width: "24px",
  }),
  reactions: cva({
    base: { display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "-1px" },
    variants: { mine: { true: { justifyContent: "flex-end" } } },
  }),
  // A strip in the capsule, over the words.
  replying: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    padding: "4px 0 0 12px",
  }),
  tap: cva({
    base: {
      bg: "transparent",
      border: 0,
      color: "inherit",
      display: "flex",
      font: "inherit",
      maxWidth: "100%",
      // Lets the shared days' card shrink to the bubble's width.
      minWidth: 0,
      padding: 0,
      textAlign: "left",
    },
    variants: { mine: { true: { justifyContent: "flex-end" } } },
  }),
  time: css({
    color: "text.quaternary",
    flexShrink: 0,
    paddingBottom: "2px",
    textStyle: "caption2",
  }),
  // Its width without its height, so 編集済み stays by the bubble's foot.
  timeKept: css({
    display: "block",
    height: 0,
    overflow: "hidden",
    visibility: "hidden",
  }),
  // A blocked member's message folded to one line, in the app's own lines'
  // voice, opening on a tap.
  blocked: css({
    alignSelf: "flex-start",
    bg: "transparent",
    border: "1px dashed token(colors.border.strong)",
    borderRadius: "lg",
    color: "text.tertiary",
    display: "flex",
    gap: "8px",
    marginLeft: "40px",
    padding: "8px 12px",
    textStyle: "footnote",
  }),
  blockedShow: css({ color: "accent.default", fontWeight: 600 }),
  // A pinned line's pin, by its time.
  // Over the time, where LINE says 編集済み: that and a pinned line's pin
  // on one line, so the time never sits under a stack. Toward the bubble.
  timeNote: cva({
    base: { alignItems: "center", display: "flex", gap: "2px" },
    variants: { mine: { false: {}, true: { justifyContent: "flex-end" } } },
  }),
  title: css({
    display: "flex",
    flexDirection: "column",
    fontWeight: 600,
    margin: 0,
    minWidth: 0,
    textStyle: "headline",
  }),
  titleButton: css({
    _active: { opacity: 0.6 },
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "flex",
    flexDirection: "column",
    font: "inherit",
    minWidth: 0,
    padding: 0,
  }),
  // The name and the mute mark on one line, the count under it.
  titleLine: css({
    alignItems: "center",
    display: "flex",
    gap: "4px",
    justifyContent: "center",
    minWidth: 0,
  }),
  titleName: css({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  titleCount: css({
    color: "text.tertiary",
    fontWeight: 400,
    textAlign: "center",
    textStyle: "caption2",
  }),
  menu: css({ justifySelf: "end" }),
  when: css({
    alignSelf: "center",
    bg: "fill.tertiary",
    borderRadius: "sm",
    color: "text.tertiary",
    margin: "8px 0 2px",
    padding: "2px 12px",
    textStyle: "caption2",
  }),
};

// The size of the faces beside others' lines, as the chat apps draw them.
export const chatAvatarSize = 32;
