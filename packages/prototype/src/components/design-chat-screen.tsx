import { chatRules } from "@pochical/design/chat";
import type { ChatPlaceRules } from "@pochical/design/chat";
import { cx } from "@pochical/styled-system/css";
import {
  Bell,
  BellOff,
  CalendarDays,
  ChevronDown,
  Ellipsis,
  Images,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, UIEvent } from "react";

import {
  chatOrder,
  firstUnreadOf,
  keptDraft,
  lastSharedOf,
  pinsOf,
} from "../lib/chat-messages";
import { inviteCodeOf, withMentions } from "../lib/chat-text";
import type {
  Chat,
  ChatDraft,
  Member,
  Message,
} from "../lib/design-group-data";
import { useUser } from "../lib/design-user-store";
import { LinkMenu, openLink } from "./design-chat-actions";
import type { LinkMenuAt } from "./design-chat-actions";
import { BubbleOutline } from "./design-chat-bubble";
import { uploadMilliseconds, uploadOfLine } from "./design-chat-cards";
import type {
  InviteLook,
  LineUpload,
  PhotoUpload,
  Upload,
} from "./design-chat-cards";
import {
  ChatEdge,
  Composer,
  GoneNote,
  noOne,
  useComposer,
} from "./design-chat-composer";
import { useChatEdits } from "./design-chat-edits";
import { ChatContext, MessageLine, photosOf } from "./design-chat-line";
import type { ChatScope } from "./design-chat-line";
import { LineFrame, MutedMark } from "./design-chat-parts";
import { ChatPhotoList } from "./design-chat-photo-list";
import { PinBar } from "./design-chat-pins";
import { DecidePollSheet } from "./design-chat-poll";
import { chatAvatarSize, chatStyle } from "./design-chat-style";
import { EmojiPickerSheet } from "./design-emoji-picker";
import { Avatar, badge, photoPicker } from "./design-group-parts";
import { DaySheet } from "./design-group-shifts-day-sheet";
import { BackButton } from "./design-header";
import { List, ListRow } from "./design-list";
import { IconMenu, MenuItem, MenuSeparator } from "./design-menu";
import { ReportSheet } from "./design-report";
import { ConfirmDialog, Sheet } from "./design-sheet";
import { IconButton, Screen } from "./design-ui";

// A chat, wherever it is kept (spec/chat.md, Where a chat is kept): a
// group's 全体チャット or a one-to-one chat in it, or the chat with
// Pochical's people. Its lines, replies and reactions, photos going up,
// the ↓ to the latest line and the day floating over the lines are the
// same in each; what its place does not take (shared days, polls, pins,
// mentions, reports, 編集) its rules leave out, as the iOS app's
// ChatScreen does.

export type PhotoSend = "ok" | "fails";
export type PhotoFetch = "ok" | "fails";

