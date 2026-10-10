import { css, cva } from "styled-system/css";

// The look of the chats: the list of them in a group, and a chat's own
// screen, which the support chat (design-support-chat.tsx) shares.

// A chat in the hub's list: its name and last line, with the time and
// what is unread at the end.
export const chatRow = {
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
// it, and the reply being written above the composer.
export const chatStyle = {
  avatar: css({ flexShrink: 0, width: "32px" }),
  body: cva({
    base: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      maxWidth: "84%",
      minWidth: 0,
    },
    variants: { mine: { true: { alignItems: "flex-end" } } },
  }),
  // Round all over, but the first of a run, as LINE and WhatsApp draw
  // one: its top corner by the writer's side drawn in, by the face and
  // name the run starts with, so it says whose words follow.
  bubble: cva({
    base: {
      bg: "fill.tertiary",
      borderRadius: "lg",
      color: "text.primary",
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      overflow: "hidden",
    },
    compoundVariants: [
      {
        css: { borderTopLeftRadius: "sm" },
        first: true,
        mine: false,
      },
      {
        css: { borderTopRightRadius: "sm" },
        first: true,
        mine: true,
      },
    ],
    variants: {
      first: { true: {} },
      mine: {
        true: { bg: "accent.fill", color: "accent.onFill" },
      },
    },
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
  // The others to mention, over the composer, a few in sight and the rest
  // a scroll away.
  mentionList: css({
    borderTop: "1px solid token(colors.separator)",
    display: "flex",
    flexDirection: "column",
    listStyle: "none",
    marginBottom: 0,
    // Out to the screen's edges, so its line runs from edge to edge as a
    // bar's does on iOS and Android (a list's lines stay inset); its
    // contents stay where they were.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    marginTop: 0,
    maxHeight: "180px",
    overflowY: "auto",
    paddingBottom: "4px",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: "4px",
  }),
  mentionPick: css({
    _hover: { bg: "fill.tertiary" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "md",
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
  // Its buttons stay at the foot as the message grows, as in Messages.
  composer: cva({
    base: {
      alignItems: "flex-end",
      borderTop: "1px solid token(colors.separator)",
      display: "flex",
      gap: "8px",
      // Out to the screen's edges, so its line runs from edge to edge as a
      // bar's does on iOS and Android (a list's lines stay inset); its
      // contents stay where they were.
      marginLeft: "calc(-1 * var(--screen-left))",
      marginRight: "calc(-1 * var(--screen-right))",
      paddingBottom: "4px",
      paddingLeft: "var(--screen-left)",
      paddingRight: "var(--screen-right)",
      paddingTop: "8px",
    },
    // The reply above it already draws the line.
    variants: { replying: { true: { borderTop: 0 } } },
  }),
  composerButton: cva({
    base: {
      bg: "transparent",
      border: 0,
      borderRadius: "circle",
      color: "accent.default",
      display: "grid",
      flexShrink: 0,
      height: "38px",
      placeItems: "center",
      width: "38px",
    },
    variants: {
      // Lights up softly once there is something to send, and dims back
      // the same way.
      send: {
        true: {
          _disabled: { bg: "fill.primary" },
          bg: "accent.fill",
          color: "accent.onFill",
          transition: "background-color 0.15s ease-out, color 0.15s ease-out",
        },
      },
      // The tools at the start sit close together, as LINE's row of
      // icons does, leaving the room to the field.
      tool: { true: { borderRadius: "sm", width: "32px" } },
    },
  }),
  composerToolRow: css({ display: "flex" }),
  // A lone tool, as the support chat's photo button, which never folds.
  composerToolsStill: css({ display: "flex", flexShrink: 0 }),
  composerTools: css({
    display: "flex",
    flexShrink: 0,
    // The folding tools stay inside while they narrow.
    overflow: "hidden",
    position: "relative",
  }),
  // One line to start with, nearly as round-ended as the buttons beside
  // it (xl, the radius nearest half its height); it grows with the lines
  // written, up to five, and then scrolls.
  composerInput: css({
    "--lines": "5",
    "--pad-x": "16px",
    "--pad-y": "8px",
    bg: "fill.quaternary",
    borderRadius: "xl",
    color: "text.primary",
    flex: 1,
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
          "& :is([data-part=bubble], [data-part=day-card])": {
            _motionReduce: { animation: "none" },
            animation: "flash 1.2s ease-out",
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
  latest: css({ bottom: "12px", position: "absolute", right: "4px" }),
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
  // Three dots in a bubble of the others' kind, rising in turn.
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
    bg: "fill.tertiary",
    // A bubble at the start of the writer's run, by their face.
    borderRadius:
      "token(radii.sm) token(radii.lg) token(radii.lg) token(radii.lg)",
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
    padding: "12px 2px",
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
  photoButton: css({
    "&:has([role=status])": { cursor: "progress" },
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
  }),
  // A pale photo, like a paper roster, keeps its edge on the ground, and
  // inside a reply's bubble the same, so it reads as the photo it is.
  photoImage: css({
    bg: "fill.tertiary",
    borderRadius: "lg",
    display: "block",
    height: "auto",
    maxWidth: "100%",
    objectFit: "cover",
    outline: "1px solid token(colors.border.default)",
    outlineOffset: "-1px",
  }),
  // In a reply's bubble, under the quote, a little in from its edge, as
  // WhatsApp sets one.
  photoInBubble: css({ margin: "8px 4px 4px" }),
  // A photo going up: dimmed, with a ring filling as it goes, as LINE
  // draws one.
  uploading: css({
    alignItems: "center",
    bg: "media.dim",
    borderRadius: "lg",
    display: "flex",
    inset: 0,
    justifyContent: "center",
    position: "absolute",
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
    height: "36px",
    transform: "rotate(-90deg)",
    width: "36px",
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
  // Photos chosen to send, in a row above the composer, each with its ×.
  tray: cva({
    base: {
      borderTop: "1px solid token(colors.separator)",
      display: "flex",
      gap: "8px",
      listStyle: "none",
      marginBottom: 0,
      // Out to the screen's edges, so its line runs from edge to edge as a
      // bar's does on iOS and Android (a list's lines stay inset); its
      // contents stay where they were.
      marginLeft: "calc(-1 * var(--screen-left))",
      marginRight: "calc(-1 * var(--screen-right))",
      marginTop: 0,
      paddingBottom: "4px",
      paddingLeft: "var(--screen-left)",
      paddingRight: "var(--screen-right)",
      paddingTop: "12px",
    },
    // The reply or the days above already draw the line.
    variants: { below: { true: { borderTop: 0, paddingTop: "8px" } } },
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
  replying: css({
    alignItems: "center",
    borderTop: "1px solid token(colors.separator)",
    display: "flex",
    gap: "8px",
    // Out to the screen's edges, so its line runs from edge to edge as a
    // bar's does on iOS and Android (a list's lines stay inset); its
    // contents stay where they were.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: "8px",
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
