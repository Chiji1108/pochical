import { ArrowRight, ChevronRight, CircleSlash } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";

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
import { designToday } from "../lib/design-today";
import { useUser } from "../lib/design-user-store";
import { InputDatePicker } from "./design-date-picker";
import { DoneButton, PageHeader } from "./design-header";
import { AddRow, List, ListRow, SwitchRow, Toggle } from "./design-list";
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
import { Button, fieldLabel, Note, Section } from "./design-ui";
import { WorkSetupSteps } from "./design-work-setup";

// 繰り返し's pages: the repeating order and its history, setting,
// correcting and stopping it; and 新しい仕事にする, opened from
// シフトパターン.

// One order on 繰り返し: its days and how often it comes round, at the
// head of a card of its own. The newest is the one to correct, so it alone
// opens the editor, and its 祝日は休みにする sits under it in the same
// card; the one in use before a later one starts is only shown.
function OrderCard({
  rule,
  period,
  onFix,
  children,
}: {
  rule: RepeatRule;
  period: string;
  onFix?: () => void;
  children?: ReactNode;
}) {
  const content = (
    <span className={orderCard.body}>
      <span className={settingsParts.cardLabel}>
        {period}
        <span className={settingsParts.cardCount}>
          {rule.sequence.length > 0
            ? `${rule.sequence.length}日ごと`
            : "繰り返しなし"}
        </span>
      </span>
      {rule.sequence.length > 0 ? (
        <SequenceTiles sequence={rule.sequence} />
      ) : (
        <span className={settingsParts.cardMeta}>
          この日から、カレンダーで1日ずつ入れます。
        </span>
      )}
    </span>
  );
  return (
    <List>
      {onFix ? (
        <button
          aria-label={`${period}の繰り返しを直す`}
          className={cx(orderCard.head, orderCard.pressable)}
          data-list-row=""
          onClick={onFix}
          type="button"
        >
          {content}
          <ChevronRight
            aria-hidden="true"
            className={orderCard.arrow}
            size={17}
          />
        </button>
      ) : (
        <div className={orderCard.head} data-list-row="">
          {content}
        </div>
      )}
      {children}
    </List>
  );
}

const orderCard = {
  arrow: css({ color: "text.quaternary", flexShrink: 0 }),
  body: css({
    "& > span": { display: "flex" },
    display: "block",
    flex: 1,
    minWidth: 0,
  }),
  head: css({
    alignItems: "center",
    color: "text.primary",
    display: "flex",
    gap: "12px",
    padding: "16px",
    position: "relative",
    textAlign: "left",
    width: "100%",
  }),
  pressable: css({
    _hover: { bg: "fill.tertiary" },
    bg: "transparent",
    border: 0,
    cursor: "pointer",
  }),
  // A section's cards, apart as lists are.
  stack: css({ display: "flex", flexDirection: "column", gap: "12px" }),
};

// When an order runs: from its start to the day before the next one.
function periodOf(rules: RepeatRule[], index: number) {
  const rule = rules[index];
  const next = rules[index + 1];
  return next
    ? `${shortDay(rule.start)}〜${shortDay(addDays(next.start, -1))}`
    : `${shortDay(rule.start)}から`;
}

// The orders before `until`, newest first, only to be read: the days
// they gave are the past's.
function PastOrders({ rules, until }: { rules: RepeatRule[]; until: number }) {
  const book = usePatterns();
  if (until <= 0) {
    return null;
  }
  return (
    <ListSection title="これまで">
      {rules
        .slice(0, until)
        .map((rule, index) => (
          <ListRow
            key={dateKey(rule.start)}
            label={periodOf(rules, index)}
            value={
              rule.sequence.length > 0
                ? sequenceLabel(rule.sequence, book)
                : "繰り返しなし"
            }
          />
        ))
        .toReversed()}
    </ListSection>
  );
}

// The orders as a timeline: the one in use today, any starting later
// under これから, and those over under これまで. The newest, in use or
// to come, is the one to correct, with 祝日は休みにする in its card.
// A new order and stopping both change things from a day on, not any
// one order, so they go together under the cards.
function RepeatTimeline({
  rules,
  onNew,
  onFix,
  onStop,
  onHolidaysOff,
}: {
  rules: RepeatRule[];
  onNew: () => void;
  onFix: () => void;
  onStop: () => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
}) {
  const inUse = rules.findLastIndex((rule) => rule.start <= designToday);
  const newest = rules.length - 1;
  const latest = rules[newest];
  const card = (index: number) => {
    const editable = index === newest && latest.sequence.length > 0;
    return (
      <OrderCard
        key={dateKey(rules[index].start)}
        onFix={editable ? onFix : undefined}
        period={periodOf(rules, index)}
        rule={rules[index]}
      >
        {editable && (
          <SwitchRow
            checked={latest.holidaysOff ?? false}
            label="祝日は休みにする"
            onChange={onHolidaysOff}
          />
        )}
      </OrderCard>
    );
  };
  const upcoming = rules
    .slice(inUse + 1)
    .map((_, offset) => inUse + 1 + offset);
  return (
    <>
      {inUse !== -1 && <Section title="今の繰り返し">{card(inUse)}</Section>}
      {upcoming.length > 0 && (
        <Section title="これから">
          <div className={orderCard.stack}>{upcoming.map(card)}</div>
        </Section>
      )}
      {/* As シフトパターン's パターンを追加: rows under the cards. */}
      <List>
        <AddRow label="新しい繰り返しを追加" onClick={onNew} />
        {latest.sequence.length > 0 && (
          <ListRow
            label="繰り返しをやめる"
            leading={<CircleSlash aria-hidden="true" size={20} />}
            onClick={onStop}
          />
        )}
      </List>
      <Note>
        どちらも、選んだ日から切り替わります。それより前のシフトは、そのまま残ります。
      </Note>
      <PastOrders rules={rules} until={inUse} />
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
    title: "繰り返しを直す",
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
        back="繰り返し"
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
      <PageHeader
        back="シフトパターン"
        onBack={onBack}
        title="新しい仕事にする"
      />
      <Note>
        新しい仕事の繰り返しとシフトパターンを、はじめの設定と同じ質問で選び直します。
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
// whose shifts repeat still changes a day on the calendar. So there is no
// work style to pick, only an order to set, change or stop. A new job,
// which asks for the shift patterns again, is under シフトパターン.
export function RepeatPage({
  rules,
  onBack,
  onRepeat,
  onStop,
  onNew,
  onFix,
  onHolidaysOff,
}: {
  rules: RepeatRule[];
  onBack: () => void;
  onRepeat: () => void;
  onStop: () => void;
  onNew: () => void;
  onFix: () => void;
  onHolidaysOff: (holidaysOff: boolean) => void;
}) {
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="繰り返し" />
      {isRepeating(rules) ? (
        <RepeatTimeline
          onNew={onNew}
          onFix={onFix}
          onHolidaysOff={onHolidaysOff}
          onStop={onStop}
          rules={rules}
        />
      ) : (
        <>
          <List>
            <ListRow
              label="繰り返しを設定する"
              onClick={onRepeat}
              value="なし"
            />
          </List>
          <Note>
            当番・非番や交代勤務のように順番で回るシフトを、カレンダーに自動で入れられます。違う日だけ、カレンダーで変えられます。
          </Note>
          <PastOrders rules={rules} until={rules.length} />
        </>
      )}
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
      <PageHeader back="繰り返し" onBack={onBack} title="繰り返しをやめる" />
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
