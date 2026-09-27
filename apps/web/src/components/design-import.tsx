import { useState } from "react";
import type { CSSProperties } from "react";
import { css, cx } from "styled-system/css";

import { patterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { DayCell, dateKey, formatDay } from "./design-calendar";
import type { Schedule } from "./design-calendar";
import {
  BackButton,
  Button,
  Chip,
  ChipGroup,
  ChoiceList,
  ChoiceRow,
  List,
  ListRow,
  PageHeader,
  SwitchRow,
} from "./design-ui";
import { useWeek } from "./design-week";
import { OffDisplayContext, ShiftMark } from "./shift-mark";

// Checking a photographed roster before it goes into the calendar: which
// row is yours, what each code on the sheet means, and whether the month
// reads right. The first time asks all of it; later months remember the
// row and the codes and open straight on the check, asking only about
// codes never seen before.

export type ImportRun = "first" | "repeat";

type RosterRow = { name: string; codes: string[] };

// Where a code goes: one of the patterns, a new pattern, or nowhere.
type Target = Shift | "skip";

// What the prototype pretends the roster photo read.
const cycle = ["日", "日", "夜", "明", "休", "休"];
const MY_ROW = 0;
// Days whose code the reading was unsure of, on your row.
const unsureDays = [12, 19];
// Codes the reading pairs with a pattern by itself.
const suggestions: Record<string, Shift> = {
  休: "off",
  夜: "night",
  日: "day",
  明: "after",
  有: "paid",
  研: "training",
};
// Codes a returning person has already placed.
const knownCodes = ["日", "夜", "明", "休", "有"];

function rosterOf(month: Date): RosterRow[] {
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const row = (
    name: string,
    offset: number,
    extra: Record<number, string>
  ) => ({
    codes: Array.from(
      { length: days },
      (_, index) =>
        extra[index + 1] ?? cycle[(index + offset) % cycle.length] ?? "休"
    ),
    name,
  });
  return [
    row("小林 さくら", 0, { 16: "研", 29: "有" }),
    row("田中 みき", 2, {}),
    row("鈴木 ゆい", 0, { 8: "有" }),
    row("山本 あや", 4, {}),
    row("高橋 りな", 1, { 16: "研" }),
    row("中村 はるか", 3, {}),
  ];
}

// The family name a coworker is registered under, as the app lists them.
const familyName = (name: string) => name.split(" ")[0] ?? name;

export type ImportResult = {
  schedule: Schedule;
  newPatterns: Shift[];
  newCoworkers: string[];
  days: number;
};

// A row with a second line under its label keeps a little room above and
// below it.
const noteRow = css({ paddingBlock: "9px" });

export function ImportReviewPage({
  month,
  run,
  patternKeys,
  schedule,
  coworkerNames,
  onCancel,
  onApply,
  initialStep,
}: {
  month: Date;
  run: ImportRun;
  patternKeys: Shift[];
  schedule: Schedule;
  coworkerNames: string[];
  onCancel: () => void;
  onApply: (result: ImportResult) => void;
  // For the flow diagrams: a step to open on.
  initialStep?: "row" | "codes" | "check";
}) {
  const roster = rosterOf(month);
  const codes = [...new Set(roster.flatMap((row) => row.codes))];
  const guess = (code: string): Target => suggestions[code] ?? "skip";
  const [step, setStep] = useState<"row" | "codes" | "check">(
    initialStep ?? (run === "first" ? "row" : "check")
  );
  const [myRow, setMyRow] = useState<number | undefined>(
    run === "first" && (initialStep ?? "row") === "row" ? undefined : MY_ROW
  );
  const [mapping, setMapping] = useState<Record<string, Target>>(() =>
    Object.fromEntries(codes.map((code) => [code, guess(code)]))
  );
  // A returning person confirms only codes they have not placed before.
  const [confirmed, setConfirmed] = useState<Set<string>>(
    () => new Set(run === "first" ? codes : knownCodes)
  );
  const [fixes, setFixes] = useState<Record<number, Shift>>({});
  const [picked, setPicked] = useState<number>();
  const [withCoworkers, setWithCoworkers] = useState(run === "repeat");
  const others = roster
    .map((row, index) => ({ index, row }))
    .filter(({ index }) => index !== myRow);
  const [people, setPeople] = useState<Set<number>>(
    () =>
      new Set(
        others
          .filter(({ row }) => coworkerNames.includes(familyName(row.name)))
          .map(({ index }) => index)
      )
  );

  const mine = myRow === undefined ? undefined : roster[myRow];
  const shiftOn = (day: number): Shift | undefined => {
    const fixed = fixes[day];
    if (fixed) {
      return fixed;
    }
    const target = mapping[mine?.codes[day - 1] ?? ""];
    return target === "skip" ? undefined : target;
  };
  const days = mine?.codes.length ?? 0;
  const dayDates = Array.from(
    { length: days },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)
  );
  const readSchedule: Schedule = Object.fromEntries(
    dayDates.flatMap((date) => {
      const shift = shiftOn(date.getDate());
      return shift ? [[dateKey(date), { shift }]] : [];
    })
  );
  const overwritten = dayDates.filter((date) => {
    const before = schedule[dateKey(date)]?.shift;
    const after = readSchedule[dateKey(date)]?.shift;
    return before !== undefined && after !== undefined && before !== after;
  }).length;
  const unplaced = codes.filter((code) => !confirmed.has(code));

  function apply() {
    const coworkersOn = (date: Date) =>
      [...people].flatMap((index) => {
        const row = roster[index];
        const theirs = mapping[row?.codes[date.getDate() - 1] ?? ""];
        const own = shiftOn(date.getDate());
        return row && own && own !== "off" && theirs === own
          ? [familyName(row.name)]
          : [];
      });
    const next: Schedule = Object.fromEntries(
      dayDates.flatMap((date) => {
        const key = dateKey(date);
        const shift = shiftOn(date.getDate());
        if (!shift) {
          return [];
        }
        const members = withCoworkers ? coworkersOn(date) : [];
        return [
          [
            key,
            {
              ...schedule[key],
              members: members.length > 0 ? members : schedule[key]?.members,
              shift,
            },
          ],
        ];
      })
    );
    const used = new Set(
      Object.values(next).flatMap((entry) => entry?.shift ?? [])
    );
    onApply({
      days: Object.keys(next).length,
      newCoworkers: withCoworkers
        ? [...people]
            .map((index) => familyName(roster[index]?.name ?? ""))
            .filter((name) => name && !coworkerNames.includes(name))
        : [],
      newPatterns: [...used].filter((shift) => !patternKeys.includes(shift)),
      schedule: next,
    });
  }

  const back = () => {
    if (step === "codes") {
      setStep("row");
    } else if (step === "check" && run === "first") {
      setStep("codes");
    } else {
      onCancel();
    }
  };

  return (
    <div className="dc-content st-screen">
      <div className="st-scroll im-page">
        <PageHeader
          leading={
            <BackButton onClick={back}>
              {step === "row" || run === "repeat" ? "カレンダー" : "戻る"}
            </BackButton>
          }
          title={
            <>
              {step === "row" && "あなたの行はどれですか？"}
              {step === "codes" && "記号をシフトに合わせます"}
              {step === "check" &&
                `${month.getMonth() + 1}月のシフトを確かめる`}
            </>
          }
        >
          {run === "first" && (
            <p className="im-steps">
              {(["row", "codes", "check"] as const).indexOf(step) + 1} / 3
            </p>
          )}
        </PageHeader>

        {step === "row" && (
          <>
            <p className="im-lead">
              勤務表から{roster.length}
              人分を読み取りました。あなたの名前を選んでください。次からは、同じ名前の行を使います。
            </p>
            <ChoiceList
              label="あなたの名前"
              onValueChange={(value) => {
                setMyRow(Number(value));
              }}
              value={myRow === undefined ? null : String(myRow)}
            >
              {roster.map((row, index) => (
                <ChoiceRow
                  key={row.name}
                  label={
                    <>
                      {row.name}
                      <small className="im-row-codes">
                        {row.codes.slice(0, 10).join(" ")} …
                      </small>
                    </>
                  }
                  value={String(index)}
                />
              ))}
            </ChoiceList>
            <Button
              variant="primary"
              className="ob-push im-next"
              disabled={myRow === undefined}
              onClick={() => {
                setStep("codes");
              }}
            >
              次へ
            </Button>
          </>
        )}

        {step === "codes" && (
          <>
            <p className="im-lead">
              勤務表の記号を、どのシフトとして入れるか決めます。読み取った内容から選んであります。次からは、新しい記号のときだけ聞きます。
            </p>
            <List>
              {codes.map((code) => (
                <CodeRow
                  code={code}
                  count={
                    mine?.codes.filter((item) => item === code).length ?? 0
                  }
                  key={code}
                  onChange={(target) => {
                    setMapping({ ...mapping, [code]: target });
                  }}
                  patternKeys={patternKeys}
                  suggestion={suggestions[code]}
                  target={mapping[code] ?? "skip"}
                />
              ))}
            </List>
            <p className="im-lead">
              「＋」の付いたシフトは、新しいパターンとして追加します。
            </p>
            <Button
              variant="primary"
              className="ob-push im-next"
              onClick={() => {
                setConfirmed(new Set(codes));
                setStep("check");
              }}
            >
              次へ
            </Button>
          </>
        )}

        {step === "check" && mine && (
          <>
            {unplaced.length > 0 && (
              <section className="im-notice">
                <p>
                  新しい記号があります。このシフトとして入れます。違うときは選び直してください。
                </p>
                <List>
                  {unplaced.map((code) => (
                    <CodeRow
                      code={code}
                      count={mine.codes.filter((item) => item === code).length}
                      key={code}
                      onChange={(target) => {
                        setMapping({ ...mapping, [code]: target });
                      }}
                      patternKeys={patternKeys}
                      suggestion={suggestions[code]}
                      target={mapping[code] ?? "skip"}
                    />
                  ))}
                </List>
              </section>
            )}
            <ScanStrip
              codes={mine.codes}
              name={mine.name}
              onPick={setPicked}
              picked={picked}
            />
            <CheckCalendar
              dates={dayDates}
              month={month}
              onPick={setPicked}
              picked={picked}
              schedule={readSchedule}
              unsure={unsureDays.filter((day) => fixes[day] === undefined)}
            />
            {picked !== undefined && (
              <DayFix
                code={mine.codes[picked - 1] ?? ""}
                date={new Date(month.getFullYear(), month.getMonth(), picked)}
                onFix={(shift) => {
                  setFixes({ ...fixes, [picked]: shift });
                }}
                patternKeys={patternKeys}
                shift={shiftOn(picked)}
                unsure={unsureDays.includes(picked)}
              />
            )}
            {unsureDays.some((day) => fixes[day] === undefined) && (
              <p className="im-unsure">
                <span aria-hidden="true" className="im-unsure-mark">
                  ?
                </span>
                {unsureDays
                  .filter((day) => fixes[day] === undefined)
                  .map((day) => `${day}日`)
                  .join("・")}
                は読み取りに自信がありません。日付を押して確かめてください。
              </p>
            )}
            <section className="st-section">
              <h4>一緒に働く人</h4>
              <List>
                <SwitchRow
                  className={noteRow}
                  label={
                    <>
                      同じシフトの人も入れる
                      <small className="im-row-codes">
                        勤務表で同じ日に同じシフトの人を、その日に入れます
                      </small>
                    </>
                  }

                  checked={withCoworkers}
                  onChange={(checked) => {
                    setWithCoworkers(checked);
                  }}
                />
                {withCoworkers &&
                  others.map(({ index, row }) => {
                    const registered = coworkerNames.includes(
                      familyName(row.name)
                    );
                    return (
                      <ListRow
                        className={noteRow}
                        key={row.name}
                        label={row.name}
                        value={registered ? "登録済み" : "新しく追加"}
                        leading={
                          <>
                            <input
                              checked={people.has(index)}
                              className="im-check"
                              onChange={(event) => {
                                const next = new Set(people);
                                if (event.target.checked) {
                                  next.add(index);
                                } else {
                                  next.delete(index);
                                }
                                setPeople(next);
                              }}
                              type="checkbox"
                            />
                          </>
                        }
                      />
                    );
                  })}
              </List>
            </section>
            <div className="im-apply">
              {overwritten > 0 && (
                <p>
                  すでに入っている{overwritten}
                  日分を、読み取った内容で上書きします。
                </p>
              )}
              <Button variant="primary" className="ob-push" onClick={apply}>
                カレンダーに入れる
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// One code on the sheet and the shift it goes in as.
function CodeRow({
  code,
  count,
  target,
  suggestion,
  patternKeys,
  onChange,
}: {
  code: string;
  count: number;
  target: Target;
  suggestion?: Shift;
  patternKeys: Shift[];
  onChange: (target: Target) => void;
}) {
  // A suggested pattern not in use yet is offered as a new one.
  const choices: Shift[] =
    suggestion && !patternKeys.includes(suggestion)
      ? [...patternKeys, suggestion]
      : patternKeys;
  return (
    <ListRow
      className={cx(noteRow, "im-code")}
      label={<>{count > 0 ? `あなたの行に${count}日` : "あなたの行にはなし"}</>}
      leading={
        <>
          <span className="im-code-chip">{code}</span>
        </>
      }
      control={
        <>
          {target !== "skip" && <ShiftMark shift={target} size={18} />}
          <select
            className="im-code-select"
            onChange={(event) => {
              onChange(event.target.value as Target);
            }}
            value={target}
          >
            {choices.map((shift) => (
              <option key={shift} value={shift}>
                {patternKeys.includes(shift) ? "" : "＋"}
                {patterns[shift].label}
              </option>
            ))}
            <option value="skip">入れない</option>
          </select>
        </>
      }
    />
  );
}

// Your row as the sheet has it, to hold against the calendar below.
function ScanStrip({
  name,
  codes,
  picked,
  onPick,
}: {
  name: string;
  codes: string[];
  picked?: number;
  onPick: (day: number) => void;
}) {
  return (
    <figure className="im-scan">
      <figcaption>勤務表の「{name}」の行</figcaption>
      <div className="im-scan-row">
        {codes.map((code, index) => {
          const day = index + 1;
          return (
            <button
              aria-label={`${day}日：${code}`}
              aria-pressed={picked === day}
              className={unsureDays.includes(day) ? "im-scan-unsure" : ""}
              key={day}
              onClick={() => {
                onPick(day);
              }}
              type="button"
            >
              <small>{day}</small>
              {code}
            </button>
          );
        })}
      </div>
    </figure>
  );
}

// The month as it will go in, drawn like the calendar itself.
function CheckCalendar({
  month,
  dates,
  schedule,
  unsure,
  picked,
  onPick,
}: {
  month: Date;
  dates: Date[];
  schedule: Schedule;
  // Days still to look at, marked on the calendar.
  unsure: number[];
  picked?: number;
  onPick: (day: number) => void;
}) {
  const weekTools = useWeek();
  const grid = weekTools.monthDates(month);
  const inMonth = new Set(dates.map(dateKey));
  return (
    // Checking needs every day to show, days off included.
    <OffDisplayContext value="show">
      <div className="im-calendar">
        <div aria-hidden="true" className="dc-weekdays">
          {weekTools.weekdays.map((day) => (
            <span className={day.className} key={day.day}>
              {day.label}
            </span>
          ))}
        </div>
        <div
          className="dc-grid"
          style={{ "--weeks": grid.length / 7 } as CSSProperties}
        >
          {grid.map((date) => (
            <DayCell
              active={inMonth.has(dateKey(date)) && picked === date.getDate()}
              date={date}
              editing={false}
              entry={schedule[dateKey(date)]}
              flagged={
                unsure.includes(date.getDate()) && inMonth.has(dateKey(date))
              }
              key={dateKey(date)}
              onPress={() => {
                if (inMonth.has(dateKey(date))) {
                  onPick(date.getDate());
                }
              }}
              outside={!inMonth.has(dateKey(date))}
            />
          ))}
        </div>
      </div>
    </OffDisplayContext>
  );
}

// Fixing one day: what the sheet said and the shift to put in.
function DayFix({
  date,
  code,
  shift,
  unsure,
  patternKeys,
  onFix,
}: {
  date: Date;
  code: string;
  shift?: Shift;
  unsure: boolean;
  patternKeys: Shift[];
  onFix: (shift: Shift) => void;
}) {
  return (
    <section className="im-fix">
      <p>
        <strong>{formatDay(date)}</strong>
        勤務表では「{code}」{unsure ? "（自信なし）" : ""}
      </p>
      <ChipGroup>
        {patternKeys.map((key) => (
          <Chip
            selected={shift === key}
            key={key}
            onClick={() => {
              onFix(key);
            }}
          >
            <ShiftMark shift={key} size={20} />
            {patterns[key].label}
          </Chip>
        ))}
      </ChipGroup>
    </section>
  );
}
