import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useContext, useState } from "react";
import type { ReactNode } from "react";

import type { Tone } from "../lib/design-tokens";
import {
  addDays,
  DayCell,
  dateKey,
  defaultHolidaysOff,
  formatDay,
  InputDatePicker,
  isRepeating,
  nextDayShifts,
  patterns,
  RepeatSequenceEditor,
  repeatSchedule,
  TabBar,
  weekDates,
  weekendClassName,
} from "./design-calendar";
import type { RepeatRule, Schedule, Shift, Tab } from "./design-calendar";
import { CoworkersPage } from "./design-coworkers";
import type { Coworkers } from "./design-coworkers";
import { PhotoAvatar, PhotoEditor } from "./design-group";
import type { Profile } from "./design-group";
import { WorkSetupSteps } from "./design-onboarding";
import { PatternsPage } from "./design-pattern-editor";
import {
  AppearanceContext,
  ColorSchemeContext,
  SetToneContext,
  ThemeContext,
  ToneContext,
  themeColors,
  themeOf,
  themes,
} from "./design-theme";
import type { Appearance } from "./design-theme";
import {
  CellNamesContext,
  IconWeightContext,
  LookSettingsContext,
  MonochromeContext,
  OffHighlightContext,
  SetIconWeightContext,
  SetShiftMarkStyleContext,
  ShiftMark,
  ShiftMarkStyleContext,
  stylePresetOf,
  stylePresets,
  useOffHighlight,
} from "./shift-mark";
import type { ShiftMarkStyle, StyleChoice } from "./shift-mark";

type Page =
  | "top"
  | "repeat-new"
  | "repeat-fix"
  | "job"
  | "work"
  | "roster"
  | "patterns"
  | "coworkers"
  | "mark"
  | "customize"
  | "appearance"
  | "profile";

