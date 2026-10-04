import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  X,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { MotionValue } from "motion/react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

import {
  addDays,
  dateKey,
  formatMonthFromToday,
  isSameMonth,
  monthAfter,
} from "../lib/design-days";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { DoneButton, TodayButton } from "./design-header";
import { SummaryRow } from "./design-list";
import { IconMenu, MenuItem } from "./design-menu";
import { MonthName } from "./design-month-name";
import { MonthTitleButton, monthTitle } from "./design-month-picker";
import {
  monthIndex,
  RollingName,
  TodayCorner,
  useTurn,
} from "./design-rolling";
import { IconButton, srOnly } from "./design-ui";
import { useWeek } from "./design-week";

// The month at the top: the year over its number, "‹ 今月 ›" in the middle
// so it never moves with the month's width, and the screen's action on the
// right, lined up with the month digits rather than the two lines.
export const heading = {
  // The arrows kept for screen readers and the keyboard, as a skip link
  // is: out of sight until one of them has focus.
  arrowsOnFocus: css({
    "&:not(:focus-within)": {
      clipPath: "inset(50%)",
      height: "1px",
      overflow: "hidden",
      position: "absolute",
      whiteSpace: "nowrap",
      width: "1px",
    },
    display: "flex",
  }),
  // 今月 and the save menu are of different kinds, so they stand apart.
  backAtEnd: css({ display: "flex", marginRight: "12px" }),
  // Without the arrows: 今月 and the screen's action, together on the
  // month digits' line.
  corner: css({
    alignItems: "center",
    alignSelf: "flex-end",
    display: "flex",
    marginBottom: "-4px",
  }),
  bar: css({
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    justifyContent: "space-between",
    padding: "0 8px 12px",
    position: "relative",
  }),
  step: css({
    bg: "transparent",
    border: 0,
    borderRadius: "md",
    color: "text.tertiary",
    display: "grid",
    height: "40px",
    placeItems: "center",
    width: "36px",
  }),
  title: css({ flexShrink: 0, fontWeight: 400, margin: 0 }),
};

// 今月のお休み, or 10月のお休み away from this month. The month and the
// number roll as the heading's name does, following a drag of the pages
// to the month coming in, so the row is already right as the page
// lands; the words around them stay put.
export function MonthSummary({
  month,
  days,
  onOpen,
  person,
  progress,
  swiped = false,
  beside,
}: {
  month: Date;
  // The days off, or with `person` the days they are on.
  days: number;
  onOpen: () => void;
  person?: string;
  progress?: MotionValue<number>;
  swiped?: boolean;
  // The same count in the months before and after, while the pages can be
  // dragged.
  beside?: { previous: number; next: number };
}) {
  const counted = person === undefined ? "のお休み" : `、${person}と一緒`;
  const reduceMotion = useReducedMotion() ?? false;
  const turn = useTurn(monthIndex(month), swiped);
  const monthOf = (by: number) => formatMonthFromToday(monthAfter(month, by));
  const dragged = progress && beside;
  return (
    <SummaryRow
      days={
        <>
          <span className={srOnly}>{days}</span>
          <span aria-hidden="true">
            <RollingName
              end
              next={dragged ? String(beside.next) : undefined}
              previous={dragged ? String(beside.previous) : undefined}
              progress={progress}
              still={reduceMotion}
              text={String(days)}
              turn={turn}
            />
          </span>
        </>
      }
      label={
        <>
          <span className={srOnly}>
            {monthOf(0)}
            {counted}
          </span>
          <span aria-hidden="true">
            <RollingName
              next={dragged ? monthOf(1) : undefined}
              previous={dragged ? monthOf(-1) : undefined}
              progress={progress}
              still={reduceMotion}
              text={monthOf(0)}
              turn={turn}
            />
            {counted}
          </span>
        </>
      }
      onOpen={onOpen}
    />
  );
}

// The year over the month. Looking at months, its name opens a choice of
// months, left plain like minical's so the heading stays a picture: the
// swipe and the input's date picker are the ways that show. With the
// カレンダー page's おたのしみ it changes the sky over the calendar
// instead.
export function MonthHeading({
  month,
  mode,
  onPick,
  onSurprise,
  progress,
  swiped,
  beside,
}: {
  month: Date;
  mode: "view" | "edit" | "week";
  onPick: (month: Date) => void;
  onSurprise: () => void;
  // The pages being dragged, which the name follows to the month the page
  // coming in shows.
  progress: MotionValue<number>;
  swiped: boolean;
  beside?: { previous: Date; next: Date };
}) {
  const tap = useSettings((state) => state.device.monthTap);
  const name = (
    <MonthName
      beside={beside}
      month={month}
      progress={progress}
      swiped={swiped}
    />
  );
  if (mode !== "view") {
    return <h3 className={heading.title}>{name}</h3>;
  }
  if (tap === "surprise") {
    return (
      <h3 className={heading.title}>
        <button
          className={monthTitle}
          data-month-title=""
          onClick={onSurprise}
          type="button"
        >
          <span>{name}</span>
        </button>
      </h3>
    );
  }
  return (
    <h3 className={heading.title}>
      <MonthTitleButton chevron={false} month={month} onPick={onPick}>
        <span>{name}</span>
      </MonthTitleButton>
    </h3>
  );
}

