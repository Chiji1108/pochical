import { Popover, Portal } from "@ark-ui/react";
import {
  Bell,
  BellOff,
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Copy,
  Download,
  Ellipsis,
  Flag,
  ImageIcon,
  Link,
  Pencil,
  Pin,
  PinOff,
  Link2Off,
  Plus,
  Reply,
  RotateCcw,
  SendHorizontal,
  Check,
  Undo2,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import {
  firstLink,
  inviteCodeOf,
  mentionsOf,
  plainText,
  siteOf,
  textParts,
  withMentions,
} from "../lib/chat-text";
import { dateKey, formatDay } from "../lib/design-days";
import type { Photo } from "../lib/design-sample-photos";
import { useUser } from "../lib/design-user-store";
import { spring } from "../lib/motion";
import { EmojiPickerSheet } from "./design-emoji-picker";
import {
  everyoneOff,
  patternOn,
  previewOf,
  reactionChoices,
  weekdayLabels,
} from "./design-group-data";
import type {
  Chat,
  Group,
  GroupMark,
  LinkPreview,
  Member,
  Message,
  Reaction,
} from "./design-group-data";
import {
  Avatar,
  GroupIcon,
  Mark,
  badge,
  cornerMonth,
  memberButton,
  photoPicker,
  smallWeekday,
  toneColor,
} from "./design-group-parts";
import { profileIn } from "./design-group-settings";
import { DaySheet } from "./design-group-shifts";
import { ReportSheet } from "./design-report";
import {
  ConfirmDialog,
  PhoneContext,
  PhotoViewer,
  Sheet,
} from "./design-sheet";
import { ToastContext } from "./design-toast";
import {
  BackButton,
  IconButton,
  IconMenu,
  LimitedTextArea,
  List,
  ListRow,
  listRow,
  MenuItem,
  MenuSeparator,
  menuStyle,
  Screen,
  srOnly,
  Tag,
} from "./design-ui";
import { useWeek } from "./design-week";

// A group's chats: the messages, replies and reactions, photos going
// up, and shared days shown in a message.

export type PhotoSend = "ok" | "fails";

const noMembers: Member[] = [];

// A member's name by id, for a mention: @ and their name in the group,
// yours too (the others see it), not 自分.
const nameIn = (members: Member[], yours: string) => (id: string) => {
  const member = members.find((other) => other.id === id);
  return member?.me ? yours : (member?.name ?? "メンバー");
};

// Your name in the group, as the others read it.
function useYourName(group: Omit<Group, "members">) {
  return profileIn(
    group,
    useUser((state) => state.profile)
  ).name;
}

function lastLine(
  chat: Chat,
  members: Member[],
  yours: string,
  blocked: string[]
) {
  const last = chat.messages.at(-1);
  if (!last) {
    return;
  }
  const who = members.find((member) => member.id === last.from);
  if (last.notice) {
    return last.notice;
  }
  if (last.unsent) {
    return unsentLine(who);
  }
  if (blocked.includes(last.from)) {
    return blockedLine;
  }
  let text = summaryOf(last, nameIn(members, yours));
  if (last.days) {
    text = `${text}を共有しました`;
  } else if (last.photo) {
    text = "写真を送りました";
  }
  return who?.me ? `自分：${text}` : text;
}

// A chat in the hub's list: its name and last line, with the time and
// what is unread at the end.
const chatRow = {
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
const chatStyle = {
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
  bubble: cva({
    base: {
      bg: "fill.tertiary",
      borderRadius:
        "token(radii.lg) token(radii.lg) token(radii.lg) token(radii.sm)",
      color: "text.primary",
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      overflow: "hidden",
    },
    variants: {
      mine: {
        true: {
          bg: "accent.fill",
          borderRadius: "token(radii.lg) token(radii.lg) token(radii.sm)",
          color: "accent.onFill",
        },
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
    textStyle: "subheadline",
    whiteSpace: "pre-wrap",
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
    margin: 0,
    maxHeight: "180px",
    overflowY: "auto",
    padding: "4px 0",
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
      padding: "8px 0 4px",
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
    gridTemplateColumns: "1fr auto 1fr",
    padding: "4px 0 8px",
  }),
  // A message jumped to rings its bubble or shared days for a moment.
  item: cva({
    base: { display: "flex", flexDirection: "column", gap: "8px" },
    variants: {
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
    margin: "4px 0",
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
    borderRadius:
      "token(radii.lg) token(radii.lg) token(radii.lg) token(radii.sm)",
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
    gap: "8px",
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
  photoImage: cva({
    base: {
      bg: "fill.tertiary",
      display: "block",
      height: "auto",
      maxWidth: "100%",
      objectFit: "cover",
    },
    variants: {
      quoted: {
        // A pale photo, like a paper roster, keeps its edge on the ground.
        false: {
          borderRadius: "lg",
          outline: "1px solid token(colors.border.default)",
          outlineOffset: "-1px",
        },
        // Inside a reply's bubble, below the quote's rule, edge to edge.
        true: {},
      },
    },
  }),
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
      margin: 0,
      padding: "12px 0 4px",
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
    padding: "8px 0 0",
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
  pinMark: css({ display: "block", marginLeft: "auto" }),
  // Over the time, where LINE says 編集済み.
  edited: css({ display: "block" }),
  title: css({
    alignItems: "center",
    display: "flex",
    fontWeight: 600,
    gap: "4px",
    margin: 0,
    textStyle: "headline",
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

// A chat whose notifications are off, after its name in the list and in
// its own header, as chat apps mark a muted room.
const mutedMark = css({ color: "text.tertiary", flexShrink: 0 });

function MutedMark() {
  return (
    <BellOff aria-label="通知オフ" className={mutedMark} role="img" size={14} />
  );
}

export function ChatRow({
  label,
  icon,
  chat,
  group,
  onOpen,
  muted = false,
}: {
  label: string;
  icon: ReactNode;
  chat: Chat;
  group: Group;
  onOpen: () => void;
  muted?: boolean;
}) {
  const preview = lastLine(
    chat,
    group.members,
    useYourName(group),
    useUser((state) => state.blocked)
  );
  const last = chat.messages.at(-1);
  // An unread line mentions you: an @ beside the count, as Telegram marks
  // one, so it is found among chats whose notifications are off.
  const mentioned = chat.messages
    .slice(chat.messages.length - chat.unread)
    .some((message) => mentionsOf(message.text ?? "").includes("me"));
  return (
    <button
      className={cx(listRow.twoLine, listRow.pressable)}
      data-list-row=""
      onClick={onOpen}
      type="button"
    >
      {icon}
      <span className={chatRow.text}>
        <span className={chatRow.name}>
          {label}
          {muted && <MutedMark />}
        </span>
        <small className={chatRow.preview}>
          {preview ?? "まだメッセージはありません"}
        </small>
      </span>
      <span className={chatRow.meta}>
        {last && <small className={chatRow.time}>{last.time}</small>}
        {chat.unread > 0 && (
          <span className={chatRow.badges}>
            {mentioned && (
              <span className={chatRow.mention}>
                @<span className={srOnly}>自分へのメンションあり、</span>
              </span>
            )}
            <span className={badge} role="status">
              {chat.unread}
              <span className={srOnly}>件の未読</span>
            </span>
          </span>
        )}
      </span>
    </button>
  );
}

// The room kept above a shared day a chat opens on: the lines' gap, so
// the line before it sits just out of view instead of peeking in as a
// sliver under the header.
const sharedRoom = 8;

// The group an invitation link in a message opens, as the server's
// InviteService gives it, and whether you are in it already.
export type InviteLook = {
  name: string;
  mark: GroupMark;
  members: number;
  joined: boolean;
};

export function ChatPage({
  inviteOf,
  onInvite,
  title,
  group,
  people,
  chat,
  onBack,
  onChange,
  onOpenDay,
  onMember,
  backLabel,
  formerMembers = noMembers,
  attach,
  photoSend = "ok",
  sharedFirst = false,
  unreadAtOpen = 0,
  muted = false,
  onMuted,
  onShifts,
}: {
  // What an invitation link's code opens; undefined once it no longer
  // works. Asked as a message shows, not sent with it, so a remade link's
  // card turns unusable for everyone (spec/chat.md).
  inviteOf: (code: string) => InviteLook | undefined;
  // Opens an invitation link in the app: its group's join screen, or the
  // group itself when you are in it.
  onInvite: (code: string) => void;
  // The group chat's menu opens everyone's shifts, to look up a day while
  // talking it over.
  onShifts?: () => void;
  title: string;
  // Its notifications turned off, from the menu at its top right, as
  // LINE's rooms have it.
  muted?: boolean;
  onMuted?: (muted: boolean) => void;
  group: Group;
  // Whether photos' uploads go through or fail.
  photoSend?: PhotoSend;
  // Opens on the last day shared rather than the latest line, as the top
  // page shows it.
  sharedFirst?: boolean;
  // How many lines were unread as it opened: it opens on the first of
  // them, under ここから新着.
  unreadAtOpen?: number;
  // Days brought from the shift table, waiting above the composer.
  attach?: Date[];
  // Where 戻る goes: the group, or the chat a member was opened from.
  backLabel: string;
  // Members taken out of the group, so their past lines keep a face.
  formerMembers?: Member[];
  // Opens a member's profile from their picture.
  onMember?: (member: Member) => void;
  // Who a shared day shows: everyone, or the two people in a direct chat.
  people: Member[];
  chat: Chat;
  onBack: () => void;
  onChange: (messages: Message[]) => void;
  onOpenDay: (date: Date) => void;
}) {
  const [draft, setDraft] = useState("");
  // Your message being changed in the composer, and the one being taken
  // back, asked about first.
  const [editing, setEditing] = useState<string>();
  const [unsending, setUnsending] = useState<string>();
  // Someone else's message being reported, and blocked members' messages
  // shown for now.
  const [reporting, setReporting] = useState<string>();
  const [revealed, setRevealed] = useState<string[]>([]);
  const blocked = useUser((state) => state.blocked);
  const formRef = useRef<HTMLFormElement>(null);
  // Members picked from the @ list, made mentions as the message is sent.
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);
  const [attached, setAttached] = useState(attach);
  const linkPreview = useLinkPreview(draft);
  // Photos chosen to go with the next send, as the chat apps hold them
  // above the composer: nothing is sent on choosing.
  const [photos, setPhotos] = useState<Photo[]>([]);
  // Photos chosen but still being read; sending waits for them, so none
  // lands in the composer after the message has gone.
  const [reading, setReading] = useState(0);
  // While the field is in use, the tools fold into a ›, as in LINE,
  // giving it their room: from the moment it is tapped, and while words
  // wait in it. › opens them until the next letter.
  const [writing, setWriting] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsFolded = (writing || draft !== "") && !toolsOpen;
  let toolsWidth = toolsFolded ? toolWidth : toolWidth * toolCount;
  // A message being changed keeps what it carries; only its words change.
  if (editing !== undefined) {
    toolsWidth = 0;
  }
  const photoInputRef = useRef<HTMLInputElement>(null);
  const toast = useContext(ToastContext);
  // Photos of yours still uploading, or that could not be sent, by line.
  // Only this phone knows them, as the apps keep them in their outbox;
  // the group sees a photo once it is up.
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const [failedOpen, setFailedOpen] = useState<string>();
  const uploadTimers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const timer of uploadTimers.current) {
        window.clearTimeout(timer);
      }
    },
    []
  );
  const upload = (ids: string[]) => {
    const set = (status?: Upload) => {
      setUploads((before) => {
        const others = Object.entries(before).filter(
          ([id]) => !ids.includes(id)
        );
        const these = status ? ids.map((id) => [id, status] as const) : [];
        return Object.fromEntries([...others, ...these]);
      });
    };
    set("sending");
    uploadTimers.current.push(
      window.setTimeout(() => {
        set(photoSend === "fails" ? "failed" : undefined);
      }, uploadMilliseconds)
    );
  };
  const [sharing, setSharing] = useState(false);
  // The line whose actions are open, and the one being answered.
  const [selected, setSelected] = useState<string>();
  const [replyTo, setReplyTo] = useState<string>();
  // The line whose reaction is being picked from every emoji.
  const [pickingFor, setPickingFor] = useState<string>();
  const [flash, setFlash] = useState<string>();
  // As chat apps do, a chat opens on its latest line and follows each
  // new one, like a day just shared from the shift table, and a photo's
  // failure note under the lines just sent.
  const listRef = useRef<HTMLOListElement>(null);
  const lineCount = chat.messages.length;
  const [sharedId] = useState(() =>
    sharedFirst
      ? chat.messages.findLast((message) => message.days)?.id
      : undefined
  );
  // The first line unread as it opened: the others' lines, counted back
  // from the latest. The line above it stays while the chat is open, as
  // LINE keeps its 「ここから未読メッセージ」.
  const [firstUnreadId] = useState(() => {
    let left = unreadAtOpen;
    for (const message of chat.messages.toReversed()) {
      if (left > 0 && message.from !== "me" && !message.notice) {
        left -= 1;
        if (left === 0) {
          return message.id;
        }
      }
    }
    return;
  });
  // Until a line is added, it stays on the shared day, or on the line
  // above the first unread one.
  const [openedLines] = useState(lineCount);
  const failedCount = Object.values(uploads).filter(
    (status) => status === "failed"
  ).length;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || lineCount + failedCount === 0) {
      return;
    }
    let target: string | undefined;
    if (sharedId !== undefined) {
      target = `#message-${sharedId}`;
    } else if (firstUnreadId !== undefined) {
      target = "#unread-line";
    }
    const shared =
      target === undefined || lineCount !== openedLines
        ? null
        : list.querySelector<HTMLElement>(target);
    list.scrollTop = shared
      ? shared.getBoundingClientRect().top -
        list.getBoundingClientRect().top +
        list.scrollTop -
        sharedRoom
      : list.scrollHeight;
  }, [lineCount, failedCount, openedLines, sharedId, firstUnreadId]);
  // When what sits over the composer (a reply, days, photos) takes room,
  // the lines keep their bottom edge, as in the chat apps, so the latest
  // line is not hidden under it. When it goes, the room shows more below.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    let height = list.clientHeight;
    const observer = new ResizeObserver(() => {
      if (list.clientHeight < height) {
        list.scrollTop += height - list.clientHeight;
      }
      height = list.clientHeight;
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
    };
  }, []);
  const isGroup = title === "全体チャット";
  // Someone writing back, shown under the latest line: in the prototype,
  // whoever spoke last before you, for a few seconds after you send. The
  // apps show it from the typing frames (spec/sync-protocol.md).
  const [typingId, setTypingId] = useState<string>();
  const typingTimers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const timer of typingTimers.current) {
        window.clearTimeout(timer);
      }
    },
    []
  );
  const typingMember = group.members.find(
    (member) => member.id === typingId && !member.me
  );
  const answerSoon = () => {
    const last = chat.messages.findLast(
      (message) => message.from !== "me" && !message.notice && !message.unsent
    );
    if (!last || blocked.includes(last.from)) {
      return;
    }
    typingTimers.current.push(
      window.setTimeout(() => {
        setTypingId(last.from);
      }, typingStartMs),
      window.setTimeout(() => {
        setTypingId(undefined);
      }, typingStartMs + typingMs)
    );
  };
  // ↓ to the latest line, once the chat is scrolled up from it.
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  // The dots come in under the latest line in sight, as a new line does,
  // unless the chat is scrolled up away from it.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && typingId !== undefined && !awayFromLatest) {
      list.scrollTop = list.scrollHeight;
    }
  }, [typingId, awayFromLatest]);
  // An @ being written at the end of the message, in the group chat, lists
  // the others whose name has what follows it, as LINE does; one picked
  // goes in as @name and a space.
  const mentionQuery = isGroup
    ? MENTION_QUERY.exec(draft)?.groups?.query
    : undefined;
  const mentionable =
    mentionQuery === undefined
      ? []
      : group.members.filter(
          (member) => !member.me && member.name.includes(mentionQuery)
        );
  const pickMention = (member: Member) => {
    setDraft(draft.replace(MENTION_QUERY, `@${member.name} `));
    setPicked((before) => [
      ...before.filter((other) => other.id !== member.id),
      { id: member.id, name: member.name },
    ]);
  };
  // Who wrote a line, including members taken out since, whose lines stay.
  const writerOf = (id?: string) =>
    [...group.members, ...formerMembers].find((member) => member.id === id);
  const byId = (id?: string) =>
    chat.messages.find((message) => message.id === id);
  const nameOf = (id: string) => writerOf(id)?.name ?? "";
  const mentionName = nameIn(
    [...group.members, ...formerMembers],
    useYourName(group)
  );
  // Sends one line or several at once, the first answering the line
  // being replied to.
  const post = (...lines: Omit<Message, "id" | "from" | "when" | "time">[]) => {
    const sent = lines.map((line, index) => ({
      ...line,
      from: "me",
      id: `sent-${chat.messages.length + index}`,
      replyTo: index === 0 ? replyTo : undefined,
      time: "10:10",
      when: "今日",
    }));
    onChange([...chat.messages, ...sent]);
    setReplyTo(undefined);
    answerSoon();
    const photoIds = sent.flatMap((line) => (line.photo ? [line.id] : []));
    if (photoIds.length > 0) {
      upload(photoIds);
    }
  };
  // The attached days go first, then each photo as a line of its own,
  // then what was written, if anything.
  // Puts your message's words back in the composer to change them, its
  // mentions as @name again.
  const startEditing = (message: Message) => {
    const text = message.text ?? "";
    setEditing(message.id);
    setReplyTo(undefined);
    setDraft(plainText(text, mentionName));
    setPicked(mentionsOf(text).map((id) => ({ id, name: mentionName(id) })));
    formRef.current?.querySelector("textarea")?.focus();
  };
  const stopEditing = () => {
    setEditing(undefined);
    setDraft("");
    setPicked([]);
    linkPreview.reset();
  };
  // The changed words replace the old ones, marked 編集済み; the page of
  // its link stays while the link does.
  const saveEdit = (id: string, text: string) => {
    onChange(
      chat.messages.map((message) => {
        if (message.id !== id) {
          return message;
        }
        const words = withMentions(text, picked);
        const sameLink =
          firstLink(words) === firstLink(message.text ?? "") &&
          message.link !== undefined;
        return {
          ...message,
          edited: true,
          link: sameLink ? message.link : linkPreview.ready,
          text: words,
        };
      })
    );
    stopEditing();
  };
  // Pinned lines, the latest first; at most a few, as LINE keeps its
  // announcements, the oldest giving way.
  const pins = chat.messages
    .filter((message) => message.pinned !== undefined && !message.unsent)
    .toSorted((a, b) => (b.pinned ?? 0) - (a.pinned ?? 0));
  const [pinsOpen, setPinsOpen] = useState(false);
  const pin = (id: string, pinned: boolean) => {
    const order = Math.max(0, ...pins.map((line) => line.pinned ?? 0)) + 1;
    const dropped =
      pinned && pins.length >= maxPins ? pins.at(-1)?.id : undefined;
    onChange(
      chat.messages.map((message) => {
        if (message.id === id) {
          return { ...message, pinned: pinned ? order : undefined };
        }
        if (message.id === dropped) {
          return { ...message, pinned: undefined };
        }
        return message;
      })
    );
    if (dropped) {
      toast(`ピン留めは${maxPins}件までです。いちばん古いものを外しました`);
    } else {
      toast(pinned ? "ピン留めしました" : "ピン留めを外しました");
    }
  };
  const unsend = (id: string) => {
    onChange(
      chat.messages.map((message) =>
        message.id === id
          ? {
              from: message.from,
              id: message.id,
              time: message.time,
              unsent: true,
              when: message.when,
            }
          : message
      )
    );
    setUnsending(undefined);
    if (editing === id) {
      stopEditing();
    }
  };
  const send = () => {
    const text = draft.trim();
    if (editing !== undefined) {
      if (text) {
        saveEdit(editing, text);
      }
      return;
    }
    if (reading > 0 || (!text && !attached && photos.length === 0)) {
      return;
    }
    post(
      ...(attached ? [{ days: attached }] : []),
      ...photos.map((photo) => ({ photo })),
      ...(text
        ? [{ link: linkPreview.ready, text: withMentions(text, picked) }]
        : [])
    );
    setDraft("");
    setPicked([]);
    linkPreview.reset();
    setAttached(undefined);
    setPhotos([]);
  };
  const choosePhotos = async (files: File[]) => {
    const room = maxPhotos - photos.length;
    if (files.length > room) {
      toast(`写真は一度に${maxPhotos}枚まで送れます`, "problem");
    }
    const taken = files.slice(0, room);
    setReading((count) => count + taken.length);
    // One photo that cannot be opened leaves the others chosen.
    const results = await Promise.allSettled(taken.map(photoOf));
    setReading((count) => count - taken.length);
    const chosen = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    setPhotos((before) => [...before, ...chosen].slice(0, maxPhotos));
    if (chosen.length < taken.length) {
      toast("開けない写真がありました", "problem");
    }
  };
  const react = (id: string, emoji: string) => {
    onChange(
      chat.messages.map((message) =>
        message.id === id ? toggleReaction(message, emoji) : message
      )
    );
    setSelected(undefined);
  };
  const jumpTo = (id: string) => {
    document
      .getElementById(`message-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    setTimeout(() => {
      setFlash(undefined);
    }, flashMilliseconds);
  };
  // The props that turn a message into the opener of its actions.
  const actionsOf = (message: Message) => ({
    link: message.text ? firstLink(message.text) : undefined,
    mine: message.from === "me",
    onEdit:
      message.from === "me" && message.text !== undefined
        ? () => {
            startEditing(message);
          }
        : undefined,
    onMore: () => {
      setSelected(undefined);
      setPickingFor(message.id);
    },
    onOpenChange: (open: boolean) => {
      setSelected(open ? message.id : undefined);
    },
    onPin:
      message.notice || message.unsent
        ? undefined
        : () => {
            pin(message.id, message.pinned === undefined);
          },
    onReact: (emoji: string) => {
      react(message.id, emoji);
    },
    onReply: () => {
      if (editing !== undefined) {
        stopEditing();
      }
      setReplyTo(message.id);
      setSelected(undefined);
    },
    onReport:
      message.from === "me"
        ? undefined
        : () => {
            setReporting(message.id);
          },
    onUnsend:
      message.from === "me"
        ? () => {
            setUnsending(message.id);
          }
        : undefined,
    open: selected === message.id,
    pinned: message.pinned !== undefined,
    text:
      message.text === undefined
        ? undefined
        : plainText(message.text, mentionName),
  });
  const replying = byId(replyTo);
  const editingMessage = byId(editing);
  // One line of the chat as it is drawn: a message, or one of the app's.
  const lineOf = (message: Message, index: number) => {
    const previous = chat.messages[index - 1];
    const member = writerOf(message.from);
    const current = member !== undefined && group.members.includes(member);
    const mine = member?.me === true;
    const firstOfRun =
      previous?.from !== message.from ||
      previous.notice !== undefined ||
      previous.unsent === true ||
      message.replyTo !== undefined;
    // A message whose first link is an invitation shows its group
    // instead of a page.
    const firstUrl = message.text ? firstLink(message.text) : undefined;
    const inviteCode = firstUrl ? inviteCodeOf(firstUrl) : undefined;
    const quoted = byId(message.replyTo);
    const quote = quoted && (
      <BubbleQuote
        name={nameOf(quoted.from)}
        nameOf={mentionName}
        onJump={() => {
          jumpTo(quoted.id);
        }}
        quoted={quoted}
      />
    );
    // A line taken back says so in the middle, as the app's own
    // lines do, and keeps its place for a reply that quoted it.
    if (message.notice || message.unsent) {
      return (
        <li
          className={chatStyle.item()}
          id={`message-${message.id}`}
          key={message.id}
        >
          {previous?.when !== message.when && (
            <span className={chatStyle.when}>{message.when}</span>
          )}
          <p className={chatStyle.notice}>
            {message.notice ?? unsentLine(member)}
          </p>
        </li>
      );
    }
    if (blocked.includes(message.from) && !revealed.includes(message.id)) {
      return (
        <li className={chatStyle.item()} key={message.id}>
          {previous?.when !== message.when && (
            <span className={chatStyle.when}>{message.when}</span>
          )}
          <button
            className={chatStyle.blocked}
            onClick={() => {
              setRevealed((before) => [...before, message.id]);
            }}
            type="button"
          >
            {blockedLine}
            <span className={chatStyle.blockedShow}>表示</span>
          </button>
        </li>
      );
    }
    return (
      <li
        className={chatStyle.item({ flash: flash === message.id })}
        id={`message-${message.id}`}
        key={message.id}
      >
        {previous?.when !== message.when && (
          <span className={chatStyle.when}>{message.when}</span>
        )}
        <span className={chatStyle.message({ mine })}>
          {!mine && (
            <span className={chatStyle.avatar}>
              {firstOfRun &&
                member &&
                (onMember && current ? (
                  <button
                    aria-label={`${member.name}のプロフィール`}
                    className={memberButton}
                    onClick={() => {
                      onMember(member);
                    }}
                    type="button"
                  >
                    <Avatar member={member} size={chatAvatarSize} />
                  </button>
                ) : (
                  <Avatar member={member} size={chatAvatarSize} />
                ))}
            </span>
          )}
          <span className={chatStyle.body({ mine })}>
            {!mine && isGroup && firstOfRun && (
              <small className={chatStyle.name}>{member?.name}</small>
            )}
            <span
              className={cx(
                chatStyle.bubbleRow({ mine }),
                selected === message.id && messageActions.lifted
              )}
            >
              {message.photo && (
                <PhotoLine
                  actions={actionsOf(message)}
                  upload={uploads[message.id]}
                  label={`${member?.name ?? ""}が送った写真`}
                  onSave={() => {
                    toast("写真を保存しました");
                  }}
                  photo={message.photo}
                  quote={quote}
                />
              )}
              {!message.photo && message.days && (
                <MessageActions {...actionsOf(message)}>
                  <button
                    aria-label={`${member?.name ?? ""}が共有した日にち。押すとリアクションと返信`}
                    className={chatStyle.tap({ mine })}
                    type="button"
                  >
                    <DayCard days={message.days} members={people} />
                  </button>
                </MessageActions>
              )}
              {!message.photo && !message.days && (
                // Like the app: the quoted line sits inside the bubble,
                // above a thin rule, and jumps to the original.
                <span
                  className={cx(
                    chatStyle.bubble({ mine }),
                    (inviteCode || message.link) && chatStyle.linked
                  )}
                  data-part="bubble"
                >
                  {quote}
                  <MessageActions {...actionsOf(message)}>
                    <button
                      aria-label={`${member?.name ?? ""}のメッセージ：${plainText(message.text ?? "", mentionName)}。押すとリアクションと返信`}
                      className={chatStyle.bubbleText}
                      // A tap on a link opens it rather than the
                      // actions, as in the chat apps.
                      onClickCapture={(event) => {
                        const url = linkAt(event.target);
                        if (url) {
                          event.preventDefault();
                          const code = inviteCodeOf(url);
                          if (code) {
                            onInvite(code);
                          } else {
                            openLink(url);
                          }
                          return;
                        }
                        // A mention opens that member's profile, as
                        // their picture does.
                        const mentioned = group.members.find(
                          (other) =>
                            !other.me && other.id === mentionAt(event.target)
                        );
                        if (mentioned && onMember) {
                          event.preventDefault();
                          onMember(mentioned);
                        }
                      }}
                      type="button"
                    >
                      <MessageText
                        mine={mine}
                        nameOf={mentionName}
                        text={message.text}
                      />
                    </button>
                  </MessageActions>
                  {inviteCode && (
                    <InviteCard
                      invite={inviteOf(inviteCode)}
                      onLongPress={() => {
                        setSelected(message.id);
                      }}
                      onOpen={() => {
                        onInvite(inviteCode);
                      }}
                    />
                  )}
                  {!inviteCode && message.link && (
                    <LinkCard
                      onLongPress={() => {
                        setSelected(message.id);
                      }}
                      preview={message.link}
                    />
                  )}
                </span>
              )}
              {uploads[message.id] === "failed" && (
                <button
                  aria-label="送れませんでした。押すと再送か削除"
                  className={chatStyle.failed}
                  onClick={() => {
                    setFailedOpen(message.id);
                  }}
                  type="button"
                >
                  <CircleAlert aria-hidden="true" size={22} />
                </button>
              )}
              {uploads[message.id] === undefined && (
                <small className={chatStyle.time}>
                  {message.pinned !== undefined && (
                    <Pin
                      aria-label="ピン留め中"
                      className={chatStyle.pinMark}
                      role="img"
                      size={11}
                    />
                  )}
                  {message.edited && (
                    <span className={chatStyle.edited}>編集済み</span>
                  )}
                  {message.time}
                </small>
              )}
            </span>
            {uploads[message.id] === "failed" && (
              <small className={chatStyle.failedNote}>送れませんでした</small>
            )}
            {message.days && (
              <button
                className={chatStyle.dayOpen({ mine })}
                onClick={() => message.days && onOpenDay(message.days[0])}
                type="button"
              >
                シフト表で見る
              </button>
            )}
            {message.reactions && message.reactions.length > 0 && (
              <span className={chatStyle.reactions({ mine })}>
                {message.reactions.map((reaction) => (
                  <ReactionPill
                    key={reaction.emoji}
                    onToggle={() => {
                      react(message.id, reaction.emoji);
                    }}
                    people={reaction.by.flatMap((id) => writerOf(id) ?? [])}
                    reaction={reaction}
                  />
                ))}
              </span>
            )}
          </span>
        </span>
      </li>
    );
  };
  return (
    <Screen>
      <header className={chatStyle.header}>
        <BackButton onClick={onBack}>{backLabel}</BackButton>
        <h3 className={chatStyle.title}>
          {title}
          {muted && <MutedMark />}
        </h3>
        {onMuted && (
          <IconMenu
            className={chatStyle.menu}
            icon={<Ellipsis aria-hidden="true" size={20} />}
            label="チャットのメニュー"
          >
            {onShifts && (
              <>
                <MenuItem
                  icon={<CalendarDays aria-hidden="true" size={18} />}
                  onSelect={onShifts}
                  value="shifts"
                >
                  みんなのシフト
                </MenuItem>
                <MenuSeparator />
              </>
            )}
            <MenuItem
              icon={
                muted ? (
                  <Bell aria-hidden="true" size={18} />
                ) : (
                  <BellOff aria-hidden="true" size={18} />
                )
              }
              onSelect={() => {
                onMuted(!muted);
              }}
              value="notifications"
            >
              {muted ? "通知をオンにする" : "通知をオフにする"}
            </MenuItem>
          </IconMenu>
        )}
      </header>
      {pins[0] && (
        <PinBar
          nameOf={mentionName}
          onJump={(id) => {
            setPinsOpen(false);
            jumpTo(id);
          }}
          onOpenChange={setPinsOpen}
          onUnpin={(id) => {
            pin(id, false);
          }}
          open={pinsOpen}
          pins={pins}
        />
      )}
      <div className={chatStyle.lines}>
        <ol
          aria-label={`${title}のメッセージ`}
          className={chatStyle.messages}
          onScroll={(event) => {
            const list = event.currentTarget;
            setAwayFromLatest(
              list.scrollHeight - list.scrollTop - list.clientHeight >
                list.clientHeight / 2
            );
          }}
          ref={listRef}
        >
          {chat.messages.length === 0 && (
            <li className={chatStyle.empty}>まだメッセージはありません</li>
          )}
          {chat.messages.map((message, index) => (
            <Fragment key={message.id}>
              {message.id === firstUnreadId && (
                <li className={chatStyle.unread} id="unread-line">
                  <span>ここから新着</span>
                </li>
              )}
              {lineOf(message, index)}
            </Fragment>
          ))}
          {typingMember && (
            <li className={chatStyle.item()}>
              <span className={chatStyle.message({ mine: false })}>
                <span className={chatStyle.avatar}>
                  <Avatar member={typingMember} size={chatAvatarSize} />
                </span>
                <span
                  aria-label={`${typingMember.name}が入力中`}
                  className={chatStyle.typing}
                  role="status"
                >
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            </li>
          )}
        </ol>
        {awayFromLatest && (
          <IconButton
            className={chatStyle.latest}
            label="最新のメッセージへ"
            onClick={() => {
              listRef.current?.scrollTo({
                behavior: "smooth",
                top: listRef.current.scrollHeight,
              });
            }}
          >
            <ChevronDown aria-hidden="true" size={20} />
          </IconButton>
        )}
      </div>
      {editingMessage && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>メッセージを編集</span>
            <span className={chatStyle.quoteText}>
              {summaryOf(editingMessage, mentionName)}
            </span>
          </span>
          <IconButton glass={false} label="編集をやめる" onClick={stopEditing}>
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      {replying && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>
              {nameOf(replying.from)}に返信
            </span>
            <span className={chatStyle.quoteText}>
              {summaryOf(replying, mentionName)}
            </span>
          </span>
          {replying.photo && (
            <img
              alt=""
              className={chatStyle.quoteThumb}
              src={replying.photo.src}
            />
          )}
          <IconButton
            glass={false}
            label="返信をやめる"
            onClick={() => {
              setReplyTo(undefined);
            }}
          >
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      {attached && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>共有する日</span>
            <span className={chatStyle.quoteText}>{daysSummary(attached)}</span>
          </span>
          <IconButton
            glass={false}
            label="共有をやめる"
            onClick={() => {
              setAttached(undefined);
            }}
          >
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      {linkPreview.shown && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>
              {linkPreview.ready?.site ?? siteOf(linkPreview.shown)}
            </span>
            <span className={chatStyle.quoteText}>
              {linkPreview.ready?.title ?? "読み込み中…"}
            </span>
          </span>
          {linkPreview.ready?.image && (
            <img
              alt=""
              className={chatStyle.quoteThumb}
              src={linkPreview.ready.image}
            />
          )}
          <IconButton
            glass={false}
            label="リンクのプレビューを付けない"
            onClick={linkPreview.handleSkip}
          >
            <X aria-hidden="true" size={16} />
          </IconButton>
        </div>
      )}
      {photos.length > 0 && (
        <ul
          aria-label="送る写真"
          className={chatStyle.tray({
            below:
              replying !== undefined ||
              attached !== undefined ||
              linkPreview.shown !== undefined,
          })}
        >
          {photos.map((photo, index) => (
            <li className={chatStyle.trayItem} key={photo.src}>
              <img alt="" className={chatStyle.trayImage} src={photo.src} />
              <button
                aria-label={`${index + 1}枚目の写真を外す`}
                className={chatStyle.trayRemove}
                onClick={() => {
                  setPhotos((before) =>
                    before.filter((other) => other !== photo)
                  );
                }}
                type="button"
              >
                <X aria-hidden="true" size={12} strokeWidth={3} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {mentionable.length > 0 && (
        <ul aria-label="メンションする人" className={chatStyle.mentionList}>
          {mentionable.map((member) => (
            <li key={member.id}>
              <button
                className={chatStyle.mentionPick}
                onClick={() => {
                  pickMention(member);
                }}
                // The field keeps focus, and the keyboard stays up.
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                type="button"
              >
                <Avatar member={member} size={28} />
                {member.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={chatStyle.composer({
          replying:
            editing !== undefined ||
            replying !== undefined ||
            attached !== undefined ||
            linkPreview.shown !== undefined ||
            photos.length > 0 ||
            mentionable.length > 0,
        })}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        ref={formRef}
      >
        {/* The system's photo picker, as the apps open PHPicker and
            Android's photo picker; the camera is left to the camera. */}
        <input
          accept="image/*"
          className={srOnly}
          multiple
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            choosePhotos(files).catch(() => undefined);
          }}
          ref={photoInputRef}
          tabIndex={-1}
          type="file"
        />
        {/* The tools narrow into a › and widen back, the field following
            them, while the icons and the › fade one into the other. */}
        <motion.span
          animate={{ width: toolsWidth }}
          className={chatStyle.composerTools}
          initial={false}
          transition={toolFold}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {editing === undefined && toolsFolded && (
              <motion.button
                animate={{ opacity: 1, scale: 1 }}
                aria-label="写真と日にちのボタンを表示"
                className={chatStyle.composerButton({ tool: true })}
                exit={{ opacity: 0, scale: 0.6 }}
                initial={{ opacity: 0, scale: 0.6 }}
                key="more"
                onClick={() => {
                  setToolsOpen(true);
                }}
                // The field keeps focus (and the keyboard stays up), so
                // the tools do not open under the finger as it leaves.
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                transition={toolFold}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={22} />
              </motion.button>
            )}
            {editing === undefined && !toolsFolded && (
              <motion.span
                animate={{ opacity: 1, x: 0 }}
                className={chatStyle.composerToolRow}
                exit={{ opacity: 0, x: -toolWidth }}
                initial={{ opacity: 0, x: -toolWidth }}
                key="tools"
                transition={toolFold}
              >
                <button
                  aria-label="写真を送る"
                  className={chatStyle.composerButton({ tool: true })}
                  onClick={() => {
                    photoInputRef.current?.click();
                  }}
                  type="button"
                >
                  <ImageIcon aria-hidden="true" size={20} />
                </button>
                <button
                  aria-label="日にちを共有"
                  className={chatStyle.composerButton({ tool: true })}
                  onClick={() => {
                    setSharing(true);
                  }}
                  type="button"
                >
                  <CalendarPlus aria-hidden="true" size={20} />
                </button>
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
        <LimitedTextArea
          aria-label="メッセージ"
          className={chatStyle.composerInput}
          kind="chatMessage"
          onBlur={() => {
            setWriting(false);
          }}
          onValueChange={(text) => {
            setDraft(text);
            setToolsOpen(false);
          }}
          onFocus={() => {
            setWriting(true);
            setToolsOpen(false);
          }}
          placeholder="メッセージ"
          value={draft}
        />
        {editing === undefined ? (
          <button
            aria-label="送る"
            className={chatStyle.composerButton({ send: true })}
            disabled={
              reading > 0 ||
              (draft.trim() === "" && !attached && photos.length === 0)
            }
            type="submit"
          >
            <SendHorizontal aria-hidden="true" size={18} />
          </button>
        ) : (
          // Saves rather than sends: a check, as Telegram and LINE show
          // while a message is changed. Emptying it does not delete it.
          <button
            aria-label="編集を保存"
            className={chatStyle.composerButton({ send: true })}
            disabled={draft.trim() === ""}
            type="submit"
          >
            <Check aria-hidden="true" size={20} />
          </button>
        )}
      </form>
      <EmojiPickerSheet
        onOpenChange={(open) => {
          if (!open) {
            setPickingFor(undefined);
          }
        }}
        onPick={(emoji) => {
          if (pickingFor) {
            react(pickingFor, emoji);
          }
        }}
        open={pickingFor !== undefined}
        title="リアクション"
      />
      <Sheet
        label="送れなかった写真"
        onOpenChange={(open) => {
          if (!open) {
            setFailedOpen(undefined);
          }
        }}
        open={failedOpen !== undefined}
      >
        <List>
          <ListRow
            label="もう一度送る"
            leading={<RotateCcw aria-hidden="true" size={20} />}
            onClick={() => {
              if (failedOpen) {
                upload([failedOpen]);
              }
              setFailedOpen(undefined);
            }}
          />
          <ListRow
            danger
            label="削除"
            leading={<Trash2 aria-hidden="true" size={20} />}
            onClick={() => {
              onChange(
                chat.messages.filter((message) => message.id !== failedOpen)
              );
              setFailedOpen(undefined);
            }}
          />
        </List>
        <button
          className={photoPicker.cancel}
          onClick={() => {
            setFailedOpen(undefined);
          }}
          type="button"
        >
          キャンセル
        </button>
      </Sheet>
      <ReportSheet
        onClose={() => {
          setReporting(undefined);
        }}
        sends="このメッセージと前後の数件"
        onSend={() => {
          setReporting(undefined);
          toast("通報しました");
        }}
        what={
          reporting === undefined
            ? undefined
            : `${nameOf(byId(reporting)?.from ?? "")}のメッセージ`
        }
      />
      {unsending !== undefined && (
        <ConfirmDialog
          action="取り消す"
          message="メンバー全員のチャットから消えます。"
          onCancel={() => {
            setUnsending(undefined);
          }}
          onConfirm={() => {
            unsend(unsending);
          }}
          title="送信を取り消しますか？"
        />
      )}
      <DaySheet
        members={people}
        onOpenChange={setSharing}
        onShare={(days) => {
          post({ days });
          setSharing(false);
        }}
        open={sharing}
      />
    </Screen>
  );
}

const flashMilliseconds = 1200;

// How many lines stay pinned at once, as LINE keeps five announcements.
const maxPins = 5;

// In the prototype, how soon after you send someone starts writing back,
// and for how long.
const typingStartMs = 800;
const typingMs = 3500;

// An @ and what follows it at the end of the message being written; a
// space ends it.
const MENTION_QUERY = /@(?<query>[^\s@]*)$/u;

// The composer's tools: each one's width, how many, and how they fold
// into a › and back, as quick as the calendar's own fold.
const toolWidth = 32;
const toolCount = 2;
const toolFold = spring("quick");

// A photo of yours on its way up, or one that could not be sent.
type Upload = "sending" | "failed";

// How long a photo takes to go up in the prototype.
const uploadMilliseconds = 1600;

// How many photos go in one send: a roster is a page or two, and more
// would flood a small group's chat.
const maxPhotos = 4;

// A chosen photo with its size, read before it is shown so its line
// keeps its place; the apps read it while shrinking the photo to send.
async function photoOf(file: File): Promise<Photo> {
  const src = URL.createObjectURL(file);
  const image = new Image();
  image.src = src;
  await image.decode();
  return { height: image.naturalHeight, src, width: image.naturalWidth };
}

// The box a photo fits in, and how far from square it may be before its
// ends are cut, as LINE crops a panorama in the chat.
const photoBox = { height: 260, width: 220 };
const photoAspect = { max: 2, min: 1 / 2 };

function photoSize(photo: Photo) {
  const aspect = Math.min(
    Math.max(photo.width / photo.height, photoAspect.min),
    photoAspect.max
  );
  const width = Math.min(photoBox.width, photoBox.height * aspect);
  return { height: Math.round(width / aspect), width: Math.round(width) };
}

// The line a reply answers, inside the bubble over a thin rule, in the
// bubble's own text color; one line, so it never outweighs the answer.
// A photo shows small beside it, to tell which one of several.
function BubbleQuote({
  quoted,
  name,
  nameOf,
  onJump,
}: {
  quoted: Message;
  name: string;
  // Names the members its words mention.
  nameOf: (id: string) => string;
  onJump: () => void;
}) {
  return (
    <button
      aria-label={`${name}「${summaryOf(quoted, nameOf)}」への返信。返信元を表示`}
      className={chatStyle.bubbleQuote}
      onClick={onJump}
      type="button"
    >
      <span className={chatStyle.bubbleQuoteLine}>
        <span className={chatStyle.bubbleQuoteWords}>
          <span className={chatStyle.bubbleQuoteName}>{name}</span>
          <span className={chatStyle.bubbleQuoteText}>
            {summaryOf(quoted, nameOf)}
          </span>
        </span>
        {quoted.photo && (
          <img alt="" className={chatStyle.quoteThumb} src={quoted.photo.src} />
        )}
      </span>
      <span aria-hidden="true" className={chatStyle.bubbleRule} />
    </button>
  );
}

// A message's words with its links and mentions marked. A tap on a link
// opens it (see linkAt), on a mention that member's profile: they are not
// links of their own, as the whole message is the button that opens its
// actions; the page under it and リンクをコピー reach a link without that
// tap.
function MessageText({
  text = "",
  mine,
  nameOf,
}: {
  text?: string;
  mine: boolean;
  nameOf: (id: string) => string;
}) {
  let at = 0;
  return textParts(text).map((part) => {
    const key = at;
    at += part.text.length;
    if (part.mention !== undefined) {
      return (
        <span
          className={chatStyle.mention({ mine })}
          data-mention={part.mention}
          key={key}
        >
          @{nameOf(part.mention)}
        </span>
      );
    }
    return part.url ? (
      <span
        className={chatStyle.bubbleLink({ mine })}
        data-link={part.url}
        key={key}
      >
        {part.text}
      </span>
    ) : (
      <Fragment key={key}>{part.text}</Fragment>
    );
  });
}

// The member a tap in a message's words was on, if it was a mention.
function mentionAt(target: EventTarget) {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-mention]")?.dataset.mention
    : undefined;
}

// The link under a tap in a message's words, if it was on one.
function linkAt(target: EventTarget) {
  return target instanceof Element
    ? target.closest<HTMLElement>("[data-link]")?.dataset.link
    : undefined;
}

// The apps open a link in the system's browser sheet (SFSafariViewController,
// Custom Tabs), over the chat; the prototype opens a tab.
function openLink(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

const linkCard = {
  // Inset in the bubble, on the card's own ground and edge in either
  // bubble (as a shared day's card), as the chat apps set a page apart
  // from the words above it.
  card: css({
    bg: "background.card",
    borderRadius: "md",
    outline: "1px solid token(colors.border.default)",
    outlineOffset: "-1px",
    color: "text.primary",
    display: "flex",
    flexDirection: "column",
    margin: "0 4px 4px",
    overflow: "hidden",
    textDecoration: "none",
    // A long press opens the actions, not the phone's own callout.
    userSelect: "none",
    WebkitTouchCallout: "none",
  }),
  // Pages give their picture at 1.91:1, the size previews are made for.
  image: css({
    aspectRatio: "1.91",
    bg: "fill.tertiary",
    display: "block",
    objectFit: "cover",
    width: "100%",
  }),
  site: css({ color: "text.tertiary", textStyle: "caption2" }),
  title: css({
    fontWeight: 600,
    lineClamp: 2,
    lineHeight: 1.4,
    textStyle: "footnote",
  }),
  words: css({
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "8px 12px",
  }),
};

// The page a message's first link leads to, under its words inside the
// bubble, as LINE shows one: its picture, title and site. A tap opens
// it; a long press opens the message's actions, as on its words.
function LinkCard({
  preview,
  onLongPress,
}: {
  preview: LinkPreview;
  onLongPress: () => void;
}) {
  const press = useLongPress(onLongPress);
  return (
    <a
      className={linkCard.card}
      href={preview.url}
      onClick={(event) => {
        if (press.consumeLongPress()) {
          event.preventDefault();
        }
      }}
      rel="noopener noreferrer"
      target="_blank"
      {...press.handlers}
    >
      {preview.image && (
        <img
          alt=""
          className={linkCard.image}
          draggable={false}
          src={preview.image}
        />
      )}
      <span className={linkCard.words}>
        <span className={linkCard.title}>{preview.title}</span>
        <small className={linkCard.site}>{preview.site}</small>
      </span>
    </a>
  );
}

const inviteCard = {
  // The link card's ground and edge, laid out in a row: the group's mark
  // as the hub shows it, then its name.
  card: css({
    WebkitTouchCallout: "none",
    alignItems: "center",
    bg: "background.card",
    border: 0,
    borderRadius: "md",
    color: "text.primary",
    display: "flex",
    gap: "12px",
    margin: "0 4px 4px",
    outline: "1px solid token(colors.border.default)",
    outlineOffset: "-1px",
    padding: "8px 12px",
    textAlign: "start",
    userSelect: "none",
    width: "calc(100% - 8px)",
  }),
  // The group's mark at the hub's size, on a tint so it stands off the
  // card; a broken link sits in the same frame once the link no longer
  // works.
  mark: css({
    bg: "fill.quaternary",
    borderRadius: "lg",
    color: "text.tertiary",
    display: "grid",
    flexShrink: 0,
    height: "42px",
    overflow: "hidden",
    placeItems: "center",
    width: "42px",
  }),
  words: css({
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  }),
  name: css({
    fontWeight: 600,
    lineClamp: 1,
    textStyle: "footnote",
  }),
  note: css({ color: "text.tertiary", textStyle: "caption2" }),
  // The member count moves to the next line whole in a narrow bubble.
  count: css({ whiteSpace: "nowrap" }),
};

// An invitation link's group, under the message's words where a page's
// card would be, as LINE and Discord show their own invitations. A tap
// opens it in the app; a long press opens the message's actions. Once the
// link no longer works it says so and opens nothing.
function InviteCard({
  invite,
  onOpen,
  onLongPress,
}: {
  invite: InviteLook | undefined;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const press = useLongPress(onLongPress);
  if (!invite) {
    return (
      <span className={inviteCard.card} {...press.handlers}>
        <span aria-hidden="true" className={inviteCard.mark}>
          <Link2Off size={20} />
        </span>
        <span className={inviteCard.words}>
          <span className={inviteCard.name}>この招待は使えません</span>
          <small className={inviteCard.note}>グループへの招待</small>
        </span>
      </span>
    );
  }
  return (
    <button
      className={inviteCard.card}
      onClick={() => {
        if (!press.consumeLongPress()) {
          onOpen();
        }
      }}
      type="button"
      {...press.handlers}
    >
      <span aria-hidden="true" className={inviteCard.mark}>
        <GroupIcon mark={invite.mark} size={24} />
      </span>
      <span className={inviteCard.words}>
        <span className={inviteCard.name}>{invite.name}</span>
        <small className={inviteCard.note}>
          {invite.joined ? (
            "参加中のグループ"
          ) : (
            <>
              グループへの招待・
              <span className={inviteCard.count}>{invite.members}人</span>
            </>
          )}
        </small>
      </span>
    </button>
  );
}

// How long a link must stay as written before its page is read, so one
// typed by hand is not read at every letter; a pasted one is read at once
// after.
const linkSettleMs = 400;

// How long the server takes to read a page in the prototype.
const readMs = 700;

// The preview of the first link being written, as the chat apps make one
// before sending: read from the server once the link settles, shown over
// the composer, and sent with the message unless taken off with ×. A
// message sent before it is read goes without one.
function useLinkPreview(draft: string) {
  const first = firstLink(draft);
  // An invitation's card comes from its group as the message shows, so
  // nothing is read or held above the composer for it.
  const link = first && !inviteCodeOf(first) ? first : undefined;
  const [settled, setSettled] = useState<string>();
  const [skipped, setSkipped] = useState<string>();
  const [pages, setPages] = useState<Record<string, LinkPreview>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!link) {
      return;
    }
    const timers = [
      window.setTimeout(() => {
        setSettled(link);
      }, linkSettleMs),
    ];
    if (!asked.current.has(link)) {
      timers.push(
        window.setTimeout(() => {
          asked.current.add(link);
          setPages((before) => ({ ...before, [link]: previewOf(link) }));
        }, linkSettleMs + readMs)
      );
    }
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [link]);
  const shown =
    link !== undefined && link === settled && link !== skipped
      ? link
      : undefined;
  return {
    handleSkip: () => {
      setSkipped(link);
    },
    // A new message starts with previews back on.
    reset: () => {
      setSkipped(undefined);
    },
    ready: shown ? pages[shown] : undefined,
    shown,
  };
}

// A photo in a chat, as the messaging apps show one: in its own shape
// with no bubble, unless it answers a line, when the quote's bubble holds
// it. A tap opens it large, with 保存; its reactions and menu (with 保存
// too) open from a long press, as on a photo in LINE.
function PhotoLine({
  photo,
  label,
  quote,
  actions,
  onSave,
  upload,
}: {
  photo: Photo;
  // Still going up, or not sent; neither takes reactions yet.
  upload?: Upload;
  // Whose photo it is, for a screen reader and the large view.
  label: string;
  quote?: ReactNode;
  actions: Omit<
    Parameters<typeof MessageActions>[0],
    "children" | "onSave" | "pressToOpen"
  >;
  onSave: () => void;
}) {
  const [viewing, setViewing] = useState(false);
  const press = useLongPress(() => {
    if (!upload) {
      actions.onOpenChange(true);
    }
  });
  const size = photoSize(photo);
  const quoted = quote !== undefined;
  return (
    <>
      <span
        className={
          quoted ? chatStyle.bubble({ mine: actions.mine }) : chatStyle.photo
        }
        data-part="bubble"
        style={{ width: size.width }}
      >
        {quote}
        <MessageActions {...actions} onSave={onSave} pressToOpen>
          <button
            aria-label={`${label}。押すと大きく表示、長押しでリアクションと返信`}
            className={chatStyle.photoButton}
            onClick={() => {
              if (!press.consumeLongPress()) {
                setViewing(true);
              }
            }}
            type="button"
            {...press.handlers}
          >
            <img
              alt=""
              className={chatStyle.photoImage({ quoted })}
              draggable={false}
              height={size.height}
              src={photo.src}
              width={size.width}
            />
            {upload === "sending" && (
              <span className={chatStyle.uploading} role="status">
                <svg
                  aria-hidden="true"
                  className={chatStyle.uploadRing}
                  viewBox="0 0 36 36"
                >
                  <circle cx="18" cy="18" r="15" />
                  <circle
                    cx="18"
                    cy="18"
                    pathLength="100"
                    r="15"
                    style={{ animationDuration: `${uploadMilliseconds}ms` }}
                  />
                </svg>
                <span className={srOnly}>送信中</span>
              </span>
            )}
          </button>
        </MessageActions>
      </span>
      <PhotoViewer
        label={label}
        onOpenChange={setViewing}
        onSave={onSave}
        open={viewing}
        photo={photo.src}
        whole
      />
    </>
  );
}

const messageActions = {
  // The message the actions are for stays bright above the dimming.
  lifted: css({ position: "relative", zIndex: 25 }),
  scrim: css({
    animation: "fadeIn 0.2s ease-out",
    bg: "scrim",
    inset: 0,
    position: "absolute",
    zIndex: 20,
  }),
  // The reactions and the menu, a little apart, as the platforms' context
  // menus put them: nothing drawn around the two.
  content: css({
    _closed: { animation: "fadeOut 0.12s ease-in" },
    _open: { animation: "popIn 0.15s ease-out" },
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    outline: "none",
    zIndex: 30,
  }),
  more: css({ color: "text.secondary" }),
  reaction: css({
    _focusVisible: { outline: "2px solid token(colors.accent.default)" },
    _hover: { bg: "fill.tertiary" },
    bg: "transparent",
    border: 0,
    borderRadius: "circle",
    display: "grid",
    height: "34px",
    padding: 0,
    placeItems: "center",
    textStyle: "title2",
    width: "34px",
  }),
  reactions: css({
    alignItems: "center",
    bg: "background.elevated",
    border: "1px solid token(colors.border.default)",
    borderRadius: "full",
    boxShadow: "md",
    display: "flex",
    gap: "2px",
    padding: "4px",
  }),
  // Your own messages sit on the right, and so do their actions.
  end: css({ alignItems: "flex-end" }),
  start: css({ alignItems: "flex-start" }),
};

// Reactions, and a little apart the menu of 返信 and コピー (and
// リンクをコピー for a message with a link, 編集 and 送信取消 for yours,
// 通報 for others'), as the
// platforms' context menus on a message in LINE and iMessage: the rest of
// the screen dims while the message stays bright. Ark UI's
// Popover opens it from the message, moves focus in, and closes it by a
// tap elsewhere or Escape.
function MessageActions({
  open,
  onOpenChange,
  mine,
  text,
  link,
  onReact,
  onMore,
  onReply,
  onSave,
  onEdit,
  onUnsend,
  onReport,
  onPin,
  pinned = false,
  pressToOpen = false,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mine: boolean;
  // Opens every emoji, for a reaction beyond the ones offered.
  onMore: () => void;
  // What コピー copies; shared days have none.
  text?: string;
  // What リンクをコピー copies: the message's first link.
  link?: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
  // 保存, for a photo.
  onSave?: () => void;
  // 編集, for your own message's words; 送信取消, for any of yours.
  onEdit?: () => void;
  onUnsend?: () => void;
  // 通報, for someone else's message.
  onReport?: () => void;
  // ピン留め, or ピン留めを外す when it is pinned.
  onPin?: () => void;
  pinned?: boolean;
  // The message's own tap does something else, like a photo opening
  // large, so these open from its long press instead.
  pressToOpen?: boolean;
  // The message itself, a button that opens this.
  children: ReactElement;
}) {
  const phone = useContext(PhoneContext);
  const toast = useContext(ToastContext);
  // Focus lands on the whole, as in a sheet, not on 👍 with a ring.
  const contentRef = useRef<HTMLDivElement>(null);
  // The message itself, whatever element it is.
  const messageRef = useRef<HTMLElement>(null);
  const setMessage = (element: HTMLElement | null) => {
    messageRef.current = element;
  };
  // An action that opens something else (the composer, an alert) waits
  // until the menu has gone: closing, the menu hands focus back to the
  // message, which would take it from the composer or close the alert.
  const after = useRef<() => void>(undefined);
  const closeThen = (action: () => void) => {
    after.current = action;
    onOpenChange(false);
  };
  const copy = async (value: string) => {
    onOpenChange(false);
    try {
      await navigator.clipboard.writeText(value);
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした", "problem");
    }
  };
  return (
    <Popover.Root
      initialFocusEl={() => contentRef.current}
      lazyMount
      onExitComplete={() => {
        after.current?.();
        after.current = undefined;
      }}
      onOpenChange={(details) => {
        onOpenChange(details.open);
      }}
      open={open}
      positioning={{
        // Under the whole bubble, past a link's page in it too.
        getAnchorElement: () =>
          messageRef.current?.closest<HTMLElement>("[data-part=bubble]") ??
          messageRef.current,
        gutter: 8,
        placement: mine ? "bottom-end" : "bottom-start",
      }}
      unmountOnExit
    >
      {pressToOpen ? (
        <Popover.Anchor asChild ref={setMessage}>
          {children}
        </Popover.Anchor>
      ) : (
        <Popover.Trigger asChild ref={setMessage}>
          {children}
        </Popover.Trigger>
      )}
      <Portal container={phone ?? undefined}>
        {/* Everything but the message dims, so it is clear which one the
            actions are for; a tap on it closes them. */}
        {open && <div aria-hidden="true" className={messageActions.scrim} />}
        <Popover.Positioner>
          <Popover.Content
            aria-label="リアクションとメニュー"
            ref={contentRef}
            className={cx(
              messageActions.content,
              mine ? messageActions.end : messageActions.start
            )}
          >
            <div className={messageActions.reactions}>
              {reactionChoices.map((emoji) => (
                <button
                  aria-label={`${emoji}でリアクション`}
                  className={messageActions.reaction}
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                  }}
                  type="button"
                >
                  {emoji}
                </button>
              ))}
              <button
                aria-label="ほかの絵文字でリアクション"
                className={cx(messageActions.reaction, messageActions.more)}
                onClick={onMore}
                type="button"
              >
                <Plus aria-hidden="true" size={18} />
              </button>
            </div>
            <div className={menuStyle.content}>
              <button
                className={menuStyle.item}
                onClick={onReply}
                type="button"
              >
                <span className={menuStyle.icon}>
                  <Reply aria-hidden="true" size={18} />
                </span>
                返信
              </button>
              {text && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    copy(text).catch(() => undefined);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Copy aria-hidden="true" size={18} />
                  </span>
                  コピー
                </button>
              )}
              {link && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    copy(link).catch(() => undefined);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Link aria-hidden="true" size={18} />
                  </span>
                  リンクをコピー
                </button>
              )}
              {onSave && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    onOpenChange(false);
                    onSave();
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Download aria-hidden="true" size={18} />
                  </span>
                  保存
                </button>
              )}
              {onPin && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    onOpenChange(false);
                    onPin();
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    {pinned ? (
                      <PinOff aria-hidden="true" size={18} />
                    ) : (
                      <Pin aria-hidden="true" size={18} />
                    )}
                  </span>
                  {pinned ? "ピン留めを外す" : "ピン留め"}
                </button>
              )}
              {onEdit && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    closeThen(onEdit);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Pencil aria-hidden="true" size={18} />
                  </span>
                  編集
                </button>
              )}
              {/* Apart from the rest, in red, as iOS sets off an action
                  that takes something away. */}
              {onUnsend && (
                <>
                  <hr className={menuStyle.separator} />
                  <button
                    className={menuStyle.item}
                    data-danger=""
                    onClick={() => {
                      closeThen(onUnsend);
                    }}
                    type="button"
                  >
                    <span className={menuStyle.icon}>
                      <Undo2 aria-hidden="true" size={18} />
                    </span>
                    送信取消
                  </button>
                </>
              )}
              {onReport && (
                <>
                  <hr className={menuStyle.separator} />
                  <button
                    className={menuStyle.item}
                    data-danger=""
                    onClick={() => {
                      closeThen(onReport);
                    }}
                    type="button"
                  >
                    <span className={menuStyle.icon}>
                      <Flag aria-hidden="true" size={18} />
                    </span>
                    通報
                  </button>
                </>
              )}
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

const pinBar = {
  // Under the header, the latest pinned line, as LINE shows its
  // announcement: the pin, whose words, and a tap jumps to it.
  bar: css({
    alignItems: "center",
    borderBottom: "1px solid token(colors.separator)",
    display: "flex",
    gap: "4px",
    padding: "4px 0",
  }),
  jump: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "md",
    color: "text.primary",
    display: "flex",
    flex: 1,
    gap: "12px",
    minWidth: 0,
    padding: "8px",
    textAlign: "left",
    // A long press offers ピン留めを外す, not the phone's own callout.
    userSelect: "none",
    WebkitTouchCallout: "none",
    width: "100%",
  }),
  icon: css({ color: "accent.default", flexShrink: 0 }),
  words: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minWidth: 0,
  }),
  label: css({
    color: "accent.default",
    fontWeight: 600,
    textStyle: "caption",
  }),
  text: css({
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
  // All of them, opened from ▾ under the bar.
  list: css({
    borderBottom: "1px solid token(colors.separator)",
    listStyle: "none",
    margin: 0,
    padding: "4px 0",
  }),
};

// The pinned lines over a chat: the latest, and with more than one, ▾
// opening them all, each a tap away from its place in the chat.
// A pinned line in the bar or its list: a tap goes to it, and a long
// press (or a right click) offers ピン留めを外す, as a message's long press
// opens its menu. No × in sight: taking a pin off takes it off for
// everyone, so it is not left a stray tap away.
function PinItem({
  label,
  onJump,
  onUnpin,
  children,
}: {
  // For a screen reader: what the pin is.
  label: string;
  onJump: () => void;
  onUnpin: () => void;
  children: ReactNode;
}) {
  const phone = useContext(PhoneContext);
  const [open, setOpen] = useState(false);
  const press = useLongPress(() => {
    setOpen(true);
  });
  return (
    <Popover.Root
      lazyMount
      onOpenChange={(details) => {
        setOpen(details.open);
      }}
      open={open}
      positioning={{ gutter: 4, placement: "bottom-start" }}
      unmountOnExit
    >
      <Popover.Anchor asChild>
        <button
          aria-label={`${label}。押すとメッセージへ、長押しでピン留めを外す`}
          className={pinBar.jump}
          onClick={() => {
            if (!press.consumeLongPress()) {
              onJump();
            }
          }}
          type="button"
          {...press.handlers}
        >
          {children}
        </button>
      </Popover.Anchor>
      <Portal container={phone ?? undefined}>
        <Popover.Positioner>
          <Popover.Content aria-label="ピン留め" className={menuStyle.content}>
            <button
              className={menuStyle.item}
              onClick={() => {
                setOpen(false);
                onUnpin();
              }}
              type="button"
            >
              <span className={menuStyle.icon}>
                <PinOff aria-hidden="true" size={18} />
              </span>
              ピン留めを外す
            </button>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

function PinBar({
  pins,
  nameOf,
  open,
  onOpenChange,
  onJump,
  onUnpin,
}: {
  pins: Message[];
  nameOf: (id: string) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onJump: (id: string) => void;
  onUnpin: (id: string) => void;
}) {
  const [latest] = pins;
  if (!latest) {
    return null;
  }
  const many = pins.length > 1;
  return (
    <>
      <div className={pinBar.bar}>
        <PinItem
          label={`ピン留め：${summaryOf(latest, nameOf)}`}
          onJump={() => {
            onJump(latest.id);
          }}
          onUnpin={() => {
            onUnpin(latest.id);
          }}
        >
          <Pin aria-hidden="true" className={pinBar.icon} size={18} />
          <span className={pinBar.words}>
            <span className={pinBar.label}>
              {many ? `ピン留め・${pins.length}件` : "ピン留め"}
            </span>
            <span className={pinBar.text}>{summaryOf(latest, nameOf)}</span>
          </span>
        </PinItem>
        {many && (
          <IconButton
            aria-expanded={open}
            glass={false}
            label={open ? "ピン留めを閉じる" : "ピン留めをすべて表示"}
            onClick={() => {
              onOpenChange(!open);
            }}
          >
            {open ? (
              <ChevronUp aria-hidden="true" size={20} />
            ) : (
              <ChevronDown aria-hidden="true" size={20} />
            )}
          </IconButton>
        )}
      </div>
      {many && open && (
        <ul aria-label="ピン留め" className={pinBar.list}>
          {pins.map((line) => (
            <li key={line.id}>
              <PinItem
                label={`${nameOf(line.from)}：${summaryOf(line, nameOf)}`}
                onJump={() => {
                  onJump(line.id);
                }}
                onUnpin={() => {
                  onUnpin(line.id);
                }}
              >
                <span className={pinBar.words}>
                  <span className={pinBar.label}>{nameOf(line.from)}</span>
                  <span className={pinBar.text}>{summaryOf(line, nameOf)}</span>
                </span>
              </PinItem>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// A blocked member's message, folded, as Discord shows one: the words say
// whose it is not, and a tap shows it this once.
const blockedLine = "ブロック中のメンバーのメッセージ";

// What stays of a message taken back, as LINE says it: who took it back,
// or for your own, only that it was.
function unsentLine(writer?: Member) {
  return writer?.me
    ? "メッセージの送信を取り消しました"
    : `${writer?.name ?? "メンバー"}がメッセージの送信を取り消しました`;
}

function summaryOf(message: Message, nameOf: (id: string) => string) {
  if (message.unsent) {
    return "取り消されたメッセージ";
  }
  if (message.photo) {
    return "📷 写真";
  }
  return message.days
    ? daysSummary(message.days)
    : plainText(message.text ?? "", nameOf);
}

function daysSummary(days: Date[]) {
  const [first] = days;
  const more = days.length > 1 ? "ほか" : "";
  return first ? `📅 ${formatDay(first)}${more}` : "";
}

// A reaction under a message: the emoji and who chose it, as the members
// are few; past a handful two faces and "+N", as avatar groups in MUI
// and Slack do. A tap adds yours or takes it back, a long press (or a
// right click) lists everyone who chose it.
function ReactionPill({
  reaction,
  people,
  onToggle,
}: {
  reaction: Reaction;
  people: Member[];
  onToggle: () => void;
}) {
  const phone = useContext(PhoneContext);
  const [open, setOpen] = useState(false);
  const press = useLongPress(() => {
    setOpen(true);
  });
  const crowded = people.length > maxReactionFaces;
  const faces = crowded ? people.slice(0, maxReactionFaces - 1) : people;
  return (
    <Popover.Root
      lazyMount
      onOpenChange={(details) => {
        setOpen(details.open);
      }}
      open={open}
      positioning={{ gutter: 6, placement: "top" }}
      unmountOnExit
    >
      <Popover.Anchor asChild>
        <button
          aria-label={`${reaction.emoji} ${people.map((person) => person.name).join("、")}`}
          aria-pressed={reaction.by.includes("me")}
          className={reactionPill.pill}
          onClick={() => {
            if (!press.consumeLongPress()) {
              onToggle();
            }
          }}
          type="button"
          {...press.handlers}
        >
          {reaction.emoji}
          <span className={reactionPill.faces}>
            {faces.map((person) => (
              <Avatar key={person.id} member={person} size={reactionFaceSize} />
            ))}
          </span>
          {crowded && (
            <small className={reactionPill.more}>
              +{people.length - faces.length}
            </small>
          )}
        </button>
      </Popover.Anchor>
      <Portal container={phone ?? undefined}>
        <Popover.Positioner>
          <Popover.Content
            aria-label={`${reaction.emoji}を付けた人`}
            className={cx(menuStyle.content, reactionPill.list)}
          >
            <span className={reactionPill.listEmoji}>{reaction.emoji}</span>
            <ul className={reactionPill.people}>
              {people.map((person) => (
                <li className={reactionPill.person} key={person.id}>
                  <Avatar member={person} size={chatAvatarSize} />
                  {person.name}
                </li>
              ))}
            </ul>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

const reactionPill = {
  // The faces overlap a little, each ringed in the pill's own color. A
  // letter in place of a photo is inked dark with the letter cut out in
  // the pill's color, so its round shows on the pill as a photo would.
  faces: css({
    "& > *": { boxShadow: "0 0 0 1.5px var(--reaction-bg)" },
    "& > [data-letter]": {
      bg: "text.tertiary",
      color: "var(--reaction-bg)",
      fontWeight: 700,
    },
    // Just enough to read as one group without cutting into a letter.
    "& > * + *": { marginInlineStart: "-2px" },
    display: "flex",
  }),
  list: css({ minWidth: "160px", padding: "8px 8px 4px" }),
  listEmoji: css({
    display: "block",
    padding: "4px 12px",
    textStyle: "title2",
  }),
  more: css({
    color: "text.tertiary",
    paddingInlineEnd: "4px",
    textStyle: "caption",
  }),
  people: css({ listStyle: "none", margin: 0, padding: 0 }),
  person: css({
    alignItems: "center",
    display: "flex",
    gap: "12px",
    padding: "8px 12px",
    textStyle: "body",
  }),
  pill: css({
    "&[aria-pressed=true]": {
      "--reaction-bg": "token(colors.accent.container)",
      borderColor: "accent.default",
    },
    "--reaction-bg": "token(colors.background.card)",
    alignItems: "center",
    bg: "var(--reaction-bg)",
    border: "1px solid token(colors.border.default)",
    borderRadius: "full",
    display: "inline-flex",
    gap: "4px",
    height: "24px",
    padding: "0 2px 0 8px",
    textStyle: "subheadline",
    // A long press opens the list, not the phone's own callout or a
    // text selection.
    userSelect: "none",
    WebkitTouchCallout: "none",
  }),
};

// Held this long, a press counts as a long press.
const longPressMs = 500;

// A long press on the web, which has no event for one: a timer from the
// finger going down, dropped when it lifts, leaves or turns into a
// scroll; a right click (and Android's own long press) opens it too. The
// click that follows a long press is swallowed by `consumeLongPress`.
function useLongPress(onLongPress: () => void) {
  const timer = useRef<number>(undefined);
  const fired = useRef(false);
  const cancel = () => {
    window.clearTimeout(timer.current);
  };
  const fire = () => {
    cancel();
    fired.current = true;
    onLongPress();
  };
  return {
    consumeLongPress: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
    handlers: {
      onContextMenu: (event: MouseEvent) => {
        event.preventDefault();
        fire();
      },
      onPointerCancel: cancel,
      onPointerDown: () => {
        fired.current = false;
        cancel();
        timer.current = window.setTimeout(fire, longPressMs);
      },
      onPointerLeave: cancel,
      onPointerUp: cancel,
    },
  };
}

// Adds your reaction, or takes it back if it was already yours.
function toggleReaction(message: Message, emoji: string): Message {
  const reactions = message.reactions ?? [];
  const existing = reactions.find((reaction) => reaction.emoji === emoji);
  if (!existing) {
    return { ...message, reactions: [...reactions, { by: ["me"], emoji }] };
  }
  const mine = existing.by.includes("me");
  const by = mine
    ? existing.by.filter((id) => id !== "me")
    : [...existing.by, "me"];
  return {
    ...message,
    reactions: reactions
      .map((reaction) => (reaction.emoji === emoji ? { by, emoji } : reaction))
      .filter((reaction) => reaction.by.length > 0),
  };
}

// Shared days in a message: one day spreads its people out; several make
// a small table, a row per day.
const dayCard = {
  card: cva({
    base: {
      bg: "background.card",
      border: "1px solid token(colors.border.default)",
      borderRadius: "lg",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      // Never wider than its bubble, so the time beside it stays in view.
      maxWidth: "100%",
      // One day's card is as wide with みんな休み as without, and for any
      // date: room for 12月27日(日) and the tag, so shared days stacked
      // in a chat line up. More people than that holds widen it.
      minWidth: "184px",
      padding: "12px 12px",
    },
    variants: {
      many: { true: { gap: 0, minWidth: 0, padding: "8px 8px" } },
    },
  }),
  cell: cva({
    base: {
      borderRadius: "sm",
      display: "grid",
      height: "24px",
      placeItems: "center",
      width: "100%",
    },
    // The cell itself is the tile; the tables' inset tile, positioned
    // against the whole screen here, washed it all in the tile's color.
    variants: { off: { true: { bg: "accent.container" } } },
  }),
  date: css({
    bg: "transparent",
    border: 0,
    fontSize: "11px",
    fontWeight: 600,
    justifySelf: "start",
    padding: "0 0 0 4px",
  }),
  // A day over its column when the table turns; the weekday under it,
  // and a day everyone is off on the band's color.
  dayHead: cva({
    base: {
      alignItems: "center",
      borderRadius: "sm",
      display: "flex",
      flexDirection: "column",
      fontSize: "11px",
      fontWeight: 600,
      lineHeight: 1.2,
      padding: "2px 0",
      width: "100%",
    },
    variants: { together: { true: { bg: "accent.container" } } },
  }),
  dayHeadWeekday: css({ fontSize: "9px", fontWeight: 400 }),
  head: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "text.primary",
    display: "flex",
    fontSize: "12px",
    fontWeight: 600,
    gap: "8px",
    padding: 0,
    textAlign: "left",
  }),
  // The people share the card's width in even columns, a few spread
  // across it; many wrap onto more lines in the same columns rather than
  // widen the card.
  people: css({ display: "grid", rowGap: "8px" }),
  person: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    flexDirection: "column",
    fontSize: "9px",
    gap: "4px",
  }),
  rest: css({
    color: "text.tertiary",
    padding: "4px 4px 0",
    textAlign: "end",
    textStyle: "caption2",
  }),
  row: cva({
    base: {
      alignItems: "center",
      borderRadius: "sm",
      display: "grid",
      gap: "4px",
      justifyItems: "center",
      minHeight: "28px",
    },
    variants: {
      names: { true: { minHeight: "30px" } },
      together: { true: { bg: "accent.container" } },
    },
  }),
};

// Shared dates with each person's shift. One day spreads out, wrapping
// when the people are many; several become a small table, a row per day,
// or a row per person when the people don't fit across.
function DayCard({ days, members }: { days: Date[]; members: Member[] }) {
  const weekTools = useWeek();
  const [first] = days;
  if (days.length === 1 && first) {
    const together = everyoneOff(members, first);
    return (
      <span className={dayCard.card()} data-part="day-card">
        <span className={dayCard.head}>
          {formatDay(first)}
          {together && (
            <Tag size="sm" tone="accent">
              みんな休み
            </Tag>
          )}
        </span>
        <span
          className={dayCard.people}
          style={{
            gridTemplateColumns: `repeat(${Math.min(members.length, maxCardColumns)}, minmax(36px, 1fr))`,
          }}
        >
          {members.map((member) => (
            <span className={dayCard.person} key={member.id}>
              <Avatar member={member} />
              <Mark date={first} member={member} size={16} />
              <small>{patternOn(member, first)?.name ?? "未入力"}</small>
            </span>
          ))}
        </span>
      </span>
    );
  }
  if (members.length > maxCardColumns) {
    return <DayCardByPerson days={days} members={members} />;
  }
  const columns = {
    gridTemplateColumns: `44px repeat(${members.length}, 26px)`,
  };
  return (
    <span className={dayCard.card({ many: true })} data-part="day-card">
      <span className={dayCard.row({ names: true })} style={columns}>
        <span />
        {members.map((member) => (
          <span key={member.id}>
            <Avatar member={member} />
            <span className={srOnly}>{member.name}</span>
          </span>
        ))}
      </span>
      {days.map((date) => (
        <span
          className={dayCard.row({ together: everyoneOff(members, date) })}
          key={dateKey(date)}
          style={columns}
        >
          <span
            className={cx(dayCard.date, toneColor[weekTools.dateTone(date)])}
          >
            {date.getMonth() + 1}/{date.getDate()}
            <small className={smallWeekday}>
              {weekdayLabels[date.getDay()]}
            </small>
          </span>
          {members.map((member) => (
            <span
              className={dayCard.cell({
                off: patternOn(member, date)?.off === true,
              })}
              key={member.id}
            >
              <Mark date={date} member={member} size={15} />
              <span className={srOnly}>
                {member.name}：{patternOn(member, date)?.name ?? "未入力"}
              </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

// A card fits this many columns of people or days in a bubble on the
// narrowest phone.
const maxCardColumns = 6;

// Several days for more people than fit across: the table turns, a row
// per person and a column per day, as the people can't be fewer but the
// days can. Days past what fits are left to シフト表で見る.
function DayCardByPerson({
  days,
  members,
}: {
  days: Date[];
  members: Member[];
}) {
  const weekTools = useWeek();
  const shown = days.slice(0, maxCardColumns);
  const rest = days.length - shown.length;
  const columns = {
    gridTemplateColumns: `26px repeat(${shown.length}, 28px)`,
  };
  return (
    <span className={dayCard.card({ many: true })} data-part="day-card">
      <span className={dayCard.row({ names: true })} style={columns}>
        {/* As in the shift table, the month once in the corner and the
            days by number, with a new month's where it turns. */}
        <span className={cornerMonth}>{(shown[0]?.getMonth() ?? 0) + 1}月</span>
        {shown.map((date, index) => (
          <span
            className={cx(
              dayCard.dayHead({ together: everyoneOff(members, date) }),
              toneColor[weekTools.dateTone(date)]
            )}
            key={dateKey(date)}
          >
            {index > 0 && date.getMonth() !== shown[index - 1]?.getMonth()
              ? `${date.getMonth() + 1}/${date.getDate()}`
              : date.getDate()}
            <small className={dayCard.dayHeadWeekday}>
              {weekdayLabels[date.getDay()]}
            </small>
          </span>
        ))}
      </span>
      {members.map((member) => (
        <span className={dayCard.row()} key={member.id} style={columns}>
          <span>
            <Avatar member={member} />
            <span className={srOnly}>{member.name}</span>
          </span>
          {shown.map((date) => (
            <span
              className={dayCard.cell({
                off: patternOn(member, date)?.off === true,
              })}
              key={dateKey(date)}
            >
              <Mark date={date} member={member} size={15} />
              <span className={srOnly}>
                {formatDay(date)}：{patternOn(member, date)?.name ?? "未入力"}
              </span>
            </span>
          ))}
        </span>
      ))}
      {rest > 0 && <small className={dayCard.rest}>ほか{rest}日</small>}
    </span>
  );
}
const chatAvatarSize = 32;
const reactionFaceSize = 18;
// Past this many, a reaction shows two faces and "+N".
const maxReactionFaces = 3;
