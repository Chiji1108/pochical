import { SHARED_DAYS_MAX } from "@pochical/design/limits";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useContext, useState } from "react";
import { css, cva, cx } from "styled-system/css";

import { addDays, dateKey, formatDay, monthAfter } from "../lib/design-days";
import { designToday } from "../lib/design-today";
import { Segment, SegmentedControl } from "./design-choices";
import { monthGrid } from "./design-date-picker";
import { todayMark } from "./design-day-cell";
import { MONTH_WEEKS } from "./design-day-grid";
import { everyoneOff, sameMonth } from "./design-group-data";
import type { Member } from "./design-group-data";
import { smallWeekday } from "./design-group-parts";
import { monthWithYearOf } from "./design-month-name";
import { DecideHeading, Sheet } from "./design-sheet";
import { ToastContext } from "./design-toast";
import { Note, srOnly } from "./design-ui";
import { useWeek } from "./design-week";

// Sharing days from a chat's composer (日にちを共有): the days picked on
// everyone's shifts, sent as they are or, in a group chat, put to the vote.

// Picking days to share: everyone's days off to take at once, then the
// month to tap days in.
const shareDays = {
  day: cva({
    base: {
      "&[aria-pressed=true]": { bg: "accent.fill", color: "accent.onFill" },
      _disabled: { visibility: "hidden" },
      bg: "transparent",
      border: 0,
      height: "36px",
      padding: 0,
    },
    variants: {
      together: { true: { bg: "accent.container" } },
      tone: {
        holiday: { color: "calendar.holiday" },
        plain: {},
        saturday: { color: "calendar.saturday" },
      },
    },
  }),
  days: css({
    display: "grid",
    gap: "4px",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  }),
  // みんな休み over a row of its days that scrolls sideways out to the
  // sheet's sides, as 1人ずつ's people do: one height however many there
  // are, and a half-shown day says there are more.
  suggest: css({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    // Its own part, 24px clear of the month as the switch above it is.
    marginBottom: "12px",
  }),
  // Tinted as the calendar's days everyone is off, so the row and the
  // month say the same thing; picked, filled as a picked day is.
  suggestion: css({
    "&[aria-pressed=true]": { bg: "accent.fill", color: "accent.onFill" },
    bg: "accent.container",
    border: 0,
    borderRadius: "full",
    color: "accent.default",
    flexShrink: 0,
    fontWeight: 600,
    minHeight: "32px",
    padding: "0 12px",
    textStyle: "footnote",
  }),
  // Out over the sheet's 24px sides, the first day in line with the page.
  suggestions: css({
    display: "flex",
    gap: "8px",
    margin: "0 -24px",
    overflowX: "auto",
    padding: "0 24px",
  }),
  togetherLabel: css({
    color: "accent.default",
    fontWeight: 600,
    textStyle: "footnote",
  }),
};

// Picking days to share: days everyone is off first, then any day on a
// small calendar. Several can be picked at once. In a group chat, 共有 |
// 投票 at its top puts them to the vote instead, seen from the moment it
// opens: one way in for both, as their sheet is the same.
export function DaySheet({
  open,
  onOpenChange,
  members,
  onShare,
  pollable = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  // `poll`: put to the vote rather than shared as they are.
  onShare: (days: Date[], poll: boolean) => void;
  // In a group chat, several days can be put to the vote.
  pollable?: boolean;
}) {
  return (
    <Sheet label="日にちを共有" onOpenChange={onOpenChange} open={open}>
      <DaySheetBody
        members={members}
        onClose={() => {
          onOpenChange(false);
        }}
        onShare={onShare}
        pollable={pollable}
      />
    </Sheet>
  );
}

// What is under the share sheet's heading, 12px apart; the heading keeps
// its own 16px, as on the other sheets.
const daySheetStack = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
});

