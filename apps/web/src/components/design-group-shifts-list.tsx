import { useVirtualizer } from "@tanstack/react-virtual";
import { useReducedMotion } from "motion/react";
import type { MotionValue } from "motion/react";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode, Ref } from "react";

import {
  dateKey,
  daysOfMonth,
  isSameMonth,
  monthAfter,
} from "../lib/design-days";
import { designToday } from "../lib/design-today";
import { sameMonth, togetherIn, weekLength } from "./design-group-data";
import type { Group, Member, Together } from "./design-group-data";
import {
  DayRow,
  dayRows,
  DayRowsTable,
  densityOf,
} from "./design-group-shifts-days";
import { monthKey, shiftsPage } from "./design-group-shifts-parts";
import type { Layout } from "./design-group-shifts-parts";
import { MonthDivider } from "./design-group-shifts-together";
import { MemberTable, WeekBlock, weekTable } from "./design-group-shifts-weeks";
import { monthTitleOf } from "./design-month-name";
import { MonthTitleButton } from "./design-month-picker";
import {
  monthIndex,
  RollingName,
  TodayCorner,
  useTurn,
} from "./design-rolling";
import { TodayButton } from "./design-ui";
import { useWeek } from "./design-week";

// The shift table's months as one list that scrolls on, by day or by
// week, drawing only the rows in sight, with the month in sight named
// over it.

// A computed length in pixels, as "40px"; 0 for one like "auto".
function pixels(length: string) {
  return Number(length.replace("px", "")) || 0;
}

// Where the rows pinned at the top of the scroll end, once pinned.
function pinnedBottom(root: HTMLElement) {
  const { top } = root.getBoundingClientRect();
  const padding = pixels(getComputedStyle(root).paddingTop);
  let bottom = top;
  for (const pinned of root.querySelectorAll<HTMLElement>("[data-pinned]")) {
    const offset = pixels(getComputedStyle(pinned).top);
    bottom = Math.max(bottom, top + padding + offset + pinned.offsetHeight);
  }
  return bottom;
}

// How many months either side of today the list of months holds, as the
// native lists will: all there, drawn only as they come into sight.
const monthSpan = 24;

// Heights until a row is drawn and measured, as they come out, so that
// measuring rows above the sight does not move the list.
// A month's heading, over the row of its みんな休み when it has any; the
// list of months sets it apart by more room above in 一覧.
const headingEstimate = 120;

const quietHeadingEstimate = 54;

const dayHeadingRoom = 24;

const dayRowEstimate = 37;

// A week's frame and dates, and a row per person.
const weekDatesEstimate = 23;

const weekPersonEstimate = 30;

const weekGap = 12;

// A row of the list of months: a month's heading, or its days, one day
// for 一覧 and a week for 週ごと.
type MonthListRow =
  | { kind: "heading"; key: string; month: Date; together: Together }
  | { kind: "days"; key: string; month: Date; days: Date[] };

// Every month of the span under its heading. A week belongs to the month
// it ends in, so a month's heading comes before the week of its 1st.
function monthListRows(
  layout: Layout,
  members: Member[],
  weekDates: (date: Date) => Date[]
): MonthListRow[] {
  const rows: MonthListRow[] = [];
  for (let offset = -monthSpan; offset <= monthSpan; offset += 1) {
    const month = monthAfter(designToday, offset);
    rows.push({
      key: monthKey(month),
      kind: "heading",
      month,
      together: togetherIn(members, daysOfMonth(month)),
    });
    if (layout === "days") {
      for (const date of daysOfMonth(month)) {
        rows.push({ days: [date], key: dateKey(date), kind: "days", month });
      }
      continue;
    }
    let week = weekDates(month);
    while (sameMonth(week[weekLength - 1], month)) {
      rows.push({ days: week, key: dateKey(week[0]), kind: "days", month });
      const end = week[weekLength - 1];
      week = weekDates(
        new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
      );
    }
  }
  return rows;
}

