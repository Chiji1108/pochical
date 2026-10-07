import { PATTERNS_PER_PAGE } from "@pochical/design/limits";
import { ArrowRight, Pencil, Trash2 } from "lucide-react";
import { useMotionValue } from "motion/react";
import type { MotionValue } from "motion/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { css, cva } from "styled-system/css";

import { usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { PageDots } from "./design-choices";
import { Pager } from "./design-pager";
import { Button } from "./design-ui";
import { ShiftMark } from "./shift-mark";

// Entering a month: the day's date, a button for each pattern, and 消す
// and 翌日へ. Up to four patterns sit in one row; more take two rows, of
// three for five or six, four for seven or eight, and five for nine or
// ten, so the buttons never push a month six weeks tall off the screen.
// Past ten they go on to pages of ten, swiped sideways, their dots
// between 消す and 翌日へ so the pages take no more height. Each keeps the
// 72px of the one row, shrinking only when the screen is too narrow.
// ポチポチ入力 and the save buttons that stand in its place share its
// edges.
export const shiftInput = {
  action: css({
    _disabled: { color: "text.disabled", cursor: "default" },
    _hover: { "&:not(:disabled)": { bg: "accent.container" } },
    alignItems: "center",
    bg: "transparent",
    border: 0,
    borderRadius: "lg",
    color: "text.tertiary",
    display: "flex",
    gap: "4px",
    minHeight: "touch",
    padding: "4px 16px",
    textStyle: "caption",
  }),
  actions: css({
    alignItems: "center",
    display: "flex",
    gap: "8px",
    justifyContent: "center",
    marginTop: "4px",
  }),
  // The mark's own emoji font, so an emoji mark draws the same everywhere.
  mark: css({
    display: "grid",
    flexShrink: 0,
    fontFamily: "emoji",
    fontSize: "24px",
    height: "28px",
    lineHeight: 1,
    placeItems: "center",
  }),
  // The name under a button's mark, on one line: the buttons are too low
  // for two, and a longer one is cut short.
  name: css({
    maxWidth: "100%",
    overflow: "hidden",
    paddingInline: "4px",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  pattern: cva({
    base: {
      _active: { bg: "accent.pressed", transform: "scale(0.97)" },
      _hover: { bg: "accent.container", borderColor: "accent.border" },
      alignItems: "center",
      bg: "background.card",
      border: "1px solid token(colors.border.default)",
      borderRadius: "lg",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      height: "77px",
      justifyContent: "center",
      lineHeight: "14px",
      padding: "8px 0",
      textStyle: "caption",
      width: "72px",
    },
    variants: { rows: { true: { height: "64px", width: "100%" } } },
  }),
  patterns: cva({
    base: {
      border: 0,
      display: "flex",
      gap: "8px",
      justifyContent: "center",
      margin: 0,
      minWidth: 0,
      padding: 0,
    },
    variants: {
      columns: {
        five: {
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 72px))",
        },
        // A page of ten: its two rows kept however few are on it, so the
        // last page neither shrinks the tray nor moves a button from where
        // it would be on a full one.
        paged: {
          alignContent: "start",
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 72px))",
          gridTemplateRows: "repeat(2, 64px)",
        },
        four: {
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 72px))",
        },
        one: {},
        three: {
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 72px))",
        },
      },
    },
  }),
  // The pages of patterns, past ten: the pager and nothing around it.
  patternPages: css({ border: 0, margin: 0, minWidth: 0, padding: 0 }),
  startButton: css({ flex: 1 }),
  startRow: css({ display: "flex", gap: "8px", textAlign: "center" }),
  weekday: cva({
    base: {
      color: "text.tertiary",
      fontSize: "14px",
      fontWeight: 400,
      marginLeft: "2px",
    },
    variants: {
      tone: {
        holiday: { color: "calendar.holiday" },
        plain: {},
        saturday: { color: "calendar.saturday" },
      },
    },
  }),
};

function columnsFor(patternKeys: Shift[]) {
  const count = patternKeys.length;
  if (count > 8) {
    return "five";
  }
  if (count > 6) {
    return "four";
  }
  return count > 4 ? "three" : "one";
}

// Room between the pages of patterns, seen while they are swiped.
const PATTERN_PAGE_GAP = 16;