export type ChatScreenProps = {
  // What the chat's place lets it do: chatPlaces.group or .support.
  rules: ChatPlaceRules;
  // The group's name in its group chat, the other member's name in a
  // one-to-one chat, ポチカル in the chat with Pochical's people.
  title: string;
  // Where 戻る goes: the group, the chat a member was opened from, 設定.
  backLabel: string;
  // A group's 全体チャット, where everyone talks: its count under the
  // title, names over the lines, mentions and polls. Else a chat of two.
  isGroup?: boolean;
  // Who is in the chat now.
  members: Member[];
  // Members taken out of the group, so their past lines keep a face.
  formerMembers?: Member[];
  // Faces by member id, for writers drawn other than by their picture,
  // as Pochical's people's app icon.
  faces?: Record<string, ReactNode>;
  mentionName: (id: string) => string;
  // What the chat says over its first line: who the chat with Pochical's
  // people reaches. Without it, a chat with no lines says so.
  head?: ReactNode;
  // Who else a line taken back (送信取消) is gone from, said as it is
  // asked about.
  unsendNote: string;
  chat: Chat;
  onBack: () => void;
  onChange: (messages: Message[]) => void;
  // What is being written, kept as the chat is left, undefined for none
  // (spec/chat.md, Drafts).
  onDraft: (draft?: ChatDraft) => void;
  // What an invitation link's code opens; undefined once it no longer
  // works. Asked as a message shows, not sent with it, so a remade link's
  // card turns unusable for everyone (spec/chat.md). Without it, such a
  // link opens in the browser as any other.
  inviteOf?: (code: string) => InviteLook | undefined;
  // Opens an invitation link in the app: its group's join screen, or the
  // group itself when you are in it.
  onInvite?: (code: string) => void;
  // A tap on the title: the group's settings and members, or the other
  // member's profile.
  onTitle?: () => void;
  // Its notifications turned off, from the menu at its top right, as
  // LINE's rooms have it.
  muted?: boolean;
  onMuted?: (muted: boolean) => void;
  // The group chat's menu opens everyone's shifts, to look up a day while
  // talking it over.
  onShifts?: () => void;
  // Who a shared day shows: everyone, or the two people in a direct chat.
  people?: Member[];
  onOpenDay?: (date: Date) => void;
  // Opens a member's profile from their picture.
  onMember?: (member: Member) => void;
  // The other member of a one-to-one chat, once they have left the
  // group: the chat stays to be read, but takes no more lines.
  gone?: Member;
  // Days brought from the shift table, waiting above the composer.
  attach?: Date[];
  // Whether photos' uploads go through or fail.
  photoSend?: PhotoSend;
  // Whether others' photos come the first time, or show ↻ to fetch again.
  photoFetch?: PhotoFetch;
  // Opens on the last days shared or put to the vote rather than the
  // latest line, as the top page shows it.
  sharedFirst?: boolean;
  // How many lines were unread as it opened: it opens on the first of
  // them, under ここから新着.
  unreadAtOpen?: number;
  // In the prototype, whoever spoke last before you starts writing back
  // a moment after you send, as the apps show from the typing frames.
  writesBack?: boolean;
};

// A chat's title in its header: the name, the mute mark, and for a group
// the count under them.
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

// The room kept above a shared day a chat opens on: the lines' gap, so
// the line before it sits just out of view instead of peeking in as a
// sliver under the header.
const sharedRoom = 8;

const noDay = () => undefined;

const photosIn = (message: Message) =>
  message.content.kind === "photos" ? message.content.photos : undefined;

