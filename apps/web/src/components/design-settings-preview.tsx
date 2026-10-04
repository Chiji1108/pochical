import type { ColorScheme } from "@pochical/design/colors";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";
import type { MotionValue } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { css } from "styled-system/css";

import {
  addDays,
  dateKey,
  holidayShiftOf,
  repeatSchedule,
} from "../lib/design-days";
import type { Schedule } from "../lib/design-days";
import {
  isDayOff,
  OwnPatternsContext,
  presetPatterns,
} from "../lib/design-patterns";
import type { Pattern, Shift } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { PageDots } from "./design-choices";
import { DayCell } from "./design-day-cell";
import { dayGrid, WeekdayRow } from "./design-day-grid";
import { SampleTag } from "./design-fields";
import { MonthName } from "./design-month-name";
import { Pager } from "./design-pager";
import { settingsParts } from "./design-settings-parts";
import {
  ColorSchemeContext,
  presetOf,
  PreviewSchemeSwitch,
  previewWrap,
  ThemeContext,
  themeStyle,
} from "./design-theme";
import { weekLength } from "./design-week";

// The preview at the top of the スタイル and カレンダー pages: a week of
// the calendar and, swiped aside, the home screen's widgets, drawn with
// the settings being chosen.

export type StylePreviewData = { dates: Date[]; schedule: Schedule };

// This week and next as a made-up fortnight from the person's own
// patterns, the same whatever they have entered, so a change of style
// shows in the same places every time. Just shifts and days off: marks
// for 早出, 残業 or a note would mean nothing to most people here, and
// are explained where they are made instead.
export function stylePreviewOf(
  patterns: Pattern[],
  weekDates: (date: Date) => Date[],
  from: Date = designToday
): StylePreviewData {
  const dates = [...weekDates(from), ...weekDates(addDays(from, weekLength))];
  return {
    dates,
    schedule: repeatSchedule(
      sampleSequence(patterns),
      dates[0],
      dates[0],
      dates.at(-1) ?? dates[0]
    ),
  };
}

// Each working pattern with what follows it, like 明け after 夜勤, and a day
// off after every second one.
function sampleSequence(patterns: readonly Pattern[]): Shift[] {
  const ids = new Set(patterns.map((pattern) => pattern.id));
  const followers = new Set(patterns.map((pattern) => pattern.nextDay));
  const off = holidayShiftOf(patterns) ?? presetPatterns.off.id;
  const working = patterns.filter(
    (pattern) => !(isDayOff(pattern) || followers.has(pattern.id))
  );
  const sequence: Shift[] = [];
  for (const [index, pattern] of working.entries()) {
    sequence.push(pattern.id);
    const next = pattern.nextDay;
    if (next && ids.has(next)) {
      sequence.push(next);
    }
    if (index % 2 === 1 || next) {
      sequence.push(off);
    }
  }
  return sequence.at(-1) === off ? sequence : [...sequence, off];
}

// How many shifts the テーマ and color samples show in a row.
const WEEK_SAMPLE = 4;

// The marks beside each choice on the style pages are the person's own,
// as is the preview over them: a choice shows how their calendar would
// look. A working pattern, a day off, and a few as they follow each other.
// Ready-made ones stand in only for what they have none of.
export function useOwnSamples() {
  const patterns = useContext(OwnPatternsContext);
  const work =
    patterns.find((pattern) => !isDayOff(pattern)) ?? presetPatterns.day;
  const off =
    patterns.find((pattern) => isDayOff(pattern)) ?? presetPatterns.off;
  return {
    off: off.id,
    week: [...new Set(sampleSequence(patterns))].slice(0, WEEK_SAMPLE),
    work,
  };
}

