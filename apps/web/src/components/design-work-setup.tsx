import { rosterTemplates, rotationTemplates } from "@pochical/design/patterns";
import type { JobTemplate } from "@pochical/design/patterns";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { css, cva, cx } from "styled-system/css";

import { addDays } from "../lib/design-days";
import {
  PatternsContext,
  presetPatterns,
  usePatterns,
} from "../lib/design-patterns";
import type { PresetShift, Shift } from "../lib/design-patterns";
import { designMonth } from "../lib/design-today";
import { BackButton, DoneButton, PageHeader } from "./design-header";
import { List, ListRow, listRow } from "./design-list";
import {
  OrderTitle,
  RepeatCalendar,
  SequenceTiles,
} from "./design-repeat-editor";
import { ConfirmDialog } from "./design-sheet";
import { KeysPreview } from "./design-shift-input";
import { OptionCard, optionList } from "./design-ui";

type Template = JobTemplate;

export type Step =
  | { name: "kind" }
  | { name: "roster" }
  | { name: "rotation" }
  | { name: "order"; template: Template };

// What a page's 完了 asks before days already there change.
type Confirm = { title: string; message: string; action: string };

// What the setup questions end with: the patterns to use, and for work
// that repeats, the order and a day that falls on its first shift.
export type WorkSetup = {
  patternKeys: PresetShift[];
  sequence?: Shift[];
  anchor?: Date;
};

// A template's order or keys, under its note.
const templateChips = css({ marginTop: "8px" });

// In settings the answers are a list's rows, as the pages around them
// are; the first run, with no list around it, keeps big cards.
const answerRow = {
  emoji: css({ fontFamily: "emoji", fontSize: "20px", lineHeight: 1 }),
  note: css({ color: "text.tertiary", textStyle: "caption" }),
  // A template's row grows to its order or keys, padded like a two-line
  // row.
  template: css({ paddingBlock: "12px" }),
  text: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  }),
};

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
  from = null,
  confirm,
  onExit,
  onBack,
  onFinish,
  initialStep,
  onOrdering,
}: {
  month?: Date;
  // The day the order starts on, as a new job's first day; a first run's
  // covers every day.
  from?: Date | null;
  // What 完了 asks before the order takes over, when days already there
  // will change; a first run has none.
  confirm?: Confirm;
  onExit?: () => void;
  // Back from the first question on the first run, to the welcome.
  onBack?: () => void;
  onFinish: (setup: WorkSetup) => void;
  initialStep?: Step;
  // Told when the order's calendar comes and goes, which in settings
  // takes the screen from the tab bar.
  onOrdering?: (ordering: boolean) => void;
}) {
  const [step, setStep] = useState<Step>(initialStep ?? { name: "kind" });
  const goTo = (next: Step) => {
    setStep(next);
    onOrdering?.(next.name === "order");
  };

  // The templates' patterns are ready-made ones, drawn as they come even
  // when the person has their own under the same ids.
  function chooseRotation(template: Template) {
    if (template.weekly && template.sequence) {
      // Any Sunday works as the first day of a week-based sequence.
      onFinish({
        anchor: addDays(month, -month.getDay()),
        patternKeys: template.patternKeys,
        sequence: template.sequence,
      });
    } else {
      goTo({ name: "order", template });
    }
  }

  return (
    <PatternsContext value={presetPatterns}>
      {step.name === "kind" && (
        <KindStep
          first={!onExit}
          onBack={onExit ?? onBack}
          onRoster={() => {
            goTo({ name: "roster" });
          }}
          onRotation={() => {
            goTo({ name: "rotation" });
          }}
        />
      )}
      {step.name === "roster" && (
        <TemplateStep
          onBack={() => {
            goTo({ name: "kind" });
          }}
          onChoose={(template) => {
            onFinish({ patternKeys: template.patternKeys });
          }}
          rows={Boolean(onExit)}
          templates={rosterTemplates}
          title="近い働き方を選んでください"
        />
      )}
      {step.name === "rotation" && (
        <TemplateStep
          onBack={() => {
            goTo({ name: "kind" });
          }}
          onChoose={chooseRotation}
          rows={Boolean(onExit)}
          templates={rotationTemplates}
          title="どんな順番で回りますか？"
        />
      )}
      {step.name === "order" && (
        <OrderStep
          confirm={confirm}
          from={from}
          month={month}
          onBack={() => {
            goTo({ name: "rotation" });
          }}
          onStart={(order) => {
            onFinish({ ...order, patternKeys: step.template.patternKeys });
          }}
          template={step.template}
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

// The one question that tells ways of working apart: whether shifts
// repeat. Someone whose shifts repeat still changes a day with ポチポチ入力,
// so yes comes first, as the answer that sets up more.
const kinds = [
  {
    icon: "🔁",
    id: "rotation",
    note: "当番・非番、工場の交代勤務、曜日で固定など",
    title: "繰り返しがある",
  },
  {
    icon: "📋",
    id: "roster",
    note: "勤務表やシフト表で、その都度決まる",
    title: "繰り返しはない",
  },
] as const;

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
            ? "繰り返しがあっても、違う日だけポチポチ入力で変えられます。"
            : "前の仕事のシフトは、そのまま残ります。"
        }
        onBack={onBack}
        title={
          first
            ? "シフトに繰り返しはありますか？"
            : "新しい仕事のシフトに繰り返しはありますか？"
        }
      />
      {first ? (
        <div className={optionList}>
          {kinds.map((kind) => (
            <OptionCard
              icon={kind.icon}
              key={kind.id}
              note={kind.note}
              onClick={kind.id === "roster" ? onRoster : onRotation}
              title={kind.title}
            />
          ))}
        </div>
      ) : (
        <List>
          {kinds.map((kind) => (
            <ListRow
              detail={kind.note}
              key={kind.id}
              label={kind.title}
              leading={
                <span aria-hidden="true" className={answerRow.emoji}>
                  {kind.icon}
                </span>
              }
              onClick={kind.id === "roster" ? onRoster : onRotation}
            />
          ))}
        </List>
      )}
      {first && (
        <p className={onboarding.footnote}>あとから設定で変えられます</p>
      )}
    </>
  );
}

// A template's order's days, or the keys a roster's work gives.
function TemplatePreview({ template }: { template: Template }) {
  if (template.custom) {
    return null;
  }
  return (
    <div className={templateChips}>
      {template.sequence ? (
        <SequenceTiles sequence={template.sequence} weekly={template.weekly} />
      ) : (
        <KeysPreview patternKeys={template.patternKeys} />
      )}
    </div>
  );
}

function TemplateStep({
  title,
  templates,
  rows,
  onBack,
  onChoose,
}: {
  title: string;
  templates: readonly Template[];
  rows: boolean;
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
      {rows ? (
        <List>
          {templates.map((template) => (
            // Drawn by hand: the order or keys go under the note.
            <button
              className={cx(
                listRow.root,
                listRow.pressable,
                answerRow.template
              )}
              data-list-row=""
              key={template.id}
              onClick={() => {
                onChoose(template);
              }}
              type="button"
            >
              <span className={answerRow.text}>
                {template.title}
                <small className={answerRow.note}>{template.note}</small>
                <TemplatePreview template={template} />
              </span>
              <ChevronRight
                aria-hidden="true"
                className={listRow.arrow}
                size={17}
              />
            </button>
          ))}
        </List>
      ) : (
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
              <TemplatePreview template={template} />
            </OptionCard>
          ))}
        </div>
      )}
    </>
  );
}

