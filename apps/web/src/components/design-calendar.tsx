import {
  COWORKERS_MAX,
  PATTERNS_PER_PAGE,
  textLimits,
} from "@pochical/design/limits";
import {
  ArrowRight,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";
import type { MotionValue } from "motion/react";
import { useContext, useState } from "react";
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import {
  addDays,
  dateKey,
  daysMovedOn,
  daysOfMonth,
  formatDay,
  formatMonthDay,
  formatMonthFromToday,
  formatYearMonth,
  formatYearMonthDay,
  gapDaysIn,
  isSameMonth,
  keepDetails,
  membersOrNone,
  monthAfter,
  nextDayOf,
  selectedAfter,
  timeChangeOf,
  timeRange,
  withShiftEntered,
} from "../lib/design-days";
import type { DayEntry, Schedule } from "../lib/design-days";
import { isDayOff, presetPatterns, usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { useChangeDays, useUser } from "../lib/design-user-store";
import { composing, limitText } from "../lib/text-limits";
import { coworkersFull, useCoworkerList } from "./design-coworkers";
import { InputDatePicker } from "./design-date-picker";
import { DayCell } from "./design-day-cell";
import { GapSheet } from "./design-gap-sheet";
import { BreakdownSheet, useShownWith } from "./design-month-breakdown";
import { MonthName } from "./design-month-name";
import { MonthTitleButton, monthTitle } from "./design-month-picker";
import {
  monthIndex,
  RollingName,
  TodayCorner,
  useTurn,
} from "./design-rolling";
import { ImagePreviewPage, SaveSheet } from "./design-save-sheet";
import { ConfirmDialog } from "./design-sheet";
import { surpriseStyles, useSurprise } from "./design-surprise";
import { TabBar } from "./design-tab-bar";
import type { Tab } from "./design-tab-bar";
import { ToastContext } from "./design-toast";
import {
  Button,
  Chip,
  ChipGroup,
  dayGrid,
  DestructiveButton,
  DoneButton,
  IconButton,
  IconMenu,
  LimitedInput,
  LimitedTextArea,
  List,
  ListRow,
  listRow,
  MenuItem,
  MenuPicker,
  PageDots,
  Pager,
  PullDownMenu,
  Screen,
  srOnly,
  SummaryRow,
  TimeRange,
  TodayButton,
  WeekdayRow,
} from "./design-ui";
import { useWeek, weekdayNames } from "./design-week";
import { FoldingGrid, useWeekFold } from "./design-week-fold";
import { OffDisplayContext, ShiftMark } from "./shift-mark";

// The calendar tab: the month, or a week folded out of it with a day's
// details, its summary, and entering the shifts day by day. It stays put
// while another tab is shown, as a tab keeps its place.
export function DesignCalendar({
  initialEditing,
  initialDay,
  initialDetail,
  month,
  onMonth: setMonth,
  schedule,
  shown: tabShown,
  covered,
  onTab,
}: {
  initialEditing: boolean;
  initialDay: number;
  initialDetail?: Date;
  month: Date;
  onMonth: (month: Date) => void;
  // The days as they show, worked out through the month in view.
  schedule: Schedule;
  // Its tab is the one shown; and whether a screen covers it, like
  // joining a group.
  shown: boolean;
  covered: boolean;
  onTab: (tab: Tab) => void;
}) {
  // The sheet open over the phone, if any; one at a time.
  const [openSheet, setOpenSheet] = useState<
    "breakdown" | "save" | "gap" | null
  >(null);
  const sheetChange = (name: typeof openSheet) => (open: boolean) => {
    setOpenSheet(open ? name : null);
  };
  // Blank days between entered ones, asked about when entering ends.
  const [gapDays, setGapDays] = useState<Date[]>([]);
  // Whether the sheet offers showing days off blank: decided as it opens,
  // so switching it on there does not take the switch away.
  const [offerBlank, setOfferBlank] = useState(false);
  const setCalendarOptions = useSettings((state) => state.setCalendarOptions);
  // Whether the save sheet opened because the month was just filled in.
  const [saveCompletion, setSaveCompletion] = useState(false);
  // Whether it opened straight on adding to the device calendar.
  const [saveToCalendar, setSaveToCalendar] = useState(false);
  const [imagePreview, setImagePreview] = useState(false);
  const offDisplay = useContext(OffDisplayContext);
  const imageOptions = useSettings((state) => state.device.imageOptions);
  const setImageOptions = useSettings((state) => state.setImageOptions);
  const coworkerNames = useUser((state) => state.coworkers);
  const surprise = useSurprise();
  // A change keeps only what differs from the repeating orders as the
  // person's own.
  const onChange = useChangeDays(month);
  // How far the pages are dragged, -1 to 1 toward the next, which the
  // month's name follows; and the month a swipe last landed on, whose name
  // the drag has already brought in.
  const pageDrag = useMotionValue(0);
  const [swipedTo, setSwipedTo] = useState<string>();
  const ownPatterns = useUser((state) => state.patterns);
  const setPatterns = useUser((state) => state.setPatterns);
  const patternKeys = ownPatterns.map((pattern) => pattern.id);
  const book = usePatterns();
  const sharing = useUser((state) => state.groups.length > 0);
  const weekTools = useWeek();
  const dates = weekTools.monthDates(month);
  const monthDays = dates.filter(
    (date) => date.getMonth() === month.getMonth()
  );
  const daysOffIn = (days: Date[]) =>
    days.filter((date) => {
      const shift = schedule[dateKey(date)]?.shift;
      return shift !== undefined && isDayOff(book[shift]);
    }).length;
  const daysOff = daysOffIn(monthDays);
  // Someone picked in 今月の内訳, whose days the calendar shows.
  const shown = useShownWith(coworkerNames, schedule);
  const summaryIn = (days: Date[]) =>
    shown.person === undefined ? daysOffIn(days) : shown.countIn(days);
  // The months beside, for the summary to follow a drag of the pages.
  const summaryBy = (by: number) =>
    summaryIn(daysOfMonth(monthAfter(month, by)));
  const counts = ownPatterns.map((pattern) => ({
    count: monthDays.filter(
      (date) => schedule[dateKey(date)]?.shift === pattern.id
    ).length,
    key: pattern.id,
    label: pattern.name,
  }));
  const unfilled = monthDays.filter((date) => !schedule[dateKey(date)]).length;
  // A month turned to by a tap or a pick rather than a swipe, whose name
  // the drag has not brought in.
  const turnTo = (target: Date) => {
    setSwipedTo(undefined);
    setMonth(target);
  };
  const {
    announcement,
    announcePicked,
    editing,
    enterFrom,
    enterShift,
    enterMonth,
    enteredBlank,
    lastDay,
    selectedDate,
    selectedDay,
    selectedShift,
    skip,
    start: startEntering,
    stop: stopEntering,
  } = useShiftEntry({
    initialDay,
    initialEditing,
    month,
    onChange,
    schedule,
    turnTo,
  });
  const datePicker = (
    <InputDatePicker
      ariaLabel={`入力する日付：${formatDay(selectedDate)}。タップで変更`}
      date={selectedDate}
      onSelect={(date) => {
        enterFrom(date);
        announcePicked(date);
      }}
    >
      <span>
        {formatMonthDay(selectedDate)}
        <span
          className={shiftInput.weekday({
            tone: weekTools.dateTone(selectedDate),
          })}
        >
          ({weekdayNames[selectedDate.getDay()]})
        </span>
      </span>
    </InputDatePicker>
  );
  const {
    besideMonths,
    closeDetail,
    detailOpacity,
    foldRow,
    folded,
    openDate,
    openDetail,
    pullRef,
  } = useWeekFold({
    dates,
    editing,
    initialDetail,
    month,
    onOpen: (target) => {
      if (target) {
        turnTo(target);
      } else {
        setSwipedTo(undefined);
      }
    },
  });
  const weekDetail = openDate !== undefined;
  const headingMode = screenMode(editing, weekDetail);
  function goToMonth(target: Date) {
    turnTo(target);
    if (editing) {
      enterMonth(target);
    }
  }
  // Move by what is on screen: a week in the week detail, otherwise a month.
  function step(direction: 1 | -1) {
    if (weekDetail) {
      openDetail(addDays(openDate, direction * 7));
      return;
    }
    goToMonth(monthAfter(month, direction));
  }
  // Entering is about every day, so it lets go of someone's days.
  function startInput() {
    shown.show(undefined);
    startEntering();
  }
  function openSave(completion: boolean, toCalendar = false) {
    setSaveCompletion(completion);
    setSaveToCalendar(toCalendar);
    setOpenSheet("save");
  }
  // The corner's 完了 or ×: it closes what is open last, the week before
  // someone's days.
  function finishHeading() {
    if (weekDetail) {
      closeDetail();
      return;
    }
    if (!editing) {
      shown.show(undefined);
      return;
    }
    stopEntering();
    const gaps = gapDaysIn(schedule, month);
    if (gaps.length > 0) {
      setGapDays(gaps);
      setOfferBlank(offDisplay === "show");
      setOpenSheet("gap");
      return;
    }
    // A month just filled in is worth keeping, so saving is offered then.
    if (unfilled === 0 && enteredBlank) {
      openSave(true);
    }
  }
  // Fills the blanks with the person's day off, or adds 休み back when
  // they have none.
  function fillGaps(key: Shift | undefined) {
    const shift = key ?? presetPatterns.off.id;
    if (!key) {
      setPatterns((previous) => [...previous, presetPatterns.off]);
    }
    onChange((previous) => ({
      ...previous,
      ...Object.fromEntries(gapDays.map((date) => [dateKey(date), { shift }])),
    }));
    if (unfilled === gapDays.length) {
      openSave(true);
    }
  }
  function changeEntry(date: Date, entry: DayEntry | undefined) {
    onChange((previous) => ({ ...previous, [dateKey(date)]: entry }));
  }
  return (
    <>
      {tabShown && imagePreview && (
        <ImagePreviewPage
          month={month}
          onClose={() => {
            setImagePreview(false);
          }}
          onOptions={setImageOptions}
          options={imageOptions}
          schedule={schedule}
        />
      )}
      <Screen
        className={surpriseStyles.screen}
        hidden={!tabShown || imagePreview || covered}
      >
        {surprise.layer}
        <div className={heading.bar}>
          <MonthHeading
            beside={besideMonths}
            mode={headingMode}
            month={month}
            onPick={goToMonth}
            onSurprise={() => {
              surprise.play();
            }}
            progress={pageDrag}
            swiped={swipedTo === dateKey(month)}
          />
          <HeadingActions
            closeLabel={
              shown.person === undefined
                ? undefined
                : `${shown.person}と一緒の日の表示をやめる`
            }
            detailDate={openDate}
            mode={headingMode}
            month={month}
            onDone={finishHeading}
            onCalendar={() => {
              openSave(false, true);
            }}
            onImage={() => {
              setImagePreview(true);
            }}
            onStep={step}
            onThisMonth={() => {
              goToMonth(
                new Date(designToday.getFullYear(), designToday.getMonth(), 1)
              );
            }}
            onThisWeek={() => {
              openDetail(designToday);
            }}
            progress={pageDrag}
            swiped={swipedTo === dateKey(month)}
          />
        </div>
        {/* The open week and the day's details under it can be pulled
        down to unfold the month again. */}
        <div className={calendarPage.pull} ref={pullRef}>
          <div className={calendarPage.scroll({ weekDetail })}>
            <WeekdayRow />
            <OffDisplayContext
              value={
                weekDetail && offDisplay === "blank" ? "faint" : offDisplay
              }
            >
              <Pager
                onStep={(direction) => {
                  step(direction);
                  // After step, which clears it.
                  setSwipedTo(
                    dateKey(
                      besideMonths?.[direction > 0 ? "next" : "previous"] ??
                        monthAfter(month, direction)
                    )
                  );
                }}
                progress={pageDrag}
                page={weekDetail ? dateKey(openDate) : dateKey(month)}
                renderPage={(offset) => {
                  const pageMonth = monthAfter(month, offset);
                  // The page shown keeps the whole month around the
                  // open week, to unfold back into.
                  const pageDates =
                    weekDetail && offset !== 0
                      ? weekTools.weekDates(addDays(openDate, offset * 7))
                      : weekTools.monthDates(pageMonth);
                  const renderCell = (date: Date) => (
                    <DayCell
                      active={
                        offset === 0 &&
                        (editing
                          ? date.getMonth() === month.getMonth() &&
                            date.getDate() === selectedDay
                          : openDate !== undefined &&
                            dateKey(date) === dateKey(openDate))
                      }
                      date={date}
                      editing={editing}
                      entry={schedule[dateKey(date)]}
                      key={dateKey(date)}
                      onPress={() => {
                        editing ? enterFrom(date) : openDetail(date);
                      }}
                      dimmed={!editing && shown.fades(date)}
                      outside={
                        !weekDetail && date.getMonth() !== pageMonth.getMonth()
                      }
                    />
                  );
                  const label = `${formatYearMonth(pageMonth)}のシフト`;
                  // Only the page shown folds; the ones beside it are
                  // there to be dragged in.
                  if (offset === 0) {
                    return (
                      <FoldingGrid
                        dates={pageDates}
                        folded={folded}
                        label={label}
                        renderCell={renderCell}
                        row={foldRow}
                        weekDetail={weekDetail}
                      />
                    );
                  }
                  return (
                    <section aria-label={label} className={dayGrid}>
                      {pageDates.map(renderCell)}
                    </section>
                  );
                }}
              />
            </OffDisplayContext>
          </div>
          {weekDetail && (
            <motion.section
              aria-label={formatDay(openDate)}
              className={calendarPage.detail}
              style={{ opacity: detailOpacity }}
            >
              <h4 className={calendarPage.detailDate}>{formatDay(openDate)}</h4>
              <DayDetail
                key={dateKey(openDate)}
                entry={schedule[dateKey(openDate)]}
                onChange={(entry) => {
                  changeEntry(openDate, entry);
                }}
                patternKeys={patternKeys}
              />
            </motion.section>
          )}
        </div>
        {/* On an empty month too, at 0日, so the month keeps the two
        rows of one being filled in: the card above ポチポチ入力.
        Any spare height stays over it, so the summary, the input
        or save buttons and the tab bar sit together at the bottom. */}
        {headingMode === "view" && (
          <div className={calendarPage.bottom}>
            <MonthSummary
              beside={{ next: summaryBy(1), previous: summaryBy(-1) }}
              days={summaryIn(monthDays)}
              month={month}
              onOpen={() => {
                setOpenSheet("breakdown");
              }}
              person={shown.person}
              progress={pageDrag}
              swiped={swipedTo === dateKey(month)}
            />
            {/* Filled month or not: a filled month is fixed the same
            way, and saving is in the heading's corner. */}
            <div className={calendarPage.controls}>
              <StartArea label="ポチポチ入力" onStart={startInput} />
            </div>
            <TabBar active="calendar" onSelect={onTab} />
          </div>
        )}
        {headingMode === "edit" && (
          <div className={calendarPage.input}>
            <ShiftInputControls
              canSkip={selectedDay < lastDay}
              datePicker={datePicker}
              onEnter={enterShift}
              onSkip={skip}
              patternKeys={patternKeys}
              selectedShift={selectedShift}
            />
          </div>
        )}
      </Screen>
      <BreakdownSheet
        counts={counts}
        days={monthDays.length}
        month={month}
        onOpenChange={sheetChange("breakdown")}
        onShow={(name) => {
          shown.show(name);
          setOpenSheet(null);
        }}
        open={openSheet === "breakdown"}
        people={shown.peopleIn(monthDays)}
        shownWith={shown.person}
        unfilled={unfilled}
      />
      <SaveSheet
        completion={saveCompletion}
        month={month}
        offCount={daysOff}
        onImage={() => {
          setImagePreview(true);
        }}
        onOpenChange={sheetChange("save")}
        open={openSheet === "save"}
        toCalendar={saveToCalendar}
        shiftCount={monthDays.length - unfilled}
      />
      <GapSheet
        choices={ownPatterns
          .filter((pattern) => isDayOff(pattern))
          .map((pattern) => ({ key: pattern.id, label: pattern.name }))}
        days={gapDays}
        onFill={fillGaps}
        blankOff={offDisplay === "blank"}
        completes={unfilled === gapDays.length}
        month={month}
        offCount={daysOff}
        sharing={sharing}
        offerBlank={offerBlank}
        onBlankOff={(blankOff) => {
          setCalendarOptions({ blankOff });
        }}
        onOpenChange={sheetChange("gap")}
        open={openSheet === "gap"}
      />
      <span aria-live="polite" className={srOnly}>
        {announcement}
      </span>
    </>
  );
}

// Entering the shifts day by day (ポチポチ入力): the day being entered,
// whether its month had blank days as entering came to it, and what a
// screen reader hears as each day is entered.
function useShiftEntry({
  initialEditing,
  initialDay,
  month,
  schedule,
  onChange,
  turnTo,
}: {
  initialEditing: boolean;
  initialDay: number;
  month: Date;
  schedule: Schedule;
  onChange: ReturnType<typeof useChangeDays>;
  // Turns the calendar to another month, for a day picked in it.
  turnTo: (month: Date) => void;
}) {
  const book = usePatterns();
  const [editing, setEditing] = useState(initialEditing);
  const [selectedDay, setSelectedDay] = useState(initialDay);
  // Whether the month being entered had blank days when it came up, as
  // only then can 完了 have just filled it. A filled month can be entered
  // too, with ポチポチ入力 always offered in the 保存を右上 variant.
  const [enteredBlank, setEnteredBlank] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const selectedDate = new Date(
    month.getFullYear(),
    month.getMonth(),
    selectedDay
  );
  const lastDay = daysOfMonth(month).length;
  const selectedShift = schedule[dateKey(selectedDate)]?.shift;
  function moveToNextDay(result: string, days = 1) {
    const nextDay = selectedAfter(selectedDate, days).getDate();
    setSelectedDay(nextDay);
    setAnnouncement(
      `${formatMonthDay(selectedDate)}、${result}。${selectedDay === lastDay ? "月末です。入力が終わったら完了を押してください" : `${nextDay}日を選択中`}`
    );
  }
  function announcePicked(date: Date) {
    setAnnouncement(`${formatYearMonthDay(date)}を選択中`);
  }
  // The day to enter, in its own month: a day of the month before or after,
  // tapped on the calendar or picked from the date, turns to that month.
  function enterFrom(date: Date) {
    setSelectedDay(date.getDate());
    if (isSameMonth(date, month)) {
      return;
    }
    const target = monthAfter(date, 0);
    turnTo(target);
    setEnteredBlank(hasBlanks(schedule, target));
    announcePicked(date);
  }
  // A month turned to while entering starts on its first day.
  function enterMonth(target: Date) {
    setSelectedDay(1);
    setEnteredBlank(hasBlanks(schedule, target));
    setAnnouncement(`${formatYearMonthDay(target)}を選択中`);
  }
  function start() {
    setSelectedDay(1);
    setEnteredBlank(hasBlanks(schedule, month));
    setEditing(true);
  }
  function stop() {
    setEditing(false);
  }
  function enterShift(shift: Shift | undefined) {
    const following = nextDayOf(shift, book);
    onChange((previous) =>
      withShiftEntered(previous, selectedDate, shift, book)
    );
    if (!shift) {
      moveToNextDay("シフトを消しました");
      return;
    }
    moveToNextDay(
      following
        ? `${book[shift]?.name}を入力しました。翌日は${book[following]?.name}です`
        : `${book[shift]?.name}を入力しました`,
      daysMovedOn(shift, book)
    );
  }
  function skip() {
    moveToNextDay("変更せずに進みました");
  }
  return {
    announcePicked,
    announcement,
    editing,
    enterFrom,
    enterMonth,
    enterShift,
    enteredBlank,
    lastDay,
    selectedDate,
    selectedDay,
    selectedShift,
    skip,
    start,
    stop,
  };
}

// The month at the top: the year over its number, "‹ 今月 ›" in the middle
// so it never moves with the month's width, and the screen's action on the
// right, lined up with the month digits rather than the two lines.
const heading = {
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

// The calendar tab's page: the grid scrolls on its own under the heading
// when the phone is short, and an opened day's detail fills what is left.
const calendarPage = {
  detail: css({
    borderTop: "1px solid token(colors.separator)",
    flex: 1,
    // Out to the screen's edges, so its line runs from edge to edge as a
    // bar's does on iOS and Android (a list's lines stay inset); its
    // contents stay where they were.
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    marginTop: "12px",
    minHeight: 0,
    overflowY: "auto",
    // Scrolled back to the top, a pull goes on to unfold the month rather
    // than pulling the screen.
    overscrollBehaviorY: "contain",
    paddingBottom: "12px",
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: "16px",
  }),
  detailDate: css({ fontWeight: 600, margin: "0 0 16px", textStyle: "title3" }),
  // Under the month: its summary, then what to do next and the tab bar.
  // Room at the foot for the tab bar floating over it, 16px clear.
  bottom: css({
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    marginTop: "auto",
    paddingBottom: "calc(var(--tab-bar-bottom) + 80px - var(--safe-bottom))",
  }),
  controls: css({ flexShrink: 0, minHeight: "92px", paddingTop: "12px" }),
  // Entering takes the bottom for the pattern buttons, on the screen's
  // own ground: a raised one would show only in dark, where the sheets'
  // color parts from the screen's.
  input: css({ flexShrink: 0, marginTop: "auto", paddingTop: "2px" }),
  // Laid out as if it were not there: it only hears the pull.
  pull: css({ display: "contents" }),
  // Room around the grid for the picked day's outline. The open week has
  // nothing to scroll, so its up and down is the pull's alone.
  scroll: cva({
    base: {
      minHeight: 0,
      overflowY: "auto",
      overscrollBehavior: "contain",
      padding: "4px",
      position: "relative",
      touchAction: "pan-y",
    },
    variants: {
      weekDetail: { true: { touchAction: "pinch-zoom" } },
    },
  }),
};

function screenMode(editing: boolean, weekDetail: boolean) {
  if (editing) {
    return "edit";
  }
  return weekDetail ? "week" : "view";
}

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
function MonthHeading({
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
function HeadingActions({
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

function StartArea({ label, onStart }: { label: string; onStart: () => void }) {
  return (
    <div className={shiftInput.startRow}>
      <Button
        className={shiftInput.startButton}
        onClick={onStart}
        variant="primary"
      >
        <Pencil aria-hidden="true" size={18} />
        {label}
      </Button>
    </div>
  );
}

// Whether any day of the month has nothing entered.
function hasBlanks(schedule: Schedule, month: Date) {
  return daysOfMonth(month).some((date) => !schedule[dateKey(date)]);
}

// Entering a month: the day's date, a button for each pattern, and 消す
// and 翌日へ. Up to four patterns sit in one row; more take two rows, of
// three for five or six, four for seven or eight, and five for nine or
// ten, so the buttons never push a month six weeks tall off the screen.
// Past ten they go on to pages of ten, swiped sideways, their dots
// between 消す and 翌日へ so the pages take no more height. Each keeps the
// 72px of the one row, shrinking only when the screen is too narrow.
// ポチポチ入力 and the save buttons that stand in its place share its
// edges.
const shiftInput = {
  action: css({
    _disabled: { color: "text.disabled", cursor: "default" },
    _hover: { "&:not(:disabled)": { bg: "accent.container" } },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "lg",
    color: "text.tertiary",
    display: "flex",
    gap: "4px",
    minHeight: "touch",
    padding: "4px 16px",
    textStyle: "caption",
  }),
  actions: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    justifyContent: "center",
    marginTop: "4px",
  }),
  // The mark's own emoji font, so an emoji mark draws the same everywhere.
  mark: css({
    display: "grid",
    flexShrink: 0,
    fontFamily: "emoji",
    fontSize: "24px",
    height: "28px",
    lineHeight: 1,
    placeItems: "center",
  }),
  // The name under a button's mark, on one line: the buttons are too low
  // for two, and a longer one is cut short.
  name: css({
    maxWidth: "100%",
    overflow: "hidden",
    paddingInline: "4px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  pattern: cva({
    base: {
      _active: { bg: "accent.pressed", transform: "scale(0.97)" },
      _hover: { bg: "accent.container", borderColor: "accent.border" },
      alignItems: "center",
      bg: "background.card",
      border: "1px solid token(colors.border.default)",
      borderRadius: "lg",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      height: "77px",
      justifyContent: "center",
      lineHeight: "14px",
      padding: "8px 0",
      textStyle: "caption",
      width: "72px",
    },
    variants: { rows: { true: { height: "64px", width: "100%" } } },
  }),
  patterns: cva({
    base: {
      border: 0,
      display: "flex",
      gap: "8px",
      justifyContent: "center",
      margin: 0,
      minWidth: 0,
      padding: 0,
    },
    variants: {
      columns: {
        five: {
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 72px))",
        },
        // A page of ten: its two rows kept however few are on it, so the
        // last page neither shrinks the tray nor moves a button from where
        // it would be on a full one.
        paged: {
          alignContent: "start",
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 72px))",
          gridTemplateRows: "repeat(2, 64px)",
        },
        four: {
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 72px))",
        },
        one: {},
        three: {
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 72px))",
        },
      },
    },
  }),
  // The pages of patterns, past ten: the pager and nothing around it.
  patternPages: css({ border: 0, margin: 0, minWidth: 0, padding: 0 }),
  startButton: css({ flex: 1 }),
  startRow: css({ display: "flex", gap: "8px", textAlign: "center" }),
  weekday: cva({
    base: {
      color: "text.tertiary",
      fontSize: "14px",
      fontWeight: 400,
      marginLeft: "2px",
    },
    variants: {
      tone: {
        holiday: { color: "calendar.holiday" },
        plain: {},
        saturday: { color: "calendar.saturday" },
      },
    },
  }),
};

