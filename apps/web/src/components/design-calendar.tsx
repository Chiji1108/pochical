import { textLimits } from "@pochical/design/limits";
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
} from "lucide-react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type { MotionStyle, MotionValue } from "motion/react";
import {
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import {
  addDays,
  dateKey,
  defaultHolidaysOff,
  formatDay,
  giveDaysToOrder,
  holidayShiftOf,
  keepDetails,
  timeChangeOf,
  timeRange,
  weekdays,
  withOrder,
} from "../lib/design-days";
import type { DayEntry, RepeatRule, Schedule } from "../lib/design-days";
import {
  bookOf,
  isDayOff,
  PATTERNS_PER_PAGE,
  OwnPatternsContext,
  PatternsContext,
  presetPatterns,
  samePattern,
  usePatterns,
} from "../lib/design-patterns";
import type { Pattern, PatternBook, Shift } from "../lib/design-patterns";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { useChangeDays, useShownDays, useUser } from "../lib/design-user-store";
import type { DesignVariants } from "../lib/design-variants";
import { spring } from "../lib/motion";
import { composing, limitText } from "../lib/text-limits";
import type { Coworkers } from "./design-coworkers";
import { InputDatePicker } from "./design-date-picker";
import { DayCell } from "./design-day-cell";
import { GapSheet, gapDaysIn } from "./design-gap-sheet";
import { DesignGroup } from "./design-group";
import type { GroupStart } from "./design-group";
import { JoinScreen } from "./design-group-join";
import { MonthName } from "./design-month-name";
import { MonthTitleButton, monthTitle } from "./design-month-picker";
import { Phone } from "./design-phone";
import {
  monthIndex,
  RollingName,
  TodayCorner,
  useTurn,
} from "./design-rolling";
import { ImagePreviewPage, SaveSheet } from "./design-save-sheet";
import { DesignSettings } from "./design-settings";
import type { SettingsPage } from "./design-settings";
import {
  ConfirmDialog,
  PhoneContext,
  Sheet,
  SheetHeading,
  sheetBody,
} from "./design-sheet";
import { surpriseStyles, useSurprise } from "./design-surprise";
import { TabBar } from "./design-tab-bar";
import type { Tab } from "./design-tab-bar";
import { useThemeStyle } from "./design-theme";
import { PhoneToasts, ToastContext, usePhoneToaster } from "./design-toast";
import {
  Button,
  Chip,
  ChipGroup,
  ChoiceGrid,
  ChoiceChip,
  DAY_ROW_GAP,
  DAY_ROW_HEIGHT,
  dayGrid,
  DestructiveButton,
  dayGridHeight,
  DoneButton,
  IconMenu,
  LimitedInput,
  LimitedTextArea,
  List,
  ListRow,
  listRow,
  markValue,
  MenuItem,
  MONTH_WEEKS,
  PageDots,
  Pager,
  Screen,
  srOnly,
  SummaryRow,
  TimeRange,
  TodayButton,
  WeekdayRow,
} from "./design-ui";
import { useWeek } from "./design-week";
import { OffDisplayContext, ShiftMark } from "./shift-mark";

type MemberOptions = Pick<Coworkers, "names" | "onAdd">;

// One person's phone. Their data comes from the nearest UserStoreContext,
// so two phones under one store show the same person.
export function DesignCalendar({
  initialEditing,
  initialDay = 1,
  initialMonth = 8,
  variants,
  pendingInvite = false,
  initialTab = "calendar",
  initialSettingsPage,
  initialGroupPage,
  initialDetail,
  fullScreen = false,
}: {
  initialEditing: boolean;
  // The day entering starts on, as the top page opens on its first blank.
  initialDay?: number;
  // On /try: filling a real phone's screen rather than a pictured one.
  fullScreen?: boolean;
  initialMonth?: number;
  variants: DesignVariants;
  // For the flow diagrams: a tab, and a settings page, to open on.
  initialTab?: Tab;
  initialSettingsPage?: SettingsPage;
  // And the group tab's page: its hub, the shift table or the group chat.
  initialGroupPage?: GroupStart;
  // A day of initialMonth to open on picked, its week folded out of the
  // month with the day's details under it, as a reminder opens it.
  initialDetail?: Date;
  // A group's invitation link was opened: ask about joining, in a screen
  // over the calendar.
  pendingInvite?: boolean;
}) {
  const setOwnDays = useUser((state) => state.setSchedule);
  const phoneRef = useRef<HTMLDivElement>(null);
  const { say: toast, toaster } = usePhoneToaster();
  const themeStyle = useThemeStyle();
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
  const [joining, setJoining] = useState(pendingInvite);
  const groups = useUser((state) => state.groups);
  const setGroups = useUser((state) => state.setGroups);
  const offDisplay = useContext(OffDisplayContext);
  const imageOptions = useSettings((state) => state.device.imageOptions);
  const setImageOptions = useSettings((state) => state.setImageOptions);
  const [detailDate, setDetailDate] = useState(initialDetail);
  // The row of the month the opened week is on, for the month to fold up
  // into it and unfold back around it. It follows the week as it turns.
  const [foldRow, setFoldRow] = useState(0);
  // How far the month is folded into that week, 0 to 1: moved by opening
  // and closing the week, or by the finger pulling the week back open.
  const folded = useMotionValue(initialDetail ? 1 : 0);
  const reduceFolding = useReducedMotion() ?? false;
  const detailOpacity = useTransform(folded, [0.5, 1], [0, 1]);
  const coworkerNames = useUser((state) => state.coworkers);
  const setCoworkerNames = useUser((state) => state.setCoworkers);
  const [tab, setTab] = useState<Tab>(initialTab);
  const surprise = useSurprise();
  // The group the group tab opens on, like one just joined from a link.
  const [openGroup, setOpenGroup] = useState<string>();
  const profile = useUser((state) => state.profile);
  const setProfile = useUser((state) => state.setProfile);
  const rules = useUser((state) => state.rules);
  const setRules = useUser((state) => state.setRules);
  // Renaming or deleting someone changes the days they are on too.
  const updateMembersOnDays = (change: (names: string[]) => string[]) => {
    setOwnDays((previous) =>
      Object.fromEntries(
        Object.entries(previous).map(([key, entry]) => {
          if (!entry?.members) {
            return [key, entry];
          }
          const next = change(entry.members);
          return [
            key,
            { ...entry, members: next.length > 0 ? next : undefined },
          ];
        })
      )
    );
  };
  const members: Coworkers = {
    names: coworkerNames,
    onAdd: (name) => {
      setCoworkerNames((previous) => [...previous, name]);
    },
    onDelete: (name) => {
      setCoworkerNames((previous) => previous.filter((item) => item !== name));
      updateMembersOnDays((names) => names.filter((item) => item !== name));
    },
    onRename: (from, to) => {
      setCoworkerNames((previous) =>
        previous.map((name) => (name === from ? to : name))
      );
      updateMembersOnDays((names) =>
        names.map((name) => (name === from ? to : name))
      );
    },
    onReorder: setCoworkerNames,
  };
  const [editing, setEditing] = useState(initialEditing);
  const [selectedDay, setSelectedDay] = useState(initialDay);
  // Whether the month being entered had blank days when it came up, as
  // only then can 完了 have just filled it. A filled month can be entered
  // too, with ポチポチ入力 always offered in the 保存を右上 variant.
  const [enteredBlank, setEnteredBlank] = useState(true);
  const [month, setMonth] = useState(() => new Date(2026, initialMonth, 1));
  // The days as they show, worked out through the month in view however far
  // ahead it is; a change keeps only what differs from the repeating orders
  // as the person's own.
  const schedule = useShownDays(month);
  const onChange = useChangeDays(month);
  // How far the pages are dragged, -1 to 1 toward the next, which the
  // month's name follows; and the month a swipe last landed on, whose name
  // the drag has already brought in.
  const pageDrag = useMotionValue(0);
  const [swipedTo, setSwipedTo] = useState<string>();
  const ownPatterns = useUser((state) => state.patterns);
  const setPatterns = useUser((state) => state.setPatterns);
  const patternKeys = ownPatterns.map((pattern) => pattern.id);
  // The person's own patterns, over the ready-made ones that templates
  // and samples name.
  const book: PatternBook = { ...presetPatterns, ...bookOf(ownPatterns) };
  const sharing = useUser((state) => state.groups.length > 0);
  const [announcement, setAnnouncement] = useState("");
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
  // The months beside, for 今月のお休み to follow a drag of the pages.
  const daysOffBy = (by: number) => {
    const beside = new Date(month.getFullYear(), month.getMonth() + by, 1);
    return daysOffIn(
      weekTools
        .monthDates(beside)
        .filter((date) => date.getMonth() === beside.getMonth())
    );
  };
  const counts = ownPatterns.map((pattern) => ({
    count: monthDays.filter(
      (date) => schedule[dateKey(date)]?.shift === pattern.id
    ).length,
    key: pattern.id,
    label: pattern.name,
  }));
  const unfilled = monthDays.filter((date) => !schedule[dateKey(date)]).length;
  const selectedDate = new Date(
    month.getFullYear(),
    month.getMonth(),
    selectedDay
  );
  const lastDay = monthDays.length;
  const selectedShift = schedule[dateKey(selectedDate)]?.shift;
  function moveToNextDay(result: string, days = 1) {
    const nextDay = Math.min(selectedDay + days, lastDay);
    setSelectedDay(nextDay);
    setAnnouncement(
      `${month.getMonth() + 1}月${selectedDay}日、${result}。${selectedDay === lastDay ? "月末です。入力が終わったら完了を押してください" : `${nextDay}日を選択中`}`
    );
  }
  function announcePicked(date: Date) {
    setAnnouncement(
      `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日を選択中`
    );
  }
  // The day to enter, in its own month: a day of the month before or after,
  // tapped on the calendar or picked from the date, turns to that month.
  function enterFrom(date: Date) {
    setSelectedDay(date.getDate());
    if (
      date.getFullYear() === month.getFullYear() &&
      date.getMonth() === month.getMonth()
    ) {
      return;
    }
    const target = new Date(date.getFullYear(), date.getMonth(), 1);
    setSwipedTo(undefined);
    setMonth(target);
    setEnteredBlank(hasBlanks(schedule, target));
    announcePicked(date);
  }
  const datePicker = (
    <InputDatePicker
      ariaLabel={`入力する日付：${month.getMonth() + 1}月${selectedDay}日(${weekdays[selectedDate.getDay()]})。タップで変更`}
      date={selectedDate}
      onSelect={(date) => {
        enterFrom(date);
        announcePicked(date);
      }}
    >
      <span>
        {`${month.getMonth() + 1}月${selectedDay}日`}
        <span
          className={shiftInput.weekday({
            tone: weekTools.dateTone(selectedDate),
          })}
        >
          ({weekdays[selectedDate.getDay()]})
        </span>
      </span>
    </InputDatePicker>
  );
  const weekDetail = !editing && detailDate !== undefined;
  const headingMode = screenMode(editing, weekDetail);
  function rowOf(date: Date, inMonth: Date) {
    const index = weekTools
      .monthDates(inMonth)
      .findIndex((day) => dateKey(day) === dateKey(date));
    return Math.max(0, Math.floor(index / 7));
  }
  // The week of the day opened on, before the screen is first drawn.
  const foldInitial = useEffectEvent(() => {
    if (initialDetail) {
      setFoldRow(rowOf(initialDetail, month));
    }
  });
  useLayoutEffect(() => {
    foldInitial();
  }, []);
  function onMonth(date: Date) {
    return dates.some((day) => dateKey(day) === dateKey(date));
  }
  // The month stays while the week opened is one of its rows, as every row
  // holds a day of it: a day of the month before, opened from the top row,
  // folds back into that row. Only a week off the month takes its month.
  // The month shown once a date's week is opened.
  function monthOpening(date: Date) {
    return onMonth(date)
      ? month
      : new Date(date.getFullYear(), date.getMonth(), 1);
  }
  function foldTo(target: 0 | 1, velocity = 0) {
    if (reduceFolding) {
      folded.jump(target);
      return;
    }
    animate(folded, target, { ...fold, velocity });
  }
  function openDetail(date: Date) {
    setFoldRow(rowOf(date, monthOpening(date)));
    setSwipedTo(undefined);
    setDetailDate(date);
    foldTo(1);
    if (!onMonth(date)) {
      setMonth(monthOpening(date));
    }
  }
  // The months the pages beside lead to: the months before and after, or
  // in the week view the months the weeks before and after are shown in.
  const besideMonths = weekDetail
    ? {
        next: monthOpening(addDays(detailDate, 7)),
        previous: monthOpening(addDays(detailDate, -7)),
      }
    : undefined;
  function goToMonth(target: Date) {
    setSwipedTo(undefined);
    setMonth(target);
    if (editing) {
      setSelectedDay(1);
      setEnteredBlank(hasBlanks(schedule, target));
      setAnnouncement(
        `${target.getFullYear()}年${target.getMonth() + 1}月1日を選択中`
      );
    }
  }
  // Move by what is on screen: a week in the week detail, otherwise a month.
  function step(direction: 1 | -1) {
    if (weekDetail) {
      openDetail(addDays(detailDate, direction * 7));
      return;
    }
    goToMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1));
  }
  function startInput() {
    setSelectedDay(1);
    setEnteredBlank(unfilled > 0);
    setEditing(true);
  }
  // From its start, the new order shows in place of the one before: the
  // days give their own shifts and times back to it, keeping memos and
  // people, and an empty sequence leaves a roster to fill in. A new job
  // brings its own patterns, so it passes them in.
  function fillRule(rule: RepeatRule, patterns = ownPatterns) {
    const holidaysOff =
      rule.sequence.length > 0 &&
      (rule.holidaysOff ??
        defaultHolidaysOff(
          rule.sequence,
          rule.anchor ?? rule.start,
          bookOf(patterns)
        ));
    const holidayShift = holidaysOff ? holidayShiftOf(patterns) : undefined;
    setOwnDays((previous) => giveDaysToOrder(previous, rule.start));
    return rule.sequence.length > 0
      ? { ...rule, holidayShift, holidaysOff }
      : rule;
  }
  function applyRule(rule: RepeatRule, patterns?: Pattern[]) {
    const filled = fillRule(rule, patterns);
    setRules((previous) => withOrder(previous, filled));
  }
  // Corrects the rule in use from its own start, rather than adding one.
  function fixRule(rule: RepeatRule) {
    const filled = fillRule(rule);
    setRules((previous) => withOrder(previous.slice(0, -1), filled));
  }
  // The new job's patterns take over, keeping any old one still on a day
  // before the switch so those days keep their marks. A ready-made one the
  // person has changed, still on those days, stays theirs; the new job's
  // comes in under an id of its own, and its order uses that.
  function changeJob(job: { patterns: Pattern[]; rule: RepeatRule }) {
    const from = dateKey(job.rule.start);
    const usedBefore = (id: string) =>
      Object.entries(schedule).some(
        ([key, entry]) => key < from && entry?.shift === id
      );
    const renamed = new Map<string, string>();
    for (const pattern of job.patterns) {
      const own = ownPatterns.find((item) => item.id === pattern.id);
      if (own && usedBefore(own.id) && !samePattern(own, pattern)) {
        renamed.set(pattern.id, crypto.randomUUID());
      }
    }
    const renameOf = (id: string) => renamed.get(id) ?? id;
    const incoming = job.patterns.map((pattern) => ({
      ...pattern,
      id: renameOf(pattern.id),
      nextDay: pattern.nextDay && renameOf(pattern.nextDay),
    }));
    const kept = ownPatterns.filter(
      (pattern) =>
        !incoming.some((next) => next.id === pattern.id) &&
        usedBefore(pattern.id)
    );
    const patterns = [...incoming, ...kept];
    setPatterns(patterns);
    applyRule(
      { ...job.rule, sequence: job.rule.sequence.map(renameOf) },
      patterns
    );
  }
  // Holidays follow the order in use: on, they take the day off now first;
  // off, they show the sequence again. Days the person changed keep theirs.
  function setHolidaysOff(holidaysOff: boolean) {
    const rule = rules.at(-1);
    if (!rule) {
      return;
    }
    const holidayShift = holidaysOff ? holidayShiftOf(ownPatterns) : undefined;
    if (holidaysOff && !holidayShift) {
      return;
    }
    setRules((previous) => [
      ...previous.slice(0, -1),
      { ...rule, holidayShift, holidaysOff },
    ]);
  }
  function openSave(completion: boolean, toCalendar = false) {
    setSaveCompletion(completion);
    setSaveToCalendar(toCalendar);
    setOpenSheet("save");
  }
  function finishHeading() {
    if (!editing) {
      closeDetail();
      return;
    }
    setEditing(false);
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
  // With the speed the finger let go at, when it pulled the week open.
  function closeDetail(velocity = 0) {
    setDetailDate(undefined);
    foldTo(0, velocity);
  }
  // How far the month unfolds below the week: the finger pulling it open
  // brings the month's foot down with it.
  const unfoldDistance =
    dayGridHeight(Math.max(dates.length / 7, MONTH_WEEKS)) - dayGridHeight(1);
  const pullRef = usePullDown({
    enabled: weekDetail,
    // Jumped, so a spring still opening or settling the week stops and
    // leaves it to the finger.
    onPull: (share) => {
      folded.jump(1 - share);
    },
    onRelease: (share, speed) => {
      // In folded per second, as the finger's speed down unfolds it.
      const velocity = -speed / unfoldDistance;
      const flicked = Math.abs(speed) > UNFOLD_FLICK;
      const opens = flicked ? speed > 0 : share > UNFOLD_SHARE;
      if (opens) {
        closeDetail(velocity);
        return;
      }
      foldTo(1, velocity);
    },
    reach: unfoldDistance,
  });
  function changeEntry(date: Date, entry: DayEntry | undefined) {
    onChange((previous) => ({ ...previous, [dateKey(date)]: entry }));
  }
  function enterShift(shift: Shift | undefined) {
    const key = dateKey(selectedDate);
    // One day only: the next day's own next day is not followed, so
    // patterns naming each other never run on (spec/shift-patterns.md).
    const following = shift && book[shift]?.nextDay;
    const followingKey = dateKey(addDays(selectedDate, 1));
    onChange((previous) => ({
      ...previous,
      [key]:
        shift === undefined ? undefined : keepDetails(previous[key], shift),
      ...(following && {
        [followingKey]: keepDetails(previous[followingKey], following),
      }),
    }));
    if (!shift) {
      moveToNextDay("シフトを消しました");
      return;
    }
    moveToNextDay(
      following
        ? `${book[shift]?.name}を入力しました。翌日は${book[following]?.name}です`
        : `${book[shift]?.name}を入力しました`,
      following ? 2 : 1
    );
  }
  return (
    <PatternsContext value={book}>
      <OwnPatternsContext value={ownPatterns}>
        <PhoneContext value={phoneRef}>
          <ToastContext value={toast}>
            <Phone fullScreen={fullScreen} ref={phoneRef} style={themeStyle}>
              {tab === "settings" && (
                <DesignSettings
                  coworkers={members}
                  initialPage={initialSettingsPage}
                  onApplyRule={applyRule}
                  onChangeJob={changeJob}
                  onFixRule={fixRule}
                  onHolidaysOff={setHolidaysOff}
                  onProfile={setProfile}
                  onTab={setTab}
                  patterns={ownPatterns}
                  profile={profile}
                  rules={rules}
                  schedule={schedule}
                />
              )}
              {tab === "group" && (
                <DesignGroup
                  initialGroupId={openGroup}
                  initialPage={initialGroupPage}
                  photoSend={variants.photoSend}
                  scanResult={variants.scanResult}
                  onTab={setTab}
                  patterns={ownPatterns}
                  profile={profile}
                  schedule={schedule}
                />
              )}
              {joining && (
                <JoinScreen
                  onClose={() => {
                    setJoining(false);
                  }}
                  onJoin={(joined) => {
                    setGroups([...groups, joined]);
                    setJoining(false);
                    setOpenGroup(joined.id);
                    setTab("group");
                    toast(`「${joined.name}」に参加しました`);
                  }}
                  profile={profile}
                />
              )}
              {tab === "calendar" && imagePreview && (
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
                hidden={tab !== "calendar" || imagePreview || joining}
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
                    detailDate={detailDate}
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
                        new Date(
                          designToday.getFullYear(),
                          designToday.getMonth(),
                          1
                        )
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
                        weekDetail && offDisplay === "blank"
                          ? "faint"
                          : offDisplay
                      }
                    >
                      <Pager
                        onStep={(direction) => {
                          step(direction);
                          // After step, which clears it.
                          setSwipedTo(
                            dateKey(
                              weekDetail
                                ? monthOpening(
                                    addDays(detailDate, direction * 7)
                                  )
                                : new Date(
                                    month.getFullYear(),
                                    month.getMonth() + direction,
                                    1
                                  )
                            )
                          );
                        }}
                        progress={pageDrag}
                        page={weekDetail ? dateKey(detailDate) : dateKey(month)}
                        renderPage={(offset) => {
                          const pageMonth = new Date(
                            month.getFullYear(),
                            month.getMonth() + offset,
                            1
                          );
                          // The page shown keeps the whole month around the
                          // open week, to unfold back into.
                          const pageDates =
                            weekDetail && offset !== 0
                              ? weekTools.weekDates(
                                  addDays(detailDate, offset * 7)
                                )
                              : weekTools.monthDates(pageMonth);
                          const renderCell = (date: Date) => (
                            <DayCell
                              active={
                                offset === 0 &&
                                (editing
                                  ? date.getMonth() === month.getMonth() &&
                                    date.getDate() === selectedDay
                                  : detailDate !== undefined &&
                                    dateKey(date) === dateKey(detailDate))
                              }
                              date={date}
                              editing={editing}
                              entry={schedule[dateKey(date)]}
                              key={dateKey(date)}
                              onPress={() => {
                                editing ? enterFrom(date) : openDetail(date);
                              }}
                              outside={
                                !weekDetail &&
                                date.getMonth() !== pageMonth.getMonth()
                              }
                            />
                          );
                          const label = `${pageMonth.getFullYear()}年${pageMonth.getMonth() + 1}月のシフト`;
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
                      aria-label={formatDay(detailDate)}
                      className={calendarPage.detail}
                      style={{ opacity: detailOpacity }}
                    >
                      <h4 className={calendarPage.detailDate}>
                        {formatDay(detailDate)}
                      </h4>
                      <DayDetail
                        key={dateKey(detailDate)}
                        entry={schedule[dateKey(detailDate)]}
                        members={members}
                        onChange={(entry) => {
                          changeEntry(detailDate, entry);
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
                      beside={{ next: daysOffBy(1), previous: daysOffBy(-1) }}
                      daysOff={daysOff}
                      month={month}
                      onOpen={() => {
                        setOpenSheet("breakdown");
                      }}
                      progress={pageDrag}
                      swiped={swipedTo === dateKey(month)}
                    />
                    {/* Filled month or not: a filled month is fixed the same
                    way, and saving is in the heading's corner. */}
                    <div className={calendarPage.controls}>
                      <StartArea label="ポチポチ入力" onStart={startInput} />
                    </div>
                    <TabBar active="calendar" onSelect={setTab} />
                  </div>
                )}
                {headingMode === "edit" && (
                  <div className={calendarPage.input}>
                    <ShiftInputControls
                      canSkip={selectedDay < lastDay}
                      datePicker={datePicker}
                      onEnter={enterShift}
                      onSkip={() => {
                        moveToNextDay("変更せずに進みました");
                      }}
                      patternKeys={patternKeys}
                      selectedShift={selectedShift}
                    />
                  </div>
                )}
              </Screen>
              <Sheet
                label="今月の内訳"
                onOpenChange={sheetChange("breakdown")}
                open={openSheet === "breakdown"}
              >
                <SheetHeading
                  eyebrow={`${month.getFullYear()}年${month.getMonth() + 1}月`}
                  onClose={() => {
                    setOpenSheet(null);
                  }}
                  title="今月の内訳"
                />
                <div className={sheetBody}>
                  <dl className={breakdown.list}>
                    {counts.map(({ key, label, count }) => (
                      <div className={breakdown.row()} key={key}>
                        <dt className={breakdown.name}>
                          <ShiftMark shift={key} size={18} />
                          {label}
                        </dt>
                        <dd className={breakdown.count}>
                          {count}
                          <span className={breakdown.unit}>日</span>
                        </dd>
                      </div>
                    ))}
                    <div className={breakdown.row({ unfilled: true })}>
                      <dt className={breakdown.name}>未入力</dt>
                      <dd className={breakdown.count}>
                        {unfilled}
                        <span className={breakdown.unit}>日</span>
                      </dd>
                    </div>
                  </dl>
                  <p className={breakdown.total}>
                    この月は全{monthDays.length}日
                  </p>
                </div>
              </Sheet>
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
              <PhoneToasts toaster={toaster} />
            </Phone>
          </ToastContext>
        </PhoneContext>
      </OwnPatternsContext>
    </PatternsContext>
  );
}

// 今月の内訳: a row for each pattern and one for the days still blank,
// with the month's length under them. With many patterns they scroll
// under the heading, which stays with its ×.
const breakdown = {
  count: css({
    color: "accent.default",
    fontWeight: 600,
    margin: 0,
    textStyle: "title3",
  }),
  list: css({ margin: 0 }),
  name: css({
    "& > span": { fontSize: "24px" },
    alignItems: "center",
    display: "flex",
    gap: "12px",
    textStyle: "body",
  }),
  row: cva({
    base: {
      alignItems: "center",
      borderBottom: "1px solid token(colors.separator)",
      display: "flex",
      justifyContent: "space-between",
      minHeight: "52px",
    },
    variants: { unfilled: { true: { color: "text.tertiary" } } },
  }),
  total: css({
    color: "text.tertiary",
    // 20px under the list, with the scrolling part's 12px gap.
    margin: "8px 0 0",
    textAlign: "center",
    textStyle: "footnote",
  }),
  unit: css({ fontWeight: 400, marginLeft: "8px", textStyle: "footnote" }),
};

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

// From one row of days to the next.
const ROW_STEP = DAY_ROW_HEIGHT + DAY_ROW_GAP;
// How the month folds into a week and back: one spring for all of it,
// the moving, the height and the fading, the same as one withAnimation
// of the standard spring in the apps.
const fold = spring("standard");
const folding = {
  cell: css({ display: "grid", minWidth: 0 }),
  // Clips nothing: the rows moving out of it fade on the way, and the
  // pager's edges take them out of sight.
  page: css({ position: "relative" }),
};

// The page shown, folding as the month turns into one of its weeks and
// back, like the Calendar apps. The days lie on one sheet, each in its
// row of the month; the sheet moves up by `row` rows to bring the week to
// the top, the other days fade on it, and the page's height follows so
// what is under it moves too. As one thing moving, the week can't move
// apart from the rest of the month. All of it follows `folded`, so a
// finger pulling the week open moves it as the springs do.
function FoldingGrid({
  dates,
  folded,
  label,
  renderCell,
  row,
  weekDetail,
}: {
  dates: Date[];
  folded: MotionValue<number>;
  label: string;
  renderCell: (date: Date) => ReactNode;
  row: number;
  weekDetail: boolean;
}) {
  const unfolded = dayGridHeight(Math.max(dates.length / 7, MONTH_WEEKS));
  const week = dayGridHeight(1);
  return (
    <motion.section
      aria-label={label}
      className={folding.page}
      // Motion sets a CSS variable from a motion value, though its types
      // leave them out.
      style={
        {
          "--fold": folded,
          height: `calc(${week}px + ${unfolded - week}px * (1 - var(--fold)))`,
        } as MotionStyle
      }
    >
      <div
        className={dayGrid}
        style={{
          transform: `translateY(calc(${-row * ROW_STEP}px * var(--fold)))`,
        }}
      >
        {dates.map((date, index) => {
          // Folded away, the rest of the month is out of reach.
          const away = weekDetail && Math.floor(index / 7) !== row;
          return (
            <div
              aria-hidden={away || undefined}
              className={folding.cell}
              inert={away}
              key={dateKey(date)}
              style={
                Math.floor(index / 7) === row
                  ? undefined
                  : { opacity: "calc(1 - var(--fold))" }
              }
            >
              {renderCell(date)}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

// Past this share of the way, a pull let go unfolds the month; short of
// it, the week folds back. A flick faster than this, in pixels a second,
// goes the way it is flicked wherever it is let go.
const UNFOLD_SHARE = 1 / 3;
const UNFOLD_FLICK = 400;
// How far the finger goes before the pull is told from a tap or a swipe
// sideways: little, so it is told before Safari takes the finger to
// scroll.
const PULL_SLOP = 6;
// Held still this long, in milliseconds, before letting go, the finger
// lets go without speed: the last move's speed is no flick.
const PULL_STILL_MS = 80;

// A pull down, as a share of `reach` (0 to 1) while the finger moves, and
// with its speed down in pixels a second when let go. A pull starts only
// going down, not sideways (the week's swipe) and not over something
// scrolled down (it scrolls back up first), nor in a text box. A finger
// taken by the system lets go standing still, so it goes back.
function usePullDown({
  enabled,
  reach,
  onPull,
  onRelease,
}: {
  enabled: boolean;
  reach: number;
  onPull: (share: number) => void;
  onRelease: (share: number, speed: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ enabled, onPull, onRelease, reach });
  useEffect(() => {
    latest.current = { enabled, onPull, onRelease, reach };
  });
  useEffect(() => {
    const area = ref.current;
    if (!area) {
      return;
    }
    let pointer: number | undefined;
    let pulling = false;
    // The finger's listeners on the window, taken off as it lets go.
    let following: AbortController | undefined;
    const stop = () => {
      following?.abort();
      following = undefined;
      pointer = undefined;
      pulling = false;
      area.style.removeProperty("user-select");
    };
    let from = { x: 0, y: 0 };
    // Pulled since the finger went down, so letting go presses nothing.
    let pulled = false;
    let share = 0;
    let speed = 0;
    let last = { time: 0, y: 0 };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      if (!pulling) {
        const across = event.clientX - from.x;
        const down = event.clientY - from.y;
        if (Math.hypot(across, down) < PULL_SLOP) {
          return;
        }
        if (down <= Math.abs(across)) {
          stop();
          return;
        }
        pulling = true;
        pulled = true;
        // From here, so the month does not jump by the slop.
        from = { x: event.clientX, y: event.clientY };
        last = { time: event.timeStamp, y: event.clientY };
        area.style.userSelect = "none";
      }
      share = Math.min(
        Math.max((event.clientY - from.y) / latest.current.reach, 0),
        1
      );
      const elapsed = (event.timeStamp - last.time) / 1000;
      if (elapsed > 0) {
        speed = (event.clientY - last.y) / elapsed;
      }
      last = { time: event.timeStamp, y: event.clientY };
      latest.current.onPull(share);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      if (pulling) {
        const still =
          event.type === "pointercancel" ||
          event.timeStamp - last.time > PULL_STILL_MS;
        latest.current.onRelease(share, still ? 0 : speed);
      }
      stop();
    };
    const scrolledDown = (target: Element) => {
      for (
        let element: Element | null = target;
        element && element !== area;
        element = element.parentElement
      ) {
        if (element.scrollTop > 0) {
          return true;
        }
      }
      return false;
    };
    const start = (event: PointerEvent) => {
      pulled = false;
      const { target } = event;
      if (
        !latest.current.enabled ||
        !event.isPrimary ||
        event.button !== 0 ||
        !(target instanceof Element) ||
        target.closest("input, textarea, [contenteditable]") ||
        scrolledDown(target)
      ) {
        return;
      }
      pointer = event.pointerId;
      from = { x: event.clientX, y: event.clientY };
      share = 0;
      speed = 0;
      following = new AbortController();
      const { signal } = following;
      window.addEventListener("pointermove", move, { signal });
      window.addEventListener("pointerup", up, { signal });
      window.addEventListener("pointercancel", up, { signal });
    };
    // Once pulling, the finger is the pull's: the screen does not scroll.
    const hold = (event: TouchEvent) => {
      if (pulling && event.cancelable) {
        event.preventDefault();
      }
    };
    const press = (event: MouseEvent) => {
      if (pulled) {
        event.preventDefault();
        event.stopPropagation();
        pulled = false;
      }
    };
    area.addEventListener("pointerdown", start);
    area.addEventListener("touchmove", hold, { passive: false });
    area.addEventListener("click", press, true);
    return () => {
      stop();
      area.removeEventListener("pointerdown", start);
      area.removeEventListener("touchmove", hold);
      area.removeEventListener("click", press, true);
    };
  }, []);
  return ref;
}

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
  daysOff,
  onOpen,
  progress,
  swiped = false,
  beside,
}: {
  month: Date;
  daysOff: number;
  onOpen: () => void;
  progress?: MotionValue<number>;
  swiped?: boolean;
  // The days off in the months before and after, while the pages can be
  // dragged.
  beside?: { previous: number; next: number };
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const turn = useTurn(monthIndex(month), swiped);
  const monthOf = (by: number) => {
    const date = new Date(month.getFullYear(), month.getMonth() + by, 1);
    const thisMonth =
      date.getFullYear() === designToday.getFullYear() &&
      date.getMonth() === designToday.getMonth();
    return thisMonth ? "今月" : `${date.getMonth() + 1}月`;
  };
  const dragged = progress && beside;
  return (
    <SummaryRow
      days={
        <>
          <span className={srOnly}>{daysOff}</span>
          <span aria-hidden="true">
            <RollingName
              end
              next={dragged ? String(beside.next) : undefined}
              previous={dragged ? String(beside.previous) : undefined}
              progress={progress}
              still={reduceMotion}
              text={String(daysOff)}
              turn={turn}
            />
          </span>
        </>
      }
      label={
        <>
          <span className={srOnly}>{monthOf(0)}のお休み</span>
          <span aria-hidden="true">
            <RollingName
              next={dragged ? monthOf(1) : undefined}
              previous={dragged ? monthOf(-1) : undefined}
              progress={progress}
              still={reduceMotion}
              text={monthOf(0)}
              turn={turn}
            />
            のお休み
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
// while away from it, then the save menu or 完了, and the arrows stay for
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
  progress,
  swiped,
}: {
  mode: "view" | "edit" | "week";
  month: Date;
  detailDate: Date | undefined;
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
    : month.getFullYear() === designToday.getFullYear() &&
      month.getMonth() === designToday.getMonth();
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
  const isThisMonth = (by: number) => {
    const beside = new Date(month.getFullYear(), month.getMonth() + by, 1);
    return (
      beside.getFullYear() === designToday.getFullYear() &&
      beside.getMonth() === designToday.getMonth()
    );
  };
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
// the keyboard and screen readers, 今月 while away, then the save menu or
// 完了.
function SwipeCorner({
  mode,
  previous,
  next,
  back,
  onImage,
  onCalendar,
  onDone,
}: {
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
      {mode === "view" ? (
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
      ) : (
        <DoneButton onClick={onDone} />
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
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  return Array.from(
    { length: count },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)
  ).some((date) => !schedule[dateKey(date)]);
}

// Emoji marks draw in the system's emoji font wherever they sit.
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", sans-serif';

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
    fontFamily: EMOJI_FONT,
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
// time's pills set the time, the shift and the people unfold their chips
// under their row, and the memo is written in its own field. Nothing
// changes on a stray tap, as it did when every shift was a chip on show.
const dayDetail = {
  // A row's chips, unfolded under it inside the list, with a line above
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
  patterns: css({
    border: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    margin: 0,
    padding: 0,
  }),
  // An action on its row, in the accent as iOS's text buttons in a list.
  reset: css({ "& > *": { color: "accent.default" } }),
  root: css({ display: "flex", flexDirection: "column", gap: "24px" }),
};

type Unfolded = "shift" | "members" | undefined;

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
  members,
  selected,
  onChange,
}: {
  members: MemberOptions;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  // Held to the limit here too: a name confirmed and added in one go may
  // not have been cut to it yet.
  function add(name: string) {
    const trimmed = limitText(name.trim(), textLimits.personName);
    setAdding(false);
    if (!trimmed) {
      return;
    }
    if (!members.names.includes(trimmed)) {
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
  members,
  onChange,
}: {
  entry: DayEntry | undefined;
  patternKeys: Shift[];
  members: MemberOptions;
  onChange: (entry: DayEntry | undefined) => void;
}) {
  const book = usePatterns();
  const pattern = entry && book[entry.shift];
  const time = pattern?.time;
  const timeChanged = Boolean(entry?.start || entry?.end);
  // A blank day has nothing to read, so its shifts are out to pick from.
  const [unfolded, setUnfolded] = useState<Unfolded>(
    entry ? undefined : "shift"
  );
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
    setUnfolded("shift");
    onChange(undefined);
  }
  function toggle(row: Exclude<Unfolded, undefined>) {
    setUnfolded(unfolded === row ? undefined : row);
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
          aria-expanded={unfolded === "shift"}
          arrow={<Disclosure open={unfolded === "shift"} />}
          label="シフト"
          onClick={() => {
            toggle("shift");
          }}
          value={
            entry ? (
              <>
                <ShiftMark shift={entry.shift} size={18} />
                {pattern?.name}
              </>
            ) : (
              "なし"
            )
          }
          valueClassName={markValue}
        />
        {unfolded === "shift" && (
          <div className={dayDetail.unfolded} data-list-row="">
            <ChoiceGrid
              className={dayDetail.patterns}
              label="シフト"
              onValueChange={(key) => {
                onChange(keepDetails(entry, key));
                setUnfolded(undefined);
              }}
              value={entry?.shift ?? null}
            >
              {patternKeys.map((key) => (
                <ChoiceChip key={key} value={key}>
                  <ShiftMark shift={key} size={14} />
                  {book[key]?.name}
                </ChoiceChip>
              ))}
            </ChoiceGrid>
          </div>
        )}
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
            aria-expanded={unfolded === "members"}
            arrow={<Disclosure open={unfolded === "members"} />}
            label="一緒に働く人"
            onClick={() => {
              toggle("members");
            }}
            value={selected.length > 0 ? selected.join("、") : "なし"}
          />
        )}
        {entry && time && unfolded === "members" && (
          <div className={dayDetail.unfolded} data-list-row="">
            <MemberChips
              members={members}
              onChange={(next) => {
                onChange({
                  ...entry,
                  members: next.length > 0 ? next : undefined,
                });
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
