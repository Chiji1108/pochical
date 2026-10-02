import { Popover, Portal } from "@ark-ui/react";
import { chatRules } from "@pochical/design/chat";
import {
  Bell,
  BellOff,
  CalendarDays,
  CalendarCheck,
  CalendarPlus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
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
  useEffectEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  MouseEvent,
  ReactElement,
  ReactNode,
  UIEvent,
} from "react";
import { css, cva, cx } from "styled-system/css";

import {
  decidePoll,
  editMessage,
  firstUnreadOf,
  lastSharedOf,
  pinMessage,
  pinsOf,
  reactTo,
  unsendMessage,
  votePoll,
} from "../lib/chat-messages";
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
import { chatRow, chatStyle } from "./design-chat-style";
import { EmojiPickerSheet } from "./design-emoji-picker";
import {
  everyoneOff,
  patternOn,
  previewOf,
  reactionChoices,
} from "./design-group-data";
import type {
  Chat,
  Group,
  GroupMark,
  LinkPreview,
  Member,
  Message,
  Poll,
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
import { shortMonthOf } from "./design-month-name";
import { ReportSheet } from "./design-report";
import {
  ConfirmDialog,
  DecideHeading,
  PhoneContext,
  PhotoViewer,
  Sheet,
} from "./design-sheet";
import { ToastContext } from "./design-toast";
import {
  BackButton,
  ChoiceList,
  ChoiceRow,
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
  if (last.days || (last.poll && !last.poll.decided)) {
    text = `${text}を共有しました`;
  } else if (last.photo) {
    text = "写真を送りました";
  }
  return who?.me ? `自分：${text}` : text;
}

function ChatTitle({
  title,
  count,
  muted,
}: {
  title: string;
  count?: number;
  muted: boolean;
}) {
  return (
    <>
      <span className={chatStyle.titleLine}>
        <span className={chatStyle.titleName}>{title}</span>
        {muted && <MutedMark />}
      </span>
      {count !== undefined && (
        <small className={chatStyle.titleCount}>{count}人</small>
      )}
    </>
  );
}

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
  isGroup = false,
  onTitle,
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
  // The group's name in its group chat, else the other member's name.
  title: string;
  // The group chat, where everyone talks; else a one-to-one chat.
  isGroup?: boolean;
  // A tap on the title: the group's settings and members, or the other
  // member's profile.
  onTitle?: () => void;
  // Its notifications turned off, from the menu at its top right, as
  // LINE's rooms have it.
  muted?: boolean;
  onMuted?: (muted: boolean) => void;
  group: Group;
  // Whether photos' uploads go through or fail.
  photoSend?: PhotoSend;
  // Opens on the last days shared or put to the vote rather than the
  // latest line, as the top page shows it.
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
  // Your message being taken back, asked about first.
  const [unsending, setUnsending] = useState<string>();
  // Someone else's message being reported.
  const [reporting, setReporting] = useState<string>();
  const blocked = useUser((state) => state.blocked);
  // A link long pressed in a message's words: its own small menu, 開く and
  // コピー, as iOS offers on a link in text, rather than the message's.
  const [linkMenu, setLinkMenu] = useState<LinkMenuAt>();
  const toast = useContext(ToastContext);
  const [failedOpen, setFailedOpen] = useState<string>();
  const { failedCount, upload, uploads } = usePhotoUploads(photoSend);
  const [sharing, setSharing] = useState(false);
  // The line whose actions are open, and the one being answered.
  const [selected, setSelected] = useState<string>();
  const [replyTo, setReplyTo] = useState<string>();
  // The line whose reaction is being picked from every emoji.
  const [pickingFor, setPickingFor] = useState<string>();
  const [flash, setFlash] = useState<string>();
  const { answerSoon, typingMember } = useTypingSoon(group, chat.messages);
  const {
    awayFromLatest,
    firstUnreadId,
    handleLatest,
    handleScroll,
    keepPlace,
    listRef,
    unseen,
  } = useChatScroll({
    failedCount,
    messages: chat.messages,
    sharedFirst,
    typingId: typingMember?.id,
    unreadAtOpen,
  });
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
  const composer = useComposer({
    attach,
    // An @ lists the others in the group chat only.
    members: isGroup ? group.members : noMembers,
    mentionName,
  });
  const { editing } = composer;
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
  const startEditing = (message: Message) => {
    setReplyTo(undefined);
    composer.startEditing(message);
  };
  const pins = pinsOf(chat.messages);
  const [pinsOpen, setPinsOpen] = useState(false);
  const pin = (id: string, pinned: boolean) => {
    const next = pinMessage(chat.messages, id, pinned);
    onChange(next.messages);
    if (next.dropped) {
      toast(droppedPinLine);
    } else {
      toast(pinned ? "ピン留めしました" : "ピン留めを外しました");
    }
  };
  // The poll being settled by its writer, and settling it.
  const [deciding, setDeciding] = useState<string>();
  const decide = (id: string, key: string) => {
    const next = decidePoll(chat.messages, id, key);
    onChange(next.messages);
    setDeciding(undefined);
    const day = byId(id)?.poll?.days.find((date) => dateKey(date) === key);
    const decided = day ? `${formatDay(day)}に決めました` : undefined;
    if (next.dropped) {
      toast(decided ? `${decided}。${droppedPinLine}` : droppedPinLine);
    } else if (decided) {
      toast(decided);
    }
  };
  const unsend = (id: string) => {
    onChange(unsendMessage(chat.messages, id));
    setUnsending(undefined);
    if (editing === id) {
      composer.stopEditing();
    }
  };
  const send = () => {
    const text = composer.draft.trim();
    // The changed words replace the old ones, marked 編集済み; the page of
    // its link stays while the link does.
    if (editing !== undefined) {
      if (text) {
        onChange(
          editMessage(
            chat.messages,
            editing,
            withMentions(text, composer.picked),
            composer.linkPreview.ready
          )
        );
        composer.stopEditing();
      }
      return;
    }
    if (!composer.sendable) {
      return;
    }
    // The attached days go first, then each photo as a line of its own,
    // then what was written, if anything.
    post(
      ...(composer.attached ? [{ days: composer.attached }] : []),
      ...composer.photos.map((photo) => ({ photo })),
      ...(text
        ? [
            {
              link: composer.linkPreview.ready,
              text: withMentions(text, composer.picked),
            },
          ]
        : [])
    );
    composer.clear();
  };
  const react = (id: string, emoji: string) => {
    onChange(reactTo(chat.messages, id, emoji));
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
  const actionsOf = (message: Message): LineActions => ({
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
        composer.stopEditing();
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
  return (
    <Screen>
      <header className={chatStyle.header}>
        <BackButton onClick={onBack}>{backLabel}</BackButton>
        {/* The group's name, and under it how many are in it, as
            Telegram and Messages head a group: clear which group this is,
            without a count in brackets. A long name is cut short, the mute
            mark stays. A tap opens the group's settings and members, or in
            a one-to-one chat the other member's profile. */}
        <h3 className={chatStyle.title}>
          {onTitle ? (
            <button
              aria-label={
                isGroup
                  ? `${title}、${group.members.length}人。押すとグループの設定`
                  : `${title}。押すとプロフィール`
              }
              className={chatStyle.titleButton}
              onClick={onTitle}
              type="button"
            >
              <ChatTitle
                count={isGroup ? group.members.length : undefined}
                muted={muted}
                title={title}
              />
            </button>
          ) : (
            <ChatTitle
              count={isGroup ? group.members.length : undefined}
              muted={muted}
              title={title}
            />
          )}
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
          onScroll={handleScroll}
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
              <MessageLine
                actions={actionsOf(message)}
                flash={flash === message.id}
                group={group}
                hidden={blocked.includes(message.from)}
                inviteOf={inviteOf}
                isGroup={isGroup}
                lifted={selected === message.id}
                mentionName={mentionName}
                message={message}
                onDecide={() => {
                  setDeciding(message.id);
                }}
                onFailed={() => {
                  setFailedOpen(message.id);
                }}
                onFolded={keepPlace}
                onInvite={onInvite}
                onJump={jumpTo}
                onLinkMenu={setLinkMenu}
                onMember={onMember}
                onOpenDay={onOpenDay}
                onSelect={() => {
                  setSelected(message.id);
                }}
                onVote={(key) => {
                  onChange(votePoll(chat.messages, message.id, key));
                }}
                people={people}
                previous={chat.messages[index - 1]}
                quoted={byId(message.replyTo)}
                upload={uploads[message.id]}
                writerOf={writerOf}
              />
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
        {(awayFromLatest || unseen > 0) && (
          <span className={chatStyle.latest}>
            <IconButton
              label={
                unseen > 0
                  ? `最新のメッセージへ、まだ見ていない新着${unseen}件`
                  : "最新のメッセージへ"
              }
              onClick={handleLatest}
            >
              <ChevronDown aria-hidden="true" size={20} />
            </IconButton>
            {unseen > 0 && (
              <span
                aria-hidden="true"
                className={cx(badge, chatStyle.latestCount)}
              >
                {unseen}
              </span>
            )}
          </span>
        )}
      </div>
      <Composer
        composer={composer}
        editingMessage={byId(editing)}
        mentionName={mentionName}
        nameOf={nameOf}
        onSend={send}
        onShareDays={() => {
          setSharing(true);
        }}
        onStopReplying={() => {
          setReplyTo(undefined);
        }}
        replying={replying}
      />
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
      <LinkMenu
        at={linkMenu}
        onClose={() => {
          setLinkMenu(undefined);
        }}
        onOpen={(url) => {
          const code = inviteCodeOf(url);
          if (code) {
            onInvite(code);
          } else {
            openLink(url);
          }
        }}
      />
      <ReportSheet
        member={writerOf(byId(reporting)?.from)}
        onClose={() => {
          setReporting(undefined);
        }}
        sends="このメッセージと前後の数件"
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
        onShare={(days, poll) => {
          post(poll ? { poll: { days, votes: {} } } : { days });
          setSharing(false);
        }}
        open={sharing}
        pollable={isGroup}
      />
      <DecidePollSheet
        key={deciding ?? "none"}
        onClose={() => {
          setDeciding(undefined);
        }}
        onDecide={(key) => {
          if (deciding) {
            decide(deciding, key);
          }
        }}
        poll={byId(deciding)?.poll}
      />
    </Screen>
  );
}

// Photos of yours still uploading, or that could not be sent, by line.
// Only this phone knows them, as the apps keep them in their outbox; the
// group sees a photo once it is up.
function usePhotoUploads(photoSend: PhotoSend) {
  const [uploads, setUploads] = useState<Record<string, Upload>>({});
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) {
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
    timers.current.push(
      window.setTimeout(() => {
        set(photoSend === "fails" ? "failed" : undefined);
      }, uploadMilliseconds)
    );
  };
  const failedCount = Object.values(uploads).filter(
    (status) => status === "failed"
  ).length;
  return { failedCount, upload, uploads };
}

// Someone writing back, shown under the latest line: in the prototype,
// whoever spoke last before you, for a few seconds after you send. The
// apps show it from the typing frames (spec/sync-protocol.md).
function useTypingSoon(group: Group, messages: Message[]) {
  const blocked = useUser((state) => state.blocked);
  const [typingId, setTypingId] = useState<string>();
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
    },
    []
  );
  const typingMember = group.members.find(
    (member) => member.id === typingId && !member.me
  );
  const answerSoon = () => {
    const last = messages.findLast(
      (message) => message.from !== "me" && !message.notice && !message.unsent
    );
    if (!last || blocked.includes(last.from)) {
      return;
    }
    timers.current.push(
      window.setTimeout(() => {
        setTypingId(last.from);
      }, typingStartMs),
      window.setTimeout(() => {
        setTypingId(undefined);
      }, typingStartMs + typingMs)
    );
  };
  return { answerSoon, typingMember };
}

