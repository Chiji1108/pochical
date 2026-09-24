import {
  BatteryFull,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  Pencil,
  Settings2,
  Signal,
  UsersRound,
  Wifi,
  X,
} from "lucide-react";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useRef,
  useState,
} from "react";

const patterns = {
  day: { label: "日勤", emoji: "☀️" },
  night: { label: "夜勤", emoji: "🌙" },
  after: { label: "明け", emoji: "🌅" },
  off: { label: "休み", emoji: "🌿" },
  early: { label: "早番", emoji: "🌤️" },
  late: { label: "遅番", emoji: "🌇" },
  training: { label: "研修", emoji: "📚" },
  paid: { label: "有休", emoji: "🌷" },
} as const;
type Shift = keyof typeof patterns;
type Schedule = Record<string, Shift | undefined>;
const patternSets: Record<4 | 5 | 6 | 8, Shift[]> = {
  4: ["day", "night", "after", "off"],
  5: ["early", "day", "night", "after", "off"],
  6: ["early", "day", "late", "night", "after", "off"],
  8: ["early", "day", "late", "night", "after", "off", "training", "paid"],
};
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
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

export function initialDesignSchedule(
  patternCount: 4 | 5 | 6 | 8 = 4,
  month = 8
): Schedule {
  const count = new Date(2026, month + 1, 0).getDate();
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      if (patternCount === 8) {
        return [
          dateKey(new Date(2026, month, index + 1)),
          patternSets[8][index % 8],
        ];
      }
      let shift = sample[index % sample.length];
      if (shift === "day" && patternCount > 4 && index % 2 === 0) {
        shift = "early";
      } else if (shift === "day" && patternCount === 6) {
        shift = "late";
      }
      return [dateKey(new Date(2026, month, index + 1)), shift];
    })
  );
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
      const shift = schedule[dateKey(date)];
      return `${dateKey(date)},${shift ? patterns[shift].label : ""}`;
    });
  const url = URL.createObjectURL(
    new Blob([`\uFEFF日付,シフト\r\n${rows.join("\r\n")}`], {
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
}: {
  initialEditing: boolean;
  patternCount?: 4 | 5 | 6 | 8;
  initialMonth?: number;
  schedule: Schedule;
  onChange: Dispatch<SetStateAction<Schedule>>;
}) {
  const breakdownRef = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(initialEditing);
  const [selectedDay, setSelectedDay] = useState(1);
  const [month, setMonth] = useState(() => new Date(2026, initialMonth, 1));
  const patternKeys = patternSets[patternCount];
  const [announcement, setAnnouncement] = useState("");
  const dates = monthDates(month);
  const daysOff = dates.filter(
    (date) =>
      date.getMonth() === month.getMonth() && schedule[dateKey(date)] === "off"
  ).length;
  const monthDays = dates.filter(
    (date) => date.getMonth() === month.getMonth()
  );
  const counts = patternKeys.map((key) => ({
    key,
    ...patterns[key],
    count: monthDays.filter((date) => schedule[dateKey(date)] === key).length,
  }));
  const unfilled = monthDays.filter((date) => !schedule[dateKey(date)]).length;
  function enterShift(shift: Shift | undefined) {
    const date = new Date(month.getFullYear(), month.getMonth(), selectedDay);
    const lastDay = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0
    ).getDate();
    onChange((previous) => ({ ...previous, [dateKey(date)]: shift }));
    const nextDay = Math.min(selectedDay + 1, lastDay);
    setSelectedDay(nextDay);
    setAnnouncement(
      `${month.getMonth() + 1}月${selectedDay}日、${shift ? `${patterns[shift].label}を入力しました` : "シフトを削除しました"}。${selectedDay === lastDay ? "月末です。入力が終わったら完了を押してください" : `${nextDay}日を選択中`}`
    );
  }
  return (
    <div className={`dc-phone ${editing ? "dc-editing" : ""}`}>
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
          {editing ? (
            <button
              className="dc-done"
              onClick={() => setEditing(false)}
              type="button"
            >
              <Check aria-hidden="true" size={18} />
              完了
            </button>
          ) : (
            <div className="dc-month-actions">
              <button
                aria-label="この月のシフトをCSVで保存"
                onClick={() => downloadMonth(month, schedule)}
                type="button"
              >
                <Download aria-hidden="true" size={21} />
              </button>
              <button
                aria-label="前の月"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1)
                  )
                }
                type="button"
              >
                <ChevronLeft aria-hidden="true" size={21} />
              </button>
              <button
                aria-label="次の月"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1)
                  )
                }
                type="button"
              >
                <ChevronRight aria-hidden="true" size={21} />
              </button>
            </div>
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
            className="dc-grid"
          >
            {dates.map((date) => {
              const key = dateKey(date);
              const shift = schedule[key];
              const outside = date.getMonth() !== month.getMonth();
              const today = key === "2026-09-24";
              const className = `dc-day ${outside ? "dc-outside" : ""} ${shift === "off" && !outside ? "dc-off" : ""} ${today && !editing ? "dc-today" : ""} ${editing && !outside && date.getDate() === selectedDay ? "dc-active-day" : ""}`;
              const content = (
                <>
                  <span className="dc-date">{date.getDate()}</span>
                  {!outside && shift && (
                    <>
                      <span aria-hidden="true" className="dc-emoji">
                        {patterns[shift].emoji}
                      </span>
                      <span className="dc-shift-label">
                        {patterns[shift].label}
                      </span>
                    </>
                  )}
                </>
              );
              return editing && !outside ? (
                <button
                  aria-label={`${date.getMonth() + 1}月${date.getDate()}日、${shift ? patterns[shift].label : "未入力"}`}
                  aria-pressed={date.getDate() === selectedDay}
                  className={className}
                  key={key}
                  onClick={() => setSelectedDay(date.getDate())}
                  type="button"
                >
                  {content}
                </button>
              ) : (
                <div className={className} key={key}>
                  {content}
                </div>
              );
            })}
          </section>
        </div>
        {!editing && (
          <button
            aria-haspopup="dialog"
            className="dc-summary"
            onClick={(event) => {
              const dialog = breakdownRef.current;
              if (!dialog) {
                return;
              }
              const rect = event.currentTarget
                .closest(".dc-phone")
                ?.getBoundingClientRect();
              if (rect) {
                const top = Math.max(12, rect.top + 6);
                const bottom = Math.min(
                  rect.bottom - 6,
                  window.innerHeight - 12
                );
                dialog.style.left = `${rect.left + 6}px`;
                dialog.style.top = `${top}px`;
                dialog.style.width = `${rect.width - 12}px`;
                dialog.style.height = `${bottom - top}px`;
              }
              dialog.showModal();
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
        <div className="dc-controls">
          {editing ? (
            <>
              <InputDatePicker
                date={
                  new Date(month.getFullYear(), month.getMonth(), selectedDay)
                }
                onSelect={(date) => {
                  setSelectedDay(date.getDate());
                  setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                  setAnnouncement(
                    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日を選択中`
                  );
                }}
              >
                <span>{`${month.getMonth() + 1}月${selectedDay}日(${weekdays[new Date(month.getFullYear(), month.getMonth(), selectedDay).getDay()]})`}</span>
                <span className="dc-input-suffix">に入力</span>
                <ChevronDown aria-hidden="true" size={15} />
              </InputDatePicker>
              <fieldset
                aria-label="入力するシフト"
                className={`dc-patterns ${patternCount > 4 ? "dc-patterns-two-rows" : ""} ${patternCount === 8 ? "dc-patterns-eight" : ""}`}
              >
                {patternKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => enterShift(key)}
                    type="button"
                  >
                    <span aria-hidden="true">{patterns[key].emoji}</span>
                    <span>{patterns[key].label}</span>
                  </button>
                ))}
              </fieldset>
              <button
                className="dc-erase"
                onClick={() => enterShift(undefined)}
                type="button"
              >
                <Eraser aria-hidden="true" size={14} />
                この日のシフトを消す
              </button>
            </>
          ) : (
            <div className="dc-start-area">
              <button
                className="dc-start"
                onClick={() => {
                  setSelectedDay(1);
                  setEditing(true);
                }}
                type="button"
              >
                <Pencil aria-hidden="true" size={18} />
                シフトを入力
              </button>
            </div>
          )}
        </div>
        {!editing && (
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
      <span aria-live="polite" className="dc-sr-only">
        {announcement}
      </span>
      <div aria-hidden="true" className="dc-home-indicator" />
    </div>
  );
}

function InputDatePicker({
  date,
  onSelect,
  children,
}: {
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
        className="dc-input-date"
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
          <button
            aria-label="日付選択を閉じる"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
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
              className={
                day.getMonth() === viewMonth.getMonth()
                  ? ""
                  : "dc-picker-outside"
              }
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
