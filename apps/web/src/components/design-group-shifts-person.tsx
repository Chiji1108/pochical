import type { MotionValue } from "motion/react";
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { css, cx } from "styled-system/css";

import { dateKey, formatDay, monthAfter } from "../lib/design-days";
import { designToday } from "../lib/design-today";
import { dayName } from "../lib/text-limits";
import { dayCell, dayParts, todayMark } from "./design-day-cell";
import { everyoneOff, patternOn, sameMonth } from "./design-group-data";
import type { Group, Member } from "./design-group-data";
import { Avatar, MemberLook, MemberMark } from "./design-group-parts";
import { monthKey, people } from "./design-group-shifts-parts";
import {
  ChoiceChip,
  ChoiceGrid,
  dayGrid,
  dayGridHeight,
  MONTH_WEEKS,
  Note,
  Pager,
  WeekdayRow,
} from "./design-ui";
import { useWeek } from "./design-week";
import { useDisplayColor } from "./shift-mark";

// 1人ずつ: one member's month at a time, picked from the row of people
// and paged through.

// 1人ずつ: who to show, above the month.
export function PeoplePicker({
  members,
  picked,
  onPick,
}: {
  members: Member[];
  picked: Member;
  onPick: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Keep the chosen person in sight, sideways only, so the page itself does
  // not jump.
  useEffect(() => {
    const list = listRef.current;
    const button = list?.querySelector<HTMLElement>(
      `[data-member="${picked.id}"]`
    );
    if (!(list && button)) {
      return;
    }
    // Clear of the room at the row's ends, where the page's edge is, as
    // wide as the first chip is in.
    const inset =
      list.querySelector<HTMLElement>("[data-member]")?.offsetLeft ?? 0;
    const start = button.offsetLeft - inset;
    const end = button.offsetLeft + button.offsetWidth + inset;
    if (start < list.scrollLeft) {
      list.scrollTo({ behavior: "smooth", left: start });
    } else if (end > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ behavior: "smooth", left: end - list.clientWidth });
    }
  }, [picked.id]);
  return (
    <ChoiceGrid
      className={people.list}
      label="表示する人"
      onValueChange={onPick}
      ref={listRef}
      value={picked.id}
    >
      {/* The row scrolls, so it clips anything drawn outside a chip: the
          focus ring goes inside. */}
      {members.map((member) => (
        <ChoiceChip
          avatar
          className={people.choice}
          data-member={member.id}
          key={member.id}
          ring="inside"
          value={member.id}
        >
          <Avatar member={member} />
          {member.name}
        </ChoiceChip>
      ))}
    </ChoiceGrid>
  );
}

// 1人ずつ: one member at a time, in the same kind of calendar as your own.
// Shift names always show under the marks and days off are always lit,
// whatever the member's style, so no separate list of their patterns is
// needed. A swipe turns it, as the calendar tab: the weekdays stay and
// the months go by under them.
export function PersonPager({
  group,
  member,
  month,
  picked,
  onMonth,
  onPickDay,
  progress,
}: {
  group: Group;
  member: Member;
  month: Date;
  picked?: Date;
  // Called as a swipe lands on the month before or after.
  onMonth: (month: Date) => void;
  // Set to how far the pages are dragged, for the month row.
  progress: MotionValue<number>;
  onPickDay: (date: Date) => void;
}) {
  const weekTools = useWeek();
  return (
    <>
      <div>
        <WeekdayRow />
        <Pager
          onStep={(direction) => {
            onMonth(monthAfter(month, direction));
          }}
          progress={progress}
          page={monthKey(month)}
          renderPage={(offset) => {
            const shown = monthAfter(month, offset);
            return (
              <PersonGrid
                dates={weekTools.monthDates(shown)}
                group={group}
                member={member}
                month={shown}
                onPickDay={onPickDay}
                picked={picked}
              />
            );
          }}
        />
      </div>
      <PersonNote member={member} />
    </>
  );
}

function PersonGrid({
  group,
  member,
  dates,
  month,
  picked,
  onPickDay,
}: {
  group: Group;
  member: Member;
  dates: Date[];
  month: Date;
  picked?: Date;
  onPickDay: (date: Date) => void;
}) {
  const me = group.members.find((item) => item.me);
  return (
    <div className={dayGrid} style={{ minHeight: dayGridHeight(MONTH_WEEKS) }}>
      <MemberLook member={member}>
        {dates.map((date) => (
          <PersonDay
            date={date}
            key={dateKey(date)}
            me={me}
            member={member}
            onPick={onPickDay}
            outside={!sameMonth(date, month)}
            picked={picked !== undefined && dateKey(picked) === dateKey(date)}
          />
        ))}
      </MemberLook>
    </div>
  );
}

// Only what the look cannot tell: that a pressed date opens the day goes
// without saying, as on your own calendar.
function PersonNote({ member }: { member: Member }) {
  if (member.me) {
    return null;
  }
  return <Note>薄い枠の日は、自分も休みの日です。</Note>;
}

// One day of 1人ずつ, drawn like a day of your own calendar: the shift name
// always shows, a day off takes its pattern's tint, and a day you are both
// off is framed. Pressing it opens everyone's shifts that day.
function PersonDay({
  date,
  member,
  me,
  outside,
  picked,
  onPick,
}: {
  date: Date;
  member: Member;
  me?: Member;
  outside: boolean;
  picked: boolean;
  onPick: (date: Date) => void;
}) {
  const { isColoredHoliday } = useWeek();
  const today = dateKey(date) === dateKey(designToday);
  const item = outside ? undefined : patternOn(member, date);
  // In their カラー, like their marks.
  const { tint } = useDisplayColor(item?.look.color ?? 0);
  const withMe =
    !(outside || member.me) &&
    me !== undefined &&
    everyoneOff([me, member], date);
  const off = item?.off === true;
  // The calendar's own day, with a frame when you are off too.
  // Framed when you are off too, unless the picked day's own frame is on
  // it: the styles are merged, as two classes for one property would leave
  // the winner to the stylesheet's order. The frame stays inside the day,
  // or it would show at the edge of the month beside.
  const className = css(
    dayCell.raw({ active: picked, off, outside }),
    withMe && !picked
      ? {
          outline: "1.5px solid token(colors.accent.border)",
          outlineOffset: "-1.5px",
        }
      : {}
  );
  const style = off ? ({ "--off-tint": tint } as CSSProperties) : undefined;
  const content = (
    <>
      <span
        className={cx(
          dayParts.date,
          outside && dayParts.dateOutside,
          isColoredHoliday(date) && !today && dayParts.holiday
        )}
      >
        <span className={today ? todayMark : undefined}>{date.getDate()}</span>
      </span>
      {item && (
        <>
          <span className={dayParts.mark}>
            <MemberMark
              date={date}
              look={item.look}
              member={member}
              size={21}
            />
          </span>
          <span className={dayParts.label}>{dayName(item.name)}</span>
        </>
      )}
    </>
  );
  if (outside) {
    return (
      <div aria-hidden="true" className={className} style={style}>
        {content}
      </div>
    );
  }
  return (
    <button
      aria-label={`${formatDay(date)}：${item?.name ?? "未入力"}${withMe ? "、自分も休み" : ""}。押すとその日のみんなの予定`}
      aria-pressed={picked}
      className={className}
      data-active={picked || undefined}
      data-pick-day={dateKey(date)}
      onClick={() => {
        onPick(date);
      }}
      style={style}
      type="button"
    >
      {content}
    </button>
  );
}
