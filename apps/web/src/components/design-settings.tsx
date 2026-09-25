import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { type ReactNode, useContext, useState } from "react";
import {
  addDays,
  dateKey,
  formatDay,
  InputDatePicker,
  patterns,
  type RepeatRule,
  RepeatSequenceEditor,
  type Shift,
  TabBar,
  weekendClassName,
} from "./design-calendar";
import { PatternsPage } from "./design-pattern-editor";
import {
  SetShiftMarkStyleContext,
  ShiftMark,
  type ShiftMarkStyle,
  ShiftMarkStyleContext,
} from "./shift-mark";

type Page = "top" | "repeat" | "repeat-new" | "patterns" | "mark";

const markOptions: {
  style: ShiftMarkStyle;
  name: string;
  note: string;
}[] = [
  {
    style: "emoji",
    name: "絵文字",
    note: "にぎやかで楽しい。パターンごとに好きな絵文字を選べます",
  },
  {
    style: "badge",
    name: "文字",
    note: "勤務表と同じ1文字で、ぱっと読めます",
  },
  {
    style: "icon",
    name: "アイコン",
    note: "落ち着いた線のアイコンで、すっきり見えます",
  },
];

const previewDays = 14;

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
  onApplyRule,
  onTab,
}: {
  patternKeys: Shift[];
  memberCount: number;
  rules: RepeatRule[];
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
          <MarkPage onBack={() => setPage("top")} patternKeys={patternKeys} />
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

function MarkPage({
  patternKeys,
  onBack,
}: {
  patternKeys: Shift[];
  onBack: () => void;
}) {
  const current = useContext(ShiftMarkStyleContext);
  const setStyle = useContext(SetShiftMarkStyleContext);
  const sample = Array.from(
    { length: 7 },
    (_, index) => patternKeys[index % patternKeys.length]
  );
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="シフトの見た目" />
      <p className="st-note">
        カレンダーやボタンに出るシフトの印を選べます。グループの人のシフトも、ここで選んだ見た目で表示されます。
      </p>
      <div className="st-marks-options">
        {markOptions.map((option) => (
          <button
            aria-pressed={current === option.style}
            className="st-mark-option"
            key={option.style}
            onClick={() => setStyle?.(option.style)}
            type="button"
          >
            <span className="st-mark-option-head">
              <strong className="st-mark-option-name">{option.name}</strong>
              {current === option.style && (
                <Check aria-hidden="true" size={18} />
              )}
            </span>
            <span className="st-mark-sample">
              <ShiftMarkStyleContext value={option.style}>
                {sample.map((shift, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the sample repeats shifts, so position is its identity.
                  <span className="st-mark-sample-day" key={index}>
                    <ShiftMark shift={shift} size={22} />
                  </span>
                ))}
              </ShiftMarkStyleContext>
            </span>
            <small className="st-mark-option-note">{option.note}</small>
          </button>
        ))}
      </div>
    </>
  );
}
