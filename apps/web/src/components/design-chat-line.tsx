import { chatRules } from "@pochical/design/chat";
import { CircleAlert, Pin } from "lucide-react";
import {
  createContext,
  Fragment,
  useContext,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "styled-system/css";

import {
  firstLink,
  inviteCodeOf,
  largeEmojiCount,
  plainText,
  textParts,
} from "../lib/chat-text";
import {
  linkElementAt,
  mentionAt,
  MessageActions,
  messageActions,
} from "./design-chat-actions";
import type { LineActions, LinkMenuAt } from "./design-chat-actions";
import {
  DayCard,
  InviteCard,
  LinkCard,
  PhotoLine,
  ReactionPill,
  uploadOfLine,
} from "./design-chat-cards";
import type { ChatPhoto, InviteLook, PhotoUpload } from "./design-chat-cards";
import { Bubble, ChatItem, LargeEmoji, LineFrame } from "./design-chat-parts";
import { PollCard } from "./design-chat-poll";
import { chatAvatarSize, chatStyle } from "./design-chat-style";
import { blockedLine, summaryOf, unsentLine } from "./design-chat-summary";
import { SwipeToReply } from "./design-chat-swipe";
import type { Member, Message } from "./design-group-data";
import { Avatar, memberButton } from "./design-group-parts";
import { ToastContext } from "./design-toast";

// A chat's lines as they are drawn: each line with who wrote it, the
// line it answers, its words (links and mentions in them, folded when
// long), its time and its reactions.

// What every line of a chat shares: who is in it, who wrote what, and
// where a tap in it goes. ChatScreen gives it once for all its lines, in a
// group's chats and the support chat alike.
export type ChatScope = {
  // Who is in the chat now: a mention or a face opens only theirs.
  members: Member[];
  isGroup: boolean;
  // Faces by member id, for writers drawn other than by their picture,
  // as the support chat's app icon.
  faces?: Record<string, ReactNode>;
  // Who a shared day shows: everyone, or the two people in a direct chat.
  people: Member[];
  writerOf: (id?: string) => Member | undefined;
  mentionName: (id: string) => string;
  // What one of Pochical's invitation links opens, and opening it in the
  // app. Without them, as in the support chat, such a link is one like
  // any other, opened in the browser.
  inviteOf?: (code: string) => InviteLook | undefined;
  onInvite?: (code: string) => void;
  // Opens a link tapped or long pressed: an invitation in the app where
  // the chat has onInvite, else in the browser.
  openUrl: (url: string) => void;
  onMember?: (member: Member) => void;
  onJump: (id: string) => void;
  onLinkMenu: (at: LinkMenuAt) => void;
  onOpenDay: (date: Date) => void;
  // The chat's photos in the order of its lines, swiped through opened
  // large (photosOf).
  photos: ChatPhoto[];
  // Others' photos cannot be fetched the first time they come, as
  // 比べる案 sets it.
  fetchFails?: boolean;
};

const photoLabel = (writer?: Member) => `${writer?.name ?? ""}が送った写真`;

// The photos a chat's lines show, in their order: sent, not taken back,
// and not a blocked member's folded away.
export const photosOf = (
  messages: Message[],
  writerOf: (id?: string) => Member | undefined,
  shown: (message: Message) => boolean
): ChatPhoto[] =>
  messages.flatMap((message) =>
    message.photos && !message.unsent && shown(message)
      ? message.photos.map((photo) => ({
          label: photoLabel(writerOf(message.from)),
          mine: message.from === "me",
          photo,
          when: message.when,
        }))
      : []
  );

export const ChatContext = createContext<ChatScope | undefined>(undefined);

function useChatScope() {
  const scope = useContext(ChatContext);
  if (!scope) {
    throw new Error("A chat's line is drawn inside ChatContext");
  }
  return scope;
}

const nothing = () => undefined;

// Whether a line starts its writer's run rather than going on the one
// above it.
const startsRun = (message: Message, previous: Message | undefined) =>
  previous?.from !== message.from ||
  previous.notice !== undefined ||
  previous.unsent === true ||
  message.replyTo !== undefined;

// Whether a line's time shows: not when the line after it goes on its
// run, sent in the same minute, as LINE shows one time for them
// (spec/chat.md, In a message).
const showsTime = (message: Message, next: Message | undefined) =>
  next === undefined ||
  next.notice !== undefined ||
  next.unsent === true ||
  startsRun(next, message) ||
  next.when !== message.when ||
  next.time !== message.time;

// One line of the chat as it is drawn: a message, or one of the app's.
export function MessageLine({
  message,
  previous,
  next,
  quoted,
  hidden,
  flash,
  lifted,
  upload,
  actions,
  onSelect,
  onDecide = nothing,
  onVote = nothing,
  onFailed = nothing,
  onStopUpload = nothing,
  onFolded = nothing,
  onReveal = nothing,
}: {
  message: Message;
  // The line above, after which a new day or a new run starts.
  previous?: Message;
  // The line below, which may show the time for this one.
  next?: Message;
  // The line it answers.
  quoted?: Message;
  // Written by someone you blocked, and not shown yet: folded away.
  hidden: boolean;
  // Rung, as a pin or a quote jumped to it.
  flash: boolean;
  // Its actions are open over it.
  lifted: boolean;
  // Its photos' way up, while it is yours going out or not sent.
  upload?: PhotoUpload[];
  actions: LineActions;
  // Opens its actions, from a card's long press.
  onSelect: () => void;
  // Settling its poll, and a vote in it, for a chat that has polls.
  onDecide?: () => void;
  onVote?: (key: string) => void;
  // A tap on the ! of a photo line that could not be sent.
  onFailed?: () => void;
  // × on a photo going up, stopping its line.
  onStopUpload?: () => void;
  // Its words were measured to fold, and 続きを読む has come in under
  // them, after the chat was scrolled to its place.
  onFolded?: () => void;
  // A blocked member's line shown at a tap, its photo among the chat's
  // swiped through from then on.
  onReveal?: () => void;
}) {
  const {
    members,
    isGroup,
    faces,
    people,
    writerOf,
    mentionName,
    inviteOf,
    onInvite,
    openUrl,
    onMember,
    onJump,
    onLinkMenu,
    onOpenDay,
    photos,
    fetchFails,
  } = useChatScope();
  // Words past chatRules.foldLines, and whether they were opened in full.
  const [folded, setFolded] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  const foldedIn = useEffectEvent(onFolded);
  useLayoutEffect(() => {
    if (folded) {
      foldedIn();
    }
  }, [folded]);
  const toast = useContext(ToastContext);
  const member = writerOf(message.from);
  const current = member !== undefined && members.includes(member);
  const mine = member?.me === true;
  const firstOfRun = startsRun(message, previous);
  // A message whose first link is an invitation shows its group instead
  // of a page.
  const firstUrl = message.text ? firstLink(message.text) : undefined;
  const inviteCode = firstUrl && inviteOf ? inviteCodeOf(firstUrl) : undefined;
  // Nothing but a few emoji: drawn large, without a bubble. A reply keeps
  // its bubble, as the line it answers sits inside one.
  const largeEmoji =
    !quoted && message.text !== undefined && largeEmojiCount(message.text) > 0;
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
  // The day over the line, when it is the day's first.
  const day = previous?.when === message.when ? undefined : message.when;
  if (message.notice || message.unsent) {
    return (
      <ChatItem day={day} id={`message-${message.id}`}>
        <p className={chatStyle.notice}>
          {message.notice ?? unsentLine(member)}
        </p>
      </ChatItem>
    );
  }
  if (hidden) {
    return (
      <ChatItem day={day}>
        <button className={chatStyle.blocked} onClick={onReveal} type="button">
          {blockedLine}
          <span className={chatStyle.blockedShow}>表示</span>
        </button>
      </ChatItem>
    );
  }
  // Its time held back while its photos go up; its ! beside it, by the
  // last photo, once not sent.
  const status = upload && uploadOfLine(upload);
  const notSent = status === "failed";
  const pinned = message.pinned !== undefined;
  const face =
    member &&
    (faces?.[member.id] ?? <Avatar member={member} size={chatAvatarSize} />);
  return (
    <LineFrame
      avatar={
        firstOfRun &&
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
            {face}
          </button>
        ) : (
          face
        ))
      }
      day={day}
      flash={flash}
      id={`message-${message.id}`}
      mine={mine}
      name={isGroup && firstOfRun ? (member?.name ?? "") : undefined}
      runStart={firstOfRun}
    >
      <SwipeToReply
        className={cx(
          chatStyle.bubbleRow({ mine }),
          lifted && messageActions.lifted
        )}
        // Not while it goes up, nor once it could not.
        disabled={upload !== undefined}
        mine={mine}
        onReply={() => {
          actions.onReply();
        }}
      >
        {message.photos && (
          <PhotoLine
            actions={actions}
            among={photos}
            fetchFails={fetchFails}
            label={photoLabel(member)}
            mine={actions.mine}
            onSave={() => {
              toast("写真を保存しました");
            }}
            onStop={onStopUpload}
            photos={message.photos}
            quote={quote}
            upload={upload}
          />
        )}
        {!message.photos && message.days && (
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
        {largeEmoji && (
          <LargeEmoji>
            <MessageActions {...actions}>
              <button
                aria-label={`${member?.name ?? ""}のメッセージ：${message.text}。長押しでリアクションと返信`}
                className={chatStyle.tap({ mine })}
                type="button"
              >
                {message.text}
              </button>
            </MessageActions>
          </LargeEmoji>
        )}
        {!message.photos && !message.days && !message.poll && !largeEmoji && (
          // Like the app: the quoted line sits inside the bubble,
          // above a thin rule, and jumps to the original.
          <Bubble
            first={firstOfRun}
            linked={inviteCode !== undefined || message.link !== undefined}
            mine={mine}
          >
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
              {/* The quote is held with the words, a tap on it its own. */}
              <>
                {quote}
                <button
                  aria-label={`${member?.name ?? ""}のメッセージ：${plainText(message.text ?? "", mentionName)}。長押しでリアクションと返信`}
                  className={chatStyle.bubbleText}
                  // A tap on a link opens it rather than the
                  // actions, as in the chat apps.
                  onClickCapture={(event) => {
                    const url = linkElementAt(event.target)?.url;
                    if (url) {
                      event.preventDefault();
                      openUrl(url);
                      return;
                    }
                    // A mention opens that member's profile, as
                    // their picture does.
                    const mentioned = members.find(
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
              </>
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
                invite={inviteOf?.(inviteCode)}
                onLongPress={onSelect}
                onOpen={() => {
                  onInvite?.(inviteCode);
                }}
              />
            )}
            {!inviteCode && message.link && (
              <LinkCard onLongPress={onSelect} preview={message.link} />
            )}
          </Bubble>
        )}
        {notSent && (
          <button
            aria-label="送れませんでした。押すと再送か削除"
            className={chatStyle.failed}
            onClick={onFailed}
            type="button"
          >
            <CircleAlert aria-hidden="true" size={22} />
          </button>
        )}
        {!notSent && (
          <small className={chatStyle.time}>
            {(pinned || message.edited) && (
              <span className={chatStyle.timeNote({ mine })}>
                {pinned && <Pin aria-label="ピン留め中" role="img" size={11} />}
                {message.edited && "編集済み"}
              </span>
            )}
            {/* Left to the next line, or while its photo goes up, its
                room is kept, so the bubble is as wide either way
                (spec/chat.md, In a message). */}
            {status === undefined && showsTime(message, next) ? (
              message.time
            ) : (
              <span className={chatStyle.timeKept}>{message.time}</span>
            )}
          </small>
        )}
      </SwipeToReply>
      {notSent && (
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
              counted={!isGroup}
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
    </LineFrame>
  );
}

// The line a reply answers, inside the bubble over a thin rule, in the
// bubble's own text color; one line, so it never outweighs the answer.
// A photo line's first photo shows small beside it.
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
      // Its own click, even from a keyboard (MessageActions).
      data-part="quote"
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
        {quoted.photos?.[0] && (
          <img
            alt=""
            className={chatStyle.quoteThumb}
            src={quoted.photos[0].src}
          />
        )}
      </span>
      <span aria-hidden="true" className={chatStyle.bubbleRule} />
    </button>
  );
}

// A message's words with its links and mentions marked. A tap on a link
// opens it (see linkElementAt), on a mention that member's profile: they are not
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

const foldLines: CSSProperties = { "--fold-lines": chatRules.foldLines };

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
