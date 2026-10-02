import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { dateKey, formatDay } from "../lib/design-days";
import { designToday } from "../lib/design-today";
import { todayMark } from "./design-day-cell";
import {
  everyoneOff,
  patternOn,
  sameMonth,
  weekLength,
} from "./design-group-data";
import type { Group, Member } from "./design-group-data";
import { Avatar, cornerMonth, Mark, toneColor } from "./design-group-parts";
import { offTile, pickedFrame } from "./design-group-shifts-parts";
import { shortMonthOf } from "./design-month-name";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";

// 週ごと: the shift table as weeks, a row per member under each week's
// dates, also the group hub's glance at this week.

// 週ごと: a block per week, dates across and a row per person, the
// weekdays pinned above while the page scrolls. Compact, it is the single
// week inside the hub's card, without its own frame.
export const weekTable = {
  dates: css({ fontSize: "11px", fontWeight: 600, textAlign: "center" }),
  name: css({ display: "grid", placeItems: "center" }),
  nameButton: css({ bg: "transparent", border: 0, padding: 0 }),
  root: css({ display: "flex", flexDirection: "column", gap: "12px" }),
  row: cva({
    base: {
      alignItems: "center",
      display: "grid",
      gridTemplateColumns: "34px repeat(7, minmax(0, 1fr))",
    },
    variants: {
      compact: {
        true: { gridTemplateColumns: "28px repeat(7, minmax(0, 1fr))" },
      },
    },
  }),
  // Room above the dates and below the last person, so the picked day's
  // frame and the shared days off stay clear of the edge. Inside the
  // hub's card it takes the card's ground: the screen's would cut a hole
  // in it in dark mode.
  week: cva({
    base: {
      bg: "background.base",
      border: "1px solid token(colors.separator)",
      borderRadius: "2xl",
      overflow: "hidden",
      padding: "4px 0",
    },
    variants: {
      compact: {
        true: { bg: "transparent", border: 0, borderRadius: 0, padding: 0 },
      },
    },
  }),
  // A list of months: its rows placed where they fall, only those in
  // sight drawn.
  item: css({ left: 0, position: "absolute", top: 0, width: "100%" }),
  list: css({ position: "relative" }),
  // A month's heading between the weeks of a list of months, with room
  // above to set the months apart.
  divider: css({ paddingTop: "24px" }),
  weekdays: cva({
    base: { color: "text.quaternary", fontSize: "10px", textAlign: "center" },
    variants: {
      pinned: {
        true: {
          bg: "background.base",
          margin: "-8px 0 -8px",
          padding: "8px 0 4px",
          position: "sticky",
          top: "var(--pinned-top, -8px)",
          zIndex: 5,
        },
      },
    },
  }),
};

