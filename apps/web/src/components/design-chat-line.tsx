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
  linkAt,
  linkElementAt,
  mentionAt,
  MessageActions,
  messageActions,
  openLink,
} from "./design-chat-actions";
import type { LineActions, LinkMenuAt } from "./design-chat-actions";
import {
  DayCard,
  InviteCard,
  LinkCard,
  PhotoLine,
  ReactionPill,
} from "./design-chat-cards";
import type { InviteLook, Upload } from "./design-chat-cards";
import { ChatItem, LineFrame } from "./design-chat-parts";
import { PollCard } from "./design-chat-poll";
import { chatAvatarSize, chatStyle, largeEmojiSize } from "./design-chat-style";
import { blockedLine, summaryOf, unsentLine } from "./design-chat-summary";
import type { Group, Member, Message } from "./design-group-data";
import { Avatar, memberButton } from "./design-group-parts";
import { ToastContext } from "./design-toast";

// A chat's lines as they are drawn: each line with who wrote it, the
// line it answers, its words (links and mentions in them, folded when
// long), its time and its reactions.

// What every line of a chat shares: the chat it is in, who wrote what,
// and where a tap in it goes. ChatPage gives it once for all its lines.
export type ChatScope = {
  group: Group;
  isGroup: boolean;
  // Who a shared day shows: everyone, or the two people in a direct chat.
  people: Member[];
  writerOf: (id?: string) => Member | undefined;
  mentionName: (id: string) => string;
  inviteOf: (code: string) => InviteLook | undefined;
  onInvite: (code: string) => void;
  onMember?: (member: Member) => void;
  onJump: (id: string) => void;
  onLinkMenu: (at: LinkMenuAt) => void;
  onOpenDay: (date: Date) => void;
};

export const ChatContext = createContext<ChatScope | undefined>(undefined);

function useChatScope() {
  const scope = useContext(ChatContext);
  if (!scope) {
    throw new Error("A chat's line is drawn inside ChatContext");
  }
  return scope;
}

// One line of the chat as it is drawn: a message, or one of the app's.
export function MessageLine({
  message,
  previous,
  quoted,
  hidden,
  flash,
  lifted,
  upload,
  actions,
  onSelect,
  onDecide,
  onVote,
  onFailed,
  onFolded,
}: {
  message: Message;
  // The line above, after which a new day or a new run starts.
  previous?: Message;
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
  // Opens its actions, from a card's long press.
  onSelect: () => void;
  onDecide: () => void;
  onVote: (key: string) => void;
  onFailed: () => void;
  // Its words were measured to fold, and 続きを読む has come in under
  // them, after the chat was scrolled to its place.
  onFolded: () => void;
}) {
  const {
    group,
    isGroup,
    people,
    writerOf,
    mentionName,
    inviteOf,
    onInvite,
    onMember,
    onJump,
    onLinkMenu,
    onOpenDay,
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
  if (hidden && !revealed) {
    return (
      <ChatItem day={day}>
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
      </ChatItem>
    );
  }
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
            <Avatar member={member} size={chatAvatarSize} />
          </button>
        ) : (
          <Avatar member={member} size={chatAvatarSize} />
        ))
      }
      day={day}
      flash={flash}
      id={`message-${message.id}`}
      mine={mine}
      name={isGroup && firstOfRun ? (member?.name ?? "") : undefined}
    >
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
            mine={actions.mine}
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
        {largeEmoji && (
          <span className={chatStyle.largeEmoji} data-part="bubble">
            <MessageActions {...actions}>
              <button
                aria-label={`${member?.name ?? ""}のメッセージ：${message.text}。長押しでリアクションと返信`}
                className={chatStyle.largeEmojiText}
                style={largeEmojiSize}
                type="button"
              >
                {message.text}
              </button>
            </MessageActions>
          </span>
        )}
        {!message.photo && !message.days && !message.poll && !largeEmoji && (
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
                    (other) => !other.me && other.id === mentionAt(event.target)
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
    </LineFrame>
  );
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
