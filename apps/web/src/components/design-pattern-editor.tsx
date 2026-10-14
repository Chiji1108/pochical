import { PATTERNS_PER_PAGE } from "@pochical/design/limits";
import { readyPatternOrder } from "@pochical/design/patterns";
import { Fragment, useContext, useState } from "react";
import { css } from "styled-system/css";

import { patternsWithout } from "../lib/design-days";
import { presetList, presetPatterns } from "../lib/design-patterns";
import type { Pattern, PresetShift } from "../lib/design-patterns";
import { designToday } from "../lib/design-today";
import { useShownDays, useUser } from "../lib/design-user-store";
import { ChoiceList, ChoiceRow } from "./design-choices";
import {
  LimitedInput,
  markPreview,
  markValue,
  TimeRange,
} from "./design-fields";
import { BackButton, HeaderAction, PageHeader } from "./design-header";
import {
  AddRow,
  List,
  ListDivider,
  ListRow,
  listRow,
  SwitchRow,
} from "./design-list";
import { LookEditorPage } from "./design-look-editor";
import type { LookField } from "./design-look-editor";
import { inChipOrder, ReadyPatternChips, toggled } from "./design-ready-chips";
import { ConfirmDialog } from "./design-sheet";
import { SortableList } from "./design-sortable-list";
import { Button, DestructiveButton, Note, Section } from "./design-ui";
import {
  guessLook,
  MarkGlyph,
  nextColor,
  sameIcon,
  ShiftMarkStyleContext,
} from "./shift-mark";
import type { Look, ShiftMarkStyle } from "./shift-mark";

// A pattern as edited on screen. Presets start with every look filled in;
// new ones get theirs from the name until the person picks one.
type PatternDraft = Look & {
  id: string;
  name: string;
  allDay: boolean;
  start: string;
  end: string;
  countsAsOff: boolean;
  // Another pattern filled in on the following day, like 明け after 夜勤.
  nextDay?: string;
  // Under 使わなくなったパターン, kept for its days.
  archived?: boolean;
};

const leadingZeroPattern = /^0/;

function draftOf({ time, ...pattern }: Pattern): PatternDraft {
  return {
    ...pattern,
    allDay: !time,
    end: time?.[1] ?? "18:00",
    start: time?.[0] ?? "09:00",
  };
}

function patternOf({ allDay, start, end, ...draft }: PatternDraft): Pattern {
  return {
    ...draft,
    name: draft.name.trim(),
    time: allDay ? undefined : [start, end],
  };
}

// What each style tells patterns apart by, named for the lookalike warning.
const lookalikeParts: Record<ShiftMarkStyle, string> = {
  badge: "文字と色",
  emoji: "絵文字",
  icon: "アイコンと色",
};

// Whether two patterns look the same in a style; without an emoji, the
// emoji style shows the letters.
function lookAlike(a: Look, b: Look, style: ShiftMarkStyle) {
  if (style === "emoji" && (a.emoji || b.emoji)) {
    return a.emoji === b.emoji;
  }
  const sameMark = style === "icon" ? sameIcon(a, b) : a.symbol === b.symbol;
  return sameMark && a.color === b.color;
}

const editor = {
  // A lookalike's warning under the look page's choices.
  lookalike: css({
    color: "danger.default",
    margin: "-8px 4px 0",
    textStyle: "caption",
  }),
  // The name over the time, beside the mark at the top.
  name: css({ display: "flex", flexDirection: "column", gap: "2px" }),
  time: css({ color: "text.tertiary", textStyle: "footnote" }),
  unnamed: css({ color: "text.tertiary" }),
};

// Where the ポチポチ入力's buttons go on to their next page, over the
// first pattern of that page.
function pageDivider(index: number) {
  if (index === 0 || index % PATTERNS_PER_PAGE !== 0) {
    return null;
  }
  return (
    <ListDivider>{`ポチポチ入力の${index / PATTERNS_PER_PAGE + 1}ページ目`}</ListDivider>
  );
}

