import { useContext } from "react";
import { css, cx } from "styled-system/css";

import { presetPatterns } from "../lib/design-patterns";
import type { WidgetEntry, WidgetSpan } from "../lib/design-widgets";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";
import {
  DayMark,
  WidgetRenderingModeContext,
  firstRunOr,
  oneLine,
  useWords,
} from "./design-widgets";
import { circular } from "./design-widgets-lock";
import { FitText } from "./design-widgets-next-off";
import { useDisplayColor } from "./shift-mark";

// いまのシフト: how long the shift on now runs, else how soon the next one
// with hours starts, for long shifts like 当番 where the hour matters more
// than the day (spec/widgets.md). The words count as the system's clock
// keeps them on the phone (SwiftUI's Text(_, style: .relative)); here they
// are as at the entry's moment.

const minuteMilliseconds = 60_000;
const minutesPerHour = 60;

// How long until `to`, as the system writes a relative time: 3時間12分,
// 12分, or 3 hr, 12 min in English.
function durationWords(from: Date, to: Date, english: boolean) {
  const minutes = Math.max(
    0,
    Math.floor((to.getTime() - from.getTime()) / minuteMilliseconds)
  );
  const hours = Math.floor(minutes / minutesPerHour);
  const rest = minutes % minutesPerHour;
  if (english) {
    if (hours === 0) {
      return `${rest} min`;
    }
    return rest === 0 ? `${hours} hr` : `${hours} hr, ${rest} min`;
  }
  if (hours === 0) {
    return `${rest}分`;
  }
  return rest === 0 ? `${hours}時間` : `${hours}時間${rest}分`;
}

// A clock time without its leading zero: 8:30.
function clockWords(date: Date) {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// Whole days from one date to another's.
function daysFrom(from: Date, to: Date) {
  const day = (date: Date) =>
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((day(to) - day(from)) / (minuteMilliseconds * 1440));
}

// The words of いまのシフト, in Japanese or English.
function useNowWords() {
  const words = useWords();
  const { english } = useWeek();
  // When a shift ends: 18:00, 翌8:30 past midnight.
  const until = (span: WidgetSpan, at: Date) => {
    const later = daysFrom(at, span.end) > 0;
    if (english) {
      return `Until ${clockWords(span.end)}${later ? " tomorrow" : ""}`;
    }
    return `${later ? "翌" : ""}${clockWords(span.end)}まで`;
  };
  // When the next one starts: 8:30から today, 明日 8:30から, else its date.
  const from = (span: WidgetSpan, at: Date) => {
    const inDays = daysFrom(at, span.start);
    const clock = clockWords(span.start);
    if (english) {
      if (inDays === 0) {
        return `From ${clock}`;
      }
      return `${inDays === 1 ? "Tomorrow" : words.date(span.start)} ${clock}`;
    }
    if (inDays === 0) {
      return `${clock}から`;
    }
    // The date short, 9/26(土), to keep to the foot's one line.
    const date = span.start;
    const day =
      inDays === 1
        ? "明日"
        : `${date.getMonth() + 1}/${date.getDate()}(${words.weekday(date)})`;
    return `${day} ${clock}から`;
  };
  return {
    duration: (start: Date, end: Date) => durationWords(start, end, english),
    english,
    from,
    // In English the time left is said after it: 3 hr, 12 min left.
    left: english ? "left" : "あと",
    next: (name: string) => (english ? `Next: ${name}` : `次は${name}`),
    // How many days off the next one is, short for the round face: 2日後.
    daysOff: (inDays: number) =>
      english ? `${inDays} days` : words.inDays(inDays),
    none: english
      ? "No shifts with\nhours ahead"
      : "これからの勤務は\nまだ入っていません",
    on: (name: string) => (english ? `${name} now` : `${name}中`),
    soon: english ? "in" : "あと",
    until,
    words,
  };
}

// The small one's ring, round its mark between the words.
const SMALL_RING_SIZE = 64;
const SMALL_RING_STROKE = 6;

const now = {
  // The time left, large, on one line, shrinking to the widget's width.
  count: css({
    display: "block",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  }),
  // あと, or left in English, quiet over or after the count.
  lead: css({
    color: "text.secondary",
    fontWeight: 600,
    textStyle: "footnote",
  }),
  foot: css({
    color: "text.secondary",
    fontVariantNumeric: "tabular-nums",
    textStyle: "footnote",
  }),
  head: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    gap: "4px",
    minWidth: 0,
    textStyle: "footnote",
  }),
  none: css({
    color: "text.secondary",
    margin: "auto 0",
    textAlign: "center",
    textStyle: "footnote",
    whiteSpace: "pre-line",
  }),
  // On a shift, what is left of it as a ring round its mark in the
  // middle, the words under it.
  left: css({
    display: "block",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 1.2,
    whiteSpace: "nowrap",
  }),
  ring: css({ inset: 0, position: "absolute" }),
  ringed: css({
    alignSelf: "center",
    display: "grid",
    flexShrink: 0,
    height: "64px",
    placeItems: "center",
    position: "relative",
    width: "64px",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
  }),
  under: css({ display: "flex", flexDirection: "column", gap: "1px" }),
};

