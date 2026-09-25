import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type ReactNode, useContext, useState } from "react";
import {
  addDays,
  DayCell,
  dateKey,
  formatDay,
  InputDatePicker,
  patterns,
  type RepeatRule,
  RepeatSequenceEditor,
  type Schedule,
  type Shift,
  TabBar,
  weekDates,
  weekendClassName,
} from "./design-calendar";
import { PatternsPage } from "./design-pattern-editor";
import {
  BadgeLengthContext,
  CellNamesContext,
  SetShiftMarkStyleContext,
  ShiftMark,
  type ShiftMarkStyle,
  ShiftMarkStyleContext,
} from "./shift-mark";

type Page = "top" | "repeat" | "repeat-new" | "patterns" | "mark";

const markOptions: { style: ShiftMarkStyle; name: string }[] = [
  { style: "icon", name: "アイコン" },
  { style: "emoji", name: "絵文字" },
  { style: "badge", name: "文字" },
];

const previewDays = 14;
const previewToday = new Date(2026, 8, 24);

// Shortens runs of the same shift, e.g. 日勤×2・夕勤×2.
function sequenceLabel(sequence: Shift[]) {
  const runs: { shift: Shift; count: number }[] = [];
  for (const shift of sequence) {
    const last = runs.at(-1);
    if (last?.shift === shift) {
      last.count += 1;
    } else {
      runs.push({ shift, count: 1 });
    }
  }
  return runs
    .map(
      ({ shift, count }) =>
        `${patterns[shift].label}${count > 1 ? `×${count}` : ""}`
    )
    .join("・");
}

function shortDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function DesignSettings({
  patternKeys,
  memberCount,
  rules,
  schedule,
  onApplyRule,
  onTab,
}: {
  patternKeys: Shift[];
  memberCount: number;
  rules: RepeatRule[];
  schedule: Schedule;
  onApplyRule: (rule: RepeatRule) => void;
  onTab: (tab: "calendar" | "settings") => void;
}) {
  const [page, setPage] = useState<Page>("top");
  const current = rules.at(-1);
  return (
    <div className="dc-content st-screen">
      <div className="st-scroll">
        {page === "top" && (
          <SettingsTop
            current={current}
            memberCount={memberCount}
            onOpen={setPage}
            patternKeys={patternKeys}
          />
        )}
        {page === "repeat" && current && (
          <RepeatPage
            onBack={() => setPage("top")}
            onNew={() => setPage("repeat-new")}
            rules={rules}
          />
        )}
        {page === "repeat-new" && current && (
          <NewRepeatPage
            current={current}
            onApply={(rule) => {
              onApplyRule(rule);
              setPage("repeat");
            }}
            onBack={() => setPage("repeat")}
            patternKeys={patternKeys}
          />
        )}
        {page === "mark" && (
          <MarkPage onBack={() => setPage("top")} schedule={schedule} />
        )}
        {page === "patterns" && (
          <PatternsPage
            onBack={() => setPage("top")}
            patternKeys={patternKeys}
          />
        )}
      </div>
      <TabBar active="settings" onSelect={onTab} />
    </div>
  );
}