// 一覧 and 週ごと as one list of months, as the platforms' calendar lists
// scroll: each month under its heading with its みんな休み, two years
// either side of today, only the rows in sight drawn (TanStack Virtual, as
// LazyVStack and LazyColumn). The month in sight names itself in the row
// pinned on top, whose name opens a choice of months, and 今日 comes back
// to today when it is out of sight. It opens on the day asked for, or on
// today, or on the month.
export function ScrollingShifts({
  group,
  header,
  layout,
  month,
  picked,
  onMonth,
  onPickDay,
  onMember,
}: {
  group: Group;
  header: ReactNode;
  layout: Layout;
  month: Date;
  picked?: Date;
  onMonth: (month: Date) => void;
  onPickDay: (date: Date) => void;
  onMember: (member: Member) => void;
}) {
  const weekTools = useWeek();
  const bodyRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Where the rows start: the list's first element.
  const listRef = useRef<HTMLElement>(null);
  const [rows] = useState(() =>
    monthListRows(layout, group.members, weekTools.weekDates)
  );
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  // Where the list starts in the scroll, and how much is pinned over it.
  const [offsets, setOffsets] = useState({ margin: 0, pinned: 0 });
  const density = densityOf(group.members.length);
  const indexOfDay = (date: Date) =>
    rows.findIndex(
      (row) =>
        row.kind === "days" &&
        row.days.some((day) => dateKey(day) === dateKey(date))
    );
  const indexOfMonth = (target: Date) => {
    const key = monthKey(target);
    return rows.findIndex((row) => row.kind === "heading" && row.key === key);
  };
  const todayIndex = indexOfDay(designToday);
  const [openIndex] = useState(() => {
    if (picked) {
      return indexOfDay(picked);
    }
    return isSameMonth(month, designToday) ? todayIndex : indexOfMonth(month);
  });
  // oxlint-disable-next-line react/incompatible-library -- the app does not run the React Compiler, which this warns about.
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: (index) => {
      const row = rows[index];
      if (row.kind === "heading") {
        const height =
          row.together.days.length > 0 ? headingEstimate : quietHeadingEstimate;
        return layout === "days" ? height + dayHeadingRoom : height;
      }
      return layout === "days"
        ? dayRowEstimate
        : weekDatesEstimate + group.members.length * weekPersonEstimate;
    },
    gap: layout === "weeks" ? weekGap : 0,
    getItemKey: (index) => rows[index].key,
    getScrollElement: () => scrollElement,
    overscan: 6,
    scrollMargin: offsets.margin,
    scrollPaddingStart: offsets.pinned,
  });
  // The screen scrolls the list, or the table's own frame for a big group.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    setScrollElement(
      body?.querySelector<HTMLElement>("[data-table-scroll]") ??
        body?.closest<HTMLElement>("[data-screen-scroll]") ??
        null
    );
  }, []);
  // The tables' own pinned rows go under the bar, however tall it is, and
  // the list learns where it starts and what is pinned over it.
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const bar = barRef.current;
    if (!(body && bar && scrollElement)) {
      return;
    }
    const place = () => {
      body.style.setProperty("--pinned-top", `${bar.offsetHeight - 8}px`);
      const { top } = scrollElement.getBoundingClientRect();
      const margin =
        (listRef.current?.getBoundingClientRect().top ?? top) -
        top +
        scrollElement.scrollTop;
      const pinned = pinnedBottom(scrollElement) - top;
      setOffsets((previous) =>
        previous.margin === margin && previous.pinned === pinned
          ? previous
          : { margin, pinned }
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(bar);
    return () => {
      observer.disconnect();
    };
  }, [scrollElement]);
  // Once it knows where it starts, it opens on its day or month.
  const opened = useRef(false);
  useLayoutEffect(() => {
    if (opened.current || !scrollElement || offsets.margin === 0) {
      return;
    }
    opened.current = true;
    virtualizer.scrollToIndex(openIndex, { align: "start" });
  });
  const items = virtualizer.getVirtualItems();
  const scrolled = virtualizer.scrollOffset ?? 0;
  const line = scrolled + offsets.pinned;
  const top = items.find((item) => item.end > line);
  const shown = top ? rows[top.index].month : month;
  const shownKey = monthKey(shown);
  const todayItem = items.find((item) => item.index === todayIndex);
  const todayInSight =
    todayItem !== undefined &&
    todayItem.end > line &&
    todayItem.start < scrolled + (scrollElement?.clientHeight ?? 0);
  // The page's month follows the month in sight, as for its save.
  const reportMonth = useEffectEvent((key: string) => {
    if (opened.current && key !== monthKey(month)) {
      onMonth(shown);
    }
  });
  useEffect(() => {
    reportMonth(shownKey);
  }, [shownKey]);
  const go = (index: number) => {
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "start" });
    }
  };
  const first = monthAfter(designToday, -monthSpan);
  const last = monthAfter(designToday, monthSpan);
  const total = virtualizer.getTotalSize();
  const before = items.length > 0 ? items[0].start - offsets.margin : 0;
  const after =
    items.length > 0 ? total - ((items.at(-1)?.end ?? 0) - offsets.margin) : 0;
  const isPicked = (date: Date) =>
    picked !== undefined && dateKey(picked) === dateKey(date);
  const heading = (row: MonthListRow & { kind: "heading" }) => (
    <MonthDivider
      month={row.month}
      onPickDay={onPickDay}
      together={row.together}
    />
  );
  const columns = group.members.length + 1;
  const dayRowsBody = (
    <>
      <tr aria-hidden="true" ref={listRef as Ref<HTMLTableRowElement>}>
        <td
          aria-hidden="true"
          className={dayRows.spacer}
          colSpan={columns}
          style={{ height: before }}
        />
      </tr>
      {items.map((item) => {
        const row = rows[item.index];
        if (row.kind === "heading") {
          return (
            <tr
              data-index={item.index}
              key={item.key}
              ref={virtualizer.measureElement}
            >
              <td
                className={dayRows.divider({ scrolls: density === "scroll" })}
                colSpan={columns}
              >
                {heading(row)}
              </td>
            </tr>
          );
        }
        const [date] = row.days;
        return (
          <DayRow
            date={date}
            index={item.index}
            key={item.key}
            members={group.members}
            onPick={onPickDay}
            picked={isPicked(date)}
            rowRef={virtualizer.measureElement}
            scrolls={density === "scroll"}
            withNames={density === "names"}
          />
        );
      })}
      <tr aria-hidden="true">
        <td
          aria-hidden="true"
          className={dayRows.spacer}
          colSpan={columns}
          style={{ height: after }}
        />
      </tr>
    </>
  );
  const weeksBody = (
    <div
      className={weekTable.list}
      ref={listRef as Ref<HTMLDivElement>}
      style={{ height: total }}
    >
      {items.map((item) => {
        const row = rows[item.index];
        return (
          <div
            className={weekTable.item}
            data-index={item.index}
            key={item.key}
            ref={virtualizer.measureElement}
            style={{
              transform: `translateY(${item.start - offsets.margin}px)`,
            }}
          >
            {row.kind === "heading" ? (
              <div className={weekTable.divider}>{heading(row)}</div>
            ) : (
              <WeekBlock
                group={group}
                onMember={onMember}
                onPickDay={onPickDay}
                picked={picked}
                week={row.days}
              />
            )}
          </div>
        );
      })}
    </div>
  );
  return (
    <div className={shiftsPage.scrolling} ref={bodyRef}>
      <div className={shiftsPage.bar} data-pinned="" ref={barRef}>
        {header}
        <MonthRow
          first={first}
          last={last}
          month={shown}
          onPick={(target) => {
            go(indexOfMonth(target));
          }}
          onToday={
            todayInSight
              ? undefined
              : () => {
                  go(todayIndex);
                }
          }
          unit="日"
        />
      </div>
      {layout === "days" ? (
        <DayRowsTable body={dayRowsBody} group={group} onMember={onMember} />
      ) : (
        <MemberTable
          body={weeksBody}
          dates={[]}
          group={group}
          onMember={onMember}
          onPickDay={onPickDay}
          picked={picked}
        />
      )}
    </div>
  );
}