function columnsFor(patternKeys: Shift[]) {
  const count = patternKeys.length;
  if (count > 8) {
    return "five";
  }
  if (count > 6) {
    return "four";
  }
  return count > 4 ? "three" : "one";
}

// Room between the pages of patterns, seen while they are swiped.
const PATTERN_PAGE_GAP = 16;

function ShiftInputControls({
  datePicker,
  patternKeys,
  selectedShift,
  canSkip,
  onEnter,
  onSkip,
}: {
  datePicker: ReactNode;
  patternKeys: Shift[];
  selectedShift: Shift | undefined;
  canSkip: boolean;
  onEnter: (shift: Shift | undefined) => void;
  onSkip: () => void;
}) {
  const book = usePatterns();
  const pages = Array.from(
    { length: Math.ceil(patternKeys.length / PATTERNS_PER_PAGE) },
    (_, index) =>
      patternKeys.slice(
        index * PATTERNS_PER_PAGE,
        (index + 1) * PATTERNS_PER_PAGE
      )
  );
  // The page stays where the person swiped it: moving on to the next day
  // does not turn it, even to that day's shift.
  const [page, setPage] = useState(0);
  const progress = useMotionValue(0);
  const shown = Math.min(page, pages.length - 1);
  const paged = pages.length > 1;
  const buttons = (keys: Shift[]) =>
    keys.map((key) => (
      <button
        className={shiftInput.pattern({ rows: keys.length > 4 || paged })}
        key={key}
        onClick={() => {
          onEnter(key);
        }}
        type="button"
      >
        <span className={shiftInput.mark}>
          <ShiftMark shift={key} size={26} />
        </span>
        <span className={shiftInput.name}>{book[key]?.name}</span>
      </button>
    ));
  return (
    <>
      {datePicker}
      {paged ? (
        <fieldset
          aria-label="入力するシフト"
          className={shiftInput.patternPages}
        >
          <Pager
            ends={{ back: shown > 0, forward: shown < pages.length - 1 }}
            gap={PATTERN_PAGE_GAP}
            onStep={(direction) => {
              setPage(shown + direction);
            }}
            page={String(shown)}
            progress={progress}
            renderPage={(offset) => {
              const keys = pages[shown + offset];
              return (
                keys && (
                  <div className={shiftInput.patterns({ columns: "paged" })}>
                    {buttons(keys)}
                  </div>
                )
              );
            }}
          />
        </fieldset>
      ) : (
        <fieldset
          aria-label="入力するシフト"
          className={shiftInput.patterns({
            columns: columnsFor(patternKeys),
          })}
        >
          {buttons(patternKeys)}
        </fieldset>
      )}
      <div className={shiftInput.actions}>
        <button
          className={shiftInput.action}
          disabled={!selectedShift}
          onClick={() => {
            onEnter(undefined);
          }}
          type="button"
        >
          <Trash2 aria-hidden="true" size={14} />
          消す
        </button>
        {paged && (
          <PageDots
            count={pages.length}
            current={shown}
            label="シフトのページ"
            onPick={setPage}
            progress={progress}
          />
        )}
        <button
          className={shiftInput.action}
          disabled={!canSkip}
          onClick={onSkip}
          type="button"
        >
          翌日へ
          <ArrowRight aria-hidden="true" size={14} />
        </button>
      </div>
    </>
  );
}

