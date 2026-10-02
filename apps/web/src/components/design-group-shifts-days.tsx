import type { CSSProperties, ReactNode, Ref } from "react";
import { css, cva } from "styled-system/css";

import { dateKey, formatDay, movesText } from "../lib/design-days";
import { designToday } from "../lib/design-today";
import { todayMark } from "./design-day-cell";
import { changeOn, everyoneOff, patternOn } from "./design-group-data";
import type { Group, Member } from "./design-group-data";
import { Avatar, MemberMark, toneColor } from "./design-group-parts";
import { offTile, pickedFrame } from "./design-group-shifts-parts";
import { srOnly } from "./design-ui";
import { useWeek } from "./design-week";

// 一覧: the shift table as a row per day and a column per member, their
// marks named while few, scrolling sideways as the group grows.

// 一覧: a row per day and a column per person, like a printed roster.
// Up to seven people the page scrolls and the frame shows whole, one
// scroll only; more scroll sideways inside it, the dates and your own
// column pinned, over the cells' tiles, with an edge only then.
export const dayRows = {
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

// How much fits across: names up to four people, marks alone up to seven,
// then the table scrolls sideways with the dates and you kept in view.
type Density = "names" | "marks" | "scroll";

export function densityOf(count: number): Density {
  if (count <= namesUpTo) {
    return "names";
  }
  return count <= marksUpTo ? "marks" : "scroll";
}

const namesUpTo = 4;

export const marksUpTo = 7;

// One row per day and a column per member, like a printed roster.
export function DayRowsTable({
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

export function DayRow({
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