// A pattern's hours as its rows say them: 9:00 – 18:00, 翌 before an end
// the next day, or 時間なし.
export function timeText({ time }: Pattern) {
  if (!time) {
    return "時間なし";
  }
  const start = time[0].replace(leadingZeroPattern, "");
  const end = time[1].replace(leadingZeroPattern, "");
  return `${start} – ${time[1] <= time[0] ? "翌" : ""}${end}`;
}

// The person's patterns: what ポチポチ入力, the calendar and their groups
// show. A change here is theirs at once. Below them, 新しい仕事にする
// chooses them again with the repeat.
export function PatternsPage({
  onBack,
  onJob,
}: {
  onBack: () => void;
  onJob: () => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const items = useUser((state) => state.patterns);
  const setItems = useUser((state) => state.setPatterns);
  const schedule = useShownDays();
  const rules = useUser((state) => state.rules);
  const [editing, setEditing] = useState<PatternDraft>();
  const [isNew, setIsNew] = useState(false);
  const [view, setView] = useState<"list" | "sort" | "add">("list");
  // The days a pattern shows on, of their own or from an order, which go
  // with it.
  const daysOf = (id: string) =>
    Object.values(schedule).filter((entry) => entry?.shift === id).length;
  // A period in use or to come still needs it; one over does not.
  const inOrder = (id: string) =>
    rules.some((rule, index) => {
      const next = rules[index + 1];
      const puts =
        rule.sequence.includes(id) ||
        (rule.holidaysOff === true && rule.holidayShift === id);
      return puts && (!next || next.start > designToday);
    });
  // Gone from the list; the days that name it show empty, as it is gone.
  const remove = (id: string) => {
    setItems((previous) => patternsWithout(previous, id));
  };
  // No longer used, or used again: archived, a pattern keeps its days'
  // marks but leaves the keys, and goes under 使わなくなったパターン.
  const setArchived = (id: string, archived: boolean) => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, archived: archived || undefined } : item
      )
    );
  };
  const used = items.filter((item) => item.archived !== true);
  const archived = items.filter((item) => item.archived === true);

  if (editing) {
    return (
      <PatternEditor
        initial={editing}
        days={daysOf(editing.id)}
        inOrder={inOrder(editing.id)}
        isNew={isNew}
        onBack={() => {
          setEditing(undefined);
        }}
        onDelete={() => {
          remove(editing.id);
          setEditing(undefined);
        }}
        onArchive={(on) => {
          setArchived(editing.id, on);
          setEditing(undefined);
        }}
        onSave={(draft) => {
          const pattern = patternOf(draft);
          setItems((previous) =>
            isNew
              ? [...previous, pattern]
              : previous.map((item) =>
                  item.id === pattern.id ? pattern : item
                )
          );
          setEditing(undefined);
        }}
        // The next day's choices: patterns in use, and the one it names.
        others={items.filter(
          (item) =>
            item.id !== editing.id &&
            (item.archived !== true || item.id === editing.nextDay)
        )}
      />
    );
  }

  if (view === "add") {
    return (
      <AddPatternPage
        items={items}
        onAdd={(added) => {
          setItems((previous) => [...previous, ...added]);
          setView("list");
        }}
        onBack={() => {
          setView("list");
        }}
        onCustom={() => {
          setView("list");
          setIsNew(true);
          setEditing({
            ...guessLook(""),
            allDay: false,
            color: nextColor(items.map((item) => item.color)),
            countsAsOff: false,
            end: "18:00",
            id: crypto.randomUUID(),
            name: "",
            start: "09:00",
          });
        }}
      />
    );
  }

  const sorting = view === "sort";
  return (
    <>
      <PageHeader
        leading={
          <BackButton disabled={sorting} onClick={onBack}>
            設定
          </BackButton>
        }
        trailing={
          <HeaderAction
            prominent={sorting}
            onClick={() => {
              setView(sorting ? "list" : "sort");
            }}
          >
            {sorting ? "完了" : "並び替え"}
          </HeaderAction>
        }
        title="シフトパターン"
      />
      {sorting ? (
        <SortableList
          divider={pageDivider}
          items={used}
          label={(item) => item.name}
          onChange={(sorted) => {
            setItems([...sorted, ...archived]);
          }}
        >
          {(item) => (
            <>
              <MarkGlyph look={item} size={22} style={style} />
              <span className={listRow.label}>{item.name}</span>
              <span className={listRow.value}>{timeText(item)}</span>
            </>
          )}
        </SortableList>
      ) : (
        <List>
          {used.map((item, index) => (
            <Fragment key={item.id}>
              {pageDivider(index)}
              <ListRow
                onClick={() => {
                  setIsNew(false);
                  setEditing(draftOf(item));
                }}
                label={item.name}
                value={timeText(item)}
                leading={
                  <>
                    <MarkGlyph look={item} size={22} style={style} />
                  </>
                }
              />
            </Fragment>
          ))}
        </List>
      )}
      {!sorting && (
        <List>
          <AddRow
            label="パターンを追加"
            opensPage
            onClick={() => {
              setView("add");
            }}
          />
        </List>
      )}
      {!sorting && archived.length > 0 && (
        <Section title="使わなくなったパターン">
          <List>
            {archived.map((item, index) => (
              <Fragment key={item.id}>
                {pageDivider(index)}
                <ListRow
                  onClick={() => {
                    setIsNew(false);
                    setEditing(draftOf(item));
                  }}
                  label={item.name}
                  value={timeText(item)}
                  leading={
                    <>
                      <MarkGlyph look={item} size={22} style={style} />
                    </>
                  }
                />
              </Fragment>
            ))}
          </List>
          <Note>
            ポチポチ入力のボタンには出ません。入っている日には、そのまま出ます。
          </Note>
        </Section>
      )}
      {!sorting && (
        <Section title="仕事">
          <List>
            <ListRow
              detail="シフトパターンと繰り返しを選び直す"
              label="新しい仕事にする"
              onClick={onJob}
            />
          </List>
        </Section>
      )}
      {sorting && (
        <Note>
          つまみを上下に動かして並べ替えます。ポチポチ入力のボタンも、この順に並びます。
        </Note>
      )}
    </>
  );
}

