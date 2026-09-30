import { markColorIn, markColors } from "@pochical/design/colors";
import {
  markPalette,
  THEME_SLOT,
  themeMarkColor,
} from "@pochical/design/themes";
import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { css, cx } from "styled-system/css";

import { usePatterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { markIconPaths } from "../lib/mark-icon-paths";
import type { MarkIconName } from "../lib/mark-icon-paths";
import { presetOf, ThemeContext, useColorScheme } from "./design-theme";

export type ShiftMarkStyle = "icon" | "emoji" | "badge";
export const ShiftMarkStyleContext = createContext<ShiftMarkStyle>("icon");

// Whether calendar cells print the shift name under the mark, per look.
export type CellNames = Record<ShiftMarkStyle, boolean>;
export const defaultCellNames: CellNames = {
  badge: false,
  emoji: false,
  icon: false,
};
// 早出 and 残業 belong to the shift, not to a day on one calendar: groups
// see them too, wherever the mark is drawn and at whatever size. So they
// are drawn on the mark itself, as a small triangle in its top corner that
// still reads at 16px, where words would not: the start of the day at the
// left, the end at the right. Inside the mark's box, it never reaches a
// neighbor in a narrow group table.
function TimeSide({ side }: { side: "early" | "late" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(glyphStyle.time, glyphStyle[side])}
    />
  );
}

const markFont = '-apple-system, "Hiragino Kaku Gothic ProN", sans-serif';

// The mark's kinds, and 早出 and 残業 on it. `sm-icon` stays on the icon as
// a hook: a picked pattern's pill turns its fill white.
const glyphStyle = {
  badge: css({
    borderRadius: "28%",
    display: "inline-grid",
    flexShrink: 0,
    fontFamily: markFont,
    fontWeight: 700,
    lineHeight: 1,
    placeItems: "center",
  }),
  early: css({ clipPath: "polygon(0 0, 100% 0, 0 100%)", left: "-2px" }),
  emoji: css({
    fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", sans-serif',
    lineHeight: 1,
  }),
  icon: css({ flexShrink: 0 }),
  late: css({ clipPath: "polygon(0 0, 100% 0, 100% 100%)", right: "-2px" }),
  letter: css({
    border: "1.7px solid currentcolor",
    borderRadius: "50%",
    display: "inline-grid",
    flexShrink: 0,
    fontFamily: markFont,
    fontWeight: 600,
    lineHeight: 1,
    placeItems: "center",
  }),
  time: css({
    bg: "text.secondary",
    height: "calc(var(--sm-size) * 0.32)",
    position: "absolute",
    top: "-2px",
    width: "calc(var(--sm-size) * 0.32)",
  }),
  timed: css({ display: "inline-flex", position: "relative" }),
};

export const CellNamesContext = createContext<{
  names: CellNames;
}>({ names: defaultCellNames });

// Whether days off get a tint of their pattern color, per look. Unset means
// on, except for emoji, which bring their own colors; each look's own
// starting value is in the settings store.
export type OffHighlight = Partial<Record<ShiftMarkStyle, boolean>>;
export const defaultOffHighlight: OffHighlight = {};

export function useOffHighlight(style: ShiftMarkStyle) {
  const { highlight } = useContext(OffHighlightContext);
  return highlight[style] ?? style !== "emoji";
}

// Every look setting at once: the style and its switches. `fill` only
// matters for icons; letters always sit on their tile and emoji have none.
export type LookSettings = {
  style: ShiftMarkStyle;
  fill: boolean;
  names: boolean;
  highlight: boolean;
  // Days off left empty on your own month, for a calm, paper-like look.
  blankOff: boolean;
};

// How days off show on your own month. "blank" leaves them empty while
// viewing; entering shifts and the week view need to tell a day off from a
// day not entered yet, so there they come back "faint".
export type OffDisplay = "show" | "blank" | "faint";
export const OffDisplayContext = createContext<OffDisplay>("show");

