import { Popover, Portal } from "@ark-ui/react";
import { CalendarCheck, Check } from "lucide-react";
import { useContext, useState } from "react";
import { css, cva, cx } from "styled-system/css";

import { dateKey, formatDay } from "../lib/design-days";
import { MessageActions } from "./design-chat-actions";
import { reactionPill } from "./design-chat-cards";
import { chatAvatarSize } from "./design-chat-style";
import { everyoneOff } from "./design-group-data";
import type { Member, Poll } from "./design-group-data";
import { Avatar, smallWeekday, toneColor } from "./design-group-parts";
import { DecideHeading, PhoneContext, Sheet } from "./design-sheet";
import { ChoiceList, ChoiceRow, menuStyle } from "./design-ui";
import { useWeek } from "./design-week";

// Days put to the vote in a group chat (spec/chat.md, Polls): the card
// everyone votes on, and the sheet its writer settles it with.

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
export function PollCard({
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
export function DecidePollSheet({
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
