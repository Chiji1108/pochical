import { COWORKERS_MAX, textLimits } from "@pochical/design/limits";
import { Check, ChevronRight, Plus } from "lucide-react";
import { useContext, useState } from "react";
import { css, cx } from "styled-system/css";

import { keepDetails, timeChangeOf, timeRange } from "../lib/design-days";
import type { DayEntry } from "../lib/design-days";
import { usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { composing, limitText } from "../lib/text-limits";
import { Chip, ChipGroup } from "./design-choices";
import { coworkersFull, useCoworkerList } from "./design-coworkers";
import { LimitedInput, LimitedTextArea, TimeRange } from "./design-fields";
import { List, ListRow, listRow } from "./design-list";
import { MenuPicker, PullDownMenu } from "./design-menu";
import { ConfirmDialog } from "./design-sheet";
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
  memo: css({
    "--lines": "5",
    "--pad-x": "16px",
    "--pad-y": "14px",
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
    if (!members.names.includes(trimmed)) {
      // Counted again: the list may have grown while the name was typed.
      if (members.names.length >= COWORKERS_MAX) {
        toast(coworkersFull, "problem");
        return;
      }
      members.onAdd(trimmed);
    }
    if (!selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
    }
  }
  return (
    <ChipGroup>
      {members.names.map((name) => (
        <Chip
          selected={selected.includes(name)}
          key={name}
          onClick={() => {
            onChange(
              selected.includes(name)
                ? selected.filter((member) => member !== name)
                : [...selected, name]
            );
          }}
        >
          {selected.includes(name) && <Check aria-hidden="true" size={12} />}
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
            if (members.names.length >= COWORKERS_MAX) {
              toast(coworkersFull, "problem");
              return;
            }
            setAdding(true);
          }}
          variant="add"
        >
          <Plus aria-hidden="true" size={12} />
          {members.names.length > 0 ? "追加" : "人を追加"}
        </Chip>
      )}
    </ChipGroup>
  );
}

export function DayDetail({
  entry,
  patternKeys,
  onChange,
}: {
  entry: DayEntry | undefined;
  patternKeys: Shift[];
  onChange: (entry: DayEntry | undefined) => void;
}) {
  const book = usePatterns();
  const pattern = entry && book[entry.shift];
  const time = pattern?.time;
  const timeChanged = Boolean(entry?.start || entry?.end);
  const [membersOpen, setMembersOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Said in words here, where there is room: the mark only shows a shape.
  const change = timeChangeOf(entry, pattern);
  const moves =
    [change?.early ? "早出" : "", change?.late ? "残業" : ""]
      .filter(Boolean)
      .join("・") || "変更済み";
  const selected = entry?.people ?? [];
  // What would go with the shift; the memo stays, as it is the day's. A
  // day with nothing more is cleared at once, as one tap brings it back;
  // with more it is asked first.
  const lost = [
    timeChanged ? "時間の変更" : "",
    selected.length > 0 ? "一緒に働く人" : "",
  ].filter(Boolean);
  function clear() {
    setClearing(false);
    setMembersOpen(false);
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
          control={
            <PullDownMenu
              label={
                entry ? (
                  <>
                    <ShiftMark shift={entry.shift} size={16} />
                    {pattern?.name}
                  </>
                ) : (
                  "なし"
                )
              }
            >
              <MenuPicker
                onValueChange={(key) => {
                  onChange(keepDetails(entry, key));
                }}
                options={patternKeys.map((key) => ({
                  icon: <ShiftMark shift={key} size={18} />,
                  label: book[key]?.name ?? key,
                  value: key,
                }))}
                value={entry?.shift ?? ""}
              />
            </PullDownMenu>
          }
          label="シフト"
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
        {entry && time && (
          <ListRow
            aria-expanded={membersOpen}
            arrow={<Disclosure open={membersOpen} />}
            label="一緒に働く人"
            onClick={() => {
              setMembersOpen(!membersOpen);
            }}
            value={selected.length > 0 ? selected.join("、") : "なし"}
          />
        )}
        {entry && time && membersOpen && (
          <div className={dayDetail.unfolded} data-list-row="">
            <MemberChips
              onChange={(next) => {
                onChange({ ...entry, people: next });
              }}
              selected={selected}
            />
          </div>
        )}
      </List>
      {entry && (
        <List>
          <LimitedTextArea
            aria-label="メモ"
            className={dayDetail.memo}
            kind="dayNote"
            onValueChange={(note) => {
              // "" clears the memo; without one an entry keeps the day's.
              onChange({ ...entry, note });
            }}
            placeholder="メモ"
            value={entry.note ?? ""}
          />
        </List>
      )}
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
    </div>
  );
}
