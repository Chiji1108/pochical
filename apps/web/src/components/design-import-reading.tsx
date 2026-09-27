import { Check } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import type { CSSProperties } from "react";
import { css, cx } from "styled-system/css";

import type { ImportKind, ImportSample } from "../lib/design-import-sample";
import { Button, PageHeader } from "./design-ui";

// Waiting for a photo to be read. The picture stays in view while the
// reading finds the page, then the names and dates, then the codes, and
// last marks what it was unsure of, so the wait shows what it is doing
// and what the check after it will ask about.

const phaseLabels: Record<ImportKind, string[]> = {
  mine: [
    "画面を探しています",
    "月と日付を読んでいます",
    "シフトを読んでいます",
    "読み取りを見直しています",
  ],
  // Everyone's row is copied out, then the person's is found by the name
  // they typed and looked over: against the sheet's totals when it has
  // them, and for what a month can hold when it has none.
  roster: [
    "勤務表を探しています",
    "みんなの行を書き写しています",
    "あなたの行を探しています",
    "読み取りを見直しています",
  ],
};
// How long the prototype spends on each step, and on all of them done.
const phaseTimes = [1100, 1500, 1900, 1200];
const donePause = 600;

// The paper and ink of a printed roster, and a shift app's screen: both
// pictures of something else, so they keep their own colors in the dark.
const paper = {
  edge: "#d9d2c2",
  ground: "#fbf8f0",
  ink: "#2b2823",
  line: "#e6dfcf",
  unsure: "#f7e7a6",
};
const lit = "color-mix(in srgb, var(--accent) 24%, transparent)";

const picture = {
  cell: css({
    "&[data-lit]": { bg: lit },
    "&[data-unsure]": { bg: paper.unsure },
    alignItems: "center",
    borderLeft: `1px solid ${paper.line}`,
    borderTop: `1px solid ${paper.line}`,
    display: "flex",
    justifyContent: "center",
    lineHeight: 1,
    minWidth: 0,
    overflow: "hidden",
    transition: "background-color 0.35s ease-out",
    whiteSpace: "nowrap",
  }),
  day: css({
    "& > b": {
      borderRadius: "3px",
      fontWeight: 400,
      transition: "background-color 0.35s ease-out",
    },
    "&[data-lit] > b": { bg: lit },
    "&[data-unsure]": { bg: paper.unsure },
    alignItems: "center",
    borderRadius: "4px",
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    paddingBlock: "1px",
  }),
  head: css({ borderTop: 0, color: "#8c8577", fontFamily: "sans-serif" }),
  name: css({
    borderLeft: 0,
    justifyContent: "flex-start",
    paddingInline: "3px",
  }),
  paper: css({
    bg: paper.ground,
    border: `1px solid ${paper.edge}`,
    borderRadius: "4px",
    color: paper.ink,
    fontFamily: '"Hiragino Mincho ProN", serif',
    overflow: "hidden",
  }),
  // A whole sheet: its title over the table and a note under it, with
  // the table running off the right edge as a photo crops it.
  sheet: css({ padding: "10px 0 14px 10px" }),
  sheetTitle: css({
    display: "flex",
    fontWeight: 600,
    justifyContent: "space-between",
    margin: "0 10px 8px 0",
  }),
  sheetNote: css({ color: "#8c8577", margin: "8px 0 0" }),
  grid: css({ display: "grid" }),
  pill: css({
    "&[data-lit]": { boxShadow: "0 0 0 1.5px var(--accent)" },
    borderRadius: "3px",
    lineHeight: 1.3,
    textAlign: "center",
    transition: "box-shadow 0.35s ease-out",
    whiteSpace: "nowrap",
    width: "100%",
  }),
  screen: css({
    bg: "#ffffff",
    border: "1px solid #e3e3e8",
    borderRadius: "10px",
    color: "#1c1c1e",
    display: "flex",
    flexDirection: "column",
    fontFamily: "-apple-system, sans-serif",
    gap: "3px",
    overflow: "hidden",
    padding: "6px",
  }),
  screenBar: css({
    "&[data-lit]": { bg: lit },
    alignItems: "center",
    borderRadius: "4px",
    display: "flex",
    fontWeight: 700,
    justifyContent: "space-between",
    paddingInline: "4px",
    transition: "background-color 0.35s ease-out",
  }),
  screenGrid: css({
    display: "grid",
    gap: "2px",
    gridTemplateColumns: "repeat(7, 1fr)",
  }),
  weekday: css({ color: "#8e8e93", textAlign: "center" }),
};

