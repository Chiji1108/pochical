import { useContext } from "react";
import { css, cva } from "styled-system/css";

import type { WidgetDay, WidgetEntry } from "../lib/design-widgets";
import { dayParts } from "./design-day-cell";
import { useWeek } from "./design-week";
import {
  Change,
  NAME_ROOM,
  NamedMark,
  SpokenDay,
  WidgetSizeContext,
  newsWords,
  useShiftNames,
  useWords,
} from "./design-widgets";

// シンプル: today alone, large, and today beside tomorrow.

// ── シンプル ─────────────────────────────────────────────────────────────

export const simple = {
  // Today's date in bold, as a card dates itself.
  date: css({ fontWeight: 700, textStyle: "headline", whiteSpace: "nowrap" }),
  day: css({
    alignItems: "center",
    display: "flex",
    flex: 1,
    flexDirection: "column",
    gap: "12px",
    // The whole height, alone in the small one too, to center in.
    height: "100%",
    justifyContent: "center",
    minWidth: 0,
    textAlign: "center",
  }),
  // Over tomorrow, a label rather than a date: in English small spaced
  // capitals, an English heading's way; Japanese has no capitals, and
  // spacing two small kanji only leaves a gap between them, so there
  // it is a size larger and heavier, unspaced. As tall as the date's
  // line either way, so the marks stay level.
  label: cva({
    base: { color: "text.secondary", lineHeight: "22px", whiteSpace: "nowrap" },
    variants: {
      english: {
        false: { fontSize: "13px", fontWeight: 600 },
        true: {
          fontSize: "11px",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
        },
      },
    },
  }),
  mark: css({ display: "flex" }),
  pair: css({ display: "flex", gap: "16px", height: "100%" }),
  rule: css({ bg: "separator", flexShrink: 0, width: "1px" }),
  words: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 400,
    letterSpacing: "0.02em",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textStyle: "subheadline",
    whiteSpace: "nowrap",
  }),
};

// Where the widget is taller, as on Android's launcher, its marks grow.
const SIMPLE_ROOMY = 150;
// How much larger a mark draws with nothing said under it.
const QUIET_GROWTH = 12;

// A day plainly: its date, its mark large, and only what changed under
// it, as one group in the middle of its room. A day with nothing changed
// is its own design, not one with an empty line kept for words: its mark
// grows and the group closes up round it.
function SimpleDay({ day, label }: { day: WidgetDay; label?: string }) {
  const words = useWords();
  const { english } = useWeek();
  const named = useShiftNames();
  const said = newsWords(day) !== undefined;
  const roomy = useContext(WidgetSizeContext).height >= SIMPLE_ROOMY;
  const base = roomy ? 64 : 48;
  let size = said ? base : base + QUIET_GROWTH;
  if (named) {
    size -= NAME_ROOM + 2;
  }
  // A memo is the calendar's stroke under the date (or 明日); its words
  // are the app's.
  const noted = day.noted ? dayParts.noted : undefined;
  return (
    <div className={simple.day}>
      <SpokenDay day={day} />
      {label ? (
        <span aria-hidden="true" className={simple.label({ english })}>
          <span className={noted}>{label}</span>
        </span>
      ) : (
        <span aria-hidden="true" className={simple.date}>
          <span className={noted}>{words.short(day.date)}</span>
        </span>
      )}
      <span aria-hidden="true" className={simple.mark}>
        <NamedMark day={day} large named={named} size={size} />
      </span>
      {said && (
        <Change
          className={simple.words}
          day={day}
          spoken={false}
          withName={false}
        />
      )}
    </div>
  );
}

// Today alone, a day off by its mark as any day: which day off it is
// (公休, 有給) is the mark's to say. The poodle and おやすみ are
// 次の休み's, the kind about days off.
export function SimpleSmall({ entry }: { entry: WidgetEntry }) {
  return <SimpleDay day={entry.today} />;
}

// Today and tomorrow, side by side.
export function SimpleMedium({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const [, tomorrow] = entry.upcoming;
  return (
    <div className={simple.pair}>
      <SimpleDay day={entry.today} />
      <span aria-hidden="true" className={simple.rule} />
      {tomorrow && <SimpleDay day={tomorrow} label={words.tomorrow} />}
    </div>
  );
}
