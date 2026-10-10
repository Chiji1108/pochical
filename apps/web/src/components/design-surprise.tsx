import {
  darkGroundOf,
  skies,
  skyLights,
  skyMotion,
  themeSkies,
  themeSkyId,
} from "@pochical/design/skies";
import type { Sky } from "@pochical/design/skies";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useContext } from "react";
import { css } from "styled-system/css";

import { useSettings } from "../lib/design-settings-store";
import {
  ColorSchemeContext,
  ThemeContext,
  DEVICE_COLORS,
} from "./design-theme";
import type { PresetId } from "./design-theme";

// おたのしみ, the other choice for the calendar's month name: a sky of pale
// light at the top of the calendar, fading into the ground below it. It
// first comes with a tap on the name, never before (not even in the
// settings' preview), and each tap drifts it to other colors, kept until
// the next tap, so a sky someone likes can be screenshotted. The first is
// the テーマ's own sky; the rest come at random, the テーマ's among them.
// Only a tap changes it: a テーマ's sky stays after the テーマ changes.
// Plain gradients, which SwiftUI's MeshGradient and Compose's brushes
// draw the same.

// 端末の色's sky: Android's color, and two steps cooler across.
const WALLPAPER_SKY_STEP = 30;
function wallpaperSky(hue: number): Sky {
  return {
    hues: [hue, hue + WALLPAPER_SKY_STEP, hue + 2 * WALLPAPER_SKY_STEP],
    name: "端末の色",
  };
}

// Every sky by its id, the テーマ's among them.
const allSkies: Record<string, Sky | undefined> = {
  ...skies,
  ...Object.fromEntries(
    Object.entries(themeSkies).map(([theme, sky]) => [themeSkyId(theme), sky])
  ),
};

// A sky's lights in light mode, by its id, for the site's own sky (the
// ground only matters in dark mode).
export function paleSkyLights(id: string) {
  const sky = allSkies[id];
  return sky === undefined ? undefined : skyLights(sky, "light");
}

// Light spreading from both top corners and the middle, fading down. Each
// fades to its own color with no alpha rather than `transparent`, which
// renderers without premultiplied gradients (satori, for the invitation
// share image) draw as fading through black.
function lightFromTop([left, middle, right]: string[]) {
  return [
    `radial-gradient(90% 80% at 0% 0%, ${left} 0%, ${left}00 70%)`,
    `radial-gradient(90% 80% at 100% 0%, ${right} 0%, ${right}00 70%)`,
    `radial-gradient(80% 70% at 50% 25%, ${middle} 0%, ${middle}00 75%)`,
  ].join(", ");
}

function skyBackground(sky: Sky, scheme: "light" | "dark", ground: number) {
  return lightFromTop(skyLights(sky, scheme, ground));
}

// A sky in light mode falling from the top, as over the app's calendar,
// for the site's own sky: the top page's and its share image's.
export function paleSkyFromTop(id: string) {
  const lights = paleSkyLights(id);
  return lights === undefined ? undefined : lightFromTop(lights);
}

// How one sky gives way to the next: at once from the tap, so the tap is
// seen to change it, and settling softly. And how slowly the light
// breathes while it stays.
export const SKY_CHANGE = {
  duration: skyMotion.changeSeconds,
  ease: "easeOut",
} as const;
export const BREATH_SECONDS = skyMotion.breathSeconds;

function SkyLight({ sky }: { sky: Sky }) {
  const scheme = useContext(ColorSchemeContext);
  const ground = darkGroundOf(useContext(ThemeContext).theme);
  const still = useReducedMotion() ?? false;
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={surpriseStyles.sky}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={SKY_CHANGE}
    >
      <motion.div
        animate={still ? undefined : { scale: 1.08, x: "2%" }}
        className={surpriseStyles.light}
        initial={{ scale: 1, x: "-2%" }}
        style={{ background: skyBackground(sky, scheme, ground) }}
        transition={{
          duration: BREATH_SECONDS,
          ease: "easeInOut",
          repeat: Number.POSITIVE_INFINITY,
          repeatType: "mirror",
        }}
      />
    </motion.div>
  );
}

// Another sky than the one up, at random: one anyone may get, or the
// テーマ's own.
export function nextSkyId(id: string, theme: PresetId) {
  const own = themeSkyId(theme);
  const others = [...Object.keys(skies), own].filter((other) => other !== id);
  return others[Math.floor(Math.random() * others.length)] ?? own;
}

// A sky by its id; 端末の色's follows Android's color.
function skyOf(id: string | undefined, wallpaperHue: number | undefined) {
  if (id === themeSkyId(DEVICE_COLORS) && wallpaperHue !== undefined) {
    return wallpaperSky(wallpaperHue);
  }
  return id === undefined ? undefined : allSkies[id];
}

// The sky behind the calendar's content while おたのしみ is chosen (its
// Screen takes `surpriseStyles.screen`), and `play`, which drifts it to
// another sky.
export function useSurprise() {
  const on = useSettings((state) => state.device.monthTap === "surprise");
  const id = useSettings((state) => state.device.sky);
  const setSky = useSettings((state) => state.setSky);
  const { theme, wallpaperHue } = useContext(ThemeContext);
  function play() {
    setSky(id === undefined ? themeSkyId(theme) : nextSkyId(id, theme));
  }
  const sky = skyOf(id, wallpaperHue);
  const layer = (
    <div aria-hidden="true" className={surpriseStyles.layer}>
      <AnimatePresence initial={false}>
        {on && sky !== undefined ? <SkyLight key={id} sky={sky} /> : null}
      </AnimatePresence>
    </div>
  );
  return { layer, play };
}

export const surpriseStyles = {
  layer: css({
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
    // Behind everything else on the screen, which isolates itself so the
    // layer stays in front of the screen's own ground.
    zIndex: -1,
  }),
  // The light itself, a little larger than its place so breathing never
  // shows an edge.
  light: css({
    inset: "-10% -10% 0",
    position: "absolute",
    transformOrigin: "50% 0",
  }),
  screen: css({ isolation: "isolate" }),
  // Over the heading only, gone by the calendar's first weeks.
  sky: css({
    height: "34%",
    insetInline: 0,
    maskImage: "linear-gradient(to bottom, black 30%, transparent)",
    position: "absolute",
    top: 0,
  }),
};
