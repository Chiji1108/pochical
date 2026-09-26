import type { ColorScheme, NeutralTint } from "./design-tokens";
import { hexToOklch, oklchToHex } from "./oklch";

// Theme tones generated from a hue instead of tuned by hand. Each tone
// is a table of OKLCH lightness per role plus a chroma rule, so adding a
// tone means adding a table, and every theme hue and shift color follows.

export const generatedTones = ["paper", "dusty"] as const;
export type GeneratedTone = (typeof generatedTones)[number];

export type AccentRole =
  | "accent"
  | "border"
  | "fill"
  | "line"
  | "markTint"
  | "muted"
  | "onFill"
  | "press"
  | "soft"
  | "soft2"
  | "strong";

// `chroma` is the source color's chroma; `k` fades fixed tints for
// near-gray sources such as 墨.
type Chroma = (chroma: number, k: number) => number;
type Spec = { lightness: number; chroma: Chroma };

// Chroma at which fixed tints reach full strength.
const FULL_CHROMA = 0.05;

const ink: Chroma = (chroma) => Math.min(chroma, 0.09);
const dust: Chroma = (chroma) => Math.min(chroma * 0.6, 0.05);
const scaled =
  (rule: Chroma, factor: number): Chroma =>
  (chroma, k) =>
    rule(chroma, k) * factor;
const fixed =
  (amount: number): Chroma =>
  (_chroma, k) =>
    amount * k;
const at = (lightness: number, chroma: Chroma): Spec => ({
  chroma,
  lightness,
});

const roleSpecs: Record<
  GeneratedTone,
  Record<ColorScheme, Record<AccentRole, Spec>>
> = {
  // Dark, inky colors on a paper ground. The ground keeps its own warm hue
  // whatever the カラー; they sit together because the ink is far darker
  // than the paper, as indigo dye does on unbleached cotton.
  paper: {
    dark: {
      accent: at(0.8, scaled(ink, 0.8)),
      border: at(0.45, fixed(0.022)),
      fill: at(0.76, scaled(ink, 0.8)),
      line: at(0.68, scaled(ink, 0.7)),
      markTint: at(0.4, fixed(0.03)),
      muted: at(0.53, fixed(0.035)),
      onFill: at(0.26, fixed(0.015)),
      press: at(0.42, fixed(0.025)),
      soft: at(0.35, fixed(0.016)),
      soft2: at(0.375, fixed(0.02)),
      strong: at(0.74, scaled(ink, 0.8)),
    },
    light: {
      accent: at(0.44, ink),
      border: at(0.88, fixed(0.022)),
      fill: at(0.46, ink),
      line: at(0.56, scaled(ink, 0.8)),
      markTint: at(0.91, fixed(0.028)),
      muted: at(0.77, fixed(0.04)),
      onFill: at(1, () => 0),
      press: at(0.895, fixed(0.024)),
      soft: at(0.95, fixed(0.013)),
      soft2: at(0.93, fixed(0.018)),
      strong: at(0.38, ink),
    },
  },
  // Grayed, low-chroma colors on grays of the same hue; mid-tone fills keep
  // white text readable.
  dusty: {
    dark: {
      accent: at(0.78, scaled(dust, 0.9)),
      border: at(0.45, fixed(0.018)),
      fill: at(0.74, scaled(dust, 0.9)),
      line: at(0.68, scaled(dust, 0.8)),
      markTint: at(0.4, fixed(0.024)),
      muted: at(0.52, fixed(0.028)),
      onFill: at(0.26, fixed(0.01)),
      press: at(0.42, fixed(0.02)),
      soft: at(0.35, fixed(0.013)),
      soft2: at(0.375, fixed(0.016)),
      strong: at(0.72, scaled(dust, 0.9)),
    },
    light: {
      accent: at(0.48, dust),
      border: at(0.89, fixed(0.016)),
      fill: at(0.56, dust),
      line: at(0.6, scaled(dust, 0.8)),
      markTint: at(0.915, fixed(0.022)),
      muted: at(0.78, fixed(0.03)),
      onFill: at(1, () => 0),
      press: at(0.9, fixed(0.02)),
      soft: at(0.955, fixed(0.011)),
      soft2: at(0.935, fixed(0.015)),
      strong: at(0.43, dust),
    },
  },
};

// Shift colors keep their hue in every tone, so a color picked as "red"
// stays red; only lightness and chroma follow the tone.
const markSpecs: Record<
  GeneratedTone,
  Record<ColorScheme, { color: Spec; tint: Spec }>
> = {
  dusty: {
    dark: {
      color: at(0.79, (chroma) => Math.min(chroma * 0.6, 0.065)),
      tint: at(0.4, (chroma) => Math.min(chroma * 0.3, 0.026)),
    },
    light: {
      color: at(0.5, (chroma) => Math.min(chroma * 0.7, 0.075)),
      tint: at(0.915, (chroma) => Math.min(chroma * 0.3, 0.024)),
    },
  },
  paper: {
    dark: {
      color: at(0.8, (chroma) => Math.min(chroma * 0.75, 0.09)),
      tint: at(0.4, (chroma) => Math.min(chroma * 0.35, 0.035)),
    },
    light: {
      color: at(0.47, (chroma) => Math.min(chroma * 0.9, 0.1)),
      tint: at(0.91, (chroma) => Math.min(chroma * 0.35, 0.04)),
    },
  },
};