// A look with every switch where it starts, for the sample members.
export const baseLook: LookSettings = {
  blankOff: false,
  fill: true,
  highlight: true,
  names: false,
  style: "icon",
};

// Looks the sample members use, by name.
export const sampleLooks = {
  friendly: { ...baseLook, names: true, style: "badge" },
  minimal: { ...baseLook, fill: false, highlight: false },
  natural: baseLook,
  pop: { ...baseLook, highlight: false, style: "emoji" },
  roster: { ...baseLook, highlight: false, style: "badge" },
} satisfies Record<string, LookSettings>;

export const OffHighlightContext = createContext<{
  highlight: OffHighlight;
}>({ highlight: defaultOffHighlight });

type MarkIconComponent = (props: {
  className?: string;
  color?: string;
  size: number;
  weight?: IconWeight;
}) => ReactNode;

// A Phosphor icon drawn from its paths in lib/mark-icon-paths.ts, as
// Phosphor's own component would draw it.
function phosphorIcon(name: MarkIconName): MarkIconComponent {
  return function PhosphorIcon({
    className,
    color = "currentColor",
    size,
    weight = "regular",
  }) {
    return (
      <svg
        aria-hidden="true"
        className={className}
        fill={color}
        height={size}
        viewBox="0 0 256 256"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        {markIconPaths[name][weight].map(({ d, opacity }) => (
          <path d={d} key={d} opacity={opacity} />
        ))}
      </svg>
    );
  };
}

// Phosphor duotone icons. "letter" draws the symbol inside a thin circle, so
// any shift has an icon. Phosphor has one sun-on-the-horizon icon, so sunrise
// and dusk share it and the sunset uses a dim sun.
export const markIcons = {
  ambulance: phosphorIcon("Ambulance"),
  baby: phosphorIcon("Baby"),
  bed: phosphorIcon("Bed"),
  book: phosphorIcon("BookOpen"),
  briefcase: phosphorIcon("Briefcase"),
  building: phosphorIcon("Buildings"),
  bus: phosphorIcon("Bus"),
  calendarCheck: phosphorIcon("CalendarCheck"),
  car: phosphorIcon("Car"),
  cat: phosphorIcon("Cat"),
  clock: phosphorIcon("Clock"),
  cloudMoon: phosphorIcon("CloudMoon"),
  cloudSun: phosphorIcon("CloudSun"),
  coffee: phosphorIcon("Coffee"),
  couch: phosphorIcon("Couch"),
  dog: phosphorIcon("Dog"),
  drop: phosphorIcon("Drop"),
  dumbbell: phosphorIcon("Barbell"),
  fish: phosphorIcon("Fish"),
  flame: phosphorIcon("Fire"),
  flower: phosphorIcon("Flower"),
  graduationCap: phosphorIcon("GraduationCap"),
  heart: phosphorIcon("Heart"),
  hospital: phosphorIcon("Hospital"),
  house: phosphorIcon("House"),
  laptop: phosphorIcon("Laptop"),
  leaf: phosphorIcon("Leaf"),
  letter: undefined,
  lotus: phosphorIcon("FlowerLotus"),
  moon: phosphorIcon("Moon"),
  moonStar: phosphorIcon("MoonStars"),
  music: phosphorIcon("MusicNote"),
  partyPopper: phosphorIcon("Confetti"),
  phone: phosphorIcon("Phone"),
  plane: phosphorIcon("Airplane"),
  shield: phosphorIcon("Shield"),
  shoppingBag: phosphorIcon("ShoppingBag"),
  siren: phosphorIcon("Siren"),
  sparkles: phosphorIcon("Sparkle"),
  star: phosphorIcon("Star"),
  stethoscope: phosphorIcon("Stethoscope"),
  sun: phosphorIcon("Sun"),
  sunMoon: phosphorIcon("SunHorizon"),
  sunrise: phosphorIcon("SunHorizon"),
  sunset: phosphorIcon("SunDim"),
  syringe: phosphorIcon("Syringe"),
  train: phosphorIcon("Train"),
  treePalm: phosphorIcon("TreePalm"),
  tulip: phosphorIcon("FlowerTulip"),
  umbrella: phosphorIcon("Umbrella"),
  users: phosphorIcon("Users"),
  utensils: phosphorIcon("ForkKnife"),
  waves: phosphorIcon("Waves"),
} satisfies Record<string, MarkIconComponent | undefined>;
export type MarkIcon = keyof typeof markIcons;

