import {
  ArrowRight,
  BatteryFull,
  CalendarDays,
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
import {
  type CSSProperties,
  type Dispatch,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  type RefObject,
  type SetStateAction,
  useRef,
  useState,
} from "react";
import type { DesignVariants } from "../lib/design-variants";

// Patterns without a time are all-day, so they have no time to change.
export const patterns: Record<
  | "day"
  | "night"
  | "after"
  | "off"
  | "early"
  | "late"
  | "training"
  | "paid"
  | "duty"
  | "offDuty"
  | "evening"
  | "junya"
  | "midnight",
  { label: string; emoji: string; time?: readonly [string, string] }
> = {
  day: { label: "日勤", emoji: "☀️", time: ["09:00", "18:00"] },
  night: { label: "夜勤", emoji: "🌙", time: ["16:30", "09:30"] },
  after: { label: "明け", emoji: "🌅" },
  off: { label: "休み", emoji: "🌿" },
  early: { label: "早番", emoji: "🌤️", time: ["07:00", "16:00"] },
  late: { label: "遅番", emoji: "🌇", time: ["12:00", "21:00"] },
  training: { label: "研修", emoji: "📚", time: ["09:30", "17:30"] },
  paid: { label: "有休", emoji: "🌷" },
  duty: { label: "当番", emoji: "🚒", time: ["08:30", "08:30"] },
  offDuty: { label: "非番", emoji: "🛌" },
  evening: { label: "夕勤", emoji: "🌆", time: ["15:00", "23:00"] },
  junya: { label: "準夜", emoji: "🌜", time: ["16:30", "01:00"] },
  midnight: { label: "深夜", emoji: "🌛", time: ["00:00", "08:30"] },
};
export type Shift = keyof typeof patterns;
type DayEntry = {
  shift: Shift;
  // Set only when the time differs from the pattern's standard time.
  start?: string;
  end?: string;
  note?: string;
  members?: string[];
};
type MemberOptions = { names: string[]; onAdd: (name: string) => void };
export type Schedule = Record<string, DayEntry | undefined>;
const patternSets: Record<4 | 5 | 6 | 8, Shift[]> = {
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
const csvSpecialPattern = /[",\r\n]/;
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

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekendClassName(date: Date) {
  if (date.getDay() === 0) {
    return "dc-sunday";
  }
  if (date.getDay() === 6) {
    return "dc-saturday";
  }
  return "";
}

const startLabels: Record<DesignVariants["startLabel"], string> = {
  pochi: "ポチポチ入力",
  manual: "手で入力",
  bulk: "まとめて入力",
};
const sampleMembers = ["佐藤", "田中", "鈴木", "山本", "高橋"];
const sampleDetails: Record<string, Omit<DayEntry, "shift">> = {
  "2026-09-08": { end: "20:00", note: "棚卸し" },
  "2026-09-19": { start: "08:00", members: ["田中", "山本"] },
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
export function repeatSchedule(
  sequence: Shift[],
  anchor: Date,
  from: Date,
  to: Date
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
    schedule[dateKey(date)] = { shift: sequence[index] };
  }
  return schedule;
}

function isDayOff(shift: Shift | undefined) {
  return shift === "off" || shift === "paid";
}

function keepDetails(entry: DayEntry | undefined, shift: Shift): DayEntry {
  if (entry?.shift === shift) {
    return entry;
  }
  return { shift, note: entry?.note, members: entry?.members };
}

function weekDates(date: Date) {
  return Array.from(
    { length: 7 },
    (_, index) =>
      new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() - date.getDay() + index
      )
  );
}

export function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function formatDay(date: Date) {
  return `${date.getMonth() + 1}月${date.getDate()}日(${weekdays[date.getDay()]})`;
}

// Place a modal over the phone frame so the sheet looks like part of the app.
function showOverPhone(dialog: HTMLDialogElement, phone: HTMLElement | null) {
  const rect = phone?.getBoundingClientRect();
  if (rect) {
    const top = Math.max(12, rect.top + 6);
    const bottom = Math.min(rect.bottom - 6, window.innerHeight - 12);
    dialog.style.left = `${rect.left + 6}px`;
    dialog.style.top = `${top}px`;
    dialog.style.width = `${rect.width - 12}px`;
    dialog.style.height = `${bottom - top}px`;
  }
  dialog.showModal();
}

function formatTime(time: string) {
  return time.replace(leadingZeroPattern, "");
}

function timeRange(entry: DayEntry) {
  const time = patterns[entry.shift].time;
  if (!time) {
    return;
  }
  const start = entry.start ?? time[0];
  const end = entry.end ?? time[1];
  return `${formatTime(start)} – ${end <= start ? "翌" : ""}${formatTime(end)}`;
}

function csvField(value: string) {
  return csvSpecialPattern.test(value)
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

export function monthDates(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  return Array.from(
    { length: Math.ceil((start.getDay() + count) / 7) * 7 },
    (_, index) =>
      new Date(
        month.getFullYear(),
        month.getMonth(),
        index - start.getDay() + 1
      )
  );
}

function downloadMonth(month: Date, schedule: Schedule) {
  const rows = monthDates(month)
    .filter((date) => date.getMonth() === month.getMonth())
    .map((date) => {
      const entry = schedule[dateKey(date)];
      return [
        dateKey(date),
        entry ? patterns[entry.shift].label : "",
        entry ? (timeRange(entry) ?? "") : "",
        entry?.note ?? "",
      ]
        .map(csvField)
        .join(",");
    });
  const url = URL.createObjectURL(
    new Blob([`\uFEFF日付,シフト,時間,メモ\r\n${rows.join("\r\n")}`], {
      type: "text/csv;charset=utf-8",
    })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `pochical-${month.getFullYear()}-${month.getMonth() + 1}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DesignCalendar({
  initialEditing,
  patternCount = 4,
  patternKeys: customPatternKeys,
  hideInputBar = false,
  initialMonth = 8,
  schedule,
  onChange,
  variants,
}: {
  initialEditing: boolean;
  patternCount?: 4 | 5 | 6 | 8;
  patternKeys?: Shift[];
  // Repeating shifts fill every month, so the monthly input buttons go away.
  hideInputBar?: boolean;
  initialMonth?: number;
  schedule: Schedule;
  onChange: Dispatch<SetStateAction<Schedule>>;
  variants: DesignVariants;
}) {
  const phoneRef = useRef<HTMLDivElement>(null);
  const breakdownRef = useRef<HTMLDialogElement>(null);
  const detailSheetRef = useRef<HTMLDialogElement>(null);
  const importSheetRef = useRef<HTMLDialogElement>(null);
  const [detailDate, setDetailDate] = useState<Date>();
  const [addedMembers, setAddedMembers] = useState<string[]>([]);
  const members: MemberOptions = {
    names: [
      ...(variants.memberSample === "some" ? sampleMembers : []),
      ...addedMembers,
    ],
    onAdd: (name) => setAddedMembers((previous) => [...previous, name]),
  };
  const [editing, setEditing] = useState(initialEditing);
  const [selectedDay, setSelectedDay] = useState(1);
  const [month, setMonth] = useState(() => new Date(2026, initialMonth, 1));
  const patternKeys = customPatternKeys ?? patternSets[patternCount];
  const [announcement, setAnnouncement] = useState("");
  const dates = monthDates(month);
  const daysOff = dates.filter(
    (date) =>
      date.getMonth() === month.getMonth() &&
      isDayOff(schedule[dateKey(date)]?.shift)
  ).length;
  const monthDays = dates.filter(
    (date) => date.getMonth() === month.getMonth()
  );
  const counts = patternKeys.map((key) => ({
    key,
    ...patterns[key],
    count: monthDays.filter((date) => schedule[dateKey(date)]?.shift === key)
      .length,
  }));
  const unfilled = monthDays.filter((date) => !schedule[dateKey(date)]).length;
  const emptyMonth = unfilled === monthDays.length;
  const selectedDate = new Date(
    month.getFullYear(),
    month.getMonth(),
    selectedDay
  );
  const lastDay = monthDays.length;
  const selectedShift = schedule[dateKey(selectedDate)]?.shift;
  function moveToNextDay(result: string) {
    const nextDay = Math.min(selectedDay + 1, lastDay);
    setSelectedDay(nextDay);
    setAnnouncement(
      `${month.getMonth() + 1}月${selectedDay}日、${result}。${selectedDay === lastDay ? "月末です。入力が終わったら完了を押してください" : `${nextDay}日を選択中`}`
    );
  }
  const datePicker = (
    <InputDatePicker
      ariaLabel={`入力する日付：${month.getMonth() + 1}月${selectedDay}日(${weekdays[selectedDate.getDay()]})。タップで変更`}
      className={variants.dateChip === "filled" ? "dc-input-date-filled" : ""}
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
        <span className={`dc-input-weekday ${weekendClassName(selectedDate)}`}>
          ({weekdays[selectedDate.getDay()]})
        </span>
      </span>
      <ChevronDown aria-hidden="true" className="dc-input-chevron" size={15} />
    </InputDatePicker>
  );
  const weekDetail =
    !editing && detailDate !== undefined && variants.dayDetail === "week";
  const gridDates = weekDetail ? weekDates(detailDate) : dates;
  let headingMode: "view" | "edit" | "week" = "view";
  if (editing) {
    headingMode = "edit";
  } else if (weekDetail) {
    headingMode = "week";
  }
  function openDetail(date: Date) {
    setDetailDate(date);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    const dialog = detailSheetRef.current;
    if (variants.dayDetail === "sheet" && dialog && !dialog.open) {
      showOverPhone(dialog, phoneRef.current);
    }
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
  const swipeHandlers = useSwipe((direction) => step(direction));
  function startInput() {
    setSelectedDay(1);
    setEditing(true);
  }
  // Stands in for the photo import: fills the empty days of the month shown.
  function importSampleMonth() {
    const imported = initialDesignSchedule(
      patternCount,
      month.getMonth(),
      month.getFullYear()
    );
    onChange((previous) => ({ ...imported, ...previous }));
    return Object.keys(imported).filter((key) => !schedule[key]).length;
  }
  function openImport() {
    if (importSheetRef.current) {
      showOverPhone(importSheetRef.current, phoneRef.current);
    }
  }
  function closeDetail() {
    detailSheetRef.current?.close();
    setDetailDate(undefined);
  }
  function changeEntry(date: Date, entry: DayEntry | undefined) {
    onChange((previous) => ({ ...previous, [dateKey(date)]: entry }));
  }
  function enterShift(shift: Shift | undefined) {
    const key = dateKey(selectedDate);
    onChange((previous) => ({
      ...previous,
      [key]: shift && keepDetails(previous[key], shift),
    }));
    moveToNextDay(
      shift ? `${patterns[shift].label}を入力しました` : "シフトを消しました"
    );
  }
  return (
    <div
      className={`dc-phone ${editing ? "dc-editing" : ""} ${weekDetail ? "dc-week-mode" : ""} ${hideInputBar ? "dc-no-input" : ""}`}
      ref={phoneRef}
    >
      <PhoneStatusBar />
      <div className="dc-content">
        <div className="dc-heading">
          <h3 className="dc-heading-title">
            <span className="dc-year">{month.getFullYear()}</span>
            <strong>
              {month.getMonth() + 1}
              <span>月</span>
            </strong>
          </h3>
          <HeadingActions
            layout={variants.headerLayout}
            mode={headingMode}
            month={month}
            onDone={() => (editing ? setEditing(false) : closeDetail())}
            onDownload={() => downloadMonth(month, schedule)}
            onMonthChange={goToMonth}
            onStep={step}
          />
        </div>
        <div className="dc-calendar-scroll" {...swipeHandlers}>
          <div aria-hidden="true" className="dc-weekdays">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
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
                onPress={() =>
                  editing ? setSelectedDay(date.getDate()) : openDetail(date)
                }
                outside={!weekDetail && date.getMonth() !== month.getMonth()}
              />
            ))}
          </section>
          {emptyMonth && headingMode === "view" && (
            <EmptyMonthCard
              label={startLabels[variants.startLabel]}
              month={month}
              onImport={openImport}
              showInputHint={!hideInputBar}
            />
          )}
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
              onChange={(entry) => changeEntry(detailDate, entry)}
              patternKeys={patternKeys}
            />
          </section>
        )}
        {headingMode === "view" && !emptyMonth && (
          <MonthSummary
            daysOff={daysOff}
            month={month}
            onOpen={() => {
              if (breakdownRef.current) {
                showOverPhone(breakdownRef.current, phoneRef.current);
              }
            }}
          />
        )}
        {headingMode === "edit" && (
          <div className="dc-controls">
            <ShiftInputControls
              canSkip={selectedDay < lastDay}
              datePicker={datePicker}
              onEnter={enterShift}
              onSkip={() => moveToNextDay("変更せずに進みました")}
              patternKeys={patternKeys}
              selectedShift={selectedShift}
              variants={variants}
            />
          </div>
        )}
        {headingMode === "view" && !hideInputBar && (
          <div className="dc-controls">
            <StartArea
              label={startLabels[variants.startLabel]}
              onImport={openImport}
              onStart={startInput}
            />
          </div>
        )}
        {headingMode === "view" && (
          <div className="dc-nav">
            <span className="dc-nav-item dc-nav-active">
              <CalendarDays aria-hidden="true" size={23} />
              カレンダー
            </span>
            <span className="dc-nav-item">
              <UsersRound aria-hidden="true" size={23} />
              グループ
            </span>
            <span className="dc-nav-item">
              <Settings2 aria-hidden="true" size={23} />
              設定
            </span>
          </div>
        )}
      </div>
      <dialog
        aria-label="今月の内訳"
        className="dc-breakdown"
        ref={breakdownRef}
      >
        <button
          aria-label="内訳を閉じる"
          className="dc-sheet-scrim"
          onClick={() => breakdownRef.current?.close()}
          tabIndex={-1}
          type="button"
        />
        <section className="dc-sheet">
          <div aria-hidden="true" className="dc-sheet-handle" />
          <header className="dc-sheet-heading">
            <div>
              <p>
                {month.getFullYear()}年{month.getMonth() + 1}月
              </p>
              <h4>今月の内訳</h4>
            </div>
            <button
              aria-label="閉じる"
              onClick={() => breakdownRef.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </header>
          <dl className="dc-counts">
            {counts.map(({ key, emoji, label, count }) => (
              <div key={key}>
                <dt>
                  <span aria-hidden="true">{emoji}</span>
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
        </section>
      </dialog>
      <DetailSheet
        date={variants.dayDetail === "sheet" ? detailDate : undefined}
        entry={detailDate && schedule[dateKey(detailDate)]}
        members={members}
        onChange={(entry) => detailDate && changeEntry(detailDate, entry)}
        onClose={closeDetail}
        onClosed={() => setDetailDate(undefined)}
        onNavigate={(days) =>
          detailDate && openDetail(addDays(detailDate, days))
        }
        patternKeys={patternKeys}
        ref={detailSheetRef}
      />
      <ImportSheet
        access={variants.importAccess}
        month={month}
        onImport={importSampleMonth}
        onStartPochi={startInput}
        ref={importSheetRef}
      />
      <span aria-live="polite" className="dc-sr-only">
        {announcement}
      </span>
      <div aria-hidden="true" className="dc-home-indicator" />
    </div>
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

function MonthSummary({
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

function StepButtons({
  unit,
  onStep,
}: {
  unit: "月" | "週";
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <div className="dc-month-actions">
      <button
        aria-label={`前の${unit}`}
        onClick={() => onStep(-1)}
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={21} />
      </button>
      <button
        aria-label={`次の${unit}`}
        onClick={() => onStep(1)}
        type="button"
      >
        <ChevronRight aria-hidden="true" size={21} />
      </button>
    </div>
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

function HeadingActions({
  layout,
  mode,
  month,
  onStep,
  onMonthChange,
  onDone,
  onDownload,
}: {
  layout: DesignVariants["headerLayout"];
  mode: "view" | "edit" | "week";
  month: Date;
  onStep: (direction: 1 | -1) => void;
  onMonthChange: (month: Date) => void;
  onDone: () => void;
  onDownload: () => void;
}) {
  const unit = mode === "week" ? "週" : "月";
  if (layout === "current") {
    return mode === "view" ? (
      <MonthActions
        month={month}
        onDownload={onDownload}
        onMonthChange={onMonthChange}
      />
    ) : (
      <ModeActions onDone={onDone} onStep={onStep} unit={unit} />
    );
  }
  const showingThisMonth =
    month.getFullYear() === designToday.getFullYear() &&
    month.getMonth() === designToday.getMonth();
  return (
    <>
      <div className="dc-heading-nav">
        {layout === "title" && <StepButtons onStep={onStep} unit={unit} />}
        {mode !== "week" && !showingThisMonth && (
          <button
            aria-label="今月に戻る"
            className="dc-this-month"
            onClick={() =>
              onMonthChange(
                new Date(designToday.getFullYear(), designToday.getMonth(), 1)
              )
            }
            type="button"
          >
            今月
          </button>
        )}
      </div>
      {mode === "view" ? (
        <button
          aria-label="この月のシフトをCSVで保存"
          className="dc-heading-icon"
          onClick={onDownload}
          type="button"
        >
          <Download aria-hidden="true" size={21} />
        </button>
      ) : (
        <button className="dc-done" onClick={onDone} type="button">
          <Check aria-hidden="true" size={18} />
          完了
        </button>
      )}
    </>
  );
}

function ModeActions({
  unit,
  onStep,
  onDone,
}: {
  unit: "月" | "週";
  onStep: (direction: 1 | -1) => void;
  onDone: () => void;
}) {
  return (
    <div className="dc-heading-actions">
      <StepButtons onStep={onStep} unit={unit} />
      <button className="dc-done" onClick={onDone} type="button">
        <Check aria-hidden="true" size={18} />
        完了
      </button>
    </div>
  );
}

function StartArea({
  label,
  onStart,
  onImport,
}: {
  label: string;
  onStart: () => void;
  onImport: () => void;
}) {
  return (
    <div className="dc-start-area dc-start-row">
      <button className="dc-start" onClick={onStart} type="button">
        <Pencil aria-hidden="true" size={18} />
        {label}
      </button>
      <button
        aria-haspopup="dialog"
        aria-label="勤務表の写真から取り込む"
        className="dc-start-import"
        onClick={onImport}
        type="button"
      >
        <Camera aria-hidden="true" size={21} />
      </button>
    </div>
  );
}

// Shown over the empty calendar so the buttons below never change place.
function EmptyMonthCard({
  month,
  label,
  onImport,
  showInputHint,
}: {
  month: Date;
  label: string;
  onImport: () => void;
  showInputHint: boolean;
}) {
  return (
    <div className="dc-empty-card">
      <p>{month.getMonth() + 1}月のシフトはまだありません</p>
      <p className="dc-empty-hint">勤務表を撮るだけで、1か月分が入ります</p>
      <button
        aria-haspopup="dialog"
        className="dc-empty-import"
        onClick={onImport}
        type="button"
      >
        <Camera aria-hidden="true" size={17} />
        勤務表の写真から取り込む
      </button>
      {showInputHint && (
        <p className="dc-empty-alt">手で入れるなら、下の「{label}」から</p>
      )}
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
          // biome-ignore lint/suspicious/noArrayIndexKey: the same shift repeats, so its position is its identity.
          <li key={index}>
            <button
              aria-label={`${index + 1}日目、${patterns[shift].label}。タップで外す`}
              onClick={() =>
                onChange(sequence.filter((_, position) => position !== index))
              }
              type="button"
            >
              <small>{index + 1}</small>
              <span aria-hidden="true">{patterns[shift].emoji}</span>
              {patterns[shift].label}
            </button>
          </li>
        ))}
      </ol>
      <div className="dc-repeat-palette">
        {patternKeys.map((key) => (
          <button
            key={key}
            onClick={() => onChange([...sequence, key])}
            type="button"
          >
            <Plus aria-hidden="true" size={11} />
            {patterns[key].emoji} {patterns[key].label}
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

// Right after an import is the moment people feel their data is worth
// keeping, so that is where linking an account is suggested.
function ImportDone({
  month,
  days,
  onClose,
}: {
  month: Date;
  days: number;
  onClose: () => void;
}) {
  return (
    <>
      <p className="dc-import-description">
        {month.getMonth() + 1}月のシフトを{days}
        日分入れました。違うところは、日付をタップして直せます。
      </p>
      <div className="dc-import-link">
        <p>
          <strong>機種変更しても消えないように</strong>
          アカウントをつないでおくと、シフトを引き継げます。
        </p>
        <div className="dc-import-accounts">
          <button type="button">Appleで続ける</button>
          <button type="button">Googleで続ける</button>
        </div>
      </div>
      <button className="dc-import-later" onClick={onClose} type="button">
        あとで
      </button>
    </>
  );
}

function ImportSheet({
  ref,
  access,
  month,
  onImport,
  onStartPochi,
}: {
  ref: RefObject<HTMLDialogElement | null>;
  access: DesignVariants["importAccess"];
  month: Date;
  onImport: () => number;
  onStartPochi: () => void;
}) {
  const [importedDays, setImportedDays] = useState<number>();
  const close = () => ref.current?.close();
  let title = "勤務表を取り込む";
  if (importedDays !== undefined) {
    title = "取り込みました";
  } else if (access === "limit") {
    title = "少し時間をおいてください";
  }
  return (
    <dialog
      aria-label={title}
      className="dc-breakdown"
      onClose={() => setImportedDays(undefined)}
      ref={ref}
    >
      <button
        aria-label="取り込みを閉じる"
        className="dc-sheet-scrim"
        onClick={close}
        tabIndex={-1}
        type="button"
      />
      <section className="dc-sheet">
        <div aria-hidden="true" className="dc-sheet-handle" />
        <header className="dc-sheet-heading">
          <h4>{title}</h4>
          <button aria-label="閉じる" onClick={close} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        {importedDays !== undefined && (
          <ImportDone days={importedDays} month={month} onClose={close} />
        )}
        {importedDays === undefined && access === "limit" && (
          <>
            <p className="dc-import-description">
              短い時間にたくさん取り込んだため、いったんお休みしています。しばらくしてから、もう一度お試しください。残りは、ポチポチ入力でも入れられます。
            </p>
            <div>
              <button
                className="dc-import-primary"
                onClick={() => {
                  close();
                  onStartPochi();
                }}
                type="button"
              >
                <Pencil aria-hidden="true" size={16} />
                ポチポチ入力で入れる
              </button>
            </div>
          </>
        )}
        {importedDays === undefined && access === "normal" && (
          <>
            <p className="dc-import-description">
              配られた勤務表を撮ると、あなたの行を読み取ってシフトを入れます。LINEで届いた画像やスクリーンショットも使えます。読み取った結果は、保存する前に確認できます。
            </p>
            <ImportPhotoActions onPick={() => setImportedDays(onImport())} />
            <p className="dc-sheet-total">
              デザインの見本です。撮影と確認の代わりに、サンプルのシフトが入ります。
            </p>
          </>
        )}
      </section>
    </dialog>
  );
}

function MonthActions({
  month,
  onMonthChange,
  onDownload,
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  onDownload: () => void;
}) {
  const showingTodayMonth =
    month.getFullYear() === designToday.getFullYear() &&
    month.getMonth() === designToday.getMonth();
  return (
    <div className="dc-month-actions">
      <button
        aria-label="この月のシフトをCSVで保存"
        onClick={onDownload}
        type="button"
      >
        <Download aria-hidden="true" size={21} />
      </button>
      <button
        aria-label="前の月"
        onClick={() =>
          onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
        }
        type="button"
      >
        <ChevronLeft aria-hidden="true" size={21} />
      </button>
      <button
        aria-label="今月に戻る"
        className="dc-today-button"
        disabled={showingTodayMonth}
        onClick={() =>
          onMonthChange(
            new Date(designToday.getFullYear(), designToday.getMonth(), 1)
          )
        }
        type="button"
      >
        今月
      </button>
      <button
        aria-label="次の月"
        onClick={() =>
          onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))
        }
        type="button"
      >
        <ChevronRight aria-hidden="true" size={21} />
      </button>
    </div>
  );
}

function ShiftInputControls({
  datePicker,
  patternKeys,
  selectedShift,
  canSkip,
  variants,
  onEnter,
  onSkip,
}: {
  datePicker: ReactNode;
  patternKeys: Shift[];
  selectedShift: Shift | undefined;
  canSkip: boolean;
  variants: DesignVariants;
  onEnter: (shift: Shift | undefined) => void;
  onSkip: () => void;
}) {
  return (
    <>
      {variants.inputLabel === "suffix" ? (
        <div className="dc-input-row">
          {datePicker}
          <span className="dc-input-suffix">に入力</span>
        </div>
      ) : (
        datePicker
      )}
      <fieldset
        aria-label="入力するシフト"
        className={`dc-patterns ${patternKeys.length > 4 ? "dc-patterns-two-rows" : ""} ${patternKeys.length === 8 ? "dc-patterns-eight" : ""}`}
      >
        {patternKeys.map((key) => (
          <button key={key} onClick={() => onEnter(key)} type="button">
            <span aria-hidden="true">{patterns[key].emoji}</span>
            <span>{patterns[key].label}</span>
          </button>
        ))}
      </fieldset>
      {variants.dayActions === "toggle" ? (
        <div className="dc-day-actions">
          <button
            onClick={() => (selectedShift ? onEnter(undefined) : onSkip())}
            type="button"
          >
            {selectedShift ? (
              <>
                <Trash2 aria-hidden="true" size={14} />
                削除
              </>
            ) : (
              <>
                翌日
                <ArrowRight aria-hidden="true" size={14} />
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="dc-day-actions">
          <button
            disabled={!selectedShift}
            onClick={() => onEnter(undefined)}
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
      )}
    </>
  );
}

function DetailSheet({
  ref,
  date,
  entry,
  patternKeys,
  members,
  onChange,
  onNavigate,
  onClose,
  onClosed,
}: {
  ref: Ref<HTMLDialogElement>;
  date: Date | undefined;
  entry: DayEntry | undefined;
  patternKeys: Shift[];
  members: MemberOptions;
  onChange: (entry: DayEntry | undefined) => void;
  onNavigate: (days: number) => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  return (
    <dialog
      aria-label="日付の詳細"
      className="dc-breakdown"
      onClose={onClosed}
      ref={ref}
    >
      <button
        aria-label="詳細を閉じる"
        className="dc-sheet-scrim"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      {date && (
        <section className="dc-sheet dc-detail-sheet">
          <div aria-hidden="true" className="dc-sheet-handle" />
          <header className="dc-sheet-heading">
            <div className="dc-detail-day-nav">
              <button
                aria-label="前の日"
                onClick={() => onNavigate(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={20} />
              </button>
              <h4>{formatDay(date)}</h4>
              <button
                aria-label="次の日"
                onClick={() => onNavigate(1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" size={20} />
              </button>
            </div>
            <button aria-label="閉じる" onClick={onClose} type="button">
              <X aria-hidden="true" size={20} />
            </button>
          </header>
          <DayDetail
            entry={entry}
            members={members}
            onChange={onChange}
            patternKeys={patternKeys}
          />
        </section>
      )}
    </dialog>
  );
}

function DayCell({
  date,
  entry,
  outside,
  editing,
  active,
  onPress,
}: {
  date: Date;
  entry: DayEntry | undefined;
  outside: boolean;
  editing: boolean;
  active: boolean;
  onPress: () => void;
}) {
  const shift = outside ? undefined : entry?.shift;
  const today = dateKey(date) === dateKey(designToday);
  const timeChanged = Boolean(entry?.start || entry?.end);
  const hasMark = !outside && (timeChanged || Boolean(entry?.note));
  const className = `dc-day ${outside ? "dc-outside" : ""} ${shift === "off" ? "dc-off" : ""} ${today && !editing ? "dc-today" : ""} ${active ? "dc-active-day" : ""}`;
  const content = (
    <>
      <span className="dc-date">{date.getDate()}</span>
      {hasMark && (
        <span
          aria-hidden="true"
          className={`dc-mark ${timeChanged ? "dc-mark-time" : ""}`}
        />
      )}
      {shift && (
        <>
          <span aria-hidden="true" className="dc-emoji">
            {patterns[shift].emoji}
          </span>
          <span className="dc-shift-label">{patterns[shift].label}</span>
        </>
      )}
    </>
  );
  if (outside) {
    return <div className={className}>{content}</div>;
  }
  const details = [
    shift ? patterns[shift].label : "未入力",
    timeChanged && entry ? `時間変更 ${timeRange(entry)}` : "",
    entry?.note ? "メモあり" : "",
  ].filter(Boolean);
  return (
    <button
      aria-haspopup={editing ? undefined : "dialog"}
      aria-label={`${date.getMonth() + 1}月${date.getDate()}日、${details.join("、")}`}
      aria-pressed={editing ? active : undefined}
      className={className}
      onClick={onPress}
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
      <legend className="dc-detail-label">メンバー</legend>
      <div className="dc-member-chips">
        {members.names.map((name) => (
          <button
            aria-pressed={selected.includes(name)}
            key={name}
            onClick={() =>
              onChange(
                selected.includes(name)
                  ? selected.filter((member) => member !== name)
                  : [...selected, name]
              )
            }
            type="button"
          >
            {selected.includes(name) && <Check aria-hidden="true" size={12} />}
            {name}
          </button>
        ))}
        {adding ? (
          <input
            aria-label="追加するメンバーの名前"
            autoFocus
            className="dc-member-input"
            onBlur={(event) => add(event.currentTarget.value)}
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
          <button
            className="dc-member-add"
            onClick={() => setAdding(true)}
            type="button"
          >
            <Plus aria-hidden="true" size={12} />
            {members.names.length > 0 ? "追加" : "メンバーを追加"}
          </button>
        )}
      </div>
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
      <fieldset aria-label="シフト" className="dc-detail-patterns">
        {patternKeys.map((key) => (
          <button
            aria-pressed={entry?.shift === key}
            key={key}
            onClick={() => onChange(keepDetails(entry, key))}
            type="button"
          >
            <span aria-hidden="true">{patterns[key].emoji}</span>
            {patterns[key].label}
          </button>
        ))}
      </fieldset>
      {entry ? (
        <>
          {time && (
            <div className="dc-detail-row">
              <span className="dc-detail-label">時間</span>
              <div className="dc-detail-time">
                <input
                  aria-label="開始時刻"
                  onChange={(event) => changeTime("start", event.target.value)}
                  type="time"
                  value={entry.start ?? time[0]}
                />
                <span aria-hidden="true">–</span>
                <input
                  aria-label="終了時刻"
                  onChange={(event) => changeTime("end", event.target.value)}
                  type="time"
                  value={entry.end ?? time[1]}
                />
              </div>
              <p className="dc-detail-hint">
                {timeChanged ? (
                  <>
                    変更済み
                    <button
                      onClick={() =>
                        onChange({ ...entry, start: undefined, end: undefined })
                      }
                      type="button"
                    >
                      標準（{timeRange({ shift: entry.shift })}）に戻す
                    </button>
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
              onChange={(selected) =>
                onChange({
                  ...entry,
                  members: selected.length > 0 ? selected : undefined,
                })
              }
              selected={entry.members ?? []}
            />
          )}
          <label className="dc-detail-row">
            <span className="dc-detail-label">メモ</span>
            <input
              className="dc-detail-note"
              onChange={(event) =>
                onChange({ ...entry, note: event.target.value || undefined })
              }
              placeholder="メモを入力"
              value={entry.note ?? ""}
            />
          </label>
          <button
            className="dc-detail-delete"
            onClick={() => onChange(undefined)}
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

function InputDatePicker({
  title = "入力する日付",
  ariaLabel,
  className,
  date,
  onSelect,
  children,
}: {
  title?: string;
  ariaLabel: string;
  className: string;
  date: Date;
  onSelect: (date: Date) => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [viewMonth, setViewMonth] = useState(date);
  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className={`dc-input-date ${className}`}
        onClick={() => {
          setViewMonth(date);
          dialogRef.current?.showModal();
        }}
        type="button"
      >
        {children}
      </button>
      <dialog
        aria-label={`${title}を選択`}
        className="dc-picker-dialog"
        ref={dialogRef}
      >
        <header className="dc-picker-heading">
          <h4>{title}</h4>
          <div className="dc-picker-heading-actions">
            <button
              aria-label="今日を選ぶ"
              className="dc-today-button"
              onClick={() => {
                onSelect(designToday);
                dialogRef.current?.close();
              }}
              type="button"
            >
              今日
            </button>
            <button
              aria-label="日付選択を閉じる"
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>
        </header>
        <div className="dc-picker-month">
          <button
            aria-label="前の月"
            onClick={() =>
              setViewMonth(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
              )
            }
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <strong aria-live="polite">
            {viewMonth.getFullYear()}年{viewMonth.getMonth() + 1}月
          </strong>
          <button
            aria-label="次の月"
            onClick={() =>
              setViewMonth(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
              )
            }
            type="button"
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>
        <div className="dc-picker-days">
          {weekdays.map((day) => (
            <span aria-hidden="true" key={day}>
              {day}
            </span>
          ))}
          {monthDates(viewMonth).map((day) => (
            <button
              aria-label={`${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日`}
              aria-pressed={dateKey(day) === dateKey(date)}
              className={`${day.getMonth() === viewMonth.getMonth() ? "" : "dc-picker-outside"} ${dateKey(day) === dateKey(designToday) ? "dc-picker-today" : ""}`}
              key={dateKey(day)}
              onClick={() => {
                onSelect(day);
                dialogRef.current?.close();
              }}
              type="button"
            >
              {day.getDate()}
            </button>
          ))}
        </div>
      </dialog>
    </>
  );
}