// The preview can show the other of light and dark on its own, without
// touching 外観, so a style can be judged in both. A page that shows more
// in the same light or dark passes it in.
export function StylePreview({
  preview,
  shared,
  heading = false,
}: {
  preview: StylePreviewData;
  shared?: { shown: ColorScheme; onPick: (scheme: ColorScheme) => void };
  // With the month's heading over one week of days, as the カレンダー
  // page shows its 月と曜日.
  heading?: boolean;
}) {
  const { dates, schedule } = preview;
  // Under the month's heading, drawn at the calendar's own size, one week
  // is enough to show the days' colors, and keeps the preview short.
  const shownDates = heading ? dates.slice(0, weekLength) : dates;
  const scheme = useContext(ColorSchemeContext);
  const [picked, setPicked] = useState<ColorScheme>();
  const shown = shared?.shown ?? picked ?? scheme;
  const onPick = shared?.onPick ?? setPicked;
  const { theme } = useContext(ThemeContext);
  const alwaysDark = presetOf(theme).scheme === "dark";
  const [page, setPage] = useState(0);
  const progress = useMotionValue(0);
  // The calendar's height, which the widget's page takes too, so the
  // pager keeps one height and nothing under it moves as it turns. The
  // pager draws the calendar anew as it moves between its slots, so it
  // is measured by a callback that follows the element drawn, and a
  // calendar taken away (measured as nothing) leaves the height alone.
  const [calendarHeight, setCalendarHeight] = useState<number>();
  const calendarObserver = useRef<ResizeObserver>(undefined);
  const calendarRef = useCallback((element: HTMLDivElement | null) => {
    calendarObserver.current?.disconnect();
    if (!element) {
      return;
    }
    const measure = () => {
      if (element.offsetHeight > 0) {
        setCalendarHeight(element.offsetHeight);
      }
    };
    measure();
    calendarObserver.current = new ResizeObserver(measure);
    calendarObserver.current.observe(element);
  }, []);
  const calendar = (
    <div
      aria-hidden="true"
      className={settingsParts.preview}
      inert
      ref={calendarRef}
      style={themeStyle(theme, shown)}
    >
      {heading && (
        <div className={settingsParts.previewHeading}>
          <MonthName month={dates[0] ?? designToday} />
        </div>
      )}
      <WeekdayRow compact />
      <div className={dayGrid}>
        {shownDates.map((date) => (
          <DayCell
            active={false}
            date={date}
            editing={false}
            entry={schedule[dateKey(date)]}
            key={dateKey(date)}
            onPress={() => undefined}
            outside={false}
          />
        ))}
      </div>
    </div>
  );
  // The calendar, and swiped aside, the home screen's two weeks: what a
  // style or the week's settings change in the widgets too.
  const pages = [
    calendar,
    <Suspense
      fallback={
        <div
          className={settingsParts.homePreviewLoading}
          style={{ height: calendarHeight }}
        />
      }
      key="home"
    >
      <HomePreview
        height={calendarHeight}
        schedule={preview.schedule}
        today={designToday}
      />
    </Suspense>,
  ];
  return (
    <div className={previewWrap}>
      <ColorSchemeContext value={shown}>
        <Pager
          ends={{ back: page > 0, forward: page < pages.length - 1 }}
          gap={PREVIEW_PAGE_GAP}
          onStep={(direction) => {
            setPage((at) => at + direction);
          }}
          page={String(page)}
          progress={progress}
          renderPage={(offset) => pages[page + offset] ?? null}
        />
      </ColorSchemeContext>
      {/* Which page is shown, on the preview's edge, kept still like the
          switch beside it while the pages move. */}
      <SampleTag
        label={
          <PageNames names={previewPageNames} page={page} progress={progress} />
        }
      />
      {/* An always-dark テーマ has no light to switch to: its ☾ stays on. */}
      <PreviewSchemeSwitch
        disabled={alwaysDark}
        onPick={onPick}
        shown={alwaysDark ? "dark" : shown}
      />
      <PageDots
        count={pages.length}
        current={page}
        label="プレビュー（カレンダー、ホーム画面）"
        onPick={setPage}
        progress={progress}
      />
    </div>
  );
}

const PREVIEW_PAGE_GAP = 12;

const previewPageNames = ["カレンダー", "ウィジェット"];

const pageNames = {
  // Each name over the same room, in its middle; an unseen copy of the
  // longest gives the tag its width. Not a grid of overlapping names,
  // which Safari drew empty.
  name: css({ inset: 0, position: "absolute", textAlign: "center" }),
  sizer: css({ visibility: "hidden" }),
  // The names slide within the tag, cut at its edges, never over each
  // other.
  stack: css({
    display: "inline-block",
    overflow: "hidden",
    position: "relative",
    verticalAlign: "top",
  }),
};

// The shown page's name, sliding out as the next slides in, as far as
// the pages are swiped and the same way, as the dots under them follow
// the finger.
function PageNames({
  names,
  page,
  progress,
}: {
  names: string[];
  page: number;
  progress: MotionValue<number>;
}) {
  // Where the names are, in pages, kept as PageDots keeps its bar: the
  // page shown plus the swipe, and only the page once it has landed,
  // whichever of the two news comes first.
  const position = useMotionValue(page);
  const base = useRef(page);
  useMotionValueEvent(progress, "change", (share) => {
    position.set(base.current + share);
  });
  useLayoutEffect(() => {
    base.current = page;
    position.set(page);
  }, [page, position]);
  const longest = names.toSorted((a, b) => b.length - a.length)[0] ?? "";
  return (
    <span className={pageNames.stack}>
      <span className={pageNames.sizer}>{longest}</span>
      {names.map((name, index) => (
        <PageName index={index} key={name} name={name} position={position} />
      ))}
    </span>
  );
}

function PageName({
  name,
  index,
  position,
}: {
  name: string;
  index: number;
  position: MotionValue<number>;
}) {
  const x = useTransform(position, (at) => `${(index - at) * 100}%`);
  const opacity = useTransform(position, (at) =>
    Math.max(0, 1 - Math.abs(at - index))
  );
  return (
    <motion.span className={pageNames.name} style={{ opacity, x }}>
      {name}
    </motion.span>
  );
}

// The widgets come only with the preview, not with the app's first load.
const HomePreview = lazy(async () => {
  const module = await import("./design-home-preview");
  return { default: module.HomePreview };
});