export const markEmojis = [
  "☀️",
  "🌤️",
  "🌅",
  "🌇",
  "🌆",
  "🌙",
  "🌛",
  "🌜",
  "🌃",
  "⭐️",
  "🛋️",
  "🌿",
  "💧",
  "🌊",
  "🍂",
  "🐈‍⬛",
  "🐕",
  "🐟",
  "🪻",
  "🍀",
  "🌷",
  "🌸",
  "🌈",
  "☕️",
  "🛌",
  "😴",
  "📚",
  "✏️",
  "🎓",
  "💼",
  "💻",
  "🏠",
  "🏥",
  "💉",
  "🚑",
  "🚒",
  "🚓",
  "📞",
  "🚗",
  "✈️",
  "🍙",
  "🍜",
  "🎵",
  "💪",
  "❤️",
  "🎉",
  "🐰",
  "🐢",
];

export type Look = {
  emoji: string;
  // One letter for the letter look; the name can show under it.
  symbol: string;
  icon: MarkIcon;
  color: MarkColor;
};

// An index into the palette below.
export type MarkColor = number;

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

function firstLetter(name: string) {
  return (
    graphemes.segment(name.trim())[Symbol.iterator]().next().value?.segment ??
    ""
  );
}

// Longer words first, so 待機 wins over a single-letter match.
const lookHints: {
  words: string[];
  icon: Look["icon"];
  emoji: string;
}[] = [
  { emoji: "📞", icon: "phone", words: ["待機", "オンコール"] },
  { emoji: "🏠", icon: "house", words: ["在宅", "テレワーク"] },
  { emoji: "💼", icon: "briefcase", words: ["出張"] },
  { emoji: "💼", icon: "users", words: ["会議", "ミーティング"] },
  { emoji: "📚", icon: "book", words: ["研修", "勉強", "講習", "学校"] },
  { emoji: "🚒", icon: "siren", words: ["当番", "当直"] },
  { emoji: "🛌", icon: "bed", words: ["非番"] },
  { emoji: "🌷", icon: "flower", words: ["有休", "有給", "年休"] },
  { emoji: "🌅", icon: "sunrise", words: ["明け"] },
  { emoji: "🌆", icon: "sunMoon", words: ["夕"] },
  { emoji: "🌜", icon: "cloudMoon", words: ["準夜"] },
  { emoji: "🌙", icon: "moon", words: ["深夜", "夜"] },
  { emoji: "🌤️", icon: "cloudSun", words: ["早"] },
  { emoji: "🌇", icon: "sunset", words: ["遅"] },
  { emoji: "🌿", icon: "leaf", words: ["休", "公"] },
  { emoji: "☀️", icon: "sun", words: ["日", "昼"] },
];

// Fills in a look from the name alone; the letter icon and a star cover
// names the hints do not know.
export function guessLook(name: string): Omit<Look, "color"> {
  const hint = lookHints.find(({ words }) =>
    words.some((word) => name.includes(word))
  );
  return {
    emoji: hint?.emoji ?? "⭐️",
    icon: hint?.icon ?? "letter",
    symbol: firstLetter(name),
  };
}

// All shift colors for the current light or dark mode, in picker order;
// the first is the テーマ's own (THEME_SLOT).
export function useMarkColors() {
  return markPalette(
    presetOf(useContext(ThemeContext).theme),
    useColorScheme()
  );
}

export function useMarkColor(markColor: MarkColor) {
  const scheme = useColorScheme();
  const preset = presetOf(useContext(ThemeContext).theme);
  const option = markColors[markColor];
  return markColor === THEME_SLOT || !option
    ? themeMarkColor(preset, scheme)
    : markColorIn(option, scheme, preset.vividness);
}

