import { css, cva } from "styled-system/css";

// What the shift table's views share: how it is laid out, the page's
// look, a picked day's frame and a day off's tile, and the row of people.

// A day off is a light tile behind its mark, with a little room around
// it, in the same color whatever the person's pattern; a day everyone is
// off joins the tiles into one band, down a date's column in 週ごと, along
// a day's row in 一覧. The picked day is framed the same way, as one
// piece.
export const offTile = {
  bg: "accent.container",
  borderRadius: "sm",
  content: '""',
  inset: "3px",
  position: "absolute",
  zIndex: -1,
} as const;

export const pickedFrame = {
  border: "0 solid token(colors.accent.default)",
  content: '""',
  pointerEvents: "none",
  position: "absolute",
  zIndex: 1,
} as const;

// The group's shifts page: the month row, the table under it, and room at
// the foot for the picked day's sheet to cover.
export const shiftsPage = {
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
export const people = {
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

// 一覧 reads most easily, so it comes first while everyone fits across;
// past that it scrolls sideways, and 週ごと, which grows only downwards,
// takes over. 1人ずつ shows one member at a time in a calendar like yours.
export type Layout = "days" | "weeks" | "person";

export function monthKey(month: Date) {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
}