// A shift app's colors for its own shift names.
const pillColors: Record<string, [string, string]> = {
  休み: ["#eeeeef", "#6b6b70"],
  日勤: ["#cdeefd", "#0b5a7a"],
  早番: ["#ffe2b8", "#8a4b00"],
  有休: ["#fbd3e3", "#8a1f4f"],
  遅番: ["#d6dcff", "#2f3b8f"],
};

// The printed roster the camera saw. `phase` lights what the reading has
// got to; without it the sheet is only a picture, as on the choice of
// what to read.
export function RosterPicture({
  sample,
  phase,
  rows = sample.rows.length,
  days = sample.rows[0]?.codes.length ?? 0,
  size = 7,
  title,
}: {
  sample: ImportSample;
  phase?: number;
  rows?: number;
  days?: number;
  size?: number;
  // The sheet's heading, drawing the whole sheet rather than a corner.
  title?: string;
}) {
  const at = phase ?? -1;
  const unsureRow = sample.rows[sample.myRow];
  const table = (
    <div
      className={picture.grid}
      style={{
        gridAutoRows: `${size * 1.9}px`,
        gridTemplateColumns: `${size * 5}px repeat(${days}, minmax(${size * 1.4}px, 1fr))`,
      }}
    >
      <span className={cx(picture.cell, picture.name, picture.head)} />
      {Array.from({ length: days }, (_, index) => (
        <span className={cx(picture.cell, picture.head)} key={index}>
          {index + 1}
        </span>
      ))}
      {sample.rows.slice(0, rows).map((row, rowIndex) => (
        <RosterLine
          at={at}
          days={days}
          key={row.printed}
          row={row}
          rowIndex={rowIndex}
          unsureDays={row === unsureRow ? sample.unsureDays : []}
        />
      ))}
    </div>
  );
  if (title === undefined) {
    return (
      <div className={picture.paper} style={{ fontSize: `${size}px` }}>
        {table}
      </div>
    );
  }
  return (
    <div
      className={cx(picture.paper, picture.sheet)}
      style={{ fontSize: `${size}px` }}
    >
      <p className={picture.sheetTitle} style={{ fontSize: `${size * 1.5}px` }}>
        {title}
        <span style={{ fontSize: `${size}px` }}>3階東病棟</span>
      </p>
      {table}
      <p className={picture.sheetNote}>
        ※ 希望休は前月15日までに提出してください
      </p>
    </div>
  );
}

function RosterLine({
  row,
  rowIndex,
  days,
  at,
  unsureDays,
}: {
  row: ImportSample["rows"][number];
  rowIndex: number;
  days: number;
  at: number;
  unsureDays: number[];
}) {
  return (
    <>
      <span
        className={cx(picture.cell, picture.name)}
        data-lit={at >= 1 && !(at >= 3 && row.unsure) ? "" : undefined}
        data-unsure={at >= 3 && row.unsure ? "" : undefined}
        style={delay(rowIndex * 140)}
      >
        {row.printed}
      </span>
      {row.codes.slice(0, days).map((code, index) => {
        const unsure = at >= 3 && unsureDays.includes(index + 1);
        return (
          <span
            className={picture.cell}
            data-lit={at >= 2 && !unsure ? "" : undefined}
            data-unsure={unsure ? "" : undefined}
            // oxlint-disable-next-line react/no-array-index-key -- a day's place in the row is the day.
            key={index}
            style={delay(index * 40 + rowIndex * 60)}
          >
            {code}
          </span>
        );
      })}
    </>
  );
}

