import { useContext, useLayoutEffect, useRef, useState } from "react";
import { css, cva, cx } from "styled-system/css";

import { presetPatterns } from "../lib/design-patterns";
import { columnHours, withoutWholeHours } from "../lib/design-widgets";
import type {
  WidgetDay,
  WidgetEntry,
  WidgetPair,
  WidgetPersonDay,
} from "../lib/design-widgets";
import { dayName } from "../lib/text-limits";
import { dayParts } from "./design-day-cell";
import { MemberLook, PhotoAvatar } from "./design-group-parts";
import { shortMonthOf } from "./design-month-name";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";
import {
  firstRunOr,
  Change,
  MONTH_NUMBER,
  NAME_ROOM,
  NamedMark,
  SpokenDay,
  WidgetRenderingModeContext,
  WidgetSizeContext,
  dayMark,
  list,
  newsWords,
  toneText,
  useOffLook,
  useShiftNames,
  useWords,
} from "./design-widgets";
import { simple } from "./design-widgets-simple";
import {
  MarkGlyph,
  ShiftMarkStyleContext,
  useDisplayColor,
} from "./shift-mark";

// これから: today's mark over the next days, and the five days from today
// a column each, with someone's beside them if picked.

// ── これから ─────────────────────────────────────────────────────────────

const upcoming = {
  change: css({
    color: "text.secondary",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 400,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "footnote",
    whiteSpace: "nowrap",
  }),
  head: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    justifyContent: "center",
  }),
  headText: css({
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  }),
  // Today's line and the three days as one group in the middle, not
  // pushed to the top and bottom with a gap between.
  small: css({
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    height: "100%",
    justifyContent: "center",
  }),
};

// Today's mark large beside its date and what changed, the two together
// in the middle, over the days after it centered as well. A memo is the
// calendar's stroke under the date.
function UpcomingHead({ day }: { day: WidgetDay }) {
  const words = useWords();
  const named = useShiftNames();
  const said = newsWords(day) !== undefined;
  let size = said ? 34 : 40;
  if (named) {
    size -= NAME_ROOM;
  }
  return (
    <div className={upcoming.head}>
      <SpokenDay day={day} />
      <span aria-hidden="true">
        <NamedMark day={day} large named={named} size={size} />
      </span>
      <span aria-hidden="true" className={upcoming.headText}>
        <span className={simple.date}>
          <span className={cx(day.noted && dayParts.noted)}>
            {words.short(day.date)}
          </span>
        </span>
        {said && (
          <Change
            className={upcoming.change}
            day={day}
            spoken={false}
            withName={false}
          />
        )}
      </span>
    </div>
  );
}

// Today's line, and the next three days' marks under it; set to someone,
// today and tomorrow, theirs under the person's.
function UpcomingSmallView({ entry }: { entry: WidgetEntry }) {
  if (entry.pair) {
    return <DayColumns count={2} entry={entry} />;
  }
  return (
    <div className={upcoming.small}>
      <UpcomingHead day={entry.today} />
      <NextDays days={entry.upcoming.slice(1, 4)} />
    </div>
  );
}

// Five days from today, a column each; set to someone, theirs under the
// person's.
function UpcomingMediumView({ entry }: { entry: WidgetEntry }) {
  return <DayColumns count={5} entry={entry} />;
}

// ── これから's days ─────────────────────────────────────────────────────

// Where the widget is taller, as on Android's launcher, the marks grow.
const COLUMNS_ROOMY = 150;
const FACE_SIZE = 24;

// A day off's tile, a little in from its cell: the pattern's own tint, as
// the person's calendar draws it; beside someone, the テーマ's light tint
// whatever the pattern, as the group's tables draw it, and a day both are
// off joins the tiles down the column into one band. Faint where the
// system draws in one color.
const columnTile = {
  borderRadius: "sm",
  content: '""',
  inset: "3px",
  position: "absolute",
  zIndex: -1,
} as const;

// The line's room from the column's sides, as the day-off tile's.
const WORDS_INSET = 3;

