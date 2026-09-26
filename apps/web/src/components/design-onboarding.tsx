import { ChevronLeft, ChevronRight } from "lucide-react";
import { useContext, useState } from "react";

import type { DesignVariants } from "../lib/design-variants";
import { ProviderLogo, providerNames } from "./design-account";
import type { AccountProvider } from "./design-account";
import {
  addDays,
  DesignCalendar,
  dateKey,
  formatDay,
  PhoneStatusBar,
  patterns,
  RepeatSequenceEditor,
  repeatSchedule,
} from "./design-calendar";
import type { RepeatRule, Schedule, Shift } from "./design-calendar";
import { ColorSchemeContext, useThemeStyle } from "./design-theme";
import { useWeek } from "./design-week";
import { ShiftMark } from "./shift-mark";

type Template = {
  id: string;
  title: string;
  note: string;
  patternKeys: Shift[];
  // Present only for work that repeats in a fixed order.
  sequence?: Shift[];
  // The sequence starts on Sunday, so the first day comes from the weekday.
  weekly?: boolean;
  custom?: boolean;
};

const rosterTemplates: Template[] = [
  {
    id: "two-shift",
    note: "日勤と夜勤、夜勤の翌日は明け",
    patternKeys: ["day", "night", "after", "off"],
    title: "二交代制",
  },
  {
    id: "three-shift",
    note: "日勤・準夜・深夜",
    patternKeys: ["day", "junya", "midnight", "off"],
    title: "三交代制",
  },
  {
    id: "two-shift-early-late",
    note: "時間の違う日勤が混ざる",
    patternKeys: ["early", "day", "late", "night", "after", "off"],
    title: "二交代制 + 早番・遅番",
  },
  {
    id: "roster-custom",
    note: "まずは二交代制で始めて、あとで設定から変えられます",
    patternKeys: ["day", "night", "after", "off"],
    title: "自分で作る",
  },
];

const rotationTemplates: Template[] = [
  {
    id: "duty",
    note: "消防などの24時間勤務",
    patternKeys: ["duty", "offDuty", "off"],
    sequence: ["duty", "offDuty", "off"],
    title: "当番・非番・休み",
  },
  {
    id: "factory",
    note: "工場などの3交代（2日ずつ回る例）",
    patternKeys: ["day", "evening", "midnight", "off"],
    sequence: [
      "day",
      "day",
      "evening",
      "evening",
      "midnight",
      "midnight",
      "off",
      "off",
    ],
    title: "日勤・夕勤・深夜の交代",
  },
  {
    id: "weekdays",
    note: "曜日で決まっている勤務",
    patternKeys: ["day", "off"],
    sequence: ["off", "day", "day", "day", "day", "day", "off"],
    title: "平日は日勤、土日は休み",
    weekly: true,
  },
  {
    custom: true,
    id: "rotation-custom",
    note: "並びを組み立てる",
    patternKeys: ["duty", "offDuty", "day", "night", "after", "off"],
    sequence: [],
    title: "自分で作る",
  },
];

type Step =
  | { name: "kind" }
  | { name: "roster" }
  | { name: "rotation" }
  | { name: "custom"; template: Template; sequence: Shift[] }
  | { name: "anchor"; template: Template; sequence: Shift[] };

const designMonth = new Date(2026, 8, 1);

function startSchedule(sequence?: Shift[], anchor?: Date): Schedule {
  if (!(sequence && anchor)) {
    return {};
  }
  return repeatSchedule(
    sequence,
    anchor,
    new Date(designMonth.getFullYear(), designMonth.getMonth() - 1, 1),
    // A stored rule has no end; a year ahead is plenty for the preview.
    new Date(designMonth.getFullYear(), designMonth.getMonth() + 13, 0)
  );
}

// What the setup questions end with: the patterns to use, and for work
// that repeats, the order and a day that falls on its first shift.
export type WorkSetup = {
  patternKeys: Shift[];
  sequence?: Shift[];
  anchor?: Date;
};

// The patterns and order a returning account brings back in the prototype.
const restoredSetup: WorkSetup = {
  anchor: new Date(2026, 7, 30),
  patternKeys: ["day", "night", "after", "off"],
  sequence: ["day", "day", "night", "after", "off", "off"],
};

// How long the prototype pretends the provider's sign-in takes.
const signInMilliseconds = 900;

type Stage = "welcome" | "login" | "setup";

