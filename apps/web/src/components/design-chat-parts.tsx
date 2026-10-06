import { chatRules } from "@pochical/design/chat";
import { BellOff } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { css, cx } from "styled-system/css";

import { chatRow, chatStyle } from "./design-chat-style";
import { badge } from "./design-group-parts";
import { listRow } from "./design-list";
import { srOnly } from "./design-ui";

// What every chat draws alike, the group chats and the support chat: a
// chat's row in a list, the frame a line sits in, and the bubble or the
// large emoji its words are drawn in. Each chat fills
// them with its own, so the two never drift apart.

// A chat whose notifications are off, after its name in the list and in
// its own header, as chat apps mark a muted room.
const mutedMark = css({ color: "text.tertiary", flexShrink: 0 });

export function MutedMark() {
  return (
    <BellOff aria-label="通知オフ" className={mutedMark} role="img" size={14} />
  );
}

// A chat in a list: its face, who it is with and its latest line, and at
// the end that line's time and the count of lines not read yet.
export function ChatListRow({
  label,
  icon,
  preview,
  time,
  unread,
  mentioned = false,
  muted = false,
  onOpen,
}: {
  label: string;
  icon: ReactNode;
  // The latest line, or what to say before there is one.
  preview: string;
  // The latest line's time, once there is one.
  time?: string;
  unread: number;
  // An unread line mentions you: an @ beside the count, as Telegram marks
  // one, so it is found among chats whose notifications are off.
  mentioned?: boolean;
  muted?: boolean;
  onOpen: () => void;
}) {
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
        <small className={chatRow.preview}>{preview}</small>
      </span>
      {(time !== undefined || unread > 0) && (
        <span className={chatRow.meta}>
          {time !== undefined && <small className={chatRow.time}>{time}</small>}
          {unread > 0 && (
            <span className={chatRow.badges}>
              {mentioned && (
                <span className={chatRow.mention}>
                  @<span className={srOnly}>自分へのメンションあり、</span>
                </span>
              )}
              <span className={badge} role="status">
                {unread}
                <span className={srOnly}>件の未読</span>
              </span>
            </span>
          )}
        </span>
      )}
    </button>
  );
}

// One place in a chat's lines, under the day it starts when it is the
// first of that day.
export function ChatItem({
  day,
  id,
  flash = false,
  children,
}: {
  // The day, when this line is its first.
  day?: string;
  id?: string;
  // Rung, as a pin or a quote jumped to it.
  flash?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={chatStyle.item({ flash })} id={id}>
      {day !== undefined && <span className={chatStyle.when}>{day}</span>}
      {children}
    </li>
  );
}

// A line someone wrote, as the messaging apps draw one: the others' on
// the left with a column for their face and their name over it at the
// start of a run, yours on the right. What the line holds (its bubble,
// time, reactions) goes in its body.
export function LineFrame({
  mine,
  avatar,
  name,
  children,
  ...item
}: {
  day?: string;
  id?: string;
  flash?: boolean;
  mine: boolean;
  // The face, at the start of a run; the column stays either way, so the
  // others' lines start at one edge.
  avatar?: ReactNode;
  // Over the line, at the start of a run in a chat of more than two.
  name?: string;
  children: ReactNode;
}) {
  return (
    <ChatItem {...item}>
      <span className={chatStyle.message({ mine })}>
        {!mine && <span className={chatStyle.avatar}>{avatar}</span>}
        <span className={chatStyle.body({ mine })}>
          {!mine && name !== undefined && (
            <small className={chatStyle.name}>{name}</small>
          )}
          {children}
        </span>
      </span>
    </ChatItem>
  );
}

// The tail on a run's first bubble, flicking up and out from its top
// corner toward the writer's side, as LINE draws one: drawn for the
// others' side and mirrored for yours.
export function BubbleTail({ mine }: { mine: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={chatStyle.tail({ mine })}
      viewBox="0 0 21 22"
    >
      <path d="M7 22C6 12 3 5 0 0c5 1 11 2 21 2v20Z" fill="currentColor" />
    </svg>
  );
}

// A line's words in their bubble: the others' on the left in a fill,
// yours on the right in the accent, the first of a run with a tail toward
// the writer. A bubble with a link's page under its words is wide enough
// for the page (`linked`).
export function Bubble({
  mine,
  first,
  linked = false,
  children,
}: {
  mine: boolean;
  first: boolean;
  linked?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={cx(chatStyle.bubbleHold, linked && chatStyle.linked)}>
      {first && <BubbleTail mine={mine} />}
      <span className={chatStyle.bubble({ mine })} data-part="bubble">
        {children}
      </span>
    </span>
  );
}

// The size LargeEmoji draws at. Panda reads styles before the code runs,
// so it reaches them as a variable rather than from chatRules.
const largeEmojiSize: CSSProperties = {
  "--large-emoji-size": `${chatRules.largeEmojiSize}px`,
};

// A message of nothing but a few emoji (spec/chat.md, Large emoji), drawn
// large without a bubble in its place, as iMessage does.
export function LargeEmoji({ children }: { children: ReactNode }) {
  return (
    <span
      className={chatStyle.largeEmoji}
      data-part="bubble"
      style={largeEmojiSize}
    >
      {children}
    </span>
  );
}
