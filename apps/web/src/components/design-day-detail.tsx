import {
  COWORKERS_MAX,
  PATTERNS_PER_PAGE,
  textLimits,
} from "@pochical/design/limits";
import { Check, ChevronRight, CircleX, Plus } from "lucide-react";
import { useContext, useEffect, useEffectEvent, useState } from "react";
import { css, cva, cx } from "styled-system/css";

import { keepDetails, timeChangeOf, timeRange } from "../lib/design-days";
import type { DayEntry } from "../lib/design-days";
import { isDayOff, usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { useUser } from "../lib/design-user-store";
import { composing, limitText } from "../lib/text-limits";
import { Chip, ChipGroup } from "./design-choices";
import { coworkersFull, useCoworkerList } from "./design-coworkers";
import { LimitedInput, LimitedTextArea, TimeRange } from "./design-fields";
import { List, ListRow, listRow } from "./design-list";
import { timeText } from "./design-pattern-editor";
import { pickerStyle } from "./design-picker-style";
import { ConfirmDialog, Sheet, SheetHeading } from "./design-sheet";
import { ToastContext } from "./design-toast";
import { DestructiveButton } from "./design-ui";
import { ShiftMark } from "./shift-mark";

// A day opened in the week, read before it is changed: its shift, time,
// the people working it and its memo as a list's rows, each saying what
// the day holds. A row is changed where it is, as iOS's forms do: the
// shift from a pull-down, as one is picked in a Form's menu Picker, the
// time by its pills, the people by chips unfolded under their row (more
// than one, and a name may be added), and the memo in its own field.
// Nothing changes on a stray tap, as it did when every shift was a chip
// on show.
const dayDetail = {
  // The day's shift picked from a list, the check on the day's one; the
  // others keep its room, so the rows line up.
  check: cva({
    base: { color: "accent.default", flexShrink: 0, marginRight: "-4px" },
    variants: { picked: { false: { visibility: "hidden" }, true: {} } },
  }),
  choices: css({
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minHeight: 0,
    overflowY: "auto",
  }),
  shiftValue: css({ alignItems: "center", display: "inline-flex", gap: "4px" }),
  // The people's chips, unfolded under their row inside the list, with a line above
  // as between rows; marked as a row so the row after it draws its own.
  unfolded: css({
    "&::before": {
      borderTop: "1px solid token(colors.separator)",
      content: '""',
      left: "16px",
      position: "absolute",
      right: "16px",
      top: 0,
    },
    padding: "12px 16px 16px",
    position: "relative",
  }),
  disclosure: css({ transition: "transform 0.2s" }),
  disclosureOpen: css({ transform: "rotate(90deg)" }),
  memberInput: css({ width: "88px" }),
  // The memo and, while it holds words, the button that clears it at once.
  memoRow: css({
    "--pad-y": "14px",
    alignItems: "flex-start",
    display: "flex",
  }),
  memoBox: css({ flex: 1, minWidth: 0 }),
  // As tall as the memo's first line with the room over and under it, so
  // the button sits level with one line and beside the first of many.
  memoClear: css({
    bg: "transparent",
    border: 0,
    color: "text.tertiary",
    cursor: "pointer",
    display: "grid",
    flexShrink: 0,
    height: "calc(2 * var(--pad-y) + 1lh)",
    placeItems: "center",
    textStyle: "body",
    width: "touch",
  }),
  memo: css({
    "--lines": "5",
    "--pad-x": "16px",
    color: "text.primary",
    textStyle: "body",
  }),
  // An action on its row, in the accent as iOS's text buttons in a list.
  reset: css({ "& > *": { color: "accent.default" } }),
  root: css({ display: "flex", flexDirection: "column", gap: "24px" }),
};

// The chevron of a row that unfolds in place, turned down while it is open.
function Disclosure({ open }: { open: boolean }) {
  return (
    <ChevronRight
      aria-hidden="true"
      className={cx(
        listRow.arrow,
        dayDetail.disclosure,
        open && dayDetail.disclosureOpen
      )}
      size={17}
    />
  );
}

function MemberChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const members = useCoworkerList();
  const [adding, setAdding] = useState(false);
  const toast = useContext(ToastContext);
  // Held to the limit here too: a name confirmed and added in one go may
  // not have been cut to it yet.
  function add(name: string) {
    const trimmed = limitText(name.trim(), textLimits.personName);
    setAdding(false);
    if (!trimmed) {
      return;
    }
    // Someone of that name already listed is picked rather than added.
    let id = members.list.find(({ name: listed }) => listed === trimmed)?.id;
    if (id === undefined) {
      // Counted again: the list may have grown while the name was typed.
      if (members.list.length >= COWORKERS_MAX) {
        toast(coworkersFull, "problem");
        return;
      }
      id = members.onAdd(trimmed);
    }
    if (!selected.includes(id)) {
      onChange([...selected, id]);
    }
  }
  return (
    <ChipGroup>
      {members.list.map(({ id, name }) => (
        <Chip
          selected={selected.includes(id)}
          key={id}
          onClick={() => {
            onChange(
              selected.includes(id)
                ? selected.filter((member) => member !== id)
                : [...selected, id]
            );
          }}
        >
          {selected.includes(id) && <Check aria-hidden="true" size={12} />}
          {name}
        </Chip>
      ))}
      {adding ? (
        <LimitedInput
          aria-label="追加する人の名前"
          autoFocus
          className={dayDetail.memberInput}
          look="chip"
          counter={false}
          kind="personName"
          onBlur={(event) => {
            add(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !composing(event)) {
              add(event.currentTarget.value);
            } else if (event.key === "Escape") {
              setAdding(false);
            }
          }}
          placeholder="名前"
        />
      ) : (
        <Chip
          onClick={() => {
            if (members.list.length >= COWORKERS_MAX) {
              toast(coworkersFull, "problem");
              return;
            }
            setAdding(true);
          }}
          variant="add"
        >
          <Plus aria-hidden="true" size={12} />
          {members.list.length > 0 ? "追加" : "人を追加"}
        </Chip>
      )}
    </ChipGroup>
  );
}

