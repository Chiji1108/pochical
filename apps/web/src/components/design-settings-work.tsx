import { ArrowRight, ChevronRight, CircleSlash } from "lucide-react";
import { useContext, useState } from "react";
import { css, cx } from "styled-system/css";

import {
  addDays,
  dateKey,
  defaultHolidaysOff,
  formatDay,
  holidayShiftOf,
} from "../lib/design-days";
import type { RepeatRule, Schedule } from "../lib/design-days";
import { isDayOff, presetList, usePatterns } from "../lib/design-patterns";
import type { Pattern, Shift } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { useUser } from "../lib/design-user-store";
import { Chip, ChipGroup } from "./design-choices";
import { InputDatePicker } from "./design-date-picker";
import { DoneButton, PageHeader } from "./design-header";
import { AddRow, List, ListRow, SwitchRow } from "./design-list";
import {
  OrderTitle,
  RepeatCalendar,
  SequenceTiles,
} from "./design-repeat-editor";
import {
  nextMonthStart,
  settingsParts,
  shortDay,
} from "./design-settings-parts";
import { ConfirmDialog, Sheet, SheetHeading, sheetBody } from "./design-sheet";
import { ToastContext } from "./design-toast";
import {
  Button,
  DestructiveButton,
  fieldLabel,
  Note,
  Section,
} from "./design-ui";
import { WorkSetupSteps } from "./design-work-setup";
import { ShiftMark } from "./shift-mark";

// 繰り返し's pages: the repeating order and its history, setting,
// correcting and stopping it; and 新しい仕事にする, opened from
// シフトパターン.

