import {
  GodRays,
  GrainGradient,
  MeshGradient,
  Metaballs,
  PulsingBorder,
  SmokeRing,
} from "@paper-design/shaders-react";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "motion/react";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { css } from "styled-system/css";

import { hexToOklch, oklchToHex } from "../lib/oklch";
import { ColorSchemeContext } from "./design-theme";
import { MonochromeContext, useMarkColors } from "./shift-mark";

// おたのしみ, the other choice for the calendar's month name: a tap floods
// the screen behind the calendar with color, light and movement, a
// different look each time, and after a few seconds it draws back. Drawn
// with Paper Shaders, whose GLSL the native apps can port to Metal (iOS)
// and AGSL (Android 13+).

type Scheme = "light" | "dark";

// A shift color brought toward the screen's ground: toward white in light
// mode, toward a deep tone in dark mode, keeping its hue.
function soften(hex: string, share: number, scheme: Scheme) {
  const { lightness, chroma, hue } = hexToOklch(hex);
  const ground = scheme === "light" ? 0.99 : 0.18;
  return oklchToHex({
    chroma: chroma * (1 - share * 0.6),
    hue,
    lightness: lightness + (ground - lightness) * share,
  });
}

// A round's colors: three neighbors on the shift colors' wheel, in a
// light, a middle and a deep version, and a ground to lay them on.
type Palette = {
  light: string[];
  middle: string[];
  deep: string[];
  ground: string;
};

type Look = { name: string; paint: (palette: Palette) => ReactNode };

// Each as its own layer over the whole screen.
const looks: Look[] = [
  {
    // Colors melting into each other, turning slowly, a little grain.
    name: "メッシュ",
    paint: ({ light, middle }) => (
      <MeshGradient
        className={surpriseStyles.fill}
        colors={[
          light[0] ?? "",
          middle[1] ?? "",
          light[2] ?? "",
          middle[0] ?? "",
        ]}
        distortion={0.8}
        grainMixer={0.15}
        grainOverlay={0.12}
        speed={0.6}
        swirl={0.45}
      />
    ),
  },
  {
    // Light rising from below the screen.
    name: "光の筋",
    paint: ({ light, middle, ground }) => (
      <GodRays
        bloom={0.5}
        className={surpriseStyles.fill}
        colorBack={ground}
        colorBloom={middle[1] ?? ""}
        colors={[light[0] ?? "", middle[1] ?? "", light[2] ?? ""]}
        density={0.3}
        intensity={0.7}
        midIntensity={0.5}
        midSize={0.35}
        offsetY={0.95}
        speed={0.5}
        spotty={0.35}
      />
    ),
  },
  {
    // A glow running round the screen's edges, like a voice assistant's.
    name: "ふち",
    paint: ({ middle, deep, ground }) => (
      <PulsingBorder
        bloom={0.4}
        className={surpriseStyles.fill}
        colorBack={ground}
        colors={[middle[0] ?? "", deep[1] ?? "", middle[2] ?? ""]}
        intensity={0.35}
        pulse={0.3}
        roundness={0.35}
        scale={1}
        smoke={0.5}
        smokeSize={0.8}
        softness={0.9}
        speed={0.8}
        spotSize={0.6}
        spots={4}
        thickness={0.12}
      />
    ),
  },
  {
    // Soft blobs drifting, meeting and parting.
    name: "しずく",
    paint: ({ light, middle, ground }) => (
      <Metaballs
        className={surpriseStyles.fill}
        colorBack={ground}
        colors={[...light, ...middle]}
        count={12}
        scale={1.4}
        size={0.9}
        speed={0.5}
      />
    ),
  },
  {
    // A grainy gradient rippling out from the middle, like printed paper.
    name: "波紋",
    paint: ({ light, middle, deep, ground }) => (
      <GrainGradient
        className={surpriseStyles.fill}
        colorBack={ground}
        colors={[
          light[1] ?? "",
          middle[0] ?? "",
          deep[2] ?? "",
          middle[2] ?? "",
        ]}
        intensity={0.4}
        noise={0.3}
        shape="ripple"
        softness={0.7}
        speed={0.7}
      />
    ),
  },
  {
    // A ring of smoke breathing round the month.
    name: "けむり",
    paint: ({ middle, ground }) => (
      <SmokeRing
        className={surpriseStyles.fill}
        colorBack={ground}
        colors={[middle[0] ?? "", middle[2] ?? ""]}
        innerShape={0.7}
        noiseIterations={8}
        noiseScale={2.6}
        radius={0.3}
        scale={1.1}
        speed={0.6}
        thickness={0.7}
      />
    ),
  },
];

