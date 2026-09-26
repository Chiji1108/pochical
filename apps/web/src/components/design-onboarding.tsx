import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { DesignVariants } from "../lib/design-variants";
import {
  addDays,
  DesignCalendar,
  dateKey,
  formatDay,
  monthDates,
  PhoneStatusBar,
  patterns,
  type RepeatRule,
  RepeatSequenceEditor,
  repeatSchedule,
  type Schedule,
  type Shift,
  weekendClassName,
} from "./design-calendar";
import { useThemeStyle } from "./design-theme";
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
    title: "二交代制",
    note: "日勤と夜勤、夜勤の翌日は明け",
    patternKeys: ["day", "night", "after", "off"],
  },
  {
    id: "three-shift",
    title: "三交代制",
    note: "日勤・準夜・深夜",
    patternKeys: ["day", "junya", "midnight", "off"],
  },
  {
    id: "two-shift-early-late",
    title: "二交代制 + 早番・遅番",
    note: "時間の違う日勤が混ざる",
    patternKeys: ["early", "day", "late", "night", "after", "off"],
  },
  {
    id: "roster-custom",
    title: "自分で作る",
    note: "まずは二交代制で始めて、あとで設定から変えられます",
    patternKeys: ["day", "night", "after", "off"],
  },
];

const rotationTemplates: Template[] = [
  {
    id: "duty",
    title: "当番・非番・休み",
    note: "消防などの24時間勤務",
    patternKeys: ["duty", "offDuty", "off"],
    sequence: ["duty", "offDuty", "off"],
  },
  {
    id: "factory",
    title: "日勤・夕勤・深夜の交代",
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
  },
  {
    id: "weekdays",
    title: "平日は日勤、土日は休み",
    note: "曜日で決まっている勤務",
    patternKeys: ["day", "off"],
    sequence: ["off", "day", "day", "day", "day", "day", "off"],
    weekly: true,
  },
  {
    id: "rotation-custom",
    title: "自分で作る",
    note: "並びを組み立てる",
    patternKeys: ["duty", "offDuty", "day", "night", "after", "off"],
    sequence: [],
    custom: true,
  },
];

type Step =
  | { name: "kind" }
  | { name: "roster" }
  | { name: "rotation" }
  | { name: "custom"; template: Template; sequence: Shift[] }
  | { name: "anchor"; template: Template; sequence: Shift[] };

const designMonth = new Date(2026, 8, 1);
const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

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

export function DesignOnboarding({ variants }: { variants: DesignVariants }) {
  const themeStyle = useThemeStyle();
  const [finished, setFinished] = useState<{
    patternKeys: Shift[];
    rule?: RepeatRule;
  }>();
  const [schedule, setSchedule] = useState<Schedule>({});

  function finish({ patternKeys, sequence, anchor }: WorkSetup) {
    setSchedule(startSchedule(sequence, anchor));
    setFinished({
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
          schedule={schedule}
          variants={variants}
        />
        <button
          className="ob-restart"
          onClick={() => setFinished(undefined)}
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
        <WorkSetupSteps finishLabel="はじめる" onFinish={finish} />
      </div>
      <div aria-hidden="true" className="dc-home-indicator" />
    </div>
  );
}

// The questions from onboarding, also used when changing jobs. Without
// `onExit` it is the first run and greets the person.
export function WorkSetupSteps({
  month = designMonth,
  finishLabel,
  onExit,
  onFinish,
}: {
  month?: Date;
  finishLabel: string;
  onExit?: () => void;
  onFinish: (setup: WorkSetup) => void;
}) {
  const [step, setStep] = useState<Step>({ name: "kind" });

  function chooseRotation(template: Template) {
    if (template.custom) {
      setStep({ name: "custom", template, sequence: [] });
    } else if (template.weekly && template.sequence) {
      // Any Sunday works as the first day of a week-based sequence.
      onFinish({
        patternKeys: template.patternKeys,
        sequence: template.sequence,
        anchor: addDays(month, -month.getDay()),
      });
    } else if (template.sequence) {
      setStep({ name: "anchor", template, sequence: template.sequence });
    }
  }

  return (
    <>
      {step.name === "kind" && (
        <KindStep
          onBack={onExit}
          onRoster={() => setStep({ name: "roster" })}
          onRotation={() => setStep({ name: "rotation" })}
        />
      )}
      {step.name === "roster" && (
        <TemplateStep
          onBack={() => setStep({ name: "kind" })}
          onChoose={(template) =>
            onFinish({ patternKeys: template.patternKeys })
          }
          templates={rosterTemplates}
          title="近い働き方を選んでください"
        />
      )}
      {step.name === "rotation" && (
        <TemplateStep
          onBack={() => setStep({ name: "kind" })}
          onChoose={chooseRotation}
          templates={rotationTemplates}
          title="どんな順番で回りますか？"
        />
      )}
      {step.name === "custom" && (
        <CustomStep
          initialSequence={step.sequence}
          onBack={() => setStep({ name: "rotation" })}
          onNext={(sequence) =>
            setStep({ name: "anchor", template: step.template, sequence })
          }
          template={step.template}
        />
      )}
      {step.name === "anchor" && (
        <AnchorStep
          finishLabel={finishLabel}
          month={month}
          onBack={() =>
            setStep(
              step.template.custom
                ? {
                    name: "custom",
                    template: step.template,
                    sequence: step.sequence,
                  }
                : { name: "rotation" }
            )
          }
          onStart={(anchor) =>
            onFinish({
              patternKeys: step.template.patternKeys,
              sequence: step.sequence,
              anchor,
            })
          }
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
  onBack,
  onRoster,
  onRotation,
}: {
  onBack?: () => void;
  onRoster: () => void;
  onRotation: () => void;
}) {
  const first = !onBack;
  return (
    <>
      {first && <p className="ob-welcome">ポチカルへようこそ</p>}
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
            onClick={() => onChoose(template)}
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
        onClick={() => onNext(sequence)}
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
      <div className="ob-days">
        {weekdayLabels.map((label) => (
          <span aria-hidden="true" className="ob-weekday" key={label}>
            {label}
          </span>
        ))}
        {monthDates(viewMonth).map((date) => {
          const outside = date.getMonth() !== viewMonth.getMonth();
          return (
            <button
              aria-label={`${formatDay(date)}を「${first}」の日にする`}
              aria-pressed={
                anchor !== undefined && dateKey(date) === dateKey(anchor)
              }
              className={`${outside ? "ob-outside" : ""} ${weekendClassName(date)}`}
              key={dateKey(date)}
              onClick={() => setAnchor(date)}
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
