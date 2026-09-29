import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import { css, cva } from "styled-system/css";

// Names that roll as what they name turns, like a month's over the
// calendar or the group's shift table, and the way back to today that
// comes and goes with them. Each rolls within its own line, following a
// drag of the pages while there is one, and on its own otherwise.

const MONTHS_IN_YEAR = 12;

// A month as a number that counts on across years, to tell which way a
// turn went.
export function monthIndex(month: Date) {
  return month.getFullYear() * MONTHS_IN_YEAR + month.getMonth();
}

// Which way the last change of `key` went, kept from the render before,
// and whether a swipe already brought it in.
export function useTurn(key: number, swiped: boolean): Turn {
  const [turn, setTurn] = useState({ direction: 1, instant: true, key });
  if (turn.key !== key) {
    setTurn({ direction: key > turn.key ? 1 : -1, instant: swiped, key });
  }
  return turn;
}

// Short, and without bounce, done with the pages' own slide.
const roll = { bounce: 0, type: "spring", visualDuration: 0.25 } as const;
const LETTER_DELAY = 0.03;
// How much later in a drag each English letter starts to roll.
const LETTER_LAG = 0.08;
// The most letters an English month has, as sep.
const LONGEST_MONTH = 4;
export type Turn = { direction: number; instant: boolean };
const rollSteps = {
  coming: ({ direction, instant }: Turn) =>
    instant ? { opacity: 1, y: 0 } : { opacity: 0, y: `${direction * 100}%` },
  gone: ({ direction, instant }: Turn) =>
    instant
      ? { opacity: 0, transition: { duration: 0 } }
      : { opacity: 0, y: `${direction * -100}%` },
  shown: { opacity: 1, y: 0 },
};

type Rolled = {
  text: string;
  // The names of the months beside, while the pages can be dragged.
  previous?: string;
  next?: string;
  letters?: boolean;
  progress?: MotionValue<number>;
  still: boolean;
  turn: Turn;
};

export function RollingName({ still, text, ...rest }: Rolled) {
  if (still) {
    return <>{text}</>;
  }
  return <RollingBox still={still} text={text} {...rest} />;
}

// How far one letter of `count` has rolled when the drag is `amount` of
// the way: each starts a little after the one before, all done at the end.
function letterShare(amount: number, index: number, count: number) {
  const span = 1 - (count - 1) * LETTER_LAG;
  return Math.min(Math.max((amount - index * LETTER_LAG) / span, 0), 1);
}

// The name in a box that shows only its own line. Its letters (or its
// one number) each keep a place, so the way out follows the latest turn
// and a letter repeated from the month before still rolls. The names of
// the months beside wait in the box, out of sight, for a drag to bring
// one in, and the box's width goes along from one to the other.
function RollingBox({
  text,
  previous,
  next,
  letters = false,
  progress,
  turn,
}: Rolled) {
  const rest = useMotionValue(0);
  const drag = progress ?? rest;
  const parts = letters ? [...text] : [text];
  const places = letters ? Math.max(parts.length, LONGEST_MONTH) : 1;
  const coming = {
    next: next !== undefined && next !== text ? next : undefined,
    previous:
      previous !== undefined && previous !== text ? previous : undefined,
  };
  const currentRef = useRef<HTMLSpanElement>(null);
  const nextRef = useRef<HTMLSpanElement>(null);
  const previousRef = useRef<HTMLSpanElement>(null);
  const widths = useRef({ current: 0, next: 0, previous: 0 });
  useLayoutEffect(() => {
    widths.current = {
      current: currentRef.current?.offsetWidth ?? 0,
      next: nextRef.current?.offsetWidth ?? 0,
      previous: previousRef.current?.offsetWidth ?? 0,
    };
  });
  const width = useTransform(drag, (value) => {
    const measured = widths.current;
    const toward = value > 0 ? measured.next : measured.previous;
    if (value === 0 || toward === 0 || measured.current === 0) {
      return "auto";
    }
    const share = Math.min(Math.abs(value), 1);
    return `${measured.current + (toward - measured.current) * share}px`;
  });
  return (
    <motion.span className={rolling.box({ lower: letters })} style={{ width }}>
      <span className={rolling.current} ref={currentRef}>
        {Array.from({ length: places }, (_, index) => (
          <RollingPlace
            count={parts.length}
            drag={drag}
            hasNext={coming.next !== undefined}
            hasPrevious={coming.previous !== undefined}
            index={index}
            // The place is what stays; what is in it changes.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            part={parts[index]}
            text={text}
            turn={turn}
          />
        ))}
      </span>
      {coming.next !== undefined && (
        <ComingName
          drag={drag}
          letters={letters}
          ref={nextRef}
          side={1}
          text={coming.next}
        />
      )}
      {coming.previous !== undefined && (
        <ComingName
          drag={drag}
          letters={letters}
          ref={previousRef}
          side={-1}
          text={coming.previous}
        />
      )}
    </motion.span>
  );
}

