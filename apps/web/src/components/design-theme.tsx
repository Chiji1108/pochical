import type { ColorScheme } from "@pochical/design/colors";
import { hexToOklch } from "@pochical/design/oklch";
import {
  noteMarkerSteps,
  presets,
  schemeIn,
  themeRoles,
} from "@pochical/design/themes";
import type { Preset, PresetId as OwnPresetId } from "@pochical/design/themes";
import { Moon, Sun } from "lucide-react";
import { createContext, useContext } from "react";
import type { CSSProperties } from "react";
import { css } from "styled-system/css";

import { useDevice } from "../lib/design-device";
import { palettesOf } from "../lib/material-you";
import { Choice, ChoiceGrid } from "./design-choices";

// The テーマ themselves, and how each works out every color, live in
// design/ (themes.ts), which the native apps are generated from; this
// file puts them on the web's screens as CSS variables.

// 端末の色, on Android only: the colors Android is set to (Material You's
// dynamic color), which come from the wallpaper or from a color the person
// picked in Android's own settings. Its accent is their primary as Android
// draws it (tone 40), and the grays lean to their neutral hue; every other
// role follows by the same steps as the others', so it sits with the
// shifts as they do. The screen stays white, as the widgets' ground does:
// a tinted one would muddy the shift colors. The prototype stands in for
// Android's colors with a sample wallpaper's (lib/design-device.ts).
export const DEVICE_COLORS = "device" as const;
const WALLPAPER_ACCENT_TONE = 40;
const WALLPAPER_GRAY_TONE = 50;
const WALLPAPER_GRAY_STRENGTH = 0.8;

export function deviceColorsPreset(hue: number) {
  const palettes = palettesOf(hue);
  return {
    accent: hexToOklch(palettes.primary(WALLPAPER_ACCENT_TONE)),
    grays: {
      hue: hexToOklch(palettes.neutral(WALLPAPER_GRAY_TONE)).hue,
      strength: WALLPAPER_GRAY_STRENGTH,
    },
    id: DEVICE_COLORS,
    name: "端末の色",
  } satisfies Preset;
}

export type PresetId = OwnPresetId | typeof DEVICE_COLORS;

// Android decides 端末の色, so it is read from the device rather than
// kept here.
export function presetOf(id: PresetId): Preset {
  if (id === DEVICE_COLORS) {
    return deviceColorsPreset(useDevice.getState().wallpaperHue);
  }
  return presets.find((preset) => preset.id === id) ?? presets[0];
}

// The scheme a テーマ is drawn in: its own if it is always dark, else the
// one asked for.
export function schemeOf(id: PresetId, scheme: ColorScheme): ColorScheme {
  return schemeIn(presetOf(id), scheme);
}

// The テーマ drawn: the person's own, or another's where a card or the
// states page shows one.
// `wallpaperHue` changes with the device's wallpaper, so what is drawn in
// 端末の色 redraws when it does.
export const ThemeContext = createContext<{
  theme: PresetId;
  wallpaperHue?: number;
}>({
  theme: "pochical",
});

// The scheme in effect: the device's unless 外観 in settings keeps one.
export const ColorSchemeContext = createContext<ColorScheme>("light");

// 外観 in settings: follow the device, or force light or dark.
export type Appearance = "system" | ColorScheme;

// Every color variable the screens read, each role as `--` and its name.
export function themeStyle(
  id: PresetId,
  requested: ColorScheme = "light"
): CSSProperties {
  const scheme = schemeOf(id, requested);
  const { onTile } = noteMarkerSteps[scheme];
  return {
    ...Object.fromEntries(
      Object.entries(themeRoles(presetOf(id), scheme)).map(([name, value]) => [
        `--${name}`,
        value,
      ])
    ),
    // A memo's stroke on a day off's tile is worked out from the tile
    // itself (design-day-cell.tsx), by these steps.
    "--note-on-tile-chroma": onTile.chroma,
    "--note-on-tile-lightness": onTile.lightness,
    colorScheme: scheme,
  };
}

export function useThemeStyle() {
  return themeStyle(
    useContext(ThemeContext).theme,
    useContext(ColorSchemeContext)
  );
}

// The scheme the current テーマ is drawn in, for colors worked out in
// code: an always-dark テーマ's dark, else the context's.
export function useColorScheme() {
  return schemeOf(
    useContext(ThemeContext).theme,
    useContext(ColorSchemeContext)
  );
}

// The /design pages' own ground around the phones stays light: an
// always-dark テーマ lends it ポチカル's colors instead.
export function pageStyle(id: PresetId) {
  return themeStyle(presetOf(id).scheme ? "pochical" : id, "light");
}

const previewSchemes = [
  { Icon: Sun, name: "ライトで見る", scheme: "light" },
  { Icon: Moon, name: "ダークで見る", scheme: "dark" },
] as const;

// ☀︎ / ☾ on a preview's top edge, to see it in the other of light and dark
// without changing 外観. Sits inside a previewWrap, with the preview.
export const previewWrap = css({ position: "relative" });
const schemeSwitch = {
  // Drawn small, but each side takes its half of the whole switch and a
  // 44px height to tap, so a tap anywhere on it picks the side it lands on.
  choice: css({
    "&[data-scheme=dark]::after": { right: "-3px" },
    "&[data-scheme=light]::after": { left: "-3px" },
    _after: {
      bottom: "-13px",
      content: '""',
      left: "-1px",
      position: "absolute",
      right: "-1px",
      top: "-13px",
    },
    _checked: { bg: "fill.tertiary", color: "text.primary" },
    _disabled: { color: "text.disabled", cursor: "default" },
    bg: "transparent",
    border: 0,
    borderRadius: "sm",
    color: "text.quaternary",
    display: "grid",
    height: "18px",
    padding: 0,
    placeItems: "center",
    position: "relative",
    width: "24px",
  }),
  // Ark keeps the group itself relatively positioned, so the choices
  // flow into the wrapper that sits on the edge.
  choices: css({ display: "contents" }),
  frame: css({
    bg: "background.card",
    border: "1px solid token(colors.separator)",
    borderRadius: "md",
    display: "flex",
    gap: "2px",
    left: "12px",
    margin: 0,
    padding: "2px",
    position: "absolute",
    top: "-10px",
  }),
};
export function PreviewSchemeSwitch({
  shown,
  onPick,
  disabled,
}: {
  shown: ColorScheme;
  onPick: (scheme: ColorScheme) => void;
  // For what has only one of them, like an always-dark テーマ: the switch
  // stays in its place, showing that one, and cannot be turned.
  disabled?: boolean;
}) {
  return (
    // Ark keeps the group itself relatively positioned, so a wrapper
    // places it on the edge.
    <div className={schemeSwitch.frame}>
      <ChoiceGrid
        className={schemeSwitch.choices}
        disabled={disabled}
        label="プレビューの明るさ"
        onValueChange={onPick}
        value={shown}
      >
        {previewSchemes.map((option) => (
          <Choice
            className={schemeSwitch.choice}
            data-scheme={option.scheme}
            key={option.scheme}
            label={option.name}
            value={option.scheme}
          >
            <option.Icon aria-hidden="true" size={13} />
          </Choice>
        ))}
      </ChoiceGrid>
    </div>
  );
}