function SettingsTop({
  current,
  patternKeys,
  memberCount,
  onOpen,
}: {
  current: RepeatRule | undefined;
  patternKeys: Shift[];
  memberCount: number;
  onOpen: (page: Page) => void;
}) {
  const markStyle = useContext(ShiftMarkStyleContext);
  return (
    <>
      <h3 className="st-title">設定</h3>
      <Section title="シフト">
        <Row
          label="働き方"
          value={current ? "決まった順番で回る" : "勤務表が配られる"}
        />
        {current && (
          <Row
            label="繰り返し"
            onOpen={() => onOpen("repeat")}
            value={`${sequenceLabel(current.sequence)}（${current.sequence.length}日ごと）`}
          />
        )}
        <Row
          label="シフトパターン"
          onOpen={() => onOpen("patterns")}
          value={
            <>
              <span className="st-marks">
                {patternKeys.map((key) => (
                  <ShiftMark key={key} shift={key} size={14} />
                ))}
              </span>
              {patternKeys.length}つ
            </>
          }
        />
        <Row label="勤務メンバー" value={`${memberCount}人`} />
      </Section>
      <Section title="表示">
        <Row
          label="シフトの見た目"
          onOpen={() => onOpen("mark")}
          value={markOptions.find((option) => option.style === markStyle)?.name}
        />
        <Row label="週の始まり" value="日曜" />
        <Row label="色をつける曜日" value="土・日" />
      </Section>
      <Section title="ほかのアプリ">
        <Row label="端末のカレンダーに追加" />
      </Section>
      <Section title="アカウント">
        <Row label="アカウント" value="つながっていません" />
      </Section>
      <Section title="データ">
        <Row danger label="すべてのデータを削除" />
      </Section>
      <p className="st-note">
        「繰り返し」「シフトパターン」「シフトの見た目」を開けます。ほかの項目はまだ見本です。
      </p>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="st-section">
      <h4>{title}</h4>
      <div className="st-list">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  danger = false,
  onOpen,
}: {
  label: string;
  value?: ReactNode;
  danger?: boolean;
  onOpen?: () => void;
}) {
  const content = (
    <>
      <span className={`st-row-label ${danger ? "st-danger" : ""}`}>
        {label}
      </span>
      {value !== undefined && <span className="st-row-value">{value}</span>}
      {onOpen && (
        <ChevronRight aria-hidden="true" className="st-row-arrow" size={17} />
      )}
    </>
  );
  if (onOpen) {
    return (
      <button className="st-row" onClick={onOpen} type="button">
        {content}
      </button>
    );
  }
  return <div className="st-row">{content}</div>;
}

function PageHeader({
  back,
  title,
  onBack,
}: {
  back: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <header className="st-page-header">
      <button className="st-back" onClick={onBack} type="button">
        <ChevronLeft aria-hidden="true" size={20} />
        {back}
      </button>
      <h3 className="st-title">{title}</h3>
    </header>
  );
}

function SequenceChips({ sequence }: { sequence: Shift[] }) {
  return (
    <ol className="st-sequence">
      {sequence.map((shift, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a sequence repeats the same shift, so position is its identity.
        <li key={index}>
          <ShiftMark shift={shift} size={13} />
          {patterns[shift].label}
        </li>
      ))}
    </ol>
  );
}

function RepeatPage({
  rules,
  onBack,
  onNew,
}: {
  rules: RepeatRule[];
  onBack: () => void;
  onNew: () => void;
}) {
  const current = rules.at(-1);
  if (!current) {
    return null;
  }
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="繰り返し" />
      <div className="st-card">
        <p className="st-card-label">
          今の繰り返し
          <span className="st-card-count">{current.sequence.length}日ごと</span>
        </p>
        <SequenceChips sequence={current.sequence} />
        <p className="st-card-meta">{formatDay(current.start)}から</p>
      </div>
      <button className="st-primary" onClick={onNew} type="button">
        新しい繰り返しにする
      </button>
      <p className="st-note">
        異動などで順番が変わるときは、切り替える日を選んで新しい繰り返しにします。それより前のシフトは、そのまま残ります。
      </p>
      {rules.length > 1 && (
        <Section title="これまで">
          {rules
            .map((rule, index) => {
              const next = rules[index + 1];
              const period = next
                ? `${shortDay(rule.start)}〜${shortDay(addDays(next.start, -1))}`
                : `${shortDay(rule.start)}〜`;
              return (
                <Row
                  key={dateKey(rule.start)}
                  label={period}
                  value={sequenceLabel(rule.sequence)}
                />
              );
            })
            .reverse()}
        </Section>
      )}
    </>
  );
}

