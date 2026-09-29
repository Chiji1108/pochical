import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useContext } from "react";
import { css } from "styled-system/css";

import { useSettings } from "../lib/design-settings-store";
import { oklchToHex } from "../lib/oklch";
import { ColorSchemeContext, ThemeContext, presetOf } from "./design-theme";
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

// Three hues, warm to cool across the top: the left corner's, the middle's
// and the right corner's; `vivid` scales the tones' chroma.
type Sky = { name: string; hues: [number, number, number]; vivid?: number };

// The skies anyone may get, by the id the device settings keep.
const skies: Record<string, Sky> = {
  asayake: { hues: [55, 235, 300], name: "朝焼け" },
  hakumei: { hues: [290, 250, 15], name: "薄明" },
  koori: { hues: [215, 280, 180], name: "氷" },
  mikan: { hues: [75, 100, 5], name: "蜜柑" },
  momo: { hues: [10, 65, 320], name: "桃" },
  ramune: { hues: [165, 105, 215], name: "ラムネ" },
  wakakusa: { hues: [130, 95, 195], name: "若草" },
  yunagi: { hues: [35, 350, 275], name: "夕凪" },
};

// Each テーマ's own sky, picked to its mood rather than drawn from its
// accent alone: 墨's nearly a silver haze, 抹茶's with a sakura sweet's
// pink, 喫茶's its lamps' amber, 月夜's the night's blues (its accent is
// the moon), 黒板's chalk.
const themeSkies: Record<PresetId, Sky> = {
  cocoa: { hues: [45, 75, 10], name: "ココア", vivid: 0.8 },
  kissa: { hues: [60, 35, 85], name: "喫茶" },
  kokuban: { hues: [165, 215, 345], name: "黒板", vivid: 0.8 },
  matcha: { hues: [120, 90, 350], name: "抹茶" },
  milktea: { hues: [55, 80, 20], name: "ミルクティー", vivid: 0.8 },
  pochical: { hues: [100, 150, 225], name: "ポチカル" },
  sakura: { hues: [35, 355, 300], name: "さくら" },
  soda: { hues: [170, 215, 100], name: "ソーダ" },
  sumi: { hues: [250, 90, 300], name: "墨", vivid: 0.4 },
  sumire: { hues: [310, 280, 20], name: "すみれ" },
  tsukiyo: { hues: [290, 250, 215], name: "月夜" },
  zen: { hues: [110, 90, 150], name: "禅", vivid: 0.6 },
};

// A テーマ's sky is kept as its own id, so it stays when the テーマ changes.
const themeSkyId = (theme: PresetId) => `theme-${theme}`;

// Every sky by its id, the テーマ's among them.
const allSkies: Record<string, Sky | undefined> = {
  ...skies,
  ...Object.fromEntries(
    Object.entries(themeSkies).map(([theme, sky]) => [`theme-${theme}`, sky])
  ),
};

// Pale and airy in light mode; deep, like jewels in shade, in dark mode,
// a step lighter than the screen, whose ground a night テーマ colors (月夜's
// navy, 黒板's board).
const tones = {
  dark: { chroma: 0.05, lift: 0.05 },
  light: { chroma: 0.04, lightness: 0.95 },
} as const;
// The dark gray screen (background-base) in OKLCH lightness.
const DARK_GROUND = 0.28;

// Light spreading from both top corners and the middle, fading down.
function skyBackground(sky: Sky, scheme: "light" | "dark", ground: number) {
  const { chroma } = tones[scheme];
  const lightness =
    scheme === "light" ? tones.light.lightness : ground + tones.dark.lift;
  const [left, middle, right] = sky.hues.map((hue) =>
    oklchToHex({ chroma: chroma * (sky.vivid ?? 1), hue, lightness })
  );
  return [
    `radial-gradient(90% 80% at 0% 0%, ${left} 0%, transparent 70%)`,
    `radial-gradient(90% 80% at 100% 0%, ${right} 0%, transparent 70%)`,
    `radial-gradient(80% 70% at 50% 25%, ${middle} 0%, transparent 75%)`,
  ].join(", ");
}

// How long one sky takes to drift into the next, and how slowly the light
// breathes while it stays.
const CHANGE_SECONDS = 1.6;
const BREATH_SECONDS = 9;

function SkyLight({ sky }: { sky: Sky }) {
  const scheme = useContext(ColorSchemeContext);
  const preset = presetOf(useContext(ThemeContext).theme);
  // A light テーマ's own ground is only its light mode's.
  const ground =
    preset.scheme === "dark"
      ? (preset.ground?.lightness ?? DARK_GROUND)
      : DARK_GROUND;
  const still = useReducedMotion() ?? false;
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={surpriseStyles.sky}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: CHANGE_SECONDS, ease: "easeInOut" }}
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

// The sky behind the calendar's content while おたのしみ is chosen (its
// Screen takes `surpriseStyles.screen`), and `play`, which drifts it to
// another sky.
export function useSurprise() {
  const on = useSettings((state) => state.device.monthTap === "surprise");
  const id = useSettings((state) => state.device.sky);
  const setSky = useSettings((state) => state.setSky);
  const { theme } = useContext(ThemeContext);
  function play() {
    const own = themeSkyId(theme);
    if (id === undefined) {
      setSky(own);
      return;
    }
    const others = [...Object.keys(skies), own].filter((other) => other !== id);
    setSky(others[Math.floor(Math.random() * others.length)] ?? own);
  }
  const sky = id === undefined ? undefined : allSkies[id];
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
