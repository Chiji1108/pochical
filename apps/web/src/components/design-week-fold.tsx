import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import type { MotionStyle, MotionValue } from "motion/react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

import { addDays, dateKey } from "../lib/design-days";
import { spring } from "../lib/motion";
import {
  DAY_ROW_GAP,
  DAY_ROW_HEIGHT,
  dayGrid,
  dayGridHeight,
  MONTH_WEEKS,
} from "./design-day-grid";
import { useWeek } from "./design-week";

// The calendar's week view: a day opened folds the month up into its
// week, with the day's details under it, and closing it, or pulling the
// week down, unfolds the month back around it. `onOpen` is told as a week
// opens, with the month to turn to when the week is off the one shown.
// `dates` are the days the month shows.
export function useWeekFold({
  month,
  dates,
  editing,
  initialDetail,
  onOpen,
}: {
  month: Date;
  dates: Date[];
  editing: boolean;
  initialDetail?: Date;
  onOpen: (turnTo: Date | undefined) => void;
}) {
  const weekTools = useWeek();
  const [detailDate, setDetailDate] = useState(initialDetail);
  // The row of the month the opened week is on, for the month to fold up
  // into it and unfold back around it. It follows the week as it turns.
  const [foldRow, setFoldRow] = useState(0);
  // How far the month is folded into that week, 0 to 1: moved by opening
  // and closing the week, or by the finger pulling the week back open.
  const folded = useMotionValue(initialDetail ? 1 : 0);
  const reduceFolding = useReducedMotion() ?? false;
  const detailOpacity = useTransform(folded, [0.5, 1], [0, 1]);
  // The day whose week is open, while not entering, which shows the month.
  const openDate = editing ? undefined : detailDate;
  const weekDetail = openDate !== undefined;
  function rowOf(date: Date, inMonth: Date) {
    const index = weekTools
      .monthDates(inMonth)
      .findIndex((day) => dateKey(day) === dateKey(date));
    return Math.max(0, Math.floor(index / 7));
  }
  // The week of the day opened on, before the screen is first drawn.
  const foldInitial = useEffectEvent(() => {
    if (initialDetail) {
      setFoldRow(rowOf(initialDetail, month));
    }
  });
  useLayoutEffect(() => {
    foldInitial();
  }, []);
  function onMonth(date: Date) {
    return dates.some((day) => dateKey(day) === dateKey(date));
  }
  // The month stays while the week opened is one of its rows, as every row
  // holds a day of it: a day of the month before, opened from the top row,
  // folds back into that row. Only a week off the month takes its month.
  // The month shown once a date's week is opened.
  function monthOpening(date: Date) {
    return onMonth(date)
      ? month
      : new Date(date.getFullYear(), date.getMonth(), 1);
  }
  function foldTo(target: 0 | 1, velocity = 0) {
    if (reduceFolding) {
      folded.jump(target);
      return;
    }
    animate(folded, target, { ...fold, velocity });
  }
  function openDetail(date: Date) {
    setFoldRow(rowOf(date, monthOpening(date)));
    setDetailDate(date);
    foldTo(1);
    onOpen(onMonth(date) ? undefined : monthOpening(date));
  }
  // With the speed the finger let go at, when it pulled the week open.
  function closeDetail(velocity = 0) {
    setDetailDate(undefined);
    foldTo(0, velocity);
  }
  // The months the pages beside lead to: the months before and after, or
  // in the week view the months the weeks before and after are shown in.
  const besideMonths = weekDetail
    ? {
        next: monthOpening(addDays(openDate, 7)),
        previous: monthOpening(addDays(openDate, -7)),
      }
    : undefined;
  // How far the month unfolds below the week: the finger pulling it open
  // brings the month's foot down with it.
  const unfoldDistance =
    dayGridHeight(Math.max(dates.length / 7, MONTH_WEEKS)) - dayGridHeight(1);
  const pullRef = usePullDown({
    enabled: weekDetail,
    // Jumped, so a spring still opening or settling the week stops and
    // leaves it to the finger.
    onPull: (share) => {
      folded.jump(1 - share);
    },
    onRelease: (share, speed) => {
      // In folded per second, as the finger's speed down unfolds it.
      const velocity = -speed / unfoldDistance;
      const flicked = Math.abs(speed) > UNFOLD_FLICK;
      const opens = flicked ? speed > 0 : share > UNFOLD_SHARE;
      if (opens) {
        closeDetail(velocity);
        return;
      }
      foldTo(1, velocity);
    },
    reach: unfoldDistance,
  });
  return {
    besideMonths,
    closeDetail,
    detailOpacity,
    foldRow,
    folded,
    openDate,
    openDetail,
    pullRef,
  };
}

// From one row of days to the next.
const ROW_STEP = DAY_ROW_HEIGHT + DAY_ROW_GAP;
// How the month folds into a week and back: one spring for all of it,
// the moving, the height and the fading, the same as one withAnimation
// of the standard spring in the apps.
const fold = spring("standard");
const folding = {
  cell: css({ display: "grid", minWidth: 0 }),
  // Clips nothing: the rows moving out of it fade on the way, and the
  // pager's edges take them out of sight.
  page: css({ position: "relative" }),
};

