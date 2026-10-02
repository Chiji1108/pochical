import { ArrowRight } from "lucide-react";
import { useState } from "react";

import {
  addDays,
  dateKey,
  defaultHolidaysOff,
  formatDay,
  holidayShiftOf,
  isRepeating,
  repeatSchedule,
} from "../lib/design-days";
import type { RepeatRule } from "../lib/design-days";
import { presetList, usePatterns } from "../lib/design-patterns";
import type { Pattern, Shift } from "../lib/design-patterns";
import { useUser } from "../lib/design-user-store";
import { InputDatePicker } from "./design-date-picker";
import { RepeatSequenceEditor, ShiftPreview } from "./design-repeat-editor";
import {
  ListSection,
  nextMonthStart,
  previewDays,
  sequenceLabel,
  settingsParts,
  shortDay,
} from "./design-settings-parts";
import {
  Button,
  ChipGroup,
  fieldLabel,
  List,
  ListRow,
  Note,
  PageHeader,
  SwitchRow,
  Tag,
} from "./design-ui";
import { WorkSetupSteps } from "./design-work-setup";
import { ShiftMark } from "./shift-mark";

// The pages about how someone works: a repeating order and its history,
// changing jobs, and switching to a roster.

function SequenceChips({ sequence }: { sequence: Shift[] }) {
  const book = usePatterns();
  return (
    <ChipGroup as="ol">
      {sequence.map((shift, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a sequence repeats the same shift, so position is its identity.
        <Tag as="li" key={index} tone="raised">
          <ShiftMark shift={shift} size={13} />
          {book[shift]?.name}
        </Tag>
      ))}
    </ChipGroup>
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
      <div className={settingsParts.card}>
        <p className={settingsParts.cardLabel}>
          今の繰り返し
          <span className={settingsParts.cardCount}>
            {current.sequence.length}日ごと
          </span>
        </p>
        <SequenceChips sequence={current.sequence} />
        <p className={settingsParts.cardMeta}>{formatDay(current.start)}から</p>
      </div>
      <List>
        <SwitchRow
          checked={current.holidaysOff ?? false}
          label="祝日は休みにする"
          onChange={onHolidaysOff}
        />
      </List>
      <Button variant="primary" onClick={onNew}>
        新しい繰り返しにする
      </Button>
      <Button variant="text" onClick={onFix}>
        今の繰り返しを直す
      </Button>
      <Note>
        異動などで順番が変わるときは、切り替える日を選んで新しい繰り返しにします。それより前のシフトは、そのまま残ります。
      </Note>
    </>
  );
}

