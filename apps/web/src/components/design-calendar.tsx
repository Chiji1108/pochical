import { DatePicker, parseDate } from "@ark-ui/react";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useContext, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { patterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { useSettings } from "../lib/design-settings-store";
import { designToday } from "../lib/design-today";
import { useUser } from "../lib/design-user-store";
import type { DesignVariants } from "../lib/design-variants";
import type { Coworkers } from "./design-coworkers";
import { GapSheet, gapDaysIn } from "./design-gap-sheet";
import { DesignGroup, JoinSheet } from "./design-group";
import { MonthTitleButton } from "./design-month-picker";
import { Phone } from "./design-phone";
import { ImagePreviewPage, SaveSheet } from "./design-save-sheet";
import { DesignSettings } from "./design-settings";
import type { SettingsPage } from "./design-settings";
import { PhoneContext, Sheet, SheetHeading } from "./design-sheet";
import { useThemeStyle } from "./design-theme";
import { PhoneToasts, ToastContext, usePhoneToaster } from "./design-toast";
import {
  Button,
  Chip,
  ChipGroup,
  chipStyle,
  Choice,
  ChoiceGrid,
  DAY_ROW_GAP,
  DAY_ROW_HEIGHT,
  dayGrid,
  dayGridHeight,
  DoneButton,
  fieldHint,
  fieldLabel,
  IconMenu,
  MenuItem,
  MONTH_WEEKS,
  Pager,
  Screen,
  srOnly,
  SummaryRow,
  TodayButton,
  WeekdayRow,
} from "./design-ui";
import { holidayName, holidayNameOfKey, useWeek } from "./design-week";
import {
  CellNamesContext,
  lookOf,
  OffDisplayContext,
  ShiftMark,
  ShiftMarkStyleContext,
  useDisplayColor,
  useOffHighlight,
} from "./shift-mark";

// Entering one of these also fills the next day, like 夜勤 then 明け.
export const nextDayShifts: Partial<Record<Shift, Shift>> = { night: "after" };
type DayEntry = {
  shift: Shift;
  // Set only when the time differs from the pattern's standard time.
  start?: string;
  end?: string;
  note?: string;
  members?: string[];
};
type MemberOptions = Pick<Coworkers, "names" | "onAdd">;
export type Schedule = Record<string, DayEntry | undefined>;
// A repeating order of shifts; `start` is the first day of the sequence and
// the day the rule takes over from the one before it.
// `holidaysOff` turns national holidays into 休み, for people off on them.
// `anchor` is a day that falls on the first shift of the sequence, when
// that is not `start` itself.
export type RepeatRule = {
  sequence: Shift[];
  start: Date;
  anchor?: Date;
  holidaysOff?: boolean;
};

// What a rule fills in from its start, a year ahead.
function ruleSchedule(rule: RepeatRule, holidaysOff = false) {
  const { sequence, start } = rule;
  return repeatSchedule(
    sequence,
    rule.anchor ?? start,
    start,
    ruleEnd(start),
    holidaysOff
  );
}
export const patternSets: Record<4 | 5 | 6 | 8, Shift[]> = {
  4: ["day", "night", "after", "off"],
  5: ["early", "day", "night", "after", "off"],
  6: ["early", "day", "late", "night", "after", "off"],
  8: ["early", "day", "late", "night", "after", "off", "training", "paid"],
};
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const dayMilliseconds = 86_400_000;
const leadingZeroPattern = /^0/;
const sample: Shift[] = [
  "day",
  "day",
  "night",
  "after",
  "off",
  "off",
  "day",
  "day",
  "night",
  "after",
  "off",
  "day",
  "day",
  "off",
  "night",
  "after",
  "off",
  "day",
  "day",
  "day",
  "off",
  "night",
  "after",
  "off",
  "day",
  "day",
  "off",
  "night",
  "after",
  "off",
];

// The last rule decides; an empty sequence means back to a roster.
export function isRepeating(rules: RepeatRule[]) {
  return (rules.at(-1)?.sequence.length ?? 0) > 0;
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// A week with 休み on a weekend day reads as office hours, which usually
// have national holidays off too.
export function defaultHolidaysOff(sequence: Shift[], start: Date) {
  const weekLength = 7;
  if (sequence.length !== weekLength) {
    return false;
  }
  return sequence.some((shift, index) => {
    const day = addDays(start, index).getDay();
    return shift === "off" && (day === 0 || day === 6);
  });
}

const sampleDetails: Record<string, Omit<DayEntry, "shift">> = {
  "2026-09-08": { end: "20:00", note: "棚卸し" },
  "2026-09-19": { members: ["田中", "山本"], start: "08:00" },
  "2026-09-25": { end: "20:00" },
  "2026-09-26": { note: "新人さん同行" },
};

function sampleShift(patternCount: 4 | 5 | 6 | 8, index: number): Shift {
  if (patternCount === 8) {
    return patternSets[8][index % 8];
  }
  const shift = sample[index % sample.length];
  if (shift === "day" && patternCount > 4 && index % 2 === 0) {
    return "early";
  }
  if (shift === "day" && patternCount === 6) {
    return "late";
  }
  return shift;
}

export function initialDesignSchedule(
  patternCount: 4 | 5 | 6 | 8 = 4,
  month = 8,
  year = 2026
): Schedule {
  const count = new Date(year, month + 1, 0).getDate();
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const key = dateKey(new Date(year, month, index + 1));
      return [
        key,
        { shift: sampleShift(patternCount, index), ...sampleDetails[key] },
      ];
    })
  );
}

// Lays a repeating sequence over [from, to], counting from the anchor day so
// days before the anchor line up too.
// Repeating shifts are filled in a year ahead.
function ruleEnd(start: Date) {
  return new Date(start.getFullYear(), start.getMonth() + 13, 0);
}

export function repeatSchedule(
  sequence: Shift[],
  anchor: Date,
  from: Date,
  to: Date,
  holidaysOff = false
): Schedule {
  const schedule: Schedule = {};
  const anchorTime = Date.UTC(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate()
  );
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const offset = Math.round(
      (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
        anchorTime) /
        dayMilliseconds
    );
    const index =
      ((offset % sequence.length) + sequence.length) % sequence.length;
    const shift = sequence[index];
    schedule[dateKey(date)] = {
      shift: holidaysOff && holidayName(date) ? "off" : shift,
    };
  }
  return schedule;
}

export function isDayOff(shift: Shift | undefined) {
  return shift === "off" || shift === "paid";
}