// Inside the sheet, so what was picked starts over each time it opens.
function DaySheetBody({
  members,
  onClose,
  onShare,
  pollable,
}: {
  members: Member[];
  onClose: () => void;
  onShare: (days: Date[], poll: boolean) => void;
  pollable: boolean;
}) {
  const [mode, setMode] = useState<"share" | "poll">("share");
  const poll = pollable && mode === "poll";
  const weekTools = useWeek();
  const [month, setMonth] = useState(
    new Date(designToday.getFullYear(), designToday.getMonth(), 1)
  );
  const [picked, setPicked] = useState<Date[]>([]);
  const toast = useContext(ToastContext);
  // A poll needs two days to choose from.
  const canPoll = pollable && picked.length > 1;
  const isPicked = (date: Date) =>
    picked.some((item) => dateKey(item) === dateKey(date));
  const toggle = (date: Date) => {
    if (isPicked(date)) {
      setPicked(picked.filter((item) => dateKey(item) !== dateKey(date)));
      return;
    }
    // A message shares a month's worth at most; past it a day stays
    // unpicked and says why, as choosing too many photos does.
    if (picked.length >= SHARED_DAYS_MAX) {
      toast(`一度に送れるのは${SHARED_DAYS_MAX}日までです`, "problem");
      return;
    }
    setPicked([...picked, date].sort((a, b) => a.getTime() - b.getTime()));
  };
  const suggestions = Array.from({ length: 45 }, (_, index) =>
    addDays(designToday, index)
  ).filter((date) => everyoneOff(members, date));
  return (
    <>
      <DecideHeading
        action="送る"
        disabled={picked.length === 0 || (poll && !canPoll)}
        onAction={() => {
          onShare(picked, canPoll && poll);
        }}
        onCancel={onClose}
        title={poll ? "日にちの投票" : "日にちを共有"}
      />
      <div className={daySheetStack}>
        {pollable && (
          <SegmentedControl
            // Its own part, 24px clear of the calendar as parts are,
            // where the calendar's rows keep their 12px.
            className={modeSwitch}
            label="日にちをどうするか"
            onValueChange={setMode}
            value={mode}
          >
            <Segment value="share">共有</Segment>
            <Segment value="poll">投票</Segment>
          </SegmentedControl>
        )}
        {suggestions.length > 0 && (
          <div className={shareDays.suggest}>
            <span className={shareDays.togetherLabel}>みんな休み</span>
            <div className={shareDays.suggestions}>
              {suggestions.map((date) => (
                <button
                  aria-pressed={isPicked(date)}
                  className={shareDays.suggestion}
                  key={dateKey(date)}
                  onClick={() => {
                    toggle(date);
                  }}
                  type="button"
                >
                  {date.getMonth() + 1}/{date.getDate()}
                  <small className={smallWeekday}>
                    {weekTools.weekdayName(date.getDay())}
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={monthGrid.heading}>
          <button
            aria-label="前の月"
            className={monthGrid.arrow}
            onClick={() => {
              setMonth(monthAfter(month, -1));
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <strong aria-live="polite">
            <span className={srOnly}>{monthWithYearOf(month)}</span>
            <span aria-hidden="true">
              {monthWithYearOf(month, weekTools.english)}
            </span>
          </strong>
          <button
            aria-label="次の月"
            className={monthGrid.arrow}
            onClick={() => {
              setMonth(monthAfter(month, 1));
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>
        <div
          className={shareDays.days}
          // The weekdays, then room for six weeks, the most a month spans,
          // so the sheet keeps its height as the months turn and ‹ › stay
          // under the finger.
          style={{ gridTemplateRows: `auto repeat(${MONTH_WEEKS}, 36px)` }}
        >
          {weekTools.weekdays.map((day) => (
            <span
              aria-hidden="true"
              className={monthGrid.weekday}
              key={day.day}
            >
              {day.label}
            </span>
          ))}
          {weekTools.monthDates(month).map((date) => {
            const outside = !sameMonth(date, month);
            const together = !outside && everyoneOff(members, date);
            const today = dateKey(date) === dateKey(designToday);
            return (
              <button
                aria-label={`${formatDay(date)}${together ? "、みんな休み" : ""}`}
                aria-pressed={isPicked(date)}
                className={cx(
                  shareDays.day({
                    together,
                    tone: today ? "plain" : weekTools.dateTone(date),
                  }),
                  monthGrid.day,
                  today && todayMark,
                  today && monthGrid.today
                )}
                disabled={outside}
                key={dateKey(date)}
                onClick={() => {
                  toggle(date);
                }}
                type="button"
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        {/* Offered once there is more than one day to choose from, as
            LINE's 日程調整 is a way of choosing among days. */}
        <Note>{dayNote(picked.length, poll)}</Note>
      </div>
    </>
  );
}

const modeSwitch = css({ marginBottom: "12px" });

// What sending will do, under the days.
function dayNote(count: number, poll: boolean) {
  if (poll && count < 2) {
    return "候補の日を2日以上選んでください。うすく色のついた日は、みんな休みの日です。";
  }
  if (count === 0) {
    return "うすく色のついた日は、みんな休みの日です。";
  }
  return poll
    ? `${count}日の中から、みんなが行ける日を投票で決めます。`
    : `${count}日分のみんなのシフトを送ります。`;
}
