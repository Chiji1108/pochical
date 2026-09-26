import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudCheck,
} from "lucide-react";
import { useContext, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { Tone, ColorScheme } from "../lib/design-tokens";
import { markColors } from "../lib/design-tokens";
import { toneRoles } from "../lib/tones";
import {
  AccountContext,
  ProviderLogo,
  providerNames,
  sampleEmails,
} from "./design-account";
import type { AccountProvider } from "./design-account";
import {
  AppIcon,
  AppIconContext,
  pickableIcons,
  useAppIcons,
} from "./design-app-icon";
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
  showOverPhone,
  TabBar,
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
  ColorChoiceContext,
  ColorSchemeContext,
  PreviewSchemeSwitch,
  SetToneContext,
  ThemeContext,
  ToneContext,
  themeColors,
  themeOf,
  themes,
  themeStyle,
} from "./design-theme";
import type { Appearance, ColorChoice } from "./design-theme";
import { WeekSettingsContext, useWeek, weekdayNames } from "./design-week";
import type { ColoredDay } from "./design-week";
import {
  CellNamesContext,
  IconWeightContext,
  LookSettingsContext,
  OffHighlightContext,
  ShiftMark,
  ShiftMarkStyleContext,
  lookOf,
  useMarkColors,
  useOffHighlight,
} from "./shift-mark";
import type { LookSettings, ShiftMarkStyle } from "./shift-mark";

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
  | "appearance"
  | "week"
  | "appIcon"
  | "account"
  | "profile";

// The four shapes members see. Icons come filled or as outlines; letters
// always sit on their tile, and emoji have no fill.
const shapeOptions: { name: string; style: ShiftMarkStyle; fill: boolean }[] = [
  { fill: true, name: "アイコン", style: "icon" },
  { fill: false, name: "線", style: "icon" },
  { fill: true, name: "絵文字", style: "emoji" },
  { fill: true, name: "文字", style: "badge" },
];

function shapeOf(look: LookSettings) {
  return (
    shapeOptions.find(
      (option) =>
        option.style === look.style &&
        (look.style !== "icon" || option.fill === look.fill)
    ) ?? shapeOptions[0]
  );
}

