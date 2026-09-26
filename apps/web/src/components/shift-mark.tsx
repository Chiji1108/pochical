import {
  Airplane as PhAirplane,
  Ambulance as PhAmbulance,
  Baby as PhBaby,
  Barbell as PhBarbell,
  Bed as PhBed,
  BookOpen as PhBookOpen,
  Briefcase as PhBriefcase,
  Buildings as PhBuildings,
  Bus as PhBus,
  CalendarCheck as PhCalendarCheck,
  Car as PhCar,
  Cat as PhCat,
  Clock as PhClock,
  CloudMoon as PhCloudMoon,
  CloudSun as PhCloudSun,
  Coffee as PhCoffee,
  Confetti as PhConfetti,
  Couch as PhCouch,
  Dog as PhDog,
  Drop as PhDrop,
  Fire as PhFire,
  Fish as PhFish,
  Flower as PhFlower,
  FlowerLotus as PhFlowerLotus,
  FlowerTulip as PhFlowerTulip,
  ForkKnife as PhForkKnife,
  GraduationCap as PhGraduationCap,
  Heart as PhHeart,
  Hospital as PhHospital,
  House as PhHouse,
  Laptop as PhLaptop,
  Leaf as PhLeaf,
  Moon as PhMoon,
  MoonStars as PhMoonStars,
  MusicNote as PhMusicNote,
  type Icon as PhosphorIcon,
  Phone as PhPhone,
  Shield as PhShield,
  ShoppingBag as PhShoppingBag,
  Siren as PhSiren,
  Sparkle as PhSparkle,
  Star as PhStar,
  Stethoscope as PhStethoscope,
  Sun as PhSun,
  SunDim as PhSunDim,
  SunHorizon as PhSunHorizon,
  Syringe as PhSyringe,
  Train as PhTrain,
  TreePalm as PhTreePalm,
  Umbrella as PhUmbrella,
  Users as PhUsers,
  Waves as PhWaves,
} from "@phosphor-icons/react";
import { createContext, useContext } from "react";
import { patterns, type Shift } from "./design-calendar";
import { ThemeContext, type ThemeId, themeOf } from "./design-theme";

export type ShiftMarkStyle = "icon" | "emoji" | "badge";
export const ShiftMarkStyleContext = createContext<ShiftMarkStyle>("icon");
// Lets the in-app setting change the look for the whole preview.
export const SetShiftMarkStyleContext = createContext<
  ((style: ShiftMarkStyle) => void) | undefined
>(undefined);

// Whether calendar cells print the shift name under an emoji or icon. The
// letter look is a name already, so it has no switch.
export type CellNames = { emoji: boolean; icon: boolean };
export const defaultCellNames: CellNames = { emoji: false, icon: false };
export const CellNamesContext = createContext<{
  names: CellNames;
  setNames?: (names: CellNames) => void;
}>({ names: defaultCellNames });

// Whether days off get a tint of their pattern color, per look. Unset means
// automatic: on, except letters on a tinted tile, which carry the color
// already.
export type OffHighlight = Partial<Record<ShiftMarkStyle, boolean>>;
export const defaultOffHighlight: OffHighlight = {};

export function useOffHighlight(style: ShiftMarkStyle) {
  const { highlight } = useContext(OffHighlightContext);
  return highlight[style] ?? true;
}

// Every look setting at once. Presets set good combinations; the switches
// under 細かく設定 change one thing each, which makes a custom look.
export type LookSettings = {
  style: ShiftMarkStyle;
  fill: boolean;
  monochrome: boolean;
  names: boolean;
  highlight: boolean;
  badgeLength: BadgeLength;
};

const baseLook: LookSettings = {
  style: "icon",
  fill: true,
  monochrome: false,
  names: false,
  highlight: true,
  badgeLength: "one",
};

