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
  Clock as PhClock,
  CloudMoon as PhCloudMoon,
  CloudSun as PhCloudSun,
  Coffee as PhCoffee,
  Confetti as PhConfetti,
  Fire as PhFire,
  Flower as PhFlower,
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
} from "@phosphor-icons/react";
import { createContext, useContext } from "react";
import { patterns, type Shift } from "./design-calendar";

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
  leaf: PhLeaf,
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
  "🌿",
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
  color: number;
};

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
const lookHints: { words: string[]; icon: MarkIcon; emoji: string }[] = [
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

export function nextColor(used: number[]) {
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
  const { color, tint } = markColors[look.color];
  const { length: badgeLength } = useContext(BadgeLengthContext);
  if (style === "badge") {
    const text = badgeLength === "two" ? look.symbol2 : look.symbol;
    const wide = [...text].length > 1;
    return (
      <span
        aria-hidden="true"
        className={`sm-badge ${wide ? "sm-badge-wide" : ""}`}
        style={{
          minWidth: size,
          height: size,
          fontSize: Math.round(size * (wide ? 0.44 : 0.56)),
          color,
          background: tint,
        }}
      >
        {text}
      </span>
    );
  }
  if (style === "icon") {
    return <IconGlyph look={look} size={size} />;
  }
  return (
    <span aria-hidden="true" className="sm-emoji" style={{ fontSize: size }}>
      {look.emoji}
    </span>
  );
}

function IconGlyph({ look, size }: { look: Look; size: number }) {
  const { color } = markColors[look.color];
  const Icon = markIcons[look.icon];
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
      weight="duotone"
    />
  );
}

export function ShiftMark({ shift, size }: { shift: Shift; size: number }) {
  const style = useContext(ShiftMarkStyleContext);
  return <MarkGlyph look={lookOf(shift)} size={size} style={style} />;
}