// The theme's own color, for its slot and for marks drawn all in one color.
function useThemeMarkColor() {
  return themeMarkColor(
    presetOf(useContext(ThemeContext).theme),
    useColorScheme()
  );
}

// On when the viewer's テーマ draws every shift in its one color:
// icons and letters, everyone's alike, take the theme color instead of each
// pattern's own. Emoji keep their colors, so it does not apply to them.
export const MonochromeContext = createContext<{ monochrome: boolean }>({
  monochrome: false,
});

// The color a mark is drawn in, after the theme-only setting.
export function useDisplayColor(markColor: MarkColor) {
  const { monochrome } = useContext(MonochromeContext);
  const style = useContext(ShiftMarkStyleContext);
  const own = useMarkColor(markColor);
  const theme = useThemeMarkColor();
  return monochrome && style !== "emoji" ? theme : own;
}

// The fill setting: icons get a tinted fill (Phosphor duotone) or just the
// outline. Letters without their tile would read as stray text, so they
// always keep it.
export type IconWeight = "duotone" | "regular";
export const IconWeightContext = createContext<IconWeight>("duotone");

export function nextColor(used: MarkColor[]) {
  const free = markColors.findIndex((_, index) => !used.includes(index));
  return free === -1 ? used.length % markColors.length : free;
}

export function MarkGlyph({
  look,
  style,
  size,
  early = false,
  late = false,
}: {
  look: Look;
  style: ShiftMarkStyle;
  size: number;
  // 早出 and 残業 on this day, drawn on the mark's sides.
  early?: boolean;
  late?: boolean;
}) {
  const glyph = <BareGlyph look={look} size={size} style={style} />;
  if (!(early || late)) {
    return glyph;
  }
  return (
    <span
      className={glyphStyle.timed}
      style={{ "--sm-size": `${size}px` } as CSSProperties}
    >
      {early && <TimeSide side="early" />}
      {glyph}
      {late && <TimeSide side="late" />}
    </span>
  );
}

function BareGlyph({
  look,
  style,
  size,
}: {
  look: Look;
  style: ShiftMarkStyle;
  size: number;
}) {
  const { color, tint } = useDisplayColor(look.color);
  if (style === "badge") {
    return (
      <span
        aria-hidden="true"
        className={glyphStyle.badge}
        style={{
          background: tint,
          color,
          fontSize: Math.round(size * 0.56),
          height: size,
          minWidth: size,
        }}
      >
        {look.symbol}
      </span>
    );
  }
  if (style === "icon") {
    return <IconGlyph icon={look.icon} look={look} size={size} />;
  }
  return (
    <span
      aria-hidden="true"
      className={glyphStyle.emoji}
      style={{ fontSize: size }}
    >
      {look.emoji}
    </span>
  );
}

function IconGlyph({
  look,
  icon,
  size,
}: {
  look: Look;
  icon: MarkIcon;
  size: number;
}) {
  const { color } = useDisplayColor(look.color);
  const weight = useContext(IconWeightContext);
  const Icon = markIcons[icon];
  if (!Icon) {
    return (
      <span
        aria-hidden="true"
        className={glyphStyle.letter}
        style={{
          color,
          fontSize: Math.round(size * (look.symbol.length > 1 ? 0.36 : 0.5)),
          height: size,
          width: size,
        }}
      >
        {look.symbol}
      </span>
    );
  }
  return (
    <Icon
      className={cx(glyphStyle.icon, "sm-icon")}
      color={color}
      size={size}
      weight={weight}
    />
  );
}

export function ShiftMark({
  shift,
  size,
  early,
  late,
}: {
  shift: Shift;
  size: number;
  early?: boolean;
  late?: boolean;
}) {
  const style = useContext(ShiftMarkStyleContext);
  const pattern = usePatterns()[shift];
  if (!pattern) {
    return null;
  }
  return (
    <MarkGlyph
      early={early}
      late={late}
      look={pattern}
      size={size}
      style={style}
    />
  );
}