// Ready-made styles: a theme color, a mark for 休み and a look that suit
// each other.
export const stylePresets: {
  id: string;
  name: string;
  theme: ThemeId;
  look: LookSettings;
}[] = [
  { id: "natural", name: "ナチュラル", theme: "moss", look: baseLook },
  {
    id: "monotone",
    name: "モノトーン",
    theme: "sumi",
    look: { ...baseLook, monochrome: true },
  },
  {
    id: "minimal",
    name: "ミニマル",
    theme: "sumi",
    look: {
      ...baseLook,
      fill: false,
      monochrome: true,
      highlight: false,
    },
  },
  {
    id: "pop",
    name: "ポップ",
    theme: "moss",
    look: { ...baseLook, style: "emoji" },
  },
  {
    id: "roster",
    name: "勤務表",
    theme: "moss",
    look: { ...baseLook, style: "badge", highlight: false },
  },
  {
    id: "friendly",
    name: "親しみ",
    theme: "moss",
    look: { ...baseLook, style: "badge", badgeLength: "two", fill: false },
  },
];

// A theme and look together, like the last custom style.
export type StyleChoice = { theme: ThemeId; look: LookSettings };

export const LookSettingsContext = createContext<{
  look: LookSettings;
  setLook?: (look: LookSettings) => void;
  custom?: StyleChoice;
  setCustom?: (custom: StyleChoice) => void;
}>({ look: baseLook });

// Compares only what shows for the look, so an emoji look is not "custom"
// just because of a fill setting it never uses.
function sameLook(preset: LookSettings, look: LookSettings) {
  if (preset.style !== look.style || preset.highlight !== look.highlight) {
    return false;
  }
  if (look.style === "emoji") {
    return preset.names === look.names;
  }
  const sameColor =
    preset.fill === look.fill && preset.monochrome === look.monochrome;
  if (look.style === "icon") {
    return sameColor && preset.names === look.names;
  }
  return sameColor && preset.badgeLength === look.badgeLength;
}

export function stylePresetOf(theme: ThemeId, look: LookSettings) {
  return stylePresets.find(
    (preset) => preset.theme === theme && sameLook(preset.look, look)
  );
}

export const OffHighlightContext = createContext<{
  highlight: OffHighlight;
  setHighlight?: (highlight: OffHighlight) => void;
}>({ highlight: defaultOffHighlight });

// Twelve muted colors that sit with the moss green theme: text color and a
// light tint for the badge background.
export const markColors = [
  { name: "モス", color: "#486444", tint: "#e4ecdf" },
  { name: "からし", color: "#8a6d1a", tint: "#f3ead0" },
  { name: "オレンジ", color: "#95602e", tint: "#f5e4d2" },
  { name: "テラコッタ", color: "#93503a", tint: "#f3dfd6" },
  { name: "赤", color: "#9b3f35", tint: "#f4dcd8" },
  { name: "ローズ", color: "#8d4a5a", tint: "#f2e0e4" },
  { name: "すみれ", color: "#75497a", tint: "#eee1ef" },
  { name: "ラベンダー", color: "#5f4f86", tint: "#e8e2f0" },
  { name: "藍", color: "#4a5388", tint: "#e3e6f2" },
  { name: "紺", color: "#3d4a73", tint: "#dde2ee" },
  { name: "青緑", color: "#36706c", tint: "#dcebea" },
  { name: "グレー", color: "#56636d", tint: "#e3e7ea" },
] as const;

