import { DatePicker, parseDate } from "@ark-ui/react";
import {
  ArrowRight,
  BatteryFull,
  CalendarDays,
  CalendarPlus,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  Pencil,
  Plus,
  Settings2,
  Signal,
  Trash2,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import { useContext, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import { css, cva, cx } from "styled-system/css";

import { patterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { useSettings } from "../lib/design-settings-store";
import { useUser } from "../lib/design-user-store";
import type { DesignVariants } from "../lib/design-variants";
import type { Coworkers } from "./design-coworkers";
import { GapSheet, gapDaysIn } from "./design-gap-sheet";
import { DesignGroup, JoinSheet } from "./design-group";
import { ImportReviewPage } from "./design-import";
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
  Choice,
  ChoiceGrid,
  IconButton,
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
const designToday = new Date(2026, 8, 24);
const swipeDistance = 50;
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
}: {
  initialEditing: boolean;
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
    "breakdown" | "import" | "save" | "gap" | null
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
  // The check before a photographed roster goes in, and the line after.
  const [importReview, setImportReview] = useState(false);
  const imageOptions = useSettings((state) => state.device.imageOptions);
  const setImageOptions = useSettings((state) => state.setImageOptions);
  const [detailDate, setDetailDate] = useState<Date>();
  const coworkerNames = useUser((state) => state.coworkers);
  const setCoworkerNames = useUser((state) => state.setCoworkers);
  const [tab, setTab] = useState<Tab>(initialTab);
  const profile = useUser((state) => state.profile);
  const setProfile = useUser((state) => state.setProfile);
  const rules = useUser((state) => state.rules);
  const setRules = useUser((state) => state.setRules);
  // Repeating shifts fill every month, so the monthly input buttons go away.
  const repeating = isRepeating(rules);
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
  const emptyMonth = unfilled === monthDays.length;
  // Input is offered only while the month has days to fill: a repeating
  // order fills them itself, and a filled month is fixed by tapping a day.
  const showInputBar = !repeating && unfilled > 0;
  // The いつも2段 variant: the bottom always holds two rows, what the month
  // is on top and what to do next under it, so the calendar keeps one
  // height. A filled month's next step is saving it.
  const twoRows = variants.bottomRows === "two";
  const showSaveBar = twoRows && !showInputBar;
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
  const datePicker = (
    <InputDatePicker
      ariaLabel={`入力する日付：${month.getMonth() + 1}月${selectedDay}日(${weekdays[selectedDate.getDay()]})。タップで変更`}
      date={selectedDate}
      onSelect={(date) => {
        setSelectedDay(date.getDate());
        setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
        setAnnouncement(
          `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日を選択中`
        );
      }}
    >
      <span>
        {`${month.getMonth() + 1}月${selectedDay}日`}
        <span
          className={`dc-input-weekday ${weekTools.dateClass(selectedDate)}`}
        >
          ({weekdays[selectedDate.getDay()]})
        </span>
      </span>
      <ChevronDown aria-hidden="true" className="dc-input-chevron" size={15} />
    </InputDatePicker>
  );
  const weekDetail = !editing && detailDate !== undefined;
  const gridDates = weekDetail ? weekTools.weekDates(detailDate) : dates;
  const headingMode = screenMode(editing, weekDetail);
  function openDetail(date: Date) {
    setDetailDate(date);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }
  function goToMonth(target: Date) {
    setMonth(target);
    if (editing) {
      setSelectedDay(1);
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
  const swipeHandlers = useSwipe((direction) => {
    step(direction);
  });
  function startInput() {
    setSelectedDay(1);
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
    if (unfilled === 0) {
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
  function openImport() {
    setOpenSheet("import");
  }
  function closeDetail() {
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
        <div
          className={`dc-phone ${editing ? "dc-editing" : ""} ${weekDetail ? "dc-week-mode" : ""} ${showInputBar || showSaveBar ? "" : "dc-no-input"} ${twoRows ? "dc-two-rows" : ""}`}
          ref={phoneRef}
          style={themeStyle}
        >
          <PhoneStatusBar />
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
              onTab={setTab}
              patternKeys={patternKeys}
              profile={profile}
              schedule={schedule}
            />
          )}
          {tab === "calendar" && importReview && (
            <ImportReviewPage
              coworkerNames={coworkerNames}
              month={month}
              onApply={(result) => {
                onChange((previous) => ({ ...previous, ...result.schedule }));
                if (result.newPatterns.length > 0) {
                  setPatternKeys([...patternKeys, ...result.newPatterns]);
                }
                if (result.newCoworkers.length > 0) {
                  setCoworkerNames([...coworkerNames, ...result.newCoworkers]);
                }
                setImportReview(false);
                toast(
                  `${month.getMonth() + 1}月のシフトを${result.days}日分入れました`
                );
              }}
              onCancel={() => {
                setImportReview(false);
              }}
              patternKeys={patternKeys}
              run={variants.importRun}
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
          <div
            className="dc-content"
            hidden={tab !== "calendar" || imagePreview || importReview}
          >
            <div className="dc-heading">
              <h3 className="dc-heading-title">
                <span className="dc-year">{month.getFullYear()}</span>
                <strong>
                  {month.getMonth() + 1}
                  <span>月</span>
                </strong>
              </h3>
              <HeadingActions
                atEnd={twoRows}
                detailDate={detailDate}
                mode={headingMode}
                month={month}
                onDone={finishHeading}
                onSave={
                  twoRows
                    ? undefined
                    : () => {
                        openSave(false);
                      }
                }
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
              />
            </div>
            <div className="dc-calendar-scroll" {...swipeHandlers}>
              <div aria-hidden="true" className="dc-weekdays">
                {weekTools.weekdays.map((day) => (
                  <span className={day.className} key={day.day}>
                    {day.label}
                  </span>
                ))}
              </div>
              <OffDisplayContext
                value={
                  weekDetail && offDisplay === "blank" ? "faint" : offDisplay
                }
              >
                <section
                  aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月のシフト`}
                  className={`dc-grid ${weekDetail ? "dc-grid-week" : ""}`}
                  style={{ "--weeks": gridDates.length / 7 } as CSSProperties}
                >
                  {gridDates.map((date) => (
                    <DayCell
                      active={
                        editing
                          ? date.getMonth() === month.getMonth() &&
                            date.getDate() === selectedDay
                          : detailDate !== undefined &&
                            dateKey(date) === dateKey(detailDate)
                      }
                      date={date}
                      editing={editing}
                      entry={schedule[dateKey(date)]}
                      key={dateKey(date)}
                      onPress={() => {
                        editing
                          ? setSelectedDay(date.getDate())
                          : openDetail(date);
                      }}
                      outside={
                        !weekDetail && date.getMonth() !== month.getMonth()
                      }
                    />
                  ))}
                </section>
              </OffDisplayContext>
            </div>
            {weekDetail && (
              <section
                aria-label={formatDay(detailDate)}
                className="dc-week-detail"
              >
                <h4 className="dc-detail-date">{formatDay(detailDate)}</h4>
                <DayDetail
                  entry={schedule[dateKey(detailDate)]}
                  members={members}
                  onChange={(entry) => {
                    changeEntry(detailDate, entry);
                  }}
                  patternKeys={patternKeys}
                />
              </section>
            )}
            {headingMode === "view" && !emptyMonth && (
              <MonthSummary
                daysOff={daysOff}
                month={month}
                onOpen={() => {
                  setOpenSheet("breakdown");
                }}
              />
            )}
            {headingMode === "edit" && (
              <div className="dc-controls">
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
            {headingMode === "view" && showInputBar && (
              <div className="dc-controls">
                <StartArea
                  label="ポチポチ入力"
                  onImport={openImport}
                  onStart={startInput}
                  stacked={twoRows && emptyMonth}
                />
              </div>
            )}
            {headingMode === "view" && showSaveBar && (
              <div className="dc-controls">
                <SaveArea
                  onCalendar={() => {
                    openSave(false, true);
                  }}
                  onImage={() => {
                    setImagePreview(true);
                  }}
                />
              </div>
            )}
            {headingMode === "view" && (
              <TabBar active="calendar" onSelect={setTab} />
            )}
          </div>
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
            <dl className="dc-counts">
              {counts.map(({ key, label, count }) => (
                <div key={key}>
                  <dt>
                    <ShiftMark shift={key} size={18} />
                    {label}
                  </dt>
                  <dd>
                    {count}
                    <span>日</span>
                  </dd>
                </div>
              ))}
              <div className="dc-unfilled">
                <dt>未入力</dt>
                <dd>
                  {unfilled}
                  <span>日</span>
                </dd>
              </div>
            </dl>
            <p className="dc-sheet-total">この月は全{monthDays.length}日</p>
          </Sheet>
          {pendingInvite && (
            <JoinSheet
              name={profile.name}
              onOpenGroup={() => {
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
          <ImportSheet
            access={variants.importAccess}
            onRead={() => {
              setImportReview(true);
            }}
            onOpenChange={sheetChange("import")}
            onStartPochi={startInput}
            open={openSheet === "import"}
          />
          <span aria-live="polite" className="dc-sr-only">
            {announcement}
          </span>
          <div aria-hidden="true" className="dc-home-indicator" />
          <PhoneToasts toaster={toaster} />
        </div>
      </ToastContext>
    </PhoneContext>
  );
}

export type Tab = "calendar" | "group" | "settings";

export function TabBar({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <nav aria-label="タブ" className="dc-nav">
      <button
        aria-current={active === "calendar" ? "page" : undefined}
        className={`dc-nav-item ${active === "calendar" ? "dc-nav-active" : ""}`}
        onClick={() => {
          onSelect("calendar");
        }}
        type="button"
      >
        <CalendarDays aria-hidden="true" size={23} />
        カレンダー
      </button>
      <button
        aria-current={active === "group" ? "page" : undefined}
        className={`dc-nav-item ${active === "group" ? "dc-nav-active" : ""}`}
        onClick={() => {
          onSelect("group");
        }}
        type="button"
      >
        <UsersRound aria-hidden="true" size={23} />
        グループ
      </button>
      <button
        aria-current={active === "settings" ? "page" : undefined}
        className={`dc-nav-item ${active === "settings" ? "dc-nav-active" : ""}`}
        onClick={() => {
          onSelect("settings");
        }}
        type="button"
      >
        <Settings2 aria-hidden="true" size={23} />
        設定
      </button>
    </nav>
  );
}

export function PhoneStatusBar() {
  return (
    <div aria-hidden="true" className="dc-status">
      <span>9:41</span>
      <span className="dc-island" />
      <span className="dc-status-icons">
        <Signal size={17} strokeWidth={2.6} />
        <Wifi size={18} strokeWidth={2.5} />
        <BatteryFull size={25} strokeWidth={1.8} />
      </span>
    </div>
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
    <button
      aria-haspopup="dialog"
      className="dc-summary"
      onClick={onOpen}
      type="button"
    >
      <span>{thisMonth ? "今月" : `${month.getMonth() + 1}月`}のお休み</span>
      <strong>
        {daysOff}
        <span>日</span>
        <ChevronRight aria-hidden="true" size={17} />
      </strong>
    </button>
  );
}

// Swiping the calendar sideways moves it, like the mobile app's pager.
function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number }>(undefined);
  const swiped = useRef(false);
  return {
    onPointerDown: (event: PointerEvent) => {
      start.current = { x: event.clientX, y: event.clientY };
      swiped.current = false;
    },
    onPointerUp: (event: PointerEvent) => {
      const origin = start.current;
      start.current = undefined;
      if (!origin) {
        return;
      }
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.abs(dx) > swipeDistance && Math.abs(dx) > Math.abs(dy) * 1.5) {
        swiped.current = true;
        onSwipe(dx < 0 ? 1 : -1);
      }
    },
    // Keep the day under the finger from also being tapped.
    onClickCapture: (event: MouseEvent) => {
      if (swiped.current) {
        swiped.current = false;
        event.stopPropagation();
      }
    },
  };
}

// "‹ 今月 ›" sits in the middle of the heading, so it never moves with the
// width of the month; 今月 (or 今週 in the week view) stays visible and is
// disabled when there is nowhere to go back to. With `atEnd`, the month
// view has the right-hand corner free, so "今月 ‹ ›" takes it, the arrows
// together at the edge; entering drops them, as its date picker changes
// the month, leaving 完了 alone there.
function HeadingActions({
  mode,
  atEnd = false,
  month,
  detailDate,
  onStep,
  onThisMonth,
  onThisWeek,
  onDone,
  onSave,
}: {
  mode: "view" | "edit" | "week";
  atEnd?: boolean;
  month: Date;
  detailDate: Date | undefined;
  onStep: (direction: 1 | -1) => void;
  onThisMonth: () => void;
  // Back to this week, opened on today.
  onThisWeek: () => void;
  onDone: () => void;
  // Left out when saving has a row of its own at the bottom.
  onSave?: () => void;
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
      onClick={() => {
        onStep(-1);
      }}
      type="button"
    >
      <ChevronLeft aria-hidden="true" size={21} />
    </button>
  );
  const back = (
    <button
      aria-label={week ? "今週に戻る" : "今月に戻る"}
      className="dc-this-month"
      disabled={atToday}
      onClick={week ? onThisWeek : onThisMonth}
      type="button"
    >
      {week ? "今週" : "今月"}
    </button>
  );
  const next = (
    <button
      aria-label={`次の${unit}`}
      onClick={() => {
        onStep(1);
      }}
      type="button"
    >
      <ChevronRight aria-hidden="true" size={21} />
    </button>
  );
  const navAtEnd = atEnd && mode === "view";
  return (
    <>
      {navAtEnd && (
        <div className="dc-heading-nav dc-heading-nav-end">
          {/* Shown only away from this month: the arrows sit at the edge,
              so nothing moves, and its coming in says where you are. */}
          {!atToday && back}
          {previous}
          {next}
        </div>
      )}
      {!navAtEnd && !(atEnd && mode === "edit") && (
        <div className="dc-heading-nav">
          {previous}
          {back}
          {next}
        </div>
      )}
      {mode === "view" && onSave && (
        <IconButton label="この月のシフトを保存" onClick={onSave}>
          <Download aria-hidden="true" size={21} />
        </IconButton>
      )}
      {mode !== "view" && (
        <button className="dc-done" onClick={onDone} type="button">
          <Check aria-hidden="true" size={18} />
          完了
        </button>
      )}
    </>
  );
}

// On an empty month ポチポチ入力 is as tall as 今月のお休み, so the two
// rows line up with the other months'.
const stackedStart = css({ flex: "none", minHeight: "55px" });

function StartArea({
  label,
  onStart,
  onImport,
  stacked = false,
}: {
  label: string;
  onStart: () => void;
  onImport: () => void;
  // An empty month has no 今月のお休み, so the two buttons take both rows.
  stacked?: boolean;
}) {
  return (
    <div
      className={`dc-start-area dc-start-row ${stacked ? "dc-start-stack" : ""}`}
    >
      <Button
        className={stacked ? stackedStart : undefined}
        onClick={onStart}
        variant="primary"
      >
        <Pencil aria-hidden="true" size={18} />
        {label}
      </Button>
      {/* As wide as ポチポチ入力: only people handed a roster see these, on
          a month with days left, which is when they photograph it. */}
      <Button variant="quiet" aria-haspopup="dialog" onClick={onImport}>
        <Camera aria-hidden="true" size={18} />
        写真から取り込む
      </Button>
    </div>
  );
}

// A filled month's next step: keeping it, as a picture or in the device
// calendar. Both quiet: a filled month is mostly looked at, and saving
// is already offered loudly the moment it fills.
function SaveArea({
  onImage,
  onCalendar,
}: {
  onImage: () => void;
  onCalendar: () => void;
}) {
  return (
    <div className="dc-start-area dc-start-row">
      <Button variant="quiet" onClick={onImage}>
        <ImageIcon aria-hidden="true" size={18} />
        画像で保存
      </Button>
      <Button variant="quiet" aria-haspopup="dialog" onClick={onCalendar}>
        <CalendarPlus aria-hidden="true" size={18} />
        カレンダーに追加
      </Button>
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
    <div className="dc-repeat-editor">
      <p className="dc-repeat-label">
        並び
        <span className="dc-repeat-hint">
          {sequence.length > 0
            ? `${sequence.length}日ごとに繰り返し`
            : "下から順番に追加してください"}
        </span>
      </p>
      <ol className="dc-repeat-sequence">
        {sequence.map((shift, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- the same shift repeats, so its position is its identity.
          <li key={index}>
            <button
              aria-label={`${index + 1}日目、${patterns[shift].label}。タップで外す`}
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
      <div className="dc-repeat-palette">
        {patternKeys.map((key) => (
          <button
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

function ImportPhotoActions({ onPick }: { onPick: () => void }) {
  return (
    <div className="dc-import-actions">
      <button onClick={onPick} type="button">
        <Camera aria-hidden="true" size={22} />
        カメラで撮る
      </button>
      <button onClick={onPick} type="button">
        <ImageIcon aria-hidden="true" size={22} />
        写真を選ぶ
      </button>
    </div>
  );
}

// Taking the photo. What it reads opens on its own page to check before
// anything goes in.
function ImportSheet({
  open,
  onOpenChange,
  access,
  onRead,
  onStartPochi,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  access: DesignVariants["importAccess"];
  onRead: () => void;
  onStartPochi: () => void;
}) {
  const close = () => {
    onOpenChange(false);
  };
  const title =
    access === "limit" ? "少し時間をおいてください" : "勤務表を取り込む";
  return (
    <Sheet label={title} onOpenChange={onOpenChange} open={open}>
      <SheetHeading onClose={close} title={title} />
      {access === "limit" && (
        <>
          <p className="dc-import-description">
            短い時間にたくさん取り込んだため、いったんお休みしています。しばらくしてから、もう一度お試しください。残りは、ポチポチ入力でも入れられます。
          </p>
          <div>
            <Button
              variant="primary"
              onClick={() => {
                close();
                onStartPochi();
              }}
            >
              <Pencil aria-hidden="true" size={16} />
              ポチポチ入力で入れる
            </Button>
          </div>
        </>
      )}
      {access === "normal" && (
        <>
          <p className="dc-import-description">
            配られた勤務表を撮ると、あなたの行を読み取ってシフトを入れます。LINEで届いた画像やスクリーンショットも使えます。読み取った結果は、保存する前に確認できます。
          </p>
          <ImportPhotoActions
            onPick={() => {
              close();
              onRead();
            }}
          />
          <p className="dc-sheet-total">
            デザインの見本です。撮影の代わりに、見本の勤務表を読み取った結果を開きます。
          </p>
        </>
      )}
    </Sheet>
  );
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
  return (
    <>
      {datePicker}
      <fieldset
        aria-label="入力するシフト"
        className={`dc-patterns ${patternKeys.length > 4 ? "dc-patterns-two-rows" : ""} ${patternKeys.length === 8 ? "dc-patterns-eight" : ""}`}
      >
        {patternKeys.map((key) => (
          <button
            key={key}
            onClick={() => {
              onEnter(key);
            }}
            type="button"
          >
            <span className="dc-pattern-mark">
              <ShiftMark shift={key} size={26} />
            </span>
            <span>{patterns[key].label}</span>
          </button>
        ))}
      </fieldset>
      <div className="dc-day-actions">
        <button
          disabled={!selectedShift}
          onClick={() => {
            onEnter(undefined);
          }}
          type="button"
        >
          <Trash2 aria-hidden="true" size={14} />
          消す
        </button>
        <button disabled={!canSkip} onClick={onSkip} type="button">
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
    "&:is(button):not([data-active]):hover": { bg: "accentSoft2" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    fontSize: "11px",
    gap: "2px",
    height: "64px",
    minWidth: 0,
    paddingBlock: "5px",
    position: "relative",
  },
  variants: {
    // Picked: the day being entered or opened.
    active: {
      true: {
        outline: "2px solid token(colors.accent)",
        outlineOffset: "-2px",
      },
    },
    // A day to look at again, like one the roster reading was unsure of.
    flagged: {
      true: {
        _after: {
          bg: "#f7e7a6",
          borderRadius: "50%",
          color: "#6b5716",
          content: '"?"',
          display: "grid",
          fontSize: "9px",
          fontWeight: 700,
          height: "14px",
          placeItems: "center",
          position: "absolute",
          right: "3px",
          top: "3px",
          width: "14px",
        },
        boxShadow: "inset 0 0 0 1.5px #e3c65a",
      },
    },
    // A day off in its own pattern's tint, set as --off-tint.
    off: { true: { bg: "var(--off-tint, var(--accent-mark-tint))" } },
    outside: { true: { color: "textDisabled" } },
    today: {
      true: {
        outline: "1.5px solid token(colors.accentLine)",
        outlineOffset: "-1px",
      },
    },
  },
});

export const dayParts = {
  date: css({ flexShrink: 0, fontWeight: 600, lineHeight: "14px" }),
  dateOutside: css({ fontWeight: 400 }),
  holiday: css({ color: "holiday" }),
  label: css({
    color: "text2",
    flexShrink: 0,
    fontSize: "9px",
    lineHeight: "12px",
  }),
  mark: css({
    display: "grid",
    flexShrink: 0,
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", sans-serif',
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
      bg: "var(--note-marker)",
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
  flagged = false,
  plain = false,
  className,
}: {
  date: Date;
  entry: DayEntry | undefined;
  outside: boolean;
  editing: boolean;
  active: boolean;
  onPress: () => void;
  // Marked for a second look, like a day the roster reading was unsure of.
  flagged?: boolean;
  // Only the shift, for the saved image: no today frame, no note stroke.
  plain?: boolean;
  className?: string;
}) {
  const markStyle = useContext(ShiftMarkStyleContext);
  const shift = outside ? undefined : entry?.shift;
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
  const change = outside ? undefined : timeChangeOf(entry);
  // A note is about the day, not the shift, so the date is marked, with a
  // stroke as in a paper diary, apart from the shift's 早出 and 残業
  // corners, and only on the person's own calendar. Other time
  // changes, a later start or an earlier end, show when the day is opened.
  const noted = !(outside || plain) && Boolean(entry?.note);
  // The picked frame wins over today's.
  const cellClass = cx(
    dayCell({
      active,
      flagged,
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
  if (outside) {
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
    <fieldset className="dc-detail-row dc-detail-members">
      <legend className="dc-detail-label">一緒に働く人</legend>
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
            className="dc-member-input"
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
    <div className="dc-detail">
      <ChoiceGrid
        className="dc-detail-patterns"
        label="シフト"
        onValueChange={(key) => {
          onChange(keepDetails(entry, key));
        }}
        value={entry?.shift ?? null}
      >
        {patternKeys.map((key) => (
          <Choice key={key} value={key}>
            <ShiftMark shift={key} size={14} />
            {patterns[key].label}
          </Choice>
        ))}
      </ChoiceGrid>
      {entry ? (
        <>
          {time && (
            <div className="dc-detail-row">
              <span className="dc-detail-label">時間</span>
              <div className="dc-detail-time">
                <input
                  aria-label="開始時刻"
                  onChange={(event) => {
                    changeTime("start", event.target.value);
                  }}
                  type="time"
                  value={entry.start ?? time[0]}
                />
                <span aria-hidden="true">–</span>
                <input
                  aria-label="終了時刻"
                  onChange={(event) => {
                    changeTime("end", event.target.value);
                  }}
                  type="time"
                  value={entry.end ?? time[1]}
                />
              </div>
              <p className="dc-detail-hint">
                {timeChanged ? (
                  <>
                    {moves}
                    <button
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
                      <span className="dc-detail-mark-hint">
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
          <label className="dc-detail-row">
            <span className="dc-detail-label">メモ</span>
            <input
              className="dc-detail-note"
              onChange={(event) => {
                onChange({ ...entry, note: event.target.value || undefined });
              }}
              placeholder="メモを入力"
              value={entry.note ?? ""}
            />
          </label>
          <button
            className="dc-detail-delete"
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
        <p className="dc-detail-empty">
          シフトを選ぶと、時間やメモを入力できます。
        </p>
      )}
    </div>
  );
}

const picker = {
  card: css({
    bg: "raised",
    borderRadius: "24px",
    boxShadow: "0 16px 60px var(--shadow-strong)",
    color: "text",
    padding: "18px",
    width: "min(360px, calc(100% - 24px))",
  }),
  cell: css({
    "&[data-outside-range]": { color: "textFaint" },
    "&[data-selected]": { bg: "accentFill", color: "onAccentFill" },
    _focusVisible: { outline: "2px solid token(colors.accent)" },
    _hover: { bg: "accentSoft" },
    alignItems: "center",
    borderRadius: "12px",
    cursor: "default",
    display: "flex",
    fontSize: "13px",
    justifyContent: "center",
    minHeight: "touch",
    outline: "none",
  }),
  // The design's today, not the real one Ark marks.
  today: css({
    outline: "1.5px solid token(colors.accentLine)",
    outlineOffset: "-1px",
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
    color: "text",
    display: "grid",
    height: "touch",
    placeItems: "center",
    width: "touch",
  }),
  month: css({
    alignItems: "center",
    display: "flex",
    fontSize: "14px",
    justifyContent: "space-between",
    margin: "12px 0",
  }),
  table: css({ borderCollapse: "collapse", width: "100%" }),
  title: css({ fontSize: "17px", margin: 0 }),
  weekday: css({
    color: "text3",
    fontSize: "11px",
    fontWeight: 400,
    paddingBottom: "8px",
  }),
};

function toDateValue(date: Date) {
  return parseDate(dateKey(date));
}

// Picking one day, in a dialog over the phone like Material's date picker
// and SwiftUI's graphical DatePicker. Ark UI's DatePicker draws the month
// and moves through it by arrow keys; 今日 jumps back to today.
export function InputDatePicker({
  title = "入力する日付",
  ariaLabel,
  className = "",
  date,
  onSelect,
  children,
}: {
  title?: string;
  ariaLabel: string;
  className?: string;
  date: Date;
  onSelect: (date: Date) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const weekTools = useWeek();
  const pick = (day: Date) => {
    onSelect(day);
    setOpen(false);
  };
  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={`dc-input-date ${className}`}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        {children}
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
        <DatePicker.Root
          defaultFocusedValue={toDateValue(date)}
          inline
          locale="ja-JP"
          onValueChange={(details) => {
            const [value] = details.value;
            if (value) {
              pick(new Date(value.year, value.month - 1, value.day));
            }
          }}
          outsideDaySelectable
          startOfWeek={weekTools.weekStart}
          value={[toDateValue(date)]}
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
                          {week.map((day) => (
                            <DatePicker.TableCell
                              key={day.toString()}
                              value={day}
                            >
                              <DatePicker.TableCellTrigger
                                className={cx(
                                  picker.cell,
                                  day.toString() === dateKey(designToday) &&
                                    picker.today
                                )}
                              >
                                {day.day}
                              </DatePicker.TableCellTrigger>
                            </DatePicker.TableCell>
                          ))}
                        </DatePicker.TableRow>
                      ))}
                    </DatePicker.TableBody>
                  </DatePicker.Table>
                </>
              )}
            </DatePicker.Context>
          </DatePicker.View>
        </DatePicker.Root>
      </Sheet>
    </>
  );
}
