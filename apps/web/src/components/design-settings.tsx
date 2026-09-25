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
  nextDayShifts,
  patterns,
  type RepeatRule,
  RepeatSequenceEditor,
  repeatSchedule,
  type Schedule,
  type Shift,
  TabBar,
  weekDates,
  weekendClassName,
} from "./design-calendar";
import { PatternsPage } from "./design-pattern-editor";
import {
  AppIcon,
  appIcons,
  ThemeContext,
  themeOf,
  themes,
} from "./design-theme";
import {
  BadgeLengthContext,
  CellNamesContext,
  IconWeightContext,
  LookSettingsContext,
  MonochromeContext,
  OffHighlightContext,
  SetIconWeightContext,
  SetShiftMarkStyleContext,
  ShiftMark,
  type ShiftMarkStyle,
  ShiftMarkStyleContext,
  type StyleChoice,
  stylePresetOf,
  stylePresets,
  useOffHighlight,
} from "./shift-mark";

type Page =
  | "top"
  | "repeat"
  | "repeat-new"
  | "patterns"
  | "mark"
  | "customize"
  | "appIcon";

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
  // What キャンセル in 細かく設定 goes back to.
  const [cancelTo, setCancelTo] = useState<StyleChoice>();
  const preview = stylePreviewOf(schedule, patternKeys);
  const current = rules.at(-1);
  return (
    <div className="dc-content st-screen">
      <div
        className={page === "customize" ? "st-scroll st-custom" : "st-scroll"}
      >
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
          <MarkPage
            onBack={() => setPage("top")}
            onCustomize={(before) => {
              setCancelTo(before);
              setPage("customize");
            }}
            preview={preview}
          />
        )}
        {page === "customize" && (
          <CustomizePage
            cancelTo={cancelTo}
            onDone={() => setPage("mark")}
            preview={preview}
          />
        )}
        {page === "appIcon" && <AppIconPage onBack={() => setPage("top")} />}
        {page === "patterns" && (
          <PatternsPage
            onBack={() => setPage("top")}
            patternKeys={patternKeys}
          />
        )}
      </div>
      {page !== "customize" && <TabBar active="settings" onSelect={onTab} />}
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
  const { theme, icon } = useContext(ThemeContext);
  const { look } = useContext(LookSettingsContext);
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
          label="スタイル"
          onOpen={() => onOpen("mark")}
          value={
            <span className="st-inline-value">
              <span
                aria-hidden="true"
                className="st-swatch"
                style={{ background: themeOf(theme).accent }}
              />
              {stylePresetOf(theme, look)?.name ?? "カスタム"}
            </span>
          }
        />
        <Row
          label="アプリアイコン"
          onOpen={() => onOpen("appIcon")}
          value={
            <span className="st-inline-value">
              <AppIcon icon={icon} size={22} theme={theme} />
              {appIcons.find((option) => option.id === icon)?.name}
            </span>
          }
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

// A titled block whose content brings its own background.
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="st-section">
      <h4>{title}</h4>
      {children}
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
  preview,
  onBack,
  onCustomize,
}: {
  preview: StylePreviewData;
  onBack: () => void;
  onCustomize: (before: StyleChoice) => void;
}) {
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="スタイル" />
      <StylePreview preview={preview} />
      <StylePresets />
      <CustomChoice onOpen={onCustomize} />
      <p className="st-note">
        グループの人のシフトも、ここで選んだ見た目で表示されます。
      </p>
    </>
  );
}

type StylePreviewData = { dates: Date[]; schedule: Schedule; sample: boolean };

// Days worth showing before the preview uses the person's own shifts.
const minPreviewDays = 7;

// This week and next. Someone who has entered little so far sees a made-up
// fortnight from their own patterns instead of blank days.
function stylePreviewOf(
  schedule: Schedule,
  patternKeys: Shift[]
): StylePreviewData {
  const dates = [
    ...weekDates(previewToday),
    ...weekDates(addDays(previewToday, 7)),
  ];
  const filled = dates.filter((date) => schedule[dateKey(date)]).length;
  if (filled >= minPreviewDays) {
    return { dates, schedule, sample: false };
  }
  return {
    dates,
    schedule: repeatSchedule(
      sampleSequence(patternKeys),
      dates[0],
      dates[0],
      dates.at(-1) ?? dates[0]
    ),
    sample: true,
  };
}