const columns = {
  // A whole column's tile, its date in it as a calendar's day off has:
  // as far in from its column as the tiles are from their cells.
  band: cva({
    base: {
      "&::before": { ...columnTile, inset: "0 3px", zIndex: 0 },
      position: "relative",
    },
    variants: {
      tint: {
        accent: { "&::before": { bg: "accent.container" } },
        flat: { "&::before": { bg: "rgb(255 255 255 / 0.24)" } },
        own: { "&::before": { bg: "var(--off-tint)" } },
      },
    },
  }),
  // The mark in the middle of its cell, and what changed hanging under
  // it, so the marks of a row stay level whatever is said under them.
  // Two rows are too short to hang words, so there the mark and its words
  // close up in the middle, as the group's tables have them.
  cell: cva({
    base: {
      isolation: "isolate",
      justifyItems: "center",
      minWidth: 0,
      position: "relative",
    },
    variants: {
      compact: {
        false: { display: "grid", gridTemplateRows: "1fr auto 1fr" },
        true: {
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          justifyContent: "center",
        },
      },
      tile: {
        accent: { "&::before": { ...columnTile, bg: "accent.container" } },
        flat: {
          "&::before": { ...columnTile, bg: "rgb(255 255 255 / 0.24)" },
        },
        none: {},
      },
    },
  }),
  // The weekday over the date, as the calendar heads its columns, so the
  // date sits right over its mark as in the calendar's day.
  date: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    paddingBlock: "4px 2px",
    position: "relative",
  }),
  face: css({
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
  }),
  grid: css({ columnGap: "2px", display: "grid", height: "100%" }),
  mark: css({ alignSelf: "center", display: "flex", gridRow: 2 }),
  // Today's month, small beside its day, so it fits a narrow column.
  month: css({ fontSize: "10px", fontWeight: 500, marginRight: "2px" }),
  number: cva({
    base: {
      fontVariantNumeric: "tabular-nums",
      fontWeight: 600,
      whiteSpace: "nowrap",
    },
    variants: {
      compact: {
        false: { fontSize: "15px", lineHeight: "20px" },
        true: { fontSize: "13px", lineHeight: "16px" },
      },
    },
  }),
  weekday: css({ lineHeight: "13px", textStyle: "caption2" }),
  // The column's whole width, which its one line shrinks to.
  words: cva({
    base: {
      color: "text.secondary",
      display: "flex",
      fontVariantNumeric: "tabular-nums",
      justifyContent: "center",
      overflow: "hidden",
      paddingInline: `${WORDS_INSET}px`,
      whiteSpace: "nowrap",
      width: "100%",
    },
    variants: {
      compact: {
        false: {
          alignSelf: "start",
          gridRow: 3,
          lineHeight: "12px",
          paddingTop: "2px",
        },
        true: { letterSpacing: "-0.02em", lineHeight: "11px" },
      },
    },
  }),
  line: css({ display: "inline-block" }),
};

// A column's words, and beside someone's row, a size smaller.
const COLUMN_WORDS = 10;
const COMPACT_WORDS = 9;

// The words under a mark: what changed, else its name when names are
// shown.
function columnWords(
  change: string | undefined,
  name: string | undefined,
  named: boolean
) {
  if (change !== undefined) {
    return change;
  }
  return named && name !== undefined ? dayName(name) : undefined;
}

// A column's one line of words, at its size or shrunk to the column, as
// SwiftUI's minimumScaleFactor does, down to 8pt; too wide even so, the
// hours go without their :00 (7〜20). The widget's width keys it, so a column of
// another width measures again from the start.
function ColumnLine({ words, compact }: { words: string; compact: boolean }) {
  const { width } = useContext(WidgetSizeContext);
  return (
    <FittedLine
      compact={compact}
      key={`${words} ${width}`}
      shorter={withoutWholeHours(words)}
      words={words}
    />
  );
}

// How small a column's line may go before it is written shorter: under
// 8pt the hours no longer read.
const MIN_LINE_SIZE = 8;
function FittedLine({
  words,
  shorter,
  compact,
}: {
  words: string;
  shorter: string;
  compact: boolean;
}) {
  const size = compact ? COMPACT_WORDS : COLUMN_WORDS;
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState({ size, text: words });
  useLayoutEffect(() => {
    const line = ref.current;
    const column = line?.parentElement;
    if (!line || !column) {
      return;
    }
    // Both in the column's own units, whatever zoom draws it at.
    const room = column.clientWidth - 2 * WORDS_INSET;
    const natural = (line.offsetWidth * size) / shown.size;
    const scale = Math.min(1, room / natural);
    if (size * scale < MIN_LINE_SIZE && shown.text !== shorter) {
      setShown({ size, text: shorter });
      return;
    }
    const fit = Math.floor(size * scale * 10) / 10;
    if (fit !== shown.size) {
      setShown({ size: fit, text: shown.text });
    }
  }, [shorter, shown, size]);
  return (
    <span aria-hidden="true" className={columns.words({ compact })}>
      <span className={columns.line} ref={ref} style={{ fontSize: shown.size }}>
        {shown.text}
      </span>
    </span>
  );
}