export function StartArea({
  label,
  onStart,
}: {
  label: string;
  onStart: () => void;
}) {
  return (
    <div className={shiftInput.startRow}>
      <Button
        className={shiftInput.startButton}
        onClick={onStart}
        variant="primary"
      >
        <Pencil aria-hidden="true" size={18} />
        {label}
      </Button>
    </div>
  );
}

// A key for each pattern, as ポチポチ入力's tray has them: up to
// PATTERNS_PER_PAGE on a page, fewer in fewer columns, more paged and
// swiped. The tray and 働き方's order are entered with them alike; the
// page is kept by whoever shows its dots.
export function PatternKeys({
  patternKeys,
  page,
  onPage,
  progress,
  onPick,
}: {
  patternKeys: Shift[];
  page: number;
  onPage: (page: number) => void;
  progress: MotionValue<number>;
  onPick: (shift: Shift) => void;
}) {
  const book = usePatterns();
  const pages = patternPagesOf(patternKeys);
  const shown = Math.min(page, pages.length - 1);
  const paged = pages.length > 1;
  const buttons = (keys: Shift[]) =>
    keys.map((key) => (
      <button
        className={shiftInput.pattern({ rows: keys.length > 4 || paged })}
        key={key}
        onClick={() => {
          onPick(key);
        }}
        type="button"
      >
        <span className={shiftInput.mark}>
          <ShiftMark shift={key} size={26} />
        </span>
        <span className={shiftInput.name}>{book[key]?.name}</span>
      </button>
    ));
  return paged ? (
    <fieldset aria-label="入力するシフト" className={shiftInput.patternPages}>
      <Pager
        ends={{ back: shown > 0, forward: shown < pages.length - 1 }}
        gap={PATTERN_PAGE_GAP}
        onStep={(direction) => {
          onPage(shown + direction);
        }}
        page={String(shown)}
        progress={progress}
        renderPage={(offset) => {
          const keys = pages[shown + offset];
          return (
            keys && (
              <div className={shiftInput.patterns({ columns: "paged" })}>
                {buttons(keys)}
              </div>
            )
          );
        }}
      />
    </fieldset>
  ) : (
    <fieldset
      aria-label="入力するシフト"
      className={shiftInput.patterns({ columns: columnsFor(patternKeys) })}
    >
      {buttons(patternKeys)}
    </fieldset>
  );
}

// The patterns a page at a time, PATTERNS_PER_PAGE to one.
export function patternPagesOf(patternKeys: Shift[]) {
  return Array.from(
    { length: Math.ceil(patternKeys.length / PATTERNS_PER_PAGE) },
    (_, index) =>
      patternKeys.slice(
        index * PATTERNS_PER_PAGE,
        (index + 1) * PATTERNS_PER_PAGE
      )
  );
}

export function ShiftInputControls({
  datePicker,
  patternKeys,
  selectedShift,
  canSkip,
  onEnter,
  onSkip,
}: {
  datePicker: ReactNode;
  patternKeys: Shift[];
  selectedShift: Shift | undefined;
  canSkip: boolean;
  onEnter: (shift: Shift | undefined) => void;
  onSkip: () => void;
}) {
  const pages = patternPagesOf(patternKeys);
  // The page stays where the person swiped it: moving on to the next day
  // does not turn it, even to that day's shift.
  const [page, setPage] = useState(0);
  const progress = useMotionValue(0);
  const shown = Math.min(page, pages.length - 1);
  return (
    <>
      {datePicker}
      <PatternKeys
        onPage={setPage}
        onPick={onEnter}
        page={page}
        patternKeys={patternKeys}
        progress={progress}
      />
      <div className={shiftInput.actions}>
        <button
          className={shiftInput.action}
          disabled={!selectedShift}
          onClick={() => {
            onEnter(undefined);
          }}
          type="button"
        >
          <Trash2 aria-hidden="true" size={14} />
          消す
        </button>
        {pages.length > 1 && (
          <PageDots
            count={pages.length}
            current={shown}
            label="シフトのページ"
            onPick={setPage}
            progress={progress}
          />
        )}
        <button
          className={shiftInput.action}
          disabled={!canSkip}
          onClick={onSkip}
          type="button"
        >
          翌日へ
          <ArrowRight aria-hidden="true" size={14} />
        </button>
      </div>
    </>
  );
}