// What いまのシフト says now: on, with its end, or the next, with its
// start, as a countdown within a day or as the day further off.
function nowState(entry: WidgetEntry) {
  const { on, next, nextInDays, at } = entry.now;
  if (on) {
    return { at, kind: "on", span: on } as const;
  }
  if (next) {
    return { at, inDays: nextInDays, kind: "next", span: next } as const;
  }
  return { kind: "none" } as const;
}

// The whole of it as read aloud.
function useSpoken(entry: WidgetEntry) {
  const said = useNowWords();
  const state = nowState(entry);
  if (state.kind === "none") {
    return said.none.replace("\n", "");
  }
  const name = state.span.day.name ?? "";
  if (state.kind === "on") {
    return `${said.on(name)}、${said.left}${said.duration(state.at, state.span.end)}、${said.until(state.span, state.at)}`;
  }
  const when =
    state.inDays === undefined
      ? `${said.soon}${said.duration(state.at, state.span.start)}`
      : said.words.inDays(state.inDays);
  return `${said.next(name)}、${when}、${said.from(state.span, state.at)}`;
}

// The time left large, with あと over it (left after it in English); the
// next further off than a day, the day it comes (3日後).
function Count({
  lead,
  words,
  trail,
  size,
}: {
  lead?: string;
  words: string;
  trail?: string;
  size: number;
}) {
  return (
    <span>
      {lead && <span className={now.lead}>{lead}</span>}
      <FitText className={now.count} key={words} size={size}>
        {words}
      </FitText>
      {trail && <span className={now.lead}>{trail}</span>}
    </span>
  );
}

function NowSmallView({ entry }: { entry: WidgetEntry }) {
  const said = useNowWords();
  const spoken = useSpoken(entry);
  const state = nowState(entry);
  if (state.kind === "none") {
    return (
      <div className={now.root}>
        <span className={srOnly}>{spoken}</span>
        <span aria-hidden="true" className={now.none}>
          {said.none}
        </span>
      </div>
    );
  }
  const { span, at } = state;
  const name = span.day.name ?? "";
  if (state.kind === "on") {
    const left = said.duration(at, span.end);
    return (
      <div className={now.root}>
        <span className={srOnly}>{spoken}</span>
        <span aria-hidden="true" className={now.head}>
          <DayMark day={span.day} size={18} />
          <span className={oneLine}>{said.on(name)}</span>
        </span>
        <span aria-hidden="true" className={now.ringed}>
          <ShiftRing at={at} span={span} />
          <DayMark day={span.day} size={30} />
        </span>
        <span aria-hidden="true" className={now.under}>
          <FitText className={now.left} key={left} size={15}>
            {said.english ? `${left} left` : `あと${left}`}
          </FitText>
          <span className={now.foot}>{said.until(span, at)}</span>
        </span>
      </div>
    );
  }
  const far = state.inDays;
  const lead = said.english ? undefined : said.left;
  return (
    <div className={now.root}>
      <span className={srOnly}>{spoken}</span>
      <span aria-hidden="true" className={now.head}>
        <DayMark day={span.day} size={18} />
        <span className={oneLine}>{said.next(name)}</span>
      </span>
      <span aria-hidden="true">
        {far === undefined ? (
          <Count lead={lead} size={30} words={said.duration(at, span.start)} />
        ) : (
          <Count size={36} words={said.words.inDays(far)} />
        )}
      </span>
      <span aria-hidden="true" className={now.foot}>
        {said.from(span, at)}
      </span>
    </div>
  );
}

// The small one's ring in the shift's own color, as its mark, unless
// the system draws the widget in one color.
function ShiftRing({ span, at }: { span: WidgetSpan; at: Date }) {
  const { color } = useDisplayColor(span.day.color ?? presetPatterns.off.color);
  const accented = useContext(WidgetRenderingModeContext) === "accented";
  return (
    <span className={now.ring} style={accented ? undefined : { color }}>
      <Ring
        className={now.ring}
        share={leftOf(span, at)}
        size={SMALL_RING_SIZE}
        stroke={SMALL_RING_STROKE}
      />
    </span>
  );
}

export const NowSmall = firstRunOr(NowSmallView);

// ── Lock screen ─────────────────────────────────────────────────────────