// One period on 繰り返し: when it runs, its days and how often they come
// round, on a card that opens it.
function OrderCard({
  rule,
  period,
  onOpen,
}: {
  rule: RepeatRule;
  period: string;
  onOpen: () => void;
}) {
  const book = usePatterns();
  const repeats = rule.sequence.length > 0;
  return (
    <button
      aria-label={`${period}の繰り返し`}
      className={cx(settingsParts.card, orderCard.pressable)}
      onClick={onOpen}
      type="button"
    >
      <span className={orderCard.body}>
        <span className={settingsParts.cardLabel}>
          {period}
          <span className={settingsParts.cardCount}>
            {repeats ? `${rule.sequence.length}日ごと` : "繰り返しなし"}
          </span>
        </span>
        {repeats ? (
          <SequenceTiles sequence={rule.sequence} />
        ) : (
          <span className={settingsParts.cardMeta}>自分で入れる期間</span>
        )}
        {repeats && rule.holidaysOff && (
          <span className={settingsParts.cardMeta}>
            祝日は{book[rule.holidayShift ?? ""]?.name ?? "休み"}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" className={orderCard.arrow} size={17} />
    </button>
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
  pressable: css({
    _hover: { bg: "fill.tertiary" },
    alignItems: "center",
    border: 0,
    color: "text.primary",
    cursor: "pointer",
    display: "flex",
    gap: "12px",
    textAlign: "left",
    width: "100%",
  }),
  // A period's order over the row that opens it, in one card.
  tiles: css({
    "& > span": { display: "flex" },
    padding: "16px",
    position: "relative",
  }),
  // A section's cards, apart as lists are.
  stack: css({ display: "flex", flexDirection: "column", gap: "12px" }),
};

// When a period runs: from its start to the day before the next one.
function periodOf(rules: readonly RepeatRule[], index: number) {
  const rule = rules[index];
  const next = rules[index + 1];
  return next
    ? `${shortDay(rule.start)}〜${shortDay(addDays(next.start, -1))}`
    : `${shortDay(rule.start)}から`;
}

// The periods as a list that never overlaps, newest first under the
// rows that add one: those to come, the one in use today, and those over. Each opens to be set
// again, moved or taken out; a new one, or one without repeating, goes
// in from a day, the periods around it kept.
function RepeatList({
  rules,
  onOpen,
  onNew,
  onStop,
}: {
  rules: RepeatRule[];
  onOpen: (start: Date) => void;
  onNew: () => void;
  onStop: () => void;
}) {
  const inUse = rules.findLastIndex((rule) => rule.start <= designToday);
  const cards = (indices: number[]) => (
    <div className={orderCard.stack}>
      {indices.map((index) => (
        <OrderCard
          key={dateKey(rules[index].start)}
          onOpen={() => {
            onOpen(rules[index].start);
          }}
          period={periodOf(rules, index)}
          rule={rules[index]}
        />
      ))}
    </div>
  );
  const indices = rules.map((_, index) => index).toReversed();
  const upcoming = indices.filter((index) => index > inUse);
  const past = indices.filter((index) => index < inUse);
  return (
    <>
      {/* Over the newest first, where a new period mostly lands. */}
      <List>
        <AddRow label="新しい繰り返しを追加" onClick={onNew} opensPage />
        <ListRow
          label="繰り返しをやめる"
          leading={<CircleSlash aria-hidden="true" size={20} />}
          onClick={onStop}
        />
      </List>
      <Note>
        どちらも、選んだ日から切り替わります。前後の期間と、自分で入れた日は、そのまま残ります。
      </Note>
      {upcoming.length > 0 && (
        <Section title="これから">{cards(upcoming)}</Section>
      )}
      {inUse !== -1 && <Section title="今の繰り返し">{cards([inUse])}</Section>}
      {past.length > 0 && <Section title="これまで">{cards(past)}</Section>}
    </>
  );
}

// A period opened from the list: its order to set again on the calendar,
// the day it starts, 祝日は休みにする, and taking it out. It starts no
// earlier than the day after the period before and ends where the next
// one starts, so moving it never runs over either.
export function RepeatPeriodPage({
  rules,
  rule,
  onBack,
  onFix,
  onMove,
  onPut,
  onRemove,
}: {
  rules: RepeatRule[];
  rule: RepeatRule;
  onBack: () => void;
  onFix: () => void;
  onMove: (start: Date) => void;
  onPut: (rule: RepeatRule) => void;
  onRemove: () => void;
}) {
  const toast = useContext(ToastContext);
  const [removing, setRemoving] = useState(false);
  const index = rules.indexOf(rule);
  const before = rules[index - 1];
  const after = rules[index + 1];
  const repeats = rule.sequence.length > 0;
  const move = (start: Date) => {
    const fits =
      (!before || start > before.start) && (!after || start < after.start);
    if (fits) {
      onMove(start);
    } else {
      toast("前後の期間と重なる日にはできません", "problem");
    }
  };
  return (
    <>
      <PageHeader
        back="繰り返し"
        onBack={onBack}
        title={periodOf(rules, index)}
      />
      {repeats && (
        <List>
          <div className={orderCard.tiles} data-list-row="">
            <span className={settingsParts.cardLabel}>
              並び
              <span className={settingsParts.cardCount}>
                {rule.sequence.length}日ごと
              </span>
            </span>
            <SequenceTiles sequence={rule.sequence} />
          </div>
          <ListRow label="カレンダーで直す" onClick={onFix} />
        </List>
      )}
      <List>
        <ListRow
          control={
            <InputDatePicker
              ariaLabel={`始まる日：${formatDay(rule.start)}。タップで変更`}
              date={rule.start}
              onSelect={move}
              title="始まる日"
            >
              <span>{formatDay(rule.start)}</span>
            </InputDatePicker>
          }
          label="始まる日"
        />
      </List>
      <Note>
        {repeats
          ? "並びを直しても、自分で入れた日は、そのまま残ります。"
          : "この期間は繰り返さず、カレンダーで1日ずつ入れます。"}
      </Note>
      {repeats && (
        <HolidayChoice
          holidayShift={rule.holidayShift}
          holidaysOff={rule.holidaysOff ?? false}
          onHolidayShift={(holidayShift) => {
            onPut({ ...rule, holidayShift });
          }}
          onHolidaysOff={(holidaysOff) => {
            onPut({ ...rule, holidaysOff });
          }}
        />
      )}
      <DestructiveButton
        onClick={() => {
          setRemoving(true);
        }}
      >
        この期間を削除
      </DestructiveButton>
      {removing && (
        <ConfirmDialog
          action="削除"
          message={
            before
              ? "前の期間の繰り返しが、そのまま続きます。自分で入れた日は、そのまま残ります。"
              : "この期間には、繰り返しのシフトが入らなくなります。自分で入れた日は、そのまま残ります。"
          }
          onCancel={() => {
            setRemoving(false);
          }}
          onConfirm={onRemove}
          title="この期間を削除しますか？"
        />
      )}
    </>
  );
}

const orderConfirm = {
  lead: css({ color: "text.secondary", margin: 0, textStyle: "subheadline" }),
};

// 祝日は休みにする, asked as an order is saved and kept with its period:
// on, holidays take a pattern that counts as off, picked among them when
// there are more than one, as 完了's blanks pick theirs. With none, there
// is nothing for holidays to take, so it is not asked.
function HolidayChoice({
  holidaysOff,
  holidayShift,
  onHolidaysOff,
  onHolidayShift,
}: {
  holidaysOff: boolean;
  holidayShift?: Shift;
  onHolidaysOff: (holidaysOff: boolean) => void;
  onHolidayShift: (shift: Shift) => void;
}) {
  const patterns = useUser((state) => state.patterns);
  const offs = patterns.filter(isDayOff);
  // The one holidays take: the one picked while it counts as off, else
  // the first that does.
  const taken = holidayShiftOf(patterns, holidayShift);
  if (offs.length === 0) {
    return null;
  }
  return (
    <>
      <List>
        <SwitchRow
          checked={holidaysOff}
          detail="祝日は、並びの代わりに休みにします"
          label="祝日は休みにする"
          onChange={onHolidaysOff}
        />
      </List>
      {holidaysOff && offs.length > 1 && (
        <ChipGroup label="祝日に入れるパターン">
          {offs.map((pattern) => (
            <Chip
              key={pattern.id}
              onClick={() => {
                onHolidayShift(pattern.id);
              }}
              selected={pattern.id === taken}
            >
              <ShiftMark shift={pattern.id} size={16} />
              {pattern.name}
            </Chip>
          ))}
        </ChipGroup>
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
      "この日から、並びのとおりにシフトが入ります。自分で入れた日は、そのまま残ります。",
    question: "から繰り返しますか？",
    title: "繰り返しを設定",
  },
  fix: {
    action: "入れ直す",
    message:
      "この期間のシフトを、並びのとおりに入れ直します。自分で入れた日は、そのまま残ります。",
    question: "から入れ直しますか？",
    title: "繰り返しを直す",
  },
  switch: {
    action: "切り替える",
    message:
      "この日から、新しい並びのとおりにシフトが入ります。前後の期間と、自分で入れた日は、そのまま残ります。",
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
  const rules = useUser((state) => state.rules);
  const fixing = mode === "fix" && current !== undefined;
  const text = repeatModes[mode];
  const [order, setOrder] = useState(() => ({
    anchor: fixing ? (current.anchor ?? current.start) : nextMonthStart(),
    sequence: initialSequence,
  }));
  const { anchor, sequence } = order;
  const start = fixing ? current.start : anchor;
  // Follows the order until the person sets it, in what 完了 asks.
  const [holidaysChoice, setHolidaysChoice] = useState(
    fixing ? current.holidaysOff : undefined
  );
  const [holidayPick, setHolidayPick] = useState(
    fixing ? current.holidayShift : undefined
  );
  const holidaysOff =
    holidaysChoice ?? defaultHolidaysOff(sequence, anchor, book);
  const holidayShift = holidaysOff
    ? holidayShiftOf(patterns, holidayPick)
    : undefined;
  const rule: RepeatRule = {
    anchor,
    holidayShift,
    holidaysOff,
    sequence,
    start,
  };
  const [confirming, setConfirming] = useState(false);
  // A new period on a day another starts takes its place: 完了 says so.
  const replaces =
    !fixing && rules.some((other) => other.start.getTime() === start.getTime());
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
        anchor={anchor}
        before={shown}
        from={fixing ? current.start : undefined}
        holidayShift={holidayShift}
        onChange={setOrder}
        patternKeys={patternKeys}
        sequence={sequence}
      />
      <Sheet
        label={`${shortDay(start)}${text.question}`}
        onOpenChange={setConfirming}
        open={confirming}
      >
        <SheetHeading
          onClose={() => {
            setConfirming(false);
          }}
          title={`${shortDay(start)}${text.question}`}
        />
        <div className={sheetBody}>
          <p className={orderConfirm.lead}>
            {replaces
              ? "この日から始まる繰り返しと入れ替えます。自分で入れた日は、そのまま残ります。"
              : text.message}
          </p>
          <HolidayChoice
            holidayShift={holidayShift}
            holidaysOff={holidaysOff}
            onHolidayShift={setHolidayPick}
            onHolidaysOff={setHolidaysChoice}
          />
          <Button
            onClick={() => {
              onApply(rule);
            }}
            variant="primary"
          >
            {text.action}
          </Button>
        </div>
      </Sheet>
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
// work style to pick, only periods of orders to set, change or end. A new
// job, which asks for the shift patterns again, is under シフトパターン.
export function RepeatPage({
  rules,
  onBack,
  onNew,
  onOpen,
  onStop,
}: {
  rules: RepeatRule[];
  onBack: () => void;
  onNew: () => void;
  onOpen: (start: Date) => void;
  onStop: () => void;
}) {
  return (
    <>
      <PageHeader back="設定" onBack={onBack} title="繰り返し" />
      {rules.length > 0 ? (
        <RepeatList
          onNew={onNew}
          onOpen={onOpen}
          onStop={onStop}
          rules={rules}
        />
      ) : (
        <>
          <List>
            <ListRow label="繰り返しを設定する" onClick={onNew} value="なし" />
          </List>
          <Note>
            当番・非番や交代勤務のように順番で回るシフトを、カレンダーに自動で入れられます。違う日だけ、カレンダーで変えられます。
          </Note>
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
  const rules = useUser((state) => state.rules);
  // A period starting that day gives way to this one.
  const replaces = rules.some(
    (rule) => rule.start.getTime() === start.getTime()
  );
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
        {replaces && "この日から始まる繰り返しと入れ替わります。"}
        この日から、繰り返しのシフトが入らなくなります。あとに別の期間があれば、そこからはその繰り返しになります。自分で入れた日は、そのまま残ります。
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