// First run: a welcome with a way back in for people who already have an
// account, then the work questions. An invitation opened on the way is
// asked about once the calendar is ready, like any other time.
export function DesignOnboarding({ variants }: { variants: DesignVariants }) {
  const themeStyle = useThemeStyle();
  const [stage, setStage] = useState<Stage>("welcome");
  const [finished, setFinished] = useState<{
    patternKeys: Shift[];
    rule?: RepeatRule;
    note?: string;
  }>();
  const [schedule, setSchedule] = useState<Schedule>({});

  function finish({ patternKeys, sequence, anchor }: WorkSetup, note?: string) {
    setSchedule(startSchedule(sequence, anchor));
    setFinished({
      note,
      patternKeys,
      rule: sequence && anchor ? { sequence, start: anchor } : undefined,
    });
  }

  if (finished) {
    return (
      <div className="ob-finished">
        <DesignCalendar
          initialEditing={false}
          initialRule={finished.rule}
          onChange={setSchedule}
          patternKeys={finished.patternKeys}
          pendingInvite={variants.inviteLink === "opened"}
          schedule={schedule}
          variants={variants}
        />
        {finished.note && <p className="ob-finished-note">{finished.note}</p>}
        <button
          className="ob-restart"
          onClick={() => {
            setFinished(undefined);
            setStage("welcome");
          }}
          type="button"
        >
          最初からやり直す
        </button>
      </div>
    );
  }

  return (
    <div className="dc-phone ob-phone" style={themeStyle}>
      <PhoneStatusBar />
      <div className="ob-content">
        {stage === "welcome" && (
          <WelcomeStep
            onLogin={() => {
              setStage("login");
            }}
            onStart={() => {
              setStage("setup");
            }}
          />
        )}
        {stage === "login" && (
          <LoginStep
            onBack={() => {
              setStage("welcome");
            }}
            onRestore={() => {
              finish(restoredSetup, "前の端末のデータを戻しました（見本）。");
            }}
          />
        )}
        {stage === "setup" && (
          <WorkSetupSteps
            finishLabel="はじめる"
            onBack={() => {
              setStage("welcome");
            }}
            onFinish={(setup) => {
              finish(setup);
            }}
          />
        )}
      </div>
      <div aria-hidden="true" className="dc-home-indicator" />
    </div>
  );
}

function WelcomeStep({
  onStart,
  onLogin,
}: {
  onStart: () => void;
  onLogin: () => void;
}) {
  const scheme = useContext(ColorSchemeContext);
  return (
    <div className="ob-welcome-screen">
      <div className="ob-intro">
        {/* The app icon's poodle, just the drawing: the one who was tapped on
            the home screen, over the name it gives. */}
        <img
          alt=""
          className={`ob-poodle ob-poodle-${scheme}`}
          height={200}
          src="/design/poodle.jpeg"
          width={200}
        />
        <h3>ポチカル</h3>
        {/* Each phrase stays whole, so the line breaks after the comma. */}
        <p>
          <span className="ob-phrase">シフトをポチッと入れて、</span>
          <span className="ob-phrase">
            家族や友達と見せ合えるカレンダーです。
          </span>
        </p>
      </div>
      <div className="ob-welcome-actions">
        <button className="ob-primary" onClick={onStart} type="button">
          はじめる
        </button>
        <button className="ob-link" onClick={onLogin} type="button">
          アカウントをお持ちの方はログイン
        </button>
      </div>
    </div>
  );
}

