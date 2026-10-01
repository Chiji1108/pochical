import {
  Hct,
  hexFromArgb,
  SchemeTonalSpot,
} from "@material/material-color-utilities";
import type { ColorScheme } from "@pochical/design/colors";

// Android's colors from the wallpaper (Material You), worked out the way
// Android does: Material's own library builds the Tonal Spot scheme, the
// default since Android 12, from the wallpaper's main color. Android
// widgets drawn with Glance take their colors from it, whatever テーマ the
// app itself is in.

// Sample wallpapers, each by the hue of its main color. The first is the
// one on the Pixel 9a the widgets were measured on: its tinted widgets
// (#daf7f2) are this hue's secondary tone 95 (#dbf7f0).
export const wallpaperSamples = [
  { hue: 186, id: "teal", name: "青緑" },
  { hue: 20, id: "peach", name: "桃" },
  { hue: 85, id: "yamabuki", name: "山吹" },
] as const;

// Any chroma does; Tonal Spot sets its own for each palette.
const SEED_CHROMA = 48;
const SEED_TONE = 50;

const tone = (palette: { tone: (t: number) => number }, t: number) =>
  hexFromArgb(palette.tone(t));

// The five tonal palettes Android builds from the wallpaper.
export function palettesOf(hue: number) {
  const scheme = new SchemeTonalSpot(
    Hct.from(hue, SEED_CHROMA, SEED_TONE),
    false,
    0
  );
  return {
    neutral: (t: number) => tone(scheme.neutralPalette, t),
    neutralVariant: (t: number) => tone(scheme.neutralVariantPalette, t),
    primary: (t: number) => tone(scheme.primaryPalette, t),
    secondary: (t: number) => tone(scheme.secondaryPalette, t),
    tertiary: (t: number) => tone(scheme.tertiaryPalette, t),
  };
}

// The app's color roles as a Glance widget has them, from Glance's own
// mapping onto Android's system colors (system_neutral1_10 is neutral
// tone 99, and so on). The ground is surface, a white with a breath of
// the wallpaper in it, as Google's own Digital Wellbeing widget has
// (#f6fbf9 on the Pixel 9a). A shift calendar reads best on it: the
// tinted widgetBackground, secondary 95, muddied the shift colors and
// the Sunday red on some wallpapers. Words are onSurface and
// onSurfaceVariant, then outline and outlineVariant.
export function widgetColors(hue: number, scheme: ColorScheme) {
  const palettes = palettesOf(hue);
  const dark = scheme === "dark";
  return {
    "--accent-default": palettes.primary(dark ? 80 : 40),
    "--background-base": palettes.neutral(dark ? 10 : 99),
    "--calendar-note-marker": palettes.neutralVariant(dark ? 30 : 88),
    "--separator": palettes.neutralVariant(dark ? 30 : 80),
    "--text-primary": palettes.neutral(dark ? 90 : 10),
    "--text-quaternary": palettes.neutralVariant(dark ? 40 : 70),
    "--text-secondary": palettes.neutralVariant(dark ? 80 : 30),
    "--text-tertiary": palettes.neutralVariant(dark ? 60 : 50),
  };
}

// A stand-in wallpaper whose main color is the hue, dimmed in dark.
export function wallpaperOf(hue: number, scheme: ColorScheme) {
  const palettes = palettesOf(hue);
  const [first, second, third] =
    scheme === "dark" ? [30, 20, 25] : [80, 90, 85];
  return `linear-gradient(135deg, ${palettes.primary(first)}, ${palettes.secondary(second)} 55%, ${palettes.tertiary(third)})`;
}
