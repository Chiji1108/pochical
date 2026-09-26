import type { ColorScheme, NeutralTint } from "./design-tokens";
import { hexToOklch, oklchToHex } from "./oklch";

// Theme tones generated from a hue instead of tuned by hand. Each tone
// is a table of OKLCH lightness per role plus a chroma rule, so adding a
// tone means adding a table, and every theme hue and shift color follows.

export const generatedTones = ["pastel", "dusty"] as const;
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

const vivid: Chroma = (chroma) => Math.min(chroma * 1.2, 0.12);
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
  // Pale fills with dark text on them; accents stay readable on white.
  pastel: {
    dark: {
      accent: at(0.82, scaled(vivid, 0.8)),
      border: at(0.46, fixed(0.035)),
      fill: at(0.8, fixed(0.07)),
      line: at(0.72, scaled(vivid, 0.7)),
      markTint: at(0.4, fixed(0.045)),
      muted: at(0.55, fixed(0.05)),
      onFill: at(0.27, fixed(0.02)),
      press: at(0.43, fixed(0.04)),
      soft: at(0.355, fixed(0.025)),
      soft2: at(0.38, fixed(0.03)),
      strong: at(0.76, scaled(vivid, 0.8)),
    },
    light: {
      accent: at(0.5, vivid),
      border: at(0.9, fixed(0.035)),
      fill: at(0.84, fixed(0.075)),
      line: at(0.6, scaled(vivid, 0.9)),
      markTint: at(0.925, fixed(0.05)),
      muted: at(0.8, fixed(0.07)),
      onFill: at(0.3, fixed(0.04)),
      press: at(0.905, fixed(0.045)),
      soft: at(0.96, fixed(0.024)),
      soft2: at(0.94, fixed(0.032)),
      strong: at(0.44, vivid),
    },
  },
  // Grayed, low-chroma colors on a greige ground; mid-tone fills keep white
  // text readable.
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
  pastel: {
    dark: {
      color: at(0.82, (chroma) => chroma * 0.8),
      tint: at(0.4, (chroma) => Math.min(chroma * 0.6, 0.05)),
    },
    light: {
      color: at(0.51, (chroma) => chroma),
      tint: at(0.925, (chroma) => Math.min(chroma * 0.85, 0.065)),
    },
  },
};

// How each tone treats the grays: pastel leans them toward the theme,
// dusty toward a warm greige whatever the theme. `bg` lifts the light
// background off pure white.
const GREIGE_HUE = 70;
const neutralSpecs: Record<
  GeneratedTone,
  { hue: "theme" | number; strength: number; bg: Spec }
> = {
  dusty: { bg: at(0.982, () => 0.01), hue: GREIGE_HUE, strength: 1.3 },
  pastel: { bg: at(0.988, fixed(0.008)), hue: "theme", strength: 1.3 },
};

function paint(spec: Spec, hex: string, hueOverride?: number) {
  const { chroma, hue } = hexToOklch(hex);
  const k = Math.min(1, chroma / FULL_CHROMA);
  return oklchToHex({
    chroma: spec.chroma(chroma, k),
    hue: hueOverride ?? hue,
    lightness: spec.lightness,
  });
}

export function toneRoles(
  tone: GeneratedTone,
  accent: string,
  scheme: ColorScheme
): Record<AccentRole, string> {
  const specs = roleSpecs[tone][scheme];
  return Object.fromEntries(
    Object.entries(specs).map(([role, spec]) => [role, paint(spec, accent)])
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
    color: paint(shift(spec.color, MARK_LIGHTNESS_SPREAD), color, hue),
    tint: paint(shift(spec.tint, TINT_LIGHTNESS_SPREAD), color, hue),
  };
}

export function toneNeutrals(
  tone: GeneratedTone,
  accent: string,
  scheme: ColorScheme
): { tint: NeutralTint; bg?: string } {
  const spec = neutralSpecs[tone];
  const hue = spec.hue === "theme" ? hexToOklch(accent).hue : spec.hue;
  const tint = { hue, strength: spec.strength };
  if (scheme === "dark") {
    return { tint };
  }
  const bgHue = spec.hue === "theme" ? undefined : spec.hue;
  return { bg: paint(spec.bg, accent, bgHue), tint };
}
