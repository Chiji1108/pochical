import { Plus } from "lucide-react";
import { Fragment, useContext, useState } from "react";
import { css } from "styled-system/css";

import { PATTERNS_PER_PAGE, presetList } from "../lib/design-patterns";
import type { Pattern, PresetShift } from "../lib/design-patterns";
import { useUser } from "../lib/design-user-store";
import { isRepeating } from "./design-calendar";
import { LookEditorPage } from "./design-look-editor";
import type { LookField } from "./design-look-editor";
import { ConfirmDialog } from "./design-sheet";
import {
  AddButton,
  BackButton,
  ChoiceList,
  ChoiceRow,
  DestructiveButton,
  HeaderAction,
  inlineInput,
  List,
  ListDivider,
  ListRow,
  listRow,
  markPreview,
  markValue,
  Note,
  PageHeader,
  Section,
  SortableList,
  SwitchRow,
} from "./design-ui";
import {
  guessLook,
  MarkGlyph,
  nextColor,
  ShiftMarkStyleContext,
} from "./shift-mark";
import type { Look } from "./shift-mark";

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
  // Start and end, side by side at the row's right.
  times: css({
    "& > input": {
      bg: "background.card",
      border: "1px solid token(colors.border.default)",
      borderRadius: "8px",
      color: "text.primary",
      font: "inherit",
      padding: "4px 8px",
      textStyle: "body",
    },
    alignItems: "center",
    color: "text.tertiary",
    display: "flex",
    flex: 1,
    gap: "4px",
    justifyContent: "flex-end",
  }),
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

function timeText({ time }: Pattern) {
  if (!time) {
    return "時間なし";
  }
  const start = time[0].replace(leadingZeroPattern, "");
  const end = time[1].replace(leadingZeroPattern, "");
  return `${start} – ${time[1] <= time[0] ? "翌" : ""}${end}`;
}

// The person's patterns: what ポチポチ入力, the calendar and their groups
// show. A change here is theirs at once.
export function PatternsPage({ onBack }: { onBack: () => void }) {
  const style = useContext(ShiftMarkStyleContext);
  const items = useUser((state) => state.patterns);
  const setItems = useUser((state) => state.setPatterns);
  const schedule = useUser((state) => state.schedule);
  const setSchedule = useUser((state) => state.setSchedule);
  const rules = useUser((state) => state.rules);
  const [editing, setEditing] = useState<PatternDraft>();
  const [isNew, setIsNew] = useState(false);
  const [view, setView] = useState<"list" | "sort" | "add">("list");
  // The days a pattern is entered on, which go with it.
  const daysOf = (id: string) =>
    Object.values(schedule).filter((entry) => entry?.shift === id).length;
  // The repeating order in use still needs it.
  const inOrder = (id: string) =>
    isRepeating(rules) && (rules.at(-1)?.sequence.includes(id) ?? false);
  // Gone with its days, and from any pattern that followed on with it.
  const remove = (id: string) => {
    setItems((previous) =>
      previous
        .filter((item) => item.id !== id)
        .map((item) =>
          item.nextDay === id ? { ...item, nextDay: undefined } : item
        )
    );
    setSchedule((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([, entry]) => entry?.shift !== id)
      )
    );
  };

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
        others={items.filter((item) => item.id !== editing.id)}
      />
    );
  }

  if (view === "add") {
    return (
      <AddPatternPage
        items={items}
        onAdd={(pattern) => {
          setItems((previous) => [...previous, pattern]);
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
          items={items}
          label={(item) => item.name}
          onChange={setItems}
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
          {items.map((item, index) => (
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
        <AddButton
          onClick={() => {
            setView("add");
          }}
        >
          パターンを追加
        </AddButton>
      )}
      {sorting && (
        <Note>
          つまみを上下に動かして並べ替えます。ポチポチ入力のボタンも、この順に並びます。
        </Note>
      )}
    </>
  );
}

// Common patterns to add with one tap, leaving out ones already there.
const suggestionKeys: PresetShift[] = [
  "early",
  "day",
  "late",
  "night",
  "after",
  "evening",
  "junya",
  "midnight",
  "duty",
  "offDuty",
  "training",
  "paid",
  "off",
];

function AddPatternPage({
  items,
  onBack,
  onAdd,
  onCustom,
}: {
  items: Pattern[];
  onBack: () => void;
  onAdd: (pattern: Pattern) => void;
  onCustom: () => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const taken = new Set(items.flatMap((item) => [item.id, item.name]));
  const suggestions = presetList(suggestionKeys).filter(
    (preset) => !(taken.has(preset.id) || taken.has(preset.name))
  );
  return (
    <>
      <PageHeader
        back="シフトパターン"
        onBack={onBack}
        title="パターンを追加"
      />
      {suggestions.length > 0 && (
        <Section title="よく使うパターン">
          <List>
            {suggestions.map((preset) => (
              <ListRow
                key={preset.id}
                onClick={() => {
                  // A 夜勤 brings its 明け only when that is there too.
                  const follows =
                    preset.nextDay &&
                    items.some((item) => item.id === preset.nextDay);
                  onAdd(follows ? preset : { ...preset, nextDay: undefined });
                }}
                label={preset.name}
                value={timeText(preset)}
                leading={
                  <>
                    <MarkGlyph look={preset} size={22} style={style} />
                  </>
                }
                arrow={
                  <Plus aria-hidden="true" className={listRow.add} size={17} />
                }
              />
            ))}
          </List>
        </Section>
      )}
      <List>
        <ListRow onClick={onCustom} label="自分で作る" value="" />
      </List>
      <Note>名前や時間は、追加したあとで直せます。</Note>
    </>
  );
}

function PatternEditor({
  initial,
  days,
  inOrder,
  isNew,
  others,
  onBack,
  onSave,
  onDelete,
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
  // Another pattern the letter style could not tell apart from this one.
  const lookalike = others.find(
    (other) => other.symbol === draft.symbol && other.color === draft.color
  );

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
        {lookalike && (
          <p className={editor.lookalike}>
            「{lookalike.name}
            」と同じ文字と色です。色か文字を変えると見分けやすくなります。
          </p>
        )}
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
          <strong>{draft.name || "名前を入力"}</strong>
          <small className={editor.time}>{timeText(patternOf(draft))}</small>
        </span>
      </div>
      <Section title="基本">
        <List>
          <ListRow
            label="名前"
            control={
              <>
                <input
                  className={inlineInput}
                  onChange={(event) => {
                    rename(event.target.value);
                  }}
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
                <>
                  <span className={editor.times}>
                    <input
                      aria-label="開始時刻"
                      onChange={(event) => {
                        setDraft({ ...draft, start: event.target.value });
                      }}
                      type="time"
                      value={draft.start}
                    />
                    <span aria-hidden="true">–</span>
                    <input
                      aria-label="終了時刻"
                      onChange={(event) => {
                        setDraft({ ...draft, end: event.target.value });
                      }}
                      type="time"
                      value={draft.end}
                    />
                  </span>
                </>
              }
            />
          )}
          <SwitchRow
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
      {!isNew && inOrder && (
        <Note>
          繰り返しの並びに入っているので、削除できません。先に「働き方」で並びを変えてください。
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
          message={`${days}日の予定に入っている「${initial.name}」も一緒に消えます。元に戻せません。`}
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
        を入れると、翌日にも自動でシフトが入ります。夜勤の翌日の明けなどに使います。
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