// A day opened in the week, read before it is changed: its shift, time,
// the people working it and its memo as a list's rows, each saying what
// the day holds. A row is changed where it is, as iOS's forms do: the
// shift from a pull-down, as one is picked in a Form's menu Picker, the
// time by its pills, the people by chips unfolded under their row (more
// than one, and a name may be added), and the memo in its own field.
// Nothing changes on a stray tap, as it did when every shift was a chip
// on show.
const dayDetail = {
  // The people's chips, unfolded under their row inside the list, with a line above
  // as between rows; marked as a row so the row after it draws its own.
  unfolded: css({
    "&::before": {
      borderTop: "1px solid token(colors.separator)",
      content: '""',
      left: "16px",
      position: "absolute",
      right: "16px",
      top: 0,
    },
    padding: "12px 16px 16px",
    position: "relative",
  }),
  disclosure: css({ transition: "transform 0.2s" }),
  disclosureOpen: css({ transform: "rotate(90deg)" }),
  memberInput: css({ width: "88px" }),
  memo: css({
    "--lines": "5",
    "--pad-x": "16px",
    "--pad-y": "14px",
    color: "text.primary",
    textStyle: "body",
  }),
  // An action on its row, in the accent as iOS's text buttons in a list.
  reset: css({ "& > *": { color: "accent.default" } }),
  root: css({ display: "flex", flexDirection: "column", gap: "24px" }),
};