const markOptions: { style: ShiftMarkStyle; name: string }[] = [
  { name: "アイコン", style: "icon" },
  { name: "絵文字", style: "emoji" },
  { name: "文字", style: "badge" },
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
      runs.push({ count: 1, shift });
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
  coworkers,
  rules,
  schedule,
  profile,
  onProfile,
  onApplyRule,
  onFixRule,
  onChangeJob,
  onHolidaysOff,
  onTab,
}: {
  patternKeys: Shift[];
  coworkers: Coworkers;
  rules: RepeatRule[];
  schedule: Schedule;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  onApplyRule: (rule: RepeatRule) => void;
  onFixRule: (rule: RepeatRule) => void;
  onChangeJob: (job: { patternKeys: Shift[]; rule: RepeatRule }) => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
  onTab: (tab: Tab) => void;
}) {
  const [page, setPage] = useState<Page>("top");
  // What キャンセル in 細かく設定 goes back to.
  const [cancelTo, setCancelTo] = useState<StyleChoice>();
  const preview = stylePreviewOf(schedule, patternKeys);
  const repeating = isRepeating(rules);
  const current = repeating ? rules.at(-1) : undefined;
  // The order to start from when repeating again.
  const lastSequence =
    [...rules].reverse().find((rule) => rule.sequence.length > 0)?.sequence ??
    [];
  return (
    <div className="dc-content st-screen">
      <div
        className={page === "customize" ? "st-scroll st-custom" : "st-scroll"}
      >
        {page === "top" && (
          <SettingsTop
            coworkerCount={coworkers.names.length}
            current={current}
            onOpen={setPage}
            patternKeys={patternKeys}
            profile={profile}
          />
        )}
        {page === "profile" && (
          <ProfilePage
            onBack={() => {
              setPage("top");
            }}
            onChange={onProfile}
            profile={profile}
          />
        )}
        {page === "repeat-new" && (
          <RepeatEditorPage
            initialSequence={lastSequence}
            mode={current ? "switch" : "first"}
            onApply={(rule) => {
              onApplyRule(rule);
              setPage(current ? "work" : "top");
            }}
            onBack={() => {
              setPage("work");
            }}
            patternKeys={patternKeys}
          />
        )}
        {page === "repeat-fix" && current && (
          <RepeatEditorPage
            current={current}
            initialSequence={current.sequence}
            mode="fix"
            onApply={(rule) => {
              onFixRule(rule);
              setPage("work");
            }}
            onBack={() => {
              setPage("work");
            }}
            patternKeys={patternKeys}
          />
        )}
        {page === "job" && (
          <JobChangePage
            onApply={(job) => {
              onChangeJob(job);
              setPage("top");
            }}
            onBack={() => {
              setPage("top");
            }}
          />
        )}
        {page === "work" && (
          <WorkStylePage
            onBack={() => {
              setPage("top");
            }}
            onFix={() => {
              setPage("repeat-fix");
            }}
            onHolidaysOff={onHolidaysOff}
            onNew={() => {
              setPage("repeat-new");
            }}
            onRepeat={() => {
              setPage("repeat-new");
            }}
            onRoster={() => {
              setPage("roster");
            }}
            rules={rules}
          />
        )}
        {page === "roster" && (
          <RosterSwitchPage
            onApply={(start) => {
              onApplyRule({ sequence: [], start });
              setPage("top");
            }}
            onBack={() => {
              setPage("work");
            }}
          />
        )}
        {page === "mark" && (
          <MarkPage
            onBack={() => {
              setPage("top");
            }}
            onCustomize={(before) => {
              setCancelTo(before);
              setPage("customize");
            }}
            preview={preview}
          />
        )}
        {page === "appearance" && (
          <AppearancePage
            onBack={() => {
              setPage("top");
            }}
          />
        )}
        {page === "customize" && (
          <CustomizePage
            cancelTo={cancelTo}
            onDone={() => {
              setPage("mark");
            }}
            preview={preview}
          />
        )}
        {page === "coworkers" && (
          <CoworkersPage
            coworkers={coworkers}
            onBack={() => {
              setPage("top");
            }}
            schedule={schedule}
          />
        )}
        {page === "patterns" && (
          <PatternsPage
            onBack={() => {
              setPage("top");
            }}
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
  coworkerCount,
  profile,
  onOpen,
}: {
  current: RepeatRule | undefined;
  patternKeys: Shift[];
  coworkerCount: number;
  profile: Profile;
  onOpen: (page: Page) => void;
}) {
  const { theme } = useContext(ThemeContext);
  const { look } = useContext(LookSettingsContext);
  const tone = useContext(ToneContext);
  return (
    <>
      <h3 className="st-title">設定</h3>
      <Section title="シフト">
        <Row
          label="働き方"
          onOpen={() => {
            onOpen("work");
          }}
          value={
            current
              ? `${sequenceLabel(current.sequence)}（${current.sequence.length}日ごと）`
              : "勤務表が配られる"
          }
        />
        <Row
          label="シフトパターン"
          onOpen={() => {
            onOpen("patterns");
          }}
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
        <Row
          label="一緒に働く人"
          onOpen={() => {
            onOpen("coworkers");
          }}
          value={`${coworkerCount}人`}
        />
        <Row
          label="仕事が変わったとき"
          onOpen={() => {
            onOpen("job");
          }}
        />
      </Section>
      <Section title="表示">
        <Row
          label="スタイル"
          onOpen={() => {
            onOpen("mark");
          }}
          value={
            <span className="st-inline-value">
              <span
                aria-hidden="true"
                className="st-swatch"
                style={{ background: "var(--accent)" }}
              />
              {stylePresetOf({ look, theme })?.name ?? "カスタム"}
              {tone === "deep" ? "" : `・${toneName(tone)}`}
            </span>
          }
        />
        <AppearanceRow
          onOpen={() => {
            onOpen("appearance");
          }}
        />
        <Row label="週の始まり" value="日曜" />
        <Row label="色をつける曜日" value="土・日" />
      </Section>
      <Section title="アカウント">
        <Row
          label="プロフィール"
          onOpen={() => {
            onOpen("profile");
          }}
          value={
            <span className="st-inline-value">
              <PhotoAvatar
                name={profile.name}
                photo={profile.photo}
                size={22}
              />
              {profile.name}
            </span>
          }
        />
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
      {(value !== undefined || onOpen) && (
        <span className="st-row-value">{value}</span>
      )}
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
        // oxlint-disable-next-line react/no-array-index-key -- a sequence repeats the same shift, so position is its identity.
        <li key={index}>
          <ShiftMark shift={shift} size={13} />
          {patterns[shift].label}
        </li>
      ))}
    </ol>
  );
}