// Another app's month, as a screenshot of it.
export function ScreenPicture({
  sample,
  month,
  phase,
  weeks,
  size = 7,
}: {
  sample: ImportSample;
  month: Date;
  phase?: number;
  weeks?: number;
  size?: number;
}) {
  const at = phase ?? -1;
  const codes = sample.rows[sample.myRow]?.codes ?? [];
  const lead = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const cells = [
    ...Array.from({ length: lead }, () => undefined),
    ...codes.map((code, index) => ({ code, day: index + 1 })),
  ].slice(0, weeks === undefined ? undefined : weeks * 7);
  return (
    <div className={picture.screen} style={{ fontSize: `${size}px` }}>
      <div
        className={picture.screenBar}
        data-lit={at >= 1 ? "" : undefined}
        style={{ fontSize: `${size * 1.3}px` }}
      >
        <span aria-hidden="true">‹</span>
        {month.getFullYear()}年{month.getMonth() + 1}月
        <span aria-hidden="true">›</span>
      </div>
      <div className={picture.screenGrid}>
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
          <span className={picture.weekday} key={day}>
            {day}
          </span>
        ))}
        {cells.map((cell, index) => {
          if (!cell) {
            // oxlint-disable-next-line react/no-array-index-key -- the blanks before the 1st have only their place.
            return <span key={`blank-${index}`} />;
          }
          const unsure = at >= 3 && sample.unsureDays.includes(cell.day);
          const [ground, ink] = pillColors[cell.code] ?? ["#eeeeef", "#333"];
          return (
            <span
              className={picture.day}
              data-lit={at >= 1 ? "" : undefined}
              data-unsure={unsure ? "" : undefined}
              key={cell.day}
            >
              <b style={delay(cell.day * 25)}>{cell.day}</b>
              <span
                className={picture.pill}
                data-lit={at >= 2 && !unsure ? "" : undefined}
                style={{
                  ...delay(Math.floor(index / 7) * 180 + (index % 7) * 30),
                  background: ground,
                  color: ink,
                }}
              >
                {cell.code}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// A step before the one under way is done, the one after is to come.
function stepState(index: number, phase: number) {
  if (index < phase) {
    return "done";
  }
  return index === phase ? "active" : "pending";
}

const delay = (ms: number): CSSProperties => ({ transitionDelay: `${ms}ms` });

const reading = {
  // A screenshot stands upright, as narrow as a phone.
  frame: css({
    "&[data-kind=mine]": { width: "72%" },
    alignSelf: "center",
    margin: "4px 0 0",
    padding: "12px",
    position: "relative",
    width: "100%",
  }),
  // The photo, a little askew, as photos of paper are.
  photo: css({
    "[data-kind=roster] > &": { transform: "rotate(-1.2deg)" },
    borderRadius: "6px",
    boxShadow: "0 10px 28px -12px var(--shadow-strong)",
    overflow: "hidden",
    position: "relative",
  }),
  beam: css({
    "@media (prefers-reduced-motion: reduce)": { display: "none" },
    animation: "scanSweep 1.7s ease-in-out infinite alternate",
    background:
      "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--accent) 30%, transparent) 70%, var(--accent) 96%, transparent)",
    height: "20%",
    inset: "0 0 auto",
    pointerEvents: "none",
    position: "absolute",
  }),
  corners: css({
    "&[data-searching]": {
      "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      animation: "searchCorners 1.1s ease-in-out infinite",
    },
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
    transition: "opacity 0.3s",
  }),
  corner: css({
    borderColor: "accent",
    borderStyle: "solid",
    borderWidth: 0,
    height: "18px",
    position: "absolute",
    width: "18px",
  }),
  steps: css({
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    listStyle: "none",
    margin: "8px 0 0",
    padding: "0 8px",
  }),
  step: css({
    "& small": { color: "text3", fontSize: "12px", marginLeft: "auto" },
    "&[data-state=pending]": { color: "text3" },
    alignItems: "center",
    color: "text",
    display: "flex",
    fontSize: "14px",
    gap: "10px",
  }),
  icon: css({
    "&[data-state=active]": {
      "@media (prefers-reduced-motion: reduce)": { animation: "none" },
      animation: "spin 0.8s linear infinite",
      borderColor: "fill2",
      borderTopColor: "accent",
    },
    "&[data-state=done]": {
      bg: "accentFill",
      borderColor: "accentFill",
      color: "onAccentFill",
    },
    alignItems: "center",
    border: "2px solid token(colors.separator)",
    borderRadius: "50%",
    display: "flex",
    flexShrink: 0,
    height: "20px",
    justifyContent: "center",
    width: "20px",
  }),
  lead: css({
    color: "text3",
    fontSize: "13px",
    lineHeight: 1.6,
    margin: "-4px 4px 0",
  }),
  cancel: css({ marginTop: "auto" }),
};

const cornerSides: CSSProperties[] = [
  {
    borderLeftWidth: 3,
    borderTopLeftRadius: 6,
    borderTopWidth: 3,
    left: 0,
    top: 0,
  },
  {
    borderRightWidth: 3,
    borderTopRightRadius: 6,
    borderTopWidth: 3,
    right: 0,
    top: 0,
  },
  {
    borderBottomLeftRadius: 6,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    bottom: 0,
    left: 0,
  },
  {
    borderBottomRightRadius: 6,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    bottom: 0,
    right: 0,
  },
];

export function ImportReading({
  kind,
  month,
  sample,
  onDone,
  onCancel,
  holdAt,
  rowName,
}: {
  kind: ImportKind;
  month: Date;
  sample: ImportSample;
  onDone: () => void;
  onCancel: () => void;
  // The person's row as found, named as the sheet has it.
  rowName?: string;
  // For the flow diagrams: a step to stay on.
  holdAt?: number;
}) {
  const [phase, setPhase] = useState(holdAt ?? 0);
  const finish = useEffectEvent(onDone);
  useEffect(() => {
    if (holdAt !== undefined) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (phase >= phaseTimes.length) {
        finish();
      } else {
        setPhase(phase + 1);
      }
    }, phaseTimes[phase] ?? donePause);
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase, holdAt]);

  const days = sample.rows[sample.myRow]?.codes.length ?? 0;
  const unsure =
    sample.unsureDays.length + sample.rows.filter((row) => row.unsure).length;
  const details = [
    undefined,
    kind === "roster" ? `${sample.rows.length}人` : `${month.getMonth() + 1}月`,
    kind === "roster" && rowName !== undefined ? rowName : `${days}日分`,
    unsure > 0 ? `自信のない所 ${unsure}か所` : undefined,
  ];
  return (
    <div className="dc-content st-screen">
      <div className="st-scroll im-page">
        <PageHeader title="読み取っています" />
        <p className={reading.lead}>
          終わったら、カレンダーに入れる前に確かめる画面を開きます。
        </p>
        <figure className={reading.frame} data-kind={kind}>
          <div className={reading.photo}>
            {kind === "roster" ? (
              <RosterPicture
                phase={phase}
                sample={sample}
                size={10}
                title={`${month.getMonth() + 1}月 勤務表`}
              />
            ) : (
              <ScreenPicture
                month={month}
                phase={phase}
                sample={sample}
                size={9}
              />
            )}
            {phase < 3 && <div aria-hidden="true" className={reading.beam} />}
          </div>
          <div
            aria-hidden="true"
            className={reading.corners}
            data-searching={phase === 0 ? "" : undefined}
          >
            {cornerSides.map((side, index) => (
              // oxlint-disable-next-line react/no-array-index-key -- four fixed corners.
              <span className={reading.corner} key={index} style={side} />
            ))}
          </div>
        </figure>
        <ol aria-live="polite" className={reading.steps}>
          {phaseLabels[kind].map((label, index) => {
            const state = stepState(index, phase);
            return (
              <li className={reading.step} data-state={state} key={label}>
                <span className={reading.icon} data-state={state}>
                  {state === "done" && <Check size={12} strokeWidth={3} />}
                </span>
                {label}
                {state === "done" && details[index] && (
                  <small>{details[index]}</small>
                )}
              </li>
            );
          })}
        </ol>
        <Button className={reading.cancel} onClick={onCancel} variant="subtle">
          やめる
        </Button>
      </div>
    </div>
  );
}
