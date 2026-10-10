import { css } from "styled-system/css";

import type { WidgetDay, WidgetEntry } from "../lib/design-widgets";
import { srOnly } from "./design-ui";
import {
  firstRunOr,
  DayMark,
  NAME_ROOM,
  NOTHING,
  NamedMark,
  SpokenDay,
  list,
  useOffLook,
  useShiftNames,
  useWords,
} from "./design-widgets";
import { FitText, soonestOff, spokenOff } from "./design-widgets-next-off";

// The iPhone lock screen's widgets: circular, rectangular and inline.

// ── Lock screen ─────────────────────────────────────────────────────────

// The count's room on the round face, clear of its edge: Wed fits at
// full size, Today a little smaller.
const CIRCULAR_COUNT_ROOM = 48;

export const circular = {
  count: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 1,
  }),
  root: css({
    alignItems: "center",
    // The lock screen's own round ground: AccessoryWidgetBackground.
    bg: "rgb(255 255 255 / 0.16)",
    borderRadius: "full",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    height: "100%",
    justifyContent: "center",
  }),
  word: css({ fontWeight: 600, textStyle: "caption2" }),
};

// 早出 and 残業 alone, all a round face this small has room to say.
function movedWord(day: WidgetDay) {
  if (day.early && day.late) {
    return "早出・残業";
  }
  if (day.early) {
    return "早出";
  }
  return day.late ? "残業" : undefined;
}

// Today's mark in the round one, with 早出 or 残業 under it on such a day.
export function TodayCircular({ entry }: { entry: WidgetEntry }) {
  const day = entry.today;
  const word = day.shift ? movedWord(day) : "なし";
  return (
    <div className={circular.root}>
      <span className={srOnly}>
        {day.name ?? NOTHING}
        {day.time ? ` ${day.time}` : ""}
      </span>
      <DayMark day={day} size={word ? 28 : 36} />
      {word && (
        <span aria-hidden="true" className={circular.word}>
          {word}
        </span>
      )}
    </div>
  );
}

// 休み, else 一緒 with someone, or みんな with a group.
function circularWord(entry: WidgetEntry, words: ReturnType<typeof useWords>) {
  const companion = entry.offs.with;
  if (!companion) {
    return words.circle.alone;
  }
  return companion.kind === "group" ? words.circle.all : words.circle.together;
}

// How soon the next day off comes, on the round face: 休み over the
// count, or 今日 and 明日.
export function NextOffCircular({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const next = soonestOff(entry);
  const text = next ? words.soon(next) : "–";
  return (
    <div className={circular.root}>
      <span className={srOnly}>{spokenOff(entry, next)}</span>
      <span aria-hidden="true" className={circular.word}>
        {circularWord(entry, words)}
      </span>
      <FitText
        className={circular.count}
        key={text}
        room={CIRCULAR_COUNT_ROOM}
        size={20}
      >
        {text}
      </FitText>
    </div>
  );
}

// Days the rectangular one shows, as これから's medium: seven left each a
// cramped 23pt.
const RECTANGULAR_DAYS = 5;

const rectangular = {
  day: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    minWidth: 0,
  }),
  root: css({
    alignContent: "center",
    display: "grid",
    gridTemplateColumns: `repeat(${RECTANGULAR_DAYS}, 1fr)`,
    height: "100%",
  }),
  // Today is always the first, so it is drawn as the others, as in
  // これから's columns.
  weekday: css({ color: "text.secondary", textStyle: "caption" }),
};

// Five days from today, each weekday over its mark: the days ahead at a
// glance, for anyone, where a day of 早出 or 残業 shows on its mark's
// sides as in the calendar. The weekdays are これから's (金, or FRI). No
// memo stroke: at this size on the lock screen it reads as a line
// through the weekday.
function UpcomingRectangularView({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const named = useShiftNames();
  return (
    <ol className={`${list} ${rectangular.root}`}>
      {entry.upcoming.slice(0, RECTANGULAR_DAYS).map((day) => (
        <RectangularDay
          day={day}
          key={day.date.getTime()}
          label={words.weekday(day.date)}
          named={named}
        />
      ))}
    </ol>
  );
}

function RectangularDay({
  day,
  label,
  named,
}: {
  day: WidgetDay;
  label: string;
  named: boolean;
}) {
  // A day off as in the calendar's week: its mark, or faint where
  // 休みの見せ方 leaves it empty.
  const look = useOffLook(day, true);
  return (
    <li className={rectangular.day}>
      <SpokenDay day={day} />
      <span aria-hidden="true" className={rectangular.weekday}>
        {label}
      </span>
      <NamedMark
        day={day}
        faint={look.mark === "faint"}
        named={named}
        reserve
        size={named ? 24 - NAME_ROOM : 24}
      />
    </li>
  );
}

// In the date's own font, as the system sets it after the date.
const inline = css({
  alignItems: "center",
  display: "flex",
  gap: "4px",
  overflow: "hidden",
  whiteSpace: "nowrap",
});

// One line over the clock, after the system's date: today's mark and
// name. A line of text, it names the shift where the others let the mark
// say it; changed hours would run past the date's room, and 早出 and 残業
// show on the mark's sides.
export function TodayInline({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const day = entry.today;
  if (entry.nothingEntered) {
    return <div className={inline}>{words.firstRunLine}</div>;
  }
  return (
    <div className={inline}>
      <DayMark day={day} size={18} />
      {day.name ?? NOTHING}
      <span className={srOnly}>{day.time}</span>
    </div>
  );
}

export const UpcomingRectangular = firstRunOr(UpcomingRectangularView);