// The order in use and what can change about it, under the work style.
function RepeatDetails({
  current,
  onNew,
  onFix,
  onHolidaysOff,
}: {
  current: RepeatRule;
  onNew: () => void;
  onFix: () => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
}) {
  return (
    <>
      <div className="st-card">
        <p className="st-card-label">
          今の繰り返し
          <span className="st-card-count">{current.sequence.length}日ごと</span>
        </p>
        <SequenceChips sequence={current.sequence} />
        <p className="st-card-meta">{formatDay(current.start)}から</p>
      </div>
      <div className="st-list">
        <SwitchRow
          checked={current.holidaysOff ?? false}
          label="祝日は休みにする"
          onChange={onHolidaysOff}
        />
      </div>
      <button className="st-primary" onClick={onNew} type="button">
        新しい繰り返しにする
      </button>
      <button className="st-link" onClick={onFix} type="button">
        今の繰り返しを直す
      </button>
      <p className="st-note">
        異動などで順番が変わるときは、切り替える日を選んで新しい繰り返しにします。それより前のシフトは、そのまま残ります。
      </p>
    </>
  );
}

function RuleHistory({ rules }: { rules: RepeatRule[] }) {
  return (
    <>
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
                  value={
                    rule.sequence.length > 0
                      ? sequenceLabel(rule.sequence)
                      : "勤務表"
                  }
                />
              );
            })
            .reverse()}
        </Section>
      )}
    </>
  );
}

type RepeatMode = "first" | "switch" | "fix";

const repeatModes: Record<
  RepeatMode,
  { title: string; back: string; dayLabel: string; action: string }
> = {
  first: {
    action: "から繰り返す",
    back: "働き方",
    dayLabel: "始める日",
    title: "繰り返しを設定",
  },
  fix: {
    action: "から入れ直す",
    back: "働き方",
    dayLabel: "並びの1日目",
    title: "今の繰り返しを直す",
  },
  switch: {
    action: "から切り替える",
    back: "働き方",
    dayLabel: "切り替える日",
    title: "新しい繰り返し",
  },
};

// Sets an order from a day. Fixing keeps the rule's start and moves only
// the day the order begins on, so no gap opens before it.
function RepeatEditorPage({
  mode,
  current,
  initialSequence,
  patternKeys,
  onBack,
  onApply,
}: {
  mode: RepeatMode;
  current?: RepeatRule;
  initialSequence: Shift[];
  patternKeys: Shift[];
  onBack: () => void;
  onApply: (rule: RepeatRule) => void;
}) {
  const fixing = mode === "fix" && current !== undefined;
  const text = repeatModes[mode];
  const [sequence, setSequence] = useState(initialSequence);
  const [day, setDay] = useState(() =>
    fixing ? (current.anchor ?? current.start) : nextMonthStart()
  );
  const start = fixing ? current.start : day;
  // Follows the order until the person sets it.
  const [holidaysChoice, setHolidaysChoice] = useState(
    fixing ? current.holidaysOff : undefined
  );
  const holidaysOff = holidaysChoice ?? defaultHolidaysOff(sequence, day);
  const rule: RepeatRule = { anchor: day, holidaysOff, sequence, start };
  return (
    <>
      <PageHeader back={text.back} onBack={onBack} title={text.title} />
      <div className="st-field">
        <span className="dc-repeat-label">{text.dayLabel}</span>
        <InputDatePicker
          ariaLabel={`${text.dayLabel}：${formatDay(day)}。タップで変更`}
          className="dc-input-date-filled"
          date={day}
          onSelect={setDay}
          title={text.dayLabel}
        >
          <span>{formatDay(day)}</span>
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
      <p className="st-note">
        {fixing
          ? "並びの1つ目のシフトが入る日を選びます。"
          : `${text.dayLabel}が、並びの1日目になります。`}
      </p>
      <div className="st-list">
        <SwitchRow
          checked={holidaysOff}
          label="祝日は休みにする"
          onChange={setHolidaysChoice}
        />
      </div>
      {sequence.length > 0 && <RepeatPreview rule={rule} />}
      {fixing && (
        <p className="st-note">
          {formatDay(start)}
          からのシフトを入れ直します。その間に自分で直した日も、並びのとおりに戻ります。
        </p>
      )}
      <button
        className="st-primary"
        disabled={sequence.length === 0}
        onClick={() => {
          onApply(rule);
        }}
        type="button"
      >
        {shortDay(start)}
        {text.action}
        <ArrowRight aria-hidden="true" size={16} />
      </button>
    </>
  );
}

