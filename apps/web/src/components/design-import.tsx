import { useState } from "react";
import type { CSSProperties } from "react";
import { css, cx } from "styled-system/css";

import {
  familyName,
  importSample,
  nearCoworker,
  rowByName,
} from "../lib/design-import-sample";
import type { ImportKind, ReadRow } from "../lib/design-import-sample";
import { patterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { DayCell, dateKey, formatDay } from "./design-calendar";
import type { Schedule } from "./design-calendar";
import { ImportReading } from "./design-import-reading";
import {
  BackButton,
  Button,
  Chip,
  ChipGroup,
  ChoiceList,
  ChoiceRow,
  List,
  ListRow,
  listRow,
  PageHeader,
  SwitchRow,
} from "./design-ui";
import { useWeek } from "./design-week";
import { OffDisplayContext, ShiftMark } from "./shift-mark";

// Checking a photo before it goes into the calendar. A roster is found by
// the name the person typed before taking it, as the sheet writes it, so
// only a name nowhere on the sheet asks which row is theirs; then what
// each code on the sheet means; a picture of your
// own month, like another app's screen, only what its shift names mean.
// Then your month is checked as it will go in. Coworkers are optional
// and only the ones you pick: their names are checked, their days are
// not, as they only say who you work with. Later months remember the
// row, the codes and the people and open straight on the check, asking
// only about codes never seen before.

export type ImportRun = "first" | "repeat";

export type ImportStep = "reading" | "row" | "codes" | "check";

// Where a code goes: one of the patterns, a new pattern, or nowhere.
type Target = Shift | "skip";

export type ImportResult = {
  schedule: Schedule;
  newPatterns: Shift[];
  newCoworkers: string[];
  days: number;
};

// A row with a second line under its label keeps a little room above and
// below it.
const noteRow = css({ paddingBlock: "9px" });

// Whose row was read, with the way out when it is someone else's.
const foundRow = {
  line: css({
    color: "text2",
    fontSize: "13px",
    lineHeight: 1.6,
    margin: "-4px 4px 0",
  }),
  other: css({
    bg: "transparent",
    border: 0,
    color: "accent",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 500,
    marginLeft: "4px",
    padding: 0,
  }),
};

export function ImportReviewPage({
  kind = "roster",
  month,
  run,
  patternKeys,
  schedule,
  coworkerNames,
  onCancel,
  onApply,
  initialStep,
  initialCoworkers,
  rosterName = "",
}: {
  kind?: ImportKind;
  month: Date;
  run: ImportRun;
  patternKeys: Shift[];
  schedule: Schedule;
  coworkerNames: string[];
  onCancel: () => void;
  onApply: (result: ImportResult) => void;
  // For the flow diagrams: a step to open on, and coworkers switched on.
  initialStep?: ImportStep;
  initialCoworkers?: boolean;
  // The person's name as the roster writes it, typed before the photo.
  rosterName?: string;
}) {
  const sample = importSample(kind, month);
  const { rows, suggestions, unsureDays } = sample;
  const roster = kind === "roster";
  const found = roster ? rowByName(rows, rosterName) : sample.myRow;
  // The steps after the reading, in order.
  const flow: ImportStep[] = [
    ...(found === undefined ? (["row"] as const) : []),
    ...(run === "first" ? (["codes"] as const) : []),
    "check",
  ];
  const codes = [...new Set(rows.flatMap((row) => row.codes))];
  const guess = (code: string): Target => suggestions[code] ?? "skip";
  const [step, setStep] = useState<ImportStep>(initialStep ?? "reading");
  const [myRow, setMyRow] = useState<number | undefined>(found);
  // Picking another row from the check, when the one found is not theirs.
  const [repicking, setRepicking] = useState(false);
  // Names as read, fixed by hand. One the reading was unsure of and is a
  // letter away from a registered coworker starts as that coworker; a
  // returning person's fixes are remembered, so their roster reads right.
  const [names, setNames] = useState(() =>
    rows.map((row) => {
      if (run === "repeat") {
        return row.printed;
      }
      const near = row.unsure
        ? nearCoworker(row.read, coworkerNames)
        : undefined;
      const given = row.read.split(" ").slice(1).join(" ");
      if (near === undefined) {
        return row.read;
      }
      return given ? `${near} ${given}` : near;
    })
  );
  const [mapping, setMapping] = useState<Record<string, Target>>(() =>
    Object.fromEntries(codes.map((code) => [code, guess(code)]))
  );
  // A returning person confirms only codes they have not placed before.
  const [confirmed, setConfirmed] = useState<Set<string>>(
    () => new Set(run === "first" ? codes : sample.knownCodes)
  );
  const [fixes, setFixes] = useState<Record<number, Shift>>({});
  const [picked, setPicked] = useState<number>();
  const [withCoworkers, setWithCoworkers] = useState(
    roster && (initialCoworkers ?? run === "repeat")
  );
  const others = rows
    .map((row, index) => ({ index, name: names[index] ?? row.read, row }))
    .filter(({ index }) => index !== myRow);
  const [people, setPeople] = useState<Set<number>>(
    () =>
      new Set(
        others
          .filter(({ name }) => coworkerNames.includes(familyName(name)))
          .map(({ index }) => index)
      )
  );

  const mine = myRow === undefined ? undefined : rows[myRow];
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
  // Days your own shift is still in doubt: nobody is put on them.
  const doubtful = new Set(
    unsureDays.filter((day) => fixes[day] === undefined)
  );
  const workingOn = (day: number) => {
    const own = shiftOn(day);
    return own && own !== "off" && !doubtful.has(day) ? own : undefined;
  };
  const togetherDays = (index: number) =>
    dayDates.filter((date) => {
      const own = workingOn(date.getDate());
      const theirs = mapping[rows[index]?.codes[date.getDate() - 1] ?? ""];
      return own !== undefined && theirs === own;
    }).length;
  const nameOf = (index: number) => names[index]?.trim() ?? "";

  function apply() {
    const coworkersOn = (date: Date) =>
      [...people].flatMap((index) => {
        const theirs = mapping[rows[index]?.codes[date.getDate() - 1] ?? ""];
        const own = workingOn(date.getDate());
        return own !== undefined && theirs === own
          ? [familyName(nameOf(index))]
          : [];
      });
    const adding = roster && withCoworkers;
    const next: Schedule = Object.fromEntries(
      dayDates.flatMap((date) => {
        const key = dateKey(date);
        const shift = shiftOn(date.getDate());
        if (!shift) {
          return [];
        }
        const members = adding ? coworkersOn(date) : [];
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
      newCoworkers: adding
        ? [...people]
            .map((index) => familyName(nameOf(index)))
            .filter((name) => name && !coworkerNames.includes(name))
        : [],
      newPatterns: [...used].filter((shift) => !patternKeys.includes(shift)),
      schedule: next,
    });
  }

  const at = flow.indexOf(step);
  const forward = () => {
    const following = flow[at + 1];
    if (following) {
      setStep(following);
    }
  };
  const back = () => {
    const previous = flow[at - 1];
    if (previous) {
      setStep(previous);
    } else {
      onCancel();
    }
  };

  if (step === "reading") {
    return (
      <ImportReading
        kind={kind}
        month={month}
        onCancel={onCancel}
        onDone={() => {
          setStep(flow[0] ?? "check");
        }}
        rowName={found === undefined ? undefined : rows[found]?.read}
        sample={sample}
      />
    );
  }

  const shown = repicking ? "row" : step;
  const titles: Record<Exclude<ImportStep, "reading">, string> = {
    check: `${month.getMonth() + 1}月のシフトを確かめる`,
    codes: roster ? "記号をシフトに合わせます" : "シフト名を合わせます",
    row: "あなたの行はどれですか？",
  };

  return (
    <div className="dc-content st-screen">
      <div className="st-scroll im-page">
        <PageHeader
          leading={
            <BackButton
              onClick={() => {
                if (repicking) {
                  setRepicking(false);
                } else {
                  back();
                }
              }}
            >
              {at <= 0 && !repicking ? "カレンダー" : "戻る"}
            </BackButton>
          }
          title={titles[shown]}
        >
          {flow.length > 1 && !repicking && (
            <p className="im-steps">
              {at + 1} / {flow.length}
            </p>
          )}
        </PageHeader>

        {shown === "row" && (
          <>
            <p className="im-lead">
              {repicking || rosterName.trim() === ""
                ? `勤務表から${rows.length}人分を読み取りました。あなたの行を選んでください。`
                : `「${rosterName}」さんの行が見つかりませんでした。勤務表での書き方が違うのかもしれません。あなたの行を選んでください。`}
              次からは、この行の名前で探します。
            </p>
            <ChoiceList
              label="あなたの名前"
              onValueChange={(value) => {
                setMyRow(Number(value));
              }}
              value={myRow === undefined ? null : String(myRow)}
            >
              {rows.map((row, index) => (
                <ChoiceRow
                  key={row.printed}
                  label={
                    <>
                      {nameOf(index)}
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
                if (repicking) {
                  setRepicking(false);
                } else {
                  forward();
                }
              }}
            >
              {repicking ? "この行にする" : "次へ"}
            </Button>
          </>
        )}

        {shown === "codes" && (
          <>
            <p className="im-lead">
              {roster
                ? "勤務表の記号を、どのシフトとして入れるか決めます。"
                : "画面のシフト名を、どのシフトとして入れるか決めます。"}
              読み取った内容から選んであります。次からは、新しい
              {roster ? "記号" : "シフト名"}のときだけ聞きます。
            </p>
            <List>
              {codes.map((code) => (
                <CodeRow
                  code={code}
                  count={
                    mine?.codes.filter((item) => item === code).length ?? 0
                  }
                  key={code}
                  kind={kind}
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
                forward();
              }}
            >
              次へ
            </Button>
          </>
        )}

        {shown === "check" && mine && (
          <>
            {unplaced.length > 0 && (
              <section className="im-notice">
                <p>
                  新しい{roster ? "記号" : "シフト名"}
                  があります。このシフトとして入れます。違うときは選び直してください。
                </p>
                <List>
                  {unplaced.map((code) => (
                    <CodeRow
                      code={code}
                      count={mine.codes.filter((item) => item === code).length}
                      key={code}
                      kind={kind}
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
            {roster && (
              <p className={foundRow.line}>
                勤務表の「{nameOf(myRow ?? 0)}」さんの行を読みました。
                <button
                  className={foundRow.other}
                  onClick={() => {
                    setRepicking(true);
                  }}
                  type="button"
                >
                  違う人の行です
                </button>
              </p>
            )}
            <ScanStrip
              caption={
                roster ? "勤務表のこの行" : `画像の${month.getMonth() + 1}月`
              }
              codes={mine.codes}
              onPick={setPicked}
              picked={picked}
              unsureDays={unsureDays}
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
                source={roster ? "勤務表" : "画像"}
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
            {roster && (
              <section className="st-section">
                <h4>一緒に働く人</h4>
                <List>
                  <SwitchRow
                    className={noteRow}
                    label={
                      <>
                        一緒に働く人も入れる
                        <small className="im-row-codes">
                          選んだ人を、勤務表で同じシフトの日に入れます
                        </small>
                      </>
                    }
                    checked={withCoworkers}
                    onChange={(checked) => {
                      setWithCoworkers(checked);
                    }}
                  />
                  {withCoworkers &&
                    others.map(({ index, name, row }) => (
                      <CoworkerRow
                        chosen={people.has(index)}
                        key={row.printed}
                        name={name}
                        onChoose={(chosen) => {
                          const picks = new Set(people);
                          if (chosen) {
                            picks.add(index);
                          } else {
                            picks.delete(index);
                          }
                          setPeople(picks);
                        }}
                        onRename={(renamed) => {
                          setNames(
                            names.map((value, place) =>
                              place === index ? renamed : value
                            )
                          );
                        }}
                        registered={coworkerNames.includes(
                          familyName(name.trim())
                        )}
                        row={row}
                        together={togetherDays(index)}
                      />
                    ))}
                </List>
                {withCoworkers && (
                  <p className="st-note">
                    入れたい人だけ選んでください。名前が違うときは直せます。読み取りに自信のない日には入れません。
                  </p>
                )}
              </section>
            )}
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

// A coworker to put in on the days you share: picked, their name can be
// fixed against the name as the photo has it. What they work is not
// checked day by day; the count of days together is enough to notice a
// wrong row.
function CoworkerRow({
  row,
  name,
  chosen,
  registered,
  together,
  onChoose,
  onRename,
}: {
  row: ReadRow;
  name: string;
  chosen: boolean;
  registered: boolean;
  together: number;
  onChoose: (chosen: boolean) => void;
  onRename: (name: string) => void;
}) {
  const fixed = name.trim() !== row.read;
  const doubtful = row.unsure && !fixed;
  let note = registered ? "登録済み" : "新しく追加";
  if (row.unsure && fixed) {
    note = `${note}・読み取りは「${row.read}」`;
  }
  return (
    <div className={cx(listRow.root, coworkerStyles.row)} data-list-row="">
      <input
        aria-label={`${name}を入れる`}
        checked={chosen}
        className={cx("im-check", coworkerStyles.check)}
        onChange={(event) => {
          onChoose(event.target.checked);
        }}
        type="checkbox"
      />
      <div className={coworkerStyles.body}>
        {chosen ? (
          <div className={coworkerStyles.fieldRow}>
            <input
              aria-invalid={name.trim() === ""}
              aria-label={`${row.printed}の名前`}
              className={coworkerStyles.field}
              onChange={(event) => {
                onRename(event.target.value);
              }}
              value={name}
            />
          </div>
        ) : (
          <span>{name}</span>
        )}
        {chosen && (
          <small className={coworkerStyles.note}>
            {doubtful ? (
              <>
                <span aria-hidden="true" className="im-unsure-mark">
                  ?
                </span>
                名前の読み取りに自信がありません
              </>
            ) : (
              note
            )}
          </small>
        )}
      </div>
      <span className={coworkerStyles.together}>
        {together > 0 ? `一緒 ${together}日` : "一緒の日なし"}
      </span>
    </div>
  );
}

const coworkerStyles = {
  body: css({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "5px",
    minWidth: 0,
  }),
  check: css({ marginTop: "2px" }),
  field: css({
    "&:focus": { outline: "2px solid token(colors.accent)" },
    "&[aria-invalid=true]": { outline: "2px solid token(colors.danger)" },
    bg: "fill2",
    border: 0,
    borderRadius: "8px",
    color: "text",
    font: "inherit",
    fontSize: "14px",
    height: "30px",
    minWidth: 0,
    paddingInline: "8px",
    width: "100%",
  }),
  fieldRow: css({ display: "flex", gap: "6px", marginTop: "-5px" }),
  note: css({
    alignItems: "center",
    color: "text3",
    display: "flex",
    fontSize: "11px",
    gap: "6px",
  }),
  row: css({ alignItems: "flex-start", paddingBlock: "11px" }),
  together: css({
    color: "text3",
    flexShrink: 0,
    fontSize: "12px",
    marginTop: "1px",
  }),
};

// What was read, written out as text in the app's own type: codes can
// run to two letters or more (遅②, P公, 早番), and nothing here is cut
// from the photo.
const readText = {
  caption: css({ color: "text3", fontSize: "11px", margin: "0 4px 6px" }),
  code: css({
    color: "text",
    flexShrink: 0,
    fontSize: "16px",
    fontWeight: 600,
    minWidth: "36px",
    whiteSpace: "nowrap",
  }),
  day: css({
    "& small": { color: "text3", fontSize: "9px", fontWeight: 400 },
    "&[aria-pressed=true]": {
      outline: "2px solid token(colors.accent)",
      outlineOffset: "-2px",
    },
    // The same yellow as the "?" of a day to look at.
    "&[data-unsure]": { bg: "#f7e7a6", color: "#4a3d10" },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "8px",
    color: "text",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    fontSize: "14px",
    fontWeight: 600,
    gap: "1px",
    minWidth: "32px",
    padding: "4px 4px 6px",
    whiteSpace: "nowrap",
  }),
  strip: css({
    bg: "fill",
    borderRadius: "12px",
    display: "flex",
    gap: "2px",
    overflowX: "auto",
    padding: "4px",
  }),
};

// One code on the sheet and the shift it goes in as.
function CodeRow({
  kind,
  code,
  count,
  target,
  suggestion,
  patternKeys,
  onChange,
}: {
  kind: ImportKind;
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
      label={<>{codeCount(kind, count)}</>}
      leading={<span className={readText.code}>{code}</span>}
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

function codeCount(kind: ImportKind, count: number) {
  if (kind === "mine") {
    return `${count}日`;
  }
  return count > 0 ? `あなたの行に${count}日` : "あなたの行にはなし";
}

// Your row as it was read, to hold against the calendar below.
function ScanStrip({
  caption,
  codes,
  unsureDays,
  picked,
  onPick,
}: {
  caption: string;
  codes: string[];
  unsureDays: number[];
  picked?: number;
  onPick: (day: number) => void;
}) {
  return (
    <figure className={css({ margin: 0 })}>
      <figcaption className={readText.caption}>{caption}</figcaption>
      <div className={readText.strip}>
        {codes.map((code, index) => {
          const day = index + 1;
          return (
            <button
              aria-label={`${day}日：${code}`}
              aria-pressed={picked === day}
              className={readText.day}
              data-unsure={unsureDays.includes(day) ? "" : undefined}
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
  source,
  patternKeys,
  onFix,
}: {
  date: Date;
  code: string;
  // Where the code was read: 勤務表 or 画像.
  source: string;
  shift?: Shift;
  unsure: boolean;
  patternKeys: Shift[];
  onFix: (shift: Shift) => void;
}) {
  return (
    <section className="im-fix">
      <p>
        <strong>{formatDay(date)}</strong>
        {source}では「{code}」{unsure ? "（自信なし）" : ""}
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