// For someone moving to a new phone: signing in brings their data back
// instead of answering the questions again.
function LoginStep({
  onBack,
  onRestore,
}: {
  onBack: () => void;
  onRestore: () => void;
}) {
  const [busy, setBusy] = useState<AccountProvider>();
  return (
    <>
      <StepHeader
        description="前の端末で使っていたシフトとグループを、そのまま戻します。"
        onBack={onBack}
        title="アカウントでログイン"
      />
      <div className="st-account-buttons">
        {(["apple", "google"] as const).map((provider) => (
          <button
            className={`st-provider st-provider-${provider}`}
            disabled={busy !== undefined}
            key={provider}
            onClick={() => {
              setBusy(provider);
              setTimeout(onRestore, signInMilliseconds);
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
      <p className="ob-footnote">
        はじめて使うときは、戻って「はじめる」から始めてください。
      </p>
    </>
  );
}

// The questions from onboarding, also used when changing jobs. Without
// `onExit` it is the first run and greets the person.
export function WorkSetupSteps({
  month = designMonth,
  finishLabel,
  onExit,
  onBack,
  onFinish,
}: {
  month?: Date;
  finishLabel: string;
  onExit?: () => void;
  // Back from the first question on the first run, to the welcome.
  onBack?: () => void;
  onFinish: (setup: WorkSetup) => void;
}) {
  const [step, setStep] = useState<Step>({ name: "kind" });

  function chooseRotation(template: Template) {
    if (template.custom) {
      setStep({ name: "custom", sequence: [], template });
    } else if (template.weekly && template.sequence) {
      // Any Sunday works as the first day of a week-based sequence.
      onFinish({
        anchor: addDays(month, -month.getDay()),
        patternKeys: template.patternKeys,
        sequence: template.sequence,
      });
    } else if (template.sequence) {
      setStep({ name: "anchor", sequence: template.sequence, template });
    }
  }

  return (
    <>
      {step.name === "kind" && (
        <KindStep
          first={!onExit}
          onBack={onExit ?? onBack}
          onRoster={() => {
            setStep({ name: "roster" });
          }}
          onRotation={() => {
            setStep({ name: "rotation" });
          }}
        />
      )}
      {step.name === "roster" && (
        <TemplateStep
          onBack={() => {
            setStep({ name: "kind" });
          }}
          onChoose={(template) => {
            onFinish({ patternKeys: template.patternKeys });
          }}
          templates={rosterTemplates}
          title="近い働き方を選んでください"
        />
      )}
      {step.name === "rotation" && (
        <TemplateStep
          onBack={() => {
            setStep({ name: "kind" });
          }}
          onChoose={chooseRotation}
          templates={rotationTemplates}
          title="どんな順番で回りますか？"
        />
      )}
      {step.name === "custom" && (
        <CustomStep
          initialSequence={step.sequence}
          onBack={() => {
            setStep({ name: "rotation" });
          }}
          onNext={(sequence) => {
            setStep({ name: "anchor", sequence, template: step.template });
          }}
          template={step.template}
        />
      )}
      {step.name === "anchor" && (
        <AnchorStep
          finishLabel={finishLabel}
          month={month}
          onBack={() => {
            setStep(
              step.template.custom
                ? {
                    name: "custom",
                    sequence: step.sequence,
                    template: step.template,
                  }
                : { name: "rotation" }
            );
          }}
          onStart={(anchor) => {
            onFinish({
              anchor,
              patternKeys: step.template.patternKeys,
              sequence: step.sequence,
            });
          }}
          sequence={step.sequence}
        />
      )}
    </>
  );
}

function StepHeader({
  onBack,
  title,
  description,
}: {
  onBack?: () => void;
  title: string;
  description?: string;
}) {
  return (
    <header className="ob-header">
      {onBack && (
        <button
          aria-label="戻る"
          className="ob-back"
          onClick={onBack}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={22} />
        </button>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </header>
  );
}

function KindStep({
  first,
  onBack,
  onRoster,
  onRotation,
}: {
  first: boolean;
  onBack?: () => void;
  onRoster: () => void;
  onRotation: () => void;
}) {
  return (
    <>
      <StepHeader
        description={
          first
            ? "答えに合わせて、入れやすい形で始めます。"
            : "前の仕事のシフトは、そのまま残ります。"
        }
        onBack={onBack}
        title={
          first
            ? "シフトはどう決まりますか？"
            : "新しい仕事のシフトはどう決まりますか？"
        }
      />
      <div className="ob-options">
        <button className="ob-option" onClick={onRoster} type="button">
          <span aria-hidden="true" className="ob-option-icon">
            📋
          </span>
          <span className="ob-option-text">
            <strong>毎月、勤務表が配られる</strong>
            <small className="ob-option-note">看護・介護・飲食など</small>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="ob-option-arrow"
            size={18}
          />
        </button>
        <button className="ob-option" onClick={onRotation} type="button">
          <span aria-hidden="true" className="ob-option-icon">
            🔁
          </span>
          <span className="ob-option-text">
            <strong>決まった順番で回っている</strong>
            <small className="ob-option-note">
              消防・工場の交代勤務・曜日で固定など
            </small>
          </span>
          <ChevronRight
            aria-hidden="true"
            className="ob-option-arrow"
            size={18}
          />
        </button>
      </div>
      {first && <p className="ob-footnote">あとから設定で変えられます</p>}
    </>
  );
}

function TemplateStep({
  title,
  templates,
  onBack,
  onChoose,
}: {
  title: string;
  templates: Template[];
  onBack: () => void;
  onChoose: (template: Template) => void;
}) {
  return (
    <>
      <StepHeader
        description="あとから名前や時間を変えられます。"
        onBack={onBack}
        title={title}
      />
      <div className="ob-options">
        {templates.map((template) => (
          <button
            className="ob-option"
            key={template.id}
            onClick={() => {
              onChoose(template);
            }}
            type="button"
          >
            <span className="ob-option-text">
              <strong>{template.title}</strong>
              <small className="ob-option-note">{template.note}</small>
              {!template.custom && (
                <span aria-hidden="true" className="ob-chips">
                  {(template.sequence ?? template.patternKeys).map(
                    (key, index) => (
                      // oxlint-disable-next-line react/no-array-index-key -- a sequence repeats the same shift, so position is its identity.
                      <span className="ob-chip" key={index}>
                        <ShiftMark shift={key} size={11} />
                        {patterns[key].label}
                      </span>
                    )
                  )}
                </span>
              )}
            </span>
            <ChevronRight
              aria-hidden="true"
              className="ob-option-arrow"
              size={18}
            />
          </button>
        ))}
      </div>
    </>
  );
}

function CustomStep({
  template,
  initialSequence,
  onBack,
  onNext,
}: {
  template: Template;
  initialSequence: Shift[];
  onBack: () => void;
  onNext: (sequence: Shift[]) => void;
}) {
  const [sequence, setSequence] = useState(initialSequence);
  return (
    <>
      <StepHeader
        description="1日目から順番に、シフトを追加してください。"
        onBack={onBack}
        title="並びを組み立てる"
      />
      <RepeatSequenceEditor
        onChange={setSequence}
        patternKeys={template.patternKeys}
        sequence={sequence}
      />
      <button
        className="ob-primary"
        disabled={sequence.length === 0}
        onClick={() => {
          onNext(sequence);
        }}
        type="button"
      >
        次へ
      </button>
    </>
  );
}

function AnchorStep({
  sequence,
  month,
  finishLabel,
  onBack,
  onStart,
}: {
  sequence: Shift[];
  month: Date;
  finishLabel: string;
  onBack: () => void;
  onStart: (anchor: Date) => void;
}) {
  const weekTools = useWeek();
  const [viewMonth, setViewMonth] = useState(month);
  const [anchor, setAnchor] = useState<Date>();
  const first = patterns[sequence[0]].label;
  return (
    <>
      <StepHeader
        description="今日でも、これからの日でも大丈夫です。"
        onBack={onBack}
        title={`「${first}」の日を1日選んでください`}
      />
      <div className="ob-month">
        <button
          aria-label="前の月"
          onClick={() => {
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1)
            );
          }}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={20} />
        </button>
        <strong aria-live="polite">
          {viewMonth.getFullYear()}年{viewMonth.getMonth() + 1}月
        </strong>
        <button
          aria-label="次の月"
          onClick={() => {
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1)
            );
          }}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={20} />
        </button>
      </div>
      <div className="ob-days">
        {weekTools.weekdays.map((day) => (
          <span aria-hidden="true" className="ob-weekday" key={day.day}>
            {day.label}
          </span>
        ))}
        {weekTools.monthDates(viewMonth).map((date) => {
          const outside = date.getMonth() !== viewMonth.getMonth();
          return (
            <button
              aria-label={`${formatDay(date)}を「${first}」の日にする`}
              aria-pressed={
                anchor !== undefined && dateKey(date) === dateKey(anchor)
              }
              className={`${outside ? "ob-outside" : ""} ${weekTools.dateClass(date)}`}
              key={dateKey(date)}
              onClick={() => {
                setAnchor(date);
              }}
              type="button"
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      {anchor && (
        <p className="ob-preview-label">{formatDay(anchor)}からの2週間</p>
      )}
      {anchor && (
        <div aria-label="最初の2週間" className="dc-repeat-preview" role="img">
          {Array.from({ length: 14 }, (_, index) => {
            const date = addDays(anchor, index);
            const shift = sequence[index % sequence.length];
            return (
              <span className="dc-repeat-day" key={dateKey(date)}>
                <small
                  className={`dc-repeat-day-number ${weekTools.dateClass(date)}`}
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
        className="ob-primary"
        disabled={!anchor}
        onClick={() => anchor && onStart(anchor)}
        type="button"
      >
        {finishLabel}
      </button>
    </>
  );
}
