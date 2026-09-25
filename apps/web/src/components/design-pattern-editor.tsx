import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import { patterns, type Shift } from "./design-calendar";
import {
  guessLook,
  type Look,
  lookOf,
  MarkGlyph,
  type MarkIcon,
  markColors,
  markEmojis,
  markIcons,
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
};

type LookField = "symbol" | "icon" | "emoji" | "color";

const styleNames: Record<ShiftMarkStyle, string> = {
  emoji: "絵文字",
  badge: "文字",
  icon: "アイコン",
};

const iconNames: Record<MarkIcon, string> = {
  letter: "文字アイコン",
  sun: "太陽",
  cloudSun: "晴れ",
  sunrise: "日の出",
  sunset: "夕日",
  sunMoon: "夕方",
  moon: "月",
  moonStar: "月と星",
  cloudMoon: "夜空",
  leaf: "葉っぱ",
  bed: "ベッド",
  coffee: "コーヒー",
  flower: "花",
  treePalm: "ヤシの木",
  umbrella: "傘",
  book: "本",
  graduationCap: "学位帽",
  briefcase: "かばん",
  laptop: "パソコン",
  building: "ビル",
  house: "家",
  users: "人たち",
  phone: "電話",
  clock: "時計",
  calendarCheck: "予定",
  hospital: "病院",
  stethoscope: "聴診器",
  syringe: "注射器",
  ambulance: "救急車",
  siren: "サイレン",
  flame: "炎",
  shield: "盾",
  car: "車",
  bus: "バス",
  train: "電車",
  plane: "飛行機",
  baby: "赤ちゃん",
  utensils: "食事",
  shoppingBag: "買い物",
  dumbbell: "運動",
  music: "音楽",
  heart: "ハート",
  star: "星",
  sparkles: "きらきら",
  partyPopper: "お祝い",
};

const leadingZeroPattern = /^0/;
const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

function firstGrapheme(value: string) {
  return graphemes.segment(value)[Symbol.iterator]().next().value?.segment;
}

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

  return (
    <>
      <header className="st-page-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          設定
        </button>
        <h3 className="st-title">シフトパターン</h3>
      </header>
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
            <MarkGlyph look={item} name={item.name} size={22} style={style} />
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
      <button
        className="st-add"
        onClick={() => {
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
        type="button"
      >
        <Plus aria-hidden="true" size={14} />
        パターンを追加
      </button>
      <button className="st-link" type="button">
        ひな形から選び直す
      </button>
      <p className="st-note">
        ポチポチ入力のシフトのボタンを長押ししても、その場で直せます。ここでの変更は、この画面の中だけの見本です。
      </p>
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
      name,
      symbol: picked.includes("symbol") ? draft.symbol : guess.symbol,
      icon: picked.includes("icon") ? draft.icon : guess.icon,
      emoji: picked.includes("emoji") ? draft.emoji : guess.emoji,
    });
  };
  const lookalike = others.find(
    (other) => other.symbol === draft.symbol && other.color === draft.color
  );
  // Color is shared by the letter and icon looks, so it is shown once.
  const otherStyles = (["emoji", "badge", "icon"] as const).filter(
    (option) => option !== style
  );
  const colorsUpFront = style !== "emoji";

  return (
    <>
      <header className="st-page-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          シフトパターン
        </button>
        <h3 className="st-title">
          {isNew ? "パターンを追加" : "パターンを編集"}
        </h3>
      </header>
      <div className="pe-preview">
        <MarkGlyph look={draft} name={draft.name} size={44} style={style} />
        <span className="pe-preview-text">
          <strong>{draft.name || "名前を入力"}</strong>
          <small className="pe-preview-time">{timeText(draft)}</small>
        </span>
      </div>
      <label className="pe-field">
        <span className="dc-repeat-label">名前</span>
        <input
          className="dc-detail-note"
          onChange={(event) => rename(event.target.value)}
          placeholder="例：日勤、夜勤、研修"
          value={draft.name}
        />
      </label>
      <LookEditor draft={draft} onPick={pick} style={style} />
      {colorsUpFront && <ColorPicker draft={draft} onPick={pick} />}
      {style === "badge" && lookalike && (
        <p className="pe-warning">
          「{lookalike.name}
          」と同じ見た目です。色か文字を変えると見分けやすくなります。
        </p>
      )}
      <TimeEditor draft={draft} onChange={setDraft} />
      <details className="pe-more">
        <summary>ほかの見た目</summary>
        <p className="st-note">
          見た目を切り替えたときに使います。名前から自動で決まっています。
        </p>
        {otherStyles.map((option) => (
          <LookEditor draft={draft} key={option} onPick={pick} style={option} />
        ))}
        {!colorsUpFront && <ColorPicker draft={draft} onPick={pick} />}
      </details>
      <details className="pe-more">
        <summary>詳しい設定</summary>
        <label className="pe-check">
          <input
            checked={draft.countsAsOff}
            onChange={(event) =>
              setDraft({ ...draft, countsAsOff: event.target.checked })
            }
            type="checkbox"
          />
          休みとして数える
        </label>
      </details>
      <button
        className="st-primary"
        disabled={draft.name.trim() === ""}
        onClick={() => onSave({ ...draft, name: draft.name.trim() })}
        type="button"
      >
        {isNew ? "追加する" : "保存する"}
      </button>
      {!isNew && (
        <button className="pe-delete" onClick={onDelete} type="button">
          <Trash2 aria-hidden="true" size={14} />
          このパターンを削除
        </button>
      )}
    </>
  );
}