export function ChatScreen({
  rules,
  title,
  backLabel,
  isGroup = false,
  members,
  formerMembers = noOne,
  faces,
  mentionName,
  head,
  unsendNote,
  chat,
  onBack,
  onChange,
  onDraft,
  inviteOf,
  onInvite,
  onTitle,
  muted = false,
  onMuted,
  onShifts,
  people = members,
  onOpenDay = noDay,
  onMember,
  gone,
  attach,
  photoSend = "ok",
  photoFetch = "ok",
  sharedFirst = false,
  unreadAtOpen = 0,
  writesBack = false,
}: ChatScreenProps) {
  const blocked = useUser((state) => state.blocked);
  // A link long pressed in a message's words: its own small menu, 開く and
  // コピー, as iOS offers on a link in text, rather than the message's.
  const [linkMenu, setLinkMenu] = useState<LinkMenuAt>();
  const [failedOpen, setFailedOpen] = useState<string>();
  // Blocked members' lines shown at a tap.
  const [revealed, setRevealed] = useState<string[]>([]);
  const folded = (message: Message) =>
    blocked.includes(message.from) && !revealed.includes(message.id);
  const { failedCount, forget, lines, stop, upload, uploads } =
    usePhotoUploads(photoSend);
  // A line's photos' uploads as this screen has them, else as the chat
  // kept the line: not sent, none of them up.
  const photosUpOf = (message: Message): PhotoUpload[] | undefined =>
    uploads[message.id] ??
    (message.failed
      ? photosIn(message)?.map(() => "failed" as const)
      : undefined);
  const uploadOf = (message: Message): LineUpload | undefined => {
    const photos = photosUpOf(message);
    return photos && uploadOfLine(photos);
  };
  // The lines in the chat's order (spec/chat.md, Lines on their way): a
  // photo going up last, as the newest, and one not sent where it was
  // written. The prototype keeps a chat's lines in the order written, so
  // each one's place stands for its time.
  const timed = chat.messages.map((message, at) => {
    const going = uploadOf(message)?.line;
    return { at, failed: going === "failed", going, id: message };
  });
  const shown = chatOrder(
    timed.filter(({ going }) => going === undefined),
    timed.filter(({ going }) => going !== undefined)
  );
  const [sharing, setSharing] = useState(false);
  const { answerSoon, typingMember } = useTypingSoon(members, chat.messages);
  const {
    awayFromLatest,
    firstUnreadId,
    handleLatest,
    handleScroll,
    keepPlace,
    listRef,
    unseen,
    floatingDay,
    dayShown,
  } = useChatScroll({
    failedCount,
    messages: chat.messages,
    sharedFirst,
    typingId: typingMember?.id,
    unreadAtOpen,
  });
  // Who wrote a line, including members taken out since, whose lines stay.
  const writerOf = (id?: string) =>
    [...members, ...formerMembers].find((member) => member.id === id);
  const nameOf = (id: string) => writerOf(id)?.name ?? "";
  // The draft the chat was left with, opened again as its lines are now.
  const [opened] = useState(
    () => chat.draft && keptDraft(chat.draft, chat.messages)
  );
  const composer = useComposer({
    attach,
    kept: opened,
    // An @ lists the others in a group chat whose place takes mentions.
    members: isGroup && rules.mentions ? members : noOne,
    mentionName,
  });
  const {
    actionsOf,
    byId,
    decide,
    deciding,
    flash,
    jumpTo,
    pickingFor,
    pin,
    post,
    react,
    remove,
    replyTo,
    reporting,
    selected,
    send,
    sendAgain,
    setDeciding,
    setPickingFor,
    setReplyTo,
    setReporting,
    setSelected,
    setUnsending,
    unsend,
    unsending,
    vote,
  } = useChatEdits({
    answering: opened?.replyTo,
    composer,
    mentionName,
    messages: chat.messages,
    onChange,
    onGone: forget,
    // Someone may write back, and photos start going up: those of a line
    // sent again that are not up yet.
    onSent: (sent) => {
      if (writesBack) {
        answerSoon();
      }
      for (const line of sent) {
        const photos =
          photosUpOf(line) ?? photosIn(line)?.map(() => "sending" as const);
        if (photos) {
          upload(line.id, photos);
        }
      }
    },
    rules,
  });
  // Left, the chat keeps what is being written, as Signal and Telegram
  // keep it.
  const keepDraft = useEffectEvent(() => {
    onDraft(
      keptDraft(
        {
          editing: composer.editing,
          replyTo: composer.editing === undefined ? replyTo : undefined,
          text: withMentions(composer.draft, composer.picked),
        },
        chat.messages
      )
    );
  });
  useEffect(
    () => () => {
      keepDraft();
    },
    []
  );
  // A photo not sent stays so with its line, as the apps keep it in their
  // outbox, so the chats' list says so once the chat is left; sent again,
  // it no longer is.
  // The uploads as last seen, to tell a photo that went (gone from them
  // after sending) from one only not tried on this screen.
  const lastUploads = useRef<Record<string, Upload>>({});
  const keepFailed = useEffectEvent((now: Record<string, Upload>) => {
    const before = lastUploads.current;
    lastUploads.current = now;
    // Failed once it fails; not failed only once it is sent, so leaving
    // while it is sent again keeps it failed.
    const failedNow = (message: Message) => {
      if (now[message.id] === "failed") {
        return true;
      }
      const sent = before[message.id] === "sending" && !(message.id in now);
      return sent ? false : (message.failed ?? false);
    };
    const changed = (message: Message) =>
      failedNow(message) !== (message.failed ?? false);
    if (chat.messages.some(changed)) {
      onChange(
        chat.messages.map((message) =>
          changed(message)
            ? { ...message, failed: failedNow(message) }
            : message
        )
      );
    }
  });
  useEffect(() => {
    keepFailed(lines);
  }, [lines]);
  const openUrl = (url: string) => {
    const code = onInvite && inviteCodeOf(url);
    if (code) {
      onInvite(code);
    } else {
      openLink(url);
    }
  };
  const [pinsOpen, setPinsOpen] = useState(false);
  // 写真 from ⋯: the chat's photos alone, over the chat, which keeps
  // where it was and what is being written under it.
  const [listingPhotos, setListingPhotos] = useState(false);
  const replying = byId(replyTo);
  const decidingContent = byId(deciding)?.content;
  const decidingPoll =
    decidingContent?.kind === "poll" ? decidingContent : undefined;
  // What every line shares, given once rather than to each.
  const scope: ChatScope = {
    faces,
    fetchFails: photoFetch === "fails",
    inviteOf,
    isGroup,
    members,
    mentionName,
    onInvite,
    onJump: jumpTo,
    onLinkMenu: setLinkMenu,
    onMember,
    onOpenDay,
    openUrl,
    people,
    // Not a blocked member's folded away, nor one of yours still going up.
    photos: photosOf(
      chat.messages,
      writerOf,
      (message) => !folded(message) && uploadOf(message) === undefined
    ),
    writerOf,
  };
  return (
    <>
      <Screen hidden={listingPhotos}>
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
                    ? `${title}、${members.length}人。押すとグループの設定`
                    : `${title}。押すとプロフィール`
                }
                className={chatStyle.titleButton}
                onClick={onTitle}
                type="button"
              >
                <ChatTitle
                  count={isGroup ? members.length : undefined}
                  muted={muted}
                  title={title}
                />
              </button>
            ) : (
              <ChatTitle
                count={isGroup ? members.length : undefined}
                muted={muted}
                title={title}
              />
            )}
          </h3>
          <IconMenu
            className={chatStyle.menu}
            icon={<Ellipsis aria-hidden="true" size={20} />}
            label="チャットのメニュー"
          >
            {onShifts && (
              <MenuItem
                icon={<CalendarDays aria-hidden="true" size={18} />}
                onSelect={onShifts}
                value="shifts"
              >
                みんなのシフト
              </MenuItem>
            )}
            <MenuItem
              icon={<Images aria-hidden="true" size={18} />}
              onSelect={() => {
                setListingPhotos(true);
              }}
              value="photos"
            >
              写真
            </MenuItem>
            {onMuted && (
              <>
                <MenuSeparator />
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
              </>
            )}
          </IconMenu>
        </header>
        <div className={chatStyle.lines}>
          {rules.pins && (
            <ChatEdge edge="head" list={listRef}>
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
                pins={pinsOf(chat.messages)}
              />
            </ChatEdge>
          )}
          <ChatContext value={scope}>
            <ol
              aria-label={`${title}のメッセージ`}
              className={chatStyle.messages}
              onScroll={handleScroll}
              ref={listRef}
            >
              {head ??
                (chat.messages.length === 0 && (
                  <li className={chatStyle.empty}>
                    まだメッセージはありません
                  </li>
                ))}
              {shown.map((message, index) => (
                <Fragment key={message.id}>
                  {message.id === firstUnreadId && (
                    <li className={chatStyle.unread} id="unread-line">
                      <span>ここから新着</span>
                    </li>
                  )}
                  <MessageLine
                    actions={actionsOf(message)}
                    flash={message.id === flash}
                    hidden={folded(message)}
                    lifted={selected === message.id}
                    message={message}
                    onDecide={() => {
                      setDeciding(message.id);
                    }}
                    onFailed={() => {
                      setFailedOpen(message.id);
                    }}
                    onStopUpload={() => {
                      stop(message.id);
                    }}
                    onFolded={keepPlace}
                    onReveal={() => {
                      setRevealed((before) => [...before, message.id]);
                    }}
                    onSelect={() => {
                      setSelected(message.id);
                    }}
                    onVote={(key) => {
                      vote(message.id, key);
                    }}
                    next={shown[index + 1]}
                    previous={shown[index - 1]}
                    quoted={byId(message.replyTo)}
                    upload={uploadOf(message)}
                  />
                </Fragment>
              ))}
              {typingMember && (
                <LineFrame
                  avatar={
                    <Avatar member={typingMember} size={chatAvatarSize} />
                  }
                  mine={false}
                >
                  <BubbleOutline first mine={false}>
                    <span
                      aria-label={`${typingMember.name}が入力中`}
                      className={chatStyle.typing}
                      role="status"
                    >
                      <span />
                      <span />
                      <span />
                    </span>
                  </BubbleOutline>
                </LineFrame>
              )}
            </ol>
          </ChatContext>
          {floatingDay !== undefined && (
            <span
              aria-hidden="true"
              className={chatStyle.floatingDay({ shown: dayShown })}
            >
              {floatingDay}
            </span>
          )}
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
          <ChatEdge edge="foot" list={listRef}>
            {gone ? (
              <GoneNote name={gone.name} />
            ) : (
              <Composer
                composer={composer}
                editingMessage={byId(composer.editing)}
                onSend={send}
                onShareDays={
                  rules.days
                    ? () => {
                        setSharing(true);
                      }
                    : undefined
                }
                reply={
                  replying && {
                    message: replying,
                    onStop: () => {
                      setReplyTo(undefined);
                    },
                    writer: nameOf(replying.from),
                  }
                }
              />
            )}
          </ChatEdge>
        </div>
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
                  sendAgain(failedOpen);
                }
                setFailedOpen(undefined);
              }}
            />
            <ListRow
              danger
              label="削除"
              leading={<Trash2 aria-hidden="true" size={20} />}
              onClick={() => {
                if (failedOpen) {
                  remove(failedOpen);
                }
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
          onOpen={openUrl}
        />
        {rules.reports && (
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
        )}
        {unsending !== undefined && (
          <ConfirmDialog
            action="取り消す"
            message={unsendNote}
            onCancel={() => {
              setUnsending(undefined);
            }}
            onConfirm={() => {
              unsend(unsending);
            }}
            title="送信を取り消しますか？"
          />
        )}
        {rules.days && (
          <DaySheet
            members={people}
            onOpenChange={setSharing}
            onShare={(days, poll) => {
              post({
                content: poll
                  ? { days, kind: "poll", votes: {} }
                  : { days, kind: "days" },
              });
              setSharing(false);
            }}
            open={sharing}
            pollable={isGroup && rules.polls}
          />
        )}
        {rules.polls && (
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
            poll={decidingPoll}
          />
        )}
      </Screen>
      {listingPhotos && (
        <ChatPhotoList
          backLabel={title}
          onBack={() => {
            setListingPhotos(false);
          }}
          photos={scope.photos}
        />
      )}
    </>
  );
}