// The ready-made patterns not in the list yet, as chips under their
// headings as the setup questions show them: several picked, then added
// at once (design/src/patterns.ts).
function AddPatternPage({
  items,
  onBack,
  onAdd,
  onCustom,
}: {
  items: Pattern[];
  onBack: () => void;
  onAdd: (patterns: Pattern[]) => void;
  onCustom: () => void;
}) {
  const [picked, setPicked] = useState<ReadonlySet<PresetShift>>(
    () => new Set()
  );
  const taken = new Set(items.flatMap((item) => [item.id, item.name]));
  const offered = (id: PresetShift) =>
    !(taken.has(id) || taken.has(presetPatterns[id].name));
  const any = readyPatternOrder.some(offered);
  // Only ones not there yet: a 明け picked with its 夜勤 may be.
  const chosen = inChipOrder(picked).filter(offered);
  const add = () => {
    const there = new Set([...items.map((item) => item.id), ...chosen]);
    onAdd(
      presetList(chosen).map((preset) =>
        // A 夜勤 brings its 明け only when that is there too.
        preset.nextDay && there.has(preset.nextDay)
          ? preset
          : { ...preset, nextDay: undefined }
      )
    );
  };
  return (
    <>
      <PageHeader
        back="シフトパターン"
        onBack={onBack}
        title="パターンを追加"
        trailing={
          any && (
            <HeaderAction
              disabled={chosen.length === 0}
              onClick={add}
              prominent
            >
              追加
            </HeaderAction>
          )
        }
      />
      {any && (
        <div className={addPage.chips}>
          <ReadyPatternChips
            offered={offered}
            onToggle={(id) => {
              setPicked(toggled(picked, id));
            }}
            picked={picked}
          />
          <Note>名前や時間は、追加したあとで直せます。</Note>
        </div>
      )}
      <List>
        <ListRow onClick={onCustom} label="自分で作る" value="" />
      </List>
    </>
  );
}

