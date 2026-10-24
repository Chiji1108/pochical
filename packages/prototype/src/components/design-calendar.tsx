import { css, cva } from "@pochical/styled-system/css";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, useMotionValue } from "motion/react";
import { useEffect, useState } from "react";

import {
  addDays,
  dateKey,
  daysMovedOn,
  daysOfPeriod,
  firstBlankDay,
  formatDay,
  formatMonthDay,
  formatPeriodWithYear,
  formatYearMonth,
  formatYearMonthDay,
  gapDaysIn,
  isSameMonth,
  monthAfter,
  nextDayOf,
  pageMonthOf,
  selectedAfter,
  withNote,
  withShiftEntered,
} from "../lib/design-days";
import type { DayEntry, Period, Schedule } from "../lib/design-days";
import { isDayOff, patternsInUse, usePatterns } from "../lib/design-patterns";
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
import { DayCell } from "./design-day-cell";
import { DayDetail } from "./design-day-detail";
import { dayGrid, WeekdayRow } from "./design-day-grid";
import { GapSheet } from "./design-gap-sheet";
import {
  BreakdownSheet,
  pageSummaryOf,
  useShownWith,
} from "./design-month-breakdown";
import { useReminderOffer } from "./design-notifications";
import { Pager } from "./design-pager";
import { usePages } from "./design-pages";
import { calendarDays, ImagePreviewPage, SaveSheet } from "./design-save-sheet";
import type { CalendarAccess } from "./design-save-sheet";
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
import { OffFaintContext, useOffLooks } from "./shift-mark";

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
  calendarAccess = "granted",
}: {
  // How 端末カレンダーに追加 goes, as the demo picks.
  calendarAccess?: CalendarAccess;
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
  // The reminders offered once shifts were first entered, after the gap
  // sheet when it asks first.
  const reminderOffer = useReminderOffer();
  const sheetChange = (name: typeof openSheet) => (open: boolean) => {
    setOpenSheet(open ? name : null);
    if (!open && name === "gap") {
      reminderOffer.offer();
    }
  };
  // Blank days between entered ones, asked about when entering ends.
  const [gapDays, setGapDays] = useState<Date[]>([]);
  // The pattern picked in the gap sheet, shown faint on its days.
  const [gapFill, setGapFill] = useState<Shift>();
  // The patterns the look left blank as the gap sheet opened, which it
  // does not offer to leave blank.
  const [blankAtOpen, setBlankAtOpen] = useState<readonly Shift[]>([]);
  const setOffLook = useSettings((state) => state.setOffLook);
  // Whether the save sheet opened because the month was just filled in.
  // Whether it opened straight on adding to the device calendar.
  const [saveToCalendar, setSaveToCalendar] = useState(false);
  const [imagePreview, setImagePreview] = useState(false);
  const offLookOf = useOffLooks();
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
  const allPatterns = useUser((state) => state.patterns);
  // The keys and the days off to fill with: patterns still in use.
  const ownPatterns = patternsInUse(allPatterns);
  const patternKeys = ownPatterns.map((pattern) => pattern.id);
  const book = usePatterns();
  const weekTools = useWeek();
  // The page: the month, or the period starting in it with a シフトの期間
  // (spec/calendar.md, The shift period), whose days are what is counted,
  // entered and saved.
  const pages = usePages();
  const page = pages.periodOf(month);
  const dates = pages.datesOf(month);
  const pageDays = daysOfPeriod(page);
  // A シフトの期間 changed, or loaded with the saved settings, turns to the
  // page holding today, as the apps open on it.
  useEffect(
    () =>
      useSettings.subscribe((state, previous) => {
        const start = state.device.periodStart;
        if (start !== previous.device.periodStart) {
          setMonth(pageMonthOf(designToday, start));
        }
      }),
    [setMonth]
  );
  const daysOffIn = (days: Date[]) =>
    pageSummaryOf(days, schedule, allPatterns).daysOff;
  // Someone picked in 今月の内訳, whose days the calendar shows.
  const shown = useShownWith(coworkers, schedule);
  const summaryIn = (days: Date[]) =>
    shown.person === undefined ? daysOffIn(days) : shown.countIn(days);
  // The pages beside, for the summary to follow a drag of the pages.
  const summaryBy = (by: number) =>
    summaryIn(daysOfPeriod(pages.periodOf(monthAfter(month, by))));
  // The page's breakdown counts every pattern on its days, archived too.
  const pageSummary = pageSummaryOf(pageDays, schedule, allPatterns);
  const counts = pageSummary.counts.map(({ days, pattern }) => ({
    count: days,
    key: pattern.id,
    label: pattern.name,
  }));
  const { unfilled } = pageSummary;
  // A month turned to by a tap or a pick rather than a swipe, whose name
  // the drag has not brought in.
  const turnTo = (target: Date) => {
    setSwipedTo(undefined);
    setMonth(target);
  };
  const {
    announcement,
    editing,
    enterFrom,
    enterShift,
    enterMonth,
    selectedDate,
    selectedShift,
    skip,
    start: startEntering,
    stop: stopEntering,
  } = useShiftEntry({
    initialDay,
    initialEditing,
    month,
    onChange,
    page,
    schedule,
    turnTo,
  });
  // The day being entered, said over the keys; another is picked on the
  // calendar above, a month away by swiping.
  const datePicker = (
    <p className={shiftInput.date}>
      <span className={srOnly}>入力する日付：</span>
      {formatMonthDay(selectedDate)}
      <span
        className={shiftInput.weekday({
          tone: weekTools.dateTone(selectedDate),
        })}
      >
        ({weekdayNames[selectedDate.getDay()]})
      </span>
    </p>
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
  function openSave(toCalendar = false) {
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
    const gaps = ownPatterns.some(isDayOff) ? gapDaysIn(schedule, page) : [];
    if (gaps.length > 0) {
      setGapDays(gaps);
      setGapFill(undefined);
      setBlankAtOpen(
        ownPatterns
          .filter((pattern) => offLookOf(pattern.id) === "blank")
          .map(({ id }) => id)
      );
      setOpenSheet("gap");
    } else if (Object.values(schedule).some((entry) => entry !== undefined)) {
      reminderOffer.offer();
    }
  }
  // While the gap sheet asks, its days drawn faint as the pattern picked
  // would fill them, so the question points at them.
  function previewOf(date: Date): DayEntry | undefined {
    if (
      openSheet !== "gap" ||
      !gapDays.some((day) => dateKey(day) === dateKey(date))
    ) {
      return undefined;
    }
    const shift = gapFill ?? ownPatterns.find(isDayOff)?.id;
    return shift === undefined ? undefined : { shift };
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
  }
  function changeEntry(date: Date, entry: DayEntry | undefined) {
    onChange((previous) => ({ ...previous, [dateKey(date)]: entry }));
  }
  return (
    <>
      {tabShown && imagePreview && (
        <ImagePreviewPage
          month={month}
          period={pages.byPeriod ? page : undefined}
          onClose={() => {
            setImagePreview(false);
          }}
          offPatterns={allPatterns.filter((pattern) => isDayOff(pattern))}
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
            period={pages.byPeriod ? page : undefined}
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
              openSave(true);
            }}
            onImage={() => {
              setImagePreview(true);
            }}
            onStep={step}
            onThisMonth={() => {
              goToMonth(pages.today);
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
            <OffFaintContext value={weekDetail}>
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
                      : pages.datesOf(pageMonth);
                  const renderCell = (date: Date) => (
                    <DayCell
                      active={
                        offset === 0 &&
                        (editing
                          ? dateKey(date) === dateKey(selectedDate)
                          : openDate !== undefined &&
                            dateKey(date) === dateKey(openDate))
                      }
                      date={date}
                      editing={editing}
                      entry={schedule[dateKey(date)] ?? previewOf(date)}
                      preview={
                        !schedule[dateKey(date)] &&
                        previewOf(date) !== undefined
                      }
                      key={dateKey(date)}
                      note={own[dateKey(date)]?.note}
                      onPress={() => {
                        editing ? enterFrom(date) : openDetail(date);
                      }}
                      dimmed={!editing && shown.fades(date)}
                      outside={!(weekDetail || pages.holds(pageMonth, date))}
                      // Where the month turns inside a period, 11/1.
                      withMonth={
                        pages.byPeriod &&
                        date.getDate() === 1 &&
                        pages.holds(pageMonth, date)
                      }
                    />
                  );
                  const label = `${
                    pages.byPeriod
                      ? formatPeriodWithYear(pages.periodOf(pageMonth))
                      : formatYearMonth(pageMonth)
                  }のシフト`;
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
            </OffFaintContext>
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
                  label="前の日"
                  onClick={() => {
                    openDetail(addDays(openDate, -1));
                  }}
                >
                  <ChevronLeft size={22} />
                </IconButton>
                <IconButton
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
              days={summaryIn(pageDays)}
              month={month}
              byPeriod={pages.byPeriod}
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
              canSkip={selectedDate < page.last}
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
        days={pageDays.length}
        month={month}
        period={pages.byPeriod ? page : undefined}
        onOpenChange={sheetChange("breakdown")}
        onShow={(id) => {
          shown.show(id);
          setOpenSheet(null);
        }}
        open={openSheet === "breakdown"}
        people={shown.peopleIn(pageDays)}
        shownWith={shown.person?.id}
        unfilled={unfilled}
      />
      <SaveSheet
        access={calendarAccess}
        month={month}
        period={pages.byPeriod ? page : undefined}
        days={calendarDays(
          pageDays,
          schedule,
          book,
          new Set(
            pageDays
              .map((date) => dateKey(date))
              .filter((key) => (own[key]?.note ?? "") !== "")
          ),
          new Set(coworkers.map((coworker) => coworker.id))
        )}
        patterns={allPatterns}
        onImage={() => {
          setImagePreview(true);
        }}
        onOpenChange={sheetChange("save")}
        open={openSheet === "save"}
        toCalendar={saveToCalendar}
      />
      <GapSheet
        choices={ownPatterns
          .filter((pattern) => isDayOff(pattern))
          .map((pattern) => ({
            blank: blankAtOpen.includes(pattern.id),
            key: pattern.id,
            label: pattern.name,
          }))}
        days={gapDays}
        pageFirst={page.first}
        onFill={fillGaps}
        onPick={setGapFill}
        onBlankOff={(key) => {
          setOffLook(
            key,
            "blank",
            ownPatterns.filter(isDayOff).map(({ id }) => id)
          );
        }}
        onOpenChange={sheetChange("gap")}
        open={openSheet === "gap"}
      />
      {reminderOffer.node}
      <span aria-live="polite" className={srOnly}>
        {announcement}
      </span>
    </>
  );
}

// Entering the shifts day by day (ポチポチ入力): the day being entered,
// always one of the page's own, and what a screen reader hears as each day
// is entered.
function useShiftEntry({
  initialEditing,
  initialDay,
  month,
  page,
  schedule,
  onChange,
  turnTo,
}: {
  initialEditing: boolean;
  initialDay: number;
  month: Date;
  // The page's days, a month's or a シフトの期間's: entering starts on
  // their first blank day and stays at their last until 完了.
  page: Period;
  schedule: Schedule;
  onChange: ReturnType<typeof useChangeDays>;
  // Turns the calendar to another page, for a day picked in it.
  turnTo: (month: Date) => void;
}) {
  const book = usePatterns();
  const pages = usePages();
  const [editing, setEditing] = useState(initialEditing);
  const [selectedDate, setSelectedDate] = useState(
    () => new Date(month.getFullYear(), month.getMonth(), initialDay)
  );
  const [announcement, setAnnouncement] = useState("");
  const selectedShift = schedule[dateKey(selectedDate)]?.shift;
  function moveToNextDay(result: string, days = 1) {
    const next = selectedAfter(selectedDate, days, page.last);
    const atLast = dateKey(selectedDate) === dateKey(page.last);
    const end = pages.byPeriod
      ? "期間の最後の日です。入力が終わったら完了を押してください"
      : "月末です。入力が終わったら完了を押してください";
    // The next day by its date alone, in the month of the day entered.
    const nextName = isSameMonth(next, selectedDate)
      ? `${next.getDate()}日`
      : formatMonthDay(next);
    setSelectedDate(next);
    setAnnouncement(
      `${formatMonthDay(selectedDate)}、${result}。${atLast ? end : `${nextName}を選択中`}`
    );
  }
  function announcePicked(date: Date) {
    setAnnouncement(`${formatYearMonthDay(date)}を選択中`);
  }
  // The day to enter, on its own page: a faded day of the page before or
  // after, tapped on the calendar or picked from the date, turns to it.
  function enterFrom(date: Date) {
    setSelectedDate(date);
    if (pages.holds(month, date)) {
      return;
    }
    turnTo(pages.monthOf(date));
    announcePicked(date);
  }
  // A page turned to while entering starts on its first blank day, as
  // entering does (spec/calendar.md).
  function enterMonth(target: Date) {
    const first = firstBlankDay(schedule, pages.periodOf(target));
    setSelectedDate(first);
    setAnnouncement(`${formatYearMonthDay(first)}を選択中`);
  }
  function start() {
    setSelectedDate(firstBlankDay(schedule, page));
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
    announcement,
    editing,
    enterFrom,
    enterMonth,
    enterShift,
    selectedDate,
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
    "&:has(> [data-tab-bar])": {
      paddingBottom: "calc(var(--tab-bar-bottom) + 80px - var(--safe-bottom))",
    },
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    marginTop: "auto",
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