// A date or a person's day in 週ごと.
const weekCell = cva({
  base: { isolation: "isolate", position: "relative" },
  compoundVariants: [
    { button: true, css: { padding: 0 }, kind: "date" },
    // The band is the day's tiles joined down the column: as far in from
    // its sides, with their corners, its ends 3px clear of the week's
    // edge. The picked frame has the same shape, so picking the day only
    // draws the frame round it.
    {
      css: {
        "&::before": {
          ...offTile,
          borderRadius: "token(radii.sm) token(radii.sm) 0 0",
          inset: "-1px 3px 0",
        },
      },
      kind: "date",
      together: true,
    },
    {
      css: { "&::before": { borderRadius: 0, inset: "0 3px" } },
      kind: "cell",
      together: true,
    },
    {
      css: {
        "&::before": {
          borderRadius: "0 0 token(radii.sm) token(radii.sm)",
          inset: "0 3px -1px",
        },
      },
      kind: "cell",
      last: true,
      together: true,
    },
    // In the small weekly table the tiles sit tighter, 2px above and
    // below, and the band is those tiles joined, as in the big one.
    {
      compact: true,
      css: { "&::before": { inset: "2px 3px 0" } },
      kind: "date",
      together: true,
    },
    {
      compact: true,
      css: { "&::before": { inset: "0 3px" } },
      kind: "cell",
      together: true,
    },
    {
      compact: true,
      css: { "&::before": { inset: "0 3px 2px" } },
      kind: "cell",
      last: true,
      together: true,
    },
    // Tiles sit tighter in the small weekly table.
    {
      compact: true,
      css: { "&::before": { borderRadius: "sm", inset: "2px 3px" } },
      off: true,
      together: false,
    },
    { compact: true, css: { height: "26px" }, kind: "cell" },
    {
      css: {
        "&::after": {
          borderRadius: "token(radii.sm) token(radii.sm) 0 0",
          borderWidth: "1.5px 1.5px 0",
          inset: "-1px 3px 0",
        },
      },
      kind: "date",
      picked: true,
    },
    {
      css: { "&::after": { borderWidth: "0 1.5px", inset: "0 3px" } },
      kind: "cell",
      picked: true,
    },
    {
      css: {
        "&::after": {
          borderRadius: "0 0 token(radii.sm) token(radii.sm)",
          borderWidth: "0 1.5px 1.5px",
          inset: "0 3px -1px",
        },
      },
      kind: "cell",
      last: true,
      picked: true,
    },
    // The small table's frame follows its band.
    {
      compact: true,
      css: { "&::after": { inset: "2px 3px 0" } },
      kind: "date",
      picked: true,
    },
    {
      compact: true,
      css: { "&::after": { inset: "0 3px 2px" } },
      kind: "cell",
      last: true,
      picked: true,
    },
  ],
  defaultVariants: { compact: false, last: false, off: false, together: false },
  variants: {
    button: {
      true: {
        bg: "transparent",
        border: 0,
        font: "inherit",
        padding: 0,
        width: "100%",
      },
    },
    compact: { false: {}, true: {} },
    kind: {
      cell: { display: "grid", height: "30px", placeItems: "center" },
      date: { padding: "8px 0 4px" },
    },
    last: { false: {}, true: {} },
    off: { false: {}, true: { "&::before": offTile } },
    outside: { true: { opacity: 0.35 } },
    picked: { true: { "&::after": pickedFrame } },
    together: { false: {}, true: {} },
    tone: {
      holiday: { color: "calendar.holiday" },
      plain: {},
      saturday: { color: "calendar.saturday" },
    },
  },
});

const compactAvatarSize = 20;