// Each working pattern with what follows it, like 明け after 夜勤, and a day
// off after every second one.
function sampleSequence(patternKeys: Shift[]): Shift[] {
  const followers = new Set(Object.values(nextDayShifts));
  const working = patternKeys.filter(
    (key) => key !== "off" && key !== "paid" && !followers.has(key)
  );
  const sequence: Shift[] = [];
  for (const [index, key] of working.entries()) {
    sequence.push(key);
    const next = nextDayShifts[key];
    if (next && patternKeys.includes(next)) {
      sequence.push(next);
    }
    if (index % 2 === 1 || next) {
      sequence.push("off");
    }
  }
  return sequence.at(-1) === "off" ? sequence : [...sequence, "off"];
}

function StylePreview({ preview }: { preview: StylePreviewData }) {
  const { dates, schedule, sample } = preview;
  return (
    <div aria-hidden="true" className="st-preview" inert>
      {sample && <span className="st-preview-sample">見本</span>}
      <div className="dc-weekdays">
        {weekdayLabels.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="dc-grid st-preview-grid">
        {dates.map((date) => (
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
  );
}

// An edit mode for the details, with the preview pinned on top. Changes show
// right away; キャンセル puts back what was there when it opened.
function CustomizePage({
  preview,
  cancelTo,
  onDone,
}: {
  preview: StylePreviewData;
  cancelTo?: StyleChoice;
  onDone: () => void;
}) {
  const { look, setLook, setCustom } = useContext(LookSettingsContext);
  const { theme, setTheme } = useContext(ThemeContext);
  const [opened] = useState({ look, theme });
  const saved = cancelTo ?? opened;
  const current = useContext(ShiftMarkStyleContext);
  const setStyle = useContext(SetShiftMarkStyleContext);
  return (
    <>
      <div className="st-custom-top">
        <header className="st-custom-bar">
          <button
            className="st-custom-cancel"
            onClick={() => {
              setTheme?.(saved.theme);
              setLook?.(saved.look);
              onDone();
            }}
            type="button"
          >
            キャンセル
          </button>
          <h3>細かく設定</h3>
          <button
            className="pe-save"
            onClick={() => {
              if (!stylePresetOf(theme, look)) {
                setCustom?.({ theme, look });
              }
              onDone();
            }}
            type="button"
          >
            完了
          </button>
        </header>
        <StylePreview preview={preview} />
      </div>
      <Group title="テーマカラー">
        <ThemeChoices />
      </Group>
      <Group title="シフトの見た目">
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
      </Group>
      <MarkOptionsList current={current} />
    </>
  );
}

// The seventh choice after the presets. It always opens 細かく設定, starting
// from the last custom style when a preset is in use.
function CustomChoice({ onOpen }: { onOpen: (before: StyleChoice) => void }) {
  const { look, setLook, custom } = useContext(LookSettingsContext);
  const { theme, setTheme } = useContext(ThemeContext);
  const isCustom = !stylePresetOf(theme, look);
  return (
    <button
      aria-pressed={isCustom}
      className="st-custom-choice"
      onClick={() => {
        if (!isCustom && custom) {
          setTheme?.(custom.theme);
          setLook?.(custom.look);
        }
        onOpen({ theme, look });
      }}
      type="button"
    >
      <span className="st-row-label">カスタム</span>
      <span className="st-row-value">細かく設定</span>
      <ChevronRight aria-hidden="true" className="st-row-arrow" size={17} />
    </button>
  );
}

const presetSample: Shift[] = ["day", "night", "after", "off"];

// Ready-made looks. Each card draws a few shifts in its own settings.
function StylePresets() {
  const { look, setLook } = useContext(LookSettingsContext);
  const themeContext = useContext(ThemeContext);
  const current = stylePresetOf(themeContext.theme, look);
  return (
    <fieldset className="st-preset-grid">
      <legend className="st-preset-legend">スタイル</legend>
      {stylePresets.map((preset) => (
        <button
          aria-pressed={current?.id === preset.id}
          key={preset.id}
          onClick={() => {
            themeContext.setTheme?.(preset.theme);
            setLook?.(preset.look);
          }}
          type="button"
        >
          <span aria-hidden="true" className="st-preset-sample">
            <ThemeContext value={{ ...themeContext, theme: preset.theme }}>
              <LookSettingsContext value={{ look: preset.look }}>
                <ShiftMarkStyleContext value={preset.look.style}>
                  <IconWeightContext
                    value={preset.look.fill ? "duotone" : "regular"}
                  >
                    <MonochromeContext
                      value={{ monochrome: preset.look.monochrome }}
                    >
                      <BadgeLengthContext
                        value={{ length: preset.look.badgeLength }}
                      >
                        {presetSample.map((shift) => (
                          <ShiftMark key={shift} shift={shift} size={18} />
                        ))}
                      </BadgeLengthContext>
                    </MonochromeContext>
                  </IconWeightContext>
                </ShiftMarkStyleContext>
              </LookSettingsContext>
            </ThemeContext>
          </span>
          {preset.name}
        </button>
      ))}
    </fieldset>
  );
}

// The switches for the look in use, as one list. The theme-color switch
// sits above the icon fill, which follows it until the person picks a fill.
function MarkOptionsList({ current }: { current: ShiftMarkStyle }) {
  const { names, setNames } = useContext(CellNamesContext);
  const iconWeight = useContext(IconWeightContext);
  const setIconWeight = useContext(SetIconWeightContext);
  const { monochrome, setMonochrome } = useContext(MonochromeContext);
  const { highlight, setHighlight } = useContext(OffHighlightContext);
  const highlightOn = useOffHighlight(current);
  const { length, setLength } = useContext(BadgeLengthContext);
  return (
    <div className="st-list">
      {current !== "badge" && (
        <SwitchRow
          checked={names[current]}
          label="シフト名を表示"
          onChange={(checked) => setNames?.({ ...names, [current]: checked })}
        />
      )}
      {current !== "emoji" && (
        <SwitchRow
          checked={monochrome}
          label="テーマカラーで統一"
          onChange={(checked) => setMonochrome?.(checked)}
        />
      )}
      {current !== "emoji" && (
        <SwitchRow
          checked={iconWeight === "duotone"}
          label="塗り"
          onChange={(checked) =>
            setIconWeight?.(checked ? "duotone" : "regular")
          }
        />
      )}
      {current === "badge" && (
        <SegmentRow
          label="文字の数"
          onChange={(value) => setLength?.(value)}
          options={[
            ["one", "1文字"],
            ["two", "2文字"],
          ]}
          value={length}
        />
      )}
      <SwitchRow
        checked={highlightOn}
        label="休みをハイライト"
        onChange={(checked) =>
          setHighlight?.({ ...highlight, [current]: checked })
        }
      />
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="st-row">
      <span className="st-row-label">{label}</span>
      <input
        aria-checked={checked}
        checked={checked}
        className="pe-toggle"
        onChange={(event) => onChange(event.target.checked)}
        role="switch"
        type="checkbox"
      />
    </label>
  );
}

function SegmentRow<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: [Value, string][];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="st-row st-segment-row">
      <legend className="st-row-label">{label}</legend>
      <div className="design-segment st-row-segment">
        {options.map(([option, optionLabel]) => (
          <button
            aria-pressed={value === option}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// The theme colors as swatches.
function ThemeChoices() {
  const { theme, setTheme } = useContext(ThemeContext);
  return (
    <fieldset className="st-theme-grid st-theme-row">
      <legend className="dc-sr-only">テーマカラー</legend>
      {themes.map((option) => (
        <button
          aria-label={option.name}
          aria-pressed={theme === option.id}
          key={option.id}
          onClick={() => setTheme?.(option.id)}
          type="button"
        >
          <span
            aria-hidden="true"
            className="st-theme-dot"
            style={{ background: option.accent }}
          />
        </button>
      ))}
    </fieldset>
  );
}

function AppIconPage({ onBack }: { onBack: () => void }) {
  const { theme, icon, setIcon } = useContext(ThemeContext);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="アプリアイコン" />
      <p className="st-note">
        ホーム画面のアイコンを選べます。色はテーマカラーに合わせて変わります。
      </p>
      <fieldset className="st-icon-grid">
        <legend className="dc-sr-only">アプリアイコン</legend>
        {appIcons.map((option) => (
          <button
            aria-pressed={icon === option.id}
            key={option.id}
            onClick={() => setIcon?.(option.id)}
            type="button"
          >
            <AppIcon icon={option.id} size={60} theme={theme} />
            {option.name}
          </button>
        ))}
      </fieldset>
    </>
  );
}
