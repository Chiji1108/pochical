import {
  AirplaneIcon as PhAirplane,
  AmbulanceIcon as PhAmbulance,
  BabyIcon as PhBaby,
  BarbellIcon as PhBarbell,
  BedIcon as PhBed,
  BookOpenIcon as PhBookOpen,
  BriefcaseIcon as PhBriefcase,
  BuildingsIcon as PhBuildings,
  BusIcon as PhBus,
  CalendarCheckIcon as PhCalendarCheck,
  CarIcon as PhCar,
  CatIcon as PhCat,
  ClockIcon as PhClock,
  CloudMoonIcon as PhCloudMoon,
  CloudSunIcon as PhCloudSun,
  CoffeeIcon as PhCoffee,
  ConfettiIcon as PhConfetti,
  CouchIcon as PhCouch,
  DogIcon as PhDog,
  DropIcon as PhDrop,
  FireIcon as PhFire,
  FishIcon as PhFish,
  FlowerIcon as PhFlower,
  FlowerLotusIcon as PhFlowerLotus,
  FlowerTulipIcon as PhFlowerTulip,
  ForkKnifeIcon as PhForkKnife,
  GraduationCapIcon as PhGraduationCap,
  HeartIcon as PhHeart,
  HospitalIcon as PhHospital,
  HouseIcon as PhHouse,
  LaptopIcon as PhLaptop,
  LeafIcon as PhLeaf,
  MoonIcon as PhMoon,
  MoonStarsIcon as PhMoonStars,
  MusicNoteIcon as PhMusicNote,
  PhoneIcon as PhPhone,
  ShieldIcon as PhShield,
  ShoppingBagIcon as PhShoppingBag,
  SirenIcon as PhSiren,
  SparkleIcon as PhSparkle,
  StarIcon as PhStar,
  StethoscopeIcon as PhStethoscope,
  SunIcon as PhSun,
  SunDimIcon as PhSunDim,
  SunHorizonIcon as PhSunHorizon,
  SyringeIcon as PhSyringe,
  TrainIcon as PhTrain,
  TreePalmIcon as PhTreePalm,
  UmbrellaIcon as PhUmbrella,
  UsersIcon as PhUsers,
  WavesIcon as PhWaves,
} from "@phosphor-icons/react";
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";
import { createContext, useContext } from "react";
import type { CSSProperties } from "react";
import { css, cx } from "styled-system/css";

import { patterns } from "../lib/design-patterns";
import type { Shift } from "../lib/design-patterns";
import { markColorIn, markColors } from "../lib/design-tokens";
import {
  ColorSchemeContext,
  ThemeContext,
  ToneContext,
  themeColors,
  themeOf,
} from "./design-theme";

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
// automatic: on, except letters on a tinted tile, which carry the color
// already.
export type OffHighlight = Partial<Record<ShiftMarkStyle, boolean>>;
export const defaultOffHighlight: OffHighlight = {};

export function useOffHighlight(style: ShiftMarkStyle) {
  const { highlight } = useContext(OffHighlightContext);
  return highlight[style] ?? true;
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
  pop: { ...baseLook, style: "emoji" },
  roster: { ...baseLook, highlight: false, style: "badge" },
} satisfies Record<string, LookSettings>;

export const OffHighlightContext = createContext<{
  highlight: OffHighlight;
}>({ highlight: defaultOffHighlight });