// A date as a column heads it: the day of the month, with its month on
// today's column alone. Five days that run into the next month say so
// plainly (29 30 1), and a month on the 1st too broke the quiet row.
function ColumnDate({
  date,
  first,
  english,
}: {
  date: Date;
  first: boolean;
  english: boolean;
}) {
  if (!first) {
    return <>{date.getDate()}</>;
  }
  const month = english
    ? (shortMonthOf(date, true) ?? "")
    : `${date.getMonth() + MONTH_NUMBER}/`;
  return (
    <>
      <span className={columns.month}>{month}</span>
      {date.getDate()}
    </>
  );
}

// Days from today in columns, as a week reads across: each date under its
// weekday (THU in English: the days start from today, not the week's
// start, so one letter could be either T), the mark large under it, and
// only what changed under the mark. A day off is a tile down its whole
// column, date and all, as the calendar's day is. Today is always the
// first, so it is drawn plain. A memo is the calendar's stroke under the
// date; its words are the app's.
//
// Set to someone, it is the group's 週ごと in small: the person's row and
// theirs, each with their face in a first column as wide as the days',
// on the group tables' tiles, a band down a day both are off.
function DayColumns({ entry, count }: { entry: WidgetEntry; count: number }) {
  const named = useShiftNames();
  const roomy = useContext(WidgetSizeContext).height >= COLUMNS_ROOMY;
  const { pair } = entry;
  const days = entry.upcoming.slice(0, count);
  const worded = days.some(
    (day, index) =>
      day.change !== undefined ||
      (named && day.name !== undefined) ||
      (pair?.days[index]?.theirs?.early ?? false) ||
      (pair?.days[index]?.theirs?.late ?? false)
  );
  let size = roomy ? 44 : 36;
  if (named) {
    size -= NAME_ROOM;
  }
  if (pair) {
    const grown = roomy ? 32 : 26;
    size = named || worded ? grown - 6 : grown;
  }
  const offset = pair ? 2 : 1;
  return (
    <div
      className={columns.grid}
      style={{
        // The faces take a column as wide as a day's, so the columns keep
        // one rhythm and the widget's two sides the same room.
        gridTemplateColumns: `repeat(${count + offset - 1}, 1fr)`,
        gridTemplateRows: pair ? "auto 1fr 1fr" : "auto 1fr",
      }}
    >
      {days.map((day, index) => (
        <ColumnDay
          column={index + offset}
          day={day}
          first={index === 0}
          key={day.date.getTime()}
          named={named}
          pair={pair}
          shown={pair?.days[index]}
          size={size}
        />
      ))}
      {pair && (
        <>
          <span className={columns.face} style={{ gridColumn: 1, gridRow: 2 }}>
            <PhotoAvatar
              me
              name={pair.me.name}
              photo={pair.me.photo}
              size={FACE_SIZE}
            />
            <span className={srOnly}>{pair.me.name}</span>
          </span>
          <span className={columns.face} style={{ gridColumn: 1, gridRow: 3 }}>
            <PhotoAvatar
              name={pair.with.name}
              photo={pair.with.photo}
              size={FACE_SIZE}
            />
            <span className={srOnly}>{pair.with.name}</span>
          </span>
        </>
      )}
    </div>
  );
}