// The shift table's month: its name (2026年9月, or September 2026 as the
// カレンダー page's 月と曜日 asks), which opens a choice of months, and
// the way back to today's day or month while it is out of sight. Over a
// list of months, it names the month in sight, rolling to the next as the
// list scrolls on, the way it went. Over 1人ずつ's pages (`progress`), the
// name and 今月 follow the drag, as over the calendar.
export function MonthRow({
  month,
  unit,
  first,
  last,
  onPick,
  onToday,
  progress,
  swiped = false,
}: {
  month: Date;
  unit: "日" | "月";
  // The months there are to go to, when the list has ends.
  first?: Date;
  last?: Date;
  onPick: (month: Date) => void;
  // Left out while today's day or month is in sight.
  onToday?: () => void;
  progress?: MotionValue<number>;
  // Turned by a swipe, which has already brought the new name in.
  swiped?: boolean;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const { english } = useWeek();
  const turn = useTurn(monthIndex(month), swiped);
  const next = monthAfter(month, 1);
  const previous = monthAfter(month, -1);
  const isThisMonth = (date: Date) =>
    monthIndex(date) === monthIndex(designToday);
  const named = (of: (date: Date) => string) => ({
    ...(progress ? { next: of(next), previous: of(previous) } : {}),
    progress,
    still: reduceMotion,
    text: of(month),
    turn,
  });
  const rolled = (of: (date: Date) => number) =>
    named((date) => String(of(date)));
  return (
    <div className={shiftsPage.monthRow}>
      <MonthTitleButton first={first} last={last} month={month} onPick={onPick}>
        <strong className={shiftsPage.monthName}>
          {english ? (
            <span aria-hidden="true">
              <RollingName
                {...named((date) => monthTitleOf(date, true))}
                letters
              />{" "}
              <RollingName {...rolled((date) => date.getFullYear())} />
            </span>
          ) : (
            <span aria-hidden="true">
              <RollingName {...rolled((date) => date.getFullYear())} />年
              <RollingName {...rolled((date) => date.getMonth() + 1)} />月
            </span>
          )}
        </strong>
      </MonthTitleButton>
      <TodayCorner
        atToday={onToday === undefined}
        nextIsToday={progress !== undefined && isThisMonth(next)}
        previousIsToday={progress !== undefined && isThisMonth(previous)}
        progress={progress}
        swiped={swiped}
      >
        <TodayButton
          onClick={() => {
            onToday?.();
          }}
          unit={unit}
        />
      </TodayCorner>
    </div>
  );
}
