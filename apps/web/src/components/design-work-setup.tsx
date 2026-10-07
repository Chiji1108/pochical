import { rosterTemplates, rotationTemplates } from "@pochical/design/patterns";
import type { JobTemplate } from "@pochical/design/patterns";
import { useState } from "react";
import { css, cva } from "styled-system/css";

import { addDays, formatDay } from "../lib/design-days";
import {
  PatternsContext,
  presetPatterns,
  usePatterns,
} from "../lib/design-patterns";
import type { PresetShift, Shift } from "../lib/design-patterns";
import { designMonth } from "../lib/design-today";
import { MonthPicker } from "./design-date-picker";
import { BackButton } from "./design-header";
import {
  RepeatSequenceEditor,
  SequenceTiles,
  ShiftPreview,
} from "./design-repeat-editor";
import { KeysPreview } from "./design-shift-input";
import { Button, OptionCard, optionList, pushToBottom } from "./design-ui";

type Template = JobTemplate;

export type Step =
  | { name: "kind" }
  | { name: "roster" }
  | { name: "rotation" }
  | { name: "custom"; template: Template; sequence: Shift[] }
  | { name: "anchor"; template: Template; sequence: Shift[] };

// What the setup questions end with: the patterns to use, and for work
// that repeats, the order and a day that falls on its first shift.
export type WorkSetup = {
  patternKeys: PresetShift[];
  sequence?: Shift[];
  anchor?: Date;
};

// The template's shifts under its title, inside the option's button.
// A template's order or keys, under its note.
const templateChips = css({ marginTop: "8px" });

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
          note="勤務表・シフト表・店長からの連絡など"
          onClick={onRoster}
          title="シフトがその都度決まる"
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
  templates: readonly Template[];
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
              // An order's days, or the keys a roster's work gives.
              <div className={templateChips}>
                {template.sequence ? (
                  <SequenceTiles
                    sequence={template.sequence}
                    weekly={template.weekly}
                  />
                ) : (
                  <KeysPreview patternKeys={template.patternKeys} />
                )}
              </div>
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