function ColorPicker({
  draft,
  onPick,
}: {
  draft: PatternDraft;
  onPick: (field: LookField, value: Partial<PatternDraft>) => void;
}) {
  return (
    <fieldset className="pe-colors">
      <legend className="dc-repeat-label pe-colors-label">色</legend>
      {markColors.map(({ name, color, tint }, index) => (
        <button
          aria-label={name}
          aria-pressed={draft.color === index}
          key={name}
          onClick={() => onPick("color", { color: index })}
          style={{ background: tint, color }}
          type="button"
        >
          {draft.symbol || "あ"}
        </button>
      ))}
    </fieldset>
  );
}

function LookEditor({
  draft,
  style,
  onPick,
}: {
  draft: PatternDraft;
  style: ShiftMarkStyle;
  onPick: (field: LookField, value: Partial<PatternDraft>) => void;
}) {
  return (
    <fieldset className="pe-look">
      <legend className="dc-repeat-label">{styleNames[style]}</legend>
      {style === "badge" && (
        <input
          aria-label="文字（1〜2文字）"
          className="dc-detail-note pe-symbol"
          maxLength={2}
          onChange={(event) => onPick("symbol", { symbol: event.target.value })}
          value={draft.symbol}
        />
      )}
      {style === "icon" && (
        <div className="pe-grid">
          {(Object.keys(markIcons) as MarkIcon[]).map((icon) => (
            <button
              aria-label={iconNames[icon]}
              aria-pressed={draft.icon === icon}
              key={icon}
              onClick={() => onPick("icon", { icon })}
              type="button"
            >
              <MarkGlyph look={{ ...draft, icon }} size={20} style="icon" />
            </button>
          ))}
        </div>
      )}
      {style === "emoji" && (
        <>
          <div className="pe-grid">
            {markEmojis.map((emoji) => (
              <button
                aria-pressed={draft.emoji === emoji}
                key={emoji}
                onClick={() => onPick("emoji", { emoji })}
                type="button"
              >
                <span className="sm-emoji">{emoji}</span>
              </button>
            ))}
          </div>
          <input
            aria-label="ほかの絵文字を入力"
            className="dc-detail-note"
            onChange={(event) => {
              const emoji = firstGrapheme(event.target.value);
              if (emoji) {
                onPick("emoji", { emoji });
              }
            }}
            placeholder="ほかの絵文字を入力"
            value=""
          />
        </>
      )}
    </fieldset>
  );
}

function TimeEditor({
  draft,
  onChange,
}: {
  draft: PatternDraft;
  onChange: (draft: PatternDraft) => void;
}) {
  return (
    <fieldset className="pe-look">
      <legend className="dc-repeat-label">時間</legend>
      <label className="pe-check">
        <input
          checked={draft.allDay}
          onChange={(event) =>
            onChange({ ...draft, allDay: event.target.checked })
          }
          type="checkbox"
        />
        時間なし（休みや明けなど）
      </label>
      {!draft.allDay && (
        <div className="dc-detail-time">
          <input
            aria-label="開始時刻"
            onChange={(event) =>
              onChange({ ...draft, start: event.target.value })
            }
            type="time"
            value={draft.start}
          />
          <span aria-hidden="true">–</span>
          <input
            aria-label="終了時刻"
            onChange={(event) =>
              onChange({ ...draft, end: event.target.value })
            }
            type="time"
            value={draft.end}
          />
        </div>
      )}
    </fieldset>
  );
}