// The order on the calendar: a kind of work's own, from its first day
// as it falls, or one typed from nothing. Either is typed over as
// ポチポチ入力 enters days, and the day pressed moves where it starts.
function OrderStep({
  template,
  month,
  from,
  confirm,
  onBack,
  onStart,
}: {
  template: Template;
  month: Date;
  from: Date | null;
  confirm?: Confirm;
  onBack: () => void;
  onStart: (order: { sequence: Shift[]; anchor: Date }) => void;
}) {
  const [order, setOrder] = useState<{ anchor: Date; sequence: Shift[] }>(
    () => ({ anchor: from ?? month, sequence: template.sequence ?? [] })
  );
  const [confirming, setConfirming] = useState(false);
  const first = usePatterns()[template.sequence?.[0] ?? ""]?.name;
  return (
    <>
      {/* A bar's title, as the settings' order pages, leaving the
      screen to the month and its keys. */}
      <PageHeader
        inlineTitle={
          <OrderTitle
            anchor={order.anchor}
            sequence={order.sequence}
            title={
              template.custom || first === undefined
                ? "並びを入れる"
                : `「${first}」の日を押す`
            }
          />
        }
        onBack={onBack}
        trailing={
          <DoneButton
            disabled={order.sequence.length === 0}
            onClick={() => {
              if (confirm) {
                setConfirming(true);
              } else {
                onStart(order);
              }
            }}
          />
        }
      />
      <RepeatCalendar
        anchor={order.anchor}
        from={from}
        onChange={setOrder}
        patternKeys={template.patternKeys}
        sequence={order.sequence}
      />
      {confirming && confirm && (
        <ConfirmDialog
          action={confirm.action}
          message={confirm.message}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            onStart(order);
          }}
          title={confirm.title}
        />
      )}
    </>
  );
}