function ColumnDay({
  day,
  column,
  first,
  named,
  size,
  pair,
  shown,
}: {
  day: WidgetDay;
  column: number;
  first: boolean;
  named: boolean;
  size: number;
  pair?: WidgetPair;
  shown?: WidgetPair["days"][number];
}) {
  const words = useWords();
  const { english } = useWeek();
  const flat = useContext(WidgetRenderingModeContext) !== "fullColor";
  // A day off left empty stays empty: a day with nothing entered has its
  // dash here, so the two still read apart.
  const look = useOffLook(day, false);
  const { tint } = useDisplayColor(day.color ?? presetPatterns.off.color);
  const together = shown?.together ?? false;
  const theirs = shown?.theirs;
  // Beside someone, each day off is the group tables' tile in its cell.
  const tileOf = (off: boolean) => {
    if (!off || together) {
      return "none";
    }
    return flat ? "flat" : "accent";
  };
  // Alone, the person's calendar's tile down the column; beside someone,
  // the band on a day both are off.
  let band: "accent" | "own" | "flat" | undefined;
  if (together) {
    band = flat ? "flat" : "accent";
  } else if (!pair && day.off && look.tile) {
    band = flat ? "flat" : "own";
  }
  const moved = day.change === undefined ? undefined : columnHours(day);
  // Alone, the name is the label under the mark and the words are only
  // what changed; beside someone, one line holds either.
  const mine = pair ? columnWords(moved, day.name, named) : moved;
  const marked = day.shift !== undefined && look.mark !== "none";
  return (
    <>
      {band && (
        <span
          aria-hidden="true"
          className={columns.band({ tint: band })}
          style={{
            "--off-tint": tint,
            gridColumn: column,
            gridRow: "1 / -1",
          }}
        />
      )}
      <span
        className={columns.date}
        // On the tile, a memo's stroke takes the tile's color a step deeper.
        data-off={band === "own" ? "" : undefined}
        style={{
          "--off-tint": tint,
          gridColumn: column,
          gridRow: 1,
        }}
      >
        {together && <span className={srOnly}>ふたりとも休み</span>}
        <span
          aria-hidden="true"
          className={cx(columns.weekday, toneText({ tone: day.tone }))}
        >
          {words.weekday(day.date)}
        </span>
        <span
          aria-hidden="true"
          className={cx(
            columns.number({ compact: pair !== undefined }),
            day.holiday && dayParts.holiday
          )}
        >
          <span className={cx(day.noted && dayParts.noted)}>
            <ColumnDate date={day.date} english={english} first={first} />
          </span>
        </span>
      </span>
      <span
        className={columns.cell({
          compact: pair !== undefined,
          tile: pair ? tileOf(day.off) : "none",
        })}
        style={{ gridColumn: column, gridRow: 2 }}
      >
        <SpokenDay day={day} />
        <span aria-hidden="true" className={columns.mark}>
          {marked || !day.shift ? (
            <NamedMark
              day={day}
              faint={look.mark === "faint"}
              named={named && !pair}
              reserve
              size={size}
            />
          ) : null}
        </span>
        {mine !== undefined && (
          <ColumnLine compact={pair !== undefined} words={mine} />
        )}
      </span>
      {pair && (
        <span
          className={columns.cell({
            compact: true,
            tile: tileOf(theirs?.off ?? false),
          })}
          style={{ gridColumn: column, gridRow: 3 }}
        >
          <span className={srOnly}>
            {pair.with.name}さん {theirs?.name ?? "未入力"}
            {theirs?.time ? ` ${theirs.time}` : ""}
          </span>
          <span aria-hidden="true" className={columns.mark}>
            <TheirMark day={theirs} size={size} style={pair.with.style} />
          </span>
          {theirs && <TheirWords day={theirs} named={named} />}
        </span>
      )}
    </>
  );
}

function TheirWords({ day, named }: { day: WidgetPersonDay; named: boolean }) {
  const moved = day.early || day.late ? columnHours(day) : undefined;
  const shown = columnWords(moved, day.name, named);
  if (shown === undefined) {
    return null;
  }
  return <ColumnLine compact words={shown} />;
}

// Their mark in the shape they chose, in the viewer's テーマ, as the
// group's tables draw it; a quiet dash where they have not entered.
function TheirMark({
  day,
  size,
  style,
}: {
  day?: WidgetPersonDay;
  size: number;
  style?: WidgetPair["with"]["style"];
}) {
  if (!day) {
    return (
      <span
        aria-hidden="true"
        className={dayMark}
        style={{ height: size, width: size }}
      >
        –
      </span>
    );
  }
  return (
    <MemberLook member={{ style: style && { look: style } }}>
      <ViewerGlyph day={day} size={size} />
    </MemberLook>
  );
}

function ViewerGlyph({ day, size }: { day: WidgetPersonDay; size: number }) {
  const style = useContext(ShiftMarkStyleContext);
  return (
    <span aria-hidden="true" className={dayMark}>
      <MarkGlyph
        early={day.early}
        late={day.late}
        look={day.look}
        size={size}
        style={style}
      />
    </span>
  );
}

const nextDays = {
  day: css({
    alignItems: "center",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  }),
  root: css({
    borderTop: "1px solid token(colors.separator)",
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    paddingTop: "8px",
    width: "100%",
  }),
  weekday: css({ textStyle: "caption2" }),
};

// A row of days: each weekday over its mark.
function NextDays({ days }: { days: WidgetDay[] }) {
  const words = useWords();
  const named = useShiftNames();
  return (
    <ol className={`${list} ${nextDays.root}`}>
      {days.map((day) => (
        <li className={nextDays.day} key={day.date.getTime()}>
          <SpokenDay day={day} />
          <span
            aria-hidden="true"
            className={cx(nextDays.weekday, toneText({ tone: day.tone }))}
          >
            <span className={cx(day.noted && dayParts.noted)}>
              {words.weekday(day.date)}
            </span>
          </span>
          <NamedMark
            day={day}
            named={named}
            reserve
            size={named ? 24 - NAME_ROOM : 24}
          />
        </li>
      ))}
    </ol>
  );
}

// Two weeks keep to themselves in the middle; where there is room, as on
// Android's 4×2, their marks grow and the weeks stand further apart.

export const UpcomingSmall = firstRunOr(UpcomingSmallView);

export const UpcomingMedium = firstRunOr(UpcomingMediumView);
