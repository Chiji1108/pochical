import { Plus, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import { cx } from "styled-system/css";

import { patterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { nextDayShifts } from "./design-calendar";
import { LookEditorPage } from "./design-look-editor";
import type { LookField } from "./design-look-editor";
import {
  BackButton,
  ChoiceList,
  ChoiceRow,
  HeaderAction,
  List,
  ListRow,
  PageHeader,
  SortableList,
  SwitchRow,
  listRow,
} from "./design-ui";
import {
  guessLook,
  lookOf,
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

function draftOf(key: Shift): PatternDraft {
  const { time } = patterns[key];
  return {
    ...lookOf(key),
    allDay: !time,
    countsAsOff: key === "off" || key === "paid",
    end: time?.[1] ?? "18:00",
    id: key,
    name: patterns[key].label,
    nextDay: nextDayShifts[key],
    start: time?.[0] ?? "09:00",
  };
}

function timeText(draft: PatternDraft) {
  if (draft.allDay) {
    return "時間なし";
  }
  const start = draft.start.replace(leadingZeroPattern, "");
  const end = draft.end.replace(leadingZeroPattern, "");
  return `${start} – ${draft.end <= draft.start ? "翌" : ""}${end}`;
}

export function PatternsPage({
  patternKeys,
  onBack,
}: {
  patternKeys: Shift[];
  onBack: () => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const [items, setItems] = useState(() => patternKeys.map(draftOf));
  const [editing, setEditing] = useState<PatternDraft>();
  const [isNew, setIsNew] = useState(false);
  const [view, setView] = useState<"list" | "sort" | "add">("list");

  if (editing) {
    return (
      <PatternEditor
        initial={editing}
        isNew={isNew}
        onBack={() => {
          setEditing(undefined);
        }}
        onDelete={() => {
          setItems(items.filter((item) => item.id !== editing.id));
          setEditing(undefined);
        }}
        onSave={(draft) => {
          setItems(
            isNew
              ? [...items, draft]
              : items.map((item) => (item.id === draft.id ? draft : item))
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
        onAdd={(draft) => {
          setItems([...items, draft]);
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
            id: `custom-${items.length}`,
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
          {items.map((item) => (
            <ListRow
              key={item.id}
              onClick={() => {
                setIsNew(false);
                setEditing(item);
              }}
              label={item.name}
              value={timeText(item)}
              leading={
                <>
                  <MarkGlyph look={item} size={22} style={style} />
                </>
              }
            />
          ))}
        </List>
      )}
      {!sorting && (
        <button
          className="st-add"
          onClick={() => {
            setView("add");
          }}
          type="button"
        >
          <Plus aria-hidden="true" size={14} />
          パターンを追加
        </button>
      )}
      <p className="st-note">
        {sorting
          ? "つまみを上下に動かして並べ替えます。ポチポチ入力のボタンも、この順に並びます。"
          : "ポチポチ入力のシフトのボタンを長押ししても、その場で直せます。ここでの変更は、この画面の中だけの見本です。"}
      </p>
    </>
  );
}

// Common patterns to add with one tap, leaving out ones already there.
const suggestionKeys: Shift[] = [
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
  items: PatternDraft[];
  onBack: () => void;
  onAdd: (draft: PatternDraft) => void;
  onCustom: () => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const taken = new Set(items.flatMap((item) => [item.id, item.name]));
  const suggestions = suggestionKeys
    .filter((key) => !(taken.has(key) || taken.has(patterns[key].label)))
    .map(draftOf);
  return (
    <>
      <PageHeader
        back="シフトパターン"
        onBack={onBack}
        title="パターンを追加"
      />
      {suggestions.length > 0 && (
        <section className="st-section">
          <h4>よく使うパターン</h4>
          <List>
            {suggestions.map((draft) => (
              <ListRow
                key={draft.id}
                onClick={() => {
                  onAdd(draft);
                }}
                label={draft.name}
                value={timeText(draft)}
                leading={
                  <>
                    <MarkGlyph look={draft} size={22} style={style} />
                  </>
                }
                arrow={
                  <Plus
                    aria-hidden="true"
                    className={cx(listRow.arrow, "st-add-icon")}
                    size={17}
                  />
                }
              />
            ))}
          </List>
        </section>
      )}
      <List>
        <ListRow onClick={onCustom} label="自分で作る" value="" />
      </List>
      <p className="st-note">名前や時間は、追加したあとで直せます。</p>
    </>
  );
}

function PatternEditor({
  initial,
  isNew,
  others,
  onBack,
  onSave,
  onDelete,
}: {
  initial: PatternDraft;
  isNew: boolean;
  others: PatternDraft[];
  onBack: () => void;
  onSave: (draft: PatternDraft) => void;
  onDelete: () => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const [draft, setDraft] = useState(initial);
  const [subPage, setSubPage] = useState<"look" | "nextDay">();
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
          <p className="pe-warning">
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
            onClick={() => {
              onSave({ ...draft, name: draft.name.trim() });
            }}
          >
            {isNew ? "追加" : "保存"}
          </HeaderAction>
        }
        title={isNew ? "パターンを追加" : "パターンを編集"}
      />
      <div className="pe-preview">
        <MarkGlyph look={draft} size={44} style={style} />
        <span className="pe-preview-text">
          <strong>{draft.name || "名前を入力"}</strong>
          <small className="pe-preview-time">{timeText(draft)}</small>
        </span>
      </div>
      <section className="st-section">
        <h4>基本</h4>
        <List>
          <ListRow
            label="名前"
            control={
              <>
                <input
                  className="pe-inline-input"
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
                  <span className="pe-times">
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
            valueClassName="pe-look-value"
          />
        </List>
      </section>
      <section className="st-section">
        <h4>見た目</h4>
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
            valueClassName="pe-look-value"
          />
        </List>
      </section>
      {!isNew && (
        <button className="pe-delete" onClick={onDelete} type="button">
          <Trash2 aria-hidden="true" size={14} />
          このパターンを削除
        </button>
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
  others: PatternDraft[];
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
      <p className="st-note">
        {draft.name || "このパターン"}
        を入れると、翌日にも自動でシフトが入ります。夜勤の翌日の明けなどに使います。
      </p>
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