// The chevron of a row that unfolds in place, turned down while it is open.
function Disclosure({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cx(
        listRow.arrow,
        dayDetail.disclosure,
        open && dayDetail.disclosureOpen
      )}
      size={17}
    />
  );
}

function MemberChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const members = useCoworkerList();
  const [adding, setAdding] = useState(false);
  const toast = useContext(ToastContext);
  // Held to the limit here too: a name confirmed and added in one go may
  // not have been cut to it yet.
  function add(name: string) {
    const trimmed = limitText(name.trim(), textLimits.personName);
    setAdding(false);
    if (!trimmed) {
      return;
    }
    if (!members.names.includes(trimmed)) {
      // Counted again: the list may have grown while the name was typed.
      if (members.names.length >= COWORKERS_MAX) {
        toast(coworkersFull, "problem");
        return;
      }
      members.onAdd(trimmed);
    }
    if (!selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
    }
  }
  return (
    <ChipGroup>
      {members.names.map((name) => (
        <Chip
          selected={selected.includes(name)}
          key={name}
          onClick={() => {
            onChange(
              selected.includes(name)
                ? selected.filter((member) => member !== name)
                : [...selected, name]
            );
          }}
        >
          {selected.includes(name) && <Check aria-hidden="true" size={12} />}
          {name}
        </Chip>
      ))}
      {adding ? (
        <LimitedInput
          aria-label="追加する人の名前"
          autoFocus
          className={dayDetail.memberInput}
          look="chip"
          counter={false}
          kind="personName"
          onBlur={(event) => {
            add(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !composing(event)) {
              add(event.currentTarget.value);
            } else if (event.key === "Escape") {
              setAdding(false);
            }
          }}
          placeholder="名前"
        />
      ) : (
        <Chip
          onClick={() => {
            if (members.names.length >= COWORKERS_MAX) {
              toast(coworkersFull, "problem");
              return;
            }
            setAdding(true);
          }}
          variant="add"
        >
          <Plus aria-hidden="true" size={12} />
          {members.names.length > 0 ? "追加" : "人を追加"}
        </Chip>
      )}
    </ChipGroup>
  );
}

