import { useState } from "react";
import { css, cva } from "styled-system/css";

import { addDays, formatDay } from "../lib/design-days";
import {
  PatternsContext,
  presetPatterns,
  usePatterns,
} from "../lib/design-patterns";
import type { PresetShift, Shift } from "../lib/design-patterns";
import { MonthPicker } from "./design-date-picker";
import { RepeatSequenceEditor, ShiftPreview } from "./design-repeat-editor";
import {
  BackButton,
  Button,
  OptionCard,
  optionList,
  pushToBottom,
  Tag,
} from "./design-ui";
import { ShiftMark } from "./shift-mark";

type Template = {
  id: string;
  title: string;
  note: string;
  patternKeys: PresetShift[];
  // Present only for work that repeats in a fixed order.
  sequence?: PresetShift[];
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

export const rotationTemplates: Template[] = [
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

export type Step =
  | { name: "kind" }
  | { name: "roster" }
  | { name: "rotation" }
  | { name: "custom"; template: Template; sequence: Shift[] }
  | { name: "anchor"; template: Template; sequence: Shift[] };

export const designMonth = new Date(2026, 8, 1);

// What the setup questions end with: the patterns to use, and for work
// that repeats, the order and a day that falls on its first shift.
export type WorkSetup = {
  patternKeys: PresetShift[];
  sequence?: Shift[];
  anchor?: Date;
};

// The template's shifts under its title, inside the option's button.
const templateChips = css({
  display: "flex",
  flexWrap: "wrap",
  gap: "4px",
  marginTop: "4px",
});

// The first run, in the phone: a welcome with the app's poodle, then a
// step at a time, each a heading with what it asks, its answers, and its
// main button at the foot.
export const onboarding = {
  actions: css({ display: "flex", flexDirection: "column", gap: "4px" }),
  back: css({ marginBottom: "8px" }),
  content: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "20px",
    minHeight: 0,
    overflowY: "auto",
    padding: "20px 8px 12px",
  }),
  description: css({
    color: "text.tertiary",
    margin: "8px 0 0",
    textStyle: "subheadline",
  }),
  // Once started, the page shows the calendar it made, with a way back to
  // the start under it.
  finished: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
  }),
  finishedNote: css({
    color: "text.tertiary",
    lineHeight: 1.6,
    margin: "12px 0 0",
    maxWidth: "340px",
    textAlign: "center",
    textStyle: "footnote",
  }),
  footnote: css({
    color: "text.quaternary",
    margin: "auto 0 0",
    textAlign: "center",
    textStyle: "caption",
  }),
  intro: css({
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "12px",
    justifyContent: "center",
    padding: "0 12px",
    textAlign: "center",
  }),
  lead: css({
    color: "text.tertiary",
    lineHeight: 1.7,
    margin: 0,
    textStyle: "body",
  }),
  name: css({
    fontSize: "24px",
    fontWeight: 700,
    lineHeight: 1.4,
    margin: "8px 0 0",
  }),
  // Each phrase stays whole, so the line breaks after the comma.
  phrase: css({ display: "inline-block" }),
  // In light, the scan's black lines on white paper are multiplied into
  // the ground, brightened first so its slightly gray paper turns white
  // and no square shows around the dog. In dark, the dark home screen's
  // dog is drawn into a box of its own.
  poodle: cva({
    base: { height: "200px", margin: "-24px 0 -20px", width: "200px" },
    defaultVariants: { dark: false },
    variants: {
      dark: {
        false: {
          filter: "brightness(1.12) contrast(1.2)",
          mixBlendMode: "multiply",
        },
        true: { display: "block" },
      },
    },
  }),
  previewLabel: css({
    color: "text.tertiary",
    margin: "0 0 -12px",
    textStyle: "caption",
  }),
  restart: css({
    bg: "transparent",
    border: "1px solid token(colors.border.default)",
    borderRadius: "full",
    color: "accent.default",
    marginTop: "12px",
    minHeight: "40px",
    padding: "0 16px",
    textStyle: "footnote",
  }),
  title: css({
    fontWeight: 600,
    lineHeight: 1.45,
    margin: 0,
    textStyle: "title2",
  }),
  welcome: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    justifyContent: "space-between",
  }),
};

