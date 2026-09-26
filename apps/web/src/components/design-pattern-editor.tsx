import {
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { useContext, useRef, useState } from "react";
import { nextDayShifts, patterns, type Shift } from "./design-calendar";
import { LookEditorPage, type LookField } from "./design-look-editor";
import {
  BadgeLengthContext,
  guessLook,
  type Look,
  lookOf,
  MarkGlyph,
  nextColor,
  type ShiftMarkStyle,
  ShiftMarkStyleContext,
} from "./shift-mark";

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
  const time = patterns[key].time;
  return {
    ...lookOf(key),
    id: key,
    name: patterns[key].label,
    allDay: !time,
    start: time?.[0] ?? "09:00",
    end: time?.[1] ?? "18:00",
    countsAsOff: key === "off" || key === "paid",
    nextDay: nextDayShifts[key],
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
        onBack={() => setEditing(undefined)}
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
        onBack={() => setView("list")}
        onCustom={() => {
          setView("list");
          setIsNew(true);
          setEditing({
            ...guessLook(""),
            id: `custom-${items.length}`,
            name: "",
            color: nextColor(items.map((item) => item.color)),
            allDay: false,
            start: "09:00",
            end: "18:00",
            countsAsOff: false,
          });
        }}
      />
    );
  }

  const sorting = view === "sort";
  return (
    <>
      <header className="st-page-header">
        <div className="pe-topbar">
          <button
            className="st-back"
            disabled={sorting}
            onClick={onBack}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={20} />
            設定
          </button>
          <button
            className="pe-save"
            onClick={() => setView(sorting ? "list" : "sort")}
            type="button"
          >
            {sorting ? "完了" : "並び替え"}
          </button>
        </div>
        <h3 className="st-title">シフトパターン</h3>
      </header>
      {sorting ? (
        <SortablePatterns items={items} onChange={setItems} style={style} />
      ) : (
        <div className="st-list">
          {items.map((item) => (
            <button
              className="st-row st-pattern"
              key={item.id}
              onClick={() => {
                setIsNew(false);
                setEditing(item);
              }}
              type="button"
            >
              <MarkGlyph look={item} size={22} style={style} />
              <span className="st-row-label">{item.name}</span>
              <span className="st-row-value">{timeText(item)}</span>
              <ChevronRight
                aria-hidden="true"
                className="st-row-arrow"
                size={17}
              />
            </button>
          ))}
        </div>
      )}
      {!sorting && (
        <button className="st-add" onClick={() => setView("add")} type="button">
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

// Rows move with the handle; arrow keys on the handle move one step. The
// drag follows the pointer on the window, since rows swap under it.
function SortablePatterns({
  items,
  style,
  onChange,
}: {
  items: PatternDraft[];
  style: ShiftMarkStyle;
  onChange: (items: PatternDraft[]) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [drag, setDrag] = useState<{ id: string; offset: number }>();

  const move = (id: string, to: number) => {
    const list = itemsRef.current;
    const from = list.findIndex((item) => item.id === id);
    const target = Math.max(0, Math.min(list.length - 1, to));
    if (from === target) {
      return;
    }
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(target, 0, item);
    itemsRef.current = next;
    onChange(next);
  };

  const startDrag = (id: string, index: number, startY: number) => {
    const height =
      listRef.current?.firstElementChild?.getBoundingClientRect().height ??
      defaultRowHeight;
    setDrag({ id, offset: 0 });
    const follow = (event: PointerEvent) => {
      const moved = event.clientY - startY;
      const target = Math.max(
        0,
        Math.min(
          itemsRef.current.length - 1,
          index + Math.round(moved / height)
        )
      );
      move(id, target);
      setDrag({ id, offset: moved - (target - index) * height });
    };
    const stop = () => {
      setDrag(undefined);
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };

  return (
    <div className="st-list st-sortable" ref={listRef}>
      {items.map((item, index) => (
        <div
          className={`st-row st-pattern ${drag?.id === item.id ? "st-dragging" : ""}`}
          key={item.id}
          style={
            drag?.id === item.id
              ? { transform: `translateY(${drag.offset}px)` }
              : undefined
          }
        >
          <MarkGlyph look={item} size={22} style={style} />
          <span className="st-row-label">{item.name}</span>
          <span className="st-row-value">{timeText(item)}</span>
          <button
            aria-label={`${item.name}を並べ替え。上下の矢印キーで動かせます`}
            className="st-handle"
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                event.preventDefault();
                move(item.id, index + (event.key === "ArrowUp" ? -1 : 1));
              }
            }}
            onPointerDown={(event) => {
              event.preventDefault();
              startDrag(item.id, index, event.clientY);
            }}
            type="button"
          >
            <GripVertical aria-hidden="true" size={18} />
          </button>
        </div>
      ))}
    </div>
  );
}

const defaultRowHeight = 48;

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
      <header className="st-page-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          シフトパターン
        </button>
        <h3 className="st-title">パターンを追加</h3>
      </header>
      {suggestions.length > 0 && (
        <section className="st-section">
          <h4>よく使うパターン</h4>
          <div className="st-list">
            {suggestions.map((draft) => (
              <button
                className="st-row st-pattern"
                key={draft.id}
                onClick={() => onAdd(draft)}
                type="button"
              >
                <MarkGlyph look={draft} size={22} style={style} />
                <span className="st-row-label">{draft.name}</span>
                <span className="st-row-value">{timeText(draft)}</span>
                <Plus
                  aria-hidden="true"
                  className="st-row-arrow st-add-icon"
                  size={17}
                />
              </button>
            ))}
          </div>
        </section>
      )}
      <div className="st-list">
        <button className="st-row" onClick={onCustom} type="button">
          <span className="st-row-label">自分で作る</span>
          <span className="st-row-value" />
          <ChevronRight aria-hidden="true" className="st-row-arrow" size={17} />
        </button>
      </div>
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
    isNew ? [] : ["symbol", "symbol2", "icon", "emoji"]
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
      name,
      symbol: picked.includes("symbol") ? draft.symbol : guess.symbol,
      symbol2: picked.includes("symbol2") ? draft.symbol2 : guess.symbol2,
      icon: picked.includes("icon") ? draft.icon : guess.icon,
      emoji: picked.includes("emoji") ? draft.emoji : guess.emoji,
    });
  };
  const canSave = draft.name.trim() !== "";
  const { length } = useContext(BadgeLengthContext);
  const letterField = length === "two" ? "symbol2" : "symbol";
  // Another pattern the letter style could not tell apart from this one.
  const lookalike = others.find(
    (other) =>
      other[letterField] === draft[letterField] && other.color === draft.color
  );

  const nextDay = others.find((other) => other.id === draft.nextDay);

  if (subPage === "look") {
    return (
      <LookEditorPage
        back={draft.name || "パターン"}
        look={draft}
        onBack={() => setSubPage(undefined)}
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
        onBack={() => setSubPage(undefined)}
        onChange={(id) => setDraft({ ...draft, nextDay: id })}
        others={others}
      />
    );
  }

  return (
    <>
      <header className="st-page-header">
        <div className="pe-topbar">
          <button className="st-back" onClick={onBack} type="button">
            <ChevronLeft aria-hidden="true" size={20} />
            シフトパターン
          </button>
          <button
            className="pe-save"
            disabled={!canSave}
            onClick={() => onSave({ ...draft, name: draft.name.trim() })}
            type="button"
          >
            {isNew ? "追加" : "保存"}
          </button>
        </div>
        <h3 className="st-title">
          {isNew ? "パターンを追加" : "パターンを編集"}
        </h3>
      </header>
      <div className="pe-preview">
        <MarkGlyph look={draft} size={44} style={style} />
        <span className="pe-preview-text">
          <strong>{draft.name || "名前を入力"}</strong>
          <small className="pe-preview-time">{timeText(draft)}</small>
        </span>
      </div>
      <section className="st-section">
        <h4>基本</h4>
        <div className="st-list">
          <label className="st-row">
            <span className="st-row-label">名前</span>
            <input
              className="pe-inline-input"
              onChange={(event) => rename(event.target.value)}
              placeholder="例：日勤"
              value={draft.name}
            />
          </label>
          <label className="st-row">
            <span className="st-row-label">時間なし</span>
            <input
              aria-checked={draft.allDay}
              checked={draft.allDay}
              className="pe-toggle"
              onChange={(event) =>
                setDraft({ ...draft, allDay: event.target.checked })
              }
              role="switch"
              type="checkbox"
            />
          </label>
          {!draft.allDay && (
            <div className="st-row">
              <span className="st-row-label">時間</span>
              <span className="pe-times">
                <input
                  aria-label="開始時刻"
                  onChange={(event) =>
                    setDraft({ ...draft, start: event.target.value })
                  }
                  type="time"
                  value={draft.start}
                />
                <span aria-hidden="true">–</span>
                <input
                  aria-label="終了時刻"
                  onChange={(event) =>
                    setDraft({ ...draft, end: event.target.value })
                  }
                  type="time"
                  value={draft.end}
                />
              </span>
            </div>
          )}
          <label className="st-row">
            <span className="st-row-label">休みとして数える</span>
            <input
              aria-checked={draft.countsAsOff}
              checked={draft.countsAsOff}
              className="pe-toggle"
              onChange={(event) =>
                setDraft({ ...draft, countsAsOff: event.target.checked })
              }
              role="switch"
              type="checkbox"
            />
          </label>
          <button
            className="st-row"
            onClick={() => setSubPage("nextDay")}
            type="button"
          >
            <span className="st-row-label">翌日のパターン</span>
            <span className="st-row-value pe-look-value">
              {nextDay && <MarkGlyph look={nextDay} size={18} style={style} />}
              {nextDay?.name ?? "なし"}
            </span>
            <ChevronRight
              aria-hidden="true"
              className="st-row-arrow"
              size={17}
            />
          </button>
        </div>
      </section>
      <section className="st-section">
        <h4>見た目</h4>
        <div className="st-list">
          <button
            className="st-row"
            onClick={() => setSubPage("look")}
            type="button"
          >
            <span className="st-row-label">印と色</span>
            <span className="st-row-value pe-look-value">
              <MarkGlyph look={draft} size={20} style={style} />
            </span>
            <ChevronRight
              aria-hidden="true"
              className="st-row-arrow"
              size={17}
            />
          </button>
        </div>
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
      <header className="st-page-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          {draft.name || "パターン"}
        </button>
        <h3 className="st-title">翌日のパターン</h3>
      </header>
      <p className="st-note">
        {draft.name || "このパターン"}
        を入れると、翌日にも自動でシフトが入ります。夜勤の翌日の明けなどに使います。
      </p>
      <div className="st-list">
        {choices.map((choice) => (
          <button
            aria-pressed={draft.nextDay === choice?.id}
            className="st-row"
            key={choice?.id ?? "none"}
            onClick={() => {
              onChange(choice?.id);
              onBack();
            }}
            type="button"
          >
            {choice && <MarkGlyph look={choice} size={20} style={style} />}
            <span className="st-row-label">{choice?.name ?? "なし"}</span>
            {draft.nextDay === choice?.id && (
              <Check aria-hidden="true" className="pe-check-mark" size={18} />
            )}
          </button>
        ))}
      </div>
    </>
  );
}

// Picks the mark for each look and the shared color. It opens on the look in
// use; the others are there for when the setting is switched.