// The grays start from the カラー's hue and may lean toward cream (a warm
// yellow) by up to `warmth` degrees, so they stay within the accent's
// neighboring hues and never reach its opposite. Accents more than a
// quarter turn from cream (藍, ラベンダー) keep their own hue: the way round
// to cream would pass through unrelated hues. The tint strength fades with
// the accent's own chroma, so 墨 stays neutral. Paper instead takes one
// fixed hue for every カラー, since its ground is a material, not a tint.
// Its dark ground is only faintly warm: tiles there are nearly as dark as
// the ground, so lightness no longer keeps a blue apart from a brown.
// `bg` lifts the light background off pure white; it must stay lighter and
// less tinted than --fill, or lists and the group rail sink into it.
type NeutralSpec = { strength: number; bg: Spec } & (
  | { warmth: number }
  | { hue: number; darkStrength: number }
);

const PAPER_HUE = 85;

const neutralSpecs: Record<GeneratedTone, NeutralSpec> = {
  dusty: { bg: at(0.994, fixed(0.004)), strength: 1.3, warmth: 75 },
  paper: {
    bg: at(0.99, () => 0.01),
    darkStrength: 0.5,
    hue: PAPER_HUE,
    strength: 1.8,
  },
};

const CREAM_HUE = 70;
const CREAM_REACH = 90;

// The hue the grays take for an accent hue, leaning toward cream.
export function grayHue(hue: number, warmth: number) {
  const toCream = ((CREAM_HUE - hue + 540) % 360) - 180;
  if (Math.abs(toCream) > CREAM_REACH) {
    return hue;
  }
  const turn = Math.sign(toCream) * Math.min(Math.abs(toCream), warmth);
  return (hue + turn + 360) % 360;
}

function paint(spec: Spec, hex: string, hueOverride?: number) {
  const { chroma, hue } = hexToOklch(hex);
  const k = Math.min(1, chroma / FULL_CHROMA);
  return oklchToHex({
    chroma: spec.chroma(chroma, k),
    hue: hueOverride ?? hue,
    lightness: spec.lightness,
  });
}

// The paper color washes are multiplied with: much yellower than the
// ground shown, so pale washes are paper faintly dyed, keeping only a hint
// of their own hue. Each wash then gets its own
// lightness back, keeping tiles as far from the ground as before.
const PRINT_PAPER = oklchToHex({
  chroma: 0.035,
  hue: PAPER_HUE,
  lightness: 0.95,
});

const channels = (hex: string) =>
  [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));

// Colors on light paper are multiplied with it, as ink printed on paper:
// pale washes pick up the paper's yellow and sit in it instead of floating
// on top as a separate cool color, while dark ink barely changes.
function printed(tone: GeneratedTone, scheme: ColorScheme, hex: string) {
  if (tone !== "paper" || scheme === "dark") {
    return hex;
  }
  const paper = channels(PRINT_PAPER);
  const multiplied = `#${channels(hex)
    .map((channel, index) =>
      Math.round((channel * (paper[index] ?? 255)) / 255)
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
  return oklchToHex({
    ...hexToOklch(multiplied),
    lightness: hexToOklch(hex).lightness,
  });
}

export function toneRoles(
  tone: GeneratedTone,
  accent: string,
  scheme: ColorScheme
): Record<AccentRole, string> {
  const specs = roleSpecs[tone][scheme];
  return Object.fromEntries(
    Object.entries(specs).map(([role, spec]) => {
      const color = paint(spec, accent);
      // Text on a fill is not printed on the paper but on the ink.
      return [role, role === "onFill" ? color : printed(tone, scheme, color)];
    })
  ) as Record<AccentRole, string>;
}

// How much of a shift color's lightness difference from the set's average
// carries over, so 紺 stays apart from 藍. Only colors darker than average
// move, and always away from their ground: darker in light mode, lighter
// in dark mode, so contrast only goes up.
const MARK_LIGHTNESS_SPREAD = 0.8;
const TINT_LIGHTNESS_SPREAD = 0.2;

export function toneMarkColor(
  tone: GeneratedTone,
  color: string,
  scheme: ColorScheme,
  lightnessOffset = 0,
  hueShift = 0
) {
  const spec = markSpecs[tone][scheme];
  const darker = Math.min(0, lightnessOffset);
  const offset = scheme === "dark" ? -darker : darker;
  const shift = (base: Spec, spread: number): Spec => ({
    ...base,
    lightness: base.lightness + offset * spread,
  });
  const hue = (hexToOklch(color).hue + hueShift + 360) % 360;
  return {
    color: printed(
      tone,
      scheme,
      paint(shift(spec.color, MARK_LIGHTNESS_SPREAD), color, hue)
    ),
    tint: printed(
      tone,
      scheme,
      paint(shift(spec.tint, TINT_LIGHTNESS_SPREAD), color, hue)
    ),
  };
}

export function toneNeutrals(
  tone: GeneratedTone,
  accent: string,
  scheme: ColorScheme
): { tint: NeutralTint; bg?: string } {
  const spec = neutralSpecs[tone];
  const { chroma, hue } = hexToOklch(accent);
  const tint =
    "hue" in spec
      ? {
          hue: spec.hue,
          strength: scheme === "dark" ? spec.darkStrength : spec.strength,
        }
      : {
          hue: grayHue(hue, spec.warmth),
          strength: spec.strength * Math.min(1, chroma / FULL_CHROMA),
        };
  if (scheme === "dark") {
    return { tint };
  }
  return { bg: paint(spec.bg, accent, tint.hue), tint };
}