const lock = {
  // On the lock screen's own round ground, as the other round widgets.
  circle: css({ gap: "1px", position: "relative" }),
  // The shift's run as a ring round the face, as the system's gauge draws
  // a ProgressView(timerInterval:) on the lock screen.
  ring: css({
    inset: 0,
    pointerEvents: "none",
    position: "absolute",
  }),
  rect: css({
    display: "flex",
    flexDirection: "column",
    gap: "1px",
    height: "100%",
    justifyContent: "center",
    minWidth: 0,
  }),
  rectCount: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 1.15,
    textStyle: "headline",
  }),
  rectHead: css({
    alignItems: "center",
    display: "flex",
    fontWeight: 600,
    gap: "4px",
    textStyle: "caption",
  }),
  rectFoot: css({ opacity: 0.75, textStyle: "caption" }),
  word: css({
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    textStyle: "caption2",
  }),
};

// The lock screen's round face, and the stroke its ring is drawn in.
const RING_SIZE = 72;
const RING_STROKE = 5;

// How much of the shift is left at `at`, 1 to 0.
function leftOf(span: WidgetSpan, at: Date) {
  const whole = span.end.getTime() - span.start.getTime();
  const left = (span.end.getTime() - at.getTime()) / whole;
  return Math.min(1, Math.max(0, left));
}

// What is left of the shift as a ring, draining as it runs, as the
// system's ProgressView(timerInterval:) counts down by default, and as
// the words count あと: full as it starts, gone as it ends.
function Ring({
  share,
  size = RING_SIZE,
  stroke = RING_STROKE,
  className = lock.ring,
}: {
  share: number;
  size?: number;
  stroke?: number;
  className?: string;
}) {
  const radius = (size - stroke) / 2;
  const around = 2 * Math.PI * radius;
  const middle = size / 2;
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox={`0 0 ${size} ${size}`}
    >
      <circle
        cx={middle}
        cy={middle}
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={stroke}
      />
      <circle
        cx={middle}
        cy={middle}
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeDasharray={`${around * share} ${around}`}
        strokeLinecap="round"
        strokeWidth={stroke}
        transform={`rotate(-90 ${middle} ${middle})`}
      />
    </svg>
  );
}

// The round one: on a shift, its run as a ring round its mark; else the
// next one's mark over when it starts (8:30), or the day further off.
function NowCircularView({ entry }: { entry: WidgetEntry }) {
  const said = useNowWords();
  const spoken = useSpoken(entry);
  const state = nowState(entry);
  if (state.kind === "none") {
    return (
      <div className={cx(circular.root, lock.circle)}>
        <span className={srOnly}>{spoken}</span>
        <span aria-hidden="true" className={lock.word}>
          –
        </span>
      </div>
    );
  }
  const { span, at } = state;
  let word: string | undefined;
  if (state.kind === "next") {
    word =
      state.inDays === undefined
        ? clockWords(span.start)
        : said.daysOff(state.inDays);
  }
  return (
    <div className={cx(circular.root, lock.circle)}>
      <span className={srOnly}>{spoken}</span>
      {state.kind === "on" && <Ring share={leftOf(span, at)} />}
      <DayMark day={span.day} size={word ? 24 : 30} />
      {word && (
        <span aria-hidden="true" className={lock.word}>
          {word}
        </span>
      )}
    </div>
  );
}

export const NowCircular = firstRunOr(NowCircularView);

// The rectangular one: the shift and the time left, or the next and how
// soon, over when it ends or starts.
function NowRectangularView({ entry }: { entry: WidgetEntry }) {
  const said = useNowWords();
  const spoken = useSpoken(entry);
  const state = nowState(entry);
  if (state.kind === "none") {
    return (
      <div className={lock.rect}>
        <span className={srOnly}>{spoken}</span>
        <span aria-hidden="true" className={lock.rectFoot}>
          {said.none.replace("\n", "")}
        </span>
      </div>
    );
  }
  const { span, at } = state;
  const name = span.day.name ?? "";
  let count = said.words.inDays(
    state.kind === "next" ? (state.inDays ?? 0) : 0
  );
  if (state.kind === "on") {
    const left = said.duration(at, span.end);
    count = said.english ? `${left} left` : `あと${left}`;
  } else if (state.inDays === undefined) {
    const soon = said.duration(at, span.start);
    count = said.english ? `in ${soon}` : `あと${soon}`;
  }
  return (
    <div className={lock.rect}>
      <span className={srOnly}>{spoken}</span>
      <span aria-hidden="true" className={lock.rectHead}>
        <DayMark day={span.day} size={14} />
        <span className={oneLine}>
          {state.kind === "on" ? said.on(name) : said.next(name)}
        </span>
      </span>
      <span aria-hidden="true" className={lock.rectCount}>
        {count}
      </span>
      <span aria-hidden="true" className={lock.rectFoot}>
        {state.kind === "on" ? said.until(span, at) : said.from(span, at)}
      </span>
    </div>
  );
}

export const NowRectangular = firstRunOr(NowRectangularView);