// The shift colors run round the color wheel, gray last.
const WHEEL = 11;

function paletteOf(
  colors: string[],
  monochrome: boolean,
  scheme: Scheme
): Palette {
  const start = Math.floor(Math.random() * WHEEL);
  const picked = monochrome
    ? [colors[0], colors[0], colors[0]]
    : [0, 1, 2].map((step) => colors[(start + step) % WHEEL]);
  const hexes = picked.map((hex) => hex ?? "#888888");
  return {
    deep: hexes.map((hex) => soften(hex, 0, scheme)),
    ground: soften(hexes[1] ?? "#888888", 0.9, scheme),
    light: hexes.map((hex) => soften(hex, 0.7, scheme)),
    middle: hexes.map((hex) => soften(hex, 0.35, scheme)),
  };
}

// Spreading out from the name, staying, drawing back.
const SPREAD_SECONDS = 1.1;
const STAY_SECONDS = 3.4;
const LEAVE_SECONDS = 1.4;

type Round = { key: number; paint: ReactNode; from: { x: number; y: number } };

// One flood: its look, seen through a circle growing from the
// month name until it covers the screen, then fading away.
function Flood({ round, onDone }: { round: Round; onDone: () => void }) {
  const radius = useMotionValue(0);
  const opacity = useMotionValue(1);
  const mask = useMotionTemplate`radial-gradient(circle at ${round.from.x}px ${round.from.y}px, black ${radius}px, transparent calc(${radius}px + 160px))`;
  useEffect(() => {
    const spread = animate(radius, 1400, {
      duration: SPREAD_SECONDS,
      ease: [0.3, 0, 0.2, 1],
    });
    const leave = animate(opacity, 0, {
      delay: SPREAD_SECONDS + STAY_SECONDS,
      duration: LEAVE_SECONDS,
      ease: "easeInOut",
    });
    void leave.then(onDone);
    return () => {
      spread.stop();
      leave.stop();
    };
  }, [onDone, opacity, radius]);
  return (
    <motion.div
      className={surpriseStyles.fill}
      style={{ WebkitMaskImage: mask, maskImage: mask, opacity }}
    >
      {round.paint}
    </motion.div>
  );
}

// The layer おたのしみ is drawn on, behind the screen's content (its
// Screen takes `surpriseStyles.screen`), and `play`, which floods it from
// `from`, the month name. Its colors are neighbors among the shift
// colors, or the テーマ's while shifts are drawn in one color.
export function useSurprise() {
  const layerRef = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState<Round>();
  const markColors = useMarkColors();
  const { monochrome } = useContext(MonochromeContext);
  const scheme = useContext(ColorSchemeContext);
  const clear = useCallback(() => {
    setRound(undefined);
  }, []);
  // The look shown last, which the next tap skips.
  const last = useRef(-1);
  function play(from: Element) {
    const layer = layerRef.current;
    if (layer === null) {
      return;
    }
    const others = looks.flatMap((_, index) =>
      index === last.current ? [] : [index]
    );
    const index = others[Math.floor(Math.random() * others.length)] ?? 0;
    last.current = index;
    const palette = paletteOf(
      markColors.map((option) => option.color),
      monochrome,
      scheme
    );
    const area = layer.getBoundingClientRect();
    const name = from.getBoundingClientRect();
    setRound({
      from: {
        x: name.left + name.width / 2 - area.left,
        y: name.top + name.height / 2 - area.top,
      },
      key: Date.now(),
      paint: looks[index]?.paint(palette),
    });
  }
  const layer = (
    <div aria-hidden="true" className={surpriseStyles.layer} ref={layerRef}>
      {round === undefined ? null : (
        <Flood key={round.key} onDone={clear} round={round} />
      )}
    </div>
  );
  return { layer, play };
}

export const surpriseStyles = {
  fill: css({ height: "100%", inset: 0, position: "absolute", width: "100%" }),
  layer: css({
    inset: 0,
    overflow: "hidden",
    pointerEvents: "none",
    position: "absolute",
    // Behind everything else on the screen, which isolates itself so the
    // layer stays in front of the screen's own ground.
    zIndex: -1,
  }),
  // The calendar's Screen, so the layer can sit behind its content.
  screen: css({ isolation: "isolate" }),
};
