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
  type Dispatch,
  type ReactNode,
  type Ref,
  type SetStateAction,
  useRef,
  useState,
} from "react";
import type { DesignVariants } from "../lib/design-variants";

// Patterns without a time are all-day, so they have no time to change.
const patterns: Record<
  "day" | "night" | "after" | "off" | "early" | "late" | "training" | "paid",
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
};
type Shift = keyof typeof patterns;
type DayEntry = {
  shift: Shift;
  // Set only when the time differs from the pattern's standard time.
  start?: string;
  end?: string;
  note?: string;
  members?: string[];
};
type MemberOptions = { names: string[]; onAdd: (name: string) => void };
type Schedule = Record<string, DayEntry | undefined>;
const patternSets: Record<4 | 5 | 6 | 8, Shift[]> = {
  4: ["day", "night", "after", "off"],
  5: ["early", "day", "night", "after", "off"],
  6: ["early", "day", "late", "night", "after", "off"],
  8: ["early", "day", "late", "night", "after", "off", "training", "paid"],
};
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
const designToday = new Date(2026, 8, 24);
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

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekendClassName(date: Date) {
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
  month = 8
): Schedule {
  const count = new Date(2026, month + 1, 0).getDate();
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const key = dateKey(new Date(2026, month, index + 1));
      return [
        key,
        { shift: sampleShift(patternCount, index), ...sampleDetails[key] },
      ];
    })
  );
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

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatDay(date: Date) {
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

function monthDates(month: Date) {
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
  initialMonth = 8,
  schedule,
  onChange,
  variants,
}: {
  initialEditing: boolean;
  patternCount?: 4 | 5 | 6 | 8;
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
  const patternKeys = patternSets[patternCount];
  const [announcement, setAnnouncement] = useState("");
  const dates = monthDates(month);
  const daysOff = dates.filter(
    (date) =>
      date.getMonth() === month.getMonth() &&
      schedule[dateKey(date)]?.shift === "off"
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
  function openDetail(date: Date) {
    setDetailDate(date);
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    const dialog = detailSheetRef.current;
    if (variants.dayDetail === "sheet" && dialog && !dialog.open) {
      showOverPhone(dialog, phoneRef.current);
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
      className={`dc-phone ${editing ? "dc-editing" : ""} ${weekDetail ? "dc-week-mode" : ""}`}
      ref={phoneRef}
    >
      <div aria-hidden="true" className="dc-status">
        <span>9:41</span>
        <span className="dc-island" />
        <span className="dc-status-icons">
          <Signal size={17} strokeWidth={2.6} />
          <Wifi size={18} strokeWidth={2.5} />
          <BatteryFull size={25} strokeWidth={1.8} />
        </span>
      </div>
      <div className="dc-content">
        <div className="dc-heading">
          <h3>
            <span className="dc-year">{month.getFullYear()}</span>
            <strong>
              {month.getMonth() + 1}
              <span>月</span>
            </strong>
          </h3>
          {editing || weekDetail ? (
            <div className="dc-heading-actions">
              {weekDetail && (
                <div className="dc-month-actions">
                  <button
                    aria-label="前の週"
                    onClick={() => openDetail(addDays(detailDate, -7))}
                    type="button"
                  >
                    <ChevronLeft aria-hidden="true" size={21} />
                  </button>
                  <button
                    aria-label="次の週"
                    onClick={() => openDetail(addDays(detailDate, 7))}
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" size={21} />
                  </button>
                </div>
              )}
              <button
                className="dc-done"
                onClick={() => (editing ? setEditing(false) : closeDetail())}
                type="button"
              >
                <Check aria-hidden="true" size={18} />
                完了
              </button>
            </div>
          ) : (
            <MonthActions
              month={month}
              onDownload={() => downloadMonth(month, schedule)}
              onMonthChange={setMonth}
            />
          )}
        </div>
        <div className="dc-calendar-scroll">
          <div aria-hidden="true" className="dc-weekdays">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <section
            aria-label={`${month.getFullYear()}年${month.getMonth() + 1}月のシフト`}
            className={`dc-grid ${weekDetail ? "dc-grid-week" : ""}`}
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
        {!(editing || weekDetail || emptyMonth) && (
          <button
            aria-haspopup="dialog"
            className="dc-summary"
            onClick={() => {
              if (breakdownRef.current) {
                showOverPhone(breakdownRef.current, phoneRef.current);
              }
            }}
            type="button"
          >
            <span>今月のお休み</span>
            <strong>
              {daysOff}
              <span>日</span>
              <ChevronRight aria-hidden="true" size={17} />
            </strong>
          </button>
        )}
        {!weekDetail && (
          <div className="dc-controls">
            {editing ? (
              <ShiftInputControls
                canSkip={selectedDay < lastDay}
                datePicker={datePicker}
                onEnter={enterShift}
                onSkip={() => moveToNextDay("変更せずに進みました")}
                patternCount={patternCount}
                patternKeys={patternKeys}
                selectedShift={selectedShift}
                variants={variants}
              />
            ) : (
              <StartArea
                emptyMonth={emptyMonth}
                label={startLabels[variants.startLabel]}
                month={month}
                onImport={() => {
                  if (importSheetRef.current) {
                    showOverPhone(importSheetRef.current, phoneRef.current);
                  }
                }}
                onStart={() => {
                  setSelectedDay(1);
                  setEditing(true);
                }}
              />
            )}
          </div>
        )}
        {!(editing || weekDetail) && (
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
      <ImportSheet ref={importSheetRef} />
      <span aria-live="polite" className="dc-sr-only">
        {announcement}
      </span>
      <div aria-hidden="true" className="dc-home-indicator" />
    </div>
  );
}

function StartArea({
  emptyMonth,
  label,
  month,
  onStart,
  onImport,
}: {
  emptyMonth: boolean;
  label: string;
  month: Date;
  onStart: () => void;
  onImport: () => void;
}) {
  if (emptyMonth) {
    return (
      <div className="dc-start-area dc-start-empty">
        <p>{month.getMonth() + 1}月のシフトはまだありません</p>
        <button
          aria-haspopup="dialog"
          className="dc-start"
          onClick={onImport}
          type="button"
        >
          <Camera aria-hidden="true" size={18} />
          勤務表の写真から取り込む
        </button>
        <button className="dc-start-manual" onClick={onStart} type="button">
          <Pencil aria-hidden="true" size={14} />
          {label}
        </button>
      </div>
    );
  }
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

function ImportSheet({ ref }: { ref: Ref<HTMLDialogElement> }) {
  const close = (event: { currentTarget: HTMLElement }) =>
    event.currentTarget.closest("dialog")?.close();
  return (
    <dialog aria-label="勤務表を取り込む" className="dc-breakdown" ref={ref}>
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
          <h4>勤務表を取り込む</h4>
          <button aria-label="閉じる" onClick={close} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>
        <p className="dc-import-description">
          配られた勤務表を撮ると、あなたの行を読み取ってシフトを入れます。読み取った結果は、保存する前に確認できます。
        </p>
        <div className="dc-import-actions">
          <button type="button">
            <Camera aria-hidden="true" size={22} />
            カメラで撮る
          </button>
          <button type="button">
            <ImageIcon aria-hidden="true" size={22} />
            写真を選ぶ
          </button>
        </div>
        <p className="dc-sheet-total">
          デザインの見本です。この先の画面はまだありません。
        </p>
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
  patternCount,
  patternKeys,
  selectedShift,
  canSkip,
  variants,
  onEnter,
  onSkip,
}: {
  datePicker: ReactNode;
  patternCount: 4 | 5 | 6 | 8;
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
        className={`dc-patterns ${patternCount > 4 ? "dc-patterns-two-rows" : ""} ${patternCount === 8 ? "dc-patterns-eight" : ""}`}
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
  ariaLabel,
  className,
  date,
  onSelect,
  children,
}: {
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
        aria-label="入力する日付を選択"
        className="dc-picker-dialog"
        ref={dialogRef}
      >
        <header className="dc-picker-heading">
          <h4>入力する日付</h4>
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