// "‹ 今月 ›" sits in the middle of the heading, so it never moves with the
// width of the month; 今月 (or 今週 in the week view) stays visible and is
// disabled when there is nowhere to go back to. With `atEnd`, the month
// view has the right-hand corner free, so "今月 ‹ ›" takes it, the arrows
// together at the edge; entering drops them, as its date picker changes
// the month, leaving 完了 alone there. Without `arrows`, a swipe alone
// turns the page, as in the platforms' calendars: the corner holds 今月
// while away from it, then the save menu, 完了 or ×, and the arrows stay for
// screen readers, as a native calendar's accessibility actions, showing
// only while the keyboard is on them.
export function HeadingActions({
  mode,
  month,
  detailDate,
  onStep,
  onThisMonth,
  onThisWeek,
  onDone,
  onImage,
  onCalendar,
  closeLabel,
  progress,
  swiped,
}: {
  mode: "view" | "edit" | "week";
  month: Date;
  detailDate: Date | undefined;
  // On the month, what its × leaves in place of the save menu, while it
  // shows something other than the plain month (someone's days).
  closeLabel?: string;
  // The months' pages being dragged, which 今月 follows.
  progress: MotionValue<number>;
  swiped: boolean;
  onStep: (direction: 1 | -1) => void;
  onThisMonth: () => void;
  // Back to this week, opened on today.
  onThisWeek: () => void;
  onDone: () => void;
  // The save menu's two ways.
  onImage: () => void;
  onCalendar: () => void;
}) {
  const weekTools = useWeek();
  const week = mode === "week";
  const unit = week ? "週" : "月";
  const atToday = week
    ? weekTools
        .weekDates(detailDate ?? designToday)
        .some((date) => dateKey(date) === dateKey(designToday))
    : isSameMonth(month, designToday);
  const previous = (
    <button
      aria-label={`前の${unit}`}
      className={heading.step}
      onClick={() => {
        onStep(-1);
      }}
      type="button"
    >
      <ChevronLeft aria-hidden="true" size={21} />
    </button>
  );
  // Seen only while away from this month or week, or coming into sight
  // as the pages leave it, so never dimmed.
  const back = (
    <TodayButton onClick={week ? onThisWeek : onThisMonth} unit={unit} />
  );
  const isThisWeek = (days: number) =>
    weekTools
      .weekDates(addDays(detailDate ?? designToday, days))
      .some((date) => dateKey(date) === dateKey(designToday));
  const isThisMonth = (by: number) =>
    isSameMonth(monthAfter(month, by), designToday);
  const next = (
    <button
      aria-label={`次の${unit}`}
      className={heading.step}
      onClick={() => {
        onStep(1);
      }}
      type="button"
    >
      <ChevronRight aria-hidden="true" size={21} />
    </button>
  );
  return (
    <SwipeCorner
      back={
        <TodayCorner
          atToday={atToday}
          className={heading.backAtEnd}
          nextIsToday={week ? isThisWeek(7) : isThisMonth(1)}
          previousIsToday={week ? isThisWeek(-7) : isThisMonth(-1)}
          progress={mode === "edit" ? undefined : progress}
          swiped={swiped}
        >
          {back}
        </TodayCorner>
      }
      closeLabel={closeLabel}
      mode={mode}
      next={next}
      onCalendar={onCalendar}
      onDone={onDone}
      onImage={onImage}
      previous={previous}
    />
  );
}

// The heading's corner when a swipe alone turns the page: the arrows for
// the keyboard and screen readers, 今月 while away, then the screen's
// own: the save menu on the month, 完了 to finish ポチポチ入力, and × to
// close an opened week. The week saves each change as it is made, so it
// has nothing to finish; 完了 there read as editing, and its accent drew
// the eye to leaving rather than to the day. The month showing someone's
// days has × too, as it is a view to leave, not a month to save.
function SwipeCorner({
  closeLabel,
  mode,
  previous,
  next,
  back,
  onImage,
  onCalendar,
  onDone,
}: {
  closeLabel?: string;
  mode: "view" | "edit" | "week";
  previous: ReactNode;
  next: ReactNode;
  back: ReactNode;
  onImage: () => void;
  onCalendar: () => void;
  onDone: () => void;
}) {
  return (
    <div className={heading.corner}>
      {mode !== "edit" && (
        <div className={heading.arrowsOnFocus}>
          {previous}
          {next}
        </div>
      )}
      {mode !== "edit" && back}
      {mode === "view" && closeLabel === undefined ? (
        <IconMenu
          icon={<Download aria-hidden="true" size={21} />}
          label="この月のシフトを保存"
        >
          <MenuItem
            icon={<ImageIcon aria-hidden="true" size={18} />}
            onSelect={onImage}
            value="image"
          >
            画像で保存
          </MenuItem>
          <MenuItem
            icon={<CalendarPlus aria-hidden="true" size={18} />}
            onSelect={onCalendar}
            value="calendar"
          >
            端末カレンダーに追加
          </MenuItem>
        </IconMenu>
      ) : null}
      {mode === "edit" && <DoneButton onClick={onDone} />}
      {mode === "week" && (
        <IconButton label="閉じる" onClick={onDone}>
          <X aria-hidden="true" size={20} />
        </IconButton>
      )}
      {mode === "view" && closeLabel !== undefined && (
        <IconButton label={closeLabel} onClick={onDone}>
          <X aria-hidden="true" size={20} />
        </IconButton>
      )}
    </div>
  );
}