// The first two weeks of a rule, from its start.
function RepeatPreview({ rule }: { rule: RepeatRule }) {
  const { sequence, start, holidaysOff } = rule;
  const planned = repeatSchedule(
    sequence,
    rule.anchor ?? start,
    start,
    addDays(start, previewDays - 1),
    holidaysOff
  );
  return (
    <div aria-label="はじめの2週間" className="dc-repeat-preview" role="img">
      {Array.from({ length: previewDays }, (_, index) => {
        const date = addDays(start, index);
        const shift = planned[dateKey(date)]?.shift;
        return (
          <span className="dc-repeat-day" key={dateKey(date)}>
            <small className={`dc-repeat-day-number ${weekendClassName(date)}`}>
              {date.getDate()}
            </small>
            {shift && <ShiftMark shift={shift} size={16} />}
          </span>
        );
      })}
    </div>
  );
}

// Changing jobs: the day it happens, then the same questions as onboarding.
// Shifts before that day stay; everything after follows the new job.
function JobChangePage({
  onBack,
  onApply,
}: {
  onBack: () => void;
  onApply: (job: { patternKeys: Shift[]; rule: RepeatRule }) => void;
}) {
  const [start, setStart] = useState(nextMonthStart);
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <div className="st-job">
        <WorkSetupSteps
          finishLabel={`${shortDay(start)}から切り替える`}
          month={start}
          onExit={() => {
            setAsking(false);
          }}
          onFinish={({ patternKeys, sequence, anchor }) => {
            onApply({
              patternKeys,
              rule: {
                anchor,
                sequence: sequence ?? [],
                start,
              },
            });
          }}
        />
      </div>
    );
  }
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="仕事が変わったとき" />
      <p className="st-note">
        新しい仕事の働き方とシフトパターンを、はじめの設定と同じ質問で選び直します。
      </p>
      <div className="st-field">
        <span className="dc-repeat-label">新しい仕事の初日</span>
        <InputDatePicker
          ariaLabel={`新しい仕事の初日：${formatDay(start)}。タップで変更`}
          className="dc-input-date-filled"
          date={start}
          onSelect={setStart}
          title="新しい仕事の初日"
        >
          <span>{formatDay(start)}</span>
          <ChevronDown
            aria-hidden="true"
            className="dc-input-chevron"
            size={15}
          />
        </InputDatePicker>
      </div>
      <p className="st-note">
        前の日までのシフトは、そのまま残ります。この日からのシフトは、新しい仕事に合わせて入れ直します。
      </p>
      <button
        className="st-primary"
        onClick={() => {
          setAsking(true);
        }}
        type="button"
      >
        次へ
        <ArrowRight aria-hidden="true" size={16} />
      </button>
    </>
  );
}

// Your name and picture, shown to the people in your groups. The picture
// is shared by every group; each group can use its own name for you.
// Your usual name and picture. New groups start with them; each group can
// use its own instead.
function ProfilePage({
  profile,
  onChange,
  onBack,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onBack: () => void;
}) {
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="プロフィール" />
      <PhotoEditor
        name={profile.name}
        onRemove={
          profile.photo
            ? () => {
                onChange({ ...profile, photo: undefined });
              }
            : undefined
        }
        onUpload={(photo) => {
          onChange({ ...profile, photo });
        }}
        photo={profile.photo}
        size={88}
      />
      <div className="st-list">
        <label className="st-row">
          <span className="st-row-label">いつもの名前</span>
          <input
            className="pe-inline-input"
            onChange={(event) => {
              onChange({ ...profile, name: event.target.value });
            }}
            placeholder="例：さくら"
            value={profile.name}
          />
        </label>
      </div>
      <p className="st-note">
        グループを作るときや参加するときに、最初に入る名前と写真です。グループごとに違う名前や写真にしたいときは、各グループの設定で変えられます。
      </p>
    </>
  );
}