export function DayDetail({
  entry,
  note,
  patternKeys,
  membersOpen,
  onChange,
  onNoteChange,
  onMembersOpenChange,
}: {
  entry: DayEntry | undefined;
  // The day's memo, its own whether it has a shift or not
  // (spec/shift-patterns.md, A day's memo).
  note: string | undefined;
  patternKeys: Shift[];
  // Whether 一緒に働く人 is unfolded: kept as the next day is opened, so
  // people can be noted day after day.
  membersOpen: boolean;
  onChange: (entry: DayEntry | undefined) => void;
  // "" clears the memo.
  onNoteChange: (note: string) => void;
  onMembersOpenChange: (open: boolean) => void;
}) {
  const book = usePatterns();
  const pattern = entry && book[entry.shift];
  const time = pattern?.time;
  const timeChanged = Boolean(entry?.start || entry?.end);
  // The memo as it is written, kept when the field is left
  // (spec/calendar.md, Text fields).
  const [draft, setDraft] = useState(note ?? "");
  // Kept too when the detail closes or the page is hidden, as an app goes
  // to the background, with the field still in focus.
  const keep = useEffectEvent(() => {
    if (draft !== (note ?? "")) {
      onNoteChange(draft);
    }
  });
  useEffect(() => {
    const keepWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        keep();
      }
    };
    document.addEventListener("visibilitychange", keepWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", keepWhenHidden);
      keep();
    };
  }, []);
  const [clearing, setClearing] = useState(false);
  const [choosingShift, setChoosingShift] = useState(false);
  // Said in words here, where there is room: the mark only shows a shape.
  const change = timeChangeOf(entry, pattern);
  const moves =
    [change?.early ? "早出" : "", change?.late ? "残業" : ""]
      .filter(Boolean)
      .join("・") || "変更済み";
  const selected = entry?.people ?? [];
  // The people on the day by name; someone deleted from 一緒に働く人 since
  // is skipped.
  const coworkers = useUser((state) => state.coworkers);
  const names = selected.flatMap(
    (id) => coworkers.find((coworker) => coworker.id === id)?.name ?? []
  );
  // What would go with the shift; the memo stays, as it is the day's. A
  // day with nothing more is cleared at once, as one tap brings it back;
  // with more it is asked first.
  const lost = [
    timeChanged ? "時間の変更" : "",
    names.length > 0 ? "一緒に働く人" : "",
  ].filter(Boolean);
  function clear() {
    setClearing(false);
    onChange(undefined);
  }
  function changeTime(field: "start" | "end", value: string) {
    if (!(entry && time)) {
      return;
    }
    const standard = field === "start" ? time[0] : time[1];
    onChange({
      ...entry,
      [field]: value && value !== standard ? value : undefined,
    });
  }
  return (
    <div className={dayDetail.root}>
      <List>
        <ListRow
          label="シフト"
          onClick={() => {
            setChoosingShift(true);
          }}
          value={
            entry ? (
              <span className={dayDetail.shiftValue}>
                <ShiftMark shift={entry.shift} size={16} />
                {pattern?.name}
              </span>
            ) : (
              "なし"
            )
          }
        />
        {entry && time && (
          <ListRow
            control={
              <TimeRange
                end={entry.end ?? time[1]}
                onChange={changeTime}
                start={entry.start ?? time[0]}
              />
            }
            detail={timeChanged ? moves : undefined}
            label="時間"
          />
        )}
        {entry && time && timeChanged && (
          <ListRow
            arrow={false}
            className={dayDetail.reset}
            label={`標準（${timeRange({ shift: entry.shift }, pattern)}）に戻す`}
            onClick={() => {
              onChange({ ...entry, end: undefined, start: undefined });
            }}
          />
        )}
        {/* Someone works alongside on any shift but a day off. */}
        {entry && pattern && !isDayOff(pattern) && (
          <ListRow
            aria-expanded={membersOpen}
            arrow={<Disclosure open={membersOpen} />}
            label="一緒に働く人"
            onClick={() => {
              onMembersOpenChange(!membersOpen);
            }}
            value={names.length > 0 ? names.join("、") : "なし"}
          />
        )}
        {entry && pattern && !isDayOff(pattern) && membersOpen && (
          <div className={dayDetail.unfolded} data-list-row="">
            <MemberChips
              onChange={(next) => {
                // Someone deleted from 一緒に働く人 goes as the day's
                // people are written (spec/sync-protocol.md, Coworkers).
                onChange({
                  ...entry,
                  people: next.filter((id) =>
                    coworkers.some((coworker) => coworker.id === id)
                  ),
                });
              }}
              selected={selected}
            />
          </div>
        )}
      </List>
      <List>
        <div className={dayDetail.memoRow}>
          <LimitedTextArea
            aria-label="メモ"
            className={cx(dayDetail.memoBox, dayDetail.memo)}
            kind="dayNote"
            onBlur={() => {
              if (draft !== (note ?? "")) {
                onNoteChange(draft);
              }
            }}
            onValueChange={setDraft}
            placeholder="メモ"
            value={draft}
          />
          {draft !== "" && (
            <button
              aria-label="メモを消す"
              className={dayDetail.memoClear}
              onClick={() => {
                setDraft("");
                onNoteChange("");
              }}
              // Keeps the field from losing focus first, which would keep
              // the words about to be cleared.
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              type="button"
            >
              <CircleX aria-hidden="true" size={18} />
            </button>
          )}
        </div>
      </List>
      {entry && (
        <DestructiveButton
          onClick={() => {
            if (lost.length > 0) {
              setClearing(true);
            } else {
              clear();
            }
          }}
        >
          この日のシフトを消す
        </DestructiveButton>
      )}
      {clearing && (
        <ConfirmDialog
          action="消す"
          message={`${lost.join("、")}も消えます。`}
          onCancel={() => {
            setClearing(false);
          }}
          onConfirm={clear}
          title="この日のシフトを消しますか？"
        />
      )}
      <ShiftChoices
        onOpenChange={setChoosingShift}
        onPick={(key) => {
          if (key !== entry?.shift) {
            onChange(keepDetails(entry, key));
          }
          setChoosingShift(false);
        }}
        open={choosingShift}
        patternKeys={patternKeys}
        picked={entry?.shift}
      />
    </div>
  );
}

