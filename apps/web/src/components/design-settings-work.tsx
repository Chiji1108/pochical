import { ArrowRight } from "lucide-react";
import { useState } from "react";

import {
  addDays,
  dateKey,
  defaultHolidaysOff,
  formatDay,
  holidayShiftOf,
  isRepeating,
} from "../lib/design-days";
import type { RepeatRule, Schedule } from "../lib/design-days";
import { presetList, usePatterns } from "../lib/design-patterns";
import type { Pattern, Shift } from "../lib/design-patterns";
import { useUser } from "../lib/design-user-store";
import { InputDatePicker } from "./design-date-picker";
import { DoneButton, PageHeader } from "./design-header";
import { List, ListRow, SwitchRow, Toggle } from "./design-list";
import {
  OrderTitle,
  RepeatCalendar,
  SequenceTiles,
} from "./design-repeat-editor";
import {
  ListSection,
  nextMonthStart,
  sequenceLabel,
  settingsParts,
  shortDay,
} from "./design-settings-parts";
import { ConfirmDialog } from "./design-sheet";
import { Button, fieldLabel, Note } from "./design-ui";
import { WorkSetupSteps } from "./design-work-setup";

// The pages about how someone works: a repeating order and its history,
// changing jobs, and switching to a roster.

// The order in use and what can change about it: a new one from a day,
// the one in use corrected, or no order from a day.
function RepeatDetails({
  current,
  onNew,
  onFix,
  onStop,
  onHolidaysOff,
}: {
  current: RepeatRule;
  onNew: () => void;
  onFix: () => void;
  onStop: () => void;
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
        <SequenceTiles sequence={current.sequence} />
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
      <Button variant="text" onClick={onStop}>
        繰り返しをやめる
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

// Each way's page, and what its 完了 asks before the days change.
const repeatModes: Record<
  RepeatMode,
  { title: string; action: string; question: string; message: string }
> = {
  first: {
    action: "繰り返す",
    message:
      "この日から、並びのとおりにシフトが入ります。前の日までのシフトは、そのまま残ります。",
    question: "から繰り返しますか？",
    title: "繰り返しを設定",
  },
  fix: {
    action: "入れ直す",
    message:
      "並びのとおりにシフトを入れ直します。その間に自分で直した日も、並びのとおりに戻ります。",
    question: "から入れ直しますか？",
    title: "今の繰り返しを直す",
  },
  switch: {
    action: "切り替える",
    message:
      "この日から、新しい並びのとおりにシフトが入ります。前の日までのシフトは、そのまま残ります。",
    question: "から切り替えますか？",
    title: "新しい繰り返し",
  },
};

// Sets an order on the calendar, filling the screen as ポチポチ入力 does.
// A new one starts on its 1st day, the days before it staying; fixing
// keeps the rule's start and moves only the day the order counts from, so
// no gap opens before it.
export function RepeatEditorPage({
  mode,
  current,
  initialSequence,
  patternKeys,
  shown,
  onBack,
  onApply,
}: {
  mode: RepeatMode;
  current?: RepeatRule;
  initialSequence: Shift[];
  patternKeys: Shift[];
  // The days as they show now, for those the order leaves.
  shown: Schedule;
  onBack: () => void;
  onApply: (rule: RepeatRule) => void;
}) {
  const book = usePatterns();
  const patterns = useUser((state) => state.patterns);
  const fixing = mode === "fix" && current !== undefined;
  const text = repeatModes[mode];
  const [order, setOrder] = useState(() => ({
    anchor: fixing ? (current.anchor ?? current.start) : nextMonthStart(),
    sequence: initialSequence,
  }));
  const { anchor, sequence } = order;
  const start = fixing ? current.start : anchor;
  // Follows the order until the person sets it.
  const [holidaysChoice, setHolidaysChoice] = useState(
    fixing ? current.holidaysOff : undefined
  );
  const holidaysOff =
    holidaysChoice ?? defaultHolidaysOff(sequence, anchor, book);
  const rule: RepeatRule = { anchor, holidaysOff, sequence, start };
  const [confirming, setConfirming] = useState(false);
  return (
    <div className={settingsParts.fullPage}>
      <PageHeader
        back="働き方"
        inlineTitle={
          <OrderTitle anchor={anchor} sequence={sequence} title={text.title} />
        }
        onBack={onBack}
        trailing={
          <DoneButton
            disabled={sequence.length === 0}
            onClick={() => {
              setConfirming(true);
            }}
          />
        }
      />
      <RepeatCalendar
        accessory={
          <span className={settingsParts.holidays}>
            <span aria-hidden="true">祝日は休み</span>
            <Toggle
              checked={holidaysOff}
              label="祝日は休みにする"
              onChange={setHolidaysChoice}
            />
          </span>
        }
        anchor={anchor}
        before={shown}
        from={fixing ? current.start : undefined}
        holidayShift={holidaysOff ? holidayShiftOf(patterns) : undefined}
        onChange={setOrder}
        patternKeys={patternKeys}
        sequence={sequence}
      />
      {confirming && (
        <ConfirmDialog
          action={text.action}
          message={text.message}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            onApply(rule);
          }}
          title={`${shortDay(start)}${text.question}`}
        />
      )}
    </div>
  );
}