// The server lets go of an uploader's unsent photos once they have
// uploaded nothing for chatRules.unsentAfterMs; those up are trusted for
// half that from when the latest upload began, as the apps trust them.
const trustedUpMs = chatRules.unsentAfterMs / 2;

// Your photo lines still going up, or that could not be sent, each
// photo's way up by its place in its line. Only this phone knows them, as
// the apps keep them in their outbox; the group sees a line once all its
// photos are up.
function usePhotoUploads(photoSend: PhotoSend) {
  const [uploads, setUploads] = useState<Record<string, PhotoUpload[]>>({});
  // Each line's photos going up, which × stops.
  const timers = useRef(new Map<string, Set<number>>());
  // When the upload of a line's latest photo up began.
  const upAt = useRef(new Map<string, number>());
  useEffect(() => {
    const going = timers.current;
    return () => {
      for (const line of going.values()) {
        for (const timer of line) {
          window.clearTimeout(timer);
        }
      }
    };
  }, []);
  const clearTimers = (id: string) => {
    for (const timer of timers.current.get(id) ?? []) {
      window.clearTimeout(timer);
    }
    timers.current.delete(id);
  };
  // Each photo of a line from what it was.
  const change = (
    id: string,
    next: (photos: PhotoUpload[]) => PhotoUpload[]
  ) => {
    setUploads((before) => {
      const line = before[id];
      return line ? withLine(before, id, next(line)) : before;
    });
  };
  // Uploads a line's photos not up yet; all of them once those up may
  // have gone from the server (trustedUpMs). Where uploads fail, its last
  // photo fails, so sending it again sends only that one.
  const upload = (id: string, photos: PhotoUpload[]) => {
    clearTimers(id);
    const began = Date.now();
    const latest = upAt.current.get(id);
    const kept = latest !== undefined && began - latest < trustedUpMs;
    const going = photos.map((photo): PhotoUpload =>
      kept && photo === "up" ? "up" : "sending"
    );
    const last = going.lastIndexOf("sending");
    setUploads((before) => withLine(before, id, going));
    const line = new Set<number>();
    timers.current.set(id, line);
    for (const [index, photo] of going.entries()) {
      if (photo === "sending") {
        const timer = window.setTimeout(() => {
          line.delete(timer);
          const result =
            photoSend === "fails" && index === last ? "failed" : "up";
          if (result === "up") {
            upAt.current.set(id, began);
          }
          change(id, (before) =>
            before.map((one, at) => (at === index ? result : one))
          );
        }, uploadMilliseconds);
        line.add(timer);
      }
    }
  };
  // Stopped with ×: the line is not sent, its ! offering もう一度送る and
  // 削除.
  const stop = (id: string) => {
    clearTimers(id);
    change(id, (photos) =>
      photos.map((photo) => (photo === "up" ? "up" : "failed"))
    );
  };
  // Deleted or taken back: no longer going out.
  const forget = (id: string) => {
    clearTimers(id);
    upAt.current.delete(id);
    setUploads((before) =>
      Object.fromEntries(Object.entries(before).filter(([one]) => one !== id))
    );
  };
  const lines = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(uploads).flatMap(([id, photos]) => {
          const line = uploadOfLine(photos)?.line;
          return line ? [[id, line] as const] : [];
        })
      ),
    [uploads]
  );
  const failedCount = Object.values(lines).filter(
    (line) => line === "failed"
  ).length;
  return { failedCount, forget, lines, stop, upload, uploads };
}