// Where the chat's lines are scrolled. As chat apps do, a chat opens on
// its latest line and follows each new one, like a day just shared from
// the shift table, and a photo's failure note under the lines just sent;
// or it opens on the last shared day, or above the first unread line.
function useChatScroll({
  messages,
  sharedFirst,
  unreadAtOpen,
  failedCount,
  typingId,
}: {
  messages: Message[];
  sharedFirst: boolean;
  unreadAtOpen: number;
  failedCount: number;
  // Who is writing back, whose dots come in under the latest line.
  typingId?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const lineCount = messages.length;
  const [sharedId] = useState(() =>
    sharedFirst ? lastSharedOf(messages) : undefined
  );
  // The first line unread as it opened: the others' lines, counted back
  // from the latest. The line above it stays while the chat is open, as
  // LINE keeps its 「ここから未読メッセージ」.
  const [firstUnreadId] = useState(() => firstUnreadOf(messages, unreadAtOpen));
  // Until a line is added, it stays on the shared day, or on the line
  // above the first unread one.
  const [openedLines] = useState(lineCount);
  // Where the lines were last put, and the scroll that left them there.
  const placed = useRef<{ target?: string; top: number }>(undefined);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || lineCount + failedCount === 0) {
      return;
    }
    const opening = lineCount === openedLines;
    let target: string | undefined;
    if (opening && sharedId !== undefined) {
      target = `#message-${sharedId}`;
    } else if (opening && firstUnreadId !== undefined) {
      target = "#unread-line";
    }
    placed.current = { target, top: scrollOnto(list, target) };
  }, [lineCount, failedCount, openedLines, sharedId, firstUnreadId]);
  // A line grown after the lines were put, as words measured to fold get
  // their 続きを読む, puts them there again: the latest line stays in
  // full above the composer, and the unread line or shared day stays at
  // the top. Not once the chat has been scrolled since.
  const keepPlace = () => {
    const list = listRef.current;
    const at = placed.current;
    if (list && at && Math.abs(list.scrollTop - at.top) < 1) {
      placed.current = { ...at, top: scrollOnto(list, at.target) };
    }
  };
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
  // ↓ to the latest line, once the chat is scrolled up from it.
  const [awayFromLatest, setAwayFromLatest] = useState(false);
  // The unread lines not yet on screen, counted on the ↓, as LINE and
  // Slack count what is below: from the first unread line, the others'
  // lines whose top has not yet come above the foot of the list. Once on
  // screen, a line stays counted as seen.
  const seenLines = useRef(new Set<string>());
  const [unseen, setUnseen] = useState(0);
  const countUnseen = (list: HTMLElement) => {
    const start = messages.findIndex((message) => message.id === firstUnreadId);
    if (start === -1) {
      return;
    }
    const foot = list.getBoundingClientRect().bottom;
    let count = 0;
    for (const message of messages.slice(start)) {
      const element = list.querySelector(`#message-${message.id}`);
      if (message.from === "me" || message.notice || !element) {
        continue;
      }
      if (element.getBoundingClientRect().top < foot) {
        seenLines.current.add(message.id);
      } else if (!seenLines.current.has(message.id)) {
        count += 1;
      }
    }
    setUnseen(count);
  };
  // Once, as the chat opens on its first unread line.
  const countOnOpen = useEffectEvent(() => {
    if (listRef.current) {
      countUnseen(listRef.current);
    }
  });
  useLayoutEffect(() => {
    countOnOpen();
  }, []);
  // The dots come in under the latest line in sight, as a new line does,
  // unless the chat is scrolled up away from it.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && typingId !== undefined && !awayFromLatest) {
      list.scrollTop = list.scrollHeight;
    }
  }, [typingId, awayFromLatest]);
  const handleScroll = (event: UIEvent<HTMLOListElement>) => {
    const list = event.currentTarget;
    setAwayFromLatest(
      list.scrollHeight - list.scrollTop - list.clientHeight >
        list.clientHeight / 2
    );
    countUnseen(list);
  };
  const handleLatest = () => {
    listRef.current?.scrollTo({
      behavior: "smooth",
      top: listRef.current.scrollHeight,
    });
  };
  return {
    awayFromLatest,
    firstUnreadId,
    handleLatest,
    handleScroll,
    keepPlace,
    listRef,
    unseen,
  };
}