function nextMonthStart() {
  return new Date(previewToday.getFullYear(), previewToday.getMonth() + 1, 1);
}

const workStyles = [
  {
    icon: "📋",
    name: "毎月、勤務表が配られる",
    note: "看護・介護・飲食など",
    repeating: false,
  },
  {
    icon: "🔁",
    name: "決まった順番で回っている",
    note: "消防・工場の交代勤務・曜日で固定など",
    repeating: true,
  },
];

// The same two choices as onboarding. Picking the other one goes on to set
// the order, or the day the roster takes over.
function WorkStylePage({
  rules,
  onBack,
  onRepeat,
  onRoster,
  onNew,
  onFix,
  onHolidaysOff,
}: {
  rules: RepeatRule[];
  onBack: () => void;
  onRepeat: () => void;
  onRoster: () => void;
  onNew: () => void;
  onFix: () => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
}) {
  const repeating = isRepeating(rules);
  const current = rules.at(-1);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="働き方" />
      <fieldset className="ob-options st-work-options">
        <legend className="dc-sr-only">働き方</legend>
        {workStyles.map((style) => {
          const selected = style.repeating === repeating;
          return (
            <button
              aria-pressed={selected}
              className="ob-option"
              key={style.name}
              onClick={() => {
                if (selected) {
                  return;
                }
                if (style.repeating) {
                  onRepeat();
                } else {
                  onRoster();
                }
              }}
              type="button"
            >
              <span aria-hidden="true" className="ob-option-icon">
                {style.icon}
              </span>
              <span className="ob-option-text">
                <strong>{style.name}</strong>
                <small className="ob-option-note">{style.note}</small>
              </span>
              {selected ? (
                <Check aria-hidden="true" className="st-work-check" size={20} />
              ) : (
                <ChevronRight
                  aria-hidden="true"
                  className="ob-option-arrow"
                  size={18}
                />
              )}
            </button>
          );
        })}
      </fieldset>
      {repeating && current ? (
        <RepeatDetails
          current={current}
          onFix={onFix}
          onHolidaysOff={onHolidaysOff}
          onNew={onNew}
        />
      ) : (
        <p className="st-note">
          順番を決めると、先の月までシフトが自動で入ります。月ごとの入力はいらなくなります。
        </p>
      )}
      <RuleHistory rules={rules} />
    </>
  );
}