function keepDetails(entry: DayEntry | undefined, shift: Shift): DayEntry {
  if (entry?.shift === shift) {
    return entry;
  }
  return { members: entry?.members, note: entry?.note, shift };
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function formatDay(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`;
}

function formatTime(time: string) {
  return time.replace(leadingZeroPattern, "");
}

export function timeRange(entry: DayEntry) {
  const { time } = patterns[entry.shift];
  if (!time) {
    return;
  }
  const start = entry.start ?? time[0];
  const end = entry.end ?? time[1];
  return `${formatTime(start)} – ${end <= start ? "翌" : ""}${formatTime(end)}`;
}

const minutesPerDay = 1440;
const minutesPerHour = 60;
const halfDay = minutesPerDay / 2;

function minutesOf(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * minutesPerHour + minutes;
}

// How a day's time moved from its pattern's: starting earlier is 早出 and
// ending later is 残業, the two people most need to see on the month.
// Other moves, a later start or an earlier end, are only "changed". Times
// are counted from the standard start, so a night shift's end the next
// morning, or a start the evening before, compares the right way.
export function timeChangeOf(entry: DayEntry | undefined) {
  const time = entry && patterns[entry.shift].time;
  if (!(entry && time && (entry.start || entry.end))) {
    return;
  }
  const standardStart = minutesOf(time[0]);
  const fromStart = (clock: string) => {
    const offset = minutesOf(clock) - standardStart;
    if (offset > halfDay) {
      return offset - minutesPerDay;
    }
    return offset < -halfDay ? offset + minutesPerDay : offset;
  };
  const endOf = (clock: string) => {
    const offset = minutesOf(clock) - standardStart;
    return offset <= 0 ? offset + minutesPerDay : offset;
  };
  const early = entry.start !== undefined && fromStart(entry.start) < 0;
  const late = entry.end !== undefined && endOf(entry.end) > endOf(time[1]);
  return { early, late };
}

// One person's phone. Their data comes from the nearest UserStoreContext,
// so two phones under one store show the same person.
export function DesignCalendar({
  initialEditing,
  initialMonth = 8,
  variants,
  pendingInvite = false,
  initialTab = "calendar",
  initialSettingsPage,
  fullScreen = false,
}: {
  initialEditing: boolean;
  // On /try: filling a real phone's screen rather than a pictured one.
  fullScreen?: boolean;
  initialMonth?: number;
  variants: DesignVariants;
  // For the flow diagrams: a tab, and a settings page, to open on.
  initialTab?: Tab;
  initialSettingsPage?: SettingsPage;
  // A group's invitation link was opened: ask about joining over the
  // calendar.
  pendingInvite?: boolean;
}) {
  const schedule = useUser((state) => state.schedule);
  const onChange = useUser((state) => state.setSchedule);
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
  const offDisplay = useContext(OffDisplayContext);
  const imageOptions = useSettings((state) => state.device.imageOptions);
  const setImageOptions = useSettings((state) => state.setImageOptions);
  const [detailDate, setDetailDate] = useState<Date>();
  // The row of the month the opened week is on, for the month to fold up
  // into it and unfold back around it.
  const [foldRow, setFoldRow] = useState(0);
  // Counts the turns to another month or week, as against folding the one
  // shown: a turned page is drawn afresh, so only folding animates.
  const [pageTurn, setPageTurn] = useState(0);
  const coworkerNames = useUser((state) => state.coworkers);
  const setCoworkerNames = useUser((state) => state.setCoworkers);
  const [tab, setTab] = useState<Tab>(initialTab);
  // The group the group tab opens on, like one just joined from a link.
  const [openGroup, setOpenGroup] = useState<string>();
  const profile = useUser((state) => state.profile);
  const setProfile = useUser((state) => state.setProfile);
  const rules = useUser((state) => state.rules);
  const setRules = useUser((state) => state.setRules);
  // Renaming or deleting someone changes the days they are on too.
  const updateMembersOnDays = (change: (names: string[]) => string[]) => {
    onChange((previous) =>
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
  const [selectedDay, setSelectedDay] = useState(1);
  // Whether the month being entered had blank days when it came up, as
  // only then can 完了 have just filled it. A filled month can be entered
  // too, with ポチポチ入力 always offered in the 保存を右上 variant.
  const [enteredBlank, setEnteredBlank] = useState(true);
  const [month, setMonth] = useState(() => new Date(2026, initialMonth, 1));
  const patternKeys = useUser((state) => state.patternKeys);
  const setPatternKeys = useUser((state) => state.setPatternKeys);
  const sharing = useUser((state) => state.groups.length > 0);
  const [announcement, setAnnouncement] = useState("");
  const weekTools = useWeek();
  const dates = weekTools.monthDates(month);
  const monthDays = dates.filter(
    (date) => date.getMonth() === month.getMonth()
  );
  const daysOff = monthDays.filter((date) =>
    isDayOff(schedule[dateKey(date)]?.shift)
  ).length;
  const counts = patternKeys.map((key) => ({
    key,
    ...patterns[key],
    count: monthDays.filter((date) => schedule[dateKey(date)]?.shift === key)
      .length,
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
    setPageTurn((turn) => turn + 1);
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
  function rowOf(date: Date) {
    const index = dates.findIndex((day) => dateKey(day) === dateKey(date));
    return Math.max(0, Math.floor(index / 7));
  }
  function onMonth(date: Date) {
    return dates.some((day) => dateKey(day) === dateKey(date));
  }
  // The month stays while the week opened is one of its rows, as every row
  // holds a day of it: a day of the month before, opened from the top row,
  // folds back into that row. Only a week off the month takes its month.
  function openDetail(date: Date) {
    if (!weekDetail) {
      setFoldRow(rowOf(date));
    }
    setDetailDate(date);
    if (!onMonth(date)) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }
  function goToMonth(target: Date) {
    setPageTurn((turn) => turn + 1);
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
      setPageTurn((turn) => turn + 1);
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
  // From the switch day on, the new order replaces what the old one wrote.
  // Fills the schedule from the rule's start. Everything from that day on
  // is replaced, so an empty sequence leaves a roster to fill in.
  function fillRule(rule: RepeatRule) {
    const from = dateKey(rule.start);
    const holidaysOff =
      rule.sequence.length > 0 &&
      (rule.holidaysOff ??
        defaultHolidaysOff(rule.sequence, rule.anchor ?? rule.start));
    onChange((previous) => ({
      ...Object.fromEntries(
        Object.entries(previous).filter(([key]) => key < from)
      ),
      ...(rule.sequence.length > 0 ? ruleSchedule(rule, holidaysOff) : {}),
    }));
    return rule.sequence.length > 0 ? { ...rule, holidaysOff } : rule;
  }
  function applyRule(rule: RepeatRule) {
    const filled = fillRule(rule);
    setRules((previous) => [...previous, filled]);
  }
  // Corrects the rule in use from its own start, rather than adding one.
  function fixRule(rule: RepeatRule) {
    const filled = fillRule(rule);
    setRules((previous) => [...previous.slice(0, -1), filled]);
  }
  function changeJob(job: { patternKeys: Shift[]; rule: RepeatRule }) {
    setPatternKeys(job.patternKeys);
    applyRule(job.rule);
  }
  // Only holidays still showing what the rule put there change, so days
  // the person edited stay as they are.
  function setHolidaysOff(holidaysOff: boolean) {
    const rule = rules.at(-1);
    if (!rule) {
      return;
    }
    const planned = ruleSchedule(rule);
    onChange((previous) => {
      const next = { ...previous };
      for (const [key, entry] of Object.entries(planned)) {
        const plannedShift = entry?.shift;
        const current = previous[key];
        if (
          !(holidayNameOfKey(key) && plannedShift) ||
          plannedShift === "off"
        ) {
          continue;
        }
        if (holidaysOff && current?.shift === plannedShift) {
          next[key] = { ...current, shift: "off" };
        }
        if (!holidaysOff && current?.shift === "off") {
          next[key] = { ...current, shift: plannedShift };
        }
      }
      return next;
    });
    setRules((previous) => [
      ...previous.slice(0, -1),
      { ...rule, holidaysOff },
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
    const shift = key ?? "off";
    if (!key) {
      setPatternKeys((previous) => [...previous, shift]);
    }
    onChange((previous) => ({
      ...previous,
      ...Object.fromEntries(gapDays.map((date) => [dateKey(date), { shift }])),
    }));
    if (unfilled === gapDays.length) {
      openSave(true);
    }
  }
  function closeDetail() {
    if (detailDate) {
      setFoldRow(rowOf(detailDate));
    }
    setDetailDate(undefined);
  }
  function changeEntry(date: Date, entry: DayEntry | undefined) {
    onChange((previous) => ({ ...previous, [dateKey(date)]: entry }));
  }
  function enterShift(shift: Shift | undefined) {
    const key = dateKey(selectedDate);
    const following = shift && nextDayShifts[shift];
    const followingKey = dateKey(addDays(selectedDate, 1));
    onChange((previous) => ({
      ...previous,
      [key]: shift && keepDetails(previous[key], shift),
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
        ? `${patterns[shift].label}を入力しました。翌日は${patterns[following].label}です`
        : `${patterns[shift].label}を入力しました`,
      following ? 2 : 1
    );
  }
  return (
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
              patternKeys={patternKeys}
              profile={profile}
              rules={rules}
              schedule={schedule}
            />
          )}
          {tab === "group" && (
            <DesignGroup
              initialGroupId={openGroup}
              scanResult={variants.scanResult}
              onTab={setTab}
              patternKeys={patternKeys}
              profile={profile}
              schedule={schedule}
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
          <Screen hidden={tab !== "calendar" || imagePreview}>
            <div className={heading.bar}>
              <MonthHeading
                mode={headingMode}
                month={month}
                onPick={goToMonth}
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
                  setPageTurn((turn) => turn + 1);
                  openDetail(designToday);
                }}
              />
            </div>
            <div className={calendarPage.scroll}>
              <WeekdayRow />
              <OffDisplayContext
                value={
                  weekDetail && offDisplay === "blank" ? "faint" : offDisplay
                }
              >
                <Pager
                  onStep={step}
                  page={weekDetail ? dateKey(detailDate) : dateKey(month)}
                  renderPage={(offset) => {
                    const pageMonth = new Date(
                      month.getFullYear(),
                      month.getMonth() + offset,
                      1
                    );
                    const pageDates = weekDetail
                      ? weekTools.weekDates(addDays(detailDate, offset * 7))
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
                          key={pageTurn}
                          label={label}
                          renderCell={renderCell}
                          shift={-foldRow * ROW_STEP}
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
                animate={{ opacity: 1 }}
                aria-label={formatDay(detailDate)}
                className={calendarPage.detail}
                initial={{ opacity: 0 }}
                transition={fold}
              >
                <h4 className={calendarPage.detailDate}>
                  {formatDay(detailDate)}
                </h4>
                <DayDetail
                  entry={schedule[dateKey(detailDate)]}
                  members={members}
                  onChange={(entry) => {
                    changeEntry(detailDate, entry);
                  }}
                  patternKeys={patternKeys}
                />
              </motion.section>
            )}
            {/* On an empty month too, at 0日, so the month keeps the two
                rows of one being filled in: the card above ポチポチ入力.
                Any spare height stays over it, so the summary, the input
                or save buttons and the tab bar sit together at the bottom. */}
            {headingMode === "view" && (
              <div className={calendarPage.bottom}>
                <MonthSummary
                  daysOff={daysOff}
                  month={month}
                  onOpen={() => {
                    setOpenSheet("breakdown");
                  }}
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
            <p className={breakdown.total}>この月は全{monthDays.length}日</p>
          </Sheet>
          {pendingInvite && (
            <JoinSheet
              name={profile.name}
              onOpenGroup={(groupId) => {
                setOpenGroup(groupId);
                setTab("group");
              }}
            />
          )}
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
            choices={patternKeys
              .filter((key) => isDayOff(key))
              .map((key) => ({ key, label: patterns[key].label }))}
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
  );
}

export type Tab = "calendar" | "group" | "settings";

// The app's three tabs, as the platforms' tab bars: an icon over its name,
// the one shown in the accent color.
const tabs: { tab: Tab; label: string; icon: typeof CalendarDays }[] = [
  { icon: CalendarDays, label: "カレンダー", tab: "calendar" },
  { icon: UsersRound, label: "グループ", tab: "group" },
  { icon: Settings2, label: "設定", tab: "settings" },
];
// As iOS 26's: a round-ended bar floating over the screen's foot, held
// off its sides, see-through and blurring what runs under it, the picked
// tab on a round ground of its own. Its words keep a fixed size, as the
// system's tab bars do. The screen leaves room for it: see Screen.
const tabBar = {
  bar: css({
    backdropFilter: "blur(16px) saturate(1.4)",
    bg: "color-mix(in srgb, var(--fill-tertiary) 80%, transparent)",
    borderRadius: "999px",
    bottom: "var(--tab-bar-bottom)",
    boxShadow: "0 4px 20px var(--shadow-medium)",
    color: "text.tertiary",
    display: "flex",
    height: "64px",
    left: "20px",
    padding: "4px",
    position: "absolute",
    right: "20px",
    zIndex: 10,
  }),
  item: cva({
    base: {
      alignItems: "center",
      bg: "transparent",
      border: 0,
      borderRadius: "999px",
      display: "flex",
      flex: 1,
      flexDirection: "column",
      fontSize: "10px",
      fontWeight: 500,
      gap: "4px",
      justifyContent: "center",
    },
    variants: {
      active: {
        true: { bg: "var(--fill-secondary)", color: "accent.default" },
      },
    },
  }),
};

export function TabBar({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <nav aria-label="タブ" className={tabBar.bar} data-tab-bar="">
      {tabs.map(({ tab, label, icon: Icon }) => (
        <button
          aria-current={active === tab ? "page" : undefined}
          className={tabBar.item({ active: active === tab })}
          key={tab}
          onClick={() => {
            onSelect(tab);
          }}
          type="button"
        >
          <Icon aria-hidden="true" size={24} />
          {label}
        </button>
      ))}
    </nav>
  );
}

// 今月の内訳: a row for each pattern and one for the days still blank,
// with the month's length under them.
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
    margin: "20px 0 0",
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
  month: css({ fontSize: "36px", fontWeight: 600, lineHeight: 1.1 }),
  monthUnit: css({ fontSize: "14px", fontWeight: 500, marginLeft: "4px" }),
  step: css({
    bg: "transparent",
    border: 0,
    borderRadius: "12px",
    color: "text.tertiary",
    display: "grid",
    height: "40px",
    placeItems: "center",
    width: "36px",
  }),
  title: css({ flexShrink: 0, fontWeight: 400, margin: 0 }),
  year: css({
    color: "text.tertiary",
    display: "block",
    fontSize: "11px",
    marginBottom: "4px",
  }),
};

// The calendar tab's page: the grid scrolls on its own under the heading
// when the phone is short, and an opened day's detail fills what is left.
const calendarPage = {
  detail: css({
    borderTop: "1px solid token(colors.separator)",
    flex: 1,
    marginTop: "12px",
    minHeight: 0,
    overflowY: "auto",
    padding: "16px 8px 12px",
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
  // Room around the grid for the picked day's outline.
  scroll: css({
    minHeight: 0,
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: "4px",
    position: "relative",
    touchAction: "pan-y",
  }),
};

// From one row of days to the next.
const ROW_STEP = DAY_ROW_HEIGHT + DAY_ROW_GAP;
// How the month folds into a week and back: one spring without bounce,
// the same as SwiftUI's .spring(duration: 0.3, bounce: 0) for the apps.
const fold = { bounce: 0, type: "spring", visualDuration: 0.3 } as const;
// How a day leaves as the month folds, moving by `by`. Folding into the
// top row, the month stays put, so its days wait out the fold, cut off as
// the grid shrinks, rather than going at once, as a move to where they
// already are would end at once.
function leave(by: number) {
  if (by === 0) {
    return { transition: { delay: fold.visualDuration }, y: [null, 0] };
  }
  return { y: by };
}
const folding = {
  cell: css({ display: "grid", minWidth: 0 }),
  // Days on their way out are laid over the grid where they were.
  grid: css({ position: "relative" }),
};

// The page shown, folding as the month turns into one of its weeks and
// back, like the Calendar apps: the week's days move to the row they go
// to, the other days slide along with the rest of the month as one piece,
// in and out of sight at the pager's edges, and the page's height follows
// so what is under it moves too. `shift` is how far the month moves up to
// bring the week to the top.
function FoldingGrid({
  dates,
  label,
  renderCell,
  shift,
  weekDetail,
}: {
  dates: Date[];
  label: string;
  renderCell: (date: Date) => ReactNode;
  shift: number;
  weekDetail: boolean;
}) {
  const weeks = dates.length / 7;
  const room = weekDetail ? weeks : Math.max(weeks, MONTH_WEEKS);
  return (
    <motion.section
      animate={{ height: dayGridHeight(room) }}
      aria-label={label}
      className={cx(dayGrid, folding.grid)}
      initial={false}
      transition={fold}
    >
      {/* The shift out is the one as the days leave, passed as custom. */}
      <AnimatePresence custom={shift} initial={false} mode="popLayout">
        {dates.map((date) => (
          <motion.div
            animate={{ y: 0 }}
            className={folding.cell}
            exit="away"
            initial={{ y: shift }}
            key={dateKey(date)}
            // Measured only when folding, not as pages turn.
            layout
            layoutDependency={weekDetail}
            transition={fold}
            variants={{ away: leave }}
          >
            {renderCell(date)}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.section>
  );
}

function screenMode(editing: boolean, weekDetail: boolean) {
  if (editing) {
    return "edit";
  }
  return weekDetail ? "week" : "view";
}

export function MonthSummary({
  month,
  daysOff,
  onOpen,
}: {
  month: Date;
  daysOff: number;
  onOpen: () => void;
}) {
  const thisMonth =
    month.getFullYear() === designToday.getFullYear() &&
    month.getMonth() === designToday.getMonth();
  return (
    <SummaryRow
      days={daysOff}
      label={`${thisMonth ? "今月" : `${month.getMonth() + 1}月`}のお休み`}
      onOpen={onOpen}
    />
  );
}

// The year over the month. Looking at months, its name opens a choice of
// months, left plain like minical's so the heading stays a picture: the
// swipe and the input's date picker are the ways that show.
function MonthHeading({
  month,
  mode,
  onPick,
}: {
  month: Date;
  mode: "view" | "edit" | "week";
  onPick: (month: Date) => void;
}) {
  const name = (
    <>
      <span className={heading.year}>{month.getFullYear()}</span>
      <strong className={heading.month}>
        {month.getMonth() + 1}
        <span className={heading.monthUnit}>月</span>
      </strong>
    </>
  );
  return (
    <h3 className={heading.title}>
      {mode === "view" ? (
        <MonthTitleButton chevron={false} month={month} onPick={onPick}>
          <span>{name}</span>
        </MonthTitleButton>
      ) : (
        name
      )}
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
}: {
  mode: "view" | "edit" | "week";
  month: Date;
  detailDate: Date | undefined;
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
  const back = (
    <TodayButton
      disabled={atToday}
      onClick={week ? onThisWeek : onThisMonth}
      unit={unit}
    />
  );
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
      atToday={atToday}
      back={back}
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
  atToday,
  previous,
  next,
  back,
  onImage,
  onCalendar,
  onDone,
}: {
  mode: "view" | "edit" | "week";
  atToday: boolean;
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
      {mode !== "edit" && !atToday && (
        <div className={heading.backAtEnd}>{back}</div>
      )}
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

// A repeating order being put together: the days so far as tiles, each
// taken out by a tap, over the patterns to add, dashed like the
// platforms' add buttons.
const repeatEditor = {
  add: css({
    alignItems: "center",
    bg: "transparent",
    border: "1px dashed var(--border-strong)",
    borderRadius: "999px",
    color: "accent.default",
    display: "inline-flex",
    gap: "4px",
    minHeight: "32px",
    padding: "0 12px",
    textStyle: "caption",
  }),
  day: css({
    "& > small": { color: "text.quaternary", fontSize: "8px" },
    "& > span": { fontFamily: EMOJI_FONT, fontSize: "18px", lineHeight: 1.2 },
    alignItems: "center",
    bg: "background.card",
    border: "1px solid token(colors.border.default)",
    borderRadius: "12px",
    color: "text.secondary",
    display: "flex",
    flexDirection: "column",
    fontSize: "9px",
    gap: "1px",
    height: "58px",
    justifyContent: "center",
    position: "relative",
    width: "38px",
  }),
  palette: css({ display: "flex", flexWrap: "wrap", gap: "8px" }),
  sequence: css({
    bg: "fill.quaternary",
    borderRadius: "16px",
    display: "flex",
    flexWrap: "wrap",
    gap: "4px",
    listStyle: "none",
    margin: "0 0 8px",
    minHeight: "58px",
    padding: "8px",
  }),
};

// Days with the shift each gets, as a strip of small tiles a week wide:
// the first two weeks of an order being set up, in the first run and in
// settings alike.
const shiftPreview = {
  day: css({
    alignItems: "center",
    bg: "fill.quaternary",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    padding: "4px 0",
  }),
  number: cva({
    base: {
      color: "text.tertiary",
      fontFamily: "-apple-system, sans-serif",
      fontSize: "9px",
    },
    variants: {
      tone: {
        holiday: { color: "calendar.holiday" },
        plain: {},
        saturday: { color: "calendar.saturday" },
      },
    },
  }),
  strip: css({
    display: "grid",
    fontFamily: EMOJI_FONT,
    fontSize: "16px",
    gap: "4px",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    textAlign: "center",
  }),
};

export function ShiftPreview({
  label,
  days,
}: {
  label: string;
  days: { date: Date; shift: Shift | undefined }[];
}) {
  const weekTools = useWeek();
  return (
    <div aria-label={label} className={shiftPreview.strip} role="img">
      {days.map(({ date, shift }) => (
        <span className={shiftPreview.day} key={dateKey(date)}>
          <small
            className={shiftPreview.number({ tone: weekTools.dateTone(date) })}
          >
            {date.getDate()}
          </small>
          {shift && <ShiftMark shift={shift} size={16} />}
        </span>
      ))}
    </div>
  );
}

export function RepeatSequenceEditor({
  sequence,
  patternKeys,
  onChange,
}: {
  sequence: Shift[];
  patternKeys: Shift[];
  onChange: (sequence: Shift[]) => void;
}) {
  return (
    <div>
      <p className={fieldLabel()}>
        並び
        <span className={fieldHint}>
          {sequence.length > 0
            ? `${sequence.length}日ごとに繰り返し`
            : "下から順番に追加してください"}
        </span>
      </p>
      <ol className={repeatEditor.sequence}>
        {sequence.map((shift, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- the same shift repeats, so its position is its identity.
          <li key={index}>
            <button
              aria-label={`${index + 1}日目、${patterns[shift].label}。タップで外す`}
              className={repeatEditor.day}
              onClick={() => {
                onChange(sequence.filter((_, position) => position !== index));
              }}
              type="button"
            >
              <small>{index + 1}</small>
              <ShiftMark shift={shift} size={18} />
              {patterns[shift].label}
            </button>
          </li>
        ))}
      </ol>
      <div className={repeatEditor.palette}>
        {patternKeys.map((key) => (
          <button
            className={repeatEditor.add}
            key={key}
            onClick={() => {
              onChange([...sequence, key]);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={11} />
            <ShiftMark shift={key} size={13} />
            {patterns[key].label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Entering a month: the day's date, a button for each pattern, and 消す
// and 翌日へ. Up to four patterns sit in one row; more wrap in rows of
// three, or of four for eight, each keeping the 72px of the one row and
// shrinking only when the screen is too narrow. ポチポチ入力 and the
// save buttons that stand in its place share its edges.
const shiftInput = {
  action: css({
    _disabled: { color: "text.disabled", cursor: "default" },
    _hover: { "&:not(:disabled)": { bg: "accent.container" } },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "control",
    color: "text.tertiary",
    display: "flex",
    gap: "4px",
    minHeight: "touch",
    padding: "4px 16px",
    textStyle: "caption",
  }),
  actions: css({
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
  pattern: cva({
    base: {
      _active: { bg: "accent.pressed", transform: "scale(0.97)" },
      _hover: { bg: "accent.container", borderColor: "accent.border" },
      alignItems: "center",
      bg: "background.card",
      border: "1px solid token(colors.border.default)",
      borderRadius: "control",
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
  if (patternKeys.length === 8) {
    return "four";
  }
  return patternKeys.length > 4 ? "three" : "one";
}

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
  const rows = patternKeys.length > 4;
  return (
    <>
      {datePicker}
      <fieldset
        aria-label="入力するシフト"
        className={shiftInput.patterns({ columns: columnsFor(patternKeys) })}
      >
        {patternKeys.map((key) => (
          <button
            className={shiftInput.pattern({ rows })}
            key={key}
            onClick={() => {
              onEnter(key);
            }}
            type="button"
          >
            <span className={shiftInput.mark}>
              <ShiftMark shift={key} size={26} />
            </span>
            <span>{patterns[key].label}</span>
          </button>
        ))}
      </fieldset>
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

// A day of a month: its date, and its shift's mark with the name under
// it when names are shown. The group's month of one person draws its days
// with the same parts.
export const dayCell = cva({
  base: {
    "&:is(button)": { cursor: "pointer" },
    "&:is(button):active": { transform: "scale(0.94)" },
    _hover: { "&:is(button):not([data-active])": { bg: "accent.hover" } },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    fontSize: "11px",
    gap: "2px",
    height: "64px",
    minWidth: 0,
    paddingBlock: "4px",
    position: "relative",
  },
  variants: {
    // Picked: the day being entered or opened.
    active: {
      true: {
        outline: "2px solid token(colors.accent.default)",
        outlineOffset: "-2px",
      },
    },
    // A day off in its own pattern's tint, set as --off-tint.
    off: { true: { bg: "var(--off-tint, var(--calendar-off-tint))" } },
    // A day of the month before or after: the same day, faded whole, as on
    // the group's calendar.
    outside: { true: { opacity: 0.35 } },
    today: {
      true: {
        outline: "1.5px solid token(colors.accent.focus)",
        outlineOffset: "-1px",
      },
    },
  },
});

export const dayParts = {
  date: css({ flexShrink: 0, fontWeight: 600, lineHeight: "14px" }),
  dateOutside: css({ fontWeight: 400 }),
  holiday: css({ color: "calendar.holiday" }),
  label: css({
    color: "text.secondary",
    flexShrink: 0,
    fontSize: "9px",
    lineHeight: "12px",
  }),
  mark: css({
    display: "grid",
    flexShrink: 0,
    fontFamily: EMOJI_FONT,
    fontSize: "20px",
    height: "24px",
    lineHeight: 1,
    placeItems: "center",
  }),
  // Without a name under it, the mark takes the room below the date.
  markAlone: css({ flex: 1, height: "auto" }),
  // 休みの見せ方 空白, while entering or in the week view.
  markFaint: css({ opacity: 0.35 }),
  // A note: a stroke under the date, as marked in a paper diary.
  noted: css({
    _before: {
      bg: "var(--calendar-note-marker)",
      borderRadius: "2px",
      content: '""',
      inset: "45% -3px -1px",
      position: "absolute",
      zIndex: -1,
    },
    isolation: "isolate",
    position: "relative",
  }),
};

// The shift's mark, with 早出 and 残業 drawn on its sides.
function CellShift({
  shift,
  early = false,
  late = false,
  faint = false,
}: {
  shift: Shift;
  early?: boolean;
  late?: boolean;
  faint?: boolean;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const { names } = useContext(CellNamesContext);
  const withName = names[style];
  let size = style === "badge" ? 26 : 24;
  if (withName) {
    size = style === "badge" ? 22 : 21;
  }
  return (
    <>
      <span
        className={cx(
          dayParts.mark,
          !withName && dayParts.markAlone,
          faint && dayParts.markFaint
        )}
      >
        <ShiftMark early={early} late={late} shift={shift} size={size} />
      </span>
      {withName && (
        <span className={dayParts.label}>{patterns[shift].label}</span>
      )}
    </>
  );
}

// Days off take a light tint of their own pattern color, not the theme,
// when the setting for the current look asks for it.
function dayOffStyle(
  shift: Shift | undefined,
  highlight: boolean,
  tint: string
) {
  if (!(highlight && shift && isDayOff(shift))) {
    return;
  }
  return { "--off-tint": tint } as CSSProperties;
}

// What a screen reader says after the date.
function dayDetails(date: Date, shift: Shift | undefined, entry?: DayEntry) {
  const change = timeChangeOf(entry);
  const moves = [change?.early ? "早出" : "", change?.late ? "残業" : ""]
    .filter(Boolean)
    .join("・");
  return [
    holidayName(date) ?? "",
    shift ? patterns[shift].label : "未入力",
    change && entry ? `${moves || "時間変更"} ${timeRange(entry)}` : "",
    entry?.note ? "メモあり" : "",
  ].filter(Boolean);
}

export function DayCell({
  date,
  entry,
  outside,
  editing,
  active,
  onPress,
  plain = false,
  className,
}: {
  date: Date;
  entry: DayEntry | undefined;
  outside: boolean;
  editing: boolean;
  active: boolean;
  onPress: () => void;
  // Only the shift, for the saved image: no today frame, no note stroke.
  plain?: boolean;
  className?: string;
}) {
  const markStyle = useContext(ShiftMarkStyleContext);
  // A picture of the month keeps to the month; on screen the days around it
  // show what they hold, faded, and open like any other day.
  const blank = outside && plain;
  const shift = blank ? undefined : entry?.shift;
  const highlight = useOffHighlight(markStyle);
  const { tint } = useDisplayColor(lookOf(shift ?? "off").color);
  const offDisplay = useContext(OffDisplayContext);
  const dayOff = shift !== undefined && isDayOff(shift);
  const hideOff = dayOff && offDisplay === "blank" && !editing;
  const faintOff =
    dayOff && (offDisplay === "faint" || (offDisplay === "blank" && editing));
  const offStyle =
    hideOff || faintOff ? undefined : dayOffStyle(shift, highlight, tint);
  const today = dateKey(date) === dateKey(designToday);
  const holiday = useWeek().isColoredHoliday(date);
  const change = blank ? undefined : timeChangeOf(entry);
  // A note is about the day, not the shift, so the date is marked, with a
  // stroke as in a paper diary, apart from the shift's 早出 and 残業
  // corners, and only on the person's own calendar. Other time
  // changes, a later start or an earlier end, show when the day is opened.
  const noted = !plain && Boolean(entry?.note);
  // The picked frame wins over today's.
  const cellClass = cx(
    dayCell({
      active,
      off: Boolean(offStyle),
      outside,
      today: today && !editing && !active && !plain,
    }),
    className
  );
  const content = (
    <>
      <span
        className={cx(
          dayParts.date,
          outside && dayParts.dateOutside,
          holiday && dayParts.holiday,
          noted && dayParts.noted
        )}
      >
        {date.getDate()}
      </span>
      {shift && !hideOff && (
        <CellShift
          early={change?.early}
          faint={faintOff}
          late={change?.late}
          shift={shift}
        />
      )}
    </>
  );
  if (blank) {
    return (
      <div className={cellClass} style={offStyle}>
        {content}
      </div>
    );
  }
  const details = dayDetails(date, shift, entry);
  return (
    <button
      aria-haspopup={editing ? undefined : "dialog"}
      aria-label={`${date.getMonth() + 1}月${date.getDate()}日、${details.join("、")}`}
      aria-pressed={editing ? active : undefined}
      className={cellClass}
      data-active={active || undefined}
      onClick={onPress}
      style={offStyle}
      type="button"
    >
      {content}
    </button>
  );
}

// A day opened in the week: its shift as chips, then its time, the people
// working it and a memo, each a labelled row, and a way to clear it.
const dayDetail = {
  delete: css({
    alignItems: "center",
    alignSelf: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "control",
    color: "danger.default",
    display: "flex",
    gap: "4px",
    minHeight: "touch",
    padding: "0 16px",
    textStyle: "caption",
  }),
  empty: css({ color: "text.quaternary", margin: 0, textStyle: "footnote" }),
  // The time and the memo, as the platforms' filled text fields.
  field: css({
    _focus: {
      bg: "background.card",
      borderColor: "accent.focus",
      outline: "none",
    },
    bg: "fill.quaternary",
    border: "1px solid transparent",
    borderRadius: "12px",
    color: "text.primary",
    font: "inherit",
    minHeight: "40px",
    minWidth: 0,
    padding: "0 12px",
    textStyle: "body",
  }),
  hint: css({ color: "text.quaternary", margin: 0, textStyle: "caption" }),
  label: css({ color: "text.tertiary", textStyle: "footnote" }),
  // The legend floats, so the fieldset lays it out like the other rows'
  // labels.
  legend: css({ float: "left", padding: "0 0 8px", width: "100%" }),
  markHint: css({
    color: "text.tertiary",
    display: "block",
    marginTop: "4px",
    textStyle: "caption",
  }),
  memberInput: css({
    border: "1px solid token(colors.accent.focus)",
    borderRadius: "999px",
    font: "inherit",
    minHeight: "34px",
    outline: "none",
    padding: "0 12px",
    textStyle: "footnote",
    width: "88px",
  }),
  members: css({ border: 0, margin: 0, padding: 0 }),
  patterns: css({
    border: 0,
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    margin: 0,
    padding: 0,
  }),
  reset: css({
    bg: "transparent",
    border: 0,
    color: "accent.default",
    marginLeft: "8px",
    padding: "4px 8px",
    textDecoration: "underline",
    textStyle: "caption",
  }),
  root: css({ display: "flex", flexDirection: "column", gap: "20px" }),
  row: css({ display: "flex", flexDirection: "column", gap: "8px" }),
  time: css({
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    gap: "8px",
  }),
};

function MemberField({
  members,
  selected,
  onChange,
}: {
  members: MemberOptions;
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  function add(name: string) {
    const trimmed = name.trim();
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
    <fieldset className={cx(dayDetail.row, dayDetail.members)}>
      <legend className={cx(dayDetail.label, dayDetail.legend)}>
        一緒に働く人
      </legend>
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
          <input
            aria-label="追加する人の名前"
            autoFocus
            className={dayDetail.memberInput}
            onBlur={(event) => {
              add(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
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
    </fieldset>
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
  const time = entry && patterns[entry.shift].time;
  const timeChanged = Boolean(entry?.start || entry?.end);
  // Said in words here, where there is room: the mark only shows a shape.
  const change = timeChangeOf(entry);
  const moves =
    [change?.early ? "早出" : "", change?.late ? "残業" : ""]
      .filter(Boolean)
      .join("・") || "変更済み";
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
      <ChoiceGrid
        className={dayDetail.patterns}
        label="シフト"
        onValueChange={(key) => {
          onChange(keepDetails(entry, key));
        }}
        value={entry?.shift ?? null}
      >
        {patternKeys.map((key) => (
          <Choice className={chipStyle()} key={key} value={key}>
            <ShiftMark shift={key} size={14} />
            {patterns[key].label}
          </Choice>
        ))}
      </ChoiceGrid>
      {entry ? (
        <>
          {time && (
            <div className={dayDetail.row}>
              <span className={dayDetail.label}>時間</span>
              <div className={dayDetail.time}>
                <input
                  aria-label="開始時刻"
                  className={dayDetail.field}
                  onChange={(event) => {
                    changeTime("start", event.target.value);
                  }}
                  type="time"
                  value={entry.start ?? time[0]}
                />
                <span aria-hidden="true">–</span>
                <input
                  aria-label="終了時刻"
                  className={dayDetail.field}
                  onChange={(event) => {
                    changeTime("end", event.target.value);
                  }}
                  type="time"
                  value={entry.end ?? time[1]}
                />
              </div>
              <p className={dayDetail.hint}>
                {timeChanged ? (
                  <>
                    {moves}
                    <button
                      className={dayDetail.reset}
                      onClick={() => {
                        onChange({
                          ...entry,
                          end: undefined,
                          start: undefined,
                        });
                      }}
                      type="button"
                    >
                      標準（{timeRange({ shift: entry.shift })}）に戻す
                    </button>
                    {/* The mark this makes, explained as it is made, to
                        the people who use it. */}
                    {change && (change.early || change.late) && (
                      <span className={dayDetail.markHint}>
                        カレンダーのシフトの角に印が付きます
                      </span>
                    )}
                  </>
                ) : (
                  "標準の時間"
                )}
              </p>
            </div>
          )}
          {time && (
            <MemberField
              members={members}
              onChange={(selected) => {
                onChange({
                  ...entry,
                  members: selected.length > 0 ? selected : undefined,
                });
              }}
              selected={entry.members ?? []}
            />
          )}
          <label className={dayDetail.row}>
            <span className={dayDetail.label}>メモ</span>
            <input
              className={dayDetail.field}
              onChange={(event) => {
                onChange({ ...entry, note: event.target.value || undefined });
              }}
              placeholder="メモを入力"
              value={entry.note ?? ""}
            />
          </label>
          <button
            className={dayDetail.delete}
            onClick={() => {
              onChange(undefined);
            }}
            type="button"
          >
            <Trash2 aria-hidden="true" size={14} />
            この日のシフトを消す
          </button>
        </>
      ) : (
        <p className={dayDetail.empty}>
          シフトを選ぶと、時間やメモを入力できます。
        </p>
      )}
    </div>
  );
}

const picker = {
  card: css({
    bg: "background.elevated",
    borderRadius: "24px",
    boxShadow: "0 16px 60px var(--shadow-large)",
    color: "text.primary",
    padding: "20px",
    width: "min(360px, calc(100% - 24px))",
  }),
  heading: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
  }),
  iconButton: css({
    bg: "transparent",
    border: 0,
    borderRadius: "12px",
    color: "text.primary",
    display: "grid",
    height: "touch",
    placeItems: "center",
    width: "touch",
  }),
  month: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "space-between",
    margin: "12px 0",
    textStyle: "body",
  }),
  table: css({ borderCollapse: "collapse", width: "100%" }),
  title: css({ margin: 0, textStyle: "body" }),
  weekday: css({
    color: "text.tertiary",
    fontWeight: 400,
    paddingBottom: "8px",
    textStyle: "caption",
  }),
};

// A day in the month. The picked day's fill and an outside day's fade
// outrank the week's colors, being attribute selectors.
const pickerCell = cva({
  base: {
    "&[data-outside-range]": { color: "text.quaternary" },
    "&[data-selected]": {
      bg: "accent.fill",
      color: "accent.onFill",
      fontWeight: 600,
    },
    _focusVisible: { outline: "2px solid token(colors.accent.default)" },
    _hover: { bg: "accent.container" },
    alignItems: "center",
    borderRadius: "12px",
    cursor: "default",
    display: "flex",
    justifyContent: "center",
    minHeight: "touch",
    textStyle: "subheadline",
  },
  variants: {
    // The design's today, not the real one Ark marks.
    today: {
      false: {},
      true: {
        outline: "1.5px solid token(colors.accent.focus)",
        outlineOffset: "-1px",
      },
    },
    tone: {
      holiday: { color: "calendar.holiday" },
      plain: {},
      saturday: { color: "calendar.saturday" },
    },
  },
});

function toDateValue(date: Date) {
  return parseDate(dateKey(date));
}

// A month to pick one day in, as SwiftUI's graphical DatePicker and
// Compose's DatePicker: Ark UI's DatePicker draws it and moves through it
// by arrow keys. Sundays, holidays and Saturdays take the week's colors.
export function MonthPicker({
  value,
  month,
  onSelect,
}: {
  value?: Date;
  // The month it opens on while nothing is picked.
  month?: Date;
  onSelect: (date: Date) => void;
}) {
  const weekTools = useWeek();
  return (
    <DatePicker.Root
      defaultFocusedValue={toDateValue(value ?? month ?? designToday)}
      inline
      locale="ja-JP"
      onValueChange={(details) => {
        const [picked] = details.value;
        if (picked) {
          onSelect(new Date(picked.year, picked.month - 1, picked.day));
        }
      }}
      outsideDaySelectable
      startOfWeek={weekTools.weekStart}
      value={value ? [toDateValue(value)] : []}
    >
      <DatePicker.View view="day">
        <DatePicker.Context>
          {(api) => (
            <>
              <DatePicker.ViewControl className={picker.month}>
                <DatePicker.PrevTrigger
                  aria-label="前の月"
                  className={picker.iconButton}
                >
                  <ChevronLeft aria-hidden="true" size={20} />
                </DatePicker.PrevTrigger>
                <strong aria-live="polite">
                  {api.focusedValue.year}年{api.focusedValue.month}月
                </strong>
                <DatePicker.NextTrigger
                  aria-label="次の月"
                  className={picker.iconButton}
                >
                  <ChevronRight aria-hidden="true" size={20} />
                </DatePicker.NextTrigger>
              </DatePicker.ViewControl>
              <DatePicker.Table className={picker.table}>
                <DatePicker.TableHead>
                  <DatePicker.TableRow>
                    {weekTools.weekdays.map((day) => (
                      <DatePicker.TableHeader
                        className={picker.weekday}
                        key={day.day}
                      >
                        {day.label}
                      </DatePicker.TableHeader>
                    ))}
                  </DatePicker.TableRow>
                </DatePicker.TableHead>
                <DatePicker.TableBody>
                  {api.weeks.map((week) => (
                    <DatePicker.TableRow key={week[0]?.toString()}>
                      {week.map((day) => {
                        const date = new Date(day.year, day.month - 1, day.day);
                        return (
                          <DatePicker.TableCell
                            key={day.toString()}
                            value={day}
                          >
                            <DatePicker.TableCellTrigger
                              className={pickerCell({
                                today: dateKey(date) === dateKey(designToday),
                                tone: weekTools.dateTone(date),
                              })}
                            >
                              {day.day}
                            </DatePicker.TableCellTrigger>
                          </DatePicker.TableCell>
                        );
                      })}
                    </DatePicker.TableRow>
                  ))}
                </DatePicker.TableBody>
              </DatePicker.Table>
            </>
          )}
        </DatePicker.Context>
      </DatePicker.View>
    </DatePicker.Root>
  );
}

// Picking one day, in a dialog over the phone like Material's date picker
// and SwiftUI's graphical DatePicker. Ark UI's DatePicker draws the month
// and moves through it by arrow keys; 今日 jumps back to today.
// The button that shows the day and opens the picker: plain over the
// pattern buttons while entering, filled like a field in a form.
const dateButton = {
  button: cva({
    base: {
      _focusVisible: {
        outline: "2px solid token(colors.accent.focus)",
        outlineOffset: "2px",
      },
      alignItems: "center",
      border: 0,
      borderRadius: "action",
      color: "text.primary",
      cursor: "pointer",
      display: "flex",
      fontWeight: 600,
      gap: "4px",
      minHeight: "touch",
      padding: "0 12px 0 16px",
      textStyle: "headline",
    },
    variants: {
      look: {
        field: {
          _hover: { bg: "accent.hover", borderColor: "accent.border" },
          bg: "accent.container",
          border: "1px solid token(colors.accent.border)",
          margin: 0,
          textStyle: "body",
        },
        inline: {
          _hover: { bg: "accent.container" },
          bg: "transparent",
          margin: "0 auto 8px",
        },
      },
    },
  }),
  chevron: css({ color: "accent.default" }),
};

export function InputDatePicker({
  title = "入力する日付",
  ariaLabel,
  look = "inline",
  date,
  onSelect,
  children,
}: {
  title?: string;
  ariaLabel: string;
  look?: "inline" | "field";
  date: Date;
  onSelect: (date: Date) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pick = (day: Date) => {
    onSelect(day);
    setOpen(false);
  };
  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={dateButton.button({ look })}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        {children}
        <ChevronDown
          aria-hidden="true"
          className={dateButton.chevron}
          size={15}
        />
      </button>
      <Sheet
        className={picker.card}
        label={`${title}を選択`}
        onOpenChange={setOpen}
        open={open}
        placement="center"
      >
        <header className={picker.heading}>
          <h4 className={picker.title}>{title}</h4>
          <div className={picker.heading}>
            <Button
              onClick={() => {
                pick(designToday);
              }}
              variant="text"
            >
              今日
            </Button>
            <button
              aria-label="日付選択を閉じる"
              className={picker.iconButton}
              onClick={() => {
                setOpen(false);
              }}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        </header>
        <MonthPicker onSelect={pick} value={date} />
      </Sheet>
    </>
  );
}