function RuleHistory({ rules }: { rules: RepeatRule[] }) {
  const book = usePatterns();
  return (
    <>
      {rules.length > 1 && (
        <ListSection title="これまで">
          {rules
            .map((rule, index) => {
              const next = rules[index + 1];
              const period = next
                ? `${shortDay(rule.start)}〜${shortDay(addDays(next.start, -1))}`
                : `${shortDay(rule.start)}〜`;
              return (
                <ListRow
                  key={dateKey(rule.start)}
                  label={period}
                  value={
                    rule.sequence.length > 0
                      ? sequenceLabel(rule.sequence, book)
                      : "繰り返しなし"
                  }
                />
              );
            })
            .reverse()}
        </ListSection>
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
export function RepeatEditorPage({
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
  const book = usePatterns();
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
  const holidaysOff = holidaysChoice ?? defaultHolidaysOff(sequence, day, book);
  const rule: RepeatRule = { anchor: day, holidaysOff, sequence, start };
  return (
    <>
      <PageHeader back={text.back} onBack={onBack} title={text.title} />
      <div className={settingsParts.field}>
        <span className={fieldLabel({ place: "row" })}>{text.dayLabel}</span>
        <InputDatePicker
          ariaLabel={`${text.dayLabel}：${formatDay(day)}。タップで変更`}
          look="field"
          date={day}
          onSelect={setDay}
          title={text.dayLabel}
        >
          <span>{formatDay(day)}</span>
        </InputDatePicker>
      </div>
      <RepeatSequenceEditor
        onChange={setSequence}
        patternKeys={patternKeys}
        sequence={sequence}
      />
      <Note>
        {fixing
          ? "並びの1つ目のシフトが入る日を選びます。"
          : `${text.dayLabel}が、並びの1日目になります。`}
      </Note>
      <List>
        <SwitchRow
          checked={holidaysOff}
          label="祝日は休みにする"
          onChange={setHolidaysChoice}
        />
      </List>
      {sequence.length > 0 && <RepeatPreview rule={rule} />}
      {fixing && (
        <Note>
          {formatDay(start)}
          からのシフトを入れ直します。その間に自分で直した日も、並びのとおりに戻ります。
        </Note>
      )}
      <Button
        variant="primary"
        disabled={sequence.length === 0}
        onClick={() => {
          onApply(rule);
        }}
      >
        {shortDay(start)}
        {text.action}
        <ArrowRight aria-hidden="true" size={16} />
      </Button>
    </>
  );
}

// The first two weeks of a rule, from its start.
function RepeatPreview({ rule }: { rule: RepeatRule }) {
  const { sequence, start, holidaysOff } = rule;
  const patterns = useUser((state) => state.patterns);
  const planned = repeatSchedule(
    sequence,
    rule.anchor ?? start,
    start,
    addDays(start, previewDays - 1),
    holidaysOff ? holidayShiftOf(patterns) : undefined
  );
  return (
    <ShiftPreview
      days={Array.from({ length: previewDays }, (_, index) => {
        const date = addDays(start, index);
        return { date, shift: planned[dateKey(date)]?.shift };
      })}
      label="はじめの2週間"
    />
  );
}

// Changing jobs: the day it happens, then the same questions as onboarding.
// Shifts before that day stay; everything after follows the new job.
export function JobChangePage({
  onBack,
  onApply,
}: {
  onBack: () => void;
  onApply: (job: { patterns: Pattern[]; rule: RepeatRule }) => void;
}) {
  const [start, setStart] = useState(nextMonthStart);
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <div className={settingsParts.job}>
        <WorkSetupSteps
          finishLabel={`${shortDay(start)}から切り替える`}
          month={start}
          onExit={() => {
            setAsking(false);
          }}
          onFinish={({ patternKeys, sequence, anchor }) => {
            onApply({
              patterns: presetList(patternKeys),
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
      <PageHeader back="働き方" onBack={onBack} title="新しい仕事にする" />
      <Note>
        新しい仕事の働き方とシフトパターンを、はじめの設定と同じ質問で選び直します。
      </Note>
      <div className={settingsParts.field}>
        <span className={fieldLabel({ place: "row" })}>新しい仕事の初日</span>
        <InputDatePicker
          ariaLabel={`新しい仕事の初日：${formatDay(start)}。タップで変更`}
          look="field"
          date={start}
          onSelect={setStart}
          title="新しい仕事の初日"
        >
          <span>{formatDay(start)}</span>
        </InputDatePicker>
      </div>
      <Note>
        前の日までのシフトは、そのまま残ります。この日からのシフトは、新しい仕事に合わせて入れ直します。
      </Note>
      <Button
        variant="primary"
        onClick={() => {
          setAsking(true);
        }}
      >
        次へ
        <ArrowRight aria-hidden="true" size={16} />
      </Button>
    </>
  );
}

const workStyles = {
  repeating: { icon: "🔁", name: "決まった順番で回っている" },
  // Not 毎月、勤務表が配られる: rosters come every three months, or
  // whenever the manager posts them, and all of them are this.
  roster: { icon: "📋", name: "シフトがその都度決まる" },
};

// The work style in use, then the ways to change it, each saying whether
// the shift patterns stay: the other style keeps them, a new job asks for
// them again as onboarding does. Unlike onboarding's two answers side by
// side, the one in use is not a choice to press again: it is shown as it
// is.
export function WorkStylePage({
  rules,
  onBack,
  onRepeat,
  onRoster,
  onJob,
  onNew,
  onFix,
  onHolidaysOff,
}: {
  rules: RepeatRule[];
  onBack: () => void;
  onRepeat: () => void;
  onRoster: () => void;
  onJob: () => void;
  onNew: () => void;
  onFix: () => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
}) {
  const repeating = isRepeating(rules);
  const current = rules.at(-1);
  const now = repeating ? workStyles.repeating : workStyles.roster;
  const other = repeating ? workStyles.roster : workStyles.repeating;
  const icon = (emoji: string) => (
    <>
      <span aria-hidden="true" className={settingsParts.styleIcon}>
        {emoji}
      </span>
    </>
  );
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="働き方" />
      <ListSection title="今の働き方">
        <ListRow label={now.name} leading={icon(now.icon)} />
      </ListSection>
      {repeating && current && (
        <RepeatDetails
          current={current}
          onFix={onFix}
          onHolidaysOff={onHolidaysOff}
          onNew={onNew}
        />
      )}
      <ListSection title="働き方を変える">
        <ListRow
          detail="シフトパターンはそのまま"
          label={
            repeating
              ? "順番で入れるのをやめる"
              : "決まった順番で回すようにする"
          }
          leading={icon(other.icon)}
          onClick={repeating ? onRoster : onRepeat}
        />
        <ListRow
          detail="シフトパターンも選び直す"
          label="新しい仕事にする"
          leading={icon("💼")}
          onClick={onJob}
        />
      </ListSection>
      <RuleHistory rules={rules} />
    </>
  );
}

// Stopping the repeat from a chosen day. Earlier shifts stay as they are.
export function RosterSwitchPage({
  onBack,
  onApply,
}: {
  onBack: () => void;
  onApply: (start: Date) => void;
}) {
  const [start, setStart] = useState(nextMonthStart);
  return (
    <>
      <PageHeader back="働き方" onBack={onBack} title="順番をやめる" />
      <div className={settingsParts.field}>
        <span className={fieldLabel({ place: "row" })}>やめる日</span>
        <InputDatePicker
          ariaLabel={`やめる日：${formatDay(start)}。タップで変更`}
          look="field"
          date={start}
          onSelect={setStart}
          title="やめる日"
        >
          <span>{formatDay(start)}</span>
        </InputDatePicker>
      </div>
      <Note>
        この日からの繰り返しのシフトは消えて、空いた状態になります。前の日までのシフトは、そのまま残ります。
      </Note>
      <Button
        variant="primary"
        onClick={() => {
          onApply(start);
        }}
      >
        {shortDay(start)}から順番をやめる
        <ArrowRight aria-hidden="true" size={16} />
      </Button>
    </>
  );
}
