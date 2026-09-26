import { ChevronLeft } from "lucide-react";
import { type ReactNode, useContext, useState } from "react";
import {
  type Look,
  MarkGlyph,
  type MarkIcon,
  markColors,
  markEmojis,
  markIcons,
  type ShiftMarkStyle,
  ShiftMarkStyleContext,
} from "./shift-mark";

// The parts of a look that someone picks; picked ones stop following the
// name when it changes.
export type LookField = "symbol" | "icon" | "emoji" | "color";

export const styleNames: Record<ShiftMarkStyle, string> = {
  emoji: "絵文字",
  badge: "文字",
  icon: "アイコン",
};

export const iconNames: Record<MarkIcon, string> = {
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

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

function firstGrapheme(value: string) {
  return graphemes.segment(value)[Symbol.iterator]().next().value?.segment;
}

// The letter just typed, which replaces the one already there.
function lastGrapheme(value: string) {
  return Array.from(graphemes.segment(value)).at(-1)?.segment;
}

const allIcons = Object.keys(markIcons) as MarkIcon[];

// One screen for choosing how something is marked in every style: shift
// patterns and groups alike. Each tab shows its own look, so what people
// on other styles see is never hidden.
export function LookEditorPage({
  title,
  back,
  look,
  icons = allIcons,
  emojis = markEmojis,
  onBack,
  onPick,
  children,
}: {
  title: string;
  back: string;
  look: Look;
  icons?: readonly MarkIcon[];
  emojis?: readonly string[];
  onBack: () => void;
  onPick: (field: LookField, value: Partial<Look>) => void;
  // Notes or warnings under the choices.
  children?: ReactNode;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const [tab, setTab] = useState<ShiftMarkStyle>(style);
  return (
    <>
      <header className="st-page-header">
        <button className="st-back" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" size={20} />
          {back}
        </button>
        <h3 className="st-title">{title}</h3>
      </header>
      <div className="pe-preview pe-preview-center">
        <LookGlyph look={look} size={48} style={tab} />
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
            <LookGlyph look={look} size={20} style={option} />
            {styleNames[option]}
          </button>
        ))}
      </fieldset>
      {tab === "icon" && <IconGrid icons={icons} look={look} onPick={onPick} />}
      {tab === "emoji" && (
        <EmojiGrid emojis={emojis} look={look} onPick={onPick} />
      )}
      {tab === "badge" && <LetterEditor look={look} onPick={onPick} />}
      {tab !== "emoji" && <ColorPicker look={look} onPick={onPick} />}
      {children}
      <p className="st-note">
        今の見た目は「{styleNames[style]}
        」です。ほかの見た目は、その見た目を選んだ人にこう表示されます。
      </p>
    </>
  );
}

// Without an emoji, the emoji style falls back to the letters.
export function LookGlyph({
  look,
  size,
  style,
}: {
  look: Look;
  size: number;
  style: ShiftMarkStyle;
}) {
  return (
    <MarkGlyph
      look={look}
      size={size}
      style={style === "emoji" && !look.emoji ? "badge" : style}
    />
  );
}

function IconGrid({
  look,
  icons,
  onPick,
}: {
  look: Look;
  icons: readonly MarkIcon[];
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  return (
    <fieldset className="pe-grid">
      <legend className="dc-sr-only">アイコン</legend>
      {icons.map((icon) => (
        <button
          aria-label={iconNames[icon]}
          aria-pressed={look.icon === icon}
          key={icon}
          onClick={() => onPick("icon", { icon })}
          type="button"
        >
          <MarkGlyph look={{ ...look, icon }} size={20} style="icon" />
        </button>
      ))}
    </fieldset>
  );
}

function EmojiGrid({
  look,
  emojis,
  onPick,
}: {
  look: Look;
  emojis: readonly string[];
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  return (
    <>
      <fieldset className="pe-grid">
        <legend className="dc-sr-only">絵文字</legend>
        {emojis.map((emoji) => (
          <button
            aria-pressed={look.emoji === emoji}
            key={emoji}
            onClick={() => onPick("emoji", { emoji })}
            type="button"
          >
            <MarkGlyph look={{ ...look, emoji }} size={20} style="emoji" />
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

// One letter, like a printed roster; the name can show under it.
function LetterEditor({
  look,
  onPick,
}: {
  look: Look;
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  return (
    <div className="st-list">
      <label className="st-row">
        <span className="st-row-label">文字</span>
        <input
          className="pe-inline-input"
          onChange={(event) => {
            const symbol = lastGrapheme(event.target.value);
            if (symbol) {
              onPick("symbol", { symbol });
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
          value={look.symbol}
        />
      </label>
    </div>
  );
}

function ColorPicker({
  look,
  onPick,
}: {
  look: Look;
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  return (
    <fieldset className="pe-colors">
      <legend className="dc-repeat-label pe-colors-label">色</legend>
      {markColors.map(({ name, color, tint }, index) => (
        <button
          aria-label={name}
          aria-pressed={look.color === index}
          key={name}
          onClick={() => onPick("color", { color: index })}
          style={{ background: tint, color }}
          type="button"
        />
      ))}
    </fieldset>
  );
}
