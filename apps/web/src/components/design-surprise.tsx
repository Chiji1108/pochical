import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useContext } from "react";
import { css } from "styled-system/css";

import { useSettings } from "../lib/design-settings-store";
import { oklchToHex } from "../lib/oklch";
import { ColorSchemeContext } from "./design-theme";

// おたのしみ, the other choice for the calendar's month name: a sky of pale
// light at the top of the calendar, fading into the ground below it. It
// first comes with a tap on the name, never before (not even in the
// settings' preview), and each tap drifts it to other colors, kept until
// the next tap, so a sky someone likes can be screenshotted. Plain gradients, which
// SwiftUI's MeshGradient and Compose's brushes draw the same.

// Three hues, warm to cool across the top: the left corner's, the middle's
// and the right corner's.
type Sky = { name: string; hues: [number, number, number] };

export const skies: Sky[] = [
  { hues: [55, 235, 300], name: "朝焼け" },
  { hues: [165, 105, 215], name: "ソーダ" },
  { hues: [10, 65, 320], name: "桃" },
  { hues: [35, 350, 275], name: "夕凪" },
  { hues: [130, 95, 195], name: "若草" },
  { hues: [290, 250, 15], name: "薄明" },
  { hues: [75, 100, 5], name: "蜜柑" },
  { hues: [215, 280, 180], name: "氷" },
];

// Pale and airy in light mode; deep, like jewels in shade, in dark mode.
const tones = {
  dark: { chroma: 0.05, lightness: 0.29 },
  light: { chroma: 0.04, lightness: 0.95 },
} as const;

// Light spreading from both top corners and the middle, fading down.
function skyBackground(sky: Sky, scheme: "light" | "dark") {
  const { chroma, lightness } = tones[scheme];
  const [left, middle, right] = sky.hues.map((hue) =>
    oklchToHex({ chroma, hue, lightness })
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
        style={{ background: skyBackground(sky, scheme) }}
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
  const index = useSettings((state) => state.device.sky);
  const setSky = useSettings((state) => state.setSky);
  function play() {
    const others = skies.flatMap((_, other) =>
      other === index ? [] : [other]
    );
    setSky(others[Math.floor(Math.random() * others.length)] ?? 0);
  }
  const sky = skies[index];
  const layer = (
    <div aria-hidden="true" className={surpriseStyles.layer}>
      <AnimatePresence initial={false}>
        {on && sky !== undefined ? <SkyLight key={index} sky={sky} /> : null}
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