// Phosphor duotone icons. "letter" draws the symbol inside a thin circle, so
// any shift has an icon. Phosphor has one sun-on-the-horizon icon, so sunrise
// and dusk share it and the sunset uses a dim sun.
export const markIcons = {
  ambulance: PhAmbulance,
  baby: PhBaby,
  bed: PhBed,
  book: PhBookOpen,
  briefcase: PhBriefcase,
  building: PhBuildings,
  bus: PhBus,
  calendarCheck: PhCalendarCheck,
  car: PhCar,
  cat: PhCat,
  clock: PhClock,
  cloudMoon: PhCloudMoon,
  cloudSun: PhCloudSun,
  coffee: PhCoffee,
  couch: PhCouch,
  dog: PhDog,
  drop: PhDrop,
  dumbbell: PhBarbell,
  fish: PhFish,
  flame: PhFire,
  flower: PhFlower,
  graduationCap: PhGraduationCap,
  heart: PhHeart,
  hospital: PhHospital,
  house: PhHouse,
  laptop: PhLaptop,
  leaf: PhLeaf,
  letter: undefined,
  lotus: PhFlowerLotus,
  moon: PhMoon,
  moonStar: PhMoonStars,
  music: PhMusicNote,
  partyPopper: PhConfetti,
  phone: PhPhone,
  plane: PhAirplane,
  shield: PhShield,
  shoppingBag: PhShoppingBag,
  siren: PhSiren,
  sparkles: PhSparkle,
  star: PhStar,
  stethoscope: PhStethoscope,
  sun: PhSun,
  sunMoon: PhSunHorizon,
  sunrise: PhSunHorizon,
  sunset: PhSunDim,
  syringe: PhSyringe,
  train: PhTrain,
  treePalm: PhTreePalm,
  tulip: PhFlowerTulip,
  umbrella: PhUmbrella,
  users: PhUsers,
  utensils: PhForkKnife,
  waves: PhWaves,
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
  // One letter for the letter look; the name can show under it.
  symbol: string;
  icon: MarkIcon;
  color: MarkColor;
};

// An index into the palette below.
export type MarkColor = number;

const shiftLooks: Record<Shift, Omit<Look, "emoji">> = {
  after: { color: 3, icon: "sunrise", symbol: "明" },
  day: { color: 1, icon: "sun", symbol: "日" },
  duty: { color: 4, icon: "siren", symbol: "当" },
  early: { color: 2, icon: "cloudSun", symbol: "早" },
  evening: { color: 2, icon: "sunMoon", symbol: "夕" },
  junya: { color: 7, icon: "cloudMoon", symbol: "準" },
  late: { color: 4, icon: "cloudMoon", symbol: "遅" },
  midnight: { color: 9, icon: "moonStar", symbol: "深" },
  night: { color: 8, icon: "moon", symbol: "夜" },
  off: { color: 0, icon: "leaf", symbol: "休" },
  offDuty: { color: 11, icon: "bed", symbol: "非" },
  paid: { color: 5, icon: "flower", symbol: "有" },
  training: { color: 10, icon: "book", symbol: "研" },
};

const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

function firstLetter(name: string) {
  return (
    graphemes.segment(name.trim())[Symbol.iterator]().next().value?.segment ??
    ""
  );
}

export function lookOf(shift: Shift): Look {
  return {
    ...shiftLooks[shift],
    emoji: patterns[shift].emoji,
  };
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

// The first shift color is the theme's own, as 休み takes it: モス in
// ポチカル, and whatever color another テーマ is, so its days off are
// its color rather than a green beside it.
const THEME_SLOT = 0;

// All shift colors for the current light or dark mode, in picker order.
export function useMarkColors() {
  const scheme = useContext(ColorSchemeContext);
  const tone = useContext(ToneContext);
  const theme = useThemeMarkColor();
  return markColors.map((option, index) =>
    index === THEME_SLOT ? theme : markColorIn(option, scheme, tone)
  );
}

export function useMarkColor(markColor: MarkColor) {
  const scheme = useContext(ColorSchemeContext);
  const tone = useContext(ToneContext);
  const theme = useThemeMarkColor();
  const option = markColors[markColor];
  return markColor === THEME_SLOT || !option
    ? theme
    : markColorIn(option, scheme, tone);
}

// The theme's own color, for its slot and for marks drawn all in one color.
function useThemeMarkColor() {
  const { accent, markTint } = themeColors(
    themeOf(useContext(ThemeContext).theme),
    useContext(ColorSchemeContext),
    useContext(ToneContext)
  );
  return { color: accent, name: "テーマカラー", tint: markTint };
}

// On when the viewer's カラー is a single theme color rather than マルチカラー:
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
      aria-hidden="true"
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
  return (
    <MarkGlyph
      early={early}
      late={late}
      look={lookOf(shift)}
      size={size}
      style={style}
    />
  );
}