// Scrolls the lines onto a line (the shared day, or ここから新着), else
// to the latest, and gives back where that left them.
function scrollOnto(list: HTMLElement, target: string | undefined) {
  const line =
    target === undefined ? null : list.querySelector<HTMLElement>(target);
  list.scrollTop = line
    ? line.getBoundingClientRect().top -
      list.getBoundingClientRect().top +
      list.scrollTop -
      sharedRoom
    : list.scrollHeight;
  return list.scrollTop;
}

type Mention = { id: string; name: string };

// What is being written: the words, the members picked from the @ list,
// days brought from the shift table, photos chosen, the page of its first
// link, and your message whose words are being changed instead.
function useComposer({
  attach,
  members,
  mentionName,
}: {
  attach?: Date[];
  // Who an @ lists: the others in the group chat, none in a one-to-one.
  members: Member[];
  mentionName: (id: string) => string;
}) {
  const toast = useContext(ToastContext);
  const [draft, setDraft] = useState("");
  // Members picked from the @ list, made mentions as the message is sent.
  const [picked, setPicked] = useState<Mention[]>([]);
  const [attached, setAttached] = useState(attach);
  const linkPreview = useLinkPreview(draft);
  // Photos chosen to go with the next send, as the chat apps hold them
  // above the composer: nothing is sent on choosing.
  const [photos, setPhotos] = useState<Photo[]>([]);
  // Photos chosen but still being read; sending waits for them, so none
  // lands in the composer after the message has gone.
  const [reading, setReading] = useState(0);
  const [editing, setEditing] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  // An @ being written at the end of the message lists the others whose
  // name has what follows it, as LINE does; one picked goes in as @name
  // and a space.
  const mentionQuery = MENTION_QUERY.exec(draft)?.groups?.query;
  const mentionable =
    mentionQuery === undefined
      ? []
      : members.filter(
          (member) => !member.me && member.name.includes(mentionQuery)
        );
  const pickMention = (member: Member) => {
    setDraft(draft.replace(MENTION_QUERY, `@${member.name} `));
    setPicked((before) => [
      ...before.filter((other) => other.id !== member.id),
      { id: member.id, name: member.name },
    ]);
  };
  const clear = () => {
    setDraft("");
    setPicked([]);
    linkPreview.reset();
    setAttached(undefined);
    setPhotos([]);
  };
  // Puts your message's words back in the composer to change them, its
  // mentions as @name again.
  const startEditing = (message: Message) => {
    const text = message.text ?? "";
    setEditing(message.id);
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
  // Something to send, once every photo chosen has been read.
  const sendable =
    reading === 0 &&
    (draft.trim() !== "" || attached !== undefined || photos.length > 0);
  return {
    attached,
    choosePhotos,
    clear,
    draft,
    editing,
    formRef,
    linkPreview,
    mentionable,
    photos,
    pickMention,
    picked,
    sendable,
    setAttached,
    setDraft,
    setPhotos,
    startEditing,
    stopEditing,
  };
}

type ComposerState = ReturnType<typeof useComposer>;

// The foot of the chat: what the next message carries (the line it
// answers, days, a link's page, photos), the @ list, and the field with
// its tools and send.
function Composer({
  composer,
  editingMessage,
  replying,
  onStopReplying,
  nameOf,
  mentionName,
  onSend,
  onShareDays,
}: {
  composer: ComposerState;
  // Your message whose words are being changed, or the one being answered.
  editingMessage?: Message;
  replying?: Message;
  onStopReplying: () => void;
  nameOf: (id: string) => string;
  mentionName: (id: string) => string;
  onSend: () => void;
  onShareDays: () => void;
}) {
  const {
    attached,
    draft,
    editing,
    formRef,
    linkPreview,
    mentionable,
    photos,
  } = composer;
  const photoInputRef = useRef<HTMLInputElement>(null);
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
  return (
    <>
      {editingMessage && (
        <div className={chatStyle.replying}>
          <span className={chatStyle.quote}>
            <span className={chatStyle.quoteName}>メッセージを編集</span>
            <span className={chatStyle.quoteText}>
              {summaryOf(editingMessage, mentionName)}
            </span>
          </span>
          <IconButton
            glass={false}
            label="編集をやめる"
            onClick={() => {
              composer.stopEditing();
            }}
          >
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
            onClick={onStopReplying}
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
              composer.setAttached(undefined);
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
                  composer.setPhotos((before) =>
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
                  composer.pickMention(member);
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
          onSend();
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
            composer.choosePhotos(files).catch(() => undefined);
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
                    onShareDays();
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
            composer.setDraft(text);
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
            disabled={!composer.sendable}
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
    </>
  );
}

// What a line's long press offers, and how it opens.
type LineActions = Omit<
  Parameters<typeof MessageActions>[0],
  "children" | "onSave"
>;

// One line of the chat as it is drawn: a message, or one of the app's.
function MessageLine({
  message,
  previous,
  group,
  isGroup,
  people,
  writerOf,
  mentionName,
  quoted,
  hidden,
  flash,
  lifted,
  upload,
  actions,
  inviteOf,
  onInvite,
  onMember,
  onJump,
  onLinkMenu,
  onSelect,
  onDecide,
  onVote,
  onFailed,
  onFolded,
  onOpenDay,
}: {
  message: Message;
  // The line above, after which a new day or a new run starts.
  previous?: Message;
  group: Group;
  isGroup: boolean;
  people: Member[];
  writerOf: (id?: string) => Member | undefined;
  mentionName: (id: string) => string;
  // The line it answers.
  quoted?: Message;
  // Written by someone you blocked: folded away until shown.
  hidden: boolean;
  // Rung, as a pin or a quote jumped to it.
  flash: boolean;
  // Its actions are open over it.
  lifted: boolean;
  upload?: Upload;
  actions: LineActions;
  inviteOf: (code: string) => InviteLook | undefined;
  onInvite: (code: string) => void;
  onMember?: (member: Member) => void;
  onJump: (id: string) => void;
  onLinkMenu: (at: LinkMenuAt) => void;
  // Opens its actions, from a card's long press.
  onSelect: () => void;
  onDecide: () => void;
  onVote: (key: string) => void;
  onFailed: () => void;
  // Its words were measured to fold, and 続きを読む has come in under
  // them, after the chat was scrolled to its place.
  onFolded: () => void;
  onOpenDay: (date: Date) => void;
}) {
  // Words past chatRules.foldLines, and whether they were opened in full.
  const [folded, setFolded] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  const foldedIn = useEffectEvent(onFolded);
  useLayoutEffect(() => {
    if (folded) {
      foldedIn();
    }
  }, [folded]);
  // A blocked member's line, shown for now.
  const [revealed, setRevealed] = useState(false);
  const toast = useContext(ToastContext);
  const member = writerOf(message.from);
  const current = member !== undefined && group.members.includes(member);
  const mine = member?.me === true;
  const firstOfRun =
    previous?.from !== message.from ||
    previous.notice !== undefined ||
    previous.unsent === true ||
    message.replyTo !== undefined;
  // A message whose first link is an invitation shows its group instead
  // of a page.
  const firstUrl = message.text ? firstLink(message.text) : undefined;
  const inviteCode = firstUrl ? inviteCodeOf(firstUrl) : undefined;
  const quote = quoted && (
    <BubbleQuote
      name={writerOf(quoted.from)?.name ?? ""}
      nameOf={mentionName}
      onJump={() => {
        onJump(quoted.id);
      }}
      quoted={quoted}
    />
  );
  // A line taken back says so in the middle, as the app's own
  // lines do, and keeps its place for a reply that quoted it.
  if (message.notice || message.unsent) {
    return (
      <li className={chatStyle.item()} id={`message-${message.id}`}>
        {previous?.when !== message.when && (
          <span className={chatStyle.when}>{message.when}</span>
        )}
        <p className={chatStyle.notice}>
          {message.notice ?? unsentLine(member)}
        </p>
      </li>
    );
  }
  if (hidden && !revealed) {
    return (
      <li className={chatStyle.item()}>
        {previous?.when !== message.when && (
          <span className={chatStyle.when}>{message.when}</span>
        )}
        <button
          className={chatStyle.blocked}
          onClick={() => {
            setRevealed(true);
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
    <li className={chatStyle.item({ flash })} id={`message-${message.id}`}>
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
              lifted && messageActions.lifted
            )}
          >
            {message.photo && (
              <PhotoLine
                actions={actions}
                upload={upload}
                label={`${member?.name ?? ""}が送った写真`}
                onSave={() => {
                  toast("写真を保存しました");
                }}
                photo={message.photo}
                quote={quote}
              />
            )}
            {!message.photo && message.days && (
              <MessageActions {...actions}>
                <button
                  aria-label={`${member?.name ?? ""}が共有した日にち。長押しでリアクションと返信`}
                  className={chatStyle.tap({ mine })}
                  type="button"
                >
                  <DayCard days={message.days} members={people} />
                </button>
              </MessageActions>
            )}
            {message.poll && (
              <PollCard
                // Once settled, 決め直す waits in its long-press menu,
                // for whoever settles it: rarely wanted, and a button
                // in sight would make the day look less than decided.
                actions={{
                  ...actions,
                  onRedecide:
                    message.poll.decided !== undefined && (mine || !current)
                      ? onDecide
                      : undefined,
                }}
                label={`${member?.name ?? ""}の日にちの投票`}
                members={people}
                // Its writer settles it, or, if they have left the group,
                // anyone: a poll is never left without someone to.
                canDecide={mine || !current}
                onDecide={onDecide}
                onVote={onVote}
                poll={message.poll}
                writerOf={writerOf}
              />
            )}
            {!message.photo && !message.days && !message.poll && (
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
                <MessageActions
                  {...actions}
                  onPressAt={(target) => {
                    const link = linkElementAt(target);
                    if (link) {
                      onLinkMenu(link);
                    }
                    return link !== undefined;
                  }}
                >
                  <button
                    aria-label={`${member?.name ?? ""}のメッセージ：${plainText(message.text ?? "", mentionName)}。長押しでリアクションと返信`}
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
                    <FoldedText
                      // A new function each time, so the words are measured
                      // again as they change, as when edited.
                      onFolds={(folds) => {
                        setFolded(folds);
                      }}
                      open={unfolded}
                    >
                      <MessageText
                        mine={mine}
                        nameOf={mentionName}
                        text={message.text}
                      />
                    </FoldedText>
                  </button>
                </MessageActions>
                {folded && !unfolded && (
                  <button
                    className={chatStyle.unfold({ mine })}
                    onClick={() => {
                      setUnfolded(true);
                    }}
                    type="button"
                  >
                    続きを読む
                  </button>
                )}
                {inviteCode && (
                  <InviteCard
                    invite={inviteOf(inviteCode)}
                    onLongPress={onSelect}
                    onOpen={() => {
                      onInvite(inviteCode);
                    }}
                  />
                )}
                {!inviteCode && message.link && (
                  <LinkCard onLongPress={onSelect} preview={message.link} />
                )}
              </span>
            )}
            {upload === "failed" && (
              <button
                aria-label="送れませんでした。押すと再送か削除"
                className={chatStyle.failed}
                onClick={onFailed}
                type="button"
              >
                <CircleAlert aria-hidden="true" size={22} />
              </button>
            )}
            {upload === undefined && (
              <small className={chatStyle.time}>
                {(message.pinned !== undefined || message.edited) && (
                  <span className={chatStyle.timeNote({ mine })}>
                    {message.pinned !== undefined && (
                      <Pin aria-label="ピン留め中" role="img" size={11} />
                    )}
                    {message.edited && "編集済み"}
                  </span>
                )}
                {message.time}
              </small>
            )}
          </span>
          {upload === "failed" && (
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
                    actions.onReact(reaction.emoji);
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
}

const flashMilliseconds = 1200;

// Said when one more pin takes the place of the oldest.
const droppedPinLine = `ピン留めは${chatRules.maxPins}件までです。いちばん古いものを外しました`;

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
export const maxPhotos = 4;

// A chosen photo with its size, read before it is shown so its line
// keeps its place; the apps read it while shrinking the photo to send.
export async function photoOf(file: File): Promise<Photo> {
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

export function photoSize(photo: Photo) {
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

// A link long pressed: its address and the words that show it, which its
// menu opens under.
type LinkMenuAt = { url: string; element: HTMLElement };

function linkElementAt(target: EventTarget | null): LinkMenuAt | undefined {
  const element =
    target instanceof Element
      ? target.closest<HTMLElement>("[data-link]")
      : null;
  const url = element?.dataset.link;
  return element && url ? { element, url } : undefined;
}

// 開く and コピー for a link long pressed in a message, under the link.
function LinkMenu({
  at,
  onClose,
  onOpen,
}: {
  at?: LinkMenuAt;
  onClose: () => void;
  onOpen: (url: string) => void;
}) {
  const phone = useContext(PhoneContext);
  const toast = useContext(ToastContext);
  return (
    <Popover.Root
      lazyMount
      onOpenChange={(details) => {
        if (!details.open) {
          onClose();
        }
      }}
      open={at !== undefined}
      positioning={{
        getAnchorElement: () => at?.element ?? null,
        gutter: 4,
        placement: "bottom-start",
      }}
      unmountOnExit
    >
      <Portal container={phone ?? undefined}>
        <Popover.Positioner>
          <Popover.Content aria-label="リンク" className={menuStyle.content}>
            <button
              className={menuStyle.item}
              onClick={() => {
                if (at) {
                  onOpen(at.url);
                }
                onClose();
              }}
              type="button"
            >
              <span className={menuStyle.icon}>
                <ExternalLink aria-hidden="true" size={18} />
              </span>
              リンクを開く
            </button>
            <button
              className={menuStyle.item}
              onClick={() => {
                const url = at?.url ?? "";
                onClose();
                navigator.clipboard
                  .writeText(url)
                  .then(() => {
                    toast("コピーしました");
                  })
                  .catch(() => {
                    toast("コピーできませんでした", "problem");
                  });
              }}
              type="button"
            >
              <span className={menuStyle.icon}>
                <Link aria-hidden="true" size={18} />
              </span>
              リンクをコピー
            </button>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

const foldLines = { "--fold-lines": chatRules.foldLines } as CSSProperties;

// A message's words, folded at chatRules.foldLines until opened. Whether they run
// past it is measured, not guessed from their length, and told to the
// chat so 続きを読む shows only under words that were cut.
function FoldedText({
  open,
  onFolds,
  children,
}: {
  open: boolean;
  onFolds: (folds: boolean) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const words = ref.current;
    if (!words || open) {
      return;
    }
    onFolds(words.scrollHeight > words.clientHeight + 1);
  }, [open, onFolds]);
  return (
    <span
      className={open ? undefined : chatStyle.folded}
      ref={ref}
      style={open ? undefined : foldLines}
    >
      {children}
    </span>
  );
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
    aspectRatio: String(chatRules.linkPreviewAspect),
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
      }, chatRules.linkPreviewSettleMs),
    ];
    if (!asked.current.has(link)) {
      timers.push(
        window.setTimeout(() => {
          asked.current.add(link);
          setPages((before) => ({ ...before, [link]: previewOf(link) }));
        }, chatRules.linkPreviewSettleMs + readMs)
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
  actions: LineActions;
  onSave: () => void;
}) {
  const [viewing, setViewing] = useState(false);
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
        <MessageActions
          {...actions}
          disabled={upload !== undefined}
          keyboardOpens={false}
          onSave={onSave}
        >
          <button
            aria-label={`${label}。押すと大きく表示、長押しでリアクションと返信`}
            className={chatStyle.photoButton}
            onClick={() => {
              setViewing(true);
            }}
            type="button"
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
  // Holds the message without a box of its own, so the layout is the
  // message's; a long press there offers no text to select.
  anchor: css({
    WebkitTouchCallout: "none",
    display: "contents",
    userSelect: "none",
  }),
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

// Reactions, and a little apart the menu: 返信, コピー, ピン留め, and 編集
// and 送信取消 for yours or 通報 for others', as the platforms' context
// menus on a message in LINE and iMessage (a link's own 開く and コピー
// are on the link's long press, see LinkMenu): the rest of
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
  onEdit,
  onUnsend,
  onReport,
  onPin,
  onRedecide,
  pinned = false,
  onPressAt,
  keyboardOpens = true,
  disabled = false,
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
  // 編集, for your own message's words; 送信取消, for any of yours.
  onEdit?: () => void;
  onUnsend?: () => void;
  // 通報, for someone else's message.
  onReport?: () => void;
  // ピン留め, or ピン留めを外す when it is pinned.
  onPin?: () => void;
  // 決め直す, for a settled poll, to whoever settles it.
  onRedecide?: () => void;
  pinned?: boolean;
  // A long press on part of the message that has its own menu, like a
  // link in its words: open that and return true, and these stay shut.
  onPressAt?: (target: EventTarget | null) => boolean;
  // Enter or Space on the message opens these, as the long press does,
  // unless its own press does something, like a photo opening large.
  keyboardOpens?: boolean;
  // Not yet, like a photo still going up.
  disabled?: boolean;
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
  // Where the press began, for a part with its own menu (onPressAt).
  const pressed = useRef<EventTarget | null>(null);
  const press = useLongPress(() => {
    if (disabled || onPressAt?.(pressed.current) === true) {
      return;
    }
    onOpenChange(true);
  });
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
        // Under the whole bubble, past a link's page in it too; else under
        // the message itself (its holder takes no room of its own).
        getAnchorElement: () =>
          messageRef.current?.closest<HTMLElement>("[data-part=bubble]") ??
          (messageRef.current?.firstElementChild as HTMLElement | null) ??
          null,
        gutter: 8,
        placement: mine ? "bottom-end" : "bottom-start",
      }}
      unmountOnExit
    >
      <Popover.Anchor asChild ref={setMessage}>
        {/* Holds the message and hears its press: a long press (or a
            right click) opens these, as LINE and iMessage do, and the
            click it ends with is swallowed here, before the message's own
            (a link, a mention) can act on it. A tap is the message's own:
            a link or a mention opens, a photo opens large, else nothing,
            so scrolling past a line never opens its menu by accident. */}
        <span
          className={messageActions.anchor}
          onClickCapture={(event) => {
            if (press.consumeLongPress()) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            // A click with no pointer is Enter or Space.
            if (keyboardOpens && event.detail === 0 && !disabled) {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(true);
            }
          }}
          onPointerDownCapture={(event) => {
            pressed.current = event.target;
          }}
          {...press.handlers}
        >
          {children}
        </span>
      </Popover.Anchor>
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
              {onRedecide && (
                <button
                  className={menuStyle.item}
                  onClick={() => {
                    closeThen(onRedecide);
                  }}
                  type="button"
                >
                  <span className={menuStyle.icon}>
                    <CalendarCheck aria-hidden="true" size={18} />
                  </span>
                  決め直す
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

const pollCard = {
  card: css({
    bg: "background.card",
    border: "1px solid token(colors.border.default)",
    borderRadius: "lg",
    display: "flex",
    // 264px where the row has room, narrower where it does not, so the
    // time beside it stays in the row (as a link's card does).
    flex: "1 1 264px",
    flexDirection: "column",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
  }),
  // The card's head opens its reactions and menu, as a shared day's card
  // does; the rows below are for voting.
  head: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderBottom: "1px solid token(colors.separator)",
    color: "text.primary",
    display: "flex",
    gap: "8px",
    padding: "12px",
    textAlign: "left",
    userSelect: "none",
    width: "100%",
  }),
  headIcon: css({ color: "accent.default", flexShrink: 0 }),
  headWords: css({ display: "flex", flexDirection: "column", gap: "2px" }),
  title: css({ fontWeight: 600, textStyle: "subheadline" }),
  sub: css({ color: "text.tertiary", textStyle: "caption2" }),
  rows: css({ listStyle: "none", margin: 0, padding: "4px 0" }),
  row: cva({
    base: {
      alignItems: "center",
      display: "flex",
      gap: "8px",
      minHeight: "48px",
      padding: "4px 12px",
    },
    variants: {
      decided: { true: { bg: "accent.container" } },
      // Days not chosen, once one is.
      passed: { true: { opacity: 0.45 } },
    },
  }),
  date: css({
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    fontSize: "13px",
    fontWeight: 600,
    width: "60px",
  }),
  together: css({ color: "accent.default", fontSize: "10px", fontWeight: 600 }),
  // The faces are a button, for the list of everyone who can come.
  faces: css({
    // The faces ringed apart; the count beside them is words, not ringed.
    "& > span": { boxShadow: "0 0 0 1.5px token(colors.background.card)" },
    "& > * + *": { marginInlineStart: "-4px" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    display: "flex",
    flex: 1,
    minWidth: 0,
    padding: 0,
  }),
  votersTitle: css({
    display: "block",
    fontWeight: 600,
    padding: "4px 12px",
    textStyle: "footnote",
  }),
  count: css({
    color: "text.tertiary",
    paddingInlineStart: "8px",
    textStyle: "caption",
    // 「3人」 stays whole in a narrow card.
    whiteSpace: "nowrap",
  }),
  vote: cva({
    base: {
      alignItems: "center",
      bg: "background.card",
      border: "1px solid token(colors.border.strong)",
      borderRadius: "full",
      color: "text.secondary",
      display: "inline-flex",
      flexShrink: 0,
      fontWeight: 600,
      gap: "4px",
      height: "32px",
      padding: "0 12px",
      textStyle: "footnote",
    },
    variants: {
      on: {
        true: {
          bg: "accent.fill",
          borderColor: "accent.fill",
          color: "accent.onFill",
        },
      },
    },
  }),
  decidedMark: css({
    alignItems: "center",
    color: "accent.default",
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: 600,
    gap: "4px",
    textStyle: "footnote",
  }),
  foot: css({
    bg: "transparent",
    border: 0,
    borderTop: "1px solid token(colors.separator)",
    color: "accent.default",
    fontWeight: 600,
    padding: "12px",
    textStyle: "subheadline",
  }),
};

// Who can come on a day, as faces; a tap lists them all by name, as a
// reaction's list does, since the faces stop at three.
function Voters({ day, people }: { day: Date; people: Member[] }) {
  const phone = useContext(PhoneContext);
  const faces =
    people.length > maxVoteFaces ? people.slice(0, maxVoteFaces - 1) : people;
  if (people.length === 0) {
    return <span className={pollCard.faces} />;
  }
  return (
    <Popover.Root
      lazyMount
      positioning={{ gutter: 6, placement: "top" }}
      unmountOnExit
    >
      <Popover.Trigger
        aria-label={`${formatDay(day)}に行ける人：${people.map((person) => person.name).join("、")}`}
        className={pollCard.faces}
      >
        {faces.map((person) => (
          <Avatar key={person.id} member={person} size={22} />
        ))}
        <small className={pollCard.count}>
          {people.length > faces.length
            ? `+${people.length - faces.length}`
            : `${people.length}人`}
        </small>
      </Popover.Trigger>
      <Portal container={phone ?? undefined}>
        <Popover.Positioner>
          <Popover.Content
            aria-label={`${formatDay(day)}に行ける人`}
            className={cx(menuStyle.content, reactionPill.list)}
          >
            <span className={pollCard.votersTitle}>{formatDay(day)}</span>
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

// How many voters' faces a day's row shows before +N.
const maxVoteFaces = 3;

// Days put to the vote, as LINE's 日程調整 in a card: each day with
// みんな休み when the shifts allow it, who can come, and your 行ける. Its
// writer settles it with 日にちを決める; the day stays marked, the rest
// fade, and the poll is pinned over the chat.
function PollCard({
  poll,
  members,
  canDecide,
  label,
  actions,
  writerOf,
  onVote,
  onDecide,
}: {
  poll: Poll;
  members: Member[];
  // 日にちを決める at its foot until settled: its writer, or anyone
  // once they left. (決め直す is in its long-press menu.)
  canDecide: boolean;
  // Whose poll it is, for a screen reader.
  label: string;
  actions: Omit<Parameters<typeof MessageActions>[0], "children">;
  writerOf: (id?: string) => Member | undefined;
  onVote: (key: string) => void;
  onDecide: () => void;
}) {
  const weekTools = useWeek();
  const voters = new Set(Object.values(poll.votes).flat());
  const decided = poll.days.find((day) => dateKey(day) === poll.decided);
  return (
    <span className={pollCard.card} data-part="bubble">
      <MessageActions {...actions}>
        <button
          aria-label={`${label}。長押しでリアクションと返信`}
          className={pollCard.head}
          type="button"
        >
          <CalendarCheck
            aria-hidden="true"
            className={pollCard.headIcon}
            size={20}
          />
          <span className={pollCard.headWords}>
            <span className={pollCard.title}>日にちの投票</span>
            <small className={pollCard.sub}>
              {decided
                ? `${formatDay(decided)}に決定`
                : `${voters.size}人が投票`}
            </small>
          </span>
        </button>
      </MessageActions>
      <ul className={pollCard.rows}>
        {poll.days.map((day) => {
          const key = dateKey(day);
          const people = (poll.votes[key] ?? []).flatMap(
            (id) => writerOf(id) ?? []
          );
          const yours = poll.votes[key]?.includes("me") ?? false;
          const isDecided = key === poll.decided;
          return (
            <li
              className={pollCard.row({
                decided: isDecided,
                passed: decided !== undefined && !isDecided,
              })}
              key={key}
            >
              <span className={pollCard.date}>
                <span className={toneColor[weekTools.dateTone(day)]}>
                  {day.getMonth() + 1}/{day.getDate()}
                  <small className={smallWeekday}>
                    {weekTools.weekdayName(day.getDay())}
                  </small>
                </span>
                {everyoneOff(members, day) && (
                  <span className={pollCard.together}>みんな休み</span>
                )}
              </span>
              <Voters day={day} people={people} />
              {isDecided && (
                <span className={pollCard.decidedMark}>
                  <Check aria-hidden="true" size={16} />
                  決定
                </span>
              )}
              {decided === undefined && (
                <button
                  aria-label={`${formatDay(day)}に行ける`}
                  aria-pressed={yours}
                  className={pollCard.vote({ on: yours })}
                  onClick={() => {
                    onVote(key);
                  }}
                  type="button"
                >
                  {yours && <Check aria-hidden="true" size={14} />}
                  行ける
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canDecide && decided === undefined && (
        <button className={pollCard.foot} onClick={onDecide} type="button">
          日にちを決める
        </button>
      )}
    </span>
  );
}

// Its writer picking the day a poll settles on, with how many can come.
function DecidePollSheet({
  poll,
  onClose,
  onDecide,
}: {
  poll?: Poll;
  onClose: () => void;
  onDecide: (key: string) => void;
}) {
  // Opened again on a settled poll, its day is picked to start with.
  const [picked, setPicked] = useState<string | null>(poll?.decided ?? null);
  const close = () => {
    setPicked(null);
    onClose();
  };
  const title = poll?.decided ? "日にちを決め直す" : "日にちを決める";
  return (
    <Sheet
      label={title}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
      open={poll !== undefined}
    >
      <DecideHeading
        action="決める"
        disabled={picked === null}
        onAction={() => {
          if (picked) {
            onDecide(picked);
            setPicked(null);
          }
        }}
        onCancel={close}
        title={title}
      />
      {poll && (
        <ChoiceList label="決める日" onValueChange={setPicked} value={picked}>
          {poll.days.map((day) => (
            <ChoiceRow
              key={dateKey(day)}
              label={`${formatDay(day)}・${poll.votes[dateKey(day)]?.length ?? 0}人が行ける`}
              value={dateKey(day)}
            />
          ))}
        </ChoiceList>
      )}
    </Sheet>
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
    // Out to the screen's edges, so its line runs from edge to edge as a
    // bar's does on iOS and Android (a list's lines stay inset); its
    // contents stay where they were.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    paddingBottom: "4px",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: "4px",
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
    paddingTop: "4px",
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
  if (message.poll) {
    return pollSummary(message.poll);
  }
  return message.days
    ? daysSummary(message.days)
    : plainText(message.text ?? "", nameOf);
}

// A poll in a line of words: what was settled, or that it is open.
function pollSummary(poll: Poll) {
  const decided = poll.days.find((day) => dateKey(day) === poll.decided);
  return decided
    ? `📅 ${formatDay(decided)}に決定`
    : `📅 日にちの投票：${daysSummary(poll.days).replace("📅 ", "")}`;
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
// or a row per person when the people don't fit across. Either keeps to
// a week of days, so a month shared does not fill the chat; the rest are
// left to シフト表で見る under it.
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
            gridTemplateColumns: `repeat(${Math.min(members.length, chatRules.dayCardColumns)}, minmax(36px, 1fr))`,
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
  if (members.length > chatRules.dayCardColumns) {
    return <DayCardByPerson days={days} members={members} />;
  }
  const columns = {
    gridTemplateColumns: `44px repeat(${members.length}, 26px)`,
  };
  const shown = days.slice(0, chatRules.dayCardRows);
  const rest = days.length - shown.length;
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
      {shown.map((date) => (
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
              {weekTools.weekdayName(date.getDay())}
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
      {rest > 0 && <small className={dayCard.rest}>ほか{rest}日</small>}
    </span>
  );
}

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
  const shown = days.slice(0, chatRules.dayCardColumns);
  const rest = days.length - shown.length;
  const columns = {
    gridTemplateColumns: `26px repeat(${shown.length}, 28px)`,
  };
  return (
    <span className={dayCard.card({ many: true })} data-part="day-card">
      <span className={dayCard.row({ names: true })} style={columns}>
        {/* As in the shift table, the month once in the corner and the
            days by number, with a new month's where it turns. */}
        <span className={cornerMonth}>
          {shown[0] ? shortMonthOf(shown[0], weekTools.english) : ""}
        </span>
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
              {weekTools.weekdayName(date.getDay())}
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
export const chatAvatarSize = 32;
const reactionFaceSize = 18;
// Past this many, a reaction shows two faces and "+N".
const maxReactionFaces = 3;