function NewRepeatPage({
  current,
  patternKeys,
  onBack,
  onApply,
}: {
  current: RepeatRule;
  patternKeys: Shift[];
  onBack: () => void;
  onApply: (rule: RepeatRule) => void;
}) {
  const [sequence, setSequence] = useState(current.sequence);
  const [start, setStart] = useState(() => {
    const today = new Date(2026, 8, 24);
    return new Date(today.getFullYear(), today.getMonth() + 1, 1);
  });
  return (
    <>
      <PageHeader back="繰り返し" onBack={onBack} title="新しい繰り返し" />
      <div className="st-field">
        <span className="dc-repeat-label">切り替える日</span>
        <InputDatePicker
          ariaLabel={`切り替える日：${formatDay(start)}。タップで変更`}
          className="dc-input-date-filled"
          date={start}
          onSelect={setStart}
          title="切り替える日"
        >
          <span>{formatDay(start)}</span>
          <ChevronDown
            aria-hidden="true"
            className="dc-input-chevron"
            size={15}
          />
        </InputDatePicker>
      </div>
      <RepeatSequenceEditor
        onChange={setSequence}
        patternKeys={patternKeys}
        sequence={sequence}
      />
      <p className="st-note">切り替える日が、並びの1日目になります。</p>
      {sequence.length > 0 && (
        <div
          aria-label="切り替えてからの2週間"
          className="dc-repeat-preview"
          role="img"
        >
          {Array.from({ length: previewDays }, (_, index) => {
            const date = addDays(start, index);
            const shift = sequence[index % sequence.length];
            return (
              <span className="dc-repeat-day" key={dateKey(date)}>
                <small
                  className={`dc-repeat-day-number ${weekendClassName(date)}`}
                >
                  {date.getDate()}
                </small>
                <ShiftMark shift={shift} size={16} />
              </span>
            );
          })}
        </div>
      )}
      <button
        className="st-primary"
        disabled={sequence.length === 0}
        onClick={() => onApply({ sequence, start })}
        type="button"
      >
        {shortDay(start)}から切り替える
        <ArrowRight aria-hidden="true" size={16} />
      </button>
    </>
  );
}

const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

function MarkPage({
  schedule,
  onBack,
}: {
  schedule: Schedule;
  onBack: () => void;
}) {
  const current = useContext(ShiftMarkStyleContext);
  const setStyle = useContext(SetShiftMarkStyleContext);
  const { names, setNames } = useContext(CellNamesContext);
  const { length, setLength } = useContext(BadgeLengthContext);
  // This week and next, drawn with the real calendar cells.
  const preview = [
    ...weekDates(previewToday),
    ...weekDates(addDays(previewToday, 7)),
  ];
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="シフトの見た目" />
      <div aria-hidden="true" className="st-preview" inert>
        <div className="dc-weekdays">
          {weekdayLabels.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="dc-grid st-preview-grid">
          {preview.map((date) => (
            <DayCell
              active={false}
              date={date}
              editing={false}
              entry={schedule[dateKey(date)]}
              key={dateKey(date)}
              onPress={() => undefined}
              outside={false}
            />
          ))}
        </div>
      </div>
      <fieldset className="st-mark-segment">
        <legend className="dc-sr-only">シフトの見た目</legend>
        {markOptions.map((option) => (
          <button
            aria-pressed={current === option.style}
            key={option.style}
            onClick={() => setStyle?.(option.style)}
            type="button"
          >
            <ShiftMarkStyleContext value={option.style}>
              <ShiftMark shift="day" size={20} />
            </ShiftMarkStyleContext>
            {option.name}
          </button>
        ))}
      </fieldset>
      {current === "badge" && (
        <fieldset className="st-switch st-length">
          <legend className="st-switch-text">
            文字の数
            <small className="st-switch-note">名前の頭文字が入ります</small>
          </legend>
          <div className="design-segment">
            {(
              [
                ["one", "1文字"],
                ["two", "2文字"],
              ] as const
            ).map(([value, label]) => (
              <button
                aria-pressed={length === value}
                key={value}
                onClick={() => setLength?.(value)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {current !== "badge" && (
        <label className="st-switch">
          <span className="st-switch-text">シフト名を表示</span>
          <input
            aria-checked={names[current]}
            checked={names[current]}
            onChange={(event) =>
              setNames?.({ ...names, [current]: event.target.checked })
            }
            role="switch"
            type="checkbox"
          />
        </label>
      )}
      <p className="st-note">
        グループの人のシフトも、ここで選んだ見た目で表示されます。
      </p>
    </>
  );
}