// One person's day in the weekly table. With `onPick` it is a button that
// shows the whole day by name below the table.
// The date atop a week's column; like the marks under it, it picks the day.
function WeekDate({
  date,
  members,
  month,
  picked,
  compact,
  onPick,
}: {
  date: Date;
  members: Member[];
  month?: Date;
  picked: boolean;
  // In the hub card's small week, as its cells are.
  compact: boolean;
  onPick?: (date: Date) => void;
}) {
  const weekTools = useWeek();
  const look = {
    compact,
    kind: "date",
    outside: !(!month || sameMonth(date, month)),
    picked,
    together: everyoneOff(members, date),
    tone: weekTools.dateTone(date),
  } as const;
  // Without a month dimming the days around it, the 1st names its month,
  // as where one week runs into the next month.
  const name =
    !month && date.getDate() === 1
      ? `${date.getMonth() + 1}/1`
      : date.getDate();
  const label =
    dateKey(date) === dateKey(designToday) ? (
      <span className={todayMark}>{name}</span>
    ) : (
      name
    );
  if (!onPick) {
    return <span className={weekCell(look)}>{label}</span>;
  }
  return (
    <button
      aria-label={`${formatDay(date)}の予定を見る`}
      aria-pressed={picked}
      className={weekCell({ ...look, button: true })}
      data-pick-day={dateKey(date)}
      onClick={() => {
        onPick(date);
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function WeekCell({
  date,
  member,
  members,
  month,
  picked,
  compact,
  last,
  onPick,
}: {
  date: Date;
  member: Member;
  members: Member[];
  month?: Date;
  picked: boolean;
  compact: boolean;
  // The week's last person, where a shared day off and the frame end.
  last: boolean;
  onPick?: (date: Date) => void;
}) {
  const item = patternOn(member, date);
  const look = {
    compact,
    kind: "cell",
    last,
    off: item?.off === true,
    outside: !(!month || sameMonth(date, month)),
    picked,
    together: everyoneOff(members, date),
  } as const;
  const className = weekCell(look);
  const label = `${formatDay(date)} ${member.name}：${item?.name ?? "未入力"}`;
  if (!onPick) {
    return (
      <span aria-label={label} className={className} role="img">
        <Mark date={date} member={member} size={18} />
      </span>
    );
  }
  return (
    <button
      aria-label={`${label}。押すとその日のみんなの予定`}
      aria-pressed={picked}
      className={weekCell({ ...look, button: true })}
      onClick={() => {
        onPick(date);
      }}
      type="button"
    >
      <Mark date={date} member={member} size={18} />
    </button>
  );
}

// A block per week: dates across, one row per member underneath.
export function MemberTable({
  group,
  dates,
  body,
  month,
  compact = false,
  onMember,
  onPickDay,
  picked,
}: {
  group: Group;
  dates: Date[];
  // Rows a list of months draws in place of the weeks, under the same
  // pinned weekdays.
  body?: ReactNode;
  // The month shown; days outside it are dimmed.
  month?: Date;
  // A single week inside a card, without its own frame.
  compact?: boolean;
  // Opens a member's legend from their avatar.
  onMember?: (member: Member) => void;
  // Picks a day to list everyone's shifts with names.
  onPickDay?: (date: Date) => void;
  picked?: Date;
}) {
  const weekTools = useWeek();
  const weeks = Array.from({ length: dates.length / weekLength }, (_, row) =>
    dates.slice(row * weekLength, (row + 1) * weekLength)
  );
  return (
    <div className={weekTable.root}>
      <div
        aria-hidden="true"
        className={cx(
          weekTable.row({ compact }),
          weekTable.weekdays({ pinned: !compact })
        )}
        data-pinned={compact ? undefined : ""}
      >
        {/* Pinned above the weeks, so the month stays in sight; a list of
            months names its months in their headings. */}
        <span className={cornerMonth}>
          {month && !compact && !body
            ? shortMonthOf(month, weekTools.english)
            : ""}
        </span>
        {weekTools.weekdays.map((day) => (
          <span className={toneColor[day.tone]} key={day.day}>
            {day.label}
          </span>
        ))}
      </div>
      {body ??
        weeks.map((week) => (
          <WeekBlock
            compact={compact}
            group={group}
            key={dateKey(week[0])}
            month={month}
            onMember={onMember}
            onPickDay={onPickDay}
            picked={picked}
            week={week}
          />
        ))}
    </div>
  );
}

// One week of 週ごと: its dates, then a row per member.
export function WeekBlock({
  group,
  week,
  month,
  compact = false,
  picked,
  onMember,
  onPickDay,
}: {
  group: Group;
  week: Date[];
  month?: Date;
  compact?: boolean;
  picked?: Date;
  onMember?: (member: Member) => void;
  onPickDay?: (date: Date) => void;
}) {
  // Short rows in the card: smaller faces keep a gap between them, the
  // height of the day-off tiles beside them.
  const avatarSize = compact ? compactAvatarSize : undefined;
  const isPicked = (date: Date) =>
    picked !== undefined && dateKey(picked) === dateKey(date);
  return (
    <section
      aria-label={`${formatDay(week[0])}からの週`}
      className={weekTable.week({ compact })}
    >
      <div className={cx(weekTable.row({ compact }), weekTable.dates)}>
        <span />
        {week.map((date) => (
          <WeekDate
            compact={compact}
            date={date}
            key={dateKey(date)}
            members={group.members}
            month={month}
            onPick={onPickDay}
            picked={isPicked(date)}
          />
        ))}
      </div>
      {group.members.map((member, row) => (
        <div className={weekTable.row({ compact })} key={member.id}>
          {onMember ? (
            <button
              aria-label={`${member.name}のシフトパターン`}
              className={cx(weekTable.name, weekTable.nameButton)}
              onClick={() => {
                onMember(member);
              }}
              type="button"
            >
              <Avatar member={member} size={avatarSize} />
            </button>
          ) : (
            <span className={weekTable.name}>
              <Avatar member={member} size={avatarSize} />
              <span className={srOnly}>{member.name}</span>
            </span>
          )}
          {week.map((date) => (
            <WeekCell
              compact={compact}
              date={date}
              key={dateKey(date)}
              last={row === group.members.length - 1}
              member={member}
              members={group.members}
              month={month}
              onPick={onPickDay}
              picked={isPicked(date)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}
