import { chatRules } from "@pochical/design/chat";
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronDown,
  Ellipsis,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  Fragment,
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode, UIEvent } from "react";
import { css, cx } from "styled-system/css";

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
  inviteCodeOf,
  mentionsOf,
  plainText,
  withMentions,
} from "../lib/chat-text";
import { dateKey, formatDay } from "../lib/design-days";
import { useUser } from "../lib/design-user-store";
import { LinkMenu, openLink } from "./design-chat-actions";
import type { LineActions, LinkMenuAt } from "./design-chat-actions";
import { uploadMilliseconds } from "./design-chat-cards";
import type { InviteLook, Upload } from "./design-chat-cards";
import { Composer, useComposer } from "./design-chat-composer";
import { MessageLine } from "./design-chat-line";
import { PinBar } from "./design-chat-pins";
import { DecidePollSheet } from "./design-chat-poll";
import { chatAvatarSize, chatRow, chatStyle } from "./design-chat-style";
import { blockedLine, summaryOf, unsentLine } from "./design-chat-summary";
import { EmojiPickerSheet } from "./design-emoji-picker";
import type { Chat, Group, Member, Message } from "./design-group-data";
import { Avatar, badge, photoPicker } from "./design-group-parts";
import { profileIn } from "./design-group-settings";
import { DaySheet } from "./design-group-shifts";
import { ReportSheet } from "./design-report";
import { ConfirmDialog, Sheet } from "./design-sheet";
import { ToastContext } from "./design-toast";
import {
  BackButton,
  IconButton,
  IconMenu,
  List,
  ListRow,
  listRow,
  MenuItem,
  MenuSeparator,
  Screen,
  srOnly,
} from "./design-ui";

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

const flashMilliseconds = 1200;

// Said when one more pin takes the place of the oldest.
const droppedPinLine = `ピン留めは${chatRules.maxPins}件までです。いちばん古いものを外しました`;

// In the prototype, how soon after you send someone starts writing back,
// and for how long.
const typingStartMs = 800;

const typingMs = 3500;
