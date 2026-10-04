import { useContext, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { css, cx } from "styled-system/css";

import type {
  WidgetEntry,
  WidgetNoOff,
  WidgetOff,
} from "../lib/design-widgets";
import { DARK_DRAWING, LIGHT_DRAWING, useAppIcons } from "./design-app-icon";
import { GroupIcon, PhotoAvatar } from "./design-group-parts";
import { ColorSchemeContext } from "./design-theme";
import { srOnly } from "./design-ui";
import {
  DayMark,
  WidgetRenderingModeContext,
  WidgetSizeContext,
  inDaysWords,
  monthDay,
  oneLine,
  useWords,
  waitingNames,
} from "./design-widgets";

// 次の休み: how soon the next day off comes, alone, with someone or with a
// group.

// ── 次の休み ─────────────────────────────────────────────────────────────

const offs = {
  avatar: css({ flexShrink: 0 }),
  // A group's mark, framed as the app's list of groups frames it.
  groupFace: css({
    bg: "fill.quaternary",
    borderRadius: "sm",
    display: "grid",
    flexShrink: 0,
    fontSize: "13px",
    height: "20px",
    overflow: "hidden",
    placeItems: "center",
    width: "20px",
  }),
  // The count, large: a number with 日後 after it, or 今日 and 明日.
  count: css({
    alignItems: "baseline",
    display: "flex",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    lineHeight: 1,
  }),
  date: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    fontVariantNumeric: "tabular-nums",
    gap: "4px",
    textStyle: "footnote",
  }),
  head: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    gap: "4px",
    justifyContent: "space-between",
    minWidth: 0,
    textStyle: "footnote",
  }),
  root: css({
    display: "flex",
    flexDirection: "column",
    height: "100%",
    justifyContent: "space-between",
  }),
  unit: css({ fontSize: "13px", fontWeight: 600, marginLeft: "2px" }),
};

// 次の休み, 一緒に休める日 with the person's picture beside it, or
// みんなで休める日 with the group's.
function OffsHead({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const { with: companion } = entry.offs;
  let title = words.nextOff;
  if (companion) {
    title = companion.kind === "group" ? words.offAll : words.offTogether;
  }
  return (
    <span className={offs.head}>
      <span className={oneLine}>{title}</span>
      <CompanionFace entry={entry} />
    </span>
  );
}

// The face of who the widget is set to: a person's round picture, or a
// group's mark in its rounded square, as the app frames them.
function CompanionFace({ entry }: { entry: WidgetEntry }) {
  const { with: companion } = entry.offs;
  if (!companion) {
    return null;
  }
  if (companion.kind === "group") {
    return (
      <span className={offs.groupFace}>
        <GroupIcon mark={companion.mark} size={14} />
      </span>
    );
  }
  return (
    <span className={offs.avatar}>
      <PhotoAvatar name={companion.name} photo={companion.photo} size={20} />
    </span>
  );
}

// What is said when no day off is ahead.
function noOffWords(
  none: WidgetNoOff | undefined,
  words: ReturnType<typeof useWords>
) {
  if (none?.kind === "waiting") {
    return words.waiting(none.names);
  }
  return none?.kind === "apart" ? words.apart : words.nothingYet;
}

// A count: the number of days large with 日後 small, or 今日 and 明日.
function OffCount({ inDays, size }: { inDays: number; size: number }) {
  const words = useWords();
  const number = inDays > 1;
  const text = number ? `${inDays}` : words.inDays(inDays);
  // Other words start again at the size asked for.
  return (
    <FitText key={text} size={size}>
      {text}
      {number && <span className={offs.unit}>{words.unit}</span>}
    </FitText>
  );
}

// Words too wide for the widget at their size (Tomorrow) shrink to its
// width, or to the `room` given, as SwiftUI's minimumScaleFactor does.
// The caller keys it by its words, so other words start again at the
// size asked for.
export function FitText({
  size,
  room: given,
  className = offs.count,
  children,
}: {
  size: number;
  room?: number;
  className?: string;
  children: ReactNode;
}) {
  const { width } = useContext(WidgetSizeContext);
  const ref = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(size);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const room = given ?? width;
    // The words' width at the size asked for, from their width as shown,
    // less any zoom a preview draws the widget smaller with (/demo's
    // home screen on a narrow phone), as `room` is the widget's own.
    const range = document.createRange();
    range.selectNodeContents(element);
    const shown = element.getBoundingClientRect().width;
    const zoom = element.offsetWidth > 0 ? shown / element.offsetWidth : 1;
    const natural = (range.getBoundingClientRect().width * size) / (fit * zoom);
    setFit(Math.min(size, Math.floor((size * room) / natural)));
  }, [fit, given, size, width]);
  return (
    <span
      aria-hidden="true"
      className={className}
      ref={ref}
      style={{ fontSize: fit }}
    >
      {children}
    </span>
  );
}

// The soonest day off: today when it is off, else the next one.
export function soonestOff(entry: WidgetEntry): WidgetOff | undefined {
  return entry.offs.today ? { day: entry.today, inDays: 0 } : entry.offs.next;
}

