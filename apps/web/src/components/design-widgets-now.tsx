import { css, cx } from "styled-system/css";

import type { WidgetEntry, WidgetSpan } from "../lib/design-widgets";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";
import { DayMark, firstRunOr, oneLine, useWords } from "./design-widgets";
import { circular } from "./design-widgets-lock";
import { FitText } from "./design-widgets-next-off";

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
  root: css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
  }),
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
  const target = state.kind === "on" ? span.end : span.start;
  const far = state.kind === "next" ? state.inDays : undefined;
  const lead = said.english ? undefined : said.left;
  return (
    <div className={now.root}>
      <span className={srOnly}>{spoken}</span>
      <span aria-hidden="true" className={now.head}>
        <DayMark day={span.day} size={18} />
        <span className={oneLine}>
          {state.kind === "on" ? said.on(name) : said.next(name)}
        </span>
      </span>
      <span aria-hidden="true">
        {far === undefined ? (
          <Count
            lead={lead}
            size={30}
            trail={said.english && state.kind === "on" ? said.left : undefined}
            words={said.duration(at, target)}
          />
        ) : (
          <Count size={36} words={said.words.inDays(far)} />
        )}
      </span>
      <span aria-hidden="true" className={now.foot}>
        {state.kind === "on" ? said.until(span, at) : said.from(span, at)}
      </span>
    </div>
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

const RING_SIZE = 72;
const RING_STROKE = 5;

// How far through the shift `at` is, 0 to 1.
function progressOf(span: WidgetSpan, at: Date) {
  const whole = span.end.getTime() - span.start.getTime();
  return Math.min(
    1,
    Math.max(0, (at.getTime() - span.start.getTime()) / whole)
  );
}

function Ring({ share }: { share: number }) {
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const around = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden="true"
      className={lock.ring}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
    >
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeOpacity={0.25}
        strokeWidth={RING_STROKE}
      />
      <circle
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        fill="none"
        r={radius}
        stroke="currentColor"
        strokeDasharray={`${around * share} ${around}`}
        strokeLinecap="round"
        strokeWidth={RING_STROKE}
        transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
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
      {state.kind === "on" && <Ring share={progressOf(span, at)} />}
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