const addPage = {
  chips: css({ display: "flex", flexDirection: "column", gap: "20px" }),
};

function PatternEditor({
  initial,
  days,
  inOrder,
  isNew,
  others,
  onBack,
  onSave,
  onDelete,
  onArchive,
}: {
  initial: PatternDraft;
  // How many days use this pattern.
  days: number;
  // In the repeating order in use, which would break without it.
  inOrder: boolean;
  isNew: boolean;
  others: Pattern[];
  onBack: () => void;
  onSave: (draft: PatternDraft) => void;
  onDelete: () => void;
  // Archives it, or brings it back into use.
  onArchive: (archived: boolean) => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const [draft, setDraft] = useState(initial);
  const [subPage, setSubPage] = useState<"look" | "nextDay">();
  const [confirming, setConfirming] = useState(false);
  // Looks the person picked stay put when the name changes afterwards.
  const [picked, setPicked] = useState<LookField[]>(
    isNew ? [] : ["symbol", "icon", "emoji"]
  );
  const pick = (field: LookField, value: Partial<PatternDraft>) => {
    setDraft({ ...draft, ...value });
    setPicked((previous) =>
      previous.includes(field) ? previous : [...previous, field]
    );
  };
  const rename = (name: string) => {
    const guess = guessLook(name);
    setDraft({
      ...draft,
      emoji: picked.includes("emoji") ? draft.emoji : guess.emoji,
      icon: picked.includes("icon") ? draft.icon : guess.icon,
      name,
      symbol: picked.includes("symbol") ? draft.symbol : guess.symbol,
    });
  };
  const canSave = draft.name.trim() !== "";
  // Another pattern that style could not tell apart from this one.
  const lookalike = (tab: ShiftMarkStyle) =>
    others.find((other) => lookAlike(other, draft, tab));

  const nextDay = others.find((other) => other.id === draft.nextDay);

  if (subPage === "look") {
    return (
      <LookEditorPage
        back={draft.name || "パターン"}
        look={draft}
        onBack={() => {
          setSubPage(undefined);
        }}
        onPick={pick}
        title="印と色"
      >
        {(tab) => {
          const twin = lookalike(tab);
          return (
            twin && (
              <p className={editor.lookalike}>
                同じ{lookalikeParts[tab]}の「{twin.name}」がもうあります。
              </p>
            )
          );
        }}
      </LookEditorPage>
    );
  }
  if (subPage === "nextDay") {
    return (
      <NextDayPicker
        draft={draft}
        onBack={() => {
          setSubPage(undefined);
        }}
        onChange={(id) => {
          setDraft({ ...draft, nextDay: id });
        }}
        others={others}
      />
    );
  }

  return (
    <>
      <PageHeader
        back="シフトパターン"
        onBack={onBack}
        trailing={
          <HeaderAction
            disabled={!canSave}
            prominent
            onClick={() => {
              onSave({ ...draft, name: draft.name.trim() });
            }}
          >
            {isNew ? "追加" : "保存"}
          </HeaderAction>
        }
        title={isNew ? "パターンを追加" : "パターンを編集"}
      />
      <div className={markPreview()}>
        <MarkGlyph look={draft} size={44} style={style} />
        <span className={editor.name}>
          {/* Until it is named, what it is, faint: not 名前を入力, which
              read as a field to press. */}
          <strong className={draft.name ? undefined : editor.unnamed}>
            {draft.name || "新しいパターン"}
          </strong>
          <small className={editor.time}>{timeText(patternOf(draft))}</small>
        </span>
      </div>
      <Section title="基本">
        <List>
          <ListRow
            label="名前"
            control={
              <>
                <LimitedInput
                  align="end"
                  look="inline"
                  kind="shiftName"
                  onValueChange={rename}
                  placeholder="例：日勤"
                  value={draft.name}
                />
              </>
            }
          />
          <SwitchRow
            label="時間なし"

            checked={draft.allDay}
            onChange={(checked) => {
              setDraft({ ...draft, allDay: checked });
            }}
          />
          {!draft.allDay && (
            <ListRow
              label="時間"
              control={
                <TimeRange
                  end={draft.end}
                  onChange={(field, value) => {
                    setDraft({ ...draft, [field]: value });
                  }}
                  start={draft.start}
                />
              }
            />
          )}
          <SwitchRow
            // What it changes that every calendar shows; groups and
            // widgets follow from it being a day off.
            detail="今月のお休みの日数に入ります"
            label="休みとして数える"

            checked={draft.countsAsOff}
            onChange={(checked) => {
              setDraft({ ...draft, countsAsOff: checked });
            }}
          />
          <ListRow
            onClick={() => {
              setSubPage("nextDay");
            }}
            label="翌日のパターン"
            value={
              <>
                {nextDay && (
                  <MarkGlyph look={nextDay} size={18} style={style} />
                )}
                {nextDay?.name ?? "なし"}
              </>
            }
            valueClassName={markValue}
          />
        </List>
      </Section>
      <Section title="見た目">
        <List>
          <ListRow
            onClick={() => {
              setSubPage("look");
            }}
            label="印と色"
            value={
              <>
                <MarkGlyph look={draft} size={20} style={style} />
              </>
            }
            valueClassName={markValue}
          />
        </List>
      </Section>
      {!isNew && initial.archived === true && (
        <Button
          className={archiveButton}
          onClick={() => {
            onArchive(false);
          }}
          size="small"
          variant="text"
        >
          また使う
        </Button>
      )}
      {!(isNew || inOrder || initial.archived === true) && (
        <Button
          className={archiveButton}
          onClick={() => {
            onArchive(true);
          }}
          size="small"
          variant="text"
        >
          使わないパターンにする
        </Button>
      )}
      {!isNew && inOrder && (
        <Note>
          繰り返しの並びに入っているので、削除したり使わないパターンにしたりできません。先に「繰り返し」で並びを変えてください。
        </Note>
      )}
      {!(isNew || inOrder) && (
        <DestructiveButton
          onClick={() => {
            // Unused, it goes at once; in use, its days go too, so ask.
            if (days > 0) {
              setConfirming(true);
            } else {
              onDelete();
            }
          }}
        >
          このパターンを削除
        </DestructiveButton>
      )}
      {confirming && (
        <ConfirmDialog
          action="削除"
          message={`${days}日の予定に入っている「${initial.name}」も一緒に消えます。元に戻せません。日の印を残すなら「使わないパターンにする」を選んでください。`}
          onCancel={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            onDelete();
          }}
          title={`「${initial.name}」を削除しますか？`}
        />
      )}
    </>
  );
}

