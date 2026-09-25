import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import { nextDayShifts, patterns, type Shift } from "./design-calendar";
import {
  BadgeLengthContext,
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
  useMarkColor,
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

type LookField = "symbol" | "symbol2" | "icon" | "emoji" | "color";

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
  couch: "ソファ",
  leaf: "葉っぱ",
  drop: "しずく",
  waves: "波",
  cat: "猫",
  dog: "犬",
  fish: "魚",
  tulip: "チューリップ",
  lotus: "蓮の花",
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

  const nextDay = others.find((other) => other.id === draft.nextDay);

  if (subPage === "look") {
    return (
      <LookPicker
        draft={draft}
        lookalike={others.find(
          (other) =>
            other[letterField] === draft[letterField] &&
            other.color === draft.color
        )}
        onBack={() => setSubPage(undefined)}
        onPick={pick}
      />
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
function LookPicker({
  draft,
  lookalike,
  onBack,
  onPick,
}: {
  draft: PatternDraft;
  lookalike: PatternDraft | undefined;
  onBack: () => void;
  onPick: (field: LookField, value: Partial<PatternDraft>) => void;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const [tab, setTab] = useState<ShiftMarkStyle>(style);
  return (
    <>
      <header className="st-page-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          {draft.name || "パターン"}
        </button>
        <h3 className="st-title">印と色</h3>
      </header>
      <div className="pe-preview pe-preview-center">
        <MarkGlyph look={draft} size={48} style={tab} />
      </div>
      <fieldset className="st-mark-segment">
        <legend className="dc-sr-only">どの見た目の印を選ぶか</legend>
        {(["icon", "emoji", "badge"] as const).map((option) => (
          <button
            aria-pressed={tab === option}
            key={option}
            onClick={() => setTab(option)}
            type="button"
          >
            <MarkGlyph look={draft} size={20} style={option} />
            {styleNames[option]}
          </button>
        ))}
      </fieldset>
      <LookEditor draft={draft} onPick={onPick} style={tab} />
      {tab !== "emoji" && <ColorPicker draft={draft} onPick={onPick} />}
      {tab === "badge" && lookalike && (
        <p className="pe-warning">
          「{lookalike.name}
          」と同じ見た目です。色か文字を変えると見分けやすくなります。
        </p>
      )}
      <p className="st-note">
        今の見た目は「{styleNames[style]}
        」です。ほかの見た目の印は名前から自動で決まっていて、見た目を切り替えたときに使われます。
      </p>
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
  const themeColor = useMarkColor("theme");
  return (
    <fieldset className="pe-colors">
      <legend className="dc-repeat-label pe-colors-label">色</legend>
      <button
        aria-pressed={draft.color === "theme"}
        className="pe-theme-color"
        onClick={() => onPick("color", { color: "theme" })}
        type="button"
      >
        <span
          aria-hidden="true"
          className="pe-theme-dot"
          style={{ background: themeColor.tint, color: themeColor.color }}
        />
        テーマカラーに合わせる
      </button>
      {markColors.map(({ name, color, tint }, index) => (
        <button
          aria-label={name}
          aria-pressed={draft.color === index}
          key={name}
          onClick={() => onPick("color", { color: index })}
          style={{ background: tint, color }}
          type="button"
        />
      ))}
    </fieldset>
  );
}

// Both texts sit side by side so switching the letter count holds no
// surprise; while the letter look is on, the one in use is marked.
function LetterEditor({
  draft,
  onPick,
}: {
  draft: PatternDraft;
  onPick: (field: LookField, value: Partial<PatternDraft>) => void;
}) {
  const { length } = useContext(BadgeLengthContext);
  // Only the letter look actually shows one of these.
  const lettersShown = useContext(ShiftMarkStyleContext) === "badge";
  const fields = [
    { field: "symbol", count: "one", label: "1文字", max: 1 },
    { field: "symbol2", count: "two", label: "2文字", max: 2 },
  ] as const;
  return (
    <fieldset className="pe-letters">
      <legend className="dc-repeat-label">文字</legend>
      {fields.map(({ field, count, label, max }) => {
        const inUse = lettersShown && length === count;
        return (
          <label
            className={`pe-letter ${inUse ? "pe-letter-in-use" : ""}`}
            key={field}
          >
            <input
              className="dc-detail-note pe-symbol"
              maxLength={max}
              onChange={(event) =>
                onPick(field, { [field]: event.target.value })
              }
              value={draft[field]}
            />
            <span className="pe-letter-label">
              {label}
              {inUse && "（使用中）"}
            </span>
          </label>
        );
      })}
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
  if (style === "badge") {
    return <LetterEditor draft={draft} onPick={onPick} />;
  }
  if (style === "icon") {
    return (
      <fieldset className="pe-grid">
        <legend className="dc-sr-only">アイコン</legend>
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
      </fieldset>
    );
  }
  return (
    <>
      <fieldset className="pe-grid">
        <legend className="dc-sr-only">絵文字</legend>
        {markEmojis.map((emoji) => (
          <button
            aria-pressed={draft.emoji === emoji}
            key={emoji}
            onClick={() => onPick("emoji", { emoji })}
            type="button"
          >
            <MarkGlyph look={{ ...draft, emoji }} size={20} style="emoji" />
          </button>
        ))}
      </fieldset>
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
  );
}
