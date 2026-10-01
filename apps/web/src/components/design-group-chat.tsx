import { Popover, Portal } from "@ark-ui/react";
import {
  Bell,
  BellOff,
  CalendarPlus,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  Ellipsis,
  ImageIcon,
  Plus,
  Reply,
  RotateCcw,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { dateKey, formatDay } from "../lib/design-days";
import type { Photo } from "../lib/design-sample-photos";
import { spring } from "../lib/motion";
import { EmojiPickerSheet } from "./design-emoji-picker";
import {
  everyoneOff,
  patternOn,
  reactionChoices,
  weekdayLabels,
} from "./design-group-data";
import type {
  Chat,
  Group,
  Member,
  Message,
  Reaction,
} from "./design-group-data";
import {
  Avatar,
  Mark,
  badge,
  cornerMonth,
  memberButton,
  photoPicker,
  smallWeekday,
  toneColor,
} from "./design-group-parts";
import { DaySheet } from "./design-group-shifts";
import { PhoneContext, PhotoViewer, Sheet } from "./design-sheet";
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

function lastLine(chat: Chat, members: Member[]) {
  const last = chat.messages.at(-1);
  if (!last) {
    return;
  }
  const who = members.find((member) => member.id === last.from);
  if (last.notice) {
    return last.notice;
  }
  let { text } = last;
  if (last.days) {
    text = `${summaryOf(last)}を共有しました`;
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
  members,
  onOpen,
  muted = false,
}: {
  label: string;
  icon: ReactNode;
  chat: Chat;
  members: Member[];
  onOpen: () => void;
  muted?: boolean;
}) {
  const preview = lastLine(chat, members);
  const last = chat.messages.at(-1);
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
          <span className={badge} role="status">
            {chat.unread}
            <span className={srOnly}>件の未読</span>
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

export function ChatPage({
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
  muted = false,
  onMuted,
}: {
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
  const [attached, setAttached] = useState(attach);
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
  // Until a line is added, it stays on the shared day.
  const [openedLines] = useState(lineCount);
  const failedCount = Object.values(uploads).filter(
    (status) => status === "failed"
  ).length;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || lineCount + failedCount === 0) {
      return;
    }
    const shared =
      sharedId === undefined || lineCount !== openedLines
        ? null
        : list.querySelector<HTMLElement>(`#message-${sharedId}`);
    list.scrollTop = shared
      ? shared.getBoundingClientRect().top -
        list.getBoundingClientRect().top +
        list.scrollTop -
        sharedRoom
      : list.scrollHeight;
  }, [lineCount, failedCount, openedLines, sharedId]);
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
  // Who wrote a line, including members taken out since, whose lines stay.
  const writerOf = (id?: string) =>
    [...group.members, ...formerMembers].find((member) => member.id === id);
  const byId = (id?: string) =>
    chat.messages.find((message) => message.id === id);
  const nameOf = (id: string) => writerOf(id)?.name ?? "";
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
    const photoIds = sent.flatMap((line) => (line.photo ? [line.id] : []));
    if (photoIds.length > 0) {
      upload(photoIds);
    }
  };
  // The attached days go first, then each photo as a line of its own,
  // then what was written, if anything.
  const send = () => {
    const text = draft.trim();
    if (reading > 0 || (!text && !attached && photos.length === 0)) {
      return;
    }
    post(
      ...(attached ? [{ days: attached }] : []),
      ...photos.map((photo) => ({ photo })),
      ...(text ? [{ text }] : [])
    );
    setDraft("");
    setAttached(undefined);
    setPhotos([]);
  };
  const choosePhotos = async (files: File[]) => {
    const room = maxPhotos - photos.length;
    if (files.length > room) {
      toast(`写真は一度に${maxPhotos}枚まで送れます`);
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
      toast("開けない写真がありました");
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
    mine: message.from === "me",
    onMore: () => {
      setSelected(undefined);
      setPickingFor(message.id);
    },
    onOpenChange: (open: boolean) => {
      setSelected(open ? message.id : undefined);
    },
    onReact: (emoji: string) => {
      react(message.id, emoji);
    },
    onReply: () => {
      setReplyTo(message.id);
      setSelected(undefined);
    },
    open: selected === message.id,
    text: message.text,
  });
  const replying = byId(replyTo);
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
      <ol
        aria-label={`${title}のメッセージ`}
        className={chatStyle.messages}
        ref={listRef}
      >
        {chat.messages.length === 0 && (
          <li className={chatStyle.empty}>まだメッセージはありません</li>
        )}
        {chat.messages.map((message, index) => {
          const previous = chat.messages[index - 1];
          const member = writerOf(message.from);
          const current =
            member !== undefined && group.members.includes(member);
          const mine = member?.me === true;
          const firstOfRun =
            previous?.from !== message.from ||
            previous.notice !== undefined ||
            message.replyTo !== undefined;
          const quoted = byId(message.replyTo);
          const quote = quoted && (
            <BubbleQuote
              name={nameOf(quoted.from)}
              onJump={() => {
                jumpTo(quoted.id);
              }}
              quoted={quoted}
            />
          );
          if (message.notice) {
            return (
              <li className={chatStyle.item()} key={message.id}>
                {previous?.when !== message.when && (
                  <span className={chatStyle.when}>{message.when}</span>
                )}
                <p className={chatStyle.notice}>{message.notice}</p>
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
                        className={chatStyle.bubble({ mine })}
                        data-part="bubble"
                      >
                        {quote}
                        <MessageActions {...actionsOf(message)}>
                          <button
                            aria-label={`${member?.name ?? ""}のメッセージ：${message.text ?? ""}。押すとリアクションと返信`}
                            className={chatStyle.bubbleText}
                            type="button"
                          >
                            {message.text}
                          </button>
                        </MessageActions>
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
                      <small className={chatStyle.time}>{message.time}</small>
                    )}
                  </span>
                  {uploads[message.id] === "failed" && (
                    <small className={chatStyle.failedNote}>
                      送れませんでした
                    </small>
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
                          people={reaction.by.flatMap(
                            (id) => writerOf(id) ?? []
                          )}
                          reaction={reaction}
                        />
                      ))}
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {replying && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>
              {nameOf(replying.from)}に返信
            </span>
            <span className={chatStyle.quoteText}>{summaryOf(replying)}</span>
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
      {photos.length > 0 && (
        <ul
          aria-label="送る写真"
          className={chatStyle.tray({
            below: replying !== undefined || attached !== undefined,
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
      <form
        className={chatStyle.composer({
          replying:
            replying !== undefined ||
            attached !== undefined ||
            photos.length > 0,
        })}
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
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
          animate={{
            width: toolsFolded ? toolWidth : toolWidth * toolCount,
          }}
          className={chatStyle.composerTools}
          initial={false}
          transition={toolFold}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {toolsFolded ? (
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
            ) : (
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
  onJump,
}: {
  quoted: Message;
  name: string;
  onJump: () => void;
}) {
  return (
    <button
      aria-label={`${name}「${summaryOf(quoted)}」への返信。返信元を表示`}
      className={chatStyle.bubbleQuote}
      onClick={onJump}
      type="button"
    >
      <span className={chatStyle.bubbleQuoteLine}>
        <span className={chatStyle.bubbleQuoteWords}>
          <span className={chatStyle.bubbleQuoteName}>{name}</span>
          <span className={chatStyle.bubbleQuoteText}>{summaryOf(quoted)}</span>
        </span>
        {quoted.photo && (
          <img alt="" className={chatStyle.quoteThumb} src={quoted.photo.src} />
        )}
      </span>
      <span aria-hidden="true" className={chatStyle.bubbleRule} />
    </button>
  );
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

// Reactions, and a little apart the menu of 返信 and コピー, as the
// platforms' context menus on a message in LINE and iMessage: the rest of
// the screen dims while the message stays bright. Ark UI's
// Popover opens it from the message, moves focus in, and closes it by a
// tap elsewhere or Escape.
function MessageActions({
  open,
  onOpenChange,
  mine,
  text,
  onReact,
  onMore,
  onReply,
  onSave,
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
  onReact: (emoji: string) => void;
  onReply: () => void;
  // 保存, for a photo.
  onSave?: () => void;
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
  const copy = async () => {
    onOpenChange(false);
    try {
      await navigator.clipboard.writeText(text ?? "");
      toast("コピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  };
  return (
    <Popover.Root
      initialFocusEl={() => contentRef.current}
      lazyMount
      onOpenChange={(details) => {
        onOpenChange(details.open);
      }}
      open={open}
      positioning={{
        gutter: 8,
        placement: mine ? "bottom-end" : "bottom-start",
      }}
      unmountOnExit
    >
      {pressToOpen ? (
        <Popover.Anchor asChild>{children}</Popover.Anchor>
      ) : (
        <Popover.Trigger asChild>{children}</Popover.Trigger>
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
                    copy().catch(() => undefined);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <Copy aria-hidden="true" size={18} />
                  </span>
                  コピー
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
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

function summaryOf(message: Message) {
  if (message.photo) {
    return "📷 写真";
  }
  return message.days ? daysSummary(message.days) : (message.text ?? "");
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