// The whole of it as read aloud.
export function spokenOff(entry: WidgetEntry, off: WidgetOff | undefined) {
  const companion = entry.offs.with;
  let title = "次の休み";
  if (companion) {
    title =
      companion.kind === "group"
        ? `${companion.name}のみんな休み`
        : `${companion.name}さんと一緒に休める日`;
  }
  if (!off) {
    const { none } = entry.offs;
    if (none?.kind === "waiting") {
      return `${title}、${waitingNames(none.names)}の入力待ち`;
    }
    const apart = none?.kind === "apart";
    return `${title}、${apart ? "重なる休みはまだありません" : "まだ入っていません"}`;
  }
  const { day, inDays } = off;
  return `${title}、${inDaysWords(inDays)}、${monthDay(day.date)}(${day.weekday}) ${day.name ?? ""}`;
}

const rest = {
  // The poodle looking up from the bottom edge at the right, its head
  // weighing against the words on the left.
  dog: css({
    bottom: "calc(-1 * var(--widget-margin) - 26px)",
    height: "92px",
    pointerEvents: "none",
    position: "absolute",
    right: "calc(-1 * var(--widget-margin) - 4px)",
    width: "92px",
  }),
  // The words keep to the top, clear of the dog in the corner below.
  root: css({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    height: "100%",
    position: "relative",
  }),
  title: css({
    fontWeight: 600,
    lineHeight: 1.3,
    position: "relative",
    textStyle: "title3",
    whiteSpace: "pre-line",
  }),
  tomorrow: css({
    alignItems: "center",
    color: "text.secondary",
    display: "flex",
    gap: "4px",
    marginTop: "auto",
    position: "relative",
    textStyle: "footnote",
  }),
};

// The poodle, white in dark lines, as it sits on any ground. Where the
// system draws the widget in one color, it is drawn desaturated, as
// SwiftUI's widgetAccentedRenderingMode(.desaturated) has it: its white
// body takes the tint and its lines stay, rather than a white blob.
function PeekingDog() {
  const icons = useAppIcons();
  const dark = useContext(ColorSchemeContext) === "dark";
  const accented = useContext(WidgetRenderingModeContext) === "accented";
  if (accented) {
    const light = icons[LIGHT_DRAWING];
    return light ? (
      <span
        aria-hidden="true"
        className={cx(rest.dog, desaturatedDog)}
        style={{ maskImage: `url(${light})` }}
      />
    ) : null;
  }
  const drawing = icons[dark ? DARK_DRAWING : LIGHT_DRAWING];
  return drawing ? (
    <img alt="" className={rest.dog} height={92} src={drawing} width={92} />
  ) : null;
}

// The preview's one-color look turns everything white, so the drawing is
// a mask of its own lightness: the body shows, the lines let the ground
// through. Any solid color does under it.
const desaturatedDog = css({
  bg: "text.primary",
  maskMode: "luminance",
  maskSize: "100% 100%",
});

// A day off today, said as such rather than counted: おやすみ, with the
// date over it, tomorrow's mark under it, and the app icon's poodle
// looking up from the corner. 次の休み's days, about being off, go
// without a memo's stroke.
function RestToday({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  const day = entry.today;
  const [, tomorrow] = entry.upcoming;
  const companion = entry.offs.with;
  let title = words.rest;
  if (companion) {
    title = companion.kind === "group" ? words.restAll : words.restTogether;
  }
  return (
    <div className={rest.root}>
      <span className={srOnly}>{spokenOff(entry, { day, inDays: 0 })}</span>
      <PeekingDog />
      <span aria-hidden="true" className={offs.head}>
        <span className={oneLine}>{words.date(day.date)}</span>
        <CompanionFace entry={entry} />
      </span>
      <span aria-hidden="true" className={rest.title}>
        {title}
      </span>
      {tomorrow && (
        <span aria-hidden="true" className={rest.tomorrow}>
          {words.nextDay(tomorrow.date)}
          <DayMark day={tomorrow} size={16} />
        </span>
      )}
    </div>
  );
}

// The next day off large: how soon, and its date and mark.
export function NextOffSmall({ entry }: { entry: WidgetEntry }) {
  const words = useWords();
  if (entry.offs.today) {
    return <RestToday entry={entry} />;
  }
  const next = soonestOff(entry);
  return (
    <div className={offs.root}>
      <span className={srOnly}>{spokenOff(entry, next)}</span>
      <OffsHead entry={entry} />
      {next ? (
        <OffCount inDays={next.inDays} size={next.inDays > 1 ? 48 : 36} />
      ) : (
        <span
          aria-hidden="true"
          className={offs.count}
          style={{ fontSize: 36 }}
        >
          –
        </span>
      )}
      <span aria-hidden="true" className={offs.date}>
        {next ? (
          <>
            {words.date(next.day.date)}
            <DayMark day={next.day} size={16} />
          </>
        ) : (
          noOffWords(entry.offs.none, words)
        )}
      </span>
    </div>
  );
}