// Archiving, a quiet action over 削除, centered as it is.
const archiveButton = css({ alignSelf: "center" });

// The value of なし among the patterns' ids.
const noNextDay = "none";

function NextDayPicker({
  draft,
  others,
  onBack,
  onChange,
}: {
  draft: PatternDraft;
  others: Pattern[];
  onBack: () => void;
  onChange: (id: string | undefined) => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const choices = [undefined, ...others];
  return (
    <>
      <PageHeader
        back={draft.name || "パターン"}
        onBack={onBack}
        title="翌日のパターン"
      />
      <Note>
        {draft.name || "このパターン"}
        を入れると、翌日に1日分だけ自動でシフトが入ります。夜勤の翌日の明けなどに使います。
      </Note>
      <ChoiceList
        label="翌日のパターン"
        onValueChange={(id) => {
          onChange(id === noNextDay ? undefined : id);
          onBack();
        }}
        value={draft.nextDay ?? noNextDay}
      >
        {choices.map((choice) => (
          <ChoiceRow
            key={choice?.id ?? noNextDay}
            label={choice?.name ?? "なし"}
            leading={
              choice && <MarkGlyph look={choice} size={20} style={style} />
            }
            value={choice?.id ?? noNextDay}
          />
        ))}
      </ChoiceList>
    </>
  );
}

// Picks the mark for each look and the shared color. It opens on the look in
// use; the others are there for when the setting is switched.
