import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Settings2,
  UsersRound,
} from "lucide-react";

const shifts = [
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
] as const;
const calendarDays = shifts.map((shift, index) => ({ day: index + 1, shift }));
const patterns = {
  after: { emoji: "🌅", name: "明け" },
  day: { emoji: "☀️", name: "日勤" },
  night: { emoji: "🌙", name: "夜勤" },
  off: { emoji: "🌿", name: "休み" },
};
const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

export function CalendarPreview() {
  return (
    <figure className="preview-figure">
      <div className="preview-stage">
        <div className="preview-note note-left">
          <span>入力は、ポチッと。</span>
          <svg
            aria-hidden="true"
            fill="none"
            height="48"
            viewBox="0 0 100 48"
            width="100"
          >
            <path
              d="M8 10c30-5 45 20 74 20m-12-9 14 9-15 7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <div
          aria-label="日勤・夜勤・明け・休みを並べた9月のカレンダー画面イメージ"
          className="phone"
          role="img"
        >
          <div className="phone-status">
            <span>9:41</span>
            <span className="camera-island" />
            <span>▮▮▮ ▰</span>
          </div>
          <div className="phone-content">
            <div className="calendar-heading">
              <div>
                <span className="calendar-year">2026</span>
                <strong>
                  9<span className="month-unit">月</span>
                </strong>
              </div>
              <div>
                <Download size={18} />
                <ChevronLeft size={18} />
                <ChevronRight size={18} />
              </div>
            </div>
            <div className="calendar-weekdays">
              {weekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="calendar-grid">
              <div className="day muted">30</div>
              <div className="day muted">31</div>
              {calendarDays.map(({ shift, day }) => (
                <div
                  className={`day ${shift} ${day === 24 ? "selected-day" : ""}`}
                  key={`september-${day}`}
                >
                  <span className="date-number">{day}</span>
                  <span className="shift-emoji">{patterns[shift].emoji}</span>
                  <span className="shift-name">{patterns[shift].name}</span>
                </div>
              ))}
              {[1, 2, 3].map((day) => (
                <div className="day muted" key={`october-${day}`}>
                  {day}
                </div>
              ))}
            </div>
            <div className="calendar-summary">
              <span>今月のお休み</span>
              <strong>
                9<span className="summary-unit">日</span>
              </strong>
            </div>
            <div className="pattern-heading">シフトを選んで、日付をタップ</div>
            <div className="pattern-picker">
              {Object.entries(patterns).map(([id, pattern]) => (
                <div
                  className={`pattern ${id === "day" ? "active-pattern" : ""}`}
                  key={id}
                >
                  <span>{pattern.emoji}</span>
                  <small>{pattern.name}</small>
                </div>
              ))}
            </div>
            <div className="phone-nav">
              <span className="active">
                <CalendarDays size={19} />
                カレンダー
              </span>
              <span>
                <UsersRound size={19} />
                グループ
              </span>
              <span>
                <Settings2 size={19} />
                設定
              </span>
            </div>
          </div>
          <div className="home-indicator" />
        </div>
        <div className="preview-note note-right">
          <span>お休みも、ひと目で。</span>
          <span className="note-spark">✳</span>
        </div>
      </div>
      <figcaption>
        画面はイメージです。勤務内容は架空のサンプルです。
      </figcaption>
    </figure>
  );
}