const previewDays = 14;
const previewToday = new Date(2026, 8, 24);
const holidayWeekDay = new Date(2026, 8, 21);

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
  const weekTools = useWeek();
  const preview = stylePreviewOf(schedule, patternKeys, weekTools.weekDates);
  // From the week holding the 21st, so all three holidays of the 21st to
  // 23rd fall in the fortnight whatever day the week starts on.
  const weekPreview = stylePreviewOf(
    schedule,
    patternKeys,
    weekTools.weekDates,
    holidayWeekDay
  );
  const repeating = isRepeating(rules);
  const current = repeating ? rules.at(-1) : undefined;
  // The order to start from when repeating again.
  const lastSequence =
    [...rules].reverse().find((rule) => rule.sequence.length > 0)?.sequence ??
    [];
  return (
    <div className="dc-content st-screen">
      <div className="st-scroll">
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
            preview={preview}
          />
        )}
        {page === "week" && (
          <WeekPage
            onBack={() => {
              setPage("top");
            }}
            preview={weekPreview}
          />
        )}
        {page === "appIcon" && (
          <AppIconPage
            onBack={() => {
              setPage("top");
            }}
          />
        )}
        {page === "account" && (
          <AccountPage
            onBack={() => {
              setPage("top");
            }}
          />
        )}
        {page === "appearance" && (
          <AppearancePage
            onBack={() => {
              setPage("top");
            }}
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
      <TabBar active="settings" onSelect={onTab} />
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
          value={`${shapeOf(look).name}${
            tone === "deep" ? "" : `・${toneName(tone)}`
          }`}
        />
        <AppearanceRow
          onOpen={() => {
            onOpen("appearance");
          }}
        />
        <AppIconRow
          onOpen={() => {
            onOpen("appIcon");
          }}
        />
        <WeekRow
          onOpen={() => {
            onOpen("week");
          }}
        />
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
        <AccountRow
          onOpen={() => {
            onOpen("account");
          }}
        />
      </Section>
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
function Group({
  title,
  note,
  children,
}: {
  title: string;
  // A short aside after the title, like who a setting reaches.
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="st-section">
      <h4>
        {title}
        {note && <small className="st-section-note">{note}</small>}
      </h4>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  onOpen,
}: {
  label: string;
  value?: ReactNode;
  onOpen?: () => void;
}) {
  const content = (
    <>
      <span className="st-row-label">{label}</span>
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

function AccountRow({ onOpen }: { onOpen: () => void }) {
  const { account } = useContext(AccountContext);
  return (
    <Row
      label="アカウント"
      onOpen={onOpen}
      value={
        account ? (
          <span className="st-inline-value">
            <ProviderLogo provider={account.provider} size={15} />
            {providerNames[account.provider]}
          </span>
        ) : (
          "ログインしていません"
        )
      }
    />
  );
}

// How long the prototype pretends the provider's sign-in takes.
const signInMilliseconds = 900;

// Before signing in, what it is for and the two ways in; after, who is
// signed in and the ways out. Signing in is optional, so the page never
// pushes it beyond saying what it keeps safe.
function AccountPage({ onBack }: { onBack: () => void }) {
  const { account, setAccount } = useContext(AccountContext);
  const [busy, setBusy] = useState<AccountProvider>();
  const [confirm, setConfirm] = useState<"signOut" | "delete">();
  const signIn = (provider: AccountProvider) => {
    if (busy) {
      return;
    }
    setBusy(provider);
    setTimeout(() => {
      setAccount?.({ email: sampleEmails[provider], provider });
      setBusy(undefined);
    }, signInMilliseconds);
  };
  if (!account) {
    return (
      <>
        <PageHeader back="設定" onBack={onBack} title="アカウント" />
        <div className="st-account-hero">
          <span aria-hidden="true" className="st-account-icon">
            <CloudCheck size={28} />
          </span>
          <h4>ログインして、データを守る</h4>
          <p>
            機種変更しても、スマホとタブレットでも、同じシフトとグループを使えます。
          </p>
        </div>
        <div className="st-account-buttons">
          {(["apple", "google"] as const).map((provider) => (
            <button
              className={`st-provider st-provider-${provider}`}
              disabled={busy !== undefined}
              key={provider}
              onClick={() => {
                signIn(provider);
              }}
              type="button"
            >
              <ProviderLogo provider={provider} size={19} />
              {busy === provider
                ? "ログイン中…"
                : `${providerNames[provider]}で続ける`}
            </button>
          ))}
        </div>
        <p className="st-note">
          はじめてなら、この端末のデータがそのまま引き継がれます。すでにアカウントがあれば、そのデータを開きます。ログインしなくても、この端末ではそのまま使えます。
        </p>
      </>
    );
  }
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="アカウント" />
      <Group title="ログイン中">
        <div className="st-list">
          <div className="st-row">
            <span className="st-account-logo">
              <ProviderLogo provider={account.provider} size={18} />
            </span>
            <span className="st-row-label">
              {providerNames[account.provider]}
            </span>
            <span className="st-row-value st-account-email">
              {account.email}
            </span>
          </div>
        </div>
        <p className="st-note">
          シフトとグループはこのアカウントに保存され、ほかの端末でも同じデータを使えます。
        </p>
      </Group>
      <div className="st-list">
        {/* Asks first, on the spot, so no arrow as for a page. */}
        <button
          className="st-row"
          onClick={() => {
            setConfirm("signOut");
          }}
          type="button"
        >
          <span className="st-row-label st-danger">ログアウト</span>
        </button>
      </div>
      <div className="st-list st-account-delete">
        {/* Asks first, on the spot, so no arrow as for a page. */}
        <button
          className="st-row"
          onClick={() => {
            setConfirm("delete");
          }}
          type="button"
        >
          <span className="st-row-label st-danger">アカウントを削除</span>
        </button>
      </div>
      {confirm === "signOut" && (
        <ConfirmSheet
          action="ログアウト"
          message="この端末からデータが消えます。もう一度ログインすれば、同じデータを使えます。"
          onCancel={() => {
            setConfirm(undefined);
          }}
          onConfirm={() => {
            setConfirm(undefined);
            setAccount?.(undefined);
          }}
          title="ログアウトしますか？"
        />
      )}
      {confirm === "delete" && (
        <ConfirmSheet
          action="アカウントを削除"
          message="シフト、グループ、チャットがすべて削除されます。元に戻せません。"
          onCancel={() => {
            setConfirm(undefined);
          }}
          onConfirm={() => {
            setConfirm(undefined);
            setAccount?.(undefined);
          }}
          title="アカウントを削除しますか？"
        />
      )}
    </>
  );
}

// A question before something hard to undo, over the phone like the other
// sheets. It opens as soon as it is rendered.
function ConfirmSheet({
  title,
  message,
  action,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const sheetRef = useRef<HTMLDialogElement>(null);
  const open = (sheet: HTMLDialogElement | null) => {
    sheetRef.current = sheet;
    if (sheet && !sheet.open) {
      showOverPhone(sheet, sheet.closest<HTMLElement>(".dc-phone"));
    }
  };
  return (
    <dialog
      aria-label={title}
      className="dc-breakdown"
      onClose={onCancel}
      ref={open}
    >
      <button
        aria-label="閉じる"
        className="dc-sheet-scrim"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <section className="dc-sheet st-confirm-sheet">
        <div aria-hidden="true" className="dc-sheet-handle" />
        <h4>{title}</h4>
        <p>{message}</p>
        <button className="st-confirm-action" onClick={onConfirm} type="button">
          {action}
        </button>
        <button className="st-photo-cancel" onClick={onCancel} type="button">
          キャンセル
        </button>
      </section>
    </dialog>
  );
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
  const weekTools = useWeek();
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
            <small
              className={`dc-repeat-day-number ${weekTools.dateClass(date)}`}
            >
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

function MarkPage({
  preview,
  onBack,
}: {
  preview: StylePreviewData;
  onBack: () => void;
}) {
  const current = useContext(ShiftMarkStyleContext);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="スタイル" />
      <StylePreview preview={preview} />
      {/* Every choice shows in the preview at once, so there is nothing to
          confirm or cancel. */}
      <Group note="グループの人にも表示" title="シフトの見た目">
        <ShapeChoices />
      </Group>
      <Group note="シフトの色はグループの人にも表示" title="カラー">
        <ColorChoices />
      </Group>
      <Group note="あなたの画面だけ" title="トーン">
        <ToneChoices />
      </Group>
      <Group note="あなたの画面だけ" title="自分のカレンダー">
        <MarkOptionsList current={current} />
      </Group>
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
  patternKeys: Shift[],
  weekDates: (date: Date) => Date[],
  from: Date = previewToday
): StylePreviewData {
  const dates = [...weekDates(from), ...weekDates(addDays(from, 7))];
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

// The preview can show the other of light and dark on its own, without
// touching 外観, so a style can be judged in both.
function StylePreview({ preview }: { preview: StylePreviewData }) {
  const weekTools = useWeek();
  const { dates, schedule, sample } = preview;
  const scheme = useContext(ColorSchemeContext);
  const { theme } = useContext(ThemeContext);
  const tone = useContext(ToneContext);
  const [picked, setPicked] = useState<ColorScheme>();
  const shown = picked ?? scheme;
  return (
    <div className="st-preview-wrap">
      <ColorSchemeContext value={shown}>
        <div
          aria-hidden="true"
          className="st-preview"
          inert
          style={themeStyle(theme, shown, tone)}
        >
          {sample && <span className="st-preview-sample">見本</span>}
          <div className="dc-weekdays">
            {weekTools.weekdays.map((day) => (
              <span className={day.className} key={day.day}>
                {day.label}
              </span>
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
      </ColorSchemeContext>
      <PreviewSchemeSwitch onPick={setPicked} shown={shown} />
    </div>
  );
}

// The switches for the look in use, as one list.
function ShapeChoices() {
  const { look, updateLook } = useContext(LookSettingsContext);
  const current = shapeOf(look);
  return (
    <fieldset className="st-mark-segment">
      <legend className="dc-sr-only">シフトの見た目</legend>
      {shapeOptions.map((option) => (
        <button
          aria-pressed={option === current}
          key={option.name}
          onClick={() => {
            // Only icons carry their fill; for the others it is left alone.
            updateLook?.(
              option.style === "icon"
                ? { fill: option.fill, style: option.style }
                : { style: option.style }
            );
          }}
          type="button"
        >
          <ShiftMarkStyleContext value={option.style}>
            <IconWeightContext value={option.fill ? "duotone" : "regular"}>
              <ShiftMark shift="day" size={20} />
            </IconWeightContext>
          </ShiftMarkStyleContext>
          {option.name}
        </button>
      ))}
    </fieldset>
  );
}

// How your own calendar shows the marks. Group screens decide these for
// themselves, so members never see them.
function MarkOptionsList({ current }: { current: ShiftMarkStyle }) {
  const { names, setNames } = useContext(CellNamesContext);
  const { highlight, setHighlight } = useContext(OffHighlightContext);
  const highlightOn = useOffHighlight(current);
  return (
    <div className="st-list">
      <SwitchRow
        checked={names[current]}
        label="シフト名を表示"
        onChange={(checked) => setNames?.({ ...names, [current]: checked })}
      />
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
  swatch,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  // A dot in the color the setting paints with.
  swatch?: string;
}) {
  return (
    <label className="st-row">
      {swatch ? (
        <span
          aria-hidden="true"
          className="st-row-swatch"
          style={{ background: swatch }}
        />
      ) : null}
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
  { name: "紙", tone: "paper" },
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
function AppIconRow({ onOpen }: { onOpen: () => void }) {
  const { icon } = useContext(AppIconContext);
  const icons = useAppIcons();
  const picked = pickableIcons.find((option) => option.id === icon);
  return (
    <Row
      label="アプリアイコン"
      onOpen={onOpen}
      value={
        <span className="st-inline-value">
          <AppIcon size={22} src={icons[icon]} />
          {picked?.name}
        </span>
      }
    />
  );
}

// The home screen icon. iOS confirms every change itself, so the page
// shows its alert; on a dark home screen each icon turns to the dark one.
function AppIconPage({ onBack }: { onBack: () => void }) {
  const { icon, setIcon } = useContext(AppIconContext);
  const icons = useAppIcons();
  const [alerted, setAlerted] = useState(false);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="アプリアイコン" />
      <fieldset className="st-app-icons">
        <legend className="dc-sr-only">アプリアイコン</legend>
        {pickableIcons.map((option) => (
          <button
            aria-pressed={icon === option.id}
            key={option.id}
            onClick={() => {
              if (icon !== option.id) {
                setIcon?.(option.id);
                setAlerted(true);
              }
            }}
            type="button"
          >
            <AppIcon size={72} src={icons[option.id]} />
            <span className="st-app-icon-name">
              {icon === option.id && (
                <Check
                  aria-hidden="true"
                  className="st-app-icon-check"
                  size={14}
                />
              )}
              {option.name}
            </span>
          </button>
        ))}
      </fieldset>
      <div className="st-list st-app-icon-dark">
        <div className="st-row">
          <AppIcon size={36} src={icons.dark} />
          <span className="st-row-label st-app-icon-dark-label">
            ダークのホーム画面
            <small>どのアイコンでも、この色に切り替わります</small>
          </span>
        </div>
      </div>
      {alerted && (
        <SystemAlert
          onClose={() => {
            setAlerted(false);
          }}
          title="“ポチカル”のアイコンを変更しました"
        />
      )}
    </>
  );
}

// The system's own alert, as iOS shows it after an icon change.
function SystemAlert({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  const open = (alert: HTMLDialogElement | null) => {
    if (alert && !alert.open) {
      showOverPhone(alert, alert.closest<HTMLElement>(".dc-phone"));
    }
  };
  return (
    <dialog
      aria-label={title}
      className="dc-breakdown"
      onClose={onClose}
      ref={open}
    >
      <div className="dc-sheet-scrim" />
      <section className="st-system-alert">
        <p>{title}</p>
        <button onClick={onClose} type="button">
          OK
        </button>
      </section>
    </dialog>
  );
}

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

const coloredDayOptions: { day: ColoredDay; name: string; color: string }[] = [
  { color: "var(--saturday)", day: "saturday", name: "土曜" },
  { color: "var(--holiday)", day: "sunday", name: "日曜" },
  { color: "var(--holiday)", day: "holiday", name: "祝日" },
];

const coloredDayShortNames: Record<ColoredDay, string> = {
  holiday: "祝",
  saturday: "土",
  sunday: "日",
};

function WeekRow({ onOpen }: { onOpen: () => void }) {
  const { week } = useContext(WeekSettingsContext);
  const colored = coloredDayOptions
    .filter((option) => week.colored[option.day])
    .map((option) => coloredDayShortNames[option.day])
    .join("");
  return (
    <Row
      label="曜日と祝日"
      onOpen={onOpen}
      value={`${weekdayNames[week.weekStart]}曜はじまり・${colored || "色なし"}`}
    />
  );
}

// 週の始まり and 色をつける日, seen on the same preview as the style page.
// Only the viewer's screen changes.
function WeekPage({
  preview,
  onBack,
}: {
  preview: StylePreviewData;
  onBack: () => void;
}) {
  const { week, setWeek } = useContext(WeekSettingsContext);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="曜日と祝日" />
      {/* The style page's preview, two rows high whatever day the week
          starts on, with a Saturday, a Sunday and three holidays in it. */}
      <StylePreview preview={preview} />
      <Group title="週の始まり">
        <fieldset className="st-mark-segment st-week-start">
          <legend className="dc-sr-only">週の始まり</legend>
          {weekdayNames.map((name, day) => (
            <button
              aria-label={`${name}曜`}
              aria-pressed={week.weekStart === day}
              key={name}
              onClick={() => setWeek?.({ ...week, weekStart: day })}
              type="button"
            >
              {name}
            </button>
          ))}
        </fieldset>
      </Group>
      <Group title="色をつける日">
        <div className="st-list">
          {coloredDayOptions.map((option) => (
            <SwitchRow
              checked={week.colored[option.day]}
              key={option.day}
              label={option.name}
              onChange={(checked) =>
                setWeek?.({
                  ...week,
                  colored: { ...week.colored, [option.day]: checked },
                })
              }
              swatch={option.color}
            />
          ))}
        </div>
      </Group>
      <p className="st-note">
        土曜と日曜は曜日の見出しに、祝日は日付に色がつきます。祝日は日曜と同じ赤です。グループの画面でも、この並びと色で表示されます。
      </p>
    </>
  );
}

// The shift patterns' own colors, for the マルチカラー swatch.
const multiSwatchShifts: Shift[] = ["day", "night", "after", "off"];

// A round swatch of a カラー choice: the theme color, or a pie of the shift
// colors for マルチカラー.
function ColorSwatch({
  color,
  className,
}: {
  color: ColorChoice;
  className: string;
}) {
  const scheme = useContext(ColorSchemeContext);
  const tone = useContext(ToneContext);
  const shiftColors = useMarkColors();
  if (color !== "multi") {
    return (
      <span
        aria-hidden="true"
        className={className}
        style={{ background: themeColors(themeOf(color), scheme, tone).fill }}
      />
    );
  }
  // Each shift color as this tone would fill with it, so the slices sit at
  // the same depth as the theme swatches beside them.
  const slices = multiSwatchShifts.map((shift) => {
    const option = markColors[lookOf(shift).color] ?? markColors[0];
    return tone === "deep"
      ? (shiftColors[lookOf(shift).color]?.color ?? option.color)
      : toneRoles(tone, option.color, scheme).fill;
  });
  const quarter = 100 / slices.length;
  const stops = slices
    .map(
      (slice, index) => `${slice} ${index * quarter}% ${(index + 1) * quarter}%`
    )
    .join(", ");
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ background: `conic-gradient(${stops})` }}
    />
  );
}

const colorChoices: { color: ColorChoice; name: string }[] = [
  { color: "multi", name: "マルチカラー" },
  ...themes.map((theme) => ({ color: theme.id, name: theme.name })),
];

// マルチカラー keeps each shift's own color with the moss theme; a theme
// color draws every shift in that one color. Seven choices, because the
// other mixes (another theme with many shift colors) clash.
function ColorChoices() {
  const { color, setColor } = useContext(ColorChoiceContext);
  return (
    <fieldset className="st-theme-grid st-theme-row">
      <legend className="dc-sr-only">カラー</legend>
      {colorChoices.map((option) => (
        <button
          aria-label={option.name}
          aria-pressed={color === option.color}
          key={option.color}
          onClick={() => setColor?.(option.color)}
          type="button"
        >
          <ColorSwatch className="st-theme-dot" color={option.color} />
        </button>
      ))}
    </fieldset>
  );
}