// Stopping the repeat from a chosen day. Earlier shifts stay as they are.
function RosterSwitchPage({
  onBack,
  onApply,
}: {
  onBack: () => void;
  onApply: (start: Date) => void;
}) {
  const [start, setStart] = useState(nextMonthStart);
  return (
    <>
      <PageHeader back="働き方" onBack={onBack} title="勤務表に切り替え" />
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
      <p className="st-note">
        この日からの繰り返しのシフトは消えて、空いた状態になります。前の日までのシフトは、そのまま残ります。
      </p>
      <button
        className="st-primary"
        onClick={() => {
          onApply(start);
        }}
        type="button"
      >
        {shortDay(start)}から勤務表にする
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
      <Group title="トーン">
        <ToneChoices />
      </Group>
      <StylePresets />
      <CustomChoice onOpen={onCustomize} />
      <p className="st-note">
        スタイルは、グループの人があなたのシフトを見るときにも使われます。トーンは、あなたの画面だけに反映されます。
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
    return { dates, sample: false, schedule };
  }
  return {
    dates,
    sample: true,
    schedule: repeatSchedule(
      sampleSequence(patternKeys),
      dates[0],
      dates[0],
      dates.at(-1) ?? dates[0]
    ),
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
  const [opened] = useState<StyleChoice>({ look, theme });
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
              if (!stylePresetOf({ look, theme })) {
                setCustom?.({ look, theme });
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
  const isCustom = !stylePresetOf({ look, theme });
  return (
    <button
      aria-pressed={isCustom}
      className="st-custom-choice"
      onClick={() => {
        if (!isCustom && custom) {
          setTheme?.(custom.theme);
          setLook?.(custom.look);
        }
        onOpen({ look, theme });
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
  const current = stylePresetOf({ look, theme: themeContext.theme });
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
                      {presetSample.map((shift) => (
                        <ShiftMark key={shift} shift={shift} size={18} />
                      ))}
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
  return (
    <div className="st-list">
      <SwitchRow
        checked={names[current]}
        label="シフト名を表示"
        onChange={(checked) => setNames?.({ ...names, [current]: checked })}
      />
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
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        role="switch"
        type="checkbox"
      />
    </label>
  );
}

const toneOptions: { tone: Tone; name: string }[] = [
  { name: "深め", tone: "deep" },
  { name: "パステル", tone: "pastel" },
  { name: "くすみ", tone: "dusty" },
];

function toneName(tone: Tone) {
  return toneOptions.find((option) => option.tone === tone)?.name ?? tone;
}

// The color tone: one choice changes every theme color, the grays and
// the shift colors together, on the viewer's screen only. Each option shows
// the current theme in it.
function ToneChoices() {
  const tone = useContext(ToneContext);
  const setTone = useContext(SetToneContext);
  const { theme } = useContext(ThemeContext);
  const scheme = useContext(ColorSchemeContext);
  return (
    <fieldset className="st-mark-segment">
      <legend className="dc-sr-only">トーン</legend>
      {toneOptions.map((option) => (
        <button
          aria-pressed={tone === option.tone}
          key={option.tone}
          onClick={() => setTone?.(option.tone)}
          type="button"
        >
          <span
            aria-hidden="true"
            className="st-theme-dot st-tone-dot"
            style={{
              background: themeColors(themeOf(theme), scheme, option.tone).fill,
            }}
          />
          {option.name}
        </button>
      ))}
    </fieldset>
  );
}

const appearanceOptions: { appearance: Appearance; name: string }[] = [
  { appearance: "system", name: "端末に合わせる" },
  { appearance: "light", name: "ライト" },
  { appearance: "dark", name: "ダーク" },
];

function appearanceName(appearance: Appearance) {
  return (
    appearanceOptions.find((option) => option.appearance === appearance)
      ?.name ?? appearance
  );
}

// 外観 reads like the other rows: the current choice, opening a list.
function AppearanceRow({ onOpen }: { onOpen: () => void }) {
  const { appearance } = useContext(AppearanceContext);
  return (
    <Row label="外観" onOpen={onOpen} value={appearanceName(appearance)} />
  );
}

// Follow the device by default, or keep light or dark.
function AppearancePage({ onBack }: { onBack: () => void }) {
  const { appearance, setAppearance } = useContext(AppearanceContext);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="外観" />
      <fieldset className="st-list st-choice-list">
        <legend className="dc-sr-only">外観</legend>
        {appearanceOptions.map((option) => (
          <button
            aria-pressed={appearance === option.appearance}
            className="st-row"
            key={option.appearance}
            onClick={() => setAppearance?.(option.appearance)}
            type="button"
          >
            <span className="st-row-label">{option.name}</span>
            {appearance === option.appearance ? (
              <Check aria-hidden="true" className="st-work-check" size={20} />
            ) : null}
          </button>
        ))}
      </fieldset>
      <p className="st-note">
        端末に合わせると、スマホの設定に合わせてライトとダークが切り替わります。
      </p>
    </>
  );
}

// The theme colors as swatches.
function ThemeChoices() {
  const { theme, setTheme } = useContext(ThemeContext);
  const scheme = useContext(ColorSchemeContext);
  const tone = useContext(ToneContext);
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
            style={{ background: themeColors(option, scheme, tone).fill }}
          />
        </button>
      ))}
    </fieldset>
  );
}
