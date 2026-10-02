import { SHARED_DAYS_MAX } from "@pochical/design/limits";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, Download, Info, Share } from "lucide-react";
import { useMotionValue, useReducedMotion } from "motion/react";
import type { MotionValue } from "motion/react";
import {
  useContext,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { css, cva, cx } from "styled-system/css";

import { addDays, dateKey, formatDay, movesText } from "../lib/design-days";
import { designToday } from "../lib/design-today";
import { dayName } from "../lib/text-limits";
import { monthGrid } from "./design-date-picker";
import { dayCell, dayParts, todayMark } from "./design-day-cell";
import {
  changeOn,
  designMonth,
  everyoneOff,
  patternOn,
  sameMonth,
  togetherIn,
  weekLength,
} from "./design-group-data";
import type { Group, Member, TimeChange, Together } from "./design-group-data";
import {
  Avatar,
  Mark,
  MemberLook,
  MemberMark,
  cornerMonth,
  smallWeekday,
  toneColor,
} from "./design-group-parts";
import {
  monthTitleOf,
  monthWithYearOf,
  shortMonthOf,
} from "./design-month-name";
import { MonthTitleButton } from "./design-month-picker";
import {
  monthIndex,
  RollingName,
  ShownWithPages,
  TodayCorner,
  useTurn,
} from "./design-rolling";
import {
  DecideHeading,
  PhoneContext,
  Sheet,
  SheetHeading,
  sheetBody,
} from "./design-sheet";
import { ToastContext } from "./design-toast";
import {
  BackButton,
  ChoiceChip,
  ChoiceGrid,
  dayGrid,
  dayGridHeight,
  List,
  ListRow,
  MenuItem,
  MenuPicker,
  MenuSeparator,
  MONTH_WEEKS,
  Note,
  PageHeader,
  Pager,
  PullDownMenu,
  srOnly,
  Segment,
  SegmentedControl,
  SummaryRow,
  summaryRow,
  Tag,
  TodayButton,
  WeekdayRow,
} from "./design-ui";
import { holidayName, useWeek } from "./design-week";
import { useDisplayColor } from "./shift-mark";

// Everyone's shifts in a group: by day, by week or one person at a time,
// the days everyone is off, and a picked day's sheet.

// A day off is a light tile behind its mark, with a little room around
// it, in the same color whatever the person's pattern; a day everyone is
// off joins the tiles into one band, down a date's column in 週ごと, along
// a day's row in 一覧. The picked day is framed the same way, as one
// piece.
const offTile = {
  bg: "accent.container",
  borderRadius: "sm",
  content: '""',
  inset: "3px",
  position: "absolute",
  zIndex: -1,
} as const;
const pickedFrame = {
  border: "0 solid token(colors.accent.default)",
  content: '""',
  pointerEvents: "none",
  position: "absolute",
  zIndex: 1,
} as const;

// 週ごと: a block per week, dates across and a row per person, the
// weekdays pinned above while the page scrolls. Compact, it is the single
// week inside the hub's card, without its own frame.
const weekTable = {
  dates: css({ fontSize: "11px", fontWeight: 600, textAlign: "center" }),
  name: css({ display: "grid", placeItems: "center" }),
  nameButton: css({ bg: "transparent", border: 0, padding: 0 }),
  root: css({ display: "flex", flexDirection: "column", gap: "12px" }),
  row: cva({
    base: {
      alignItems: "center",
      display: "grid",
      gridTemplateColumns: "34px repeat(7, minmax(0, 1fr))",
    },
    variants: {
      compact: {
        true: { gridTemplateColumns: "28px repeat(7, minmax(0, 1fr))" },
      },
    },
  }),
  // Room above the dates and below the last person, so the picked day's
  // frame and the shared days off stay clear of the edge. Inside the
  // hub's card it takes the card's ground: the screen's would cut a hole
  // in it in dark mode.
  week: cva({
    base: {
      bg: "background.base",
      border: "1px solid token(colors.separator)",
      borderRadius: "2xl",
      overflow: "hidden",
      padding: "4px 0",
    },
    variants: {
      compact: {
        true: { bg: "transparent", border: 0, borderRadius: 0, padding: 0 },
      },
    },
  }),
  // A list of months: its rows placed where they fall, only those in
  // sight drawn.
  item: css({ left: 0, position: "absolute", top: 0, width: "100%" }),
  list: css({ position: "relative" }),
  // A month's heading between the weeks of a list of months, with room
  // above to set the months apart.
  divider: css({ paddingTop: "24px" }),
  weekdays: cva({
    base: { color: "text.quaternary", fontSize: "10px", textAlign: "center" },
    variants: {
      pinned: {
        true: {
          bg: "background.base",
          margin: "-8px 0 -8px",
          padding: "8px 0 4px",
          position: "sticky",
          top: "var(--pinned-top, -8px)",
          zIndex: 5,
        },
      },
    },
  }),
};

// A date or a person's day in 週ごと.
const weekCell = cva({
  base: { isolation: "isolate", position: "relative" },
  compoundVariants: [
    { button: true, css: { padding: 0 }, kind: "date" },
    // The band is the day's tiles joined down the column: as far in from
    // its sides, with their corners, its ends 3px clear of the week's
    // edge. The picked frame has the same shape, so picking the day only
    // draws the frame round it.
    {
      css: {
        "&::before": {
          ...offTile,
          borderRadius: "token(radii.sm) token(radii.sm) 0 0",
          inset: "-1px 3px 0",
        },
      },
      kind: "date",
      together: true,
    },
    {
      css: { "&::before": { borderRadius: 0, inset: "0 3px" } },
      kind: "cell",
      together: true,
    },
    {
      css: {
        "&::before": {
          borderRadius: "0 0 token(radii.sm) token(radii.sm)",
          inset: "0 3px -1px",
        },
      },
      kind: "cell",
      last: true,
      together: true,
    },
    // In the small weekly table the tiles sit tighter, 2px above and
    // below, and the band is those tiles joined, as in the big one.
    {
      compact: true,
      css: { "&::before": { inset: "2px 3px 0" } },
      kind: "date",
      together: true,
    },
    {
      compact: true,
      css: { "&::before": { inset: "0 3px" } },
      kind: "cell",
      together: true,
    },
    {
      compact: true,
      css: { "&::before": { inset: "0 3px 2px" } },
      kind: "cell",
      last: true,
      together: true,
    },
    // Tiles sit tighter in the small weekly table.
    {
      compact: true,
      css: { "&::before": { borderRadius: "sm", inset: "2px 3px" } },
      off: true,
      together: false,
    },
    { compact: true, css: { height: "26px" }, kind: "cell" },
    {
      css: {
        "&::after": {
          borderRadius: "token(radii.sm) token(radii.sm) 0 0",
          borderWidth: "1.5px 1.5px 0",
          inset: "-1px 3px 0",
        },
      },
      kind: "date",
      picked: true,
    },
    {
      css: { "&::after": { borderWidth: "0 1.5px", inset: "0 3px" } },
      kind: "cell",
      picked: true,
    },
    {
      css: {
        "&::after": {
          borderRadius: "0 0 token(radii.sm) token(radii.sm)",
          borderWidth: "0 1.5px 1.5px",
          inset: "0 3px -1px",
        },
      },
      kind: "cell",
      last: true,
      picked: true,
    },
    // The small table's frame follows its band.
    {
      compact: true,
      css: { "&::after": { inset: "2px 3px 0" } },
      kind: "date",
      picked: true,
    },
    {
      compact: true,
      css: { "&::after": { inset: "0 3px 2px" } },
      kind: "cell",
      last: true,
      picked: true,
    },
  ],
  defaultVariants: { compact: false, last: false, off: false, together: false },
  variants: {
    button: {
      true: {
        bg: "transparent",
        border: 0,
        font: "inherit",
        padding: 0,
        width: "100%",
      },
    },
    compact: { false: {}, true: {} },
    kind: {
      cell: { display: "grid", height: "30px", placeItems: "center" },
      date: { padding: "8px 0 4px" },
    },
    last: { false: {}, true: {} },
    off: { false: {}, true: { "&::before": offTile } },
    outside: { true: { opacity: 0.35 } },
    picked: { true: { "&::after": pickedFrame } },
    together: { false: {}, true: {} },
    tone: {
      holiday: { color: "calendar.holiday" },
      plain: {},
      saturday: { color: "calendar.saturday" },
    },
  },
});

// 一覧: a row per day and a column per person, like a printed roster.
// Up to seven people the page scrolls and the frame shows whole, one
// scroll only; more scroll sideways inside it, the dates and your own
// column pinned, over the cells' tiles, with an edge only then.
const dayRows = {
  cell: cva({
    base: {
      borderBottom: "1px solid token(colors.separator)",
      isolation: "isolate",
      padding: "0 4px",
      position: "relative",
      textAlign: "center",
    },
    compoundVariants: [
      // The band is the day's tiles joined along the row, as far in and
      // with their corners; the picked frame has the same shape, so
      // picking the day only draws the frame round it, as in 週ごと.
      {
        css: { "&::before": { borderRadius: 0, inset: "3px 0" } },
        off: true,
        together: true,
      },
      {
        css: {
          "&::before": {
            borderRadius: "0 token(radii.sm) token(radii.sm) 0",
            inset: "3px 3px 3px 0",
          },
        },
        end: true,
        off: true,
        together: true,
      },
      {
        css: { "&::after": { borderWidth: "1.5px 0", inset: "3px 0" } },
        end: false,
        picked: true,
      },
      {
        css: {
          "&::after": {
            borderRadius: "0 token(radii.sm) token(radii.sm) 0",
            borderWidth: "1.5px 1.5px 1.5px 0",
            inset: "3px 3px 3px 0",
          },
        },
        end: true,
        picked: true,
      },
      {
        css: { boxShadow: "1px 0 0 token(colors.separator)" },
        me: true,
        scrolls: true,
      },
    ],
    defaultVariants: { end: false },
    variants: {
      end: { false: {}, true: {} },
      me: {
        true: {
          bg: "background.base",
          left: "var(--date-width)",
          position: "sticky",
          zIndex: 2,
        },
      },
      off: { true: { "&::before": offTile } },
      picked: { true: { "&::after": pickedFrame } },
      scrolls: { true: {} },
      together: { true: {} },
    },
  }),
  cellButton: css({
    alignItems: "center",
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "flex",
    font: "inherit",
    justifyContent: "center",
    minHeight: "36px",
    padding: 0,
    width: "100%",
  }),
  date: cva({
    base: {
      bg: "background.base",
      borderBottom: "1px solid token(colors.separator)",
      borderLeft: "3px solid transparent",
      fontWeight: 600,
      height: "36px",
      isolation: "isolate",
      left: 0,
      padding: "0 0 0 12px",
      position: "sticky",
      textAlign: "left",
      zIndex: 2,
    },
    variants: {
      picked: {
        true: {
          "&::after": {
            ...pickedFrame,
            borderRadius: "token(radii.sm) 0 0 token(radii.sm)",
            borderWidth: "1.5px 0 1.5px 1.5px",
            inset: "3px 0 3px 3px",
          },
        },
      },
      // Today's row also has a bar at its start, beside its date in the
      // accent.
      today: { true: { borderLeftColor: "accent.default" } },
      together: {
        true: {
          "&::before": {
            ...offTile,
            borderRadius: "token(radii.sm) 0 0 token(radii.sm)",
            inset: "3px 0 3px 3px",
          },
        },
      },
    },
  }),
  dateButton: css({
    bg: "transparent",
    border: 0,
    color: "inherit",
    display: "block",
    font: "inherit",
    padding: 0,
    textAlign: "left",
    width: "100%",
  }),
  // A month's heading between the months, with room above to set the
  // months apart. As wide as the frame, not the table, and kept at its left
  // edge when the table scrolls sideways.
  divider: cva({
    base: {
      "& > *": { left: 0, position: "sticky", width: "100cqi" },
      padding: "36px 0 12px",
    },
    variants: {
      scrolls: {
        true: {
          "& > *": { left: "8px", width: "calc(100cqi - 16px)" },
          paddingInline: "8px",
        },
      },
    },
  }),
  empty: css({ color: "text.disabled", fontSize: "10px" }),
  // Stands for the rows of a list of months not drawn yet.
  spacer: css({ border: 0, padding: 0 }),
  // The header stays on top as the rows scroll; a border would scroll away
  // with collapsed borders, so a shadow draws its line.
  head: cva({
    base: {
      bg: "background.base",
      boxShadow: "0 1px 0 token(colors.separator)",
      fontWeight: 600,
      padding: "8px 4px",
      position: "sticky",
      top: 0,
      zIndex: 3,
    },
    compoundVariants: [
      {
        css: {
          boxShadow:
            "0 1px 0 token(colors.separator), 1px 0 0 token(colors.separator)",
        },
        me: true,
        scrolls: true,
      },
    ],
    variants: {
      corner: { true: { left: 0, width: "var(--date-width)", zIndex: 4 } },
      me: { true: { left: "var(--date-width)", zIndex: 4 } },
      // Under the page's own pinned rows, when it has any.
      page: { true: { top: "var(--pinned-top, -8px)" } },
      scrolls: { true: {} },
    },
  }),
  mark: css({
    alignItems: "center",
    display: "flex",
    gap: "4px",
    justifyContent: "center",
    minWidth: 0,
  }),
  // A face with its name, or the face alone, centered, once names do not
  // fit.
  member: cva({
    base: {
      alignItems: "center",
      bg: "transparent",
      border: 0,
      color: "inherit",
      display: "inline-flex",
      font: "inherit",
      gap: "4px",
      maxWidth: "100%",
      overflow: "hidden",
      padding: 0,
      whiteSpace: "nowrap",
    },
    variants: {
      centered: { true: { justifyContent: "center", width: "100%" } },
    },
  }),
  name: css({
    color: "text.primary",
    fontSize: "11px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  scroll: cva({
    base: {
      bg: "background.base",
      border: "1px solid token(colors.separator)",
      borderRadius: "2xl",
      containerType: "inline-size",
      maxHeight: "520px",
      overflow: "auto",
    },
    // Scrolled by the page, the list of months has no ends to frame, so
    // its rows stand bare, as a plain list's, their lines between them.
    // The frame is what the months' headings fill.
    variants: {
      page: {
        true: {
          border: 0,
          borderRadius: 0,
          maxHeight: "none",
          overflow: "visible",
        },
      },
    },
  }),
  table: css({
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: "12px",
    tableLayout: "fixed",
    width: "100%",
  }),
  weekday: css({ fontSize: "9px", fontWeight: 400, marginLeft: "4px" }),
};

// Picking days to share: everyone's days off to take at once, then the
// month to tap days in.
const shareDays = {
  day: cva({
    base: {
      "&[aria-pressed=true]": { bg: "accent.fill", color: "accent.onFill" },
      _disabled: { visibility: "hidden" },
      bg: "transparent",
      border: 0,
      height: "36px",
      padding: 0,
    },
    variants: {
      together: { true: { bg: "accent.container" } },
      tone: {
        holiday: { color: "calendar.holiday" },
        plain: {},
        saturday: { color: "calendar.saturday" },
      },
    },
  }),
  days: css({
    display: "grid",
    gap: "4px",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  }),
  // みんな休み over a row of its days that scrolls sideways out to the
  // sheet's sides, as 1人ずつ's people do: one height however many there
  // are, and a half-shown day says there are more.
  suggest: css({
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    // Its own part, 24px clear of the month as the switch above it is.
    marginBottom: "12px",
  }),
  // Tinted as the calendar's days everyone is off, so the row and the
  // month say the same thing; picked, filled as a picked day is.
  suggestion: css({
    "&[aria-pressed=true]": { bg: "accent.fill", color: "accent.onFill" },
    bg: "accent.container",
    border: 0,
    borderRadius: "full",
    color: "accent.default",
    flexShrink: 0,
    fontWeight: 600,
    minHeight: "32px",
    padding: "0 12px",
    textStyle: "footnote",
  }),
  // Out over the sheet's 24px sides, the first day in line with the page.
  suggestions: css({
    display: "flex",
    gap: "8px",
    margin: "0 -24px",
    overflowX: "auto",
    padding: "0 24px",
  }),
  togetherLabel: css({
    color: "accent.default",
    fontWeight: 600,
    textStyle: "footnote",
  }),
};

// The group's shifts page: the month row, the table under it, and room at
// the foot for the picked day's sheet to cover.
const shiftsPage = {
  // As tall as the longest list, up to what the sheet has room for, so it
  // keeps its height from one person to the next.
  legendBody: css({
    margin: "0 -24px -28px",
    minHeight: 0,
    overflow: "hidden",
    position: "relative",
  }),
  // Over the legend's list, the chips running out to the sheet's edges as
  // they do to the screen's in 1人ずつ.
  legendPeople: css({
    "--screen-left": "24px",
    "--screen-right": "24px",
    flexShrink: 0,
    marginBottom: "16px",
    paddingTop: "8px",
  }),
  // Over the sizing lists, the one person's, scrolling only when it is
  // longer than the room.
  legendScroll: css({
    "& > *": { flexShrink: 0 },
    display: "flex",
    flexDirection: "column",
    inset: 0,
    overflowY: "auto",
    padding: "2px 24px 28px",
    position: "absolute",
  }),
  // Everyone's lists in one place, unseen, giving the body its height.
  legendSizer: css({
    "& > *": { gridArea: "1 / 1", minWidth: 0 },
    display: "grid",
    padding: "2px 24px 28px",
    visibility: "hidden",
  }),
  monthName: css({ fontWeight: 600, textStyle: "headline" }),
  // The month's name and 今日 or 今月.
  monthRow: css({
    alignItems: "center",
    display: "flex",
    height: "48px",
    justifyContent: "space-between",
  }),
  root: cva({
    base: { display: "flex", flexDirection: "column", gap: "16px" },
    // Room to scroll the last weeks out from under the sheet.
    variants: { withSheet: { true: { paddingBottom: "300px" } } },
  }),
  // Over a list of months, the page's header and the month row stay on
  // top, spanning the screen so the rows pass under them. The scroller is
  // already the screen's width, so it bleeds only up over the scroller's
  // top padding: bleeding sideways would let the page scroll sideways.
  bar: css({
    bg: "background.base",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    margin: "-8px 0 0",
    padding: "8px 0 0",
    position: "sticky",
    top: "-8px",
    zIndex: 6,
  }),
  // The browser's scroll anchoring would hold a row in place as the
  // spacers before the drawn rows change, throwing the list about; the
  // list keeps its own place.
  scrolling: css({
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    overflowAnchor: "none",
  }),
  sheetTime: css({ color: "text.quaternary", textStyle: "caption" }),
  // A mark and its name, as markValue sets them apart in a row's value.
  sheetValue: css({ alignItems: "center", display: "inline-flex", gap: "8px" }),
  // Centered on the row, as SummaryRow's chevron.
  togetherChevron: css({ alignSelf: "center" }),
  togetherNone: css({
    color: "text.tertiary",
    fontWeight: 600,
    textStyle: "headline",
  }),
};

// 1人ずつ: who to show, a row of chips that scrolls sideways out to the
// screen's edges, so a half-shown name says there are more.
const people = {
  // Kept whole in the row that scrolls.
  choice: css({ flexShrink: 0 }),
  // Out to the screen's edges, the first chip in line with the page.
  list: css({
    border: 0,
    display: "flex",
    gap: "8px",
    marginBottom: 0,
    marginLeft: "calc(-1 * var(--screen-left))",
    marginRight: "calc(-1 * var(--screen-right))",
    marginTop: "-8px",
    minWidth: 0,
    overflowX: "auto",
    paddingBottom: 0,
    paddingLeft: "var(--screen-left)",
    paddingRight: "var(--screen-right)",
    paddingTop: 0,
    position: "relative",
  }),
};

// Picking days to share: days everyone is off first, then any day on a
// small calendar. Several can be picked at once. In a group chat, 共有 |
// 投票 at its top puts them to the vote instead, seen from the moment it
// opens: one way in for both, as their sheet is the same.
export function DaySheet({
  open,
  onOpenChange,
  members,
  onShare,
  pollable = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  // `poll`: put to the vote rather than shared as they are.
  onShare: (days: Date[], poll: boolean) => void;
  // In a group chat, several days can be put to the vote.
  pollable?: boolean;
}) {
  return (
    <Sheet label="日にちを共有" onOpenChange={onOpenChange} open={open}>
      <DaySheetBody
        members={members}
        onClose={() => {
          onOpenChange(false);
        }}
        onShare={onShare}
        pollable={pollable}
      />
    </Sheet>
  );
}

// What is under the share sheet's heading, 12px apart; the heading keeps
// its own 16px, as on the other sheets.
const daySheetStack = css({
  display: "flex",
  flexDirection: "column",
  gap: "12px",
});

// Inside the sheet, so what was picked starts over each time it opens.
function DaySheetBody({
  members,
  onClose,
  onShare,
  pollable,
}: {
  members: Member[];
  onClose: () => void;
  onShare: (days: Date[], poll: boolean) => void;
  pollable: boolean;
}) {
  const [mode, setMode] = useState<"share" | "poll">("share");
  const poll = pollable && mode === "poll";
  const weekTools = useWeek();
  const [month, setMonth] = useState(
    new Date(designToday.getFullYear(), designToday.getMonth(), 1)
  );
  const [picked, setPicked] = useState<Date[]>([]);
  const toast = useContext(ToastContext);
  // A poll needs two days to choose from.
  const canPoll = pollable && picked.length > 1;
  const isPicked = (date: Date) =>
    picked.some((item) => dateKey(item) === dateKey(date));
  const toggle = (date: Date) => {
    if (isPicked(date)) {
      setPicked(picked.filter((item) => dateKey(item) !== dateKey(date)));
      return;
    }
    // A message shares a month's worth at most; past it a day stays
    // unpicked and says why, as choosing too many photos does.
    if (picked.length >= SHARED_DAYS_MAX) {
      toast(`一度に送れるのは${SHARED_DAYS_MAX}日までです`, "problem");
      return;
    }
    setPicked([...picked, date].sort((a, b) => a.getTime() - b.getTime()));
  };
  const suggestions = Array.from({ length: 45 }, (_, index) =>
    addDays(designToday, index)
  ).filter((date) => everyoneOff(members, date));
  return (
    <>
      <DecideHeading
        action="送る"
        disabled={picked.length === 0 || (poll && !canPoll)}
        onAction={() => {
          onShare(picked, canPoll && poll);
        }}
        onCancel={onClose}
        title={poll ? "日にちの投票" : "日にちを共有"}
      />
      <div className={daySheetStack}>
        {pollable && (
          <SegmentedControl
            // Its own part, 24px clear of the calendar as parts are,
            // where the calendar's rows keep their 12px.
            className={modeSwitch}
            label="日にちをどうするか"
            onValueChange={setMode}
            value={mode}
          >
            <Segment value="share">共有</Segment>
            <Segment value="poll">投票</Segment>
          </SegmentedControl>
        )}
        {suggestions.length > 0 && (
          <div className={shareDays.suggest}>
            <span className={shareDays.togetherLabel}>みんな休み</span>
            <div className={shareDays.suggestions}>
              {suggestions.map((date) => (
                <button
                  aria-pressed={isPicked(date)}
                  className={shareDays.suggestion}
                  key={dateKey(date)}
                  onClick={() => {
                    toggle(date);
                  }}
                  type="button"
                >
                  {date.getMonth() + 1}/{date.getDate()}
                  <small className={smallWeekday}>
                    {weekTools.weekdayName(date.getDay())}
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className={monthGrid.heading}>
          <button
            aria-label="前の月"
            className={monthGrid.arrow}
            onClick={() => {
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} />
          </button>
          <strong aria-live="polite">
            <span className={srOnly}>{monthWithYearOf(month)}</span>
            <span aria-hidden="true">
              {monthWithYearOf(month, weekTools.english)}
            </span>
          </strong>
          <button
            aria-label="次の月"
            className={monthGrid.arrow}
            onClick={() => {
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
            }}
            type="button"
          >
            <ChevronRight aria-hidden="true" size={20} />
          </button>
        </div>
        <div
          className={shareDays.days}
          // The weekdays, then room for six weeks, the most a month spans,
          // so the sheet keeps its height as the months turn and ‹ › stay
          // under the finger.
          style={{ gridTemplateRows: `auto repeat(${MONTH_WEEKS}, 36px)` }}
        >
          {weekTools.weekdays.map((day) => (
            <span
              aria-hidden="true"
              className={monthGrid.weekday}
              key={day.day}
            >
              {day.label}
            </span>
          ))}
          {weekTools.monthDates(month).map((date) => {
            const outside = !sameMonth(date, month);
            const together = !outside && everyoneOff(members, date);
            const today = dateKey(date) === dateKey(designToday);
            return (
              <button
                aria-label={`${formatDay(date)}${together ? "、みんな休み" : ""}`}
                aria-pressed={isPicked(date)}
                className={cx(
                  shareDays.day({
                    together,
                    tone: today ? "plain" : weekTools.dateTone(date),
                  }),
                  monthGrid.day,
                  today && todayMark,
                  today && monthGrid.today
                )}
                disabled={outside}
                key={dateKey(date)}
                onClick={() => {
                  toggle(date);
                }}
                type="button"
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        {/* Offered once there is more than one day to choose from, as
            LINE's 日程調整 is a way of choosing among days. */}
        <Note>{dayNote(picked.length, poll)}</Note>
      </div>
    </>
  );
}

const modeSwitch = css({ marginBottom: "12px" });

// What sending will do, under the days.
function dayNote(count: number, poll: boolean) {
  if (poll && count < 2) {
    return "候補の日を2日以上選んでください。うすく色のついた日は、みんな休みの日です。";
  }
  if (count === 0) {
    return "うすく色のついた日は、みんな休みの日です。";
  }
  return poll
    ? `${count}日の中から、みんなが行ける日を投票で決めます。`
    : `${count}日分のみんなのシフトを送ります。`;
}

// 一覧 reads most easily, so it comes first while everyone fits across;
// past that it scrolls sideways, and 週ごと, which grows only downwards,
// takes over. 1人ずつ shows one member at a time in a calendar like yours.
export type Layout = "days" | "weeks" | "person";

const layoutOptions: { value: Layout; label: string }[] = [
  { label: "一覧", value: "days" },
  { label: "週ごと", value: "weeks" },
  { label: "1人ずつ", value: "person" },
];

export function ShiftsPage({
  group,
  backLabel,
  day,
  month: initialMonth,
  layout,
  onLayout: setLayout,
  onBack,
  onShareDay,
}: {
  group: Group;
  backLabel: string;
  // A day to open picked, from 次のみんな休み.
  day?: Date;
  month?: Date;
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onBack: () => void;
  onShareDay: (date: Date) => void;
}) {
  const weekTools = useWeek();
  const [month, setMonth] = useState(initialMonth ?? designMonth);
  // Whom 1人ずつ shows; chosen above the month, like a filter.
  const [personId, setPersonId] = useState(
    group.members.find((member) => !member.me)?.id ?? group.members[0].id
  );
  // Whose marks the legend sheet shows; kept while it closes.
  const [legendOf, setLegendOf] = useState(personId);
  const [legendOpen, setLegendOpen] = useState(false);
  const [picked, setPicked] = useState<Date | undefined>(day);
  const toast = useContext(ToastContext);
  const dates = weekTools.monthDates(month);
  const pick = (date: Date) => {
    setPicked(picked && dateKey(picked) === dateKey(date) ? undefined : date);
  };
  // A list of months pins the page's header over it, with the month row.
  const scrolling = layout !== "person";
  const header = (
    <PageHeader
      inlineTitle={group.name}
      leading={<BackButton onClick={onBack}>{backLabel}</BackButton>}
      trailing={
        <ShiftsMenu
          layout={layout}
          onLayout={setLayout}
          onLegend={() => {
            setLegendOf(personId);
            setLegendOpen(true);
          }}
          onSave={() => {
            toast(`${month.getMonth() + 1}月のシフト表を写真に保存しました`);
          }}
        />
      }
    />
  );
  return (
    <div className={shiftsPage.root({ withSheet: picked !== undefined })}>
      {!scrolling && header}
      <PagedShifts
        dates={dates}
        group={group}
        header={header}
        layout={layout}
        month={month}
        onMember={(member) => {
          setLegendOf(member.id);
          setLegendOpen(true);
        }}
        onMonth={setMonth}
        onPerson={setPersonId}
        onPickDay={pick}
        personId={personId}
        picked={picked}
      />
      <PickedDaySheet
        date={picked}
        members={group.members}
        onClose={() => {
          setPicked(undefined);
        }}
        onShare={onShareDay}
      />
      <LegendSheet
        members={group.members}
        onOpenChange={setLegendOpen}
        onPick={setLegendOf}
        open={legendOpen}
        picked={legendOf}
      />
    </div>
  );
}

// One pull-down for the page's secondary actions: how the table is laid
// out, what the marks mean, and saving it as a picture.
function ShiftsMenu({
  layout,
  onLayout,
  onLegend,
  onSave,
}: {
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onLegend: () => void;
  onSave: () => void;
}) {
  const current = layoutOptions.find((option) => option.value === layout);
  return (
    <PullDownMenu label={current?.label}>
      <MenuPicker
        onValueChange={onLayout}
        options={layoutOptions}
        value={layout}
      />
      <MenuSeparator />
      <MenuItem
        icon={<Info aria-hidden="true" size={18} />}
        onSelect={onLegend}
        value="legend"
      >
        シフトパターン
      </MenuItem>
      <MenuItem
        icon={<Download aria-hidden="true" size={18} />}
        onSelect={onSave}
        value="save"
      >
        画像で保存
      </MenuItem>
    </PullDownMenu>
  );
}

function PagedShifts({
  group,
  header,
  layout,
  month,
  dates,
  picked,
  onMonth,
  onPickDay,
  onMember,
  personId,
  onPerson,
}: {
  group: Group;
  // The page's header, pinned with the month over a list of months.
  header: ReactNode;
  layout: Layout;
  month: Date;
  dates: Date[];
  picked?: Date;
  onMonth: (month: Date) => void;
  onPickDay: (date: Date) => void;
  onMember: (member: Member) => void;
  // Whom 1人ずつ shows, which シフトパターン opens on too.
  personId: string;
  onPerson: (id: string) => void;
}) {
  const { weekStart } = useWeek();
  // How far 1人ずつ's pages are dragged, which the month row follows, and
  // the month a swipe last landed on, whose name the drag brought in.
  const pageDrag = useMotionValue(0);
  const [swipedTo, setSwipedTo] = useState<number>();
  const goTo = (target: Date) => {
    setSwipedTo(undefined);
    onMonth(target);
  };
  const person =
    group.members.find((member) => member.id === personId) ?? group.members[0];
  const together = togetherIn(
    group.members,
    dates.filter((date) => sameMonth(date, month))
  );
  const thisMonth =
    sameMonth(month, designToday) &&
    month.getFullYear() === designToday.getFullYear();
  if (layout !== "person") {
    // Remounted per layout and week start, so each opens where the other
    // left off, with its weeks as the settings draw them.
    return (
      <ScrollingShifts
        group={group}
        header={header}
        key={`${layout}-${weekStart}`}
        layout={layout}
        month={month}
        onMember={onMember}
        onMonth={onMonth}
        onPickDay={onPickDay}
        picked={picked}
      />
    );
  }
  return (
    <>
      <PeoplePicker members={group.members} onPick={onPerson} picked={person} />
      <MonthRow
        month={month}
        onPick={goTo}
        onToday={
          thisMonth
            ? undefined
            : () => {
                goTo(monthAfter(designToday, 0));
              }
        }
        progress={pageDrag}
        swiped={swipedTo === monthIndex(month)}
        unit="月"
      />
      <PersonPager
        group={group}
        member={person}
        month={month}
        onMonth={(target) => {
          onMonth(target);
          setSwipedTo(monthIndex(target));
        }}
        progress={pageDrag}
        onPickDay={onPickDay}
        picked={picked}
      />
      <PagedTogether
        beside={{
          next: togetherIn(group.members, daysOf(monthAfter(month, 1))),
          previous: togetherIn(group.members, daysOf(monthAfter(month, -1))),
        }}
        month={month}
        onPickDay={onPickDay}
        progress={pageDrag}
        swiped={swipedTo === monthIndex(month)}
        together={together}
      />
    </>
  );
}

const COUNT = /^\d+$/u;

// What a month's みんな休み says: the number of days, or none.
function togetherValue({ days, unsure }: Together) {
  if (days.length > 0) {
    return String(days.length);
  }
  return unsure ? "未入力あり" : "なし";
}

// 1人ずつ's みんな休み, whose month turns with the pages: the month in its
// label and what it counts roll with a drag, as 今月のお休み does under
// the calendar, and a count's 日 and chevron leave with it toward a month
// of なし, which has nothing to open.
function PagedTogether({
  month,
  together,
  beside,
  progress,
  swiped,
  onPickDay,
}: {
  month: Date;
  together: Together;
  beside: { previous: Together; next: Together };
  progress: MotionValue<number>;
  swiped: boolean;
  onPickDay: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;
  const turn = useTurn(monthIndex(month), swiped);
  const monthOf = (by: number) => {
    const date = monthAfter(month, by);
    return monthIndex(date) === monthIndex(designToday)
      ? "今月"
      : `${date.getMonth() + 1}月`;
  };
  const label = `${monthOf(0)}のみんな休み`;
  const value = togetherValue(together);
  const counted = together.days.length > 0;
  const rolled = { progress, still: reduceMotion, turn };
  const withCount = {
    nextShown: beside.next.days.length > 0,
    previousShown: beside.previous.days.length > 0,
    progress,
    shown: counted,
    swiped,
  };
  const contents = (
    <>
      <span className={srOnly}>{label}</span>
      <span aria-hidden="true">
        <RollingName
          {...rolled}
          next={monthOf(1)}
          previous={monthOf(-1)}
          text={monthOf(0)}
        />
        のみんな休み
      </span>
      <span className={srOnly}>{counted ? `${value}日` : value}</span>
      <strong aria-hidden="true" className={summaryRow.count}>
        <RollingName
          {...rolled}
          end
          next={togetherValue(beside.next)}
          previous={togetherValue(beside.previous)}
          render={(text) =>
            COUNT.test(text) ? (
              text
            ) : (
              <span className={shiftsPage.togetherNone}>{text}</span>
            )
          }
          text={value}
        />
        <ShownWithPages {...withCount}>
          <span className={summaryRow.unit}>日</span>
        </ShownWithPages>
        <ShownWithPages {...withCount} className={shiftsPage.togetherChevron}>
          <ChevronRight
            aria-hidden="true"
            className={summaryRow.chevron}
            size={17}
          />
        </ShownWithPages>
      </strong>
    </>
  );
  if (!counted) {
    return <div className={summaryRow.row}>{contents}</div>;
  }
  return (
    <>
      <button
        aria-haspopup="dialog"
        className={summaryRow.row}
        onClick={() => {
          setOpen(true);
        }}
        type="button"
      >
        {contents}
      </button>
      <TogetherSheet
        days={together.days}
        label={label}
        onOpenChange={setOpen}
        onPickDay={onPickDay}
        open={open}
      />
    </>
  );
}

// A month's days everyone is off: how many, and the dates in a sheet to
// go to. None, it says so, or that days not entered yet leave it
// open.
function TogetherSummary({
  label,
  title = label,
  together: { days, unsure },
  onPickDay,
}: {
  label: string;
  // The sheet's title, when the row leaves the month to its heading.
  title?: string;
  together: Together;
  onPickDay: (date: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  if (days.length === 0) {
    return (
      <div className={summaryRow.row}>
        <span>{label}</span>
        <span className={shiftsPage.togetherNone}>
          {unsure ? "未入力あり" : "なし"}
        </span>
      </div>
    );
  }
  return (
    <>
      <SummaryRow
        days={days.length}
        label={label}
        onOpen={() => {
          setOpen(true);
        }}
      />
      <TogetherSheet
        days={days}
        label={title}
        onOpenChange={setOpen}
        onPickDay={onPickDay}
        open={open}
      />
    </>
  );
}

// The days everyone is off in a month, a date to a row.
function TogetherSheet({
  label,
  days,
  open,
  onOpenChange,
  onPickDay,
}: {
  label: string;
  days: Date[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPickDay: (date: Date) => void;
}) {
  return (
    <Sheet label={label} onOpenChange={onOpenChange} open={open}>
      <SheetHeading
        onClose={() => {
          onOpenChange(false);
        }}
        title={label}
      />
      {/* Picking a date closes this and shows everyone that day. */}
      <div className={sheetBody}>
        <List>
          {days.map((date) => (
            <ListRow
              key={dateKey(date)}
              onClick={() => {
                onOpenChange(false);
                onPickDay(date);
              }}
              label={formatDay(date)}
              value={holidayName(date) ?? ""}
            />
          ))}
        </List>
      </div>
    </Sheet>
  );
}

function monthKey(month: Date) {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
}

// The 1st of the month `count` months on from the date's.
function monthAfter(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function daysOf(month: Date) {
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0
  ).getDate();
  return Array.from(
    { length: count },
    (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)
  );
}

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
      together: togetherIn(members, daysOf(month)),
    });
    if (layout === "days") {
      for (const date of daysOf(month)) {
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
function ScrollingShifts({
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
    return sameMonth(month, designToday) &&
      month.getFullYear() === designToday.getFullYear()
      ? todayIndex
      : indexOfMonth(month);
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

const monthDivider = {
  name: css({ fontWeight: 700, margin: 0, textStyle: "title3" }),
  // Without みんな休み, a note on the name's line.
  note: css({ color: "text.tertiary", textStyle: "subheadline" }),
  root: cva({
    base: { display: "flex", flexDirection: "column", gap: "12px" },
    variants: {
      quiet: {
        true: { alignItems: "baseline", flexDirection: "row", gap: "12px" },
      },
    },
  }),
};

// The month's heading in the list of months, over the row of its days
// everyone is off, the row 1人ずつ has under its month, the whole width to
// press. Without any, a note beside the name says there are none, or that
// days not entered yet leave it open: no row that cannot be pressed.
function MonthDivider({
  month,
  together,
  onPickDay,
}: {
  month: Date;
  together: Together;
  onPickDay: (date: Date) => void;
}) {
  const { english } = useWeek();
  const thisYear = month.getFullYear() === designToday.getFullYear();
  const name = thisYear
    ? `${month.getMonth() + 1}月`
    : `${month.getFullYear()}年${month.getMonth() + 1}月`;
  const title = `${
    thisYear && month.getMonth() === designToday.getMonth() ? "今月" : name
  }のみんな休み`;
  // In English as the month row over it writes it, said in 日本語 to
  // screen readers as the rest of the screen is.
  const heading = english ? (
    <h4 className={monthDivider.name}>
      <span className={srOnly}>{name}</span>
      <span aria-hidden="true">
        {thisYear ? monthTitleOf(month, true) : monthWithYearOf(month, true)}
      </span>
    </h4>
  ) : (
    <h4 className={monthDivider.name}>{name}</h4>
  );
  if (together.days.length === 0) {
    return (
      <div className={monthDivider.root({ quiet: true })}>
        {heading}
        <span className={monthDivider.note}>
          {together.unsure ? "未入力の日あり" : "みんな休みなし"}
        </span>
      </div>
    );
  }
  return (
    <div className={monthDivider.root()}>
      {heading}
      <TogetherSummary
        label="みんな休み"
        onPickDay={onPickDay}
        title={title}
        together={together}
      />
    </div>
  );
}

// The shift table's month: its name (2026年9月, or September 2026 as the
// カレンダー page's 月と曜日 asks), which opens a choice of months, and
// the way back to today's day or month while it is out of sight. Over a
// list of months, it names the month in sight, rolling to the next as the
// list scrolls on, the way it went. Over 1人ずつ's pages (`progress`), the
// name and 今月 follow the drag, as over the calendar.
function MonthRow({
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

// Whether an element shows within the screen's scroll, and a big group's
// table frame, not scrolled or swiped out of them.
function inSight(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const views = ["[data-table-scroll]", "[data-screen-scroll]"]
    .map((selector) => element.closest(selector))
    .filter((view) => view !== null);
  return (
    views.length > 0 &&
    views.every((view) => {
      const frame = view.getBoundingClientRect();
      return (
        bounds.bottom > frame.top &&
        bounds.top < frame.bottom &&
        bounds.right > frame.left &&
        bounds.left < frame.right
      );
    })
  );
}

// The day picked in the table, in a sheet along the bottom. It leaves the
// table undimmed and live: the picked day stays framed above it, and
// picking another day switches the sheet to that day.
function PickedDaySheet({
  date: picked,
  members,
  onClose,
  onShare,
}: {
  date?: Date;
  members: Member[];
  onClose: () => void;
  // Sends the day, everyone's shifts on it, to the group chat.
  onShare: (date: Date) => void;
}) {
  // The day stays while the sheet sinks away.
  const [date, setDate] = useState(picked ?? designToday);
  if (picked && picked !== date) {
    setDate(picked);
  }
  const phone = useContext(PhoneContext);
  const together = everyoneOff(members, date);
  return (
    <Sheet
      // Back to the day in the table, in whichever layout shows it, while
      // it is in sight; once scrolled or swiped away, to the month's name,
      // which says where the table is, rather than pulling the day back.
      finalFocusEl={() => {
        const root = phone?.current ?? document;
        const day = root.querySelector<HTMLElement>(
          `[data-pick-day="${dateKey(date)}"]`
        );
        if (day && inSight(day)) {
          return day;
        }
        const title = [
          ...root.querySelectorAll<HTMLElement>("[data-month-title]"),
        ].find((element) => element.offsetParent !== null);
        return title ?? day;
      }}
      label={formatDay(date)}
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={picked !== undefined}
    >
      <SheetHeading
        action={{
          icon: <Share aria-hidden="true" size={18} />,
          label: "全体チャットで共有",
          onClick: () => {
            onShare(date);
          },
        }}
        onClose={onClose}
        title={formatDay(date)}
      >
        {together && (
          <Tag size="sm" tone="accent">
            みんな休み
          </Tag>
        )}
      </SheetHeading>
      <div className={sheetBody}>
        <List>
          {members.map((member) => {
            const item = patternOn(member, date);
            return (
              <ListRow
                key={member.id}
                label={member.name}
                truncate
                value={
                  <>
                    {item && (
                      <MemberMark
                        date={date}
                        look={item.look}
                        member={member}
                        size={18}
                      />
                    )}
                    {item?.name ?? "未入力"}
                    <DaySheetTime
                      change={changeOn(member, date)}
                      time={item?.time}
                    />
                  </>
                }
                leading={
                  <>
                    <Avatar member={member} />
                  </>
                }
                valueClassName={shiftsPage.sheetValue}
              />
            );
          })}
        </List>
      </div>
    </Sheet>
  );
}

// What each mark means, one person at a time in their own style, chosen
// by the chips over the list as 1人ずつ chooses whom to show. It opens on
// the face pressed in the table, or from the menu on whom 1人ずつ shows,
// so it is as long as one person's patterns however big the group.
function LegendSheet({
  open,
  onOpenChange,
  members,
  picked,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  picked: string;
  onPick: (id: string) => void;
}) {
  const member =
    members.find((candidate) => candidate.id === picked) ?? members[0];
  return (
    <Sheet label="シフトパターン" onOpenChange={onOpenChange} open={open}>
      <SheetHeading
        onClose={() => {
          onOpenChange(false);
        }}
        title="シフトパターン"
      />
      {/* The chips stay in reach; only the marks scroll. */}
      <div className={shiftsPage.legendPeople}>
        <PeoplePicker members={members} onPick={onPick} picked={member} />
      </div>
      {/* Everyone's lists lie unseen under the one shown, so the sheet
          stays as tall as the longest, up to its limit, and the chips
          stay under the finger from one person to the next. Only a list
          longer than the room scrolls. */}
      <div className={shiftsPage.legendBody}>
        <div aria-hidden="true" className={shiftsPage.legendSizer} inert>
          {members.map((candidate) => (
            <PatternList key={candidate.id} member={candidate} />
          ))}
        </div>
        <div className={shiftsPage.legendScroll}>
          <PatternList member={member} />
        </div>
      </div>
    </Sheet>
  );
}

function PatternList({ member }: { member: Member }) {
  return (
    <List>
      {member.patterns.map((item) => (
        <ListRow
          key={item.id}
          label={item.name}
          leading={<MemberMark look={item.look} member={member} size={20} />}
          value={item.time ?? ""}
        />
      ))}
    </List>
  );
}

// How much fits across: names up to four people, marks alone up to seven,
// then the table scrolls sideways with the dates and you kept in view.
type Density = "names" | "marks" | "scroll";

function densityOf(count: number): Density {
  if (count <= namesUpTo) {
    return "names";
  }
  return count <= marksUpTo ? "marks" : "scroll";
}

const namesUpTo = 4;
export const marksUpTo = 7;

// One row per day and a column per member, like a printed roster.
function DayRowsTable({
  group,
  body,
  onMember,
}: {
  group: Group;
  // The rows, drawn by the list of months under the pinned names.
  body: ReactNode;
  // Opens a member's legend from their face or name, as in 週ごと.
  onMember: (member: Member) => void;
}) {
  const { english } = useWeek();
  const dateWidth = english ? rowsEnglishDateWidth : rowsDateWidth;
  const density = densityOf(group.members.length);
  const withNames = density === "names";
  // Up to seven the page scrolls; more scroll sideways in their frame,
  // the names and dates pinned.
  const page = density !== "scroll";
  const scrolls = density === "scroll";
  const columnWidth = withNames ? rowsMemberWidth : rowsMarkWidth;
  return (
    <div
      className={dayRows.scroll({ page })}
      data-table-scroll={page ? undefined : ""}
    >
      <table
        className={dayRows.table}
        style={
          {
            "--date-width": `${dateWidth}px`,
            minWidth: dateWidth + group.members.length * columnWidth,
          } as CSSProperties
        }
      >
        <caption className={srOnly}>みんなのシフト</caption>
        <thead>
          <tr>
            <th
              className={dayRows.head({ corner: true, page })}
              data-pinned=""
              scope="col"
            >
              <span className={srOnly}>日付</span>
            </th>
            {group.members.map((member) => (
              <th
                className={dayRows.head({
                  me: member.me === true,
                  page,
                  scrolls,
                })}
                key={member.id}
                scope="col"
              >
                <button
                  aria-label={`${member.name}のシフトパターン`}
                  className={dayRows.member({ centered: !withNames })}
                  onClick={() => {
                    onMember(member);
                  }}
                  type="button"
                >
                  <Avatar member={member} />
                  {withNames ? member.name : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );
}

function DayRow({
  date,
  members,
  withNames,
  picked,
  scrolls,
  onPick,
  index,
  rowRef,
}: {
  date: Date;
  members: Member[];
  withNames: boolean;
  picked: boolean;
  scrolls: boolean;
  onPick: (date: Date) => void;
  // Its place in a list of months, which measures it by this ref.
  index?: number;
  rowRef?: Ref<HTMLTableRowElement>;
}) {
  const together = everyoneOff(members, date);
  const today = dateKey(date) === dateKey(designToday);
  return (
    <tr data-index={index} ref={rowRef}>
      <th className={dayRows.date({ picked, today, together })} scope="row">
        <RowDate
          date={date}
          onPick={() => {
            onPick(date);
          }}
          picked={picked}
        />
        {together && <span className={srOnly}>みんな休み</span>}
      </th>
      {members.map((member, column) => {
        const item = patternOn(member, date);
        return (
          <td
            className={dayRows.cell({
              end: column === members.length - 1,
              me: member.me === true,
              off: item?.off === true,
              picked,
              scrolls,
              together,
            })}
            key={member.id}
          >
            {/* The whole row picks the day, as the whole column does in
                週ごと. */}
            <button
              aria-label={`${formatDay(date)} ${member.name}：${item?.name ?? "未入力"}${changeOn(member, date) ? `、${movesText(changeOn(member, date))}` : ""}。押すとその日のみんなの予定`}
              aria-pressed={picked}
              className={dayRows.cellButton}
              onClick={() => {
                onPick(date);
              }}
              type="button"
            >
              {item ? (
                <span className={dayRows.mark}>
                  <MemberMark
                    date={date}
                    look={item.look}
                    member={member}
                    size={16}
                  />
                  <span className={withNames ? dayRows.name : srOnly}>
                    {item.name}
                  </span>
                </span>
              ) : (
                <span className={dayRows.empty}>
                  {withNames ? "未入力" : "・"}
                </span>
              )}
            </button>
          </td>
        );
      })}
    </tr>
  );
}

function RowDate({
  date,
  picked,
  onPick,
}: {
  date: Date;
  picked: boolean;
  onPick?: () => void;
}) {
  const weekTools = useWeek();
  const label = (
    <span className={toneColor[weekTools.dateTone(date)]}>
      {dateKey(date) === dateKey(designToday) ? (
        <span className={todayMark}>{date.getDate()}</span>
      ) : (
        date.getDate()
      )}
      <small className={dayRows.weekday}>
        {weekTools.weekdayName(date.getDay())}
      </small>
    </span>
  );
  if (!onPick) {
    return label;
  }
  return (
    <button
      aria-label={`${formatDay(date)}の予定を見る`}
      aria-pressed={picked}
      className={dayRows.dateButton}
      data-pick-day={dateKey(date)}
      onClick={onPick}
      type="button"
    >
      {label}
    </button>
  );
}

const rowsDateWidth = 46;
// Room for 30 Wed, the longest of a date and its weekday in English,
// beside the today line and the 12px in.
const rowsEnglishDateWidth = 56;
const rowsMemberWidth = 76;
const rowsMarkWidth = 40;

// A member's hours in the day sheet: 早出 and 残業 said in words, with
// the day's actual hours instead of the pattern's.
function DaySheetTime({
  time,
  change,
}: {
  time?: string;
  change?: TimeChange;
}) {
  if (change) {
    return (
      <small className={shiftsPage.sheetTime}>
        <strong>{movesText(change)}</strong> {change.time}
      </small>
    );
  }
  return time ? <small className={shiftsPage.sheetTime}>{time}</small> : null;
}
const compactAvatarSize = 20;

// One person's day in the weekly table. With `onPick` it is a button that
// shows the whole day by name below the table.
// The date atop a week's column; like the marks under it, it picks the day.
function WeekDate({
  date,
  members,
  month,
  picked,
  compact,
  onPick,
}: {
  date: Date;
  members: Member[];
  month?: Date;
  picked: boolean;
  // In the hub card's small week, as its cells are.
  compact: boolean;
  onPick?: (date: Date) => void;
}) {
  const weekTools = useWeek();
  const look = {
    compact,
    kind: "date",
    outside: !(!month || sameMonth(date, month)),
    picked,
    together: everyoneOff(members, date),
    tone: weekTools.dateTone(date),
  } as const;
  // Without a month dimming the days around it, the 1st names its month,
  // as where one week runs into the next month.
  const name =
    !month && date.getDate() === 1
      ? `${date.getMonth() + 1}/1`
      : date.getDate();
  const label =
    dateKey(date) === dateKey(designToday) ? (
      <span className={todayMark}>{name}</span>
    ) : (
      name
    );
  if (!onPick) {
    return <span className={weekCell(look)}>{label}</span>;
  }
  return (
    <button
      aria-label={`${formatDay(date)}の予定を見る`}
      aria-pressed={picked}
      className={weekCell({ ...look, button: true })}
      data-pick-day={dateKey(date)}
      onClick={() => {
        onPick(date);
      }}
      type="button"
    >
      {label}
    </button>
  );
}

function WeekCell({
  date,
  member,
  members,
  month,
  picked,
  compact,
  last,
  onPick,
}: {
  date: Date;
  member: Member;
  members: Member[];
  month?: Date;
  picked: boolean;
  compact: boolean;
  // The week's last person, where a shared day off and the frame end.
  last: boolean;
  onPick?: (date: Date) => void;
}) {
  const item = patternOn(member, date);
  const look = {
    compact,
    kind: "cell",
    last,
    off: item?.off === true,
    outside: !(!month || sameMonth(date, month)),
    picked,
    together: everyoneOff(members, date),
  } as const;
  const className = weekCell(look);
  const label = `${formatDay(date)} ${member.name}：${item?.name ?? "未入力"}`;
  if (!onPick) {
    return (
      <span aria-label={label} className={className} role="img">
        <Mark date={date} member={member} size={18} />
      </span>
    );
  }
  return (
    <button
      aria-label={`${label}。押すとその日のみんなの予定`}
      aria-pressed={picked}
      className={weekCell({ ...look, button: true })}
      onClick={() => {
        onPick(date);
      }}
      type="button"
    >
      <Mark date={date} member={member} size={18} />
    </button>
  );
}

// A block per week: dates across, one row per member underneath.
export function MemberTable({
  group,
  dates,
  body,
  month,
  compact = false,
  onMember,
  onPickDay,
  picked,
}: {
  group: Group;
  dates: Date[];
  // Rows a list of months draws in place of the weeks, under the same
  // pinned weekdays.
  body?: ReactNode;
  // The month shown; days outside it are dimmed.
  month?: Date;
  // A single week inside a card, without its own frame.
  compact?: boolean;
  // Opens a member's legend from their avatar.
  onMember?: (member: Member) => void;
  // Picks a day to list everyone's shifts with names.
  onPickDay?: (date: Date) => void;
  picked?: Date;
}) {
  const weekTools = useWeek();
  const weeks = Array.from({ length: dates.length / weekLength }, (_, row) =>
    dates.slice(row * weekLength, (row + 1) * weekLength)
  );
  return (
    <div className={weekTable.root}>
      <div
        aria-hidden="true"
        className={cx(
          weekTable.row({ compact }),
          weekTable.weekdays({ pinned: !compact })
        )}
        data-pinned={compact ? undefined : ""}
      >
        {/* Pinned above the weeks, so the month stays in sight; a list of
            months names its months in their headings. */}
        <span className={cornerMonth}>
          {month && !compact && !body
            ? shortMonthOf(month, weekTools.english)
            : ""}
        </span>
        {weekTools.weekdays.map((day) => (
          <span className={toneColor[day.tone]} key={day.day}>
            {day.label}
          </span>
        ))}
      </div>
      {body ??
        weeks.map((week) => (
          <WeekBlock
            compact={compact}
            group={group}
            key={dateKey(week[0])}
            month={month}
            onMember={onMember}
            onPickDay={onPickDay}
            picked={picked}
            week={week}
          />
        ))}
    </div>
  );
}

// One week of 週ごと: its dates, then a row per member.
function WeekBlock({
  group,
  week,
  month,
  compact = false,
  picked,
  onMember,
  onPickDay,
}: {
  group: Group;
  week: Date[];
  month?: Date;
  compact?: boolean;
  picked?: Date;
  onMember?: (member: Member) => void;
  onPickDay?: (date: Date) => void;
}) {
  // Short rows in the card: smaller faces keep a gap between them, the
  // height of the day-off tiles beside them.
  const avatarSize = compact ? compactAvatarSize : undefined;
  const isPicked = (date: Date) =>
    picked !== undefined && dateKey(picked) === dateKey(date);
  return (
    <section
      aria-label={`${formatDay(week[0])}からの週`}
      className={weekTable.week({ compact })}
    >
      <div className={cx(weekTable.row({ compact }), weekTable.dates)}>
        <span />
        {week.map((date) => (
          <WeekDate
            compact={compact}
            date={date}
            key={dateKey(date)}
            members={group.members}
            month={month}
            onPick={onPickDay}
            picked={isPicked(date)}
          />
        ))}
      </div>
      {group.members.map((member, row) => (
        <div className={weekTable.row({ compact })} key={member.id}>
          {onMember ? (
            <button
              aria-label={`${member.name}のシフトパターン`}
              className={cx(weekTable.name, weekTable.nameButton)}
              onClick={() => {
                onMember(member);
              }}
              type="button"
            >
              <Avatar member={member} size={avatarSize} />
            </button>
          ) : (
            <span className={weekTable.name}>
              <Avatar member={member} size={avatarSize} />
              <span className={srOnly}>{member.name}</span>
            </span>
          )}
          {week.map((date) => (
            <WeekCell
              compact={compact}
              date={date}
              key={dateKey(date)}
              last={row === group.members.length - 1}
              member={member}
              members={group.members}
              month={month}
              onPick={onPickDay}
              picked={isPicked(date)}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

// 1人ずつ: who to show, above the month.
function PeoplePicker({
  members,
  picked,
  onPick,
}: {
  members: Member[];
  picked: Member;
  onPick: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  // Keep the chosen person in sight, sideways only, so the page itself does
  // not jump.
  useEffect(() => {
    const list = listRef.current;
    const button = list?.querySelector<HTMLElement>(
      `[data-member="${picked.id}"]`
    );
    if (!(list && button)) {
      return;
    }
    // Clear of the room at the row's ends, where the page's edge is, as
    // wide as the first chip is in.
    const inset =
      list.querySelector<HTMLElement>("[data-member]")?.offsetLeft ?? 0;
    const start = button.offsetLeft - inset;
    const end = button.offsetLeft + button.offsetWidth + inset;
    if (start < list.scrollLeft) {
      list.scrollTo({ behavior: "smooth", left: start });
    } else if (end > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ behavior: "smooth", left: end - list.clientWidth });
    }
  }, [picked.id]);
  return (
    <ChoiceGrid
      className={people.list}
      label="表示する人"
      onValueChange={onPick}
      ref={listRef}
      value={picked.id}
    >
      {/* The row scrolls, so it clips anything drawn outside a chip: the
          focus ring goes inside. */}
      {members.map((member) => (
        <ChoiceChip
          avatar
          className={people.choice}
          data-member={member.id}
          key={member.id}
          ring="inside"
          value={member.id}
        >
          <Avatar member={member} />
          {member.name}
        </ChoiceChip>
      ))}
    </ChoiceGrid>
  );
}

// 1人ずつ: one member at a time, in the same kind of calendar as your own.
// Shift names always show under the marks and days off are always lit,
// whatever the member's style, so no separate list of their patterns is
// needed. A swipe turns it, as the calendar tab: the weekdays stay and
// the months go by under them.
function PersonPager({
  group,
  member,
  month,
  picked,
  onMonth,
  onPickDay,
  progress,
}: {
  group: Group;
  member: Member;
  month: Date;
  picked?: Date;
  // Called as a swipe lands on the month before or after.
  onMonth: (month: Date) => void;
  // Set to how far the pages are dragged, for the month row.
  progress: MotionValue<number>;
  onPickDay: (date: Date) => void;
}) {
  const weekTools = useWeek();
  return (
    <>
      <div>
        <WeekdayRow />
        <Pager
          onStep={(direction) => {
            onMonth(monthAfter(month, direction));
          }}
          progress={progress}
          page={monthKey(month)}
          renderPage={(offset) => {
            const shown = monthAfter(month, offset);
            return (
              <PersonGrid
                dates={weekTools.monthDates(shown)}
                group={group}
                member={member}
                month={shown}
                onPickDay={onPickDay}
                picked={picked}
              />
            );
          }}
        />
      </div>
      <PersonNote member={member} />
    </>
  );
}

function PersonGrid({
  group,
  member,
  dates,
  month,
  picked,
  onPickDay,
}: {
  group: Group;
  member: Member;
  dates: Date[];
  month: Date;
  picked?: Date;
  onPickDay: (date: Date) => void;
}) {
  const me = group.members.find((item) => item.me);
  return (
    <div className={dayGrid} style={{ minHeight: dayGridHeight(MONTH_WEEKS) }}>
      <MemberLook member={member}>
        {dates.map((date) => (
          <PersonDay
            date={date}
            key={dateKey(date)}
            me={me}
            member={member}
            onPick={onPickDay}
            outside={!sameMonth(date, month)}
            picked={picked !== undefined && dateKey(picked) === dateKey(date)}
          />
        ))}
      </MemberLook>
    </div>
  );
}

// Only what the look cannot tell: that a pressed date opens the day goes
// without saying, as on your own calendar.
function PersonNote({ member }: { member: Member }) {
  if (member.me) {
    return null;
  }
  return <Note>薄い枠の日は、自分も休みの日です。</Note>;
}

// One day of 1人ずつ, drawn like a day of your own calendar: the shift name
// always shows, a day off takes its pattern's tint, and a day you are both
// off is framed. Pressing it opens everyone's shifts that day.
function PersonDay({
  date,
  member,
  me,
  outside,
  picked,
  onPick,
}: {
  date: Date;
  member: Member;
  me?: Member;
  outside: boolean;
  picked: boolean;
  onPick: (date: Date) => void;
}) {
  const { isColoredHoliday } = useWeek();
  const today = dateKey(date) === dateKey(designToday);
  const item = outside ? undefined : patternOn(member, date);
  // In their カラー, like their marks.
  const { tint } = useDisplayColor(item?.look.color ?? 0);
  const withMe =
    !(outside || member.me) &&
    me !== undefined &&
    everyoneOff([me, member], date);
  const off = item?.off === true;
  // The calendar's own day, with a frame when you are off too.
  // Framed when you are off too, unless the picked day's own frame is on
  // it: the styles are merged, as two classes for one property would leave
  // the winner to the stylesheet's order. The frame stays inside the day,
  // or it would show at the edge of the month beside.
  const className = css(
    dayCell.raw({ active: picked, off, outside }),
    withMe && !picked
      ? {
          outline: "1.5px solid token(colors.accent.border)",
          outlineOffset: "-1.5px",
        }
      : {}
  );
  const style = off ? ({ "--off-tint": tint } as CSSProperties) : undefined;
  const content = (
    <>
      <span
        className={cx(
          dayParts.date,
          outside && dayParts.dateOutside,
          isColoredHoliday(date) && !today && dayParts.holiday
        )}
      >
        <span className={today ? todayMark : undefined}>{date.getDate()}</span>
      </span>
      {item && (
        <>
          <span className={dayParts.mark}>
            <MemberMark
              date={date}
              look={item.look}
              member={member}
              size={21}
            />
          </span>
          <span className={dayParts.label}>{dayName(item.name)}</span>
        </>
      )}
    </>
  );
  if (outside) {
    return (
      <div aria-hidden="true" className={className} style={style}>
        {content}
      </div>
    );
  }
  return (
    <button
      aria-label={`${formatDay(date)}：${item?.name ?? "未入力"}${withMe ? "、自分も休み" : ""}。押すとその日のみんなの予定`}
      aria-pressed={picked}
      className={className}
      data-active={picked || undefined}
      data-pick-day={dateKey(date)}
      onClick={() => {
        onPick(date);
      }}
      style={style}
      type="button"
    >
      {content}
    </button>
  );
}
