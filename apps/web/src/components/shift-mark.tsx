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
import {
  Ambulance,
  Baby,
  Bed,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  CalendarCheck,
  Car,
  Clock,
  CloudMoon,
  CloudSun,
  Coffee,
  Dumbbell,
  Flame,
  Flower2,
  GraduationCap,
  Heart,
  Hospital,
  House,
  Laptop,
  Leaf,
  type LucideIcon,
  Moon,
  MoonStar,
  Music,
  PartyPopper,
  Phone,
  Plane,
  Shield,
  ShoppingBag,
  Siren,
  Sparkles,
  Star,
  Stethoscope,
  Sun,
  SunMoon,
  Sunrise,
  Sunset,
  Syringe,
  TrainFront,
  TreePalm,
  Umbrella,
  Users,
  Utensils,
} from "lucide-react";
import { createContext, useContext } from "react";
import type { DesignVariants } from "../lib/design-variants";
import { patterns, type Shift } from "./design-calendar";

export type ShiftMarkStyle = DesignVariants["shiftMark"];
export const ShiftMarkStyleContext = createContext<ShiftMarkStyle>("emoji");
// Lets the in-app setting change the look for the whole preview.
export const SetShiftMarkStyleContext = createContext<
  ((style: ShiftMarkStyle) => void) | undefined
>(undefined);

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

// "letter" draws the symbol inside a thin circle, so any shift has an icon.
export const markIcons = {
  letter: undefined,
  sun: Sun,
  cloudSun: CloudSun,
  sunrise: Sunrise,
  sunset: Sunset,
  sunMoon: SunMoon,
  moon: Moon,
  moonStar: MoonStar,
  cloudMoon: CloudMoon,
  leaf: Leaf,
  bed: Bed,
  coffee: Coffee,
  flower: Flower2,
  treePalm: TreePalm,
  umbrella: Umbrella,
  book: BookOpen,
  graduationCap: GraduationCap,
  briefcase: Briefcase,
  laptop: Laptop,
  building: Building2,
  house: House,
  users: Users,
  phone: Phone,
  clock: Clock,
  calendarCheck: CalendarCheck,
  hospital: Hospital,
  stethoscope: Stethoscope,
  syringe: Syringe,
  ambulance: Ambulance,
  siren: Siren,
  flame: Flame,
  shield: Shield,
  car: Car,
  bus: Bus,
  train: TrainFront,
  plane: Plane,
  baby: Baby,
  utensils: Utensils,
  shoppingBag: ShoppingBag,
  dumbbell: Dumbbell,
  music: Music,
  heart: Heart,
  star: Star,
  sparkles: Sparkles,
  partyPopper: PartyPopper,
} satisfies Record<string, LucideIcon | undefined>;
export type MarkIcon = keyof typeof markIcons;

// The same icons from Phosphor. It has one sun-on-the-horizon icon, so
// sunrise and dusk share it and the sunset uses a dim sun.
const phosphorIcons: Record<MarkIcon, PhosphorIcon | undefined> = {
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
};

export const IconSetContext =
  createContext<DesignVariants["iconSet"]>("phosphorDuotone");

const phosphorWeights = {
  phosphorRegular: "regular",
  phosphorDuotone: "duotone",
  phosphorFill: "fill",
} as const;

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
  symbol: string;
  icon: MarkIcon;
  color: number;
};

const shiftLooks: Record<Shift, Omit<Look, "emoji">> = {
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

export function lookOf(shift: Shift): Look {
  return { ...shiftLooks[shift], emoji: patterns[shift].emoji };
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
    symbol: [...name.trim()][0] ?? "",
    icon: hint?.icon ?? "letter",
    emoji: hint?.emoji ?? "⭐️",
  };
}

export function nextColor(used: number[]) {
  const free = markColors.findIndex((_, index) => !used.includes(index));
  return free === -1 ? used.length % markColors.length : free;
}

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
  if (style === "badge") {
    return (
      <span
        aria-hidden="true"
        className="sm-badge"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * (look.symbol.length > 1 ? 0.4 : 0.56)),
          color,
          background: tint,
        }}
      >
        {look.symbol}
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
  const iconSet = useContext(IconSetContext);
  const { color } = markColors[look.color];
  const PhIcon = phosphorIcons[look.icon];
  if (iconSet !== "lucide" && PhIcon) {
    return (
      <PhIcon
        aria-hidden="true"
        className="sm-icon"
        color={color}
        size={size}
        weight={phosphorWeights[iconSet]}
      />
    );
  }
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
      strokeWidth={1.9}
    />
  );
}

export function ShiftMark({ shift, size }: { shift: Shift; size: number }) {
  const style = useContext(ShiftMarkStyleContext);
  return <MarkGlyph look={lookOf(shift)} size={size} style={style} />;
}