// Phosphor duotone icons. "letter" draws the symbol inside a thin circle, so
// any shift has an icon. Phosphor has one sun-on-the-horizon icon, so sunrise
// and dusk share it and the sunset uses a dim sun.
export const markIcons = {
  letter: undefined,
  sun: PhSun,
  cloudSun: PhCloudSun,
  sunrise: PhSunHorizon,
  sunset: PhSunDim,
  sunMoon: PhSunHorizon,
  moon: PhMoon,
  moonStar: PhMoonStars,
  cloudMoon: PhCloudMoon,
  couch: PhCouch,
  leaf: PhLeaf,
  drop: PhDrop,
  waves: PhWaves,
  cat: PhCat,
  dog: PhDog,
  fish: PhFish,
  tulip: PhFlowerTulip,
  lotus: PhFlowerLotus,
  bed: PhBed,
  coffee: PhCoffee,
  flower: PhFlower,
  treePalm: PhTreePalm,
  umbrella: PhUmbrella,
  book: PhBookOpen,
  graduationCap: PhGraduationCap,
  briefcase: PhBriefcase,
  laptop: PhLaptop,
  building: PhBuildings,
  house: PhHouse,
  users: PhUsers,
  phone: PhPhone,
  clock: PhClock,
  calendarCheck: PhCalendarCheck,
  hospital: PhHospital,
  stethoscope: PhStethoscope,
  syringe: PhSyringe,
  ambulance: PhAmbulance,
  siren: PhSiren,
  flame: PhFire,
  shield: PhShield,
  car: PhCar,
  bus: PhBus,
  train: PhTrain,
  plane: PhAirplane,
  baby: PhBaby,
  utensils: PhForkKnife,
  shoppingBag: PhShoppingBag,
  dumbbell: PhBarbell,
  music: PhMusicNote,
  heart: PhHeart,
  star: PhStar,
  sparkles: PhSparkle,
  partyPopper: PhConfetti,
} satisfies Record<string, PhosphorIcon | undefined>;
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
  // One- and two-letter text for the letter look; the setting picks which.
  symbol: string;
  symbol2: string;
  icon: MarkIcon;
  color: MarkColor;
};

// An index into the palette below.
export type MarkColor = number;

const shiftLooks: Record<Shift, Omit<Look, "emoji" | "symbol2">> = {
  day: { symbol: "日", icon: "sun", color: 1 },
  night: { symbol: "夜", icon: "moon", color: 8 },
  after: { symbol: "明", icon: "sunrise", color: 3 },
  off: { symbol: "休", icon: "leaf", color: 0 },
  early: { symbol: "早", icon: "cloudSun", color: 2 },
  late: { symbol: "遅", icon: "cloudMoon", color: 4 },
  training: { symbol: "研", icon: "book", color: 10 },
  paid: { symbol: "有", icon: "flower", color: 5 },
  duty: { symbol: "当", icon: "siren", color: 4 },
  offDuty: { symbol: "非", icon: "bed", color: 11 },
  evening: { symbol: "夕", icon: "sunMoon", color: 2 },
  junya: { symbol: "準", icon: "cloudMoon", color: 7 },
  midnight: { symbol: "深", icon: "moonStar", color: 9 },
};

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

function leadingLetters(name: string, count: number) {
  return Array.from(graphemes.segment(name.trim()), ({ segment }) => segment)
    .slice(0, count)
    .join("");
}

export function lookOf(shift: Shift): Look {
  return {
    ...shiftLooks[shift],
    symbol2: leadingLetters(patterns[shift].label, 2),
    emoji: patterns[shift].emoji,
  };
}

// Longer words first, so 待機 wins over a single-letter match.
const lookHints: {
  words: string[];
  icon: Look["icon"];
  emoji: string;
}[] = [
  { words: ["待機", "オンコール"], icon: "phone", emoji: "📞" },
  { words: ["在宅", "テレワーク"], icon: "house", emoji: "🏠" },
  { words: ["出張"], icon: "briefcase", emoji: "💼" },
  { words: ["会議", "ミーティング"], icon: "users", emoji: "💼" },
  { words: ["研修", "勉強", "講習", "学校"], icon: "book", emoji: "📚" },
  { words: ["当番", "当直"], icon: "siren", emoji: "🚒" },
  { words: ["非番"], icon: "bed", emoji: "🛌" },
  { words: ["有休", "有給", "年休"], icon: "flower", emoji: "🌷" },
  { words: ["明け"], icon: "sunrise", emoji: "🌅" },
  { words: ["夕"], icon: "sunMoon", emoji: "🌆" },
  { words: ["準夜"], icon: "cloudMoon", emoji: "🌜" },
  { words: ["深夜", "夜"], icon: "moon", emoji: "🌙" },
  { words: ["早"], icon: "cloudSun", emoji: "🌤️" },
  { words: ["遅"], icon: "sunset", emoji: "🌇" },
  { words: ["休", "公"], icon: "leaf", emoji: "🌿" },
  { words: ["日", "昼"], icon: "sun", emoji: "☀️" },
];