// The questions from onboarding, also used when changing jobs. Without
// `onExit` it is the first run and greets the person.
export function WorkSetupSteps({
  month = designMonth,
  finishLabel,
  onExit,
  onBack,
  onFinish,
  initialStep,
}: {
  month?: Date;
  finishLabel: string;
  onExit?: () => void;
  // Back from the first question on the first run, to the welcome.
  onBack?: () => void;
  onFinish: (setup: WorkSetup) => void;
  initialStep?: Step;
}) {
  const [step, setStep] = useState<Step>(initialStep ?? { name: "kind" });

  // The templates' patterns are ready-made ones, drawn as they come even
  // when the person has their own under the same ids.
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
    <PatternsContext value={presetPatterns}>
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
    </PatternsContext>
  );
}

export function StepHeader({
  onBack,
  title,
  description,
}: {
  onBack?: () => void;
  title: string;
  description?: string;
}) {
  return (
    <header>
      {onBack && (
        <BackButton
          aria-label="戻る"
          className={onboarding.back}
          onClick={onBack}
        />
      )}
      <h3 className={onboarding.title}>{title}</h3>
      {description && <p className={onboarding.description}>{description}</p>}
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
      <div className={optionList}>
        <OptionCard
          icon="📋"
          note="看護・介護・飲食など"
          onClick={onRoster}
          title="毎月、勤務表が配られる"
        />
        <OptionCard
          icon="🔁"
          note="消防・工場の交代勤務・曜日で固定など"
          onClick={onRotation}
          title="決まった順番で回っている"
        />
      </div>
      {first && (
        <p className={onboarding.footnote}>あとから設定で変えられます</p>
      )}
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
      <div className={optionList}>
        {templates.map((template) => (
          <OptionCard
            key={template.id}
            note={template.note}
            onClick={() => {
              onChoose(template);
            }}
            title={template.title}
          >
            {!template.custom && (
              <span aria-hidden="true" className={templateChips}>
                {(template.sequence ?? template.patternKeys).map(
                  (key, index) => (
                    // oxlint-disable-next-line react/no-array-index-key -- a sequence repeats the same shift, so position is its identity.
                    <Tag key={index} size="sm" tone="raised">
                      <ShiftMark shift={key} size={11} />
                      {presetPatterns[key].name}
                    </Tag>
                  )
                )}
              </span>
            )}
          </OptionCard>
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
      <Button
        variant="primary"
        className={pushToBottom}
        disabled={sequence.length === 0}
        onClick={() => {
          onNext(sequence);
        }}
      >
        次へ
      </Button>
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
  const [anchor, setAnchor] = useState<Date>();
  const first = usePatterns()[sequence[0]]?.name;
  return (
    <>
      <StepHeader
        description="今日でも、これからの日でも大丈夫です。"
        onBack={onBack}
        title={`「${first}」の日を1日選んでください`}
      />
      <MonthPicker month={month} onSelect={setAnchor} value={anchor} />
      {anchor && (
        <p className={onboarding.previewLabel}>
          {formatDay(anchor)}からの2週間
        </p>
      )}
      {anchor && (
        <ShiftPreview
          days={Array.from({ length: 14 }, (_, index) => ({
            date: addDays(anchor, index),
            shift: sequence[index % sequence.length],
          }))}
          label="最初の2週間"
        />
      )}
      <Button
        variant="primary"
        className={pushToBottom}
        disabled={!anchor}
        onClick={() => anchor && onStart(anchor)}
      >
        {finishLabel}
      </Button>
    </>
  );
}