// The day's shift picked from the person's patterns, in their order as
// 設定's シフトパターン lists them, each with its hours, the day's with a
// check: as the platforms pick one of many in a list of its own, since a
// menu runs long past a few. Picking one closes it. Past a page of
// ポチポチ入力's keys, a search narrows them by name.
function ShiftChoices({
  open,
  onOpenChange,
  patternKeys,
  picked,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patternKeys: Shift[];
  picked: Shift | undefined;
  onPick: (key: Shift) => void;
}) {
  const book = usePatterns();
  const [query, setQuery] = useState("");
  const words = query.trim();
  const shown = patternKeys.filter(
    (key) => !words || (book[key]?.name ?? "").includes(words)
  );
  const change = (next: boolean) => {
    if (!next) {
      setQuery("");
    }
    onOpenChange(next);
  };
  return (
    <Sheet label="シフト" onOpenChange={change} open={open}>
      <SheetHeading
        onClose={() => {
          change(false);
        }}
        title="シフト"
      />
      <div className={dayDetail.choices}>
        {patternKeys.length > PATTERNS_PER_PAGE && (
          <input
            aria-label="シフトを探す"
            className={pickerStyle.search}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="シフトを探す"
            type="search"
            value={query}
          />
        )}
        <List>
          {shown.map((key) => {
            const pattern = book[key];
            return (
              <ListRow
                aria-pressed={key === picked}
                arrow={
                  <Check
                    aria-hidden="true"
                    className={dayDetail.check({ picked: key === picked })}
                    size={18}
                  />
                }
                key={key}
                label={pattern?.name ?? key}
                leading={<ShiftMark shift={key} size={20} />}
                onClick={() => {
                  onPick(key);
                }}
                value={pattern && timeText(pattern)}
              />
            );
          })}
        </List>
      </div>
    </Sheet>
  );
}