// Fills in a look from the name alone; the letter icon and a star cover
// names the hints do not know.
export function guessLook(name: string): Omit<Look, "color"> {
  const hint = lookHints.find(({ words }) =>
    words.some((word) => name.includes(word))
  );
  return {
    symbol: leadingLetters(name, 1),
    symbol2: leadingLetters(name, 2),
    icon: hint?.icon ?? "letter",
    emoji: hint?.emoji ?? "⭐️",
  };
}

export function useMarkColor(markColor: MarkColor) {
  return markColors[markColor] ?? markColors[0];
}

// The theme's own color, for marks drawn all in one color.
function useThemeMarkColor() {
  const theme = themeOf(useContext(ThemeContext).theme);
  return { name: "テーマカラー", color: theme.accent, tint: theme.markTint };
}

// When on, icons and letters all take the theme color instead of each
// pattern's own; emoji keep their colors, so it does not apply to them.
export const MonochromeContext = createContext<{
  monochrome: boolean;
  setMonochrome?: (monochrome: boolean) => void;
}>({ monochrome: false });

// The color a mark is drawn in, after the theme-only setting.
export function useDisplayColor(markColor: MarkColor) {
  const { monochrome } = useContext(MonochromeContext);
  const style = useContext(ShiftMarkStyleContext);
  const own = useMarkColor(markColor);
  const theme = useThemeMarkColor();
  return monochrome && style !== "emoji" ? theme : own;
}

// The fill setting: icons get a tinted fill (Phosphor duotone) or just the
// outline, and letters sit on a tinted tile or stand alone.
export type IconWeight = "duotone" | "regular";
export const IconWeightContext = createContext<IconWeight>("duotone");
// Until the person picks one, the fill follows the color setting: filled for
// per-shift colors, outline only when everything is the theme color.
export const SetIconWeightContext = createContext<
  ((weight: IconWeight) => void) | undefined
>(undefined);

export function nextColor(used: MarkColor[]) {
  const free = markColors.findIndex((_, index) => !used.includes(index));
  return free === -1 ? used.length % markColors.length : free;
}

// Whether the letter look shows each pattern's one- or two-letter text; the
// two-letter one sits on a slightly wider tile.
export type BadgeLength = "one" | "two";
export const BadgeLengthContext = createContext<{
  length: BadgeLength;
  setLength?: (length: BadgeLength) => void;
}>({ length: "one" });

export function MarkGlyph({
  look,
  style,
  size,
}: {
  look: Look;
  style: ShiftMarkStyle;
  size: number;
}) {
  const { color, tint } = useDisplayColor(look.color);
  const { length: badgeLength } = useContext(BadgeLengthContext);
  // The fill setting also decides whether letters sit on a tinted tile.
  const filled = useContext(IconWeightContext) === "duotone";
  if (style === "badge") {
    const text = badgeLength === "two" ? look.symbol2 : look.symbol;
    const wide = [...text].length > 1;
    return (
      <span
        aria-hidden="true"
        className={`sm-badge ${wide ? "sm-badge-wide" : ""} ${filled ? "" : "sm-badge-plain"}`}
        style={{
          minWidth: size,
          height: size,
          fontSize: Math.round(size * (wide ? 0.44 : 0.56)),
          color,
          background: filled ? tint : "transparent",
        }}
      >
        {text}
      </span>
    );
  }
  if (style === "icon") {
    return <IconGlyph icon={look.icon} look={look} size={size} />;
  }
  return (
    <span aria-hidden="true" className="sm-emoji" style={{ fontSize: size }}>
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
        className="sm-letter"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * (look.symbol.length > 1 ? 0.36 : 0.5)),
          color,
        }}
      >
        {look.symbol}
      </span>
    );
  }
  return (
    <Icon
      aria-hidden="true"
      className="sm-icon"
      color={color}
      size={size}
      weight={weight}
    />
  );
}

export function ShiftMark({ shift, size }: { shift: Shift; size: number }) {
  const style = useContext(ShiftMarkStyleContext);
  return <MarkGlyph look={lookOf(shift)} size={size} style={style} />;
}