function DayDetail({
  entry,
  patternKeys,
  onChange,
}: {
  entry: DayEntry | undefined;
  patternKeys: Shift[];
  onChange: (entry: DayEntry | undefined) => void;
}) {
  const book = usePatterns();
  const pattern = entry && book[entry.shift];
  const time = pattern?.time;
  const timeChanged = Boolean(entry?.start || entry?.end);
  const [membersOpen, setMembersOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Said in words here, where there is room: the mark only shows a shape.
  const change = timeChangeOf(entry, pattern);
  const moves =
    [change?.early ? "早出" : "", change?.late ? "残業" : ""]
      .filter(Boolean)
      .join("・") || "変更済み";
  const selected = entry?.members ?? [];
  // What would go with the shift. A day with nothing more is cleared at
  // once, as one tap brings it back; with more it is asked first.
  const lost = [
    timeChanged ? "時間の変更" : "",
    selected.length > 0 ? "一緒に働く人" : "",
    entry?.note ? "メモ" : "",
  ].filter(Boolean);
  function clear() {
    setClearing(false);
    setMembersOpen(false);
    onChange(undefined);
  }
  function changeTime(field: "start" | "end", value: string) {
    if (!(entry && time)) {
      return;
    }
    const standard = field === "start" ? time[0] : time[1];
    onChange({
      ...entry,
      [field]: value && value !== standard ? value : undefined,
    });
  }
  return (
    <div className={dayDetail.root}>
      <List>
        <ListRow
          control={
            <PullDownMenu
              label={
                entry ? (
                  <>
                    <ShiftMark shift={entry.shift} size={16} />
                    {pattern?.name}
                  </>
                ) : (
                  "なし"
                )
              }
            >
              <MenuPicker
                onValueChange={(key) => {
                  onChange(keepDetails(entry, key));
                }}
                options={patternKeys.map((key) => ({
                  icon: <ShiftMark shift={key} size={18} />,
                  label: book[key]?.name ?? key,
                  value: key,
                }))}
                value={entry?.shift ?? ""}
              />
            </PullDownMenu>
          }
          label="シフト"
        />
        {entry && time && (
          <ListRow
            control={
              <TimeRange
                end={entry.end ?? time[1]}
                onChange={changeTime}
                start={entry.start ?? time[0]}
              />
            }
            detail={timeChanged ? moves : undefined}
            label="時間"
          />
        )}
        {entry && time && timeChanged && (
          <ListRow
            arrow={false}
            className={dayDetail.reset}
            label={`標準（${timeRange({ shift: entry.shift }, pattern)}）に戻す`}
            onClick={() => {
              onChange({ ...entry, end: undefined, start: undefined });
            }}
          />
        )}
        {entry && time && (
          <ListRow
            aria-expanded={membersOpen}
            arrow={<Disclosure open={membersOpen} />}
            label="一緒に働く人"
            onClick={() => {
              setMembersOpen(!membersOpen);
            }}
            value={selected.length > 0 ? selected.join("、") : "なし"}
          />
        )}
        {entry && time && membersOpen && (
          <div className={dayDetail.unfolded} data-list-row="">
            <MemberChips
              onChange={(next) => {
                onChange({ ...entry, members: membersOrNone(next) });
              }}
              selected={selected}
            />
          </div>
        )}
      </List>
      {entry && (
        <List>
          <LimitedTextArea
            aria-label="メモ"
            className={dayDetail.memo}
            kind="dayNote"
            onValueChange={(note) => {
              onChange({ ...entry, note: note || undefined });
            }}
            placeholder="メモ"
            value={entry.note ?? ""}
          />
        </List>
      )}
      {entry && (
        <DestructiveButton
          onClick={() => {
            if (lost.length > 0) {
              setClearing(true);
            } else {
              clear();
            }
          }}
        >
          この日のシフトを消す
        </DestructiveButton>
      )}
      {clearing && (
        <ConfirmDialog
          action="消す"
          message={`${lost.join("、")}も消えます。`}
          onCancel={() => {
            setClearing(false);
          }}
          onConfirm={clear}
          title="この日のシフトを消しますか？"
        />
      )}
    </div>
  );
}
