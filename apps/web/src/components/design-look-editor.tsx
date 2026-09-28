import { Plus } from "lucide-react";
import { useContext, useState } from "react";
import type { ReactNode } from "react";

import { EmojiPickerSheet } from "./design-emoji-picker";
import {
  Button,
  Choice,
  ChoiceGrid,
  colorGrid,
  fieldLabel,
  inlineInput,
  List,
  ListRow,
  markGrid,
  markPreview,
  Note,
  PageHeader,
  Segment,
  SegmentedControl,
} from "./design-ui";
import {
  MarkGlyph,
  MonochromeContext,
  useMarkColors,
  markEmojis,
  markIcons,
  ShiftMarkStyleContext,
} from "./shift-mark";
import type { Look, MarkIcon, ShiftMarkStyle } from "./shift-mark";

// The parts of a look that someone picks; picked ones stop following the
// name when it changes.
export type LookField = "symbol" | "icon" | "emoji" | "color";

export const styleNames: Record<ShiftMarkStyle, string> = {
  badge: "文字",
  emoji: "絵文字",
  icon: "アイコン",
};

export const iconNames: Record<MarkIcon, string> = {
  ambulance: "救急車",
  baby: "赤ちゃん",
  bed: "ベッド",
  book: "本",
  briefcase: "かばん",
  building: "ビル",
  bus: "バス",
  calendarCheck: "予定",
  car: "車",
  cat: "猫",
  clock: "時計",
  cloudMoon: "夜空",
  cloudSun: "晴れ",
  coffee: "コーヒー",
  couch: "ソファ",
  dog: "犬",
  drop: "しずく",
  dumbbell: "運動",
  fish: "魚",
  flame: "炎",
  flower: "花",
  graduationCap: "学位帽",
  heart: "ハート",
  hospital: "病院",
  house: "家",
  laptop: "パソコン",
  leaf: "葉っぱ",
  letter: "文字アイコン",
  lotus: "蓮の花",
  moon: "月",
  moonStar: "月と星",
  music: "音楽",
  partyPopper: "お祝い",
  phone: "電話",
  plane: "飛行機",
  shield: "盾",
  shoppingBag: "買い物",
  siren: "サイレン",
  sparkles: "きらきら",
  star: "星",
  stethoscope: "聴診器",
  sun: "太陽",
  sunMoon: "夕方",
  sunrise: "日の出",
  sunset: "夕日",
  syringe: "注射器",
  train: "電車",
  treePalm: "ヤシの木",
  tulip: "チューリップ",
  umbrella: "傘",
  users: "人たち",
  utensils: "食事",
  waves: "波",
};

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

// The letter just typed, which replaces the one already there.
function lastGrapheme(value: string) {
  return [...graphemes.segment(value)].at(-1)?.segment;
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
      <PageHeader back={back} onBack={onBack} title={title} />
      <div className={markPreview({ alone: true })}>
        <LookGlyph look={look} size={48} style={tab} />
      </div>
      <SegmentedControl
        label="どの見た目の印を選ぶか"
        onValueChange={setTab}
        value={tab}
      >
        {(["icon", "emoji", "badge"] as const).map((option) => (
          <Segment key={option} value={option}>
            <LookGlyph look={look} size={20} style={option} />
            {styleNames[option]}
          </Segment>
        ))}
      </SegmentedControl>
      {tab === "icon" && <IconGrid icons={icons} look={look} onPick={onPick} />}
      {tab === "emoji" && (
        <EmojiGrid emojis={emojis} look={look} onPick={onPick} />
      )}
      {tab === "badge" && <LetterEditor look={look} onPick={onPick} />}
      {tab !== "emoji" && <ColorPicker look={look} onPick={onPick} />}
      {children}
      <Note>
        今の見た目は「{styleNames[style]}
        」です。ほかの見た目は、その見た目を選んだ人にこう表示されます。
      </Note>
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
    <ChoiceGrid
      className={markGrid}
      label="アイコン"
      onValueChange={(icon) => {
        onPick("icon", { icon });
      }}
      value={look.icon ?? null}
    >
      {icons.map((icon) => (
        <Choice key={icon} label={iconNames[icon]} value={icon}>
          <MarkGlyph look={{ ...look, icon }} size={20} style="icon" />
        </Choice>
      ))}
    </ChoiceGrid>
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
  const [picking, setPicking] = useState(false);
  return (
    <>
      <ChoiceGrid
        className={markGrid}
        label="絵文字"
        onValueChange={(emoji) => {
          onPick("emoji", { emoji });
        }}
        value={look.emoji ?? null}
      >
        {withPicked(emojis, look.emoji).map((emoji) => (
          <Choice key={emoji} value={emoji}>
            <MarkGlyph look={{ ...look, emoji }} size={20} style="emoji" />
          </Choice>
        ))}
      </ChoiceGrid>
      <OtherEmojiButton
        onClick={() => {
          setPicking(true);
        }}
      />
      <EmojiPickerSheet
        onOpenChange={setPicking}
        onPick={(emoji) => {
          onPick("emoji", { emoji });
        }}
        open={picking}
      />
    </>
  );
}

// An emoji picked from every emoji leads the ones offered, so it shows as
// picked among them.
export function withPicked(emojis: readonly string[], picked?: string) {
  return picked && !emojis.includes(picked) ? [picked, ...emojis] : emojis;
}

// After the emoji offered, the way to every other one.
export function OtherEmojiButton({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} variant="quiet">
      <Plus aria-hidden="true" size={18} />
      ほかの絵文字を選ぶ
    </Button>
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
    <List>
      <ListRow
        label="文字"
        control={
          <>
            <input
              className={inlineInput}
              onChange={(event) => {
                const symbol = lastGrapheme(event.target.value);
                if (symbol) {
                  onPick("symbol", { symbol });
                }
              }}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              value={look.symbol}
            />
          </>
        }
      />
    </List>
  );
}

function ColorPicker({
  look,
  onPick,
}: {
  look: Look;
  onPick: (field: LookField, value: Partial<Look>) => void;
}) {
  const colors = useMarkColors();
  const { monochrome } = useContext(MonochromeContext);
  return (
    <>
      <ChoiceGrid
        className={colorGrid}
        label="色"
        labelClassName={fieldLabel({ place: "grid" })}
        onValueChange={(value) => {
          onPick("color", { color: Number(value) });
        }}
        value={String(look.color)}
      >
        {colors.map(({ name, color, tint }, index) => (
          <Choice
            key={name}
            label={name}
            style={{ background: tint, color }}
            value={String(index)}
          />
        ))}
      </ChoiceGrid>
      {/* In a one-color テーマ every mark takes the theme color, so say
          when this choice shows. */}
      {monochrome && (
        <Note>
          テーマを色分けのもの（標準・くすみ・紙）にすると、この色で表示されます。
        </Note>
      )}
    </>
  );
}