// Changing jobs: the day it happens, then the same questions as onboarding.
// Shifts before that day stay; everything after follows the new job.
export function JobChangePage({
  onBack,
  onApply,
  onOrdering,
}: {
  onBack: () => void;
  onApply: (job: { patterns: Pattern[]; rule: RepeatRule }) => void;
  // Told when the order's calendar comes and goes, as it takes the
  // screen from the tab bar.
  onOrdering: (ordering: boolean) => void;
}) {
  const [start, setStart] = useState(nextMonthStart);
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <div className={settingsParts.job}>
        <WorkSetupSteps
          confirm={{
            action: "切り替える",
            message:
              "前の日までのシフトは、そのまま残ります。この日からのシフトは、新しい仕事に合わせて入れ直します。",
            title: `${shortDay(start)}から新しい仕事にしますか？`,
          }}
          from={start}
          month={start}
          onOrdering={onOrdering}
          onExit={() => {
            setAsking(false);
          }}
          onFinish={({ patternKeys, sequence, anchor }) => {
            onOrdering(false);
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

// Whether shifts repeat is all that tells ways of working apart: someone
// whose shifts repeat still changes a day with ポチポチ入力. So there is no
// work style to pick, only an order to set, change or stop, and a new job,
// which asks for the shift patterns again as onboarding does.
export function WorkStylePage({
  rules,
  onBack,
  onRepeat,
  onStop,
  onJob,
  onNew,
  onFix,
  onHolidaysOff,
}: {
  rules: RepeatRule[];
  onBack: () => void;
  onRepeat: () => void;
  onStop: () => void;
  onJob: () => void;
  onNew: () => void;
  onFix: () => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
}) {
  const current = rules.at(-1);
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="働き方" />
      {isRepeating(rules) && current ? (
        <RepeatDetails
          current={current}
          onFix={onFix}
          onHolidaysOff={onHolidaysOff}
          onNew={onNew}
          onStop={onStop}
        />
      ) : (
        <>
          <ListSection title="繰り返し">
            <ListRow
              label="繰り返しを設定する"
              onClick={onRepeat}
              value="なし"
            />
          </ListSection>
          <Note>
            当番・非番や交代勤務のように順番で回るシフトを、カレンダーに自動で入れられます。違う日だけ、カレンダーで変えられます。
          </Note>
        </>
      )}
      <ListSection title="仕事">
        <ListRow
          detail="シフトパターンも選び直す"
          label="新しい仕事にする"
          onClick={onJob}
        />
      </ListSection>
      <RuleHistory rules={rules} />
    </>
  );
}

// Stopping the repeat from a chosen day. Earlier shifts stay as they are.
export function StopRepeatPage({
  onBack,
  onApply,
}: {
  onBack: () => void;
  onApply: (start: Date) => void;
}) {
  const [start, setStart] = useState(nextMonthStart);
  return (
    <>
      <PageHeader back="働き方" onBack={onBack} title="繰り返しをやめる" />
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
        {shortDay(start)}から繰り返しをやめる
        <ArrowRight aria-hidden="true" size={16} />
      </Button>
    </>
  );
}
