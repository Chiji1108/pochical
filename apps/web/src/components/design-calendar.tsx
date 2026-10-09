import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useMotionValue } from "motion/react";
import { useContext, useState } from "react";
import { css, cva } from "styled-system/css";

import {
  addDays,
  dateKey,
  daysMovedOn,
  daysOfMonth,
  firstBlankDay,
  formatDay,
  formatMonthDay,
  formatYearMonth,
  formatYearMonthDay,
  gapDaysIn,
  isSameMonth,
  monthAfter,
  nextDayOf,
  selectedAfter,
  withNote,
  withShiftEntered,
} from "../lib/design-days";
import type { DayEntry, Schedule } from "../lib/design-days";
import { isDayOff, usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { useChangeDays, useUser } from "../lib/design-user-store";
import {
  HeadingActions,
  heading,
  MonthHeading,
  MonthSummary,
} from "./design-calendar-heading";
import { InputDatePicker } from "./design-date-picker";
import { DayCell } from "./design-day-cell";
import { DayDetail } from "./design-day-detail";
import { dayGrid, WeekdayRow } from "./design-day-grid";
import { GapSheet } from "./design-gap-sheet";
import { BreakdownSheet, useShownWith } from "./design-month-breakdown";
import { Pager } from "./design-pager";
import { ImagePreviewPage, SaveSheet } from "./design-save-sheet";
import {
  ShiftInputControls,
  shiftInput,
  StartArea,
} from "./design-shift-input";
import { surpriseStyles, useSurprise } from "./design-surprise";
import { TabBar } from "./design-tab-bar";
import type { Tab } from "./design-tab-bar";
import { IconButton, Screen, srOnly } from "./design-ui";
import { useWeek, weekdayNames } from "./design-week";
import { FoldingGrid, useWeekFold } from "./design-week-fold";
import { OffDisplayContext } from "./shift-mark";

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
  const coworkers = useUser((state) => state.coworkers);
  // The person's own days, for the memos of days without a shift.
  const own = useUser((state) => state.schedule);
  const setOwn = useUser((state) => state.setSchedule);
  // 一緒に働く人 stays unfolded from one opened day to the next.
  const [membersOpen, setMembersOpen] = useState(false);
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
  const patternKeys = ownPatterns.map((pattern) => pattern.id);
  const book = usePatterns();
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
  const shown = useShownWith(coworkers, schedule);
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
    // Someone with no pattern that counts as off leaves days off blank on
    // purpose, so nothing is asked (spec/shift-patterns.md).
    const gaps = ownPatterns.some(isDayOff) ? gapDaysIn(schedule, month) : [];
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
  // Fills the blanks with the person's day off.
  function fillGaps(key: Shift | undefined) {
    // Only asked with a day off to fill with.
    const shift = key ?? ownPatterns.find(isDayOff)?.id;
    if (shift === undefined) {
      return;
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
                : `${shown.person.name}と一緒の日の表示をやめる`
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
                      note={own[dateKey(date)]?.note}
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
              <div className={calendarPage.detailHeading}>
                <h4 className={calendarPage.detailDate}>
                  {formatDay(openDate)}
                </h4>
                {/* The day before and after, a week's end no stop. */}
                <IconButton
                  glass={false}
                  label="前の日"
                  onClick={() => {
                    openDetail(addDays(openDate, -1));
                  }}
                >
                  <ChevronLeft size={22} />
                </IconButton>
                <IconButton
                  glass={false}
                  label="次の日"
                  onClick={() => {
                    openDetail(addDays(openDate, 1));
                  }}
                >
                  <ChevronRight size={22} />
                </IconButton>
              </div>
              <DayDetail
                key={dateKey(openDate)}
                entry={schedule[dateKey(openDate)]}
                membersOpen={membersOpen}
                note={own[dateKey(openDate)]?.note}
                onChange={(entry) => {
                  changeEntry(openDate, entry);
                }}
                onMembersOpenChange={setMembersOpen}
                onNoteChange={(note) => {
                  setOwn((previous) =>
                    withNote(previous, dateKey(openDate), note)
                  );
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
              person={shown.person?.name}
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
        onShow={(id) => {
          shown.show(id);
          setOpenSheet(null);
        }}
        open={openSheet === "breakdown"}
        people={shown.peopleIn(monthDays)}
        shownWith={shown.person?.id}
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
  // A month turned to while entering starts on its first blank day, as
  // entering does (spec/calendar.md).
  function enterMonth(target: Date) {
    setSelectedDay(firstBlankDay(schedule, target).getDate());
    setEnteredBlank(hasBlanks(schedule, target));
    setAnnouncement(`${formatYearMonthDay(target)}を選択中`);
  }
  function start() {
    setSelectedDay(firstBlankDay(schedule, month).getDate());
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
  detailDate: css({ flex: 1, fontWeight: 600, margin: 0, textStyle: "title3" }),
  // The date, with the day before and after beside it.
  detailHeading: css({
    alignItems: "center",
    display: "flex",
    gap: "4px",
    marginBottom: "16px",
  }),
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

// Whether any day of the month has nothing entered.
function hasBlanks(schedule: Schedule, month: Date) {
  return daysOfMonth(month).some((date) => !schedule[dateKey(date)]);
}