// The uploads with a line's photos as they are now: gone from them once
// all are up, as the line is then sent.
function withLine(
  uploads: Record<string, PhotoUpload[]>,
  id: string,
  photos: PhotoUpload[]
) {
  const others = Object.entries(uploads).filter(([other]) => other !== id);
  const sent = photos.every((photo) => photo === "up");
  return Object.fromEntries(sent ? others : [...others, [id, photos]]);
}

// Someone writing back, shown under the latest line: in the prototype,
// whoever spoke last before you, for a few seconds after you send. The
// apps show it from the typing frames (spec/sync-protocol.md).
function useTypingSoon(members: Member[], messages: Message[]) {
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
  const typingMember = members.find(
    (member) => member.id === typingId && !member.me
  );
  const answerSoon = () => {
    const last = messages.findLast(
      (message) =>
        message.from !== "me" &&
        message.content.kind !== "notice" &&
        message.content.kind !== "unsent"
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

// How near the foot, in pixels, the lines count as at their latest.
const footSlack = 24;

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
    // Lines under the composer's glass are not yet seen.
    const foot =
      list.getBoundingClientRect().bottom -
      Number(getComputedStyle(list).paddingBottom.replace("px", ""));
    let count = 0;
    for (const message of messages.slice(start)) {
      const element = list.querySelector(`#message-${message.id}`);
      if (
        message.from === "me" ||
        message.content.kind === "notice" ||
        !element
      ) {
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
  // The day of the lines at the top, floating over them while the chat
  // scrolls once its own title has gone up out of sight, as LINE shows it.
  const [floatingDay, setFloatingDay] = useState<string>();
  const [dayShown, setDayShown] = useState(false);
  const hideDay = useRef<ReturnType<typeof setTimeout>>(undefined);
  const floatDay = (list: HTMLElement) => {
    // Not at the foot, where the chat follows its latest line on its own.
    if (list.scrollHeight - list.scrollTop - list.clientHeight < footSlack) {
      return;
    }
    const { top } = list.getBoundingClientRect();
    const gone = [...list.querySelectorAll<HTMLElement>("[data-day]")].findLast(
      (title) => title.getBoundingClientRect().top < top
    );
    setFloatingDay(gone?.dataset.day);
    setDayShown(gone !== undefined);
    clearTimeout(hideDay.current);
    hideDay.current = setTimeout(() => {
      setDayShown(false);
    }, chatRules.floatingDayMs);
  };
  useEffect(
    () => () => {
      clearTimeout(hideDay.current);
    },
    []
  );
  const handleScroll = (event: UIEvent<HTMLOListElement>) => {
    const list = event.currentTarget;
    floatDay(list);
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
    dayShown,
    firstUnreadId,
    floatingDay,
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

// In the prototype, how soon after you send someone starts writing back,
// and for how long.
const typingStartMs = 800;

const typingMs = 3500;