function RollingPlace({
  part,
  index,
  count,
  text,
  turn,
  drag,
  hasNext,
  hasPrevious,
}: {
  part: string | undefined;
  index: number;
  count: number;
  text: string;
  turn: Turn;
  drag: MotionValue<number>;
  hasNext: boolean;
  hasPrevious: boolean;
}) {
  // Going out the way the drag goes, when a name is coming that way.
  const out = (value: number) => {
    const going = (value > 0 && hasNext) || (value < 0 && hasPrevious);
    return going ? letterShare(Math.abs(value), index, count) : 0;
  };
  const y = useTransform(
    drag,
    (value) => `${-Math.sign(value) * out(value) * 100}%`
  );
  const opacity = useTransform(drag, (value) => 1 - out(value));
  return (
    <motion.span className={rolling.place} style={{ opacity, y }}>
      <AnimatePresence custom={turn} initial={false} mode="popLayout">
        {part !== undefined && (
          <motion.span
            animate="shown"
            className={rolling.part}
            custom={turn}
            exit="gone"
            initial="coming"
            key={`${text}-${index}`}
            transition={{ ...roll, delay: index * LETTER_DELAY }}
            variants={rollSteps}
          >
            {part}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.span>
  );
}

// The name of the month beside, laid over the one shown and brought in
// from under it (the next) or over it (the one before) as the drag goes.
function ComingName({
  text,
  side,
  letters,
  drag,
  ref,
}: {
  text: string;
  side: 1 | -1;
  letters: boolean;
  drag: MotionValue<number>;
  ref: Ref<HTMLSpanElement>;
}) {
  const parts = letters ? [...text] : [text];
  return (
    <span className={rolling.coming} ref={ref}>
      {parts.map((part, index) => (
        <ComingPart
          count={parts.length}
          drag={drag}
          index={index}
          // oxlint-disable-next-line react/no-array-index-key
          key={index}
          part={part}
          side={side}
        />
      ))}
    </span>
  );
}

function ComingPart({
  part,
  index,
  count,
  side,
  drag,
}: {
  part: string;
  index: number;
  count: number;
  side: 1 | -1;
  drag: MotionValue<number>;
}) {
  const share = (value: number) =>
    Math.sign(value) === side ? letterShare(Math.abs(value), index, count) : 0;
  const y = useTransform(
    drag,
    (value) => `${side * (1 - share(value)) * 100}%`
  );
  const opacity = useTransform(drag, share);
  return (
    <motion.span className={rolling.part} style={{ opacity, y }}>
      {part}
    </motion.span>
  );
}

// 今月 (or 今週, 今日), there while away from it. It follows a drag of
// the pages, coming into sight as the page leaves this month and
// going as it comes back, so it is already right as the page lands.
// Otherwise, as when it is pressed or a month is picked, it fades in or
// out on its own, as iOS's bar buttons do.
export function TodayCorner({
  atToday,
  nextIsToday,
  previousIsToday,
  progress,
  swiped,
  className,
  children,
}: {
  atToday: boolean;
  // Whether the month beside is this one, for a drag toward it.
  nextIsToday: boolean;
  previousIsToday: boolean;
  progress?: MotionValue<number>;
  // Turned by a swipe, which has already brought it where it belongs.
  swiped: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const rest = useMotionValue(0);
  const drag = progress ?? rest;
  // Where it is by what is shown, apart from any drag.
  const shown = useMotionValue(atToday ? 0 : 1);
  useLayoutEffect(() => {
    const target = atToday ? 0 : 1;
    if (swiped || reduceMotion) {
      shown.jump(target);
      return;
    }
    const fading = animate(shown, target, { duration: 0.2 });
    return () => {
      fading.stop();
    };
  }, [atToday, swiped, reduceMotion, shown]);
  const opacity = useTransform([shown, drag], ([state, at]: number[]) => {
    const share = Math.min(Math.abs(at ?? 0), 1);
    if (atToday) {
      return Math.max(state ?? 0, share);
    }
    const going = at ?? 0;
    const towardToday =
      (going > 0 && nextIsToday) || (going < 0 && previousIsToday);
    return Math.min(state ?? 0, towardToday ? 1 - share : 1);
  });
  // Out of sight, it is out of reach too.
  const visibility = useTransform(opacity, (value) =>
    value > 0 ? "visible" : "hidden"
  );
  return (
    <motion.div className={className} style={{ opacity, visibility }}>
      {children}
    </motion.div>
  );
}

const rolling = {
  // Shows only its own line, with room for the letters' tails, from
  // right under what is over it; sideways the name may run on while the
  // box's width catches up. Over the calendar's lower case the year sits
  // 7px lower, so what is shown starts that much lower too.
  box: cva({
    base: {
      clipPath: "inset(0 -100px)",
      display: "inline-block",
      marginBlock: "-4px",
      paddingBlock: "4px",
      position: "relative",
      verticalAlign: "baseline",
      whiteSpace: "nowrap",
    },
    variants: { lower: { true: { clipPath: "inset(7px -100px 0)" } } },
  }),
  coming: css({ left: 0, position: "absolute", top: "4px" }),
  current: css({ display: "inline-block" }),
  part: css({ display: "inline-block", whiteSpace: "pre" }),
  // Where a rolling part is, the one on its way out laid over the next.
  place: css({ display: "inline-block", position: "relative" }),
};