// The page shown, folding as the month turns into one of its weeks and
// back, like the Calendar apps. The days lie on one sheet, each in its
// row of the month; the sheet moves up by `row` rows to bring the week to
// the top, the other days fade on it, and the page's height follows so
// what is under it moves too. As one thing moving, the week can't move
// apart from the rest of the month. All of it follows `folded`, so a
// finger pulling the week open moves it as the springs do.
export function FoldingGrid({
  dates,
  folded,
  label,
  renderCell,
  row,
  weekDetail,
}: {
  dates: Date[];
  folded: MotionValue<number>;
  label: string;
  renderCell: (date: Date) => ReactNode;
  row: number;
  weekDetail: boolean;
}) {
  const unfolded = dayGridHeight(Math.max(dates.length / 7, MONTH_WEEKS));
  const week = dayGridHeight(1);
  return (
    <motion.section
      aria-label={label}
      className={folding.page}
      // Motion sets a CSS variable from a motion value, though its types
      // leave them out.
      style={
        {
          "--fold": folded,
          height: `calc(${week}px + ${unfolded - week}px * (1 - var(--fold)))`,
        } as MotionStyle
      }
    >
      <div
        className={dayGrid}
        style={{
          transform: `translateY(calc(${-row * ROW_STEP}px * var(--fold)))`,
        }}
      >
        {dates.map((date, index) => {
          // Folded away, the rest of the month is out of reach.
          const away = weekDetail && Math.floor(index / 7) !== row;
          return (
            <div
              aria-hidden={away || undefined}
              className={folding.cell}
              inert={away}
              key={dateKey(date)}
              style={
                Math.floor(index / 7) === row
                  ? undefined
                  : { opacity: "calc(1 - var(--fold))" }
              }
            >
              {renderCell(date)}
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}

// Past this share of the way, a pull let go unfolds the month; short of
// it, the week folds back. A flick faster than this, in pixels a second,
// goes the way it is flicked wherever it is let go.
const UNFOLD_SHARE = 1 / 3;
const UNFOLD_FLICK = 400;
// How far the finger goes before the pull is told from a tap or a swipe
// sideways: little, so it is told before Safari takes the finger to
// scroll.
const PULL_SLOP = 6;
// Held still this long, in milliseconds, before letting go, the finger
// lets go without speed: the last move's speed is no flick.
const PULL_STILL_MS = 80;

// A pull down, as a share of `reach` (0 to 1) while the finger moves, and
// with its speed down in pixels a second when let go. A pull starts only
// going down, not sideways (the week's swipe) and not over something
// scrolled down (it scrolls back up first), nor in a text box. A finger
// taken by the system lets go standing still, so it goes back.
function usePullDown({
  enabled,
  reach,
  onPull,
  onRelease,
}: {
  enabled: boolean;
  reach: number;
  onPull: (share: number) => void;
  onRelease: (share: number, speed: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ enabled, onPull, onRelease, reach });
  useEffect(() => {
    latest.current = { enabled, onPull, onRelease, reach };
  });
  useEffect(() => {
    const area = ref.current;
    if (!area) {
      return;
    }
    let pointer: number | undefined;
    let pulling = false;
    // The finger's listeners on the window, taken off as it lets go.
    let following: AbortController | undefined;
    const stop = () => {
      following?.abort();
      following = undefined;
      pointer = undefined;
      pulling = false;
      area.style.removeProperty("user-select");
    };
    let from = { x: 0, y: 0 };
    // Pulled since the finger went down, so letting go presses nothing.
    let pulled = false;
    let share = 0;
    let speed = 0;
    let last = { time: 0, y: 0 };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      if (!pulling) {
        const across = event.clientX - from.x;
        const down = event.clientY - from.y;
        if (Math.hypot(across, down) < PULL_SLOP) {
          return;
        }
        if (down <= Math.abs(across)) {
          stop();
          return;
        }
        pulling = true;
        pulled = true;
        // From here, so the month does not jump by the slop.
        from = { x: event.clientX, y: event.clientY };
        last = { time: event.timeStamp, y: event.clientY };
        area.style.userSelect = "none";
      }
      share = Math.min(
        Math.max((event.clientY - from.y) / latest.current.reach, 0),
        1
      );
      const elapsed = (event.timeStamp - last.time) / 1000;
      if (elapsed > 0) {
        speed = (event.clientY - last.y) / elapsed;
      }
      last = { time: event.timeStamp, y: event.clientY };
      latest.current.onPull(share);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }
      if (pulling) {
        const still =
          event.type === "pointercancel" ||
          event.timeStamp - last.time > PULL_STILL_MS;
        latest.current.onRelease(share, still ? 0 : speed);
      }
      stop();
    };
    const scrolledDown = (target: Element) => {
      for (
        let element: Element | null = target;
        element && element !== area;
        element = element.parentElement
      ) {
        if (element.scrollTop > 0) {
          return true;
        }
      }
      return false;
    };
    const start = (event: PointerEvent) => {
      pulled = false;
      const { target } = event;
      if (
        !latest.current.enabled ||
        !event.isPrimary ||
        event.button !== 0 ||
        !(target instanceof Element) ||
        target.closest("input, textarea, [contenteditable]") ||
        scrolledDown(target)
      ) {
        return;
      }
      pointer = event.pointerId;
      from = { x: event.clientX, y: event.clientY };
      share = 0;
      speed = 0;
      following = new AbortController();
      const { signal } = following;
      window.addEventListener("pointermove", move, { signal });
      window.addEventListener("pointerup", up, { signal });
      window.addEventListener("pointercancel", up, { signal });
    };
    // Once pulling, the finger is the pull's: the screen does not scroll.
    const hold = (event: TouchEvent) => {
      if (pulling && event.cancelable) {
        event.preventDefault();
      }
    };
    const press = (event: MouseEvent) => {
      if (pulled) {
        event.preventDefault();
        event.stopPropagation();
        pulled = false;
      }
    };
    area.addEventListener("pointerdown", start);
    area.addEventListener("touchmove", hold, { passive: false });
    area.addEventListener("click", press, true);
    return () => {
      stop();
      area.removeEventListener("pointerdown", start);
      area.removeEventListener("touchmove", hold);
      area.removeEventListener("click", press, true);
    };
  }, []);
  return ref;
}
